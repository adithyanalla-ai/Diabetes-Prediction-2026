import { describe, it, expect } from 'vitest';
import { DEF } from '../src/fields.js';
import * as M from '../src/model.js';
import { actionPlan } from '../src/guidance.js';
import * as U from '../src/units.js';

const base = (o = {}) => ({ ...DEF, ...o });

describe('units', () => {
  it('round-trips', () => {
    expect(U.glucose.fromMmol(U.glucose.toMmol(126))).toBeCloseTo(126, 6);
    expect(U.hba1c.fromIfcc(U.hba1c.toIfcc(6.5))).toBeCloseTo(6.5, 6);
    expect(U.creat.fromUmol(U.creat.toUmol(0.9))).toBeCloseTo(0.9, 6);
  });
  it('known values', () => {
    expect(U.hba1c.toIfcc(6.5)).toBeCloseTo(47.5, 0);
    expect(U.glucose.toMmol(126)).toBeCloseTo(7.0, 1);
  });
});

describe('FINDRISC', () => {
  it('lowest and highest', () => {
    const lo = M.findrisc(base({ age: 30, weight: 60, height: 175, waist: 75, activity: 'regular', vegFruit: 'yes', bpMeds: 'no', highGlucose: 'no', family: 'none', sex: 'male' }));
    expect(lo.total).toBe(0);
    expect(lo.band.label).toBe('Low');
    const hi = M.findrisc(base({ age: 70, weight: 120, height: 170, waist: 120, activity: 'sedentary', vegFruit: 'no', bpMeds: 'yes', highGlucose: 'yes', family: 'both', sex: 'male' }));
    expect(hi.total).toBe(4 + 3 + 4 + 2 + 1 + 2 + 5 + 5);
    expect(hi.band.label).toBe('Very high');
  });
  it('band edges', () => {
    expect(M.findBand(6).label).toBe('Low');
    expect(M.findBand(7).label).toBe('Slightly elevated');
    expect(M.findBand(12).label).toBe('Moderate');
    expect(M.findBand(15).label).toBe('High');
    expect(M.findBand(21).label).toBe('Very high');
  });
  it('sex-specific waist', () => {
    const w = (sex, waist) => M.findrisc(base({ sex, waist })).items.find((i) => i.label === 'Waist').pts;
    expect(w('male', 93)).toBe(0); expect(w('male', 94)).toBe(3); expect(w('male', 103)).toBe(4);
    expect(w('female', 79)).toBe(0); expect(w('female', 80)).toBe(3); expect(w('female', 89)).toBe(4);
  });
});

describe('IDRS', () => {
  it('worked example', () => {
    expect(M.idrs(base({ age: 52, sex: 'male', waist: 100, activity: 'sedentary', family: 'both' })).total).toBe(30 + 20 + 30 + 20);
    expect(M.idrs(base({ age: 30, sex: 'female', waist: 70, activity: 'vigorous', family: 'none' })).total).toBe(0);
  });
});

describe('ADA', () => {
  it('thresholds', () => {
    expect(M.ada(base({ hba1c: 5.6, fpg: 99 }), 2).cat).toBe('normal');
    expect(M.ada(base({ hba1c: 5.7, fpg: 90 }), 2).cat).toBe('pre');
    expect(M.ada(base({ hba1c: 5.0, fpg: 100 }), 2).cat).toBe('pre');
    expect(M.ada(base({ hba1c: 6.5, fpg: 90 }), 2).cat).toBe('dm');
    expect(M.ada(base({ hba1c: 5.0, fpg: 126 }), 2).cat).toBe('dm');
  });
  it('random glucose needs symptoms and level 2', () => {
    expect(M.ada(base({ randomGlucose: 220, symptoms: 'no' }), 2).cat).toBe('normal');
    expect(M.ada(base({ randomGlucose: 220, symptoms: 'yes' }), 2).cat).toBe('dm');
    expect(M.ada(base({ randomGlucose: 220, symptoms: 'yes' }), 3).cat).toBe('normal');
  });
});

