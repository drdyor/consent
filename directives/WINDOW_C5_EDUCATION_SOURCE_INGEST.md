# WINDOW C5 — Governed NHS.uk education-source ingest (runs ONLY after C4 is merged)

Controlling document for this window; `WINDOW_C4_RESTORE_SEAL_DEMANUS.md` MUST be complete
first (operator has merged Stage 0). Execution-mode rule applies: execute the runbook, do not
answer with status readbacks; an honest "did not reach step N" beats shallow passes.

## Why (and the licence distinction — do not re-litigate)

The Aegis education registry is link-only + rights-reviewed. That rule protects **NICE/SIGN
guidance (rights-restricted → stays link-only, change-monitored)**. **NHS.uk conditions
content is different**: Crown content designed for reuse via the NHS Syndication API (free
registration — OPERATOR ITEM) and OGL where stated, with attribution. So patient-education
pages (dry mouth, GLP-1 effects, implant aftercare, gum disease) MAY be held and served,
provenance-first, once the rights row is recorded.

## The process is ALREADY STARTED — continue it, don't redesign it

- `tools/nhs_conditions_probe.py` exists and has run. First held artifact:
  `data/education_sources/held/dry-mouth_20260827T135804Z.html` + JSON sidecar
  (sha256 `b8c959fd…3949`). This file pattern IS the contract: held bytes + sidecar with
  `source_url, retrieved_at, sha256, licence_note, status` where status ∈ {held,
  source_unavailable}. A failed fetch writes the honest wall record — never silence.

## Tasks, strictly in order

1. **T1 — Batch the probe.** `tools/nhs_conditions_harvest.py`: reads a committed slug list
   (`data/education_sources/slugs.txt` — seed it with: dry-mouth, gum-disease,
   dental-abscess, mouth-cancer, osteoporosis, menopause, type-2-diabetes,
   high-blood-pressure), runs the probe per slug, writes a run manifest
   (per-slug status + hash), non-zero exit if ANY slug is neither held nor an honest
   source_unavailable record. Respect the site: ≤1 request/2s, no parallel fetching.
2. **T2 — Registry rows.** For each held artifact create a `productSources`-style education
   source row: baseline_key `nhs-conditions-<slug>-v1`, jurisdiction uk_gb, source_url,
   retrieved_at, source_hash, `rights_status='pending_review'` (a NAMED human approves —
   never auto-approve), distribution_state='draft'. Wire rows to the existing
   education-resource registry from the governance module.
3. **T3 — Change monitor.** Re-run harvest against held hashes: changed hash → flag the row
   `review_due`, never auto-replace held bytes. Register as a scheduled job in the de-Manus'd
   scheduler (bearer-secret cron from C4 Stage 3).
4. **T4 — NICE stays link-only.** Add a gate: any held artifact whose source_url matches
   nice.org.uk/sign.ac.uk/sdcep.org.uk FAILS the audit. Trap: plant one, prove it fails.

## Boundaries
No patient-specific content generation; no clinical interpretation; `safe_display_summary`
only after a human review row exists. Rights sign-off, syndication API registration, and any
publication of held content are OPERATOR items. Report per task in `reports/WINDOW_C5_REPORT.md`;
done = audit green (incl. T4 trap) + committed + pushed.
