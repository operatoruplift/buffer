"""Align a completed narration using local/hosted faster-whisper; never submits TTS."""
import argparse
import hashlib
import json
from pathlib import Path

from faster_whisper import WhisperModel

parser = argparse.ArgumentParser()
parser.add_argument("audio", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--model", default="small.en")
args = parser.parse_args()
model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=2)
segments, info = model.transcribe(str(args.audio), language="en", word_timestamps=True, beam_size=5, vad_filter=True, initial_prompt="Buffer. Solana. Velocity. Pacifica. Jupiter. Mainnet. Devnet. Maintenance headroom. Liquidation.")
words = [{"word": word.word, "start": word.start, "end": word.end} for segment in segments for word in (segment.words or [])]
args.output.write_text(json.dumps({"language": info.language, "duration": info.duration, "audioSha256": hashlib.sha256(args.audio.read_bytes()).hexdigest(), "words": words}, indent=2) + "\n")
print(json.dumps({"output": str(args.output), "words": len(words), "duration": info.duration}))
