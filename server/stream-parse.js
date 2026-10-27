// Incrementally pulls *completed* values out of a streaming JSON object:
//   { "summary": "...", "recommendations": [ {...}, ... ], "clinician_questions": [ "...", ... ] }
// Re-scans the buffer each call (outputs are a few KB), returning everything complete so far.
export function scanComplete(buf) {
  const out = { summary: undefined, recommendations: [], clinician_questions: [] };
  let i = 0;
  const n = buf.length;
  const stack = []; // '{' or '['
  let inStr = false;
  let esc = false;
  let strStart = -1;
  let curKey = null; // key at depth 1
  let lastStrAtKeyPos = null;
  let itemStart = -1;
  let expectKey = false;

  for (; i < n; i++) {
    const c = buf[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') {
        inStr = false;
        const raw = buf.slice(strStart, i + 1);
        let val;
        try { val = JSON.parse(raw); } catch { val = undefined; }
        const depth = stack.length;
        if (depth === 1 && expectKey) { lastStrAtKeyPos = val; }
        else if (depth === 1 && curKey === 'summary') { out.summary = val; }
        else if (depth === 2 && stack[1] === '[' && curKey === 'clinician_questions') { if (val !== undefined) out.clinician_questions.push(val); }
      }
      continue;
    }
    if (c === '"') { inStr = true; strStart = i; continue; }
    if (c === '{') {
      stack.push('{');
      if (stack.length === 1) expectKey = true;
      if (stack.length === 3 && curKey === 'recommendations') itemStart = i;
    } else if (c === '[') {
      stack.push('[');
    } else if (c === '}' || c === ']') {
      const top = stack.pop();
      if (c === '}' && top === '{' && stack.length === 2 && curKey === 'recommendations' && itemStart >= 0) {
        try { out.recommendations.push(JSON.parse(buf.slice(itemStart, i + 1))); } catch { /* ignore malformed */ }
        itemStart = -1;
      }
    } else if (c === ':' && stack.length === 1 && expectKey) {
      curKey = lastStrAtKeyPos;
      expectKey = false;
    } else if (c === ',' && stack.length === 1) {
      expectKey = true;
    }
  }
  return out;
}
