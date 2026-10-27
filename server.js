// 10000 (Diez mil) online: a tiny dice game server with no dependencies.
// Run with:  node server.js   (then open http://localhost:3000)
const http = require('http');
const fs = require('fs');
const path = require('path');
const R = require('./public/rules.js');
const BOT = require('./bot.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MAX_PLAYERS = 8;
const IDLE_MS = 12 * 60 * 60 * 1000; // tables vanish after 12 idle hours

const games = new Map();   // code -> state
const streams = new Map(); // code -> Set of {res, pid}

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  for (;;) {
    const c = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
    if (!games.has(c)) return c;
  }
}
const cleanName = n => String(n || '').trim().slice(0, 20);
const cleanId = p => /^[a-z0-9]{6,40}$/i.test(String(p || '')) ? String(p) : null;

function broadcast(code) {
  const s = games.get(code);
  const set = streams.get(code);
  if (!set) return;
  const payload = JSON.stringify(s || { gone: true });
  for (const c of set) c.res.write(`data: ${payload}\n\n`);
}

function apply(s, pid, a) {
  const seated = !!(s.players && s.players[pid]);
  const host = s.host === pid;
  switch (a.type) {
    case 'join': {
      if (s.status !== 'lobby') return 'This game already started.';
      const name = cleanName(a.name); if (!name) return 'Type your name first.';
      if (!seated && Object.keys(s.players).length >= MAX_PLAYERS) return `This table is full (${MAX_PLAYERS} players).`;
      s.players[pid] = { name, joinedAt: seated ? s.players[pid].joinedAt : Date.now() };
      return null;
    }
    case 'addbot': {
      if (!host) return 'Only the host can add computer players.';
      if (s.status !== 'lobby') return 'This game already started.';
      if (Object.keys(s.players).length >= MAX_PLAYERS) return `This table is full (${MAX_PLAYERS} players).`;
      const level = a.level === 'hard' ? 'hard' : 'easy';
      const n = Object.values(s.players).filter(p => p.bot).length + 1;
      const id = 'bot' + Math.random().toString(36).slice(2, 10);
      s.players[id] = { name: `Computer${n > 1 ? ' ' + n : ''} (${level})`, joinedAt: Date.now(), bot: true, level };
      return null;
    }
    case 'removebot': {
      if (!host) return 'Only the host can remove computer players.';
      if (s.status !== 'lobby') return 'This game already started.';
      if (!s.players[a.id] || !s.players[a.id].bot) return 'That is not a computer player.';
      delete s.players[a.id]; return null;
    }
    case 'unseat': {
      if (s.status !== 'lobby') return 'The game already started.';
      delete s.players[pid];
      if (host) { const next = Object.entries(s.players).filter(e => !e[1].bot).sort((x, y) => x[1].joinedAt - y[1].joinedAt)[0]; s.host = next ? next[0] : null; }
      return null;
    }
    case 'start': {
      if (!host) return 'Only the host can start.';
      if (s.status !== 'lobby') return 'Already started.';
      s.order = Object.entries(s.players).sort((x, y) => x[1].joinedAt - y[1].joinedAt).map(x => x[0]);
      if (s.order.length < 2) return 'Needs at least 2 players.';
      R.newGame(s); return null;
    }
    case 'roll': return R.doRoll(s, pid);
    case 'keep': return R.keep(s, pid, Array.isArray(a.idx) ? a.idx : [], a.then === 'stop' ? 'stop' : 'roll');
    case 'rematch': {
      if (!(s.order || []).includes(pid)) return 'Only players can start a rematch.';
      if (s.status !== 'gameover') return 'Not yet.';
      R.newGame(s); return null;
    }
    case 'close': {
      if (!host) return 'Only the host can close the table.';
      return 'CLOSE';
    }
  }
  return 'Unknown action.';
}

// Record a change, tell everyone, and let the computer players react.
function changed(code, s) {
  s.rev = (s.rev || 0) + 1; s.updatedAt = Date.now();
  if (s.last && !s.last.rev) s.last.rev = s.rev;
  broadcast(code);
  bots.schedule(code, s);
  // Kept dice wait a moment on screen, then the rest are rolled.
  if (s.status === 'playing' && s.turn && s.turn.phase === 'pending') {
    const rev = s.rev;
    setTimeout(() => {
      const g = games.get(code);
      if (!g || g.rev !== rev) return;
      if (!R.rollPending(g)) changed(code, g);
    }, Math.max(0, s.turn.rollAt - Date.now()));
  }
}
const bots = BOT.makeScheduler((code, pid, fn) => {
  const s = games.get(code);
  if (!s) return;
  const err = fn(s);
  if (err) return;
  changed(code, s);
});

function readBody(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'GET' && url.pathname === '/api/lobby') {
    const list = [...games.values()].filter(g => g.status === 'lobby')
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 20)
      .map(g => ({ code: g.code, opts: g.opts, names: Object.values(g.players).map(p => p.name) }));
    return json(res, 200, list);
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    const pid = cleanId(url.searchParams.get('pid'));
    if (!games.has(code)) return json(res, 404, { error: `No table with code ${code}.` });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const client = { res, pid };
    if (!streams.has(code)) streams.set(code, new Set());
    streams.get(code).add(client);
    res.write(`data: ${JSON.stringify(games.get(code))}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); streams.get(code)?.delete(client); });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/create') {
    const b = await readBody(req);
    const pid = cleanId(b.pid), name = cleanName(b.name);
    if (!pid || !name) return json(res, 400, { error: 'Type your name first.' });
    const code = newCode(), now = Date.now();
    const opts = { finish: b.finish === 'reach' ? 'reach' : 'exact' };
    games.set(code, { code, host: pid, status: 'lobby', opts, createdAt: now, updatedAt: now, players: { [pid]: { name, joinedAt: now } }, rev: 0 });
    return json(res, 200, { code });
  }

  if (req.method === 'POST' && url.pathname === '/api/action') {
    const b = await readBody(req);
    const code = String(b.code || '').toUpperCase(), pid = cleanId(b.pid);
    const s = games.get(code);
    if (!s) return json(res, 404, { error: 'This table no longer exists.' });
    if (!pid || BOT.isBot(s, pid)) return json(res, 400, { error: 'Reload the page and try again.' });
    const err = apply(s, pid, b);
    if (err === 'CLOSE') { games.delete(code); broadcast(code); streams.delete(code); bots.schedule(code, null); return json(res, 200, { ok: true }); }
    if (err) return json(res, 400, { error: err });
    changed(code, s);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET') {
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const full = path.join(PUBLIC, path.normalize(file));
    if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    return fs.readFile(full, (e, data) => {
      if (e) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }
  res.writeHead(405); res.end();
});

setInterval(() => {
  const now = Date.now();
  for (const [c, g] of games) if (now - g.updatedAt > IDLE_MS) { games.delete(c); broadcast(c); streams.delete(c); bots.schedule(c, null); }
}, 10 * 60 * 1000);

server.listen(PORT, () => console.log(`10000 server running on http://localhost:${PORT}`));
