// Pure scoring logic. No DOM, no network. Inputs are in canonical units (see units.js).
// Level 1: FINDRISC (Lindström & Tuomilehto 2003) + IDRS (Mohan et al. 2005).
// Levels 2-3: ADA glucose category + criteria (MetS, HOMA-IR, FIB-4, CKD-EPI 2021 eGFR) and an
// *illustrative, uncalibrated* index that only drives the live driver bars.
import { round } from './units.js';

export const bmiOf = (v) => v.weight / (v.height / 100) ** 2;
export const waistCut = (sex, cut) => (cut === 'asian' ? (sex === 'female' ? 80 : 90) : sex === 'female' ? 88 : 102);

export function bmiCat(b, cut) {
  const [ow, ob] = cut === 'asian' ? [23, 25] : [25, 30];
  if (b < 18.5) return { label: 'Underweight', s: 'warn' };
  if (b < ow) return { label: 'Healthy range', s: 'ok' };
  if (b < ob) return { label: 'Overweight', s: 'warn' };
  return { label: 'Obesity range', s: 'bad' };
}

export const FBANDS = [
  { max: 6, label: 'Low', risk: '≈ 1 in 100', tone: 'good', icon: '✓' },
  { max: 11, label: 'Slightly elevated', risk: '≈ 1 in 25', tone: 'neutral', icon: '●' },
  { max: 14, label: 'Moderate', risk: '≈ 1 in 6', tone: 'warn', icon: '▲' },
  { max: 20, label: 'High', risk: '≈ 1 in 3', tone: 'bad', icon: '‼' },
  { max: 26, label: 'Very high', risk: '≈ 1 in 2', tone: 'bad', icon: '‼' },
];
export const findBand = (total) => FBANDS.find((b) => total <= b.max);

export function findrisc(v) {
  const b = bmiOf(v);
  const male = v.sex === 'male';
  const w = v.waist;
  const items = [
    { label: 'Age', pts: v.age < 45 ? 0 : v.age < 55 ? 2 : v.age < 65 ? 3 : 4, max: 4, mod: false },
    { label: 'BMI', pts: b < 25 ? 0 : b <= 30 ? 1 : 3, max: 3, mod: true },
    { label: 'Waist', pts: male ? (w < 94 ? 0 : w <= 102 ? 3 : 4) : w < 80 ? 0 : w <= 88 ? 3 : 4, max: 4, mod: true },
    { label: 'Daily activity', pts: v.activity === 'vigorous' || v.activity === 'regular' ? 0 : 2, max: 2, mod: true },
    { label: 'Daily vegetables / fruit', pts: v.vegFruit === 'yes' ? 0 : 1, max: 1, mod: true },
    { label: 'BP medication', pts: v.bpMeds === 'yes' ? 2 : 0, max: 2, mod: false },
    { label: 'History of high glucose', pts: v.highGlucose === 'yes' ? 5 : 0, max: 5, mod: false },
    { label: 'Family history', pts: v.family === 'second' ? 3 : v.family === 'one' || v.family === 'both' ? 5 : 0, max: 5, mod: false },
  ];
  const total = items.reduce((s, i) => s + i.pts, 0);
  return { items, total, band: findBand(total) };
}

export function idrs(v) {
  const male = v.sex === 'male';
  const w = v.waist;
  const age = v.age < 35 ? 0 : v.age < 50 ? 20 : 30;
  const waist = male ? (w < 90 ? 0 : w < 100 ? 10 : 20) : w < 80 ? 0 : w < 90 ? 10 : 20;
  const act = { vigorous: 0, regular: 20, light: 30, sedentary: 30 }[v.activity];
  const fam = { none: 0, second: 0, one: 10, both: 20 }[v.family];
  const total = age + waist + act + fam;
  return { total, band: total < 30 ? { label: 'Low', s: 'ok' } : total < 60 ? { label: 'Moderate', s: 'warn' } : { label: 'High', s: 'bad' } };
}

export const homaIR = (v) => (v.fpg * v.insulin) / 405;

const LOGIT0 = Math.log(0.05 / 0.95);
// Hand-weighted, NOT fitted to data. Contribution = coef x (value - reference value).
export const IDX = [
  { label: 'Age', x: (v) => v.age, base: 40, coef: 0.035, mod: false },
  { label: 'BMI', x: (v) => bmiOf(v), base: 23, coef: 0.07, mod: true },
  { label: 'Waist above cut-off', x: (v, c) => Math.max(0, v.waist - waistCut(v.sex, c)), base: 0, coef: 0.03, mod: true },
  { label: 'Family history', x: (v) => ({ none: 0, second: 0.4, one: 0.8, both: 1.3 })[v.family], base: 0, coef: 1, mod: false },
  { label: 'Physical activity', x: (v) => ({ vigorous: -0.15, regular: 0, light: 0.25, sedentary: 0.45 })[v.activity], base: 0, coef: 1, mod: true },
  { label: 'Fasting glucose', x: (v) => v.fpg, base: 90, coef: 0.045, mod: true },
  { label: 'HbA1c', x: (v) => v.hba1c, base: 5.3, coef: 1.1, mod: true },
  { label: 'Systolic BP', x: (v) => v.sbp, base: 120, coef: 0.012, mod: true },
  { label: 'Insulin resistance (HOMA-IR)', x: (v) => Math.log(homaIR(v)), base: Math.log(1.5), coef: 0.45, mod: true, l3: true },
  { label: 'Triglycerides', x: (v) => Math.log(v.tg / 100), base: 0, coef: 0.45, mod: true, l3: true },
  { label: 'HDL-C', x: (v) => v.hdl, base: 50, coef: -0.02, mod: true, l3: true },
];

