#!/usr/bin/env python3
"""Fetch a public Notion page and dump its schedule table as schedule.json.

The Notion page is a flat list of blocks:
  section 1: a "Tabel" heading followed by 7 bulleted_list blocks (the columns)
  section 2 ("Isi tabel"): repeated label(text) + value(bulleted_list) pairs

Configuration via env vars:
  NOTION_PAGE_ID   (required) e.g. 3d76fa85-8bba-8067-8c5a-d21fda12a21f
  NOTION_HOST      (optional)  default teguhpm.notion.site
  OUTPUT           (optional)  default schedule.json

Safe to run anywhere: python3, no third-party dependencies.
"""

import json
import os
import sys
import urllib.request

PAGE_ID = os.environ.get("NOTION_PAGE_ID", "").strip().replace("-", "")
HOST = os.environ.get("NOTION_HOST", "teguhpm.notion.site").strip()
OUTPUT = os.environ.get("OUTPUT", "schedule.json").strip()

EXPECTED_COLUMNS = ["Training", "Materi", "Tanggal", "Waktu", "Lokasi", "Biaya", "Registrasi"]


def fetch_chunk(page_id):
    url = f"https://{HOST}/api/v3/loadCachedPageChunk"
    body = json.dumps(
        {
            "pageId": page_id,
            "cursor": {"stack": []},
            "chunkNumber": 0,
            "verticalColumns": False,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; problem-confirm/1.0)",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def block_text(props):
    if not props:
        return ""
    first = list(props.values())[0]
    out = []
    if first and isinstance(first, list):
        for item in first:
            if isinstance(item, list) and item:
                out.append(item[0] if isinstance(item[0], str) else "")
    return "".join(out)


def block_link(props):
    if not props:
        return None
    first = list(props.values())[0]
    if first and isinstance(first, list):
        for item in first:
            if isinstance(item, list) and len(item) > 1 and isinstance(item[1], list) and item[1]:
                for ann in item[1]:
                    if isinstance(ann, list) and len(ann) > 1 and ann[0] == "a":
                        return ann[1]
    return None


def pull_blocks(payload):
    blocks = []
    for bid, node in payload.get("recordMap", {}).get("block", {}).items():
        value = node.get("value", {}).get("value", {})
        kind = value.get("type")
        if kind not in ("text", "bulleted_list"):
            continue
        props = value.get("properties", {})
        blocks.append(
            {
                "type": kind,
                "text": block_text(props).strip(),
                "link": block_link(props),
            }
        )
    return blocks


def find_header(seq):
    """Return the list of header names for the scheduled-table section."""
    for i, blk in enumerate(seq):
        if blk["type"] != "text":
            continue
        if blk["text"].strip().lower() in ("tabel", "table"):
            headers = []
            j = i + 1
            while j < len(seq) and seq[j]["type"] == "bulleted_list":
                headers.append(seq[j]["text"])
                j += 1
            if len(headers) >= len(EXPECTED_COLUMNS):
                return headers[: len(EXPECTED_COLUMNS)]
    return EXPECTED_COLUMNS


def find_rows(seq, headers):
    """Find the label/value pairs; each label is a text block immediately
    followed by a bulleted_list holding the value."""
    wanted = [h.strip().lower() for h in headers]
    rows = []
    cur = {}
    i = 0
    while i < len(seq) - 1:
        blk = seq[i]
        nxt = seq[i + 1]
        if (
            blk["type"] == "text"
            and nxt["type"] == "bulleted_list"
            and blk["text"].strip().lower() in wanted
            and blk["text"].strip().lower() not in (h.lower() for h in cur)
        ):
            key = blk["text"].strip()
            cur[key] = {
                "v": nxt["text"],
                "link": nxt["link"],
            }
            i += 2
            if len(cur) == len(wanted):
                rows.append(cur)
                cur = {}
            continue
        i += 1
    if cur:
        rows.append(cur)
    return rows


def normalize(rows, headers):
    entries = []
    for row in rows:
        entry = []
        for h in headers:
            cell = row.get(h, {})
            entry.append(
                {
                    "v": cell.get("v", ""),
                    "link": cell.get("link"),
                }
            )
        entries.append(entry)
    return entries


def main():
    if not PAGE_ID:
        sys.exit("NOTION_PAGE_ID is required")
    payload = fetch_chunk(PAGE_ID)
    seq = pull_blocks(payload)
    headers = find_header(seq)
    rows = find_rows(seq, headers)
    document = {
        "source": f"https://{HOST}/" + PAGE_ID + "?source=copy_link",
        "columns": headers,
        "rows": normalize(rows, headers),
        "note": "generated by scripts/build_schedule.py from public Notion page",
    }
    with open(OUTPUT, "w", encoding="utf-8") as fh:
        json.dump(document, fh, ensure_ascii=False, indent=2)
    print(f"wrote {OUTPUT}: {len(document['rows'])} rows, {len(headers)} cols")


if __name__ == "__main__":
    main()