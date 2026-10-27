import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-800.css';
import './styles.css';
import { F, DEF, LEVELS, levelFields } from './fields.js';
import { DIMS, DIM_DEC, round } from './units.js';
import { compute, bmiCat, waistCut, FBANDS, findBand, ADA_BAND, kdigo, bpCat, fib4Low } from './model.js';
import { actionPlan } from './guidance.js';
import { state, loadState, persist, shareHash } from './state.js';
import { buildPayload, streamGuidance } from './api.js';
import { buildSharePayload, sendShare } from './share.js';

const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v); // CSSOM, so a strict CSP (no inline styles) still works
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtNum = (x, d) => round(x, d).toFixed(d);

/* ---------- units ---------- */
const ID = (x) => x;
function unitOf(id) {
  const f = F[id];
  if (!f.dim) return { u: f.unit || '', to: ID, from: ID, dec: f.dec, step: f.step };
  const i = state.units[f.dim] || 0;
  return i === 0 ? { ...DIMS[f.dim][0], to: ID, from: ID, dec: f.dec, step: f.step } : DIMS[f.dim][i];
}
function dimUnit(dim) {
  const i = state.units[dim] || 0;
  return i === 0 ? { u: DIMS[dim][0].u, to: ID, dec: DIM_DEC[dim] } : DIMS[dim][i];
}
const ftIn = (cm) => { const t = Math.round(cm / 2.54); return `${Math.floor(t / 12)}′ ${t % 12}″`; };
function fmtDim(dim, canon) {
  const u = dimUnit(dim);
  if (dim === 'height' && u.u === 'in') return ftIn(canon);
  return fmtNum(u.to(canon), u.dec) + ' ' + u.u;
}
const uiFmt = {
  glucose: (x) => fmtDim('glucose', x), hba1c: (x) => fmtDim('hba1c', x), weight: (x) => fmtDim('weight', x),
  length: (x) => fmtDim('length', x), chol: (x) => fmtDim('chol', x), tg: (x) => fmtDim('tg', x),
};

