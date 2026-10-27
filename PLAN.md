# PLAN — DiabetesRisk production upgrade

Status: **Implemented in 1.0.0 (see CHANGELOG.md). Decisions taken: D1 hybrid, D2 Vercel, D3 legacy paper claims dropped, D4 English only.**
Each phase ends with a commit (or a few), a `npm test` run where applicable, and a diff summary.

---

## 1. Decisions needing your approval

### D1 — Clinical scoring approach (Goal 2) — *recommended: Hybrid*

| Option | Level 1 (no labs) | Levels 2–3 (labs) | Gauge shows |
|---|---|---|---|
| **Hybrid (recommended)** | **FINDRISC** (Lindström & Tuomilehto 2003) with its published 10-year risk bands, and **IDRS** (Mohan et al. 2005) beside it as the South-Asian score. Drivers = points per item; what-if = point/band change. | **Criteria-based classification first**: ADA glycaemic category from HbA1c/FPG, harmonised metabolic-syndrome count (x/5), HOMA-IR, FIB-4, KDIGO G-stage from a CKD-EPI 2021 eGFR, TG/HDL, non-HDL. A rebuilt logistic model is kept **only** as an *"illustrative, uncalibrated what-if index (0–100)"*, not a probability. It drives the live driver bars with baseline-centred contributions. | L1: published FINDRISC band risk ("≈ 1 in 6 over 10 years"). L2/L3: the index plus the ADA category. |
| (b) Relabel only | Keep the fixed logistic everywhere, labelled uncalibrated | Same plus criteria flags | Index |
| (a) Validated only | FINDRISC + IDRS | Criteria only, no continuous score | Points / categories |

FINDRISC needs **3 new Level-1 inputs**: daily vegetables/fruit, antihypertensive medication, history of high blood glucose. Sleep, stress, smoking and alcohol stay as inputs. They're shown as "other factors, not part of the validated score" and feed the guidance, not the number.

### D2 — Backend target — *recommended: Vercel*
`api/recommend.js` Vercel function (Node, streaming) and the same handler mounted in Vite dev via a small middleware, so `npm run dev` serves both. Caveat: an in-memory per-IP rate limit only holds per warm instance. I'll ship that plus an optional Upstash Redis limiter turned on by env var. Alternative: a Cloudflare Worker with the native rate-limit binding.

### D3 — Legacy claims about the author's work
I'll remove every accuracy/AUC/ensemble/dataset claim (AUDIT C1). The IJSRED 2022 paper will stay only as *"author's prior work (Pima dataset), not a validation of this tool"*. Please confirm or tell me to drop it.

### D4 — i18n — *recommended: scaffold + English, with hi/te machine-drafted and visibly marked "translation pending review"*
Or: scaffold + English only.

---

## 2. Phased checklist

### Phase 0 — Audit ✅
- [x] Copy original to `legacy/Diabetes_risk_model.html` (kept as the behavioural reference)
- [x] `AUDIT.md`: architecture, every function, measured model behaviour, ranked defects, citation check
- [x] `PLAN.md` (this file)

### Phase 1 — Model & tests (`src/model.js`, Vitest)
- [ ] Scaffold Vite project (`package.json`, `vite.config.js`, ESLint/Prettier minimal), `npm run dev / test / build`
- [ ] `src/units.js`: glucose mg/dL⇄mmol/L (÷18.016), HbA1c %⇄mmol/mol (IFCC = 10.929 × (NGSP − 2.15)), kg⇄lb, cm⇄ft/in, creatinine mg/dL⇄µmol/L (× 88.42), TG mg/dL⇄mmol/L (÷88.57), cholesterol mg/dL⇄mmol/L (÷38.67). Canonical internal units: mg/dL, %, kg, cm.
- [ ] `src/model.js`, pure with no DOM:
  - [ ] FINDRISC item scoring + published bands *(TODO human review: point table vs original paper)*
  - [ ] IDRS scoring + bands *(TODO human review: activity item wording)*
  - [ ] ADA glycaemic category (HbA1c 5.7–6.4 / ≥ 6.5; FPG 100–125 / ≥ 126; random ≥ 200)
  - [ ] Harmonised MetS criteria (Alberti et al., Circulation 2009) with Asian waist cut-offs as the default and a general-population toggle
  - [ ] BMI category: Asian 23 / 25 (WHO WPRO 2000) ⇄ general 25 / 30 toggle
  - [ ] HOMA-IR, FIB-4 (Sterling 2006; < 1.30 low, 1.30–2.67 indeterminate, > 2.67 high; age > 65 caveat), CKD-EPI 2021 race-free eGFR, KDIGO G1–G5, TG/HDL ratio, non-HDL, Friedewald LDL consistency check
  - [ ] Illustrative logistic index (per D1): baseline-centred `contribution = coef × (x − baseline)`, `whatIf(inputs, change)` helper, clamp/never display 0 or 100
  - [ ] `validate(inputs)`: plausible ranges (HbA1c 3–15 %, FPG 40–600, eGFR 5–150, …), cross-checks (BMI vs height/weight, LDL+HDL+TG/5 vs TC, creatinine vs eGFR), urgent flags (glucose > 250, random ≥ 200 + symptoms, eGFR < 30, SBP ≥ 180)
