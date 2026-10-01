# AUDIT — `Diabetes_risk_model.html` (legacy single-file app)

Audited file: [`legacy/Diabetes_risk_model.html`](legacy/Diabetes_risk_model.html) (96,553 bytes, 1,070 lines), copied unchanged from the original upload.
Line numbers below refer to that file.

---

## 1. Architecture

| Layer | Where | Notes |
|---|---|---|
| Styles | `<style>` L11–292 (~280 lines) | Hand-rolled tokens on `:root` (greyscale + green/red), Poppins from Google Fonts (L8–10, render-blocking stylesheet). Light mode only. |
| Markup | L294–877 | Nav → Hero (with performance stats) → How it works → **Assessment** (3 tabs + 3 level cards + 3 panels, each a full copy of its own gauge/drivers/recs markup) → "ML Architecture" model comparison → FAQ → Docs → Footer. |
| Behaviour | `<script>` L879–1069 (~190 lines) | Globals only. All DOM access via `document.getElementById` by string id (`s{level}-{name}` for inputs, `v{level}-{name}` for value badges). Inline `onclick`/`oninput` handlers on ~40 elements. |
| Model | `MODELS` L897–901 | Three hand-set logistic regressions, one per level. |
| Network | `getRecommendations` L994–1010 | One `fetch` to `https://api.anthropic.com/v1/messages` per click. No other network except Google Fonts. |
| State | none | Values live only in DOM controls; nothing persisted; no URL state. |

Data flow (per level): **user clicks "Analyse"** → `runAnalysis(level)` → `getF{level}()` reads DOM → `scoreModel()` → `renderGauge()` + `renderDrivers()` → ad-hoc sub-scores written to `ss-*` → `await getRecommendations()` → button restored. Nothing updates while sliders move except the numeric badge (`setv`).

---

## 2. Function-by-function review

### `setv(id, val, dec)` — L880
Writes a slider value to its badge with fixed decimals. Fine, but it is the *only* live feedback in the app.

### `switchLevel(n)` — L882–888
Toggles `.visible` on panels and `.active` on tab buttons / level cards. No `role="tablist"`/`tab`/`tabpanel`, no `aria-selected`, no arrow-key handling. Level cards are `<div onclick>` — not focusable, not keyboard-operable.

### `toggleFaq(el)` — L890–895
Accordion on `<div class="faq-q" onclick>` — not focusable, no `aria-expanded`, no `aria-controls`. `max-height:300px` (L210) can clip long answers.

### `MODELS` — L897–901
Hand-written coefficients and intercepts. **There is no training code, data, or validation artefact anywhere** — yet the UI calls them an ensemble's "pre-fitted coefficients that reproduce the ensemble's probability surface with <2% absolute deviation" (L736). See defect C1.

### `getF1()` — L905–922
- Computes BMI from height/weight (good), waist excess vs 80 F / 90 M (Asian cut-offs, good).
- **Reads no `s1-sleepq`** — the Sleep Quality select (L417) is collected but ignored. (D-H4)
- `gender === 'other'` silently gets the male waist threshold (90 cm).
- `steps_deficit = max(0, 7500 − steps)/1000` with coef `0.0018` ⇒ the *maximum* possible steps effect is 7 × 0.0018 = **0.0126 log-odds** — steps are effectively inert. Looks like a units slip (coef was presumably meant per 1000 steps ≈ 0.06–0.18). (D-H5)
- `stress − 1`, `diet − 1` re-base ordinals; `exercise`, `smoke`, `alcohol` used raw.

### `getF2()` — L923–936
- `fasting_g = glucose − 70`, `hba1c = hba1c − 4`, `sbp_excess = max(0, sbp − 120)`.
- **Collected but unused:** random glucose (L479), diastolic BP (L482). Gender is only used for the waist threshold.
- `preg` is applied regardless of gender — a male with "3 pregnancies" gets +0.27 log-odds. (D-M)