/* ---------- inputs ---------- */
const form = $('#inputs');
form.addEventListener('submit', (e) => e.preventDefault());
function buildInputs() {
  const groups = LEVELS[state.level].map(([title, ids, note]) => h('section', { class: 'card group', 'aria-label': title },
    h('h2', null, title, note ? h('span', { class: 'muted' }, ` · ${note}`) : null),
    h('div', { class: 'fields' }, ids.map(buildField))));
  form.replaceChildren(...groups);
}
function buildField(id) {
  const f = F[id];
  const inId = 'in-' + id;
  const wrap = h('div', { class: 'field', 'data-field': id });
  if (f.type === 'select') {
    const sel = h('select', { id: inId, 'data-id': id }, f.opts.map(([val, lab]) => h('option', { value: val }, lab)));
    sel.value = state.v[id];
    wrap.append(h('label', { class: 'flabel', for: inId }, f.label), sel);
    return wrap;
  }
  const u = unitOf(id);
  const head = h('div', { class: 'fhead' }, h('label', { class: 'flabel', for: inId }, f.label));
  if (f.dim) {
    head.append(h('span', { class: 'seg', role: 'group', 'aria-label': `${f.label} units` },
      DIMS[f.dim].map((d, i) => h('button', { type: 'button', 'data-dim': f.dim, 'data-ui': i, 'aria-pressed': String((state.units[f.dim] || 0) === i) }, d.btn || d.u))));
  }
  const lo = Math.ceil(u.to(f.min) * 10 ** u.dec) / 10 ** u.dec;
  const hi = Math.floor(u.to(f.max) * 10 ** u.dec) / 10 ** u.dec;
  const disp = fmtNum(u.to(state.v[id]), u.dec);
  const num = h('input', { type: 'number', id: inId, 'data-id': id, 'data-role': 'num', inputmode: 'decimal', min: lo, max: hi, step: u.step, value: disp, 'aria-describedby': 'msg-' + id });
  const range = h('input', { type: 'range', 'data-id': id, 'data-role': 'range', min: lo, max: hi, step: u.step, value: disp, 'aria-label': `${f.label} slider`, 'aria-valuetext': `${disp} ${u.u}` });
  const row = h('div', { class: 'frow' }, num, h('span', { class: 'unit' }, u.u));
  if (f.dim === 'height' && u.u === 'in') row.append(h('span', { class: 'readout', id: 'ro-height' }, '= ' + ftIn(state.v.height)));
  if (id === 'weight' || id === 'height') row.append(h('span', { class: 'readout', 'data-bmi': '1' }, ''));
  wrap.append(head, row, range, h('p', { class: 'fmsg', id: 'msg-' + id }));
  return wrap;
}
function rangeMsg(id) {
  const f = F[id];
  const u = unitOf(id);
  return `Enter ${f.label.toLowerCase()} between ${fmtNum(u.to(f.min), u.dec)} and ${fmtNum(u.to(f.max), u.dec)} ${u.u}.`;
}
form.addEventListener('input', (e) => {
  const t = e.target;
  const id = t.dataset.id;
  if (!id) return;
  const f = F[id];
  if (f.type === 'select') { state.v[id] = t.value; return changed(); }
  const u = unitOf(id);
  const wrap = t.closest('.field');
  const msg = $('#msg-' + id);
  const num = wrap.querySelector('[data-role=num]');
  const range = wrap.querySelector('[data-role=range]');
  const d = parseFloat(t.value);
  const canon = Number.isFinite(d) ? u.from(d) : NaN;
  const bad = !(canon >= f.min - 1e-6 && canon <= f.max + 1e-6);
  if (t.dataset.role === 'num') {
    num.setAttribute('aria-invalid', String(bad));
    wrap.classList.toggle('invalid', bad);
    msg.textContent = bad ? (t.value.trim() === '' ? `Enter a value for ${f.label.toLowerCase()}.` : rangeMsg(id)) : '';
    if (bad) return;
    range.value = t.value;
  } else {
    num.value = fmtNum(d, u.dec);
    num.setAttribute('aria-invalid', 'false');
    wrap.classList.remove('invalid');
    msg.textContent = '';
  }
  range.setAttribute('aria-valuetext', `${fmtNum(d, u.dec)} ${u.u}`);
  state.v[id] = Math.min(f.max, Math.max(f.min, canon));
  const ro = $('#ro-height');
  if (id === 'height' && ro) ro.textContent = '= ' + ftIn(state.v.height);
  changed();
});
form.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-dim]');
  if (!b) return;
  state.units[b.dataset.dim] = Number(b.dataset.ui);
  const focusId = b.closest('.field').dataset.field;
  buildInputs();
  changed();
  form.querySelector(`.field[data-field="${focusId}"] button[data-ui="${b.dataset.ui}"]`)?.focus();
});

/* ---------- render ---------- */
let pending = 0;
function changed() {
  persist();
  markAiStale();
  clearTimeout(pending);
  pending = setTimeout(() => requestAnimationFrame(render), 80);
}

const TONE = { good: 'var(--g-good)', neutral: 'var(--g-neutral)', warn: 'var(--g-warn)', bad: 'var(--g-bad)' };
let gCur = 0;
let gMax = 26;
let gAnim = 0;
let gKind = 0;
function paintGauge(val) {
  $('#g-fill').setAttribute('stroke-dashoffset', String(100 - (val / gMax) * 100));
  $('#g-num').textContent = String(Math.round(val));
}
function tweenGauge(target) {
  cancelAnimationFrame(gAnim);
  const start = gCur;
  const t0 = performance.now();
  const dur = reduceMotion() ? 0 : 480;
  const step = (now) => {
    const k = dur ? Math.min(1, (now - t0) / dur) : 1;
    const e = 1 - (1 - k) ** 3;
    gCur = start + (target - start) * e;
    paintGauge(gCur);
    if (k < 1) gAnim = requestAnimationFrame(step);
  };
  gAnim = requestAnimationFrame(step);
}
function tile(lbl, val, st, stTxt, note) {
  const icon = { ok: '✓', warn: '▲', bad: '‼', info: 'i' }[st];
  return h('div', { class: 'tile' }, h('div', { class: 't-lbl' }, lbl), h('div', { class: 't-val' }, val),
    h('div', { class: 't-st', 'data-s': st }, h('span', { 'aria-hidden': 'true' }, icon), stTxt), note ? h('div', { class: 't-note' }, note) : null);
}
function driverRow(label, valText, cls, bar) {
  return h('div', { class: 'drv' }, h('div', { class: 'drv-row' }, h('span', null, label), h('span', { class: `drv-val ${cls}` }, valText)), bar);
}

