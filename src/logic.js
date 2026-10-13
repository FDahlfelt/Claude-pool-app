// Tournament logic. Pure data in, data out (apart from in-place match updates),
// so it can be tested without a browser.

export const BYE = '__bye';
/** An empty slot in the losers' bracket: the winners' match it waits on had a bye, so nobody drops. */
export const NONE = '__none';
export const FORMATS = ['league', 'groups', 'swiss', 'knockout', 'double'];
/** Formats that are a bracket from the start. */
export const isBracketFormat = f => f === 'knockout' || f === 'double';
export const GAMES = ['8ball', '9ball', '10ball', 'other'];
export const MAX_PLAYERS = 64;

export const DEFAULT_SETTINGS = {
  raceTo: 3,        // group stage / league / swiss
  koRace: 4,        // knockout rounds before the final, and the bronze match
  finalRace: 5,
  pointsPerWin: 1,
  legs: 1,          // 2 = everyone meets twice
  groupCount: 2,
  advance: 2,       // per group
  swissRounds: 4,
  playoffSize: 4,   // league and swiss: 0, 2, 4 or 8
  bronze: true,
  tables: 1,
  breakRule: 'alternate', // or 'winner'
  seeding: 'random',      // knockout: 'random' or 'list'
  gfReset: true,          // double knockout: a second grand final if the losers' side wins the first
  ballCount: true,        // record the loser's balls left after each frame, used as a tiebreaker
};

/** Object balls a player can have left when losing a frame. */
export const MAX_BALLS = { '8ball': 7, '9ball': 8, '10ball': 9, other: 7 };
export const maxBalls = game => MAX_BALLS[game] ?? 7;

export const uid = () => Math.random().toString(36).slice(2, 10);

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const mkMatch = (a, b, extra = {}) => ({ id: uid(), a, b, sa: null, sb: null, frames: [], ...extra });

export const isBye = m => m.b === BYE;
export const isDone = m => !!m && (isBye(m) || (m.sa != null && m.sb != null));
export const isReady = m => !!m && !!m.a && !!m.b && !isBye(m);
export const isLive = m => isReady(m) && !isDone(m) && !!m.startedAt;
export const winnerOf = m => !isDone(m) ? null : isBye(m) ? m.a : (m.sa > m.sb ? m.a : m.b);
export const loserOf = m => !isDone(m) || isBye(m) ? null : (m.sa > m.sb ? m.b : m.a);
const pairKey = (x, y) => (x < y ? x + '|' + y : y + '|' + x);

/** Current score, including frames of a match still in progress. */
export function score(m) {
  if (isDone(m) && !isBye(m)) return [m.sa, m.sb];
  let a = 0, b = 0;
  for (const f of m.frames || []) f.w === 'a' ? a++ : b++;
  return [a, b];
}

/**
 * Balls left on the table for each side, summed over the frames that side lost.
 * A match entered as a final score may carry its own totals in m.balls.
 */
export function ballsLeft(m) {
  if (Array.isArray(m.balls)) return m.balls;
  let a = 0, b = 0;
  for (const f of m.frames || []) {
    if (f.left == null) continue;
    if (f.w === 'a') b += f.left; else a += f.left;
  }
  return [a, b];
}

// ---------- Schedules ----------

/** Round robin via the circle method. Odd player counts get one bye per round. */
export function roundRobin(ids, { legs = 1, extra } = {}) {
  const list = shuffle(ids);
  if (list.length % 2) list.push(null);
  const n = list.length;
  let arr = list.slice();
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const matches = [], byes = [];
    for (let i = 0; i < n / 2; i++) {
      let a = arr[i], b = arr[n - 1 - i];
      if (a === null || b === null) { byes.push(a ?? b); continue; }
      if (r % 2 === 1) [a, b] = [b, a];
      matches.push(mkMatch(a, b, extra));
    }
    rounds.push({ matches: shuffle(matches), byes });
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  if (legs < 2) return rounds;
  const second = rounds.map(r => ({ matches: r.matches.map(m => mkMatch(m.b, m.a, extra)), byes: r.byes.slice() }));
  return [...rounds, ...second];
}

export const groupSizes = (n, g) => Array.from({ length: g }, (_, i) => Math.floor(n / g) + (i < n % g ? 1 : 0));

/** Groups played side by side: round i holds round i of every group. */
export function groupStage(ids, count, legs = 1) {
  const list = shuffle(ids);
  const groups = Array.from({ length: count }, (_, i) => ({ name: String.fromCharCode(65 + i), players: [] }));
  list.forEach((id, i) => groups[i % count].players.push(id));
  const scheds = groups.map(g => roundRobin(g.players, { legs, extra: { group: g.name } }));
  const n = Math.max(...scheds.map(s => s.length));
  const rounds = Array.from({ length: n }, (_, i) => ({
    matches: scheds.flatMap(s => s[i]?.matches ?? []),
    byes: scheds.flatMap(s => s[i]?.byes ?? []),
  }));
  return { groups, rounds };
}