### `getF3()` — L937–956
- `homa_ir = glucose × insulin / 405` — correct formula for mg/dL & µU/mL, but it is entered **in addition to** linear glucose and HbA1c terms, double-counting glycaemia.
- `ast_alt_ratio = max(0, AST/ALT − 1)` — labelled "liver stress"; docs (L714) claim "AST:ALT > 1.3 suggests hepatic steatosis (NAFLD)". That is not accurate: in NAFLD ALT typically exceeds AST; an AST/ALT ratio > ~1 is associated with *advanced fibrosis*, and is better used inside FIB-4. (D-H6, flagged for human clinical review)
- `ckd_factor = max(0, (1 − eGFR/90)·3 + (creat − 0.9)·0.8)` — invented composite. **eGFR and creatinine are independent sliders** although eGFR is derived from creatinine, age and sex (CKD-EPI 2021); impossible combinations (creat 4.5 mg/dL & eGFR 120) are accepted silently.
- **Collected but unused:** LDL-C (L547), total cholesterol (L549).
- Level 3 drops family history and physical activity — two of the strongest Level-1 predictors disappear at the "most comprehensive" level.

### `scoreModel(level, features)` — L958–962
`sigmoid(intercept + Σ coef·x)`. Mechanically fine. No input validation (NaN propagates to "NaN%").

### `renderGauge(level, prob)` — L966–978
- Sets dash offset and colour; transition via inline CSS (no `prefers-reduced-motion` handling).
- Risk communicated by colour + chip text (chip text is good), but the big number colour `#e5e5e5`/green/amber/red is the only gauge cue.
- Bands 25/50/75 % are arbitrary and undocumented in any source.

### `renderDrivers(level, features)` — L980–992
- **Contribution is `coef × feature`, not `coef × (feature − baseline)`** — contradicting the documentation at L794 ("coefficient_i × (feature_value_i − population_mean_i)"). Consequences (computed):
  - A 25-year-old, BMI 20, ideal lifestyle → top "risk driver" is **BMI +1.64** and **Age +0.78** "pushing risk up". Nonsensical for the user.
  - Level 1 defaults → BMI +2.04, Age +1.08 dominate regardless of what the user changes.
- Builds HTML with `innerHTML +=` in a loop (re-parses each iteration).
- Bar normalised to ±2.5 log-odds, clipped silently.

### `getRecommendations(level, prob, features)` — L994–1010
- **Calls `https://api.anthropic.com/v1/messages` from the browser with no API key and no `anthropic-version` header.** Works only inside a Claude artifact preview sandbox that proxies the call; on any real host it fails (401 / CORS). Shipping a key to the browser would leak it. (C2)
- Sends **transformed** features (e.g. `HbA1c: 1.60`, `Fasting glucose: 25.00` — these are `value − 4` and `value − 70`), so the LLM is told HbA1c is 1.6 %. Recommendations "referencing your actual values" are therefore wrong. (D-H7)
- Parses with `JSON.parse(text.replace(/```json|```/g,''))` — no schema validation; any shape is accepted.
- **Injects `r.title`, `r.detail` and `r.priority` into `innerHTML`** — XSS sink (`priority` even lands inside a `class` attribute). (C3)
- No timeout, no cancellation, no streaming; button stays disabled for the full round trip.
- Fallback is an apology, not guidance.

### `runAnalysis(level)` — L1012–1042
- Only entry point for scoring ⇒ **results update only on click.** (H)
- `btn.textContent = 'Analysing…'` destroys the SVG; restored later via `innerHTML` with inline styles.
- Level 2 "sub-scores" (L1019–1025) are **fabricated formulas**, not model outputs:
  - `ss-prediab = prob·0.6 + (hba1c>5.7 ? .25 : 0) + (glucose>100 ? .15 : 0)` (also uses `>` where ADA uses `≥ 5.7` / `≥ 100`).
  - `ss-ir = prob·0.55 + (hba1c>5.7 ? .2 : 0)` — "insulin resistance %" from HbA1c alone.
  - `ss-conf = 82 + prob·10` — **"confidence" that rises with risk**; meaningless.
- Level 3 "sub-risk panels" (L1026–1037) are likewise fabricated:
  - `ss-cvd = prob·50 + 8·[TG>150] + 6·[HDL<40]` "%".
  - `ss-nafld = (AST/ALT>1.3 ? 30 : 10) + prob·20` "%".
  - `ss-ckd = (90 − eGFR)/90 · 60` "%".
  - `ss-mets` counts **`prob > 0.3` as a metabolic-syndrome criterion** and reports "/3"; the real harmonised definition has 5 criteria (waist, TG ≥150, HDL <40 M/<50 F, BP ≥130/85, FPG ≥100). HDL threshold ignores sex.
- `scrollIntoView` on mobile after await — jumps the page late.

### `resetLevel(level)` — L1044–1060
- Resets **only range sliders**; all `<select>`s (gender, family history, exercise, stress, diet, smoking, alcohol, pregnancies, activity) keep their values. (D-M)
- Decimals derived from `el.step.includes('.')` — OK.
- Clears results back to placeholders.

