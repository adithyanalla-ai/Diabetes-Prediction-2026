// Per-IP limiter. In-memory works per warm instance only; set UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN for a limit shared across serverless instances.
export function createLimiter({ max = 6, windowMs = 60_000, env = {}, fetchImpl = fetch } = {}) {
  const hits = new Map();
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  async function redis(ip) {
    const key = `rl:recommend:${ip}:${Math.floor(Date.now() / windowMs)}`;
    const res = await fetchImpl(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['PEXPIRE', key, windowMs, 'NX']]),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const [[incr]] = [await res.json()];
    const count = Number(incr?.result);
    return { ok: count <= max, retryAfter: Math.ceil(windowMs / 1000) };
  }

  function memory(ip) {
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      hits.set(ip, arr);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000)) };
    }
    arr.push(now);
    hits.set(ip, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return { ok: true, retryAfter: 0 };
  }

  return async function check(ip) {
    if (url && token) {
      try { return await redis(ip); } catch { /* fall through to memory */ }
    }
    return memory(ip);
  };
}
