"""Compose current UI footage with one continuous, naturally paced narration.

Run with Pillow, ffmpeg and ffprobe installed. Audio and word alignment are
required inputs; this script does not generate speech or estimate subtitle timing.
"""
import argparse
import difflib
import hashlib
import json
import math
import re
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent
OUT = ROOT / "rendered"
W, H, FPS = 1920, 1080, 30
BG, INK, BLUE, MUTED = "#edf2ef", "#223b48", "#315fe8", "#6e848b"


def run(args):
    result = subprocess.run(args, check=False, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-6000:])
    return result.stdout


def probe(file):
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(file)]))


def font(size):
    candidates = ["/System/Library/Fonts/HelveticaNeue.ttc", "/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    filename = next((name for name in candidates if Path(name).is_file()), None)
    if filename is None:
        filename = run(["fc-match", "-f", "%{file}", "Montserrat"]).strip()
    return ImageFont.truetype(filename, size)


def stamp(seconds):
    value = max(0, round(seconds * 1000))
    hours, value = divmod(value, 3_600_000)
    minutes, value = divmod(value, 60_000)
    seconds, ms = divmod(value, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02}.{ms:03}"


def token(word):
    normalized = re.sub(r"[^a-z0-9]", "", word.lower())
    # Speech recognition may format spoken numbers/symbols instead of words.
    if word.strip() == "%":
        return "percent"
    return {"ten": "10"}.get(normalized, normalized)


def aligned_words(scenes, alignment, duration):
    script = [word for scene in scenes for word in scene["narration"].split()]
    heard = [word for word in alignment["words"] if token(word["word"])]
    matcher = difflib.SequenceMatcher(None, [token(word) for word in script], [token(word["word"]) for word in heard], autojunk=False)
    anchors = {}
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            word = heard[block.b + offset]
            anchors[block.a + offset] = (float(word["start"]), float(word["end"]))
    ratio = len(anchors) / len(script)
    if ratio < .83:
        raise ValueError(f"Narration/transcript agreement is too low: {ratio:.1%}; review this take before publishing")
    offset = 0
    for scene in scenes:
        length = len(scene["narration"].split())
        indices = range(offset, offset + length)
        matched = sum(index in anchors for index in indices)
        run_length = longest_run = 0
        for index in indices:
            run_length = 0 if index in anchors else run_length + 1
            longest_run = max(longest_run, run_length)
        if matched / length < .76 or longest_run >= 5:
            raise ValueError(f"Narration is missing or differs substantially in scene {scene['title']!r}; review the audio")
        offset += length
    result = []
    for index, word in enumerate(script):
        if index in anchors:
            start, end = anchors[index]
        else:
            before = max((n for n in anchors if n < index), default=-1)
            after = min((n for n in anchors if n > index), default=len(script))
            a = anchors[before][1] if before >= 0 else 0
            b = anchors[after][0] if after < len(script) else duration
            step = max(0, b - a) / (after - before)
            start, end = a + step * (index - before - 1), a + step * (index - before)
        if result:
            start = max(start, result[-1]["end"])
        result.append({"word": word, "start": max(0, start), "end": min(duration, max(start + .02, end))})
    if any(word["end"] > duration or word["start"] >= word["end"] for word in result):
        raise ValueError("Word alignment exceeds the narration bounds")
    return result, ratio


def captions(words, duration):
    cues, current = [], []
    for index, word in enumerate(words):
        current.append(word)
        text = " ".join(item["word"] for item in current)
        at_sentence = word["word"].endswith((".", "?", "!", ";"))
        if len(current) >= 9 or len(text) >= 62 or (at_sentence and len(current) >= 4) or index == len(words) - 1:
            if index == len(words) - 1 and len(current) <= 3 and cues and len(cues[-1]["text"]) + len(text) < 84:
                cues[-1]["text"] += " " + text
                cues[-1]["end"] = min(duration, current[-1]["end"] + .08)
                current = []
                continue
            start = current[0]["start"]
            next_start = words[index + 1]["start"] if index + 1 < len(words) else duration
            end = min(next_start, max(current[-1]["end"] + .08, start + .35), duration)
            if end <= start:
                raise ValueError("Invalid caption timing")
            cues.append({"start": start, "end": end, "text": text})
            current = []
    return cues


def canvas(scene, chapter, count, mobile=False):
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    logo = Image.open(PROJECT / "public/brand/mark.png").convert("RGBA")
    logo.thumbnail((35, 35), Image.Resampling.LANCZOS)
    image.paste(logo, (80, 20), logo)
    draw.line((133, 22, 133, 52), fill="#c5d5d3", width=1)
    draw.text((156, 24), scene["title"], fill=INK, font=font(21))
    draw.text((156, 51), scene["scope"], fill=MUTED, font=font(12))
    draw.text((1840, 30), f"{chapter:02} / {count:02}", anchor="ra", fill=MUTED, font=font(16))
    if mobile:
        draw.rounded_rectangle((144, 80, 572, 992), radius=40, fill="#cad8d4")
        draw.text((720, 845), "The same workspace. Within reach.", fill=INK, font=font(30))
        draw.text((720, 897), "Desktop · Mobile · Installable web app", fill=MUTED, font=font(20))
    else:
        draw.rounded_rectangle((122, 69, 1798, 1017), radius=18, fill="#d5e0dc")
    return image


def render_scene(scene, clip, duration, path, chapter, count, captures):
    base = path.with_suffix(".png")
    mobile = scene["visual"] == "mobile"
    canvas(scene, chapter, count, mobile).save(base)
    args = ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-i", str(base), "-ss", str(clip["trimStartSeconds"]), "-i", str(ROOT / clip["path"])]
    filters = []
    if mobile:
        desktop = captures["overview"]
        args += ["-ss", str(desktop["trimStartSeconds"]), "-i", str(ROOT / desktop["path"])]
        filters += [f"[1:v]scale=416:900,fps={FPS},setsar=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={duration}[phone]", f"[2:v]scale=1104:621,fps={FPS},setsar=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={duration}[desktop]", "[0:v][desktop]overlay=720:156:shortest=1[stage]", "[stage][phone]overlay=150:86:shortest=1[view]"]
    else:
        filters += [f"[1:v]scale=1664:936,fps={FPS},setsar=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={duration}[screen]", "[0:v][screen]overlay=128:75:shortest=1[view]"]
    filters += [f"[view]fade=t=in:st=0:d=0.12,fade=t=out:st={max(.12, duration-.12)}:d=0.12,format=yuv420p[v]"]
    args += ["-filter_complex", ";".join(filters), "-map", "[v]", "-t", str(duration), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-r", str(FPS), "-threads", "2", "-movflags", "+faststart", str(path)]
    run(args)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--film", choices=["demo", "pitch", "technical"])
    parser.add_argument("--publish", action="store_true", help="Copy existing verified exports into public/videos and the videos mirror without rendering again")
    args = parser.parse_args()
    story = json.loads((ROOT / "storyboard.json").read_text())
    if args.publish:
        if args.film:
            raise ValueError("Publish all three films together; --film is only for rendering")
        metadata = json.loads((OUT / "metadata.json").read_text())
        quality = json.loads((OUT / "quality-checks.json").read_text())
        if set(metadata) != {"buffer-demo", "buffer-pitch", "buffer-technical"}:
            raise ValueError("All three measured exports are required for publication")
        for name, info in metadata.items():
            digest = hashlib.sha256((OUT / f"{name}.mp4").read_bytes()).hexdigest()
            if digest != info["sha256"] or digest != quality["films"][name]["sha256"]:
                raise ValueError(f"Quality verification is outdated for {name}")
            for extension in (".mp4", ".vtt", "-poster.jpg", "-transcript.md"):
                if not (OUT / (name + extension)).is_file():
                    raise FileNotFoundError(name + extension)
                if hashlib.sha256((OUT / (name + extension)).read_bytes()).hexdigest() != quality["films"][name]["artifacts"][extension]:
                    raise ValueError(f"Verified artifact changed after review: {name + extension}")
        for name in metadata:
            for extension in (".mp4", ".vtt", "-poster.jpg", "-transcript.md"):
                for destination in (PROJECT / "public/videos", PROJECT / "videos"):
                    shutil.copyfile(OUT / (name + extension), destination / (name + extension))
        for filename in ("metadata.json", "quality-checks.json"):
            shutil.copyfile(OUT / filename, PROJECT / "videos" / filename)
        print(json.dumps({"published": list(metadata), "revision": story["revision"]}))
        return
    capture_manifest = json.loads((ROOT / "capture-metadata.json").read_text())
    captures = {clip["id"]: clip for clip in capture_manifest["clips"]}
    OUT.mkdir(exist_ok=True)
    metadata_path = OUT / "metadata.json"
    metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
    accepted_audio = {item["film"]: item for item in json.loads((ROOT / "narration-metadata.json").read_text())}
    for film in story["films"]:
        if args.film and film["id"] != args.film:
            continue
        name = "buffer-" + film["id"]
        audio = ROOT / (name + ".mp3")
        if not audio.is_file():
            raise FileNotFoundError(f"Missing accepted narration for {name}")
        accepted = accepted_audio[film["id"]]
        audio_hash = hashlib.sha256(audio.read_bytes()).hexdigest()
        if audio_hash != accepted["sha256"] or accepted["voice"] != "Niki" or accepted["speed"] != 1:
            raise ValueError(f"Narration is not the accepted natural-pace Niki take: {name}")
        duration = float(probe(audio)["format"]["duration"])
        alignment = json.loads((ROOT / f"{name}-alignment.json").read_text())
        if alignment["audioSha256"] != audio_hash or abs(duration - accepted["duration"]) > .05:
            raise ValueError(f"Alignment or measured duration does not belong to the accepted take: {name}")
        words, match_ratio = aligned_words(film["scenes"], alignment, duration)
        subtitles = captions(words, duration)
        scenes, offset = [], 0
        for scene in film["scenes"]:
            scenes.append({**scene, "start": 0 if offset == 0 else max(0, words[offset]["start"] - .15)})
            offset += len(scene["narration"].split())
        total_duration = math.ceil(max(duration + .55, film["targetSeconds"][0]) * FPS) / FPS
        segments = []
        for index, scene in enumerate(scenes):
            end = scenes[index + 1]["start"] if index + 1 < len(scenes) else total_duration
            length = end - scene["start"]
            clip = captures[scene["visual"]]
            if clip["errors"] or clip["usableSeconds"] < min(length, 12):
                raise ValueError(f"Capture is not ready: {scene['visual']}")
            if scene["scope"].startswith("Public Solana") and clip["kind"] != "public-mainnet":
                raise ValueError("Live narration must use verified public mainnet footage")
            segment = OUT / f"{name}-{index + 1:02}.mp4"
            render_scene(scene, clip, length, segment, index + 1, len(scenes), captures)
            segments.append(segment)
            print(json.dumps({"scene": segment.name, "seconds": round(length, 3)}), flush=True)
        concat = OUT / f"{name}-concat.txt"
        concat.write_text("\n".join(f"file '{segment.name}'" for segment in segments) + "\n")
        final = OUT / f"{name}.mp4"
        run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-i", str(audio), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=8,apad", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", str(total_duration), "-movflags", "+faststart", str(final)])
        vtt = "WEBVTT\n\n" + "\n\n".join(f"{stamp(cue['start'])} --> {stamp(cue['end'])} line:95% position:50% size:90% align:center\n{cue['text']}" for cue in subtitles) + "\n"
        (OUT / f"{name}.vtt").write_text(vtt)
        transcript = f"# Buffer {film['id'].title()}\n\nRecorded September 30, 2026 from the current Buffer app. Narration uses the Niki synthetic preset, performed at its natural pace. Public mainnet observations are capture-time data; illustrative portfolio scenes are identified below. No authentication or recipient delivery is staged.\n\n"
        transcript += "\n".join(f"## {stamp(scene['start'])[:-4]} — {scene['title']}\n\n*{scene['scope']}.*\n\n{scene['narration']}\n" for scene in scenes)
        (OUT / f"{name}-transcript.md").write_text(transcript)
        run(["ffmpeg", "-v", "error", "-y", "-ss", "2", "-i", str(final), "-frames:v", "1", "-q:v", "2", str(OUT / f"{name}-poster.jpg")])
        details = probe(final)
        video = next(stream for stream in details["streams"] if stream["codec_type"] == "video")
        metadata[name] = {"duration": round(float(details["format"]["duration"]), 3), "bytes": final.stat().st_size, "resolution": [video["width"], video["height"]], "fps": FPS, "videoCodec": video["codec_name"], "audio": {"codec": "aac", "sampleRate": 48000, "channels": 2}, "recordedAt": story["recordedAt"], "revision": "media-source-v3", "assembly": "Actual Buffer browser recordings, FFmpeg composition, continuous natural-pace narration", "voice": "Niki", "alignmentMatch": round(match_ratio, 4), "captionCues": len(subtitles), "sha256": hashlib.sha256(final.read_bytes()).hexdigest(), "scenes": [{"visual": scene["visual"], "scope": scene["scope"], "start": round(scene["start"], 3)} for scene in scenes]}
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")
        print(json.dumps({"film": name, **metadata[name]}), flush=True)


if __name__ == "__main__":
    main()