export function indexModel(v, L, cut) {
  let z = LOGIT0;
  const contribs = IDX.filter((f) => !f.l3 || L === 3).map((f) => {
    const c = f.coef * (f.x(v, cut) - f.base);
    z += c;
    return { label: f.label, c, mod: f.mod };
  });
  const p = 1 / (1 + Math.exp(-z));
  return { index: Math.min(99, Math.max(1, Math.round(p * 100))), contribs };
}

export function ada(v, L) {
  const hits = [];
  if (v.hba1c >= 6.5) hits.push(['dm', 'HbA1c']);
  else if (v.hba1c >= 5.7) hits.push(['pre', 'HbA1c']);
  if (v.fpg >= 126) hits.push(['dm', 'fasting glucose']);
  else if (v.fpg >= 100) hits.push(['pre', 'fasting glucose']);
  if (L === 2 && v.randomGlucose >= 200 && v.symptoms === 'yes') hits.push(['dm', 'random glucose with symptoms']);
  const cat = hits.some((x) => x[0] === 'dm') ? 'dm' : hits.length ? 'pre' : 'normal';
  return { cat, by: hits.filter((x) => x[0] === cat).map((x) => x[1]) };
}
export const ADA_BAND = {
  normal: { label: 'Glucose below prediabetes range', tone: 'good', icon: '✓' },
  pre: { label: 'Prediabetes range (ADA)', tone: 'warn', icon: '▲' },
  dm: { label: 'Diabetes range — confirm with a clinician', tone: 'bad', icon: '‼' },
};

// CKD-EPI 2021 (race-free), mL/min/1.73 m²
export function egfr(v) {
  const f = v.sex === 'female';
  const k = f ? 0.7 : 0.9;
  const a = f ? -0.241 : -0.302;
  const r = v.creat / k;
  return 142 * Math.min(r, 1) ** a * Math.max(r, 1) ** -1.2 * 0.9938 ** v.age * (f ? 1.012 : 1);
}
export const kdigo = (e) => (e >= 90 ? 'G1' : e >= 60 ? 'G2' : e >= 45 ? 'G3a' : e >= 30 ? 'G3b' : e >= 15 ? 'G4' : 'G5');
export const fib4 = (v) => (v.age * v.ast) / (v.platelets * Math.sqrt(v.alt));
export const fib4Low = (v) => (v.age > 65 ? 2.0 : 1.3);

// Harmonised definition (Alberti et al. 2009): any 3 of 5.
export function mets(v, cut) {
  const male = v.sex === 'male';
  const crit = [
    ['waist', v.waist >= waistCut(v.sex, cut)],
    ['triglycerides', v.tg >= 150],
    ['HDL', v.hdl < (male ? 40 : 50)],
    ['blood pressure', v.sbp >= 130 || v.dbp >= 85 || v.bpMeds === 'yes'],
    ['fasting glucose', v.fpg >= 100],
  ];
  const met = crit.filter((c) => c[1]).map((c) => c[0]);
  return { n: met.length, met };
}

export function bpCat(v) {
  if (v.sbp >= 140 || v.dbp >= 90) return { label: 'Stage 2 range', s: 'bad' };
  if (v.sbp >= 130 || v.dbp >= 80) return { label: 'Stage 1 range', s: 'warn' };
  if (v.sbp >= 120) return { label: 'Elevated', s: 'warn' };
  return { label: 'Normal', s: 'ok' };
}

/** Default formatter in canonical units; the UI passes a unit-aware one. */
export const canonFmt = {
  glucose: (x) => `${round(x, 0)} mg/dL`,
  hba1c: (x) => `${round(x, 1)} %`,
  weight: (x) => `${round(x, 1)} kg`,
  length: (x) => `${round(x, 0)} cm`,
  chol: (x) => `${round(x, 0)} mg/dL`,
  tg: (x) => `${round(x, 0)} mg/dL`,
};

export function urgentList(L, v, fmt = canonFmt) {
  const u = [];
  if (L >= 2) {
    const g = Math.max(v.fpg, L === 2 ? v.randomGlucose : 0);
    if (g > 250) u.push(`Glucose of ${fmt.glucose(g)} is very high. If you feel unwell, are vomiting, very thirsty or drowsy, seek urgent care now. Otherwise contact a clinician today.`);
    else if (L === 2 && v.randomGlucose >= 200 && v.symptoms === 'yes') u.push('Symptoms together with a random glucose ≥ 200 mg/dL need prompt medical review. Contact a clinician soon.');
    if (v.sbp >= 180 || v.dbp >= 120) u.push(`Blood pressure ${v.sbp}/${v.dbp} mmHg is very high. Re-measure after 5 minutes' rest. If it stays this high, or you have chest pain, breathlessness, severe headache, weakness or vision change, seek urgent care.`);
  }
  if (L === 3) {
    const e = egfr(v);
    if (e < 30) u.push(`Estimated kidney function (eGFR ≈ ${Math.round(e)}) is in KDIGO stage ${kdigo(e)}. If you are not already under kidney care, arrange prompt medical follow-up.`);
  }
  return u;
}

