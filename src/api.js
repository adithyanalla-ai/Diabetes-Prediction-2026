// Client for POST /api/recommend (SSE). Never talks to Anthropic directly.
import { levelFields } from './fields.js';
import { round } from './units.js';

export function buildPayload(state) {
  const v = {};
  for (const id of levelFields(state.level)) v[id] = typeof state.v[id] === 'number' ? round(state.v[id], 3) : state.v[id];
  return { level: state.level, cut: state.cut, v };
}

export function parseSse(chunkText, carry = '') {
  const text = carry + chunkText;
  const parts = text.split('\n\n');
  const rest = parts.pop();
  const events = [];
  for (const p of parts) {
    const ev = p.match(/^event: (.*)$/m)?.[1];
    const data = p.match(/^data: (.*)$/m)?.[1];
    if (!ev || data === undefined) continue;
    try { events.push({ event: ev, data: JSON.parse(data) }); } catch { /* skip malformed */ }
  }
  return { events, rest };
}

/**
 * Resolves with 'done' on success, or 'fallback' when the app should show the rule-based plan
 * (no key, rate limit, upstream error, network failure). Rejects only on abort.
 */
export async function streamGuidance(payload, on, signal) {
  let res;
  try {
    res = await fetch('/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return { status: 'fallback', reason: 'network' };
  }
  if (!res.ok || !res.body) {
    let body = {};
    try { body = await res.json(); } catch { /* not json */ }
    return { status: 'fallback', reason: body.error || `http_${res.status}`, retryAfter: body.retryAfter };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let carry = '';
  let got = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const { events, rest } = parseSse(dec.decode(value, { stream: true }), carry);
      carry = rest;
      for (const { event, data } of events) {
        if (event === 'error') return { status: got ? 'partial' : 'fallback', reason: 'ai_error' };
        if (event === 'done') return { status: 'done' };
        got = true;
        on(event, data);
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return { status: got ? 'partial' : 'fallback', reason: 'stream' };
  }
  return { status: got ? 'partial' : 'fallback', reason: 'closed' };
}
