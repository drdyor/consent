"""Probe: fetch one NHS.uk conditions page and HOLD it with provenance.

Seed for WINDOW_C5 (education source ingest). Run: py -3.13 tools/nhs_conditions_probe.py [slug]
Writes data/education_sources/held/<slug>_<UTCstamp>.html + a JSON sidecar with
sha256, retrieved_at, source_url, licence note. Fail-closed: any HTTP error or
empty body exits non-zero and writes a source_unavailable record instead.
"""
import hashlib, json, pathlib, sys, urllib.request
from datetime import datetime, timezone

SLUG = sys.argv[1] if len(sys.argv) > 1 else "dry-mouth"
URL = f"https://www.nhs.uk/conditions/{SLUG}/"
HELD = pathlib.Path(__file__).resolve().parents[1] / "data" / "education_sources" / "held"
HELD.mkdir(parents=True, exist_ok=True)
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

req = urllib.request.Request(URL, headers={"User-Agent": "AegisEducationProbe/0.1 (operator research; contact: clinic operator)"})
record = {"source_url": URL, "retrieved_at": stamp, "slug": SLUG,
          "licence_note": "NHS.uk content — verify reuse route: NHS Syndication API registration (operator item) or OGL where stated. Attribution required. NOT NICE guidance.",
          "status": None, "sha256": None, "held_file": None}
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    if not body or len(body) < 2000:
        raise RuntimeError(f"suspiciously small body: {len(body)} bytes")
    digest = hashlib.sha256(body).hexdigest()
    held_file = HELD / f"{SLUG}_{stamp}.html"
    held_file.write_bytes(body)
    record.update(status="held", sha256=digest, held_file=held_file.name, bytes=len(body))
    exit_code = 0
except Exception as e:  # fail-closed, honest wall state
    record.update(status="source_unavailable", error=str(e))
    exit_code = 1
sidecar = HELD / f"{SLUG}_{stamp}.json"
sidecar.write_text(json.dumps(record, indent=2), encoding="utf-8")
print(json.dumps(record, indent=2))
sys.exit(exit_code)
