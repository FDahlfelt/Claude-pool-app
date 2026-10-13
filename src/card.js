// A shareable result card drawn on a canvas: standings or the podium, in the app's felt look.
import * as L from './logic.js';

const W = 1080;
const PAD = 72;
const C = {
  room: '#050F0A', feltHi: '#1C6E4C', felt: '#114A34', feltLo: '#0A2D1F',
  ink: '#F4F7F2', ink2: 'rgba(244,247,242,.82)', ink3: 'rgba(244,247,242,.6)', line: 'rgba(255,255,255,.12)',
  chalk: '#7FCDF3', gold: '#F5C963', win: '#86E3A0', loss: '#FF8D78',
  railLo: '#2B190D', rail: '#4D2F18', railHi: '#70482A', cloth: '#F7F2E7',
};
const BALL = { 1: '#F4C21B', 2: '#1E4FC2', 3: '#D82A1E', 4: '#5A2D91', 5: '#F26A1B', 6: '#0E8043', 7: '#7C1F22', 8: '#151515' };
const DISPLAY = '"Bricolage Grotesque", "Arial Narrow", sans-serif';
const BODY = '"Figtree", "Segoe UI", system-ui, sans-serif';

function ball(ctx, x, y, r, n) {
  const base = BALL[n > 8 ? n - 8 : n] || '#888';
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
  if (n > 8) {
    ctx.fillStyle = C.cloth; ctx.fill();
    ctx.clip();
    ctx.fillStyle = base; ctx.fillRect(x - r, y - r * 0.54, r * 2, r * 1.08);
  } else { ctx.fillStyle = base; ctx.fill(); }
  ctx.restore();
  // shading and highlight
  const shade = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
  shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  const hi = ctx.createRadialGradient(x - r * 0.32, y - r * 0.46, 0, x - r * 0.32, y - r * 0.46, r * 0.45);
  hi.addColorStop(0, 'rgba(255,255,255,.6)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.cloth; ctx.beginPath(); ctx.arc(x, y, r * 0.46, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#15120D'; ctx.font = `800 ${Math.round(r * (n > 9 ? 0.48 : 0.6))}px ${DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x, y + r * 0.04);
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function text(ctx, str, x, y, { font, color = C.ink, align = 'left', max, spacing = 0 }) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
  ctx.fillText(max ? fit(ctx, str, max) : str, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/** Lines of content, measured first so the canvas can be sized to fit. */
function plan(t, tr, ballNo) {
  const items = [];
  const pod = L.podium(t);
  if (pod) items.push({ kind: 'podium', pod, h: 330 });
  const table = (rows, title, cut) => {
    if (title) items.push({ kind: 'label', text: title, h: 70 });
    items.push({ kind: 'thead', h: 50 });
    rows.slice(0, 16).forEach((r, i) => items.push({ kind: 'row', r, pos: i + 1, cut: i < cut, h: 74 }));
  };
  if (t.format === 'groups') t.groups.forEach(g => table(L.standingsFor(t, g.players), tr('groupN', { g: g.name }), t.settings.advance));
  else if (t.format !== 'knockout') table(L.standingsFor(t), pod ? tr('stageTable') : null, L.hasPlayoff(t) ? L.playoffCount(t.format, t.players.length, t.settings) : 0);
  if (t.bracket) {
    const R = t.bracket.rounds;
    // Latest round first, the bronze match right after the final.
    const lines = [];
    for (let r = R.length - 1; r >= 0; r--) {
      R[r].forEach(m => { if (L.isDone(m) && !L.isBye(m)) lines.push({ m, label: [tr('finalOne'), tr('semiOne'), tr('quarterOne')][R.length - 1 - r] || tr('roundN', { n: r + 1 }) }); });
      if (r === R.length - 1 && t.bracket.bronze && L.isDone(t.bracket.bronze)) lines.push({ m: t.bracket.bronze, label: tr('bronze') });
    }
    if (lines.length) {
      items.push({ kind: 'label', text: tr('playoff'), h: 70 });
      lines.slice(0, 12).forEach(l => items.push({ kind: 'ko', ...l, h: 66 }));
    }
  }
  return { items, ballNo };
}

export async function renderCard(t, tr, ballNo) {
  try { await Promise.all([document.fonts.load(`800 72px ${DISPLAY}`), document.fonts.load(`600 30px ${BODY}`)]); } catch { /* fallback fonts */ }
  const { items } = plan(t, tr, ballNo);
  const headH = 300, footH = 150;
  const H = headH + items.reduce((s, i) => s + i.h, 0) + footH + 40;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // Felt with a lamp glow and a fine weave
  const g = ctx.createRadialGradient(W / 2, H * 0.2, 60, W / 2, H * 0.45, Math.max(W, H));
  g.addColorStop(0, C.feltHi); g.addColorStop(0.45, C.felt); g.addColorStop(1, C.feltLo);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.025)';
  for (let y = 0; y < H; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < W; x += 4) ctx.fillRect(x, y, 1, 1);
  const lamp = ctx.createRadialGradient(W / 2, 120, 0, W / 2, 120, 620);
  lamp.addColorStop(0, 'rgba(255,236,190,.2)'); lamp.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = lamp; ctx.fillRect(0, 0, W, 800);

  // Header
  const pl = L.progress(t);
  text(ctx, (tr('appName') + ' · ' + tr('fmt_' + t.format)).toUpperCase(), PAD, 110, { font: `800 26px ${BODY}`, color: C.chalk, spacing: 5 });
  let size = 76;
  ctx.font = `800 ${size}px ${DISPLAY}`;
  while (ctx.measureText(t.name).width > W - PAD * 2 && size > 44) { size -= 4; ctx.font = `800 ${size}px ${DISPLAY}`; }
  text(ctx, t.name, PAD, 196, { font: `800 ${size}px ${DISPLAY}`, max: W - PAD * 2 });
  const date = new Date(t.createdAt || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  text(ctx, `${tr('nPlayers', { n: t.players.length })} · ${tr('game_' + t.game)} · ${date}`, PAD, 248, { font: `500 30px ${BODY}`, color: C.ink2, max: W - PAD * 2 });

  let y = headH;
  const name = id => L.playerName(t, id);
  const cols = { pos: PAD + 18, ball: PAD + 80, name: PAD + 120, wl: W - PAD - 330, diff: W - PAD - 170, pts: W - PAD };
  for (const it of items) {
    if (it.kind === 'podium') {
      const { pod } = it;
      ctx.fillStyle = 'rgba(0,0,0,.18)'; roundRect(ctx, PAD - 12, y, W - PAD * 2 + 24, it.h - 30, 36); ctx.fill();
      text(ctx, tr('champion').toUpperCase(), W / 2, y + 66, { font: `800 26px ${BODY}`, color: C.gold, align: 'center', spacing: 5 });
      ball(ctx, W / 2, y + 140, 50, ballNo(t, pod.first) ?? 8);
      let cs = 76;
      ctx.font = `800 ${cs}px ${DISPLAY}`;
      while (ctx.measureText(name(pod.first)).width > W - PAD * 3 && cs > 40) { cs -= 4; ctx.font = `800 ${cs}px ${DISPLAY}`; }
      text(ctx, name(pod.first), W / 2, y + 250, { font: `800 ${cs}px ${DISPLAY}`, color: C.gold, align: 'center', max: W - PAD * 3 });
      const rest = [pod.second && `2. ${name(pod.second)}`, pod.third && `3. ${name(pod.third)}`].filter(Boolean).join('     ');
      if (rest) text(ctx, rest, W / 2, y + 286, { font: `600 30px ${BODY}`, color: C.ink2, align: 'center', max: W - PAD * 2 });
    } else if (it.kind === 'label') {
      text(ctx, it.text.toUpperCase(), PAD, y + 48, { font: `800 24px ${BODY}`, color: C.chalk, spacing: 4 });
    } else if (it.kind === 'thead') {
      const f = `700 22px ${BODY}`;
      text(ctx, tr('player').toUpperCase(), cols.name, y + 32, { font: f, color: C.ink3, spacing: 3 });
      text(ctx, `${tr('colW')}–${tr('colL')}`, cols.wl, y + 32, { font: f, color: C.ink3, align: 'right', spacing: 3 });
      text(ctx, '+/−', cols.diff, y + 32, { font: f, color: C.ink3, align: 'right', spacing: 3 });
      text(ctx, tr('colPts').toUpperCase(), cols.pts, y + 32, { font: f, color: C.ink3, align: 'right', spacing: 3 });
    } else if (it.kind === 'row') {
      const { r } = it;
      ctx.fillStyle = C.line; ctx.fillRect(PAD, y, W - PAD * 2, 2);
      if (it.cut) { ctx.strokeStyle = C.chalk; ctx.lineWidth = 3; roundRect(ctx, cols.pos - 22, y + 15, 44, 44, 12); ctx.stroke(); }
      text(ctx, String(it.pos), cols.pos, y + 48, { font: `800 28px ${DISPLAY}`, color: it.cut ? C.chalk : C.ink2, align: 'center' });
      ball(ctx, cols.ball, y + 37, 22, ballNo(t, r.id) ?? 1);
      text(ctx, r.name, cols.name, y + 48, { font: `700 34px ${BODY}`, max: cols.wl - cols.name - 90 });
      text(ctx, `${r.w}–${r.l}`, cols.wl, y + 48, { font: `600 32px ${BODY}`, color: C.ink2, align: 'right' });
      text(ctx, (r.diff > 0 ? '+' : r.diff < 0 ? '−' : '') + Math.abs(r.diff), cols.diff, y + 48, { font: `600 32px ${BODY}`, color: C.ink2, align: 'right' });
      text(ctx, String(r.pts), cols.pts, y + 50, { font: `800 40px ${DISPLAY}`, align: 'right' });
    } else if (it.kind === 'ko') {
      const { m } = it;
      const w = L.winnerOf(m);
      ctx.fillStyle = C.line; ctx.fillRect(PAD, y, W - PAD * 2, 2);
      text(ctx, it.label.toUpperCase(), PAD, y + 42, { font: `700 20px ${BODY}`, color: C.ink3, spacing: 3 });
      const mid = W / 2 + 120;
      text(ctx, name(m.a), mid - 70, y + 44, { font: `${m.a === w ? 800 : 500} 32px ${BODY}`, color: m.a === w ? C.ink : C.ink2, align: 'right', max: 300 });
      text(ctx, `${m.sa}–${m.sb}`, mid, y + 46, { font: `800 36px ${DISPLAY}`, color: C.gold, align: 'center' });
      text(ctx, name(m.b), mid + 70, y + 44, { font: `${m.b === w ? 800 : 500} 32px ${BODY}`, color: m.b === w ? C.ink : C.ink2, max: W - PAD - mid - 70 });
    }
    y += it.h;
  }

  // Footer rail
  const fy = H - footH + 20;
  const rail = ctx.createLinearGradient(0, 0, W, 0);
  rail.addColorStop(0, C.railLo); rail.addColorStop(0.2, C.rail); rail.addColorStop(0.5, C.railHi); rail.addColorStop(0.8, C.rail); rail.addColorStop(1, C.railLo);
  ctx.fillStyle = rail; ctx.fillRect(0, fy, W, footH - 20);
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(0, fy, W, 3);
  for (const fx of [0.125, 0.25, 0.375, 0.625, 0.75, 0.875]) {
    ctx.save(); ctx.translate(W * fx, fy + 18); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#EADBB8'; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
  }
  text(ctx, tr('progressText', pl), PAD, fy + 84, { font: `700 30px ${BODY}`, color: '#F6E9CF' });
  ball(ctx, W - PAD - 26, fy + 74, 26, 8);
  text(ctx, tr('appName'), W - PAD - 70, fy + 84, { font: `800 30px ${DISPLAY}`, color: '#F6E9CF', align: 'right' });
  return cv;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
