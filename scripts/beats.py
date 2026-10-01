# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "soundfile"]
# ///
"""Measure a supplied music track into the beat grid the animation reads.

Usage: uv run beats.py song.wav [--offset 0] > beats.json

Output: {"bpm", "beats" (state changes), "downbeats" (every 4th beat: cuts and big
moments), "hits" (onset peaks: SFX and accents), "duration", "source"}.
Downbeats assume 4/4 starting at the first detected beat; check them against the
music and pass --offset N (beats) if bar one starts later.
"""
import argparse
import json
import sys

import librosa
import numpy as np


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--offset", type=int, default=0, help="beats to skip before bar one")
    a = ap.parse_args()

    y, sr = librosa.load(a.audio, sr=None, mono=True)
    tempo, frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beats = librosa.frames_to_time(frames, sr=sr).round(3).tolist()
    onset = librosa.onset.onset_strength(y=y, sr=sr)
    peaks = librosa.util.peak_pick(onset, pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta=0.5, wait=10)
    json.dump({
        "bpm": round(float(np.atleast_1d(tempo)[0]), 2),
        "beats": beats,
        "downbeats": beats[a.offset::4],
        "hits": librosa.frames_to_time(peaks, sr=sr).round(3).tolist(),
        "duration": round(len(y) / sr, 3),
        "source": a.audio,
    }, sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
