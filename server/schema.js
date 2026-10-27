import { z } from 'zod';
import { F, levelFields } from '../src/fields.js';

function fieldSchema(id) {
  const f = F[id];
  if (f.type === 'select') return z.enum(f.opts.map((o) => o[0]));
  return z.number().finite().min(f.min).max(f.max);
}

const levelSchema = (L) =>
  z.object({
    level: z.literal(L),
    cut: z.enum(['asian', 'general']),
    v: z.strictObject(Object.fromEntries(levelFields(L).map((id) => [id, fieldSchema(id)]))),
  }).strict();

/** Numbers and enums only: no free text, no identifiers. Unknown keys are rejected. */
export const requestSchema = z.discriminatedUnion('level', [levelSchema(1), levelSchema(2), levelSchema(3)]);

export const itemSchema = z.object({
  priority: z.enum(['high', 'medium', 'low']),
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(700),
  target: z.string().max(160).optional().default(''),
});
export const summarySchema = z.string().min(1).max(600);
export const questionSchema = z.string().min(1).max(220);

/** JSON Schema given to Claude's structured output. */
export const OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '2-3 sentence plain-language overview that cites the user\'s own numbers.' },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          title: { type: 'string', description: 'Imperative action, under 8 words.' },
          detail: { type: 'string', description: '1-3 sentences tied to the user\'s specific values.' },
          target: { type: 'string', description: 'A concrete numeric goal or timeframe, or an empty string.' },
        },
        required: ['priority', 'title', 'detail', 'target'],
        additionalProperties: false,
      },
    },
    clinician_questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'recommendations', 'clinician_questions'],
  additionalProperties: false,
};
