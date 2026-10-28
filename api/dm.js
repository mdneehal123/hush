const crypto = require('crypto');
const kv = require('./_kv');
const NAME = /^[a-z0-9_.]{3,20}$/;
const send = (res, c, o) => { res.setHeader('Cache-Control', 'no-store'); res.status(c).json(o); };
const key = (a, b) => [a, b].sort().join('|');
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
async function newSession(u) { const t = crypto.randomBytes(24).toString('hex'); await kv.cmd('SET', 'sess:' + t, u, 'EX', 60 * 60 * 24 * 60); return t; }
async function who(req) {
  const t = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!/^[a-f0-9]{48}$/.test(t)) return null;
  return await kv.cmd('GET', 'sess:' + t);
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { ok: false });
  if (!kv.on()) return send(res, 503, { ok: false, error: 'Database not connected yet.' });
  let b = req.body || {}; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const a = String(b.action || '');
  try {
    if (a === 'signup') {
      const code = (process.env.INVITE_CODE || '').trim();
      if (!code) return send(res, 503, { ok: false, error: 'Sign-up is not switched on yet.' });
      const u = String(b.username || '').toLowerCase().trim(), pw = String(b.password || '');
      if (String(b.invite || '').trim() !== code) return send(res, 403, { ok: false, error: 'Wrong invite code.' });
      if (!NAME.test(u)) return send(res, 400, { ok: false, error: 'Username: 3-20 letters, numbers, . or _' });
      if (pw.length < 6 || pw.length > 100) return send(res, 400, { ok: false, error: 'Password must be at least 6 characters.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const ok = await kv.cmd('SET', 'user:' + u, JSON.stringify({ salt, h: hash(pw, salt) }), 'NX');
      if (!ok) return send(res, 409, { ok: false, error: 'That username is taken.' });
      await kv.cmd('SADD', 'users', u);
      return send(res, 200, { ok: true, token: await newSession(u), username: u });
    }
    if (a === 'login') {
      const u = String(b.username || '').toLowerCase().trim(), pw = String(b.password || '');
      const raw = NAME.test(u) ? await kv.cmd('GET', 'user:' + u) : null;
      if (!raw) return send(res, 401, { ok: false, error: 'Wrong username or password.' });
      const r = JSON.parse(raw);
      if (!same(hash(pw, r.salt), r.h)) return send(res, 401, { ok: false, error: 'Wrong username or password.' });
      return send(res, 200, { ok: true, token: await newSession(u), username: u });
    }
    const me = await who(req);
    if (!me) return send(res, 401, { ok: false, error: 'login' });
    if (a === 'me') return send(res, 200, { ok: true, username: me });
    if (a === 'users') {
      const q = String(b.q || '').toLowerCase().trim();
      const all = (await kv.cmd('SMEMBERS', 'users')) || [];
      return send(res, 200, { ok: true, users: all.filter(x => x !== me && x.includes(q)).sort().slice(0, 30) });
    }
    if (a === 'inbox') {
      const peers = (await kv.cmd('ZREVRANGE', 'chats:' + me, 0, -1)) || [];
      const out = [];
      for (const p of peers.slice(0, 100)) {
        const k = key(me, p); const n = Number(await kv.cmd('LLEN', 'chat:' + k)) || 0;
        const last = n ? JSON.parse((await kv.cmd('LRANGE', 'chat:' + k, n - 1, n - 1))[0]) : null;
        const read = Number(await kv.cmd('GET', 'read:' + me + ':' + k)) || 0;
        out.push({ peer: p, last, unread: Math.max(0, n - read) });
      }
      return send(res, 200, { ok: true, chats: out });
    }
    const peer = String(b.peer || '').toLowerCase();
    if (a === 'thread' || a === 'send') {
      if (!NAME.test(peer) || peer === me || !(await kv.cmd('GET', 'user:' + peer))) return send(res, 404, { ok: false, error: 'No such user.' });
      const k = key(me, peer);
      if (a === 'send') {
        const text = String(b.text || '').trim().slice(0, 1000);
        if (!text) return send(res, 400, { ok: false, error: 'Empty message.' });
        const now = Date.now();
        await kv.cmd('RPUSH', 'chat:' + k, JSON.stringify({ f: me, t: text, ts: now }));
        await kv.cmd('ZADD', 'chats:' + me, now, peer); await kv.cmd('ZADD', 'chats:' + peer, now, me);
      }
      const n = Number(await kv.cmd('LLEN', 'chat:' + k)) || 0;
      const after = Math.max(0, Number(b.after) || 0);
      const msgs = n > after ? ((await kv.cmd('LRANGE', 'chat:' + k, after, n - 1)) || []).map(x => JSON.parse(x)) : [];
      await kv.cmd('SET', 'read:' + me + ':' + k, n);
      return send(res, 200, { ok: true, msgs, next: n });
    }
    return send(res, 400, { ok: false });
  } catch (e) { return send(res, 500, { ok: false, error: 'Something went wrong. Try again.' }); }
};
