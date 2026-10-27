// Canonical internal units: mg/dL (glucose, cholesterol, TG, creatinine), % (HbA1c), kg, cm.
export const round = (x, d) => {
  const m = 10 ** d;
  return Math.round(x * m) / m;
};

export const glucose = { toMmol: (x) => x / 18.016, fromMmol: (x) => x * 18.016 };
export const hba1c = {
  toIfcc: (pct) => 10.929 * (pct - 2.15),
  fromIfcc: (mmol) => mmol / 10.929 + 2.15,
};
export const weight = { toLb: (kg) => kg * 2.20462, fromLb: (lb) => lb / 2.20462 };
export const length = { toIn: (cm) => cm / 2.54, fromIn: (inch) => inch * 2.54 };
export const chol = { toMmol: (x) => x / 38.67, fromMmol: (x) => x * 38.67 };
export const tg = { toMmol: (x) => x / 88.57, fromMmol: (x) => x * 88.57 };
export const creat = { toUmol: (x) => x * 88.42, fromUmol: (x) => x / 88.42 };

/** Display options per dimension; index 0 is canonical. */
export const DIMS = {
  glucose: [{ u: 'mg/dL' }, { u: 'mmol/L', to: glucose.toMmol, from: glucose.fromMmol, dec: 1, step: 0.1 }],
  hba1c: [{ u: '%' }, { u: 'mmol/mol', to: hba1c.toIfcc, from: hba1c.fromIfcc, dec: 0, step: 1 }],
  weight: [{ u: 'kg' }, { u: 'lb', to: weight.toLb, from: weight.fromLb, dec: 0, step: 1 }],
  height: [{ u: 'cm' }, { u: 'in', btn: 'ft/in', to: length.toIn, from: length.fromIn, dec: 0, step: 1 }],
  length: [{ u: 'cm' }, { u: 'in', to: length.toIn, from: length.fromIn, dec: 1, step: 0.5 }],
  chol: [{ u: 'mg/dL' }, { u: 'mmol/L', to: chol.toMmol, from: chol.fromMmol, dec: 2, step: 0.05 }],
  tg: [{ u: 'mg/dL' }, { u: 'mmol/L', to: tg.toMmol, from: tg.fromMmol, dec: 2, step: 0.05 }],
  creat: [{ u: 'mg/dL' }, { u: 'µmol/L', to: creat.toUmol, from: creat.fromUmol, dec: 0, step: 1 }],
};
export const DIM_DEC = { glucose: 0, hba1c: 1, weight: 1, height: 0, length: 0, chol: 0, tg: 0, creat: 2 };