describe('criteria', () => {
  it('eGFR CKD-EPI 2021 reference points', () => {
    // Hand-computed from the published 2021 equation (Inker et al., NEJM 2021)
    expect(M.egfr(base({ sex: 'male', age: 40, creat: 1.0 }))).toBeCloseTo(97.6, 1);
    expect(M.egfr(base({ sex: 'female', age: 60, creat: 1.2 }))).toBeCloseTo(51.8, 1);
  });
  it('KDIGO stages', () => {
    expect([95, 75, 50, 35, 20, 10].map(M.kdigo)).toEqual(['G1', 'G2', 'G3a', 'G3b', 'G4', 'G5']);
  });
  it('FIB-4 and HOMA-IR formulas', () => {
    expect(M.fib4(base({ age: 50, ast: 40, platelets: 200, alt: 25 }))).toBeCloseTo((50 * 40) / (200 * 5), 6);
    expect(M.homaIR(base({ fpg: 90, insulin: 9 }))).toBeCloseTo(2.0, 6);
  });
  it('MetS needs 3 of 5, sex-specific HDL', () => {
    const v = base({ sex: 'female', hdl: 45, tg: 160, fpg: 105, waist: 70, sbp: 110, dbp: 70, bpMeds: 'no' });
    const r = M.mets(v, 'asian');
    expect(r.n).toBe(3);
    expect(M.mets({ ...v, sex: 'male' }, 'asian').met).not.toContain('HDL');
  });
});

describe('illustrative index', () => {
  it('is monotonic in the glycaemic and body inputs', () => {
    const idx = (o) => M.indexModel(base(o), 2, 'asian').index;
    for (const [k, a, b] of [['hba1c', 5.3, 6.5], ['fpg', 90, 140], ['waist', 80, 110], ['age', 30, 70], ['weight', 60, 100], ['sbp', 110, 160]]) {
      expect(idx({ [k]: b })).toBeGreaterThanOrEqual(idx({ [k]: a }));
    }
  });
  it('is clamped to 1..99 and never NaN', () => {
    const w = M.indexModel(base({ hba1c: 15, fpg: 600, age: 90, weight: 250, height: 130, waist: 170, sbp: 250, family: 'both', activity: 'sedentary' }), 3, 'asian').index;
    const b = M.indexModel(base({ hba1c: 3, fpg: 40, age: 18, weight: 40, height: 180, waist: 50, sbp: 90, activity: 'vigorous' }), 3, 'asian').index;
    expect(w).toBe(99); expect(b).toBe(1);
  });
  it('driver contributions are baseline-centred (reference person ~ 0)', () => {
    const ref = base({ age: 40, weight: 23 * 1.7 * 1.7, height: 170, waist: 85, family: 'none', activity: 'regular', fpg: 90, hba1c: 5.3, sbp: 120, sex: 'male', insulin: 90 * 1.5 / 90 * 1, tg: 100, hdl: 50 });
    const { contribs } = M.indexModel(ref, 2, 'asian');
    for (const c of contribs) expect(Math.abs(c.c)).toBeLessThan(0.01);
  });
});

describe('safety flags', () => {
  it('urgent for very high glucose, BP and low eGFR', () => {
    expect(M.urgentList(2, base({ fpg: 300 })).length).toBe(1);
    expect(M.urgentList(2, base({ sbp: 190 })).length).toBe(1);
    expect(M.urgentList(3, base({ creat: 4 })).some((s) => /eGFR/.test(s))).toBe(true);
    expect(M.urgentList(1, base({ fpg: 400 })).length).toBe(0);
    expect(M.urgentList(2, base()).length).toBe(0);
  });
  it('diabetes-range values are never shown as a low band', () => {
    const R = M.compute(base({ hba1c: 7.0, fpg: 140 }), 2, 'asian');
    expect(R.band.tone).toBe('bad');
    expect(R.band.label).toMatch(/Diabetes range/);
  });
  it('cross-checks catch impossible combos', () => {
    expect(M.crossChecks(2, base({ hba1c: 5.0, fpg: 250 })).length).toBeGreaterThan(0);
    expect(M.crossChecks(2, base({ sbp: 100, dbp: 110 })).length).toBeGreaterThan(0);
    expect(M.crossChecks(3, base({ tc: 150, hdl: 40, ldl: 200, tg: 150 })).length).toBeGreaterThan(0);
  });
});

describe('compute + guidance', () => {
  it.each([1, 2, 3])('level %i returns finite numbers and a plan', (L) => {
    const R = M.compute(base(), L, 'asian');
    expect(Number.isFinite(R.gauge.value)).toBe(true);
    const plan = actionPlan(L, base(), R);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.at(-1).title).toBe('Re-check regularly');
  });
  it('plan puts high priority first', () => {
    const v = base({ hba1c: 6.8 });
    const plan = actionPlan(2, v, M.compute(v, 2, 'asian'));
    expect(plan[0].priority).toBe('high');
  });
});
