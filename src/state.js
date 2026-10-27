import { F, DEF, sanitize } from './fields.js';
import { DIMS, round } from './units.js';

const KEY = 'dr-v1';
export const state = { level: 1, v: { ...DEF }, units: {}, cut: 'asian', theme: 'system' };

function applyShared(o) {
  if (!o || typeof o !== 'object') return;
  if ([1, 2, 3].includes(o.level)) state.level = o.level;
  if (o.cut === 'asian' || o.cut === 'general') state.cut = o.cut;
  if (o.v && typeof o.v === 'object') for (const k in F) { const s = sanitize(k, o.v[k]); if (s !== undefined) state.v[k] = s; }
}

const b64u = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export function loadState() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* ignore */ }
  if (saved && typeof saved === 'object') {
    if (saved.units && typeof saved.units === 'object') for (const d in DIMS) if (saved.units[d] === 0 || saved.units[d] === 1) state.units[d] = saved.units[d];
    if (['system', 'light', 'dark'].includes(saved.theme)) state.theme = saved.theme;
    applyShared(saved);
  }
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]{1,2000})$/);
  if (m) { try { applyShared(JSON.parse(unb64u(m[1]))); } catch { /* ignore bad link */ } }
}

export function shareHash() {
  const v = {};
  for (const k in F) if (state.v[k] !== DEF[k]) v[k] = typeof state.v[k] === 'number' ? round(state.v[k], 3) : state.v[k];
  return '#s=' + b64u(JSON.stringify({ level: state.level, cut: state.cut, v }));
}

let saveT = 0;
export function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
    try { history.replaceState(null, '', shareHash()); } catch { /* sandboxed */ }
  }, 250);
}
