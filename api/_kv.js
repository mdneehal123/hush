// Upstash/Vercel KV over REST. Falls back to an in-memory store ONLY for local testing (DM_DEV=1).
const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = { s: new Map(), z: new Map() };
function local(a) {
  const [c, k, ...r] = a; const C = c.toUpperCase();
  const g = (m, d) => { if (!mem[m].has(k)) mem[m].set(k, d); return mem[m].get(k); };
  if (C === 'GET') return mem.s.has(k) ? mem.s.get(k) : null;
  if (C === 'SET') { if (r.includes('NX') && mem.s.has(k)) return null; mem.s.set(k, String(r[0])); return 'OK'; }
  if (C === 'SADD') { const s = g('s', new Set()); const n = s.has(r[0]) ? 0 : 1; s.add(r[0]); return n; }
  if (C === 'SMEMBERS') return [...(mem.s.get(k) || [])];
  if (C === 'RPUSH') { const l = g('s', []); l.push(r[0]); return l.length; }
  if (C === 'LLEN') return (mem.s.get(k) || []).length;
  if (C === 'LRANGE') { const l = mem.s.get(k) || []; const e = Number(r[1]); return l.slice(Number(r[0]), e === -1 ? undefined : e + 1); }
  if (C === 'ZADD') { const z = g('z', new Map()); z.set(r[1], Number(r[0])); return 1; }
  if (C === 'ZREVRANGE') { const z = mem.z.get(k) || new Map(); return [...z.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]); }
  if (C === 'DEL') { mem.s.delete(k); return 1; }
  throw new Error('local kv: ' + C);
}
async function cmd(...a) {
  if (!url()) { if (process.env.DM_DEV === '1') return local(a); throw new Error('kv_off'); }
  const r = await fetch(url(), { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
  if (!r.ok) throw new Error('kv_http_' + r.status);
  const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
}
module.exports = { cmd, on: () => !!url() || process.env.DM_DEV === '1' };
