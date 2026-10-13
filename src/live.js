// Live sharing: a tournament mirrored to the shared database of the Claude artifact viewer,
// so every phone that opens the app sees the same tournament and results arrive live.
// Outside that viewer (GitHub Pages, a local server) the feature stays hidden.
//
// One document per tournament at `live/<id>`:
//   meta     players, settings and the structure (which match ids sit in which round)
//   matches  { <matchId>: result }  — one key per match, written with update(), which merges
//            nested objects on the server, so two phones scoring different matches never
//            overwrite each other.

const COL = 'live';
const MATCH_FIELDS = ['a', 'b', 'sa', 'sb', 'frames', 'startedAt', 'endedAt', 'table', 'firstBreak', 'balls', 'group'];

// ---------- Pure conversion (tested in Node) ----------

/** Same JSON for the same data whatever the key order, so comparisons are reliable. */
export function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}

function packMatch(m) {
  const o = {};
  for (const k of MATCH_FIELDS) o[k] = m[k] ?? null;
  o.frames = (m.frames || []).map(f => ({ ...f }));
  return o;
}

export function toShared(t) {
  const matches = {};
  const add = m => { if (m) matches[m.id] = packMatch(m); };
  t.rounds.forEach(r => r.matches.forEach(add));
  if (t.bracket) { t.bracket.rounds.forEach(r => r.forEach(add)); add(t.bracket.bronze); }
  return {
    meta: {
      id: t.id, v: t.v ?? 2, name: t.name, format: t.format, game: t.game,
      players: t.players, settings: t.settings, groups: t.groups ?? null, createdAt: t.createdAt,
      rounds: t.rounds.map(r => ({ ids: r.matches.map(m => m.id), byes: r.byes })),
      bracket: t.bracket
        ? { rounds: t.bracket.rounds.map(r => r.map(m => m.id)), bronze: t.bracket.bronze?.id ?? null, labels: t.bracket.labels || {} }
        : null,
    },
    matches,
    updatedAt: t.updatedAt ?? Date.now(),
  };
}

export function fromShared(doc) {
  const meta = doc.meta;
  const M = doc.matches || {};
  const unpack = id => {
    const m = M[id] || {};
    const out = { id, frames: Array.isArray(m.frames) ? m.frames.map(f => ({ ...f })) : [] };
    for (const k of MATCH_FIELDS) if (k !== 'frames') out[k] = m[k] ?? null;
    if (out.group === null) delete out.group;
    if (out.balls === null) delete out.balls;
    return out;
  };
  return {
    id: meta.id, v: meta.v, name: meta.name, format: meta.format, game: meta.game,
    players: meta.players, settings: meta.settings, groups: meta.groups ?? null, createdAt: meta.createdAt,
    rounds: meta.rounds.map(r => ({ matches: r.ids.map(unpack), byes: r.byes || [] })),
    bracket: meta.bracket
      ? { rounds: meta.bracket.rounds.map(r => r.map(unpack)), bronze: meta.bracket.bronze ? unpack(meta.bracket.bronze) : null, labels: meta.bracket.labels || {} }
      : null,
    updatedAt: doc.updatedAt ?? Date.now(),
    live: true,
  };
}

/** The smallest update that turns `prev` into `next`, or null when nothing changed. */
export function diff(prev, next) {
  const patch = {};
  if (stable(prev.meta) !== stable(next.meta)) patch.meta = next.meta;
  const changed = {};
  for (const [id, m] of Object.entries(next.matches)) if (stable(prev.matches?.[id]) !== stable(m)) changed[id] = m;
  // Matches that left the structure (a reset playoff) are cleared, not kept as stray results.
  for (const [id, m] of Object.entries(prev.matches || {})) if (!(id in next.matches) && m !== null) changed[id] = null;
  if (Object.keys(changed).length) patch.matches = changed;
  if (!patch.meta && !patch.matches) return null;
  patch.updatedAt = next.updatedAt;
  return patch;
}

/** Applies a patch the way the server's update() merges it, for keeping our own copy current. */
export function applyPatch(prev, patch) {
  const out = { ...prev, matches: { ...prev.matches } };
  if (patch.meta) out.meta = patch.meta;
  if (patch.matches) for (const [id, m] of Object.entries(patch.matches)) out.matches[id] = m;
  if (patch.updatedAt) out.updatedAt = patch.updatedAt;
  return out;
}

// ---------- Connection (browser only) ----------

let db = null;
let canWrite = null;           // true / false / null = the platform did not say
let status = 'off';            // off | connecting | on | error
const known = new Map();       // id -> last shared body we know of (server state or our own write)
const queues = new Map();      // id -> promise chain, one write at a time per document
const pending = new Map();     // id -> writes queued or in flight
let handler = () => {};

export const isAvailable = () => status === 'on';
export const isWritable = () => canWrite !== false;
export const getStatus = () => status;

export function init(onUpdate) {
  handler = onUpdate;
  if (typeof window === 'undefined' || !window.claude?.use) return Promise.resolve(false);
  status = 'connecting';
  return (async () => {
    try {
      db = await window.claude.use('db');
      if (!db) { status = 'off'; return false; }
      try {
        const user = await window.claude.use('user');
        canWrite = user ? await user.can('data.write') : null;
      } catch { canWrite = null; }
      status = 'on';
      db.collection(COL).onSnapshot(snap => {
        const tournaments = [];
        for (const d of snap.docs) {
          if (!d.exists) continue;
          const body = d.data();
          if (!body?.meta?.rounds) continue;
          known.set(d.id, JSON.parse(JSON.stringify(body)));
          try { tournaments.push(fromShared(body)); } catch { /* skip a malformed document */ }
        }
        const removed = snap.docChanges().filter(c => c.type === 'removed').map(c => c.doc.id);
        removed.forEach(id => known.delete(id));
        // `complete` = the server's definitive list, so anything missing from it is gone.
        handler({ tournaments, removed, ids: snap.docs.filter(d => d.exists).map(d => d.id), complete: !snap.metadata?.fromCache });
      }, err => { status = 'error'; handler({ error: err.code }); });
      return true;
    } catch {
      status = 'off';
      return false;
    }
  })();
}

/** True while this device still has writes to send for the tournament. */
export const isPending = id => (pending.get(id) || 0) > 0;

function enqueue(id, job) {
  pending.set(id, (pending.get(id) || 0) + 1);
  const run = (queues.get(id) || Promise.resolve()).then(job, job).finally(() => {
    const n = (pending.get(id) || 1) - 1;
    if (n > 0) pending.set(id, n);
    else { pending.delete(id); handler({ settled: id }); }
  });
  queues.set(id, run.catch(() => {}));
  return run;
}

/** Sends a tournament's changes. Resolves true when written. */
export function push(t) {
  if (!db || !t.live) return Promise.resolve(false);
  const next = toShared(t);
  return enqueue(t.id, async () => {
    const prev = known.get(t.id);
    const ref = db.collection(COL).doc(t.id);
    try {
      if (!prev) {
        known.set(t.id, next);
        await ref.set(next);
      } else {
        const patch = diff(prev, next);
        if (!patch) return true;
        known.set(t.id, applyPatch(prev, patch));
        await ref.update(patch);
      }
      return true;
    } catch (e) {
      if (e?.code === 'invalid_argument') canWrite = false;
      handler({ error: e?.code || 'unavailable' });
      return false;
    }
  });
}

export function remove(id) {
  if (!db) return Promise.resolve(false);
  known.delete(id);
  return enqueue(id, async () => {
    try { await db.collection(COL).doc(id).delete(); return true; } catch { return false; }
  });
}
