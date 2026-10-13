// Tournament codes: compressed JSON in a copy-pasteable string, plus plain-text summaries.
import * as L from './logic.js';

const PREFIX = 'POOL2.';

const toB64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = str => {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') {
    try { return PREFIX + 'z' + toB64(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch { /* fall through */ }
  }
  return PREFIX + 'j' + toB64(bytes);
}

/** Accepts a bare code, or any text/link that contains one. */
export async function decode(text) {
  const match = String(text).match(/POOL2\.([zj])([A-Za-z0-9_-]+)/);
  if (!match) throw new Error('nocode');
  let bytes = fromB64(match[2]);
  if (match[1] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function isTournament(x) {
  return x && typeof x === 'object' && Array.isArray(x.players) && Array.isArray(x.rounds) && L.FORMATS.includes(x.format);
}

/** Standings as text for a group chat. */
export function summaryText(t, tr) {
  const name = id => L.playerName(t, id);
  const lines = [`🎱 ${t.name}`];
  const pod = L.podium(t);
  if (pod) {
    lines.push('', `🏆 ${name(pod.first)}`);
    if (pod.second) lines.push(`🥈 ${name(pod.second)}`);
    if (pod.third) lines.push(`🥉 ${name(pod.third)}`);
  }
  const table = (rows, title) => {
    if (title) lines.push('', title);
    else lines.push('');
    rows.forEach((r, i) => lines.push(`${i + 1}. ${r.name} – ${r.pts} ${tr('ptsShort')} (${r.w}-${r.l}, ${r.diff > 0 ? '+' : ''}${r.diff})`));
  };
  if (t.format === 'groups') t.groups.forEach(g => table(L.standingsFor(t, g.players), tr('groupN', { g: g.name })));
  else if (!L.isBracketFormat(t.format)) table(L.standingsFor(t), pod ? tr('stageTable') : null);
  if (t.bracket) {
    const done = L.bracketMatches(t).filter(m => L.isDone(m) && !L.isBye(m));
    if (done.length) {
      lines.push('', tr('playoff'));
      for (const m of done) lines.push(`${name(m.a)} ${m.sa}–${m.sb} ${name(m.b)}`);
    }
  }
  const { done, total } = L.progress(t);
  lines.push('', tr('progressText', { done, total }));
  return lines.join('\n');
}