let lastR = null;
function render() {
  const v = state.v;
  const L = state.level;
  const hbStep = dimUnit('hba1c').u === '%' ? '0.5%' : '5.5 mmol/mol';
  const R = compute(v, L, state.cut, uiFmt);
  if (hbStep !== '0.5%') for (const w of R.what) w.label = w.label.replace('0.5%', hbStep);
  R.plan = actionPlan(L, v, R, uiFmt);
  lastR = R;

  if (gKind !== L) { gKind = L; gCur = 0; }
  gMax = R.gauge.max;
  $('#g-fill').style.stroke = TONE[R.band.tone];
  tweenGauge(R.gauge.value);
  $('#g-suf').textContent = R.gauge.suf;
  $('#g-lbl').textContent = R.gauge.lbl;
  const chip = $('#chip');
  chip.dataset.tone = R.band.tone;
  $('#chip-ic').textContent = R.band.icon;
  $('#chip-tx').textContent = L === 1 ? `${R.band.label} · ${R.band.risk} over 10 yrs` : R.band.label;
  $('#rc-sub').textContent = R.sub;

  const segs = L === 1
    ? FBANDS.map((b, i) => ({ lbl: b.label, on: b === R.band, tone: b.tone, range: `${i ? FBANDS[i - 1].max + 1 : 0}–${b.max}` }))
    : ['normal', 'pre', 'dm'].map((k) => ({ lbl: { normal: 'Below prediabetes', pre: 'Prediabetes range', dm: 'Diabetes range' }[k], on: R.ada.cat === k, tone: ADA_BAND[k].tone }));
  $('#strip').replaceChildren(
    h('div', { class: 'strip-bar', 'aria-hidden': 'true' }, segs.map((s) => h('span', { class: 'strip-seg' + (s.on ? ' on' : ''), style: { color: TONE[s.tone] } }))),
    h('div', { class: 'strip-lbls' }, segs.map((s) => h('span', { class: s.on ? 'on' : '' }, s.lbl, s.range ? h('br') : null, s.range || null, s.on ? h('span', { class: 'sr-only' }, ' (your band)') : null))),
    h('div', { class: 'strip-cap' }, L === 1 ? 'FINDRISC score bands (points)' : 'ADA glucose categories'));

  const dv = $('#drivers');
  if (L === 1) {
    $('#drv-h').textContent = 'What drives your FINDRISC score';
    const grp = (mod) => R.f.items.filter((i) => i.mod === mod).sort((a, b) => b.pts - a.pts || b.max - a.max).map((i) =>
      driverRow(i.label, i.pts ? `+${i.pts} pts` : '0 pts', i.pts ? 'up' : 'zero', h('div', { class: 'bar' }, h('i', { style: { width: `${(i.pts / 5) * 100}%` } }))));
    dv.replaceChildren(h('h4', null, 'Things you can change'), ...grp(true), h('h4', null, "Things you can't change"), ...grp(false),
      h('p', { class: 'drv-note' }, `IDRS (Indian score): ${R.i.total} / 100 · ${R.i.band.label}. Bar length = points out of 5.`));
  } else {
    $('#drv-h').textContent = 'What drives the index';
    const grp = (mod) => R.m.contribs.filter((c) => c.mod === mod).sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).map((c) => {
      const z = Math.abs(c.c) < 0.02;
      const up = c.c > 0;
      const w = Math.min(50, (Math.abs(c.c) / 2) * 50);
      return driverRow(c.label, z ? '≈ 0' : `${up ? '▲ +' : '▼ −'}${fmtNum(Math.abs(c.c), 2)}`, z ? 'zero' : up ? 'up' : 'dn',
        h('div', { class: 'bar div' }, h('i', { class: up ? 'up' : 'dn', style: { left: `${up ? 50 : 50 - w}%`, width: `${z ? 0 : w}%` } })));
    });
    dv.replaceChildren(h('h4', null, 'Things you can change'), ...grp(true), h('h4', null, "Things you can't change"), ...grp(false),
      h('p', { class: 'drv-note' }, '▲ raises / ▼ lowers the index compared with the reference person (log-odds, illustrative). See Methods.'));
  }

  const unit = L === 1 ? ' pts' : '';
  const wi = R.what.map((w) => {
    const better = w.after < w.before;
    const det = L === 1
      ? (better ? `${findBand(w.before).risk} → ${findBand(w.after).risk} over 10 years` : 'Not enough to cross the next scoring threshold')
      : (better ? '' : w.before >= 99 ? "The index is at its 99 ceiling, so single changes don't show. Your glucose category matters more here." : 'No change at this step');
    return h('div', { class: 'wi' }, h('b', null, w.label), h('span', { class: 'res ' + (better ? 'better' : 'same') }, better ? `${w.before} → ${w.after}${unit}` : 'no change'), det ? h('span', { class: 'det' }, det) : null);
  });
  $('#whatif').replaceChildren(...(wi.length ? wi : [h('p', { class: 'wi' }, 'Your modifiable factors are already at or near the reference values.')]));

  const T = [];
  const bc = bmiCat(R.bmi, state.cut);
  T.push(tile('BMI', fmtNum(R.bmi, 1), bc.s, bc.label, `${state.cut === 'asian' ? 'Asian' : 'General'} cut-offs`));
  const wc = waistCut(v.sex, state.cut);
  if (L === 1) {
    T.push(tile('Waist', fmtDim('length', v.waist), v.waist >= wc ? 'warn' : 'ok', v.waist >= wc ? 'Above cut-off' : 'Below cut-off', `Cut-off ${fmtDim('length', wc)}`));
    T.push(tile('IDRS', `${R.i.total} / 100`, R.i.band.s, R.i.band.label, '< 30 low · 30–50 moderate · ≥ 60 high'));
  } else {
    T.push(tile('Glucose category', R.ada.cat === 'normal' ? 'Normal' : R.ada.cat === 'pre' ? 'Prediabetes range' : 'Diabetes range', R.ada.cat === 'normal' ? 'ok' : R.ada.cat === 'pre' ? 'warn' : 'bad', R.ada.by.length ? 'by ' + R.ada.by.join(' & ') : 'ADA criteria', `HbA1c ${fmtDim('hba1c', v.hba1c)} · FPG ${fmtDim('glucose', v.fpg)}`));
    const bp = bpCat(v);
    T.push(tile('Blood pressure', `${v.sbp}/${v.dbp}`, bp.s, bp.label, 'ACC/AHA 2017 categories'));
  }
  if (L === 3) {
    T.push(tile('Metabolic syndrome', `${R.mets.n} / 5 criteria`, R.mets.n >= 3 ? 'bad' : R.mets.n ? 'warn' : 'ok', R.mets.n >= 3 ? 'Criteria met (≥ 3)' : 'Criteria not met', R.mets.met.length ? 'Met: ' + R.mets.met.join(', ') : 'None met'));
    T.push(tile('HOMA-IR', fmtNum(R.homa, 2), 'info', 'Higher = more insulin resistance', 'No single universal cut-off; varies by population.'));
    const lo = fib4Low(v);
    T.push(tile('FIB-4', fmtNum(R.fib4, 2), R.fib4 < lo ? 'ok' : R.fib4 <= 2.67 ? 'warn' : 'bad', R.fib4 < lo ? 'Low' : R.fib4 <= 2.67 ? 'Indeterminate' : 'High', v.age < 35 ? 'Less reliable under age 35.' : `Low < ${lo} · high > 2.67`));
    T.push(tile('eGFR', `${Math.round(R.egfr)} mL/min/1.73 m²`, R.egfr >= 60 ? 'ok' : R.egfr >= 30 ? 'warn' : 'bad', `KDIGO ${kdigo(R.egfr)}`, 'CKD-EPI 2021, from creatinine. G1–G2 need urine tests to define CKD.'));
  }
  $('#tiles').replaceChildren(...T);

  $('#actions').replaceChildren(...R.plan.map((p) => h('div', { class: 'act' }, h('span', { class: 'prio ' + p.priority }, p.priority), h('div', null, h('b', null, p.title), h('p', null, p.detail)))));
  $('#urgent').hidden = !R.urgent.length;
  $('#urgent-list').replaceChildren(...R.urgent.map((u) => h('li', null, u)));
  $('#checks').hidden = !R.warnings.length;
  $('#checks-list').replaceChildren(...R.warnings.map((w) => h('li', null, w)));
  form.querySelectorAll('[data-bmi]').forEach((el) => { el.textContent = `BMI ${fmtNum(R.bmi, 1)}`; });
  $('#m-num').textContent = String(R.gauge.value);
  $('#m-suf').textContent = R.gauge.suf;
  $('#m-chip').textContent = L === 1 ? R.band.label : R.band.label.split(' —')[0];
  announce(R);
}