/** Swiss round: pair neighbours in the standings without rematches. */
export function swissRound(order, played = new Set(), byeHistory = new Set()) {
  const list = order.slice();
  const byes = [];
  if (list.length % 2) {
    let idx = list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) if (!byeHistory.has(list[i])) { idx = i; break; }
    byes.push(list.splice(idx, 1)[0]);
  }
  let steps = 0;
  // `allow` = how many rematches the round may contain; we try 0 first, then as few as possible.
  const pair = (rest, allow) => {
    if (!rest.length) return [];
    if (++steps > 20000) return null;
    const [first, ...others] = rest;
    for (let j = 0; j < others.length; j++) {
      const again = played.has(pairKey(first, others[j])) ? 1 : 0;
      if (again > allow) continue;
      const sub = pair(others.filter((_, k) => k !== j), allow - again);
      if (sub) return [[first, others[j]], ...sub];
    }
    return null;
  };
  let pairs = null;
  for (let allow = 0; !pairs && allow <= list.length / 2; allow++) { steps = 0; pairs = pair(list, allow); }
  if (!pairs) {
    pairs = [];
    for (let i = 0; i < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
  }
  return { matches: pairs.map(([a, b]) => mkMatch(a, b)), byes };
}

// ---------- Brackets ----------

/** Standard bracket order: seed 1 and 2 can only meet in the final. */
export function seedOrder(size) {
  let o = [1];
  while (o.length < size) {
    const s = o.length * 2;
    o = o.flatMap(x => [x, s + 1 - x]);
  }
  return o;
}

/** Single elimination from a seed list (best first). Missing seeds become byes for the top seeds. */
export function makeBracket(seeds, { bronze = false, labels = [] } = {}) {
  let size = 2;
  while (size < seeds.length) size *= 2;
  const order = seedOrder(size);
  const first = [];
  for (let i = 0; i < size; i += 2) {
    let s1 = order[i], s2 = order[i + 1];
    if (s1 > seeds.length) [s1, s2] = [s2, s1];
    first.push(mkMatch(seeds[s1 - 1], s2 <= seeds.length ? seeds[s2 - 1] : BYE));
  }
  const rounds = [first];
  for (let n = size / 4; n >= 1; n /= 2) rounds.push(Array.from({ length: n }, () => mkMatch(null, null)));
  const semis = rounds.length >= 2 ? rounds[rounds.length - 2] : null;
  const seedLabels = {};
  labels.forEach((l, i) => { if (seeds[i]) seedLabels[seeds[i]] = l; });
  const br = { rounds, bronze: bronze && semis && !semis.some(isBye) ? mkMatch(null, null) : null, labels: seedLabels };
  syncBracket(br);
  return br;
}

/** Move winners (and semifinal losers) on through the bracket. Clears matches whose players changed. */
export function syncBracket(br) {
  if (!br) return;
  const fill = (m, a, b) => {
    if (m.a !== a || m.b !== b) {
      Object.assign(m, { a, b, sa: null, sb: null, frames: [], startedAt: null, endedAt: null, table: null });
      delete m.balls;
      delete m.wo;          // a walkover belonged to the old pairing
      delete m.firstBreak;
    }
  };
  for (let r = 1; r < br.rounds.length; r++) {
    br.rounds[r].forEach((m, i) => fill(m, winnerOf(br.rounds[r - 1][2 * i]), winnerOf(br.rounds[r - 1][2 * i + 1])));
  }
  if (br.bronze && br.rounds.length >= 2) {
    const semis = br.rounds[br.rounds.length - 2];
    fill(br.bronze, loserOf(semis[0]), loserOf(semis[1]));
  }
  if (br.lower) syncDouble(br, fill);
}

// ---------- Double knockout ----------

/**
 * Who a losers'-bracket slot gets: a player, null (not decided yet) or NONE (nobody will come,
 * because the winners' match it waits on was a bye or an empty slot).
 */
function resolveSource(br, [side, r, i, take]) {
  const m = side === 'W' ? br.rounds[r][i] : br.lower[r][i];
  if (!isDone(m)) return null;
  if (take === 'L') return isBye(m) ? NONE : loserOf(m);
  return winnerOf(m);
}

function syncDouble(br, fill) {
  for (const round of br.lower) {
    for (const m of round) {
      const a = resolveSource(br, m.src[0]), b = resolveSource(br, m.src[1]);
      if (a === null || b === null) fill(m, a === NONE ? null : a, b === NONE ? null : b);
      else if (a === NONE && b === NONE) fill(m, NONE, BYE);
      else if (a === NONE) fill(m, b, BYE);   // the player still standing goes straight on
      else if (b === NONE) fill(m, a, BYE);
      else fill(m, a, b);
    }
  }
  const [gf, reset] = br.grand;
  fill(gf, resolveSource(br, gf.src[0]), resolveSource(br, gf.src[1]));
  if (!reset) return;
  // The losers' champion has one loss, the winners' champion none: if the losers' side wins
  // the grand final, both have one loss and they play once more.
  if (!isDone(gf)) fill(reset, null, null);
  else if (winnerOf(gf) === gf.b) fill(reset, gf.a, gf.b);
  else fill(reset, NONE, BYE);
}