### Docs-nav scroll handler — L1063–1068
`querySelectorAll` on every scroll event; minor, should be an `IntersectionObserver`.

---

## 3. Model behaviour (measured)

Evaluated the legacy `MODELS` in Node at the shipped defaults:

| Scenario | Legacy output | Problem |
|---|---|---|
| L1 defaults (35 y, M, BMI 24.9, waist 88, 1–2 d/wk exercise) | **31.1 %** | High for a near-normal-BMI 35-year-old; no time horizon stated. |
| L1 "ideal" (25 y, BMI 20, 5+ d/wk exercise, excellent diet) | 7.2 %, top drivers **BMI +1.64, Age +0.78** | Drivers not baseline-centred (see `renderDrivers`). |
| L1 worst case | 100.0 % | Saturates; "100.0 %" is never a defensible output. |
| L2 defaults (45 y, BMI 27.5, FPG 95, HbA1c 5.6) | **6.7 %** | L1 → L2 for a *riskier* person drops risk 31 % → 7 %: levels are not mutually calibrated. |
| L2, HbA1c 7.0 % & FPG 140 (both ≥ ADA diabetes thresholds) | **40.7 % "Moderate"** | Values already in the diagnostic range are shown as moderate *risk*; no prompt to confirm with a clinician. |
| L3 defaults | 11.0 % | HOMA-IR 2.96 (above typical cut-offs) contributes only +0.53. |

---

## 4. Defects ranked by severity

### Critical — must fix before any public deployment
| ID | Defect | Evidence |
|---|---|---|
| **C1** | **Fabricated performance and provenance claims.** "91.2 % accuracy", "ROC-AUC 0.941/0.953", F1 0.892, sensitivity 89.4 %, an XGBoost/LightGBM/CatBoost comparison table with hyper-parameters, SMOTE, Optuna, "trained on NHANES, UK Biobank, DPP… over 150,000 patients", "<2 % absolute deviation". No model, data, training code or validation exists; the coefficients are hand-set. | L320–326, L441–447, L502–505, L594–627, L637, L673–674, L720–742, L845, L871 |
| **C2** | Browser calls `api.anthropic.com` without a key → fails in production; the only "fix" (key in client) would leak the key. | L1002 |
| **C3** | LLM output injected via `innerHTML` (title, detail, and `priority` into a class attribute) → XSS. | L1006 |
| **C4** | **Fabricated clinical sub-scores** displayed as percentages: prediabetes %, insulin-resistance %, "confidence" %, CVD %, NAFLD %, CKD %, and a MetS count that includes the model's own probability as a "criterion". | L1019–1037 |
| **C5** | **Unsafe framing at diagnostic values.** HbA1c ≥ 6.5 % or FPG ≥ 126 mg/dL yields "Moderate risk"; no urgent-care notice for very high glucose or eGFR < 30. | L966–978, measured §3 |
| **C6** | **Contradictory privacy claims.** "100 % Private, no data sent" / "No data is transmitted to any server" while the app posts health metrics to a third-party API; Google Fonts also receives every visitor's IP. | L326, L335, L635, L674, L845 vs L1002, L8–10 |

### High
| ID | Defect | Evidence |
|---|---|---|
| H1 | Driver attribution is `coef × x`, not `coef × (x − baseline)` as documented; drivers are misleading. | L982 vs L794 |
| H2 | No live/realtime feedback; results only on click. | L1012 |
| H3 | LLM receives transformed values (HbA1c "1.60", FPG "25.00") and is told to "reference actual values". | L999 |
| H4 | Inputs collected but ignored: L1 sleep quality; L2 random glucose, DBP; L3 LDL, total cholesterol. | L417, L479, L482, L547, L549 |
| H5 | Steps coefficient makes steps inert (max 0.0126 log-odds). | L898, L921 |
| H6 | Liver interpretation inverted/overstated (AST:ALT > 1.3 ⇒ "steatosis"). Needs clinical review; use FIB-4 instead. | L714, L758, L1033 |
| H7 | eGFR and creatinine independent; impossible combinations accepted; eGFR unit missing "/1.73 m²". | L559–560 |
| H8 | Accessibility: no `<label for>` association on any control (labels wrap a value badge, not the input); div-based tabs/cards/FAQ not keyboard operable; no `aria-live`; risk conveyed partly by colour; low-contrast text (`rgba(255,255,255,.25–.35)` on black ≈ 2–3:1); 15 px slider thumbs below the 24 px target size (WCAG 2.5.8). | throughout |
| H9 | Levels not mutually consistent (L1 31 % vs L2 7 % for a riskier profile). | §3 |
| H10 | Docs threshold table mixes Asian and Western cut-offs (e.g. "Waist (Male, Asian) ≥ 102 cm = high", "BMI Asian ≥ 27.5 = high") and invents bands (HDL "35–39 borderline", HOMA-IR "< 1.5 normal" cited to "Consensus (varied)"). | L774–787 |