- [ ] Tests: boundary values, monotonicity (HbA1c/FPG/waist/age never lower risk), unit round-trips, FINDRISC/IDRS worked examples, snapshot of fixed inputs → outputs, NaN/invalid handling
- [ ] Diff summary → commit

### Phase 2 — Architecture & backend
- [ ] Split into `index.html`, `styles.css`, `src/{model,units,state,ui,api,i18n}.js`. Parity with the legacy three levels (same inputs and defaults, plus the new FINDRISC items).
- [ ] `src/state.js`: canonical store, localStorage (try/catch), URL hash encode/decode (versioned, compact), reset per level
- [ ] `server/recommend.js` (shared handler) + `api/recommend.js` (Vercel) + Vite dev middleware
  - [ ] zod request schema: numbers and enums only, no free text, no identifiers; strip unknown keys
  - [ ] per-IP rate limit, body-size cap, `max_tokens` cap, CORS = `ALLOWED_ORIGIN` only
  - [ ] Claude `claude-sonnet-4-6`, structured JSON output schema, streamed to the client as SSE
  - [ ] 503 + `{fallback:true}` when `ANTHROPIC_API_KEY` is missing
- [ ] Security headers (`vercel.json` + dev middleware): CSP (`default-src 'self'; connect-src 'self'; …`, no `unsafe-inline`), Referrer-Policy, X-Content-Type-Options, Permissions-Policy, frame-ancestors
- [ ] Self-hosted Poppins (woff2 subset, `font-display: swap`, metric-matched fallback)
- [ ] `.env.example`
- [ ] Server tests (schema rejects extras, rate limit, no-key fallback)
- [ ] Diff summary → commit

### Phase 3 — Realtime UI
- [ ] Event delegation, debounced compute (~80 ms) + rAF render; no "Analyse" step
- [ ] Animated gauge and count-up (eased; instant under `prefers-reduced-motion`); live band chip with text + icon
- [ ] Live driver bars (sorted, diverging, baseline-centred) + what-if deltas ("Waist −5 cm → 18.4 → 14.1")
- [ ] Paired slider + number input per field; inline validation messages; cross-field warnings
- [ ] Unit toggles (per-field, remembered)
- [ ] `src/api.js`: SSE client, 1.5 s idle debounce, AbortController cancel-on-change, skeleton, incremental render of each validated item via `textContent`. Deterministic rule-based fallback (by band + top drivers) when offline / 429 / 5xx / no key.
- [ ] Urgent-care banner
- [ ] Copy link, Reset, Print / Save as PDF (print stylesheet)
- [ ] Diff summary → commit

### Phase 4 — Design polish
- [ ] Design tokens (spacing scale, radii, type scale, colour), light/dark via `prefers-color-scheme` + manual toggle
- [ ] Results dashboard: gauge, drivers, approximate population-context strip (clearly labelled), modifiable vs non-modifiable split, prioritised action plan with numeric targets
- [ ] Sticky mobile risk-summary bar; smooth tab transitions; micro-interactions
- [ ] 360 px: no horizontal scroll; ≥ 24 px touch targets
- [ ] Diff summary → commit

### Phase 5 — Accessibility & performance
- [ ] `role=tablist` with arrow keys, `<details>` FAQ, `label for` everywhere, throttled `aria-live` announcements, visible focus, contrast ≥ 4.5:1 (gauge colours paired with text/icons)
- [ ] Meta/OG tags, favicon, `manifest.webmanifest`, service worker (precache app shell; AI degrades to rule-based offline)
- [ ] Playwright smoke: slider → gauge/drivers update < 150 ms; AI panel streams (mocked SSE); offline fallback
- [ ] axe (zero critical/serious), Lighthouse mobile run, JS < 60 KB gz check in `npm run build`
- [ ] Optional i18n (per D4)
- [ ] Diff summary → commit

### Phase 6 — Docs
- [ ] Rewrite in-app Methods & Limitations, FAQ, privacy note ("inputs processed in your browser; only anonymous numeric metrics and the risk band are sent to the AI endpoint, and only when you request guidance")
- [ ] References with real, checkable citations; uncertain items marked `TODO(human review)`
- [ ] README (setup, env, deploy to Vercel), CHANGELOG.md with remaining risks
- [ ] Final diff summary → commit + push

---

## 3. Known limits to state up front
- No scoring here will be *clinically validated for this population* by me. FINDRISC and IDRS are validated instruments in their source populations; everything else is criteria-based or explicitly illustrative.
- Lighthouse numbers will come from a headless run in this container (no real-device throttling); I'll report them as such.
- I can't test against your production API key. The backend will be tested with a mocked Anthropic stream and the no-key fallback. A live call is verified only if a key is provided in the environment.
