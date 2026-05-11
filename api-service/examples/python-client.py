"""Convert a Markdown document to PDF via the API.

Usage:
    python examples/python-client.py
    API_BASE=https://my-api python examples/python-client.py

Requires:
    pip install requests
"""

from __future__ import annotations

import json
import os
import pathlib
import sys

import requests

API_BASE = os.environ.get("API_BASE", "http://localhost:4000")
HERE = pathlib.Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent


def main() -> None:
    markdown = (HERE / "sample.md").read_text(encoding="utf-8")
    template_path = REPO_ROOT / "public" / "preloaded" / "Default Templates" / "Modern.mdt"
    template = json.loads(template_path.read_text(encoding="utf-8"))

    response = requests.post(
        f"{API_BASE}/v1/convert",
        json={
            "markdown": markdown,
            "template": template,
            "title": "Quarterly Report",
            "variables": {"author": "Jane Doe", "project": "Modern Markdown Editor"},
            "fonts": [
                {
                    "family": "Inter",
                    "url": "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf",
                }
            ],
        },
        timeout=180,
    )

    if not response.ok:
        sys.stderr.write(f"HTTP {response.status_code}: {response.text}\n")
        sys.exit(1)

    out_path = HERE / "report.pdf"
    out_path.write_bytes(response.content)
    print(f"Wrote {out_path} ({len(response.content):,} bytes)")


if __name__ == "__main__":
    main()