### Medium
| ID | Defect | Evidence |
|---|---|---|
| M1 | No validation; NaN/out-of-range never caught; no plausibility cross-checks. | `getF*` |
| M2 | No unit support (mg/dL only, kg/cm only). | inputs |
| M3 | `resetLevel` doesn't reset `<select>`s. | L1044–1060 |
| M4 | Pregnancies applied to males; gender "other" mapped to male thresholds silently. | L920, L931 |
| M5 | Arbitrary 25/50/75 % bands; "100.0 %" possible; no time horizon on the probability. | L969, §3 |
| M6 | FAQ claims "in a group of 100 people with similar profiles, approximately 35 were diagnosed in the dataset" — false for an uncalibrated model. | L636 |
| M7 | Inline handlers and inline styles prevent a strict CSP. `target="_blank"` links lack `rel="noopener noreferrer"`. | throughout, L821, L828, L862–865 |
| M8 | Render-blocking Google Fonts stylesheet; no font fallback metrics → CLS on swap. | L8–10 |
| M9 | No persistence, no shareable state, no print view. | — |
| M10 | Mobile footer override `footer{padding:0 18px}` removes vertical padding. | L277 |

### Low
| ID | Defect | Evidence |
|---|---|---|
| L1 | Scroll handler re-queries DOM each scroll. | L1064 |
| L2 | Three copies of result-card markup; duplicated ids pattern. | L430–591 |
| L3 | No dark mode, manifest, favicon, OG tags, offline support. | `<head>` |
| L4 | "Peer-reviewed", "Open source" badges and "Built on peer-reviewed research" unverified. | L845, L871–873 |
| L5 | `© 2024` stale. | L869 |

---

## 5. Citations in the legacy file — verification status

| Reference (L821–830) | Status |
|---|---|
| ADA Standards of Care 2023, doi:10.2337/dc23-S002 | Real (Classification & Diagnosis chapter). Will update to the current Standards and re-check thresholds. |
| WHO Expert Consultation, Lancet 2004;363:157–163 (Asian BMI) | Real. |
| DPP Research Group, NEJM 2002;346:393–403 | Real (58 % reduction claim is from this trial). |
| Willi C et al., JAMA 2007;298:2654–2664 (smoking, RR ≈ 1.44) | Real. |
| Lundberg & Lee, NeurIPS 2017 (SHAP) | Real. |
| Sudlow C et al., PLoS Med 2015 (UK Biobank) | Real paper — but **the claim that this app was trained on UK Biobank is unsupported** (UK Biobank requires an approved application). |
| KDIGO 2022 Diabetes in CKD, Kidney Int 2022;102(5S):S1–S127 | Real. |
| IDF Diabetes Atlas 10th ed. | Real (2021); "2023" year label is off. |
| Reddy A., IJSRED Vol 5 Issue 5 (2022) | **TODO (human review):** I cannot verify the paper's content from here. The FAQ says it was trained on Pima (N = 768) — that is a different model from anything in this file. Keep only as "author's prior work", not as validation of this tool. |
| In-table claims: "each 1000 steps ≈ 6 % lower risk (NHANES)", "whole-food diets reduce risk 20–30 % (NHS2, PREDIMED)", "heritability 40–70 %" | **Unsourced — TODO.** Remove or replace with a checked citation. |

---

## 6. What's worth keeping

- The three-level progression (no labs → basic labs → full panel) is a good product structure.
- Asian waist cut-offs (80 F / 90 M) and the explicit "not a diagnostic tool" intent.
- Clean black/white/Poppins identity, card system, gauge concept.
- Lifestyle inputs at Level 1 and the breadth of the Level 3 panel (these map directly onto FINDRISC/IDRS, ADA categories, harmonised MetS, HOMA-IR, FIB-4, KDIGO).

See [PLAN.md](PLAN.md) for the proposed fix plan.