/** Double elimination: a normal bracket (winners' side) plus a losers' side and a grand final. */
export function makeDouble(seeds, { reset = true, labels = [] } = {}) {
  const br = makeBracket(seeds, { bronze: false, labels });
  const k = br.rounds.length, size = 2 ** k;
  const lower = [];
  // Round 1: losers of the winners' first round play each other.
  lower.push(Array.from({ length: size / 4 }, (_, i) => mkMatch(null, null, { src: [['W', 0, 2 * i, 'L'], ['W', 0, 2 * i + 1, 'L']] })));
  for (let j = 1; j < k; j++) {
    const n = br.rounds[j].length, prev = lower.length - 1;
    // Drop round: survivors meet the losers of winners' round j, in crossed order on every
    // other round so people who just met don't meet again.
    lower.push(Array.from({ length: n }, (_, i) => mkMatch(null, null, { src: [['B', prev, i, 'W'], ['W', j, j % 2 ? n - 1 - i : i, 'L']] })));
    if (j < k - 1) {
      const d = lower.length - 1;
      lower.push(Array.from({ length: n / 2 }, (_, i) => mkMatch(null, null, { src: [['B', d, 2 * i, 'W'], ['B', d, 2 * i + 1, 'W']] })));
    }
  }
  br.lower = lower;
  br.grand = [mkMatch(null, null, { src: [['W', k - 1, 0, 'W'], ['B', lower.length - 1, 0, 'W']] }), reset ? mkMatch(null, null) : null];
  syncBracket(br);
  return br;
}

/** Swap opponents in the first round so players from the same group don't meet straight away. */
export function separateGroups(first, groupOf) {
  const clash = m => !isBye(m) && groupOf(m.a) && groupOf(m.a) === groupOf(m.b);
  for (let i = 0; i < first.length; i++) {
    if (!clash(first[i])) continue;
    for (let j = 0; j < first.length; j++) {
      const x = first[i], y = first[j];
      if (i === j || isBye(y)) continue;
      if (groupOf(x.a) !== groupOf(y.b) && groupOf(y.a) !== groupOf(x.b)) {
        [x.b, y.b] = [y.b, x.b];
        break;
      }
    }
  }
}

// ---------- Standings ----------

export function computeStandings({ players, matches, byes = [], pointsPerWin = 1, byeWins = false, buchholz = false, balls = false }) {
  const rows = new Map(players.map(p => [p.id, { id: p.id, name: p.name, p: 0, w: 0, l: 0, ff: 0, fa: 0, bf: 0, ba: 0, form: [], byes: 0, opp: [] }]));
  for (const m of matches) {
    if (isBye(m) || !isDone(m)) continue;
    const A = rows.get(m.a), B = rows.get(m.b);
    if (!A || !B) continue;
    A.p++; B.p++;
    A.ff += m.sa; A.fa += m.sb; B.ff += m.sb; B.fa += m.sa;
    // Ball difference: the opponent's balls left count for you, your own against you.
    const [la, lb] = ballsLeft(m);
    A.bf += lb; A.ba += la; B.bf += la; B.ba += lb;
    A.opp.push(B.id); B.opp.push(A.id);
    const aWon = m.sa > m.sb;
    (aWon ? A : B).w++;
    (aWon ? B : A).l++;
    A.form.push(aWon ? 'W' : 'L');
    B.form.push(aWon ? 'L' : 'W');
  }
  if (byeWins) for (const id of byes) {
    const r = rows.get(id);
    if (r) { r.byes++; r.w++; r.form.push('B'); }
  }
  const list = [...rows.values()];
  list.forEach(r => { r.diff = r.ff - r.fa; r.bdiff = r.bf - r.ba; r.pts = r.w * pointsPerWin; });
  if (buchholz) {
    const pts = new Map(list.map(r => [r.id, r.pts]));
    list.forEach(r => { r.bh = r.opp.reduce((s, o) => s + pts.get(o), 0); });
  }
  // Head to head: who won more of the matches between the two.
  const h2h = (x, y) => {
    let n = 0;
    for (const m of matches) {
      if (!isDone(m) || isBye(m)) continue;
      if ((m.a === x && m.b === y) || (m.a === y && m.b === x)) n += winnerOf(m) === x ? -1 : 1;
    }
    return Math.sign(n);
  };
  list.sort((x, y) =>
    y.pts - x.pts ||
    (buchholz ? y.bh - x.bh : 0) ||
    y.diff - x.diff ||
    (balls ? y.bdiff - x.bdiff : 0) ||
    y.ff - x.ff ||
    h2h(x.id, y.id) ||
    x.name.localeCompare(y.name));
  return list;
}

// ---------- Planning ----------

export function playoffCount(format, n, s) {
  if (isBracketFormat(format)) return 0;
  if (format === 'groups') return Math.min(n, s.groupCount * s.advance);
  return Math.min(n, s.playoffSize);
}