let annT = 0;
let lastAnn = '';
function announce(R) {
  clearTimeout(annT);
  annT = setTimeout(() => {
    const txt = (R.urgent.length ? 'Important: seek medical advice. ' : '') +
      (R.L === 1 ? `FINDRISC ${R.gauge.value} of 26, ${R.band.label}.` : `${R.band.label}. Illustrative index ${R.gauge.value} of 100.`);
    if (txt !== lastAnn) { lastAnn = txt; $('#live').textContent = txt; }
  }, 1200);
}

/* ---------- AI guidance ---------- */
const ai = { ctrl: null, shownFor: null, active: false };
const aiBtn = $('#ai-btn');
function setAiStatus(text, cls = '', spin = false) {
  const el = $('#ai-status');
  el.className = 'ai-status' + (cls ? ' ' + cls : '');
  el.replaceChildren(...(spin ? [h('span', { class: 'spinner', 'aria-hidden': 'true' })] : []), text);
}
function aiItem(it) {
  return h('div', { class: 'act' }, h('span', { class: 'prio ' + it.priority }, it.priority),
    h('div', null, h('b', null, it.title), h('p', null, it.detail), it.target ? h('span', { class: 'ai-target' }, 'Aim for: ' + it.target) : null));
}
function skeleton() {
  return [h('div', { class: 'skel' }), h('div', { class: 'skel w80' }), h('div', { class: 'skel w60' })];
}
function markAiStale() {
  if (ai.active) { ai.ctrl?.abort(); }
  if (ai.shownFor && ai.shownFor !== payloadKey()) {
    setAiStatus('Your values changed. Refresh the guidance to match.', 'stale');
    aiBtn.textContent = '✦ Refresh AI guidance';
  }
}
const payloadKey = () => JSON.stringify(buildPayload(state));

