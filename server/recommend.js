// Framework-neutral handler: works as a Vercel Node function and as Vite dev middleware.
import Anthropic from '@anthropic-ai/sdk';
import { requestSchema, itemSchema, summarySchema, questionSchema, OUTPUT_JSON_SCHEMA } from './schema.js';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt.js';
import { scanComplete } from './stream-parse.js';
import { createLimiter } from './ratelimit.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_BODY = 4096;
const MAX_TOKENS = 2500;

function json(res, status, obj, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return req.body.length > MAX_BODY ? null : req.body;
    const s = JSON.stringify(req.body);
    return s.length > MAX_BODY ? null : s;
  }
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) return null;
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0].trim();
  return first || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function originAllowed(req, env) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetches from some browsers omit it
  if (env.ALLOWED_ORIGIN) return origin === env.ALLOWED_ORIGIN;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export function createHandler({ env = process.env, client, limiter } = {}) {
  const rate = limiter || createLimiter({ max: Number(env.RATE_LIMIT_PER_MIN) || 6, env });
  const getClient = () => client || (env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 60_000 }) : null);

  return async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    if (!originAllowed(req, env)) return json(res, 403, { error: 'origin_not_allowed' });
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'json_required' });

    const anthropic = getClient();
    if (!anthropic) return json(res, 503, { fallback: true, error: 'ai_not_configured' });

    const rl = await rate(clientIp(req));
    if (!rl.ok) return json(res, 429, { fallback: true, error: 'rate_limited', retryAfter: rl.retryAfter }, { 'Retry-After': String(rl.retryAfter) });

    const raw = await readBody(req);
    if (raw === null) return json(res, 413, { error: 'body_too_large' });
    let body;
    try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'invalid_json' }); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return json(res, 400, { error: 'invalid_request', issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })) });

    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });

    let buf = '';
    const sent = { summary: false, recs: 0, qs: 0 };
    const flush = () => {
      const s = scanComplete(buf);
      if (!sent.summary && s.summary) {
        const r = summarySchema.safeParse(s.summary);
        if (r.success) { sse(res, 'summary', { text: r.data }); sent.summary = true; }
      }
      while (sent.recs < s.recommendations.length && sent.recs < 6) {
        const r = itemSchema.safeParse(s.recommendations[sent.recs]);
        sent.recs += 1;
        if (r.success) sse(res, 'item', r.data);
      }
      while (sent.qs < s.clinician_questions.length && sent.qs < 3) {
        const r = questionSchema.safeParse(s.clinician_questions[sent.qs]);
        sent.qs += 1;
        if (r.success) sse(res, 'question', { text: r.data });
      }
    };

    try {
      const stream = anthropic.beta.messages.stream(
        {
          model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
          max_tokens: MAX_TOKENS,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: SYSTEM_PROMPT,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_JSON_SCHEMA } },
          messages: [{ role: 'user', content: buildUserMessage(parsed.data) }],
        },
        { signal: ac.signal },
      );
      stream.on('text', (delta) => { buf += delta; flush(); });
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') throw new Error('refusal');
      flush();
      if (!sent.recs) throw new Error('empty');
      sse(res, 'done', { model: final.model });
    } catch (err) {
      if (!ac.signal.aborted) {
        console.error('[recommend]', err?.status || '', err?.message || err);
        sse(res, 'error', { fallback: true, message: 'AI guidance is unavailable right now.' });
      }
    } finally {
      res.end();
    }
  };
}
