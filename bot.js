// Computer players for 10000.
const R = require('./public/rules.js');

// For n dice: chance a roll scores, and the average points of the best keep when it does.
const STATS = {};
for (let n = 1; n <= 5; n++) {
  let ok = 0, pts = 0, total = 0;
  const rec = (arr) => {
    if (arr.length === n) {
      total++;
      if (R.rollScores(arr)) { ok++; pts += R.scoreKeep(R.bestKeep(arr).map(i => arr[i])).points; }
      return;
    }
    for (let f = 1; f <= 6; f++) rec([...arr, f]);
  };
  rec([]);
  STATS[n] = { p: ok / total, gain: pts / Math.max(ok, 1) };
}

const isBot = (s, p) => !!(s.players[p] && s.players[p].bot);
const rand = (a, b) => a + Math.random() * (b - a);

// Every way to keep scoring dice from this roll.
function keepOptions(roll) {
  const out = [];
  for (let m = 1; m < (1 << roll.length); m++) {
    const idx = []; for (let i = 0; i < roll.length; i++) if (m & (1 << i)) idx.push(i);
    const sc = R.scoreKeep(idx.map(i => roll[i]));
    if (sc.valid) out.push({ idx, points: sc.points });
  }
  return out;
}

function decide(s, bot) {
  const t = s.turn, lv = s.players[bot].level;
  const score = s.scores[bot], exact = s.opts.finish === 'exact', need = R.GOAL - score;
  const opts = keepOptions(t.roll);
  if (lv !== 'hard') {
    // Easy: keep everything that scores, stop at 300 or more unless all dice can be rolled again.
    const idx = R.bestKeep(t.roll);
    const pts = R.scoreKeep(idx.map(i => t.roll[i])).points, tot = t.total + pts;
    let left = t.left - idx.length; if (left === 0) left = 5;
    const stop = (tot >= 300 && left < 5) || (exact && tot >= need) || tot >= need;
    return { idx, then: stop ? 'stop' : 'roll' };
  }
  // Hard: one step of look-ahead over every possible keep.
  let best = null;
  for (const o of opts) {
    const tot = t.total + o.points;
    if (exact && tot > need) continue;
    let left = t.left - o.idx.length; if (left === 0) left = 5;
    const stopVal = tot >= need ? 1e9 : tot;
    const st = STATS[left];
    let rollVal = st.p * (tot + st.gain);
    if (exact && tot + 50 > need) rollVal = -1; // nothing small enough left to land exactly
    if (left === 5) rollVal += 60;              // five fresh dice are worth a little extra
    const v = Math.max(stopVal, rollVal);
    const then = stopVal >= rollVal ? 'stop' : 'roll';
    if (!best || v > best.v || (v === best.v && o.idx.length < best.idx.length)) best = { v, idx: o.idx, then };
  }
  if (!best) { // every keep goes over: take the smallest and accept the loss
    const o = opts.sort((a, b) => a.points - b.points)[0];
    return { idx: o.idx, then: 'stop' };
  }
  return best;
}

function makeScheduler(commit) {
  const timers = new Map();
  function schedule(code, s) {
    clearTimeout(timers.get(code)); timers.delete(code);
    if (!s || s.status !== 'playing' || !s.turn) return;
    const p = s.turn.pid;
    if (!isBot(s, p)) return;
    const pause = Math.max(0, (s.holdUntil || 0) - Date.now()); // wait while everyone sees how the last turn ended
    if (s.turn.phase === 'start') {
      timers.set(code, setTimeout(() => commit(code, p, g => R.doRoll(g, p)), pause + rand(1200, 1900)));
    } else {
      timers.set(code, setTimeout(() => commit(code, p, g => { const d = decide(g, p); return R.keep(g, p, d.idx, d.then); }), rand(1600, 2600)));
    }
  }
  return { schedule, isBot };
}

module.exports = { makeScheduler, isBot, decide, STATS };