async function runAi() {
  ai.ctrl?.abort();
  const ctrl = new AbortController();
  ai.ctrl = ctrl;
  ai.active = true;
  const body = $('#ai-body');
  const key = payloadKey();
  aiBtn.disabled = true;
  body.replaceChildren(...skeleton());
  setAiStatus('Claude is reading your numbers…', '', true);
  let summaryEl = null;
  let list = null;
  let qList = null;
  const ensureList = () => { if (!list) { list = h('div'); body.append(list); } return list; };
  const on = (event, d) => {
    if (body.querySelector('.skel')) body.replaceChildren();
    if (event === 'summary') { summaryEl = h('p', { class: 'ai-summary' }, d.text); body.prepend(summaryEl); setAiStatus('Writing your plan…', '', true); }
    else if (event === 'item') ensureList().append(aiItem(d));
    else if (event === 'question') {
      if (!qList) { qList = h('ul'); body.append(h('div', { class: 'ai-q' }, h('h3', null, 'Questions to ask your clinician'), qList)); }
      qList.append(h('li', null, d.text));
    }
  };
  try {
    const r = await streamGuidance(buildPayload(state), on, ctrl.signal);
    if (r.status === 'done') {
      ai.shownFor = key;
      setAiStatus('AI guidance is up to date with your values.');
    } else if (r.status === 'partial') {
      ai.shownFor = key;
      setAiStatus('The AI response was cut short. Showing what arrived. Try again for the full plan.', 'err');
    } else {
      body.replaceChildren();
      ai.shownFor = null;
      const why = r.reason === 'ai_not_configured' ? 'AI guidance isn\'t switched on for this site yet.'
        : r.reason === 'rate_limited' ? `Too many requests. Try again in ${r.retryAfter || 60} seconds.`
          : 'AI guidance is unavailable right now.';
      setAiStatus(`${why} Your rule-based action plan below still applies.`, 'err');
    }
  } catch {
    /* aborted: a newer request or an input change took over */
    if (ai.ctrl === ctrl) { body.replaceChildren(); ai.shownFor = null; setAiStatus(''); }
  } finally {
    if (ai.ctrl === ctrl) { ai.active = false; aiBtn.disabled = false; aiBtn.textContent = ai.shownFor ? '✦ Refresh AI guidance' : '✦ Get AI guidance'; }
  }
}
aiBtn.addEventListener('click', runAi);
function resetAi() {
  ai.ctrl?.abort();
  ai.shownFor = null;
  ai.active = false;
  aiBtn.disabled = false;
  aiBtn.textContent = '✦ Get AI guidance';
  $('#ai-body').replaceChildren();
  setAiStatus('');
}

