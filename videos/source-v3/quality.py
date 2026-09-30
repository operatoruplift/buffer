"""Verify final picture/audio decoding, exact script captions, and release metadata."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "rendered"
story = json.loads((ROOT / "storyboard.json").read_text())
metadata = json.loads((OUT / "metadata.json").read_text())
checks = {"revision": "media-source-v3", "recordedAt": story["recordedAt"], "films": {}}


def seconds(value):
    h, m, s = value.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


for film in story["films"]:
    name = "buffer-" + film["id"]
    mp4 = OUT / f"{name}.mp4"
    result = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp4), "-f", "null", "-"], capture_output=True, text=True)
    assert result.returncode == 0 and not result.stderr.strip(), result.stderr
    info = metadata[name]
    actual = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(mp4)], text=True))
    video = next(stream for stream in actual["streams"] if stream["codec_type"] == "video")
    audio_stream = next(stream for stream in actual["streams"] if stream["codec_type"] == "audio")
    assert [video["width"], video["height"]] == info["resolution"] == [1920, 1080]
    assert video["codec_name"] == info["videoCodec"] == "h264"
    assert audio_stream["codec_name"] == "aac" and audio_stream["sample_rate"] == "48000" and audio_stream["channels"] == 2
    assert abs(float(actual["format"]["duration"]) - info["duration"]) < .005
    assert hashlib.sha256(mp4.read_bytes()).hexdigest() == info["sha256"]
    vtt = (OUT / f"{name}.vtt").read_text()
    assert vtt.startswith("WEBVTT\n")
    cues = re.findall(r"(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})[^\n]*\n([^\n]+)", vtt)
    assert len(cues) > 10
    previous = 0
    for start, end, text in cues:
        assert previous <= seconds(start) < seconds(end) <= info["duration"]
        assert len(text) <= 85
        previous = seconds(end)
    expected = " ".join(scene["narration"] for scene in film["scenes"])
    assert " ".join(text for _, _, text in cues) == expected
    audio = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(mp4), "-af", "volumedetect", "-vn", "-f", "null", "-"], capture_output=True, text=True, check=True)
    peaks = re.search(r"max_volume: ([-\d.]+) dB", audio.stderr)
    means = re.search(r"mean_volume: ([-\d.]+) dB", audio.stderr)
    assert peaks and means
    assert float(peaks[1]) <= -.5, "Clipping protection failed"
    assert -30 < float(means[1]) < -8, "Narration loudness is outside the intelligibility range"
    artifacts = {extension: hashlib.sha256((OUT / (name + extension)).read_bytes()).hexdigest() for extension in (".mp4", ".vtt", "-poster.jpg", "-transcript.md")}
    checks["films"][name] = {"duration": info["duration"], "bytes": info["bytes"], "sha256": info["sha256"], "artifacts": artifacts, "fullDecode": "pass", "resolution": info["resolution"], "captionCues": len(cues), "captionTextAndBounds": "pass", "alignmentMatch": info["alignmentMatch"], "meanVolumeDb": float(means[1]), "maxVolumeDb": float(peaks[1])}
(OUT / "quality-checks.json").write_text(json.dumps(checks, indent=2) + "\n")
print(json.dumps(checks, indent=2))
