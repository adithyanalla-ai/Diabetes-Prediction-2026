// Deterministic, rule-based action plan. Shown immediately and used when the AI is unavailable.
import { bmiOf, waistCut, fib4, fib4Low, kdigo, canonFmt } from './model.js';
import { round } from './units.js';

const PRI = { high: 0, medium: 1, low: 2 };

export function actionPlan(L, v, R, fmt = canonFmt) {
  const A = [];
  const cut = R.cut;
  const b = bmiOf(v);
  const wc = waistCut(v.sex, cut);
  const bmiTop = cut === 'asian' ? 23 : 25;
  const are = (by) => (by.length > 1 ? 'are' : 'is');
  if (L >= 2 && R.ada.cat === 'dm') A.push(['high', 'Confirm with a clinician soon', `Your ${R.ada.by.join(' and ')} ${are(R.ada.by)} in the ADA diabetes range. Only a clinician can confirm a diagnosis, usually with repeat testing, so book an appointment rather than waiting for a routine check.`]);
  else if (L >= 2 && R.ada.cat === 'pre') A.push(['high', 'Talk to a clinician about prevention', `Your ${R.ada.by.join(' and ')} ${are(R.ada.by)} in the prediabetes range. Ask about a structured lifestyle programme and when to retest (often within a year).`]);
  if (L === 1 && (R.f.total >= 12 || R.i.total >= 60)) A.push(['high', 'Ask for a blood test', 'Your questionnaire score is in a range where an HbA1c or fasting glucose test is commonly recommended.']);
  if (b >= bmiTop) A.push([b >= bmiTop + 2 ? 'high' : 'medium', 'Aim for 5–7% weight loss', `For you that is about ${fmt.weight(v.weight * 0.05)} to ${fmt.weight(v.weight * 0.07)}. In the Diabetes Prevention Program, about 7% weight loss plus 150 min/week of activity cut progression to diabetes by 58%.`]);
  if (v.waist >= wc) A.push(['medium', `Bring your waist under ${fmt.length(wc)}`, `Your waist is ${fmt.length(v.waist)}. The ${cut === 'asian' ? 'Asian' : 'general-population'} cut-off for ${v.sex === 'male' ? 'men' : 'women'} is ${fmt.length(wc)}.`]);
  if (v.activity === 'light' || v.activity === 'sedentary') A.push(['medium', 'Build up to 150 min a week', 'Brisk walking or similar, spread over at least 3 days, plus muscle-strengthening twice a week. Break up long periods of sitting.']);
  if (L >= 2 && (v.sbp >= 130 || v.dbp >= 80)) A.push([v.sbp >= 140 || v.dbp >= 90 ? 'high' : 'medium', 'Check your blood pressure', `${v.sbp}/${v.dbp} mmHg. Re-measure at rest on several days, and discuss it with a clinician if it stays at or above 130/80.`]);
  if (L === 3) {
    if (R.mets.n >= 3) A.push(['high', 'Review cardiometabolic risk', `You meet ${R.mets.n} of 5 metabolic-syndrome criteria (${R.mets.met.join(', ')}). Ask a clinician about your overall heart and metabolic risk.`]);
    if (v.tg >= 150) A.push(['medium', `Triglycerides below ${fmt.tg(150)}`, `Currently ${fmt.tg(v.tg)}. Cutting sugary drinks, refined carbohydrates and alcohol usually helps most.`]);
    const f4 = fib4(v);
    if (f4 >= fib4Low(v)) A.push([f4 > 2.67 ? 'high' : 'medium', 'Discuss a liver check', `FIB-4 is ${round(f4, 2)}. A clinician may suggest further tests, such as elastography, to rule out liver fibrosis.`]);
    if (R.egfr < 60) A.push(['high', 'Kidney follow-up', `eGFR is about ${Math.round(R.egfr)} (KDIGO ${kdigo(R.egfr)}). Ask about a urine albumin-to-creatinine test and medication review.`]);
  }
  if (L === 1 && v.vegFruit === 'no') A.push(['low', 'Vegetables or fruit every day', 'Daily vegetables, fruit or berries is one of the FINDRISC items. Aim for half your plate as vegetables.']);
  if (L === 1 && v.smoking === 'current') A.push(['medium', 'Get stop-smoking support', 'Smoking is linked to higher type 2 diabetes risk. Stop-smoking services and nicotine replacement roughly double quit rates.']);
  if (L === 1 && (v.sleep < 6 || v.sleep > 9)) A.push(['low', 'Aim for 7–9 hours of sleep', `You reported ${v.sleep} h. Both short and long sleep are associated with poorer glucose control.`]);
  A.push(['low', 'Re-check regularly', L === 1 ? 'Repeat this check every 1–3 years, or sooner after big changes in weight or health.' : 'Follow the retest interval your clinician recommends; update your values here when you have new results.']);
  return A.sort((a, c) => PRI[a[0]] - PRI[c[0]]).map(([priority, title, detail]) => ({ priority, title, detail }));
}