/* ---------- optional share with site owner (consent required) ---------- */
$('#share-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const st = $('#sh-status');
  const btn = $('#sh-btn');
  const email = $('#sh-email').value.trim();
  if (!$('#sh-consent').checked) { st.className = 'ai-status err'; st.textContent = 'Please tick the consent box to send your results.'; return; }
  if (email && !$('#sh-email').checkValidity()) { st.className = 'ai-status err'; st.textContent = 'That email address doesn\'t look right.'; return; }
  btn.disabled = true;
  st.className = 'ai-status';
  st.textContent = 'Sending…';
  const payload = buildSharePayload({ name: $('#sh-name').value, email, state, R: lastR, aiShown: Boolean(ai.shownFor), consent: true });
  const r = await sendShare(payload, $('#sh-gotcha').value);
  btn.disabled = false;
  if (r.ok) { st.className = 'ai-status'; st.textContent = 'Sent. Thank you.'; $('#sh-consent').checked = false; }
  else { st.className = 'ai-status err'; st.textContent = r.message; }
});

/* ---------- tabs, settings, toolbar, theme ---------- */
const tabs = [...document.querySelectorAll('[role=tab]')];
function setLevel(L, focus) {
  if (L !== state.level) resetAi();
  state.level = L;
  tabs.forEach((t) => {
    const on = Number(t.dataset.level) === L;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  const p = $('#panel');
  p.setAttribute('aria-labelledby', 'tab-' + L);
  p.classList.remove('panel');
  void p.offsetWidth;
  p.classList.add('panel');
  buildInputs();
  changed();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => setLevel(Number(t.dataset.level)));
  t.addEventListener('keydown', (e) => {
    const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (k === undefined) return;
    e.preventDefault();
    setLevel(Number(tabs[(k + tabs.length) % tabs.length].dataset.level), true);
  });
});
function syncCut() {
  document.querySelectorAll('#cut-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cut === state.cut)));
  $('#cut-hint').textContent = state.cut === 'asian'
    ? 'Asian: BMI overweight ≥ 23, obesity ≥ 25; waist ≥ 90 cm (men) / ≥ 80 cm (women). FINDRISC and IDRS always use their own cut-offs.'
    : 'General: BMI overweight ≥ 25, obesity ≥ 30; waist ≥ 102 cm (men) / ≥ 88 cm (women). FINDRISC and IDRS always use their own cut-offs.';
}
$('#cut-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.cut = b.dataset.cut; syncCut(); changed(); });
$('#reset-btn').addEventListener('click', () => { for (const k of levelFields(state.level)) state.v[k] = DEF[k]; buildInputs(); changed(); });
$('#print-btn').addEventListener('click', () => window.print());
$('#copy-btn').addEventListener('click', async () => {
  const url = location.href.split('#')[0] + shareHash();
  const b = $('#copy-btn');
  try { await navigator.clipboard.writeText(url); } catch { window.prompt('Copy this link:', url); return; }
  b.textContent = '✓ Link copied';
  setTimeout(() => { b.textContent = '🔗 Copy link'; }, 1800);
});
const THEMES = ['system', 'light', 'dark'];
function applyTheme() {
  if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state.theme);
  const name = state.theme[0].toUpperCase() + state.theme.slice(1);
  $('#theme-btn span').textContent = name;
  $('#theme-btn').setAttribute('aria-label', 'Colour theme: ' + name);
}
$('#theme-btn').addEventListener('click', () => { state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % 3]; applyTheme(); persist(); });

loadState();
applyTheme();
syncCut();
setLevel(state.level);
