# WINDOW C3 — Evidence-freshness monitoring

See `HANDOVER_AEGIS_CONSENT.md` §4 idea 5. Stack: Node/tRPC/Drizzle. Synthetic only.

## Build
- `productSources` carry a review status (pending/approved/**superseded**), and the supplier
  module already runs scheduled evidence-expiry reminders. Extend that scheduler to product
  sources: a scheduled re-check that flags any signed consent whose product source has since
  been superseded, or whose registry/market status changed after signing.
- Surface flagged consents to clinic admins (a "consents signed against now-superseded
  evidence" queue) — informational, never auto-invalidating; the signed record stays immutable.
- Tests (reproduce-before-fix): superseding a source after a consent is signed flags that
  consent; a still-approved source does not; the flag never mutates the signed snapshot.

## Definition of done
Integration tests green; freshness monitor + admin queue on synthetic data; committed + pushed;
`reports/WINDOW_C3_REPORT.md`. Update STATE.md and STOP at:
**⛔ WINDOW_C4 (de-Manus migration) — GATED on Eva's fold-vs-standalone decision.** Produce a
short `reports/DEMANUS_MIGRATION_PLAN.md` (Manus OAuth→portable auth, Forge→S3/MinIO,
MySQL→Postgres) for operator review, then STOP. Do not begin the migration without Eva's go.