export function crossChecks(L, v, fmt = canonFmt) {
  const w = [];
  const b = bmiOf(v);
  if (b < 14 || b > 70) w.push(`Height and weight give a BMI of ${round(b, 1)}, which is unusual. Please check both.`);
  if (L >= 2 && v.dbp >= v.sbp) w.push('Diastolic BP should be lower than systolic. Check the reading.');
  if (L >= 2) {
    const eag = 28.7 * v.hba1c - 46.7;
    if (Math.abs(v.fpg - eag) > 70) w.push(`HbA1c (${fmt.hba1c(v.hba1c)}) and fasting glucose (${fmt.glucose(v.fpg)}) disagree a lot. HbA1c can be affected by anaemia or haemoglobin variants, so ask a clinician.`);
  }
  if (L === 3 && v.tg < 400) {
    const est = v.tc - v.hdl - v.tg / 5;
    if (Math.abs(v.ldl - est) > 30) w.push(`LDL + HDL + TG/5 (≈ ${fmt.chol(v.ldl + v.hdl + v.tg / 5)}) doesn't match total cholesterol (${fmt.chol(v.tc)}). Check the lipid values; a directly measured LDL can differ a little.`);
  }
  return w;
}

/** One-change-at-a-time scenarios. Returns [{label, before, after}] for the level's headline score. */
export function whatIfs(L, v, score, fmt = canonFmt, hba1cStepLabel = '0.5%') {
  const S = [
    { label: `Lose ${fmt.weight(5)}`, ap: (x) => ({ ...x, weight: Math.max(30, x.weight - 5) }), ok: bmiOf(v) > 20 },
    { label: `Waist −${fmt.length(5)}`, ap: (x) => ({ ...x, waist: Math.max(50, x.waist - 5) }), ok: v.waist > 70 },
    { label: 'Reach 30 min of activity a day', ap: (x) => ({ ...x, activity: 'regular' }), ok: v.activity === 'light' || v.activity === 'sedentary' },
    { label: 'Eat vegetables or fruit daily', ap: (x) => ({ ...x, vegFruit: 'yes' }), ok: L === 1 && v.vegFruit === 'no' },
    { label: `HbA1c −${hba1cStepLabel}`, ap: (x) => ({ ...x, hba1c: x.hba1c - 0.5 }), ok: L >= 2 && v.hba1c > 5.3 },
    { label: `Fasting glucose −${fmt.glucose(10)}`, ap: (x) => ({ ...x, fpg: x.fpg - 10 }), ok: L >= 2 && v.fpg > 90 },
    { label: 'Systolic BP −10 mmHg', ap: (x) => ({ ...x, sbp: x.sbp - 10 }), ok: L >= 2 && v.sbp > 120 },
    { label: `Triglycerides −${fmt.tg(30)}`, ap: (x) => ({ ...x, tg: Math.max(30, x.tg - 30) }), ok: L === 3 && v.tg > 100 },
  ];
  const before = score(v);
  return S.filter((s) => s.ok).map((s) => ({ label: s.label, before, after: score(s.ap(v)) }));
}

/** Full computation for one level. Pure; used by the browser UI and by the server (so the AI sees trusted numbers). */
export function compute(v, L, cut, fmt = canonFmt) {
  const R = { L, cut, bmi: bmiOf(v), urgent: urgentList(L, v, fmt), warnings: crossChecks(L, v, fmt) };
  if (L === 1) {
    R.f = findrisc(v);
    R.i = idrs(v);
    R.gauge = { value: R.f.total, max: 26, suf: '/ 26', lbl: 'FINDRISC points' };
    R.band = R.f.band;
    R.sub = `Published FINDRISC estimate: ${R.f.band.risk} people in this score band develop type 2 diabetes within 10 years (Finnish cohort).`;
    R.what = whatIfs(L, v, (x) => findrisc(x).total, fmt);
  } else {
    R.ada = ada(v, L);
    R.m = indexModel(v, L, cut);
    R.gauge = { value: R.m.index, max: 100, suf: '/ 100', lbl: 'Illustrative index' };
    R.band = ADA_BAND[R.ada.cat];
    R.sub = 'The index is illustrative and uncalibrated: it is not a probability. The coloured category comes from ADA glucose criteria.';
    R.what = whatIfs(L, v, (x) => indexModel(x, L, cut).index, fmt);
    if (L === 3) {
      R.mets = mets(v, cut);
      R.egfr = egfr(v);
      R.homa = homaIR(v);
      R.fib4 = fib4(v);
    }
  }
  return R;
}
