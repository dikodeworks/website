#!/usr/bin/env python3
"""Fetch a public Notion page's text blocks via the CORS-enabled public API
(no r.jina.ai proxy, so no abuse rate-limits).

Returns the page's blocks in document order as newline-joined text, which the
existing label/value parsers understand.
"""

import json
import time
import urllib.request

API = "https://notion-api.splitbee.io/v1/page/"


def dashed(page_id):
    pid = page_id.replace("-", "")
    return f"{pid[0:8]}-{pid[8:12]}-{pid[12:16]}-{pid[16:20]}-{pid[20:32]}"


def fetch_text(page_id, timeout=90):
    key = dashed(page_id)
    # Cache-buster: the API caches by URL and would otherwise serve stale data.
    req = urllib.request.Request(
        API + key + "?t=" + str(int(time.time())),
        headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; dikodeworks/1.0)",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.load(resp)

    root = (data.get(key) or {}).get("value", {}).get("value")
    out = []

    def title(v):
        p = (v or {}).get("properties", {}).get("title")
        if not p:
            return ""
        try:
            return "".join(x[0] for x in p)
        except Exception:
            return ""

    def walk(ids):
        for i in (ids or []):
            v = (data.get(i) or {}).get("value", {}).get("value")
            if not v:
                continue
            t = title(v)
            if t:
                out.append(t)
            if v.get("content"):
                walk(v["content"])

    if root:
        walk(root.get("content"))
    return "\n".join(out)