/** How many matches a setup gives, for the setup screen. */
export function plan(format, n, s) {
  const c2 = k => (k * (k - 1)) / 2;
  let stage = 0, per = [0, 0];
  if (format === 'league') {
    stage = s.legs * c2(n);
    per = [s.legs * (n - 1), s.legs * (n - 1)];
  } else if (format === 'groups') {
    const sizes = groupSizes(n, s.groupCount);
    stage = sizes.reduce((sum, k) => sum + s.legs * c2(k), 0);
    per = [s.legs * (Math.min(...sizes) - 1), s.legs * (Math.max(...sizes) - 1)];
  } else if (format === 'swiss') {
    stage = s.swissRounds * Math.floor(n / 2);
    per = [n % 2 ? Math.max(s.swissRounds - 1, 0) : s.swissRounds, s.swissRounds];
  }
  let playoff;
  if (format === 'knockout') {
    playoff = Math.max(n - 1, 0) + (s.bronze && n >= 4 ? 1 : 0);
    per = [1, Math.ceil(Math.log2(Math.max(n, 2)))];
  } else if (format === 'double') {
    // Everyone but the winner loses twice, the winner at most once (a possible extra final aside).
    playoff = Math.max(2 * n - 2, 0);
    per = [2, 2 * Math.ceil(Math.log2(Math.max(n, 2))) + 2];
  } else {
    const P = playoffCount(format, n, s);
    playoff = P >= 2 ? P - 1 + (s.bronze && P >= 4 ? 1 : 0) : 0;
  }
  return { stage, playoff, total: stage + playoff, per };
}

/** Returns an error code for an impossible setup, or null. */
export function validate(format, n, s) {
  if (n < 2) return 'minPlayers2';
  if (n > MAX_PLAYERS) return 'maxPlayers';
  if (format !== 'knockout' && n < 3) return 'minPlayers3';
  if (format === 'groups') {
    if (s.groupCount < 2 || s.groupCount * 2 > n) return 'groupsTooMany';
    if (s.advance < 1 || s.advance > Math.min(...groupSizes(n, s.groupCount)) || s.groupCount * s.advance < 2) return 'advance';
  }
  if (format === 'swiss' && (s.swissRounds < 1 || s.swissRounds > n - 1)) return 'swissRounds';
  return null;
}

export const recommendedSwissRounds = n => Math.max(1, Math.min(n - 1, Math.ceil(Math.log2(Math.max(n, 2))) + 1));

// ---------- Tournament ----------

