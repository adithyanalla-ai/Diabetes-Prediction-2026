# DiabetesRisk

Live diabetes-risk screening in three levels, with personalised guidance written by Claude from the user's own numbers.

- **Level 1 (no labs):** FINDRISC and IDRS questionnaires with their published bands.
- **Levels 2–3 (labs):** ADA glucose category, metabolic-syndrome criteria, HOMA-IR, FIB-4, CKD-EPI 2021 eGFR, plus a clearly labelled *illustrative* index that drives the live driver bars.
- Results update as you type; what-if deltas; unit toggles; shareable link; print view; light/dark.
- **AI guidance:** `POST /api/recommend` streams a structured plan. The browser never talks to Anthropic and never sees the key.

> Not a diagnostic tool. See the in-app Methods section for what each number is and isn't.

## Run

```bash
npm install
cp .env.example .env        # put your ANTHROPIC_API_KEY in .env
npm run dev                 # app + /api/recommend on http://localhost:5173
npm test                    # model + server tests (Vitest)
npm run build               # production build, fails if JS > 60 KB gzip
```

Without a key the API answers 503 and the app shows its rule-based action plan.

## Collecting responses (optional, consent-based)

Visitors can tick a consent box and press *Send my results* to submit an optional name/email, their entries for the current level and their result to Formspree (`src/share.js`). Nothing is sent without that action. Set `VITE_FORMSPREE_URL` to use a different form.

## How the AI part works

1. The browser sends only enums and numbers for the current level (strict zod schema, unknown keys rejected, 4 KB cap).
2. The server **recomputes every score itself** (`src/model.js`) and gives Claude those results, so the model can't be handed fabricated scores. No user text ever reaches the prompt.
3. Claude (`claude-opus-5-5`, override with `ANTHROPIC_MODEL`) returns JSON constrained by a schema. The server parses the stream incrementally, validates each item, and forwards it as SSE; the browser renders with `textContent` only.
4. Safety rules live in the system prompt (no diagnosis, no medicines/doses, urgent flags first). Server-side fallback (`fallbacks: "default"`) is enabled.
5. Errors, refusals, rate limits (6/min/IP) and missing key all fall back to the rule-based plan.

## Deploy (Vercel)

Import the repo, set `ANTHROPIC_API_KEY` (and optionally `ALLOWED_ORIGIN`, Upstash vars for a shared rate limit). `vercel.json` sets a strict CSP and security headers (no `unsafe-inline`). The in-memory limiter is per warm instance; use Upstash for a hard global limit.

## Layout

`src/` model, units, fields, guidance, UI · `server/` handler, schema, prompt, stream parser, rate limit · `api/recommend.js` Vercel entry · `tests/` · `legacy/` original single-file app · `AUDIT.md`, `PLAN.md` history.
