# Changelog

## 1.1.0
- Optional, consent-gated "Send my results to the site owner" form: optional name/email plus the current level's inputs and result go to Formspree (`VITE_FORMSPREE_URL` overrides the endpoint). Privacy text, CSP (`connect-src`/`form-action` allow formspree.io) and tests updated. Name/email are never sent to Claude.
- Formspree must be activated (first submission is confirmed by email); consider restricting allowed domains in its dashboard. Health data: add a data-retention/deletion process and check local privacy law (e.g. GDPR, India DPDP).

## 1.0.0
- Replaced the legacy single-file app (see AUDIT.md) with a Vite app: tested pure model, live UI, server-side Claude guidance.
- Removed all fabricated accuracy/AUC/dataset claims, fabricated sub-scores and the contradictory privacy text.
- Fixed: driver bars are baseline-centred; no unused inputs; XSS sink removed; urgent-care banner; diabetes-range values never shown as low risk; unit toggles; validation and cross-checks.

### Remaining risks / TODO(human review)
- FINDRISC/IDRS point tables and IDRS activity mapping need a clinician check against the source papers; ADA edition and pages to pin.
- The illustrative index is hand-weighted and uncalibrated; it is labelled as such. Replace only with a model fitted and validated on real data.
- AI output is validated for format, not clinical correctness. Have a clinician review the system prompt (`server/prompt.js`).
- Not done: Hindi/Telugu translations (unreviewed medical text), service worker/offline, CI. Rate limit is per-instance unless Upstash is configured.
- Verified with a mocked Anthropic server and the real SDK; **not** with a live API key.