export function createTournament({ name, format, game = '8ball', names, settings }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const players = names.map(n => ({ id: uid(), name: n }));
  const ids = players.map(p => p.id);
  if (format === 'league' || format === 'swiss') s.playoffSize = Math.min(s.playoffSize, ids.length);
  const t = {
    id: uid(), v: 2, name, format, game, players, settings: s,
    rounds: [], groups: null, bracket: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  if (format === 'league') t.rounds = roundRobin(ids, { legs: s.legs });
  else if (format === 'groups') Object.assign(t, groupStage(ids, s.groupCount, s.legs));
  else if (format === 'swiss') t.rounds = [swissRound(shuffle(ids))];
  else if (format === 'double') t.bracket = makeDouble(s.seeding === 'list' ? ids : shuffle(ids), { reset: s.gfReset });
  else t.bracket = makeBracket(s.seeding === 'list' ? ids : shuffle(ids), { bronze: s.bronze });
  return t;
}

export const stageMatches = t => t.rounds.flatMap(r => r.matches);
export const bracketMatches = t => (t.bracket
  ? [...t.bracket.rounds.flat(), t.bracket.bronze, ...(t.bracket.lower || []).flat(), ...(t.bracket.grand || [])].filter(Boolean)
  : []);
export const allMatches = t => [...stageMatches(t), ...bracketMatches(t)];
export const playerName = (t, id) => t.players.find(p => p.id === id)?.name ?? '?';
export const hasPlayoff = t => !isBracketFormat(t.format) && playoffCount(t.format, t.players.length, t.settings) >= 2;

export function standingsFor(t, ids) {
  const players = ids ? t.players.filter(p => ids.includes(p.id)) : t.players;
  const set = new Set(players.map(p => p.id));
  return computeStandings({
    players,
    matches: stageMatches(t).filter(m => set.has(m.a) && set.has(m.b)),
    byes: t.rounds.flatMap(r => r.byes),
    pointsPerWin: t.settings.pointsPerWin,
    byeWins: t.format === 'swiss',
    buchholz: t.format === 'swiss',
    balls: !!t.settings.ballCount,
  });
}

export function stageComplete(t) {
  if (isBracketFormat(t.format)) return true;
  const done = stageMatches(t).every(isDone);
  return t.format === 'swiss' ? done && t.rounds.length >= t.settings.swissRounds : done;
}

export const canNextSwissRound = t =>
  t.format === 'swiss' && !t.bracket && t.rounds.length < t.settings.swissRounds && t.rounds[t.rounds.length - 1].matches.every(isDone);

export function nextSwissRound(t) {
  const order = standingsFor(t).map(r => r.id).filter(id => !isWithdrawn(t, id));
  const played = new Set(stageMatches(t).map(m => pairKey(m.a, m.b)));
  const byeHistory = new Set(t.rounds.flatMap(r => r.byes));
  t.rounds.push(swissRound(order, played, byeHistory));
}

/** Players who would go through to the playoff right now, best seed first. */
export function qualifiers(t) {
  const s = t.settings;
  if (t.format === 'groups') {
    const tables = t.groups.map(g => standingsFor(t, g.players));
    const out = [];
    const active = tables.map(tb => tb.filter(r => !isWithdrawn(t, r.id)));
    for (let r = 0; r < s.advance; r++) {
      active.forEach((tb, gi) => { if (tb[r]) out.push({ id: tb[r].id, label: t.groups[gi].name + (r + 1) }); });
    }
    return out;
  }
  return standingsFor(t).filter(r => !isWithdrawn(t, r.id)).slice(0, playoffCount(t.format, t.players.length, s)).map((r, i) => ({ id: r.id, label: '#' + (i + 1) }));
}

export function startPlayoff(t) {
  // Only formats with a playoff, and only once; a knockout already is its bracket.
  if (!hasPlayoff(t) || t.bracket) return false;
  const q = qualifiers(t);
  if (q.length < 2) return false;
  t.bracket = makeBracket(q.map(x => x.id), { bronze: t.settings.bronze, labels: q.map(x => x.label) });
  if (t.format === 'groups') {
    const groupOf = id => t.groups.find(g => g.players.includes(id))?.name;
    separateGroups(t.bracket.rounds[0], groupOf);
    syncBracket(t.bracket);
  }
  return true;
}

export function podium(t) {
  if (t.bracket?.grand) {
    const [gf, reset] = t.bracket.grand;
    if (!isDone(gf) || !winnerOf(gf)) return null;
    let final = gf;
    if (reset && winnerOf(gf) === gf.b) {
      if (!isDone(reset) || isBye(reset)) return null;
      final = reset;
    }
    const lowerFinal = t.bracket.lower[t.bracket.lower.length - 1][0];
    return { first: winnerOf(final), second: loserOf(final), third: loserOf(lowerFinal) };
  }
  if (t.bracket) {
    const final = t.bracket.rounds[t.bracket.rounds.length - 1][0];
    if (!isDone(final) || !winnerOf(final)) return null;
    return { first: winnerOf(final), second: loserOf(final), third: t.bracket.bronze ? winnerOf(t.bracket.bronze) : null };
  }
  if (!isBracketFormat(t.format) && !hasPlayoff(t) && stageComplete(t)) {
    const st = standingsFor(t);
    return { first: st[0]?.id ?? null, second: st[1]?.id ?? null, third: st[2]?.id ?? null };
  }
  return null;
}

/** 'stage' | 'nextRound' | 'readyForPlayoff' | 'playoff' | 'done' */
export function phase(t) {
  if (podium(t)) return 'done';
  if (t.bracket) return 'playoff';
  if (canNextSwissRound(t)) return 'nextRound';
  if (stageComplete(t) && hasPlayoff(t)) return 'readyForPlayoff';
  return 'stage';
}

export function progress(t) {
  const real = allMatches(t).filter(m => !isBye(m));
  const done = real.filter(isDone).length;
  // The plan assumes everyone plays to the end; withdrawals or an early playoff leave fewer matches.
  if (phase(t) === 'done') return { done, total: done };
  if (t.format === 'double') {
    // Slots that will turn out empty aren't known yet, so count from the plan.
    const reset = t.bracket?.grand?.[1];
    const extra = reset && !isBye(reset) && reset.a ? 1 : 0;
    return { done, total: Math.max(plan('double', t.players.length, t.settings).total + extra, done) };
  }
  const total = Math.max(plan(t.format, t.players.length, t.settings).total, real.length);
  return { done, total };
}

/** Where a match sits and what it is played to. */
export function matchInfo(t, id) {
  for (let i = 0; i < t.rounds.length; i++) {
    const m = t.rounds[i].matches.find(x => x.id === id);
    if (m) return { m, race: t.settings.raceTo, stage: 'stage', round: i };
  }
  if (t.bracket) {
    const R = t.bracket.rounds;
    for (let r = 0; r < R.length; r++) {
      const m = R[r].find(x => x.id === id);
      if (m) {
        const dbl = !!t.bracket.grand; // in a double knockout the winners' final is not the last match
        return { m, race: r === R.length - 1 && !dbl ? t.settings.finalRace : t.settings.koRace, stage: 'bracket', round: r, order: 2 * r, fromEnd: R.length - 1 - r, side: dbl ? 'W' : undefined };
      }
    }
    if (t.bracket.bronze?.id === id) return { m: t.bracket.bronze, race: t.settings.koRace, stage: 'bracket', bronze: true, round: R.length - 1, order: 2 * (R.length - 1) - 0.5 };
    if (t.bracket.lower) {
      const Lo = t.bracket.lower;
      for (let r = 0; r < Lo.length; r++) {
        const m = Lo[r].find(x => x.id === id);
        // Losers' round 0 follows winners' round 0; after that each pair of losers' rounds
        // follows the winners' round whose losers drop into it.
        if (m) return { m, race: t.settings.koRace, stage: 'bracket', side: 'L', round: R.length + r, lround: r, order: r === 0 ? 1 : 2 * Math.ceil(r / 2) + (r % 2 ? 1 : 1.5), fromEnd: Lo.length - 1 - r };
      }
      const g = t.bracket.grand.findIndex(x => x?.id === id);
      if (g >= 0) return { m: t.bracket.grand[g], race: t.settings.finalRace, stage: 'bracket', side: 'G', grand: g, round: R.length + Lo.length + g, order: 2 * R.length + g };
    }
  }
  return null;
}

// ---------- Playing a match ----------

export function breakerFor(m, i, rule) {
  const first = m.firstBreak || 'a';
  if (i === 0) return first;
  if (rule === 'winner') return m.frames[i - 1].w;
  return i % 2 === 0 ? first : first === 'a' ? 'b' : 'a';
}

export function startMatch(t, m) {
  if (m.startedAt) return;
  m.startedAt = Date.now();
  if (m.table == null && t.settings.tables > 1) {
    const used = new Set(allMatches(t).filter(x => x !== m && isLive(x)).map(x => x.table));
    for (let k = 1; k <= t.settings.tables; k++) if (!used.has(k)) { m.table = k; break; }
  } else if (t.settings.tables <= 1) m.table = null;
}

/** Adds a frame won by side 'a' or 'b'. Returns true when that finished the match. */
export function addFrame(t, m, side, race) {
  if (isDone(m) || !isReady(m)) return false;
  startMatch(t, m);
  m.frames = m.frames || [];
  delete m.balls;
  m.frames.push({ w: side, b: breakerFor(m, m.frames.length, t.settings.breakRule), at: Date.now() });
  const [a, b] = score(m);
  if (a >= race || b >= race) {
    m.sa = a; m.sb = b; m.endedAt = Date.now();
    syncBracket(t.bracket);
    return true;
  }
  return false;
}

export function undoFrame(t, m) {
  if (!m.frames?.length) return;
  m.frames.pop();
  delete m.balls;
  if (m.sa != null) { m.sa = null; m.sb = null; m.endedAt = null; syncBracket(t.bracket); }
}

/** Records how many balls the loser of frame i had left. black = lost by potting the 8 too early. */
export function setFrameBalls(t, m, i, left, black = false) {
  const f = m.frames?.[i];
  if (!f) return;
  delete m.balls;
  if (left == null && !black) { delete f.left; delete f.black; return; }
  f.left = black ? maxBalls(t.game) : Math.max(0, Math.min(maxBalls(t.game), left));
  if (black) f.black = true; else delete f.black;
}

export function setResult(t, m, sa, sb, balls) {
  const [fa, fb] = score({ frames: m.frames });
  if (fa !== sa || fb !== sb) m.frames = [];
  if (balls) m.balls = balls; else delete m.balls;
  delete m.wo; // a real score replaces a walkover
  m.sa = sa; m.sb = sb;
  m.endedAt = Date.now();
  m.startedAt = m.startedAt || m.endedAt;
  syncBracket(t.bracket);
}

/**
 * How many other matches that are already under way or played a change to `m` would wipe,
 * e.g. undoing a semi-final empties the final. `change(t, m)` runs on a copy.
 */
export function laterLost(t, m, change) {
  if (!t.bracket) return 0;
  const copy = JSON.parse(JSON.stringify(t));
  change(copy, matchInfo(copy, m.id).m);
  const after = new Map(allMatches(copy).map(x => [x.id, x]));
  const played = x => !isBye(x) && (isDone(x) || !!x.startedAt);
  return allMatches(t).filter(x => x.id !== m.id && played(x) && !played(after.get(x.id) || {})).length;
}

export function clearMatch(t, m) {
  Object.assign(m, { sa: null, sb: null, frames: [], startedAt: null, endedAt: null, table: null });
  delete m.balls;
  delete m.wo;
  syncBracket(t.bracket);
}

/**
 * Walkover: the match counts as won race–0 without being played.
 * `reason` is 'wo' (entered by hand) or 'withdraw' (the opponent left the tournament).
 */
export function setWalkover(t, m, side, race, reason = 'wo') {
  if (!isReady(m)) return;
  Object.assign(m, { sa: side === 'a' ? race : 0, sb: side === 'b' ? race : 0, frames: [], wo: reason, endedAt: Date.now(), table: null });
  m.startedAt = m.startedAt || m.endedAt;
  delete m.balls;
  syncBracket(t.bracket);
}

const isWithdrawn = (t, id) => !!t.players.find(p => p.id === id)?.withdrawn;

/** Gives every open match of a player who withdrew to the opponent as a walkover. */
function walkoverOpen(t) {
  // Bracket matches only fill in as earlier ones finish, so repeat until nothing changes.
  for (let changed = true; changed;) {
    changed = false;
    for (const m of allMatches(t)) {
      if (!isReady(m) || isDone(m)) continue;
      const wa = isWithdrawn(t, m.a), wb = isWithdrawn(t, m.b);
      if (wa === wb) continue; // neither, or both gone: leave it to the people at the table
      setWalkover(t, m, wa ? 'b' : 'a', matchInfo(t, m.id).race, 'withdraw');
      changed = true;
    }
  }
}

export function withdrawPlayer(t, id) {
  const p = t.players.find(x => x.id === id);
  if (!p || p.withdrawn) return;
  p.withdrawn = true;
  walkoverOpen(t);
}

/** Undoes a withdrawal: the walkovers it caused are reopened. */
export function reinstatePlayer(t, id) {
  const p = t.players.find(x => x.id === id);
  if (!p?.withdrawn) return;
  delete p.withdrawn;
  for (const m of allMatches(t)) if (m.wo === 'withdraw' && loserOf(m) === id) clearMatch(t, m);
  walkoverOpen(t); // others who withdrew keep their walkovers
}

/** Keeps walkovers in step after new matches appear (a Swiss round, the playoff, a bracket step). */
export const applyWithdrawals = t => { if (t.players.some(p => p.withdrawn)) walkoverOpen(t); };

export const validScore = (a, b, race) => (a === race && b < race) || (b === race && a < race);

/** Ready matches that nobody is playing yet, best candidates first. */
export function upNext(t) {
  const all = allMatches(t);
  const busy = new Set(all.filter(isLive).flatMap(m => [m.a, m.b]));
  const lastPlayed = {};
  for (const m of all) if (m.endedAt) for (const p of [m.a, m.b]) lastPlayed[p] = Math.max(lastPlayed[p] || 0, m.endedAt);
  const order = new Map(all.map((m, i) => [m.id, i]));
  const roundOf = m => { const i = matchInfo(t, m.id); return i?.order ?? i?.round ?? 0; };
  return all
    .filter(m => isReady(m) && !isDone(m) && !isLive(m) && !busy.has(m.a) && !busy.has(m.b))
    .sort((x, y) =>
      (matchInfo(t, x.id).stage === 'bracket') - (matchInfo(t, y.id).stage === 'bracket') ||
      roundOf(x) - roundOf(y) ||
      Math.max(lastPlayed[x.a] || 0, lastPlayed[x.b] || 0) - Math.max(lastPlayed[y.a] || 0, lastPlayed[y.b] || 0) ||
      order.get(x.id) - order.get(y.id));
}

// ---------- Statistics ----------

export function playerStats(t) {
  const rows = new Map(t.players.map(p => [p.id, { id: p.id, name: p.name, p: 0, w: 0, l: 0, ff: 0, fa: 0, bf: 0, ba: 0, br: 0, blacks: 0, best: 0, cur: 0, shutouts: 0 }]));
  const ms = allMatches(t).filter(m => isDone(m) && !isBye(m) && !m.wo);
  const chrono = ms.map((m, i) => ({ m, i })).sort((x, y) => (x.m.endedAt || 0) - (y.m.endedAt || 0) || x.i - y.i).map(x => x.m);
  const highlights = { biggest: null, longest: null, frames: 0, br: 0, blacks: 0 };
  for (const m of chrono) {
    const A = rows.get(m.a), B = rows.get(m.b);
    if (!A || !B) continue;
    const aWon = m.sa > m.sb;
    const [W, L] = aWon ? [A, B] : [B, A];
    A.p++; B.p++; W.w++; L.l++;
    A.ff += m.sa; A.fa += m.sb; B.ff += m.sb; B.fa += m.sa;
    W.cur++; W.best = Math.max(W.best, W.cur); L.cur = 0;
    if (Math.min(m.sa, m.sb) === 0) W.shutouts++;
    for (const f of m.frames || []) {
      if (f.br && f.w === f.b) { (f.w === 'a' ? A : B).br++; highlights.br++; }
      if (f.black) { (f.w === 'a' ? B : A).blacks++; highlights.blacks++; }
    }
    const [la, lb] = ballsLeft(m);
    A.bf += lb; A.ba += la; B.bf += la; B.ba += lb;
    const margin = Math.abs(m.sa - m.sb), total = m.sa + m.sb;
    highlights.frames += total;
    const big = highlights.biggest;
    if (!big || margin > big.margin || (margin === big.margin && Math.max(m.sa, m.sb) > big.top)) highlights.biggest = { m, margin, top: Math.max(m.sa, m.sb) };
    if (!highlights.longest || total > highlights.longest.total) highlights.longest = { m, total };
  }
  const list = [...rows.values()];
  list.forEach(r => {
    r.winPct = r.p ? r.w / r.p : 0;
    r.framePct = r.ff + r.fa ? r.ff / (r.ff + r.fa) : 0;
    r.bdiff = r.bf - r.ba;
  });
  list.sort((x, y) => y.winPct - x.winPct || y.framePct - x.framePct || y.w - x.w || x.name.localeCompare(y.name));
  return { players: list, highlights, matches: chrono.length };
}

/** Career numbers per player name across every tournament on this device. */
export function hallOfFame(tournaments) {
  const map = new Map();
  for (const t of tournaments) {
    const stats = playerStats(t);
    const pod = podium(t);
    for (const r of stats.players) {
      const key = r.name.trim().toLowerCase();
      const row = map.get(key) || { name: r.name.trim(), events: 0, titles: 0, seconds: 0, thirds: 0, p: 0, w: 0, l: 0, ff: 0, fa: 0, br: 0, history: [] };
      row.events++;
      row.p += r.p; row.w += r.w; row.l += r.l; row.ff += r.ff; row.fa += r.fa; row.br += r.br;
      let place = null;
      if (pod) {
        if (pod.first === r.id) { row.titles++; place = 1; }
        else if (pod.second === r.id) { row.seconds++; place = 2; }
        else if (pod.third === r.id) { row.thirds++; place = 3; }
      }
      row.history.push({ tid: t.id, name: t.name, place, done: !!pod, w: r.w, l: r.l, at: t.createdAt });
      map.set(key, row);
    }
  }
  const list = [...map.values()];
  list.forEach(r => {
    r.winPct = r.p ? r.w / r.p : 0;
    r.framePct = r.ff + r.fa ? r.ff / (r.ff + r.fa) : 0;
    r.history.sort((a, b) => b.at - a.at);
  });
  list.sort((x, y) => y.titles - x.titles || y.seconds - x.seconds || y.winPct - x.winPct || y.w - x.w || x.name.localeCompare(y.name));
  return list;
}

// ---------- Older saves ----------

/** Converts the single tournament saved by the first version of the app. */
export function migrateV1(s) {
  const fix = m => ({ frames: [], ...m, label: undefined, note: undefined });
  let bracket = s.bracket || null;
  if (!bracket && s.playoff) {
    const po = s.playoff;
    bracket = { rounds: po.semis.length ? [po.semis, [po.final]] : [[po.final]], bronze: po.bronze || null };
  }
  if (bracket) bracket = { rounds: bracket.rounds.map(r => r.map(fix)), bronze: bracket.bronze ? fix(bracket.bronze) : null, labels: {} };
  const format = s.mode || 'league';
  const po = s.playoffSize ?? 4;
  return {
    id: uid(), v: 2,
    name: s.name || 'Pool',
    format, game: '8ball',
    players: s.players,
    settings: {
      ...DEFAULT_SETTINGS,
      raceTo: s.raceTo ?? 3,
      koRace: s.playoffRaceTo ?? 4,
      finalRace: s.finalRaceTo ?? 5,
      pointsPerWin: s.pointsPerWin ?? 1,
      playoffSize: format === 'knockout' ? 0 : po,
      groupCount: s.groups?.length || 2,
      advance: format === 'groups' ? Math.max(1, po / 2) : 2,
      bronze: s.bronzeMatch ?? true,
    },
    rounds: (s.rounds || []).map(r => ({ matches: r.matches.map(fix), byes: r.byes || (r.bye ? [r.bye] : []) })),
    groups: s.groups || null,
    bracket,
    createdAt: Date.parse(s.created) || Date.now(),
    updatedAt: Date.now(),
  };
}

/** Every played meeting between two player names across tournaments, newest first. */
export function headToHead(tournaments, nameA, nameB) {
  const key = s => s.trim().toLowerCase();
  const ka = key(nameA), kb = key(nameB);
  const out = { a: { w: 0, ff: 0 }, b: { w: 0, ff: 0 }, meetings: [] };
  for (const t of tournaments) {
    const idOf = k => t.players.find(p => key(p.name) === k)?.id;
    const ia = idOf(ka), ib = idOf(kb);
    if (!ia || !ib) continue;
    for (const m of allMatches(t)) {
      if (!isDone(m) || isBye(m) || m.wo) continue;
      if (!((m.a === ia && m.b === ib) || (m.a === ib && m.b === ia))) continue;
      const [sa, sb] = m.a === ia ? [m.sa, m.sb] : [m.sb, m.sa];
      out.a.ff += sa; out.b.ff += sb;
      (sa > sb ? out.a : out.b).w++;
      out.meetings.push({ tid: t.id, tname: t.name, sa, sb, at: m.endedAt || t.createdAt || 0 });
    }
  }
  out.meetings.sort((x, y) => y.at - x.at);
  return out;
}

/** The name of a match's place in the tournament, in the language of `tr`. */
export function matchLabel(t, m, tr, { short = false } = {}) {
  const info = matchInfo(t, m.id);
  if (!info) return '';
  if (info.stage === 'stage') return tr('roundN', { n: info.round + 1 }) + (m.group ? ' · ' + tr('groupN', { g: m.group }) : '');
  if (info.side === 'G') return info.grand ? tr('grandReset') : tr('grandFinal');
  if (info.side === 'L') return info.fromEnd === 0 ? tr('lFinal') : tr('lRound', { n: info.lround + 1 });
  if (info.bronze) return tr('bronze');
  const one = short ? [tr('finalOne'), tr('semiOne'), tr('quarterOne'), tr('last16')] : [tr('final'), tr('semis'), tr('quarters'), tr('last16')];
  const name = one[info.fromEnd] ?? tr('roundN', { n: info.round + 1 });
  if (info.side === 'W') return info.fromEnd === 0 ? tr('wFinal') : `${tr('winnersSide')} · ${name}`;
  return name;
}
