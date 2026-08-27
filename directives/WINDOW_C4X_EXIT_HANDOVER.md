# WINDOW C4X — FINAL EXIT HANDOVER (execute as the LAST task of the final session)

Free tier ends 2026-08-28. After this window, no session can retrieve anything from the
Manus platform. This window's definition of done is: **the operator can run, migrate, and
prove this product with zero Manus access.** An honest "could not export X because Y" is
acceptable; silence about X is a protocol violation.

Everything below is COMMITTED AND PUSHED as files. A deliverable that exists only in chat,
sandbox, or platform UI counts as NOT delivered.

## E1 — Environment manifest (names + provenance, never secret values in git)
Commit `reports/EXIT_ENV_MANIFEST.md`: EVERY env var the hosted deployment actually runs
with — name, purpose, Manus-issued vs operator-portable, and where the operator obtains a
replacement. Actual secret VALUES go to the operator through the platform's secure channel,
never into git. Must cover at minimum: DATABASE_URL, JWT_SECRET, OAUTH_SERVER_URL,
OWNER_OPEN_ID, app id, BUILT_IN_FORGE_API_URL/KEY, VITE_OAUTH_PORTAL_URL, and any others.

## E2 — Hosted database export (the rows are legal evidence)
Full logical dump of the hosted TiDB/MySQL database (mysqldump or equivalent), delivered to
the operator + committed manifest `reports/EXIT_DB_MANIFEST.md`: per-table row counts,
dump file sha256, dump timestamp, and the exact restore command. The operator will verify
counts against `SELECT COUNT(*)` output you include per table.

## E3 — Forge storage inventory + bytes (drawn signatures, supplier evidence, photos)
Committed `reports/EXIT_STORAGE_MANIFEST.md`: every stored object — key, size, sha256,
which table/column references it. Deliver the bytes (bulk export or presigned URLs with
expiry ≥7 days, listed in the manifest). Signatures sealed into snapshots are court
artifacts: a missing byte makes a sealed hash unverifiable forever.

## E4 — Scheduler state
Committed `reports/EXIT_SCHEDULER_MANIFEST.md`: every registered heartbeat/cron job —
taskUid, schedule, clinic mapping, endpoint it calls. (The replacement scheduler exists in
the operator's branch; this manifest is what lets it be re-armed identically.)

## E5 — Identity map
Committed `reports/EXIT_IDENTITY_MANIFEST.md`: every `users.openId` → email/display name
(from the users table, not from OAuth-server internals), so post-Manus local auth can link
existing accounts. No passwords exist to export (OAuth-only) — say so explicitly.

## E6 — Repo completeness sweep (no invisible deliverables)
Commit anything that exists in the sandbox but not in git (scripts, analyses, configs,
deploy files). Then commit `reports/EXIT_SANDBOX_SWEEP.md` listing what was repatriated and
an explicit "nothing else remains" or an itemized could-not-export list.

## E7 — Remediation branch closure
The safety-remediation branch: pushed, with its report (fixed w/ commit hashes; NOT-done
stated plainly; regression tests run against live boot). Note the merge-coordination items
in `directives/BACKLOG_CODE_READ_2026-08-28.md` §D (NULL expiry = procedure-only;
operator branch `oss-adoption-2026-08-28` exists).

## E8 — Final line
Append to `directives/STATE.md`: window closed, manifest list, and the single sentence:
"The operator can now run this product without Manus: YES / NO because ___."

## Operator verification (Eva/Claude, BEFORE the window closes)
- [ ] Every E1–E7 file exists in the pushed repo (not chat).
- [ ] DB dump sha256 matches its manifest; spot-restore locally; row counts match.
- [ ] 5 random storage objects download and hash-match the manifest.
- [ ] Any gap → re-ask IMMEDIATELY while the session is still alive.
