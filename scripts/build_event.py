#!/usr/bin/env python3
"""Fetch the public Event Notion page (via r.jina.ai Markdown) and dump its
table as event.json — the Event menu snapshot, mirroring build_schedule.py.

The page is rendered server-side by r.jina.ai as interleaved key/value lines:
  ... "Isi tabel" ...
  Tanggal
  20 September 2026
  Event
  Workshop Kubernetes
  Waktu
  19:00
  ...
A field may span MULTIPLE value lines (joined with \n). A repeated key starts
a new row. Column labels that never appear in ANY row are skipped so the
generated columns reflect the live page.

Configuration via env vars:
  NOTION_PAGE_ID   (required) e.g. 3e16fa858bba80cc9ce1e72ebbabe516
  NOTION_HOST      (optional)  default teguhpm.notion.site
  OUTPUT           (optional)  default event.json
"""

import json
import os
import re
import sys
import urllib.request

try:
    from notion_api import fetch_text as fetch_notion_text
except Exception:  # pragma: no cover - fall back to r.jina.ai only
    fetch_notion_text = None

PAGE_ID = os.environ.get("NOTION_PAGE_ID", "").strip().replace("-", "")
HOST = os.environ.get("NOTION_HOST", "teguhpm.notion.site").strip()
OUTPUT = os.environ.get("OUTPUT", "event.json").strip()

# Checked EXACTLY (lowercased). Keep value-bearing lines from being misread as
# keys: a line must be exactly one of these to act as a column header.
KEY_CANDIDATES = [
    "tanggal", "event", "kegiatan", "nama", "judul", "pelatihan", "training",
    "modul", "materi", "waktu", "jam", "pukul", "lokasi", "tempat", "biaya",
    "harga", "donasi", "registrasi", "link", "kuota", "peserta", "status",
    "deskripsi", "detail",
]


def fetch_markdown():
    """Stable URL on purpose — unique cache-busting queries make r.jina.ai
    return 403 AbuseAlleviationError for the whole domain."""
    url = f"https://r.jina.ai/https://{HOST}/" + PAGE_ID
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "*/*",
            "User-Agent": "Mozilla/5.0 (compatible; dikodeworks-event/1.0)",
            "X-Timeout": "30",
            # Ask r.jina.ai to bypass its own cache (header, not a unique URL,
            # so it never trips the domain abuse limiter).
            "X-No-Cache": "true",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse(text):
    lines = [l.strip() for l in text.split("\n") if l]
    start = next((i for i, l in enumerate(lines) if l.lower() == "isi tabel"), -1)

    row_marker = re.compile(r"^#{0,6}\s*[0-9]{1,6}\s*$")
    num_marker = re.compile(r"^[0-9]{3}$")
    md_link = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")

    rows = []
    row = {}
    current_key = None

    def flush():
        nonlocal row
        if not row:
            return
        rows.append(row)
        row = {}

    for line in lines[start + 1:]:
        if row_marker.match(line) or num_marker.match(line):
            continue
        low = line.lower()
        if low in KEY_CANDIDATES:
            if low in row:
                flush()  # repeated key → new row
            current_key = low
        else:
            if current_key is None:
                continue
            m = md_link.match(line)
            value = m.group(1) if m else line
            link = m.group(2) if m else (line if re.match(r"^https?://", line, re.I) else None)
            if current_key in row:
                row[current_key]["v"] += "\n" + value
                if link:
                    row[current_key]["link"] = link
            else:
                row[current_key] = {"v": value, "link": link}
    flush()

    # Sort columns files-wise: keep a sensible display order, dropping any
    # key that never appeared (e.g. "Materi" when the Event page has none).
    order = ["tanggal", "event", "kegiatan", "nama", "judul", "pelatihan",
             "training", "modul", "materi", "waktu", "jam", "pukul", "lokasi",
             "tempat", "biaya", "harga", "donasi", "registrasi", "link",
             "kuota", "peserta", "status", "deskripsi", "detail"]
    seen = [k for k in order if any(k in row for row in rows)]
    columns = []
    for k in seen:
        # Prefer the label as written by the author: scan the original lines.
        columns.append(k)
    if not seen and rows:
        columns = sorted({k for row in rows for k in row})

    def label_case(low):
        for line in lines:
            if line.lower() == low:
                return line.strip()
        return low.title()

    headers = [label_case(c) for c in columns]
    return headers, rows


def normalize(rows, headers):
    entries = []
    for row in rows:
        entry = []
        for h in headers:
            cell = row.get(h.lower(), {"v": "", "link": None})
            entry.append({"v": cell.get("v", ""), "link": cell.get("link")})
        entries.append(entry)
    return entries


def main():
    if not PAGE_ID:
        sys.exit("NOTION_PAGE_ID is required")
    # Prefer the public Notion API (CORS-enabled, no r.jina.ai proxy / limits);
    # fall back to r.jina.ai when the API is unavailable.
    text = ""
    if fetch_notion_text:
        try:
            text = fetch_notion_text(PAGE_ID)
        except Exception:
            text = ""
    if "isi tabel" not in text.lower():
        text = fetch_markdown()
    headers, rows = parse(text)
    document = {
        "source": f"https://{HOST}/" + PAGE_ID,
        "columns": headers,
        "rows": normalize(rows, headers),
        "note": "generated by scripts/build_event.py from the public Notion page (Notion API)",
    }
    if not document["rows"]:
        sys.exit("event parse produced no rows; keeping the previous snapshot")
    with open(OUTPUT, "w", encoding="utf-8") as fh:
        json.dump(document, fh, ensure_ascii=False, indent=2)
    print(f"wrote {OUTPUT}: {len(document['rows'])} rows, {len(headers)} cols")


if __name__ == "__main__":
    main()