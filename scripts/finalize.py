#!/usr/bin/env python3
"""Mux a silent render with its soundtrack at a target loudness (two-pass EBU R128).

Usage: finalize.py <silent.mp4> [audio.wav] [--out out/final-WxH.mp4] [--lufs -14] [--tp -1.5]

- Audio is trimmed or padded to the video length, normalized with ffmpeg loudnorm
  (measure pass + linear apply pass), encoded AAC 192k, video stream copied.
- Without audio, the video is copied as-is (still gets faststart) and reported silent.
- Prints JSON with the measured output loudness so the caller can verify -14 LUFS.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def duration(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return float(r.stdout.strip())


def loudnorm_json(stderr):
    m = re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr, re.S)
    if not m:
        raise RuntimeError("loudnorm produced no measurement:\n" + stderr[-800:])
    return json.loads(m[-1])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", type=Path)
    ap.add_argument("audio", type=Path, nargs="?")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--lufs", type=float, default=-14.0)
    ap.add_argument("--tp", type=float, default=-1.5)
    a = ap.parse_args()

    vid = a.video.resolve()
    out = (a.out or vid.with_name(vid.name.replace("silent", "final") if "silent" in vid.name else vid.stem + "-final.mp4")).resolve()
    if out == vid:
        sys.exit("refusing to overwrite the input video; pass --out")
    out.parent.mkdir(parents=True, exist_ok=True)
    vdur = duration(vid)

    if not a.audio:
        r = run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(vid), "-c", "copy", "-movflags", "+faststart", str(out)])
        if r.returncode:
            sys.exit(r.stderr)
        print(json.dumps({"out": str(out), "duration": round(vdur, 3), "audio": None}))
        return

    trim = f"apad,atrim=0:{vdur:.3f},afade=t=out:st={max(0, vdur - 0.03):.3f}:d=0.03"
    target = f"I={a.lufs}:TP={a.tp}:LRA=11"
    m = loudnorm_json(run(["ffmpeg", "-hide_banner", "-i", str(a.audio), "-af", f"{trim},loudnorm={target}:print_format=json",
                           "-f", "null", "-"]).stderr)
    apply = (f"{trim},loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
             f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,aresample=48000")
    r = run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(vid), "-i", str(a.audio), "-map", "0:v:0", "-map", "1:a:0",
             "-c:v", "copy", "-af", apply, "-c:a", "aac", "-b:a", "192k", "-t", f"{vdur:.3f}", "-movflags", "+faststart", str(out)])
    if r.returncode:
        sys.exit(r.stderr)
    check = run(["ffmpeg", "-hide_banner", "-i", str(out), "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
    i_lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", check)
    peak = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", check)
    print(json.dumps({"out": str(out), "duration": round(duration(out), 3), "audio": str(a.audio.resolve()),
                      "lufs": float(i_lufs[-1]) if i_lufs else None, "true_peak_dbfs": float(peak[-1]) if peak else None}))


if __name__ == "__main__":
    main()
