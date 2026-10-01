#!/usr/bin/env python3
"""Scaffold a motion-graphic project folder from the skill template.

Usage: init_studio.py <dir> [--format 9:16|1:1|16:9|4:5] [--dur 15] [--title "Launch film"]

Creates index.html (seek(t) skeleton), lib/motion.js, STUDIO.md (house rules),
docs/{shotlist,review_log}.md and empty assets/, audio/, refs/, out/ folders.
Never overwrites an existing file; already-present files are reported and kept.
"""
import argparse
import json
import shutil
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
TEMPLATE = SKILL_DIR / "assets" / "template"
FORMATS = {"9:16": (1080, 1920), "1:1": (1080, 1080), "16:9": (1920, 1080), "4:5": (1080, 1350)}
TEXT_SUFFIXES = {".html", ".js", ".md", ".json", ".css"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dir", type=Path)
    ap.add_argument("--format", default="9:16", choices=sorted(FORMATS))
    ap.add_argument("--dur", type=float, default=15.0)
    ap.add_argument("--title", default=None)
    args = ap.parse_args()

    target = args.dir.expanduser().resolve()
    w, h = FORMATS[args.format]
    title = args.title or target.name.replace("-", " ").replace("_", " ").title()
    subs = {"{{W}}": str(w), "{{H}}": str(h), "{{DUR}}": f"{args.dur:g}",
            "{{TITLE}}": title, "{{SKILL_DIR}}": str(SKILL_DIR)}

    created, kept = [], []
    for src in sorted(TEMPLATE.rglob("*")):
        if src.is_dir():
            continue
        dst = target / src.relative_to(TEMPLATE)
        if dst.exists():
            kept.append(str(dst.relative_to(target)))
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.suffix in TEXT_SUFFIXES:
            text = src.read_text(encoding="utf-8")
            for k, v in subs.items():
                text = text.replace(k, v)
            dst.write_text(text, encoding="utf-8")
        else:
            shutil.copy2(src, dst)
        created.append(str(dst.relative_to(target)))
    for d in ("assets/fonts", "audio", "refs", "out"):
        (target / d).mkdir(parents=True, exist_ok=True)

    print(json.dumps({"project": str(target), "format": args.format, "size": [w, h], "duration": args.dur,
                      "created": created, "kept_existing": kept, "skill_dir": str(SKILL_DIR)}, indent=1))


if __name__ == "__main__":
    main()
