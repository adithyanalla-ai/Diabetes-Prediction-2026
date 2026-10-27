// Single source of truth for inputs: used by the UI, the model tests and the server's request schema.
const yesNo = [['no', 'No'], ['yes', 'Yes']];

export const F = {
  sex: { type: 'select', label: 'Sex (for sex-specific cut-offs)', opts: [['female', 'Female'], ['male', 'Male']] },
  age: { label: 'Age', unit: 'years', min: 18, max: 90, step: 1, dec: 0 },
  height: { label: 'Height', dim: 'height', min: 130, max: 220, step: 1, dec: 0 },
  weight: { label: 'Weight', dim: 'weight', min: 30, max: 250, step: 0.5, dec: 1 },
  waist: { label: 'Waist circumference', dim: 'length', min: 50, max: 170, step: 1, dec: 0 },
  family: { type: 'select', label: 'Family history of diabetes', opts: [['none', 'None known'], ['second', 'Grandparent, aunt, uncle or cousin'], ['one', 'One parent, sibling or child'], ['both', 'Both parents']] },
  activity: { type: 'select', label: 'Physical activity', opts: [['vigorous', 'Regular exercise and physically demanding work'], ['regular', '≥ 30 min most days (exercise or active work)'], ['light', 'Some activity, under 30 min a day'], ['sedentary', 'Mostly sitting, no exercise']] },
  vegFruit: { type: 'select', label: 'Vegetables, fruit or berries every day?', opts: [['yes', 'Yes'], ['no', 'No']] },
  bpMeds: { type: 'select', label: 'Ever taken blood-pressure medication regularly?', opts: yesNo },
  highGlucose: { type: 'select', label: 'Ever told your glucose was high (incl. pregnancy)?', opts: yesNo },
  smoking: { type: 'select', label: 'Smoking', opts: [['never', 'Never'], ['former', 'Former'], ['current', 'Current']] },
  sleep: { label: 'Sleep per night', unit: 'hours', min: 3, max: 12, step: 0.5, dec: 1 },
  fpg: { label: 'Fasting glucose', dim: 'glucose', min: 40, max: 600, step: 1, dec: 0 },
  hba1c: { label: 'HbA1c', dim: 'hba1c', min: 3, max: 15, step: 0.1, dec: 1 },
  randomGlucose: { label: 'Random (non-fasting) glucose', dim: 'glucose', min: 40, max: 600, step: 1, dec: 0 },
  symptoms: { type: 'select', label: 'Excess thirst, frequent urination or unexplained weight loss?', opts: yesNo },
  sbp: { label: 'Systolic BP', unit: 'mmHg', min: 70, max: 250, step: 1, dec: 0 },
  dbp: { label: 'Diastolic BP', unit: 'mmHg', min: 40, max: 150, step: 1, dec: 0 },
  insulin: { label: 'Fasting insulin', unit: 'µU/mL', min: 1, max: 100, step: 0.5, dec: 1 },
  tc: { label: 'Total cholesterol', dim: 'chol', min: 80, max: 450, step: 1, dec: 0 },
  hdl: { label: 'HDL-C', dim: 'chol', min: 15, max: 120, step: 1, dec: 0 },
  ldl: { label: 'LDL-C', dim: 'chol', min: 20, max: 400, step: 1, dec: 0 },
  tg: { label: 'Triglycerides', dim: 'tg', min: 30, max: 1000, step: 5, dec: 0 },
  ast: { label: 'AST', unit: 'U/L', min: 5, max: 500, step: 1, dec: 0 },
  alt: { label: 'ALT', unit: 'U/L', min: 5, max: 500, step: 1, dec: 0 },
  platelets: { label: 'Platelets', unit: '×10⁹/L', min: 20, max: 800, step: 5, dec: 0 },
  creat: { label: 'Creatinine', dim: 'creat', min: 0.2, max: 15, step: 0.01, dec: 2 },
};

export const DEF = {
  sex: 'male', age: 45, height: 170, weight: 75, waist: 90, family: 'none', activity: 'light',
  vegFruit: 'yes', bpMeds: 'no', highGlucose: 'no', smoking: 'never', sleep: 7,
  fpg: 95, hba1c: 5.6, randomGlucose: 120, symptoms: 'no', sbp: 122, dbp: 80, insulin: 10,
  tc: 195, hdl: 48, ldl: 120, tg: 140, ast: 26, alt: 28, platelets: 250, creat: 0.9,
};

const ABOUT = ['sex', 'age', 'height', 'weight', 'waist'];
export const LEVELS = {
  1: [['About you', ABOUT], ['Risk-score questions', ['family', 'activity', 'vegFruit', 'bpMeds', 'highGlucose']], ['Other factors', ['smoking', 'sleep'], 'not part of the scores']],
  2: [['About you', [...ABOUT, 'family', 'activity']], ['Glucose', ['fpg', 'hba1c', 'randomGlucose', 'symptoms']], ['Blood pressure', ['sbp', 'dbp', 'bpMeds']]],
  3: [['About you', [...ABOUT, 'family', 'activity']], ['Glucose & insulin', ['fpg', 'hba1c', 'insulin', 'symptoms']], ['Blood pressure', ['sbp', 'dbp', 'bpMeds']], ['Lipids', ['tc', 'hdl', 'ldl', 'tg']], ['Liver', ['ast', 'alt', 'platelets']], ['Kidney', ['creat']]],
};
export const levelFields = (L) => LEVELS[L].flatMap((g) => g[1]);

/** Returns a valid value or undefined. */
export function sanitize(id, val) {
  const f = F[id];
  if (!f) return undefined;
  if (f.type === 'select') return f.opts.some((o) => o[0] === val) ? val : undefined;
  const n = typeof val === 'number' ? val : NaN;
  return Number.isFinite(n) && n >= f.min && n <= f.max ? n : undefined;
}
