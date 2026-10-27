// Optional, consent-based submission of a visitor's entries to the site owner via Formspree.
// Never sent automatically: only when the visitor ticks the consent box and presses Send.
import { levelFields } from './fields.js';
import { round } from './units.js';

export const FORMSPREE_URL = import.meta.env?.VITE_FORMSPREE_URL || 'https://formspree.io/f/xvznwvnq';

const clip = (s, n) => String(s ?? '').trim().slice(0, n);

/** Flat key/value payload (Formspree shows flat fields best). `R` is the result from compute(). */
export function buildSharePayload({ name, email, state, R, aiShown, consent }) {
  const payload = {
    _subject: `DiabetesRisk Level ${state.level} submission`,
    name: clip(name, 120),
    email: clip(email, 200),
    consent: consent ? 'yes' : 'no',
    level: state.level,
    cutoffs: state.cut,
    result_headline: `${R.gauge.value} ${R.gauge.suf} (${R.gauge.lbl})`,
    result_band: R.band.label,
    ai_guidance_viewed: aiShown ? 'yes' : 'no',
    submitted_at: new Date().toISOString(),
  };
  if (R.ada) payload.ada_glucose_category = R.ada.cat;
  if (R.urgent?.length) payload.urgent_flags = R.urgent.length;
  for (const id of levelFields(state.level)) {
    const v = state.v[id];
    payload[`input_${id}`] = typeof v === 'number' ? round(v, 3) : v;
  }
  return payload;
}

/** Resolves { ok, message }. Honeypot (`_gotcha`) is passed through so Formspree can drop bots. */
export async function sendShare(payload, honeypot = '') {
  try {
    const res = await fetch(FORMSPREE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...payload, _gotcha: honeypot }),
    });
    if (res.ok) return { ok: true };
    let msg = '';
    try { msg = (await res.json()).errors?.map((e) => e.message).join(' ') || ''; } catch { /* not json */ }
    return { ok: false, message: msg || `The form service answered ${res.status}.` };
  } catch {
    return { ok: false, message: 'Could not reach the form service. Check your connection and try again.' };
  }
}
