#!/usr/bin/env python3
"""Write public/home/feeds.json for local development.

Production headlines come from the scheduled Lambda in infra/feeds/, which
keeps them in S3; this runs the same code against a local file instead.
"""

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "infra/feeds"))

from home_feeds import NoFeeds, collect  # noqa: E402

OUTPUT = ROOT / "public/home/feeds.json"


def main():
    sources = json.loads((ROOT / "src/home/sources.json").read_text())
    try:
        previous = json.loads(OUTPUT.read_text())
    except (OSError, ValueError):
        previous = {}
    try:
        snapshot = collect(sources, previous)
    except NoFeeds as error:
        raise SystemExit(str(error))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(OUTPUT)


if __name__ == "__main__":
    main()
