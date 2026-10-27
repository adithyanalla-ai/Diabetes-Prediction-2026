import { describe, it, expect } from 'vitest';
import { buildSharePayload } from '../src/share.js';
import { compute } from '../src/model.js';
import { DEF, levelFields } from '../src/fields.js';

const mk = (level, extra = {}) => {
  const state = { level, cut: 'asian', v: { ...DEF } };
  return buildSharePayload({ name: ' Jo ', email: 'jo@example.com', state, R: compute(state.v, level, 'asian'), aiShown: true, consent: true, ...extra });
};

describe('share payload', () => {
  it('includes only the current level inputs, flat, with consent', () => {
    for (const L of [1, 2, 3]) {
      const p = mk(L);
      const inputs = Object.keys(p).filter((k) => k.startsWith('input_')).map((k) => k.slice(6));
      expect(inputs.sort()).toEqual([...levelFields(L)].sort());
      expect(p.consent).toBe('yes');
      expect(p.name).toBe('Jo');
      expect(p.level).toBe(L);
      expect(p.result_headline).toMatch(/\d/);
    }
    expect(mk(1)).not.toHaveProperty('input_hba1c');
  });
  it('clips long text and never nests objects', () => {
    const p = mk(1, { name: 'x'.repeat(500), email: 'y'.repeat(500) });
    expect(p.name).toHaveLength(120);
    expect(p.email).toHaveLength(200);
    expect(Object.values(p).every((v) => typeof v !== 'object')).toBe(true);
  });
});
