import * as L from './logic.js';
import { db, load, save, getTournament, upsertTournament, removeTournament, clearAll } from './store.js';
import { tr, setLang, getLang, LANGS } from './i18n.js';
import { encode, decode, isTournament, summaryText } from './share.js';
import * as Live from './live.js';

const VERSION = '2.2.0';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = x => Math.round(x * 100) + '%';
const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
// Inside an embedded viewer, downloads and share sheets are unavailable.
const framed = (() => { try { return window.top !== window.self; } catch { return true; } })();

load();
setLang(db.prefs.lang || (navigator.language || 'da').slice(0, 2));

// ---------- Icons (kit: .ic) ----------
const ic = (d, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  back: ic('<path d="M15 18l-6-6 6-6"/>'),
  share: ic('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  undo: ic('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  edit: ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  swap: ic('<path d="M7 16V4M3 8l4-4 4 4"/><path d="M17 8v12M21 16l-4 4-4-4"/>'),
  trash: ic('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
  copy: ic('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  import: ic('<path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 21h16"/>'),
  trophy: ic('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a4 4 0 0 1-3 4M7 5H4v2a4 4 0 0 0 3 4"/>'),
  users: ic('<circle cx="9" cy="8" r="4"/><path d="M1 21v-1a7 7 0 0 1 14 0v1"/><path d="M17 4a4 4 0 0 1 0 8M23 21v-1a7 7 0 0 0-5-6.7"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  rack: ic('<path d="M12 3L2 20h20z"/><circle cx="12" cy="11" r="1.5" class="f"/><circle cx="9" cy="16" r="1.5" class="f"/><circle cx="15" cy="16" r="1.5" class="f"/>'),
  play: ic('<path d="M7 4l13 8-13 8z"/>'),
  close: ic('<path d="M18 6L6 18M6 6l12 12"/>'),
  bolt: ic('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', 's'),
  chev: ic('<path d="M9 18l6-6-6-6"/>', 's'),
  shuffle: ic('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>', 's'),
  list: ic('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', 's'),
};

// ---------- Balls ----------
// Every player gets a ball of their own (the black 8 is kept for the game itself).
const PLAYER_BALLS = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
const ballEl = (n, size = 22, cls = '') =>
  n === null ? `<span class="ball-ph" style="font-size:${size}px" aria-hidden="true"></span>`
    : `<span class="ball b${n} ${cls}" style="font-size:${size}px" aria-hidden="true"><i>${n === 0 ? '' : n}</i></span>`;
const idxBall = i => PLAYER_BALLS[i % PLAYER_BALLS.length];
const ballNo = (t, id) => { const i = t.players.findIndex(p => p.id === id); return i < 0 ? null : idxBall(i); };
const pball = (t, id, size = 22, cls = '') => ballEl(id && id !== L.BYE ? ballNo(t, id) : null, size, cls);
const gameBall = (game, size = 30, cls = '') => ballEl({ '8ball': 8, '9ball': 9, '10ball': 10 }[game] ?? 1, size, cls);
const cue = size => `<span class="ball b0 clean" style="font-size:${size}px" aria-hidden="true"><i></i></span>`;

// ---------- Routing ----------
let route = parseHash(location.hash);
let draft = null;
const ui = { filter: 'all', player: '', pop: null };

function parseHash(hash) {
  const p = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p[0] === 't' && p[1]) return p[2] === 'm' && p[3] ? { name: 'match', id: p[1], mid: p[3] } : { name: 't', id: p[1], tab: p[2] || 'overview' };
  if (p[0] === 'shared' && p[1]) return { name: 'shared', code: p.slice(1).join('/') };
  if (['new', 'players', 'settings'].includes(p[0])) return { name: p[0] };
  return { name: 'home' };
}
function toHash(r) {
  switch (r.name) {
    case 't': return `#/t/${r.id}/${r.tab || 'overview'}`;
    case 'match': return `#/t/${r.id}/m/${r.mid}`;
    case 'shared': return `#/shared/${r.code}`;
    case 'home': return '#/';
    default: return `#/${r.name}`;
  }
}
function go(r, { keepScroll = false } = {}) {
  closeModal();
  route = r;
  try { if (location.hash !== toHash(r)) history.pushState(null, '', toHash(r)); } catch { /* sandboxed */ }
  render();
  if (!keepScroll) window.scrollTo(0, 0);
}
// The phone's back button closes an open sheet as well as changing screen.
window.addEventListener('popstate', () => { closeModal(); route = parseHash(location.hash); render(); });

// ---------- Rendering ----------
function applyTheme() {
  const pref = db.prefs.theme;
  // In "auto", follow a theme the host page sets on <html>, otherwise the system setting.
  const host = document.documentElement.dataset.theme;
  document.body.dataset.theme = pref === 'dark' || pref === 'light' ? pref : host === 'dark' || host === 'light' ? host : 'auto';
  document.documentElement.lang = getLang();
  requestAnimationFrame(() => { document.documentElement.style.background = getComputedStyle(document.body).backgroundColor; });
}

let afterRender = [];
function render() {
  applyTheme();
  afterRender = [];
  const r = route;
  let html;
  if (r.name === 'new') {
    if (!draft) draft = newDraft();
    html = viewNew();
  } else if (r.name === 't' || r.name === 'match') {
    const t = getTournament(r.id);
    if (!t) {
      route = { name: 'home' };
      try { history.replaceState(null, '', '#/'); } catch { /* sandboxed */ }
      return render();
    }
    html = r.name === 'match' ? viewMatch(t, r.mid) : viewTournament(t, r.tab);
  } else if (r.name === 'players') html = viewPlayers();
  else if (r.name === 'settings') html = viewSettings();
  else if (r.name === 'shared') html = viewShared(r.code);
  else html = viewHome();
  // On a computer the navigation is a sidebar on every screen; on a phone only the main screens show it.
  if (!html.includes('class="tabbar')) html += tabbar(r.name === 'players' || r.name === 'settings' ? r.name : 'home', true);
  $('#app').innerHTML = html;
  document.body.classList.toggle('no-tabbar', !$('#app .tabbar:not(.sub)'));
  afterRender.forEach(f => f());
  ui.pop = null;
  keepAwake(r.name === 'match');
}

function commit(t) {
  t.updatedAt = Date.now();
  L.syncBracket(t.bracket);
  if (!upsertTournament(t)) toast(tr('saveFailed'));
  render();
  return t.live ? Live.push(t) : Promise.resolve(true);
}

// ---------- Live sharing ----------
let liveError = null;
const deferredLive = new Map(); // snapshots held back while this device is still sending

function applyLive(st) {
  const local = getTournament(st.id);
  st.celebrated = local?.celebrated ?? false;
  upsertTournament(st);
}

function onLive(ev) {
  if (ev.error) { liveError = ev.error; scheduleRender(); return; }
  if (ev.settled) {
    const st = deferredLive.get(ev.settled);
    if (st) { deferredLive.delete(ev.settled); applyLive(st); scheduleRender(); }
    return;
  }
  liveError = null;
  const hidden = new Set(db.prefs.hiddenLive || []);
  for (const st of ev.tournaments) {
    if (hidden.has(st.id)) continue;
    // Our own unsent change wins until it has been written; the next snapshot includes it.
    if (Live.isPending(st.id)) deferredLive.set(st.id, st);
    else applyLive(st);
  }
  // Deleted for everyone (or stopped by its owner): it leaves this device too.
  const gone = new Set(ev.removed);
  if (ev.complete) {
    const onServer = new Set(ev.ids);
    for (const t of db.tournaments) if (t.live && !onServer.has(t.id) && !Live.isPending(t.id)) gone.add(t.id);
  }
  for (const id of gone) if (getTournament(id)?.live && !Live.isPending(id)) removeTournament(id);
  scheduleRender();
}

/** Re-render for remote changes, but never under someone's fingers while they type. */
let renderDirty = false;
function scheduleRender() {
  const a = document.activeElement;
  if (a && $('#app').contains(a) && a.matches('input, textarea, select')) { renderDirty = true; return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => {
  if (renderDirty && !document.activeElement?.matches?.('input, textarea, select')) { renderDirty = false; render(); }
}, 0));

const readOnlyNow = () => !!curT()?.live && !Live.isWritable();
const liveBadge = t => !t.live ? '' : `<span class="tag tag-live" title="${tr('liveTitle')}"><span class="live-dot"></span>${Live.isWritable() ? tr('liveTag') : tr('viewOnly')}</span>`;

function header({ back, title, sub, actions = '' }) {
  return `<header class="hdr">
    ${back ? `<button class="iconbtn" data-act="nav" data-to="${back}" aria-label="${tr('back')}">${ICON.back}</button>` : ''}
    <div class="ttl"><div class="t-h3">${esc(title)}</div>${sub ? `<div class="t-xs ink-3 ell">${esc(sub)}</div>` : ''}</div>
    ${actions}
  </header>`;
}
function bigHeader(title, over, actions = '') {
  return `<header class="hdr big"><div class="ttl">${over ? `<span class="t-over">${over}</span>` : ''}<h1 class="t-h1">${esc(title)}</h1></div>${actions}</header>`;
}

function tabbar(active, sub = false) {
  const item = (key, to, icon, label) =>
    `<button class="tab ${active === key ? 'on' : ''}" data-act="nav" data-to="${to}" ${active === key ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`;
  return `<nav class="tabbar ${sub ? 'sub' : ''}" aria-label="${tr('appName')}">
    <div class="side-brand">${gameBall('8ball', 30, 'lift')}<span>${tr('appName')}</span></div>
    ${item('home', '#/', ICON.rack, tr('navTournaments'))}
    ${item('players', '#/players', ICON.users, tr('navPlayers'))}
    ${item('settings', '#/settings', ICON.gear, tr('navSettings'))}
    <button class="btn btn-p side-new" data-act="new">${ICON.plus}<span>${tr('newTournament')}</span></button>
    <p class="side-keys t-xs">${tr('keysHint')}</p>
  </nav>`;
}

const fmtName = f => tr('fmt_' + f);
const pname = (t, id) => (id === L.BYE ? tr('bye') : id ? esc(L.playerName(t, id)) : tr('tbd'));

function roundName(fromEnd, r) {
  return [tr('final'), tr('semis'), tr('quarters'), tr('last16')][fromEnd] ?? tr('roundN', { n: r + 1 });
}
function ctxLabel(t, m) {
  const info = L.matchInfo(t, m.id);
  if (!info) return '';
  if (info.stage === 'stage') return tr('roundN', { n: info.round + 1 }) + (m.group ? ' · ' + tr('groupN', { g: m.group }) : '');
  return info.bronze ? tr('bronze') : roundName(info.fromEnd, info.round);
}
function relTime(ts) {
  const diff = (ts - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(getLang(), { numeric: 'auto' });
  for (const [u, s] of [['day', 86400], ['hour', 3600], ['minute', 60]]) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), u);
  return tr('justNow');
}

// Small building blocks from the kit
const segBtns = (opts, cur, attrs) => `<div class="seg" role="group">${opts.map(([v, label]) =>
  `<button type="button" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}" ${attrs(v)}>${label}</button>`).join('')}</div>`;
const switchBtn = (on, attrs, label) => `<button type="button" class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" ${attrs}></button>`;
const stepper = (value, attrs, label, fmt = v => v) => `<div class="stepper" role="group" aria-label="${esc(label)}">
  <button type="button" ${attrs(-1)} aria-label="${esc(label)} −1">−</button><output>${fmt(value)}</output><button type="button" ${attrs(1)} aria-label="${esc(label)} +1">+</button></div>`;
const optRow = (title, sub, control) => `<div class="list-row"><div class="ttl"><span class="t-body">${title}</span>${sub ? `<span class="t-xs ink-3">${sub}</span>` : ''}</div>${control}</div>`;
const progressBar = (done, total, cls = '') => `<div class="bar ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>`;

// ---------- Home ----------
function tCard(t) {
  const ph = L.phase(t);
  const { done, total } = L.progress(t);
  const pod = L.podium(t);
  const live = L.allMatches(t).filter(L.isLive).length;
  let status;
  if (pod) status = `<span class="tag tag-gold">${ICON.trophy.replace('class="ic ', 'class="ic s ')}${esc(L.playerName(t, pod.first))}</span>`;
  else if (live) status = `<span class="tag tag-live"><span class="live-dot"></span>${tr('nLive', { n: live })}</span>`;
  else if (ph === 'playoff') status = `<span class="tag tag-gold">${tr('phPlayoff')}</span>`;
  else if (ph === 'nextRound' || ph === 'readyForPlayoff') status = `<span class="tag tag-live">${tr(ph === 'nextRound' ? 'phNextRound' : 'phReadyPlayoff')}</span>`;
  else status = `<span class="tag tag-mute">${tr('phStage')}</span>`;
  return `<div class="card tcard" data-act="open" data-id="${t.id}" role="button" tabindex="0">
    <div class="tc-top">${gameBall(t.game, 34, 'lift')}
      <div class="ttl grow"><div class="t-h3 ell">${esc(t.name)}</div><div class="t-xs ink-3 ell">${tr('nPlayers', { n: t.players.length })} · ${fmtName(t.format)}</div></div>
      <button class="iconbtn danger" data-act="deleteFromHome" data-id="${t.id}" aria-label="${tr('deleteNamed', { name: esc(t.name) })}" title="${tr('deleteT')}">${ICON.trash}</button>
    </div>
    <div class="row wrap">${status}${t.live ? `<span class="tag tag-live"><span class="live-dot"></span>${tr('liveTag')}</span>` : ''}${t.demo ? `<span class="tag tag-demo">Demo</span>` : ''}</div>
    ${progressBar(done, total, pod ? 'gold thin' : 'thin')}
    <div class="tc-foot t-xs ink-3 tnum"><span>${tr('matchesOf', { done, total })}</span><span>${relTime(t.updatedAt)}</span></div>
  </div>`;
}

function viewHome() {
  const list = [...db.tournaments].sort((a, b) => b.updatedAt - a.updatedAt);
  if (!list.length) return viewWelcome();
  const active = list.filter(t => L.phase(t) !== 'done');
  const finished = list.filter(t => L.phase(t) === 'done');
  const group = (title, items) => items.length ? `<section class="stack"><div class="sec"><span class="t-over">${title}</span><span class="t-xs ink-3 tnum">${items.length}</span></div><div class="tgrid">${items.map(tCard).join('')}</div></section>` : '';
  return bigHeader(tr('navTournaments'), tr('appName'), `<button class="btn btn-s btn-sm desk-only" data-act="import">${ICON.import}<span>${tr('importBtn')}</span></button><button class="iconbtn fill mob-only" data-act="import" aria-label="${tr('importBtn')}" title="${tr('importBtn')}">${ICON.import}</button>`) +
    `<main class="page">${group(tr('inProgress'), active)}${group(tr('finished'), finished)}</main>
    <button class="fab" data-act="new">${ICON.plus}<span>${tr('newTournament')}</span></button>` + tabbar('home');
}

function rack() {
  // The classic 8-ball rack: 8 in the middle, a solid and a stripe in the back corners.
  const rows = [[1], [9, 2], [10, 8, 3], [11, 4, 12, 5], [6, 13, 7, 14, 15]];
  let k = 0;
  return `<div class="rack" aria-hidden="true">${rows.map(r => `<div>${r.map(n => `<span class="ball b${n} lift rack-in" style="animation-delay:${k++ * 35}ms"><i>${n}</i></span>`).join('')}</div>`).join('')}</div>`;
}

function viewWelcome() {
  const feats = [[1, 'feat1'], [2, 'feat2'], [3, 'feat3'], [4, 'feat4']];
  return `<main class="page">
    <section class="felt-hero welcome">
      ${rack()}
      <h1 class="t-hero">${tr('heroTitle')}</h1>
      <p class="t-body">${tr('heroText')}</p>
      <div class="stack" style="width:100%;max-width:340px">
        <button class="btn btn-p btn-lg btn-block" data-act="new">${ICON.plus}<span>${tr('newTournament')}</span></button>
        <button class="btn btn-s btn-block" data-act="demo">${ICON.play}<span>${tr('tryDemo')}</span></button>
      </div>
    </section>
    <section class="feats">${feats.map(([n, f]) => `<div class="card feat">${ballEl(n, 30, 'lift')}<div class="stack" style="gap:4px"><span class="t-h3">${tr(f + 'T')}</span><span class="t-sm ink-2">${tr(f + 'D')}</span></div></div>`).join('')}</section>
    <div class="row center"><button class="btn btn-ghost btn-sm" data-act="import">${ICON.import}<span>${tr('importBtn')}</span></button></div>
  </main>` + tabbar('home');
}

function createDemo() {
  const names = tr('demoNames').split(',');
  const t = L.createTournament({ name: tr('demoName'), format: 'league', game: '8ball', names, settings: { raceTo: 3, playoffSize: 4, tables: 2 } });
  t.demo = true;
  const ms = L.stageMatches(t);
  const start = Date.now() - ms.length * 20 * 60000;
  ms.slice(0, Math.round(ms.length * 0.7)).forEach((m, i) => {
    let guard = 0;
    while (!L.addFrame(t, m, Math.random() < 0.55 ? 'a' : 'b', 3) && guard++ < 10) { /* play frames */ }
    m.frames.forEach((f, k) => {
      f.at = start + i * 20 * 60000 + k * 5 * 60000;
      if (f.w === f.b && Math.random() < 0.2) f.br = true;
      if (Math.random() < 0.08) { f.left = 7; f.black = true; } else f.left = Math.floor(Math.random() * 7) + 1;
    });
    m.startedAt = m.frames[0].at; m.endedAt = m.frames[m.frames.length - 1].at;
  });
  const live = L.upNext(t)[0];
  if (live) { L.addFrame(t, live, 'a', 3); live.frames[0].left = 4; }
  upsertTournament(t);
  go({ name: 't', id: t.id, tab: 'overview' });
}

// ---------- New tournament ----------
function newDraft(from, replace = false) {
  const s = from ? { ...L.DEFAULT_SETTINGS, ...from.settings } : { ...L.DEFAULT_SETTINGS };
  return {
    ...s,
    name: from ? from.name : tr('defaultName'),
    game: from?.game || '8ball',
    format: from?.format || 'league',
    names: from ? from.players.map(p => p.name) : ['', '', '', ''],
    replaceId: replace && from ? from.id : null,
    swissAuto: !from || from.format !== 'swiss',
  };
}
const filledNames = () => draft.names.map(n => n.trim()).filter(Boolean);

/**
 * The draft keeps what the user picked; this returns the values that actually apply for the
 * current number of players, so a choice survives while names are still being typed.
 */
function draftSettings() {
  const d = draft, n = filledNames().length;
  const s = Object.fromEntries(Object.keys(L.DEFAULT_SETTINGS).map(k => [k, d[k]]));
  s.groupCount = Math.min(Math.max(2, d.groupCount), Math.max(2, Math.floor(n / 2)));
  s.advance = Math.min(Math.max(1, d.advance), Math.max(1, Math.min(...L.groupSizes(Math.max(n, 4), s.groupCount))));
  s.swissRounds = d.swissAuto ? L.recommendedSwissRounds(Math.max(n, 2)) : Math.min(Math.max(1, d.swissRounds), Math.max(1, n - 1));
  s.playoffSize = [8, 4, 2, 0].find(x => x <= d.playoffSize && x <= Math.max(n, 2));
  return s;
}
const effective = field => (field in L.DEFAULT_SETTINGS ? draftSettings()[field] : draft[field]);

// Limits for the steppers on the setup screen
function draftLimits(field) {
  const n = Math.max(filledNames().length, 2);
  return {
    raceTo: [1, 15], koRace: [1, 15], finalRace: [1, 21], pointsPerWin: [1, 3], tables: [1, 12],
    groupCount: [2, Math.max(2, Math.floor(n / 2))],
    advance: [1, Math.max(1, Math.min(...L.groupSizes(Math.max(n, 4), draftSettings().groupCount)))],
    swissRounds: [1, Math.max(1, n - 1)],
  }[field];
}
const draftStepper = (field, label, fmt) => stepper(effective(field), d => `data-act="stepDraft" data-field="${field}" data-d="${d}"`, label, fmt);
const draftSeg = (field, opts, num = false) => segBtns(opts, effective(field), v => `data-act="setDraft" data-field="${field}" data-value="${v}" ${num ? 'data-num="1"' : ''}`);
const draftSwitch = (field, label) => switchBtn(draft[field], `data-act="toggleDraft" data-field="${field}"`, label);

function pRow(name, i) {
  return `<div class="field">${ballEl(idxBall(i), 26)}
    <input id="p-${i}" data-pi="${i}" value="${esc(name)}" placeholder="${tr('playerN', { n: i + 1 })}" autocomplete="off" enterkeyhint="next" maxlength="30" aria-label="${tr('playerN', { n: i + 1 })}">
    <button type="button" class="iconbtn danger" data-act="rmPlayer" data-i="${i}" aria-label="${tr('remove')}">${ICON.close}</button></div>`;
}

function knownChips() {
  const have = new Set(draft.names.map(n => n.trim().toLowerCase()));
  const known = L.hallOfFame(db.tournaments.filter(t => !t.demo)).map(r => r.name).filter(n => !have.has(n.toLowerCase())).slice(0, 30);
  if (!known.length) return '';
  return `<div class="stack" style="gap:8px"><span class="lbl" style="margin:0">${tr('knownPlayers')}</span>
    <div class="chips">${known.map(n => `<button type="button" class="chip add" data-act="addKnown" data-name="${esc(n)}">${ICON.plus.replace('class="ic ', 'class="ic s ')}${esc(n)}</button>`).join('')}</div></div>`;
}

function formatCards() {
  const n = filledNames().length;
  return L.FORMATS.map(f => {
    const ok = f === 'groups' ? n >= 4 : f === 'knockout' ? n >= 2 : n >= 3;
    const p = L.plan(f, Math.max(n, 2), draftSettings());
    return `<button type="button" class="fmt ${draft.format === f ? 'on' : ''}" data-act="setDraft" data-field="format" data-value="${f}" aria-pressed="${draft.format === f}" ${ok ? '' : 'disabled'}>
      <span class="t-h3">${fmtName(f)}</span>
      <span class="num tnum">${ok ? p.total : '–'}</span>
      <span class="t-xs">${ok ? tr('nMatches', { n: p.total }).replace(/^\d+\s*/, '') : tr('needMore')} · ${tr('fmtShort_' + f)}</span>
    </button>`;
  }).join('');
}

function formatOptions() {
  const d = draft, n = filledNames().length;
  const playoffOpts = [[0, tr('none')], [2, tr('top2')], [4, tr('top4')], [8, tr('top8')]].filter(([v]) => v <= Math.max(n, 2));
  const legs = `<div class="list-row"><div class="stack grow" style="gap:8px"><span class="t-body">${tr('legs')}</span>${draftSeg('legs', [[1, tr('legs1')], [2, tr('legs2')]], true)}</div></div>`;
  const playoff = `<div class="list-row"><div class="stack grow" style="gap:8px"><span class="t-body">${tr('playoff')}</span>${draftSeg('playoffSize', playoffOpts, true)}</div></div>`;
  let rows;
  if (d.format === 'league') rows = legs + playoff;
  else if (d.format === 'groups') {
    const es = draftSettings();
    const sizes = L.groupSizes(Math.max(n, 4), es.groupCount);
    rows = optRow(tr('groupCount'), tr('groupsHint', { sizes: sizes.join(' + '), p: es.groupCount * es.advance }), draftStepper('groupCount', tr('groupCount'))) +
      optRow(tr('advance'), '', draftStepper('advance', tr('advance'))) + legs;
  } else if (d.format === 'swiss') {
    const rec = L.recommendedSwissRounds(Math.max(n, 2));
    rows = optRow(tr('swissRounds'), `${tr('recommended')}: ${rec} · ${tr('swissHint')}`, draftStepper('swissRounds', tr('swissRounds'))) + playoff;
  } else {
    rows = `<div class="list-row"><div class="stack grow" style="gap:8px"><span class="t-body">${tr('seeding')}</span>${draftSeg('seeding', [['random', tr('seedRandom')], ['list', tr('seedList')]])}
      <span class="t-xs ink-3">${tr(d.seeding === 'list' ? 'seedListHint' : 'seedRandomHint')}</span></div></div>`;
  }
  return `<div class="card">${rows}</div>`;
}

function rulesFields() {
  const d = draft, n = filledNames().length;
  const ko = d.format === 'knockout';
  const P = ko ? n : L.playoffCount(d.format, n, draftSettings());
  const bestOf = f => tr('bestOf', { n: 2 * effective(f) - 1 });
  let rows = '';
  if (!ko) rows += optRow(d.format === 'groups' ? tr('raceGroups') : tr('raceStage'), bestOf('raceTo'), draftStepper('raceTo', tr('raceStage')));
  if (P >= 3) rows += optRow(ko ? tr('raceKoRounds') : tr('raceSemis'), bestOf('koRace'), draftStepper('koRace', tr('raceSemis')));
  if (P >= 2) rows += optRow(tr('raceFinal'), bestOf('finalRace'), draftStepper('finalRace', tr('raceFinal')));
  if (!ko) rows += optRow(tr('pointsPerWin'), '', draftStepper('pointsPerWin', tr('pointsPerWin')));
  rows += optRow(tr('tables'), '', draftStepper('tables', tr('tables')));
  rows += `<div class="list-row"><div class="stack grow" style="gap:8px"><span class="t-body">${tr('breakRule')}</span>${draftSeg('breakRule', [['alternate', tr('breakAlternate')], ['winner', tr('breakWinner')]])}</div></div>`;
  if (P >= 4) rows += optRow(tr('bronzeMatch'), '', draftSwitch('bronze', tr('bronzeMatch')));
  rows += optRow(tr('ballCount'), tr('ballCountHint', { n: L.maxBalls(d.game) }), draftSwitch('ballCount', tr('ballCount')));
  return `<div class="card">${rows}</div>`;
}

function viewNew() {
  afterRender.push(() => updateSummary(true));
  const games = L.GAMES.map(g => [g, g === 'other' ? tr('game_other') : `${gameBall(g, 20)}${tr('game_' + g)}`]);
  return header({ back: '#/', title: draft.replaceId ? tr('changeFormat') : tr('newTournament') }) + `<main class="page tight new-grid">
    <div class="col">
    <section class="stack">
      <label class="lbl" for="f-name" style="margin:0">${tr('tName')}</label>
      <div class="field"><input id="f-name" data-draft="name" value="${esc(draft.name)}" maxlength="60" autocomplete="off"></div>
      <span class="lbl" style="margin:4px 0 0">${tr('game')}</span>
      <div class="seg game" role="group">${games.map(([v, l]) => `<button type="button" class="${draft.game === v ? 'on' : ''}" aria-pressed="${draft.game === v}" data-act="setDraft" data-field="game" data-value="${v}">${l}</button>`).join('')}</div>
    </section>
    <section class="stack">
      <div class="sec"><span class="t-over">${tr('players')}</span><span class="tag tag-live tnum" id="pcount"></span></div>
      <div id="plist" class="stack" style="gap:8px">${draft.names.map(pRow).join('')}</div>
      <div class="chips">
        <button type="button" class="chip add" data-act="addPlayer">${ICON.plus.replace('class="ic ', 'class="ic s ')}${tr('addPlayer')}</button>
        <button type="button" class="chip" data-act="pasteList">${ICON.list}${tr('pasteList')}</button>
        <button type="button" class="chip" data-act="shufflePlayers">${ICON.shuffle}${tr('shuffle')}</button>
      </div>
      <div id="known">${knownChips()}</div>
    </section>
    </div><div class="col">
    <section class="stack">
      <div class="sec"><span class="t-over">${tr('format')}</span></div>
      <div class="fmts" id="formats"></div>
      <p class="t-sm ink-2" id="fmtDesc"></p>
      <div id="fmtOpts"></div>
    </section>
    <section class="stack">
      <div class="sec"><span class="t-over">${tr('rules')}</span></div>
      <div id="rules"></div>
    </section>
    <div class="create-box">
      <section class="feltbox sum" id="summary" aria-live="polite"></section>
      <button type="button" class="btn btn-p btn-lg btn-block" data-act="create" id="createBtn">${tr('createSchedule')}</button>
    </div>
    </div>
  </main>`;
}

function updateSummary(structure = false) {
  if (route.name !== 'new' || !$('#summary')) return;
  const names = filledNames(), n = names.length;
  if (structure || n !== updateSummary.last) {
    updateSummary.last = n;
    $('#formats').innerHTML = formatCards();
    $('#fmtDesc').textContent = tr('fmtDesc_' + draft.format);
    $('#fmtOpts').innerHTML = formatOptions();
    $('#rules').innerHTML = rulesFields();
  }
  $('#pcount').textContent = n;
  const s = draftSettings();
  const err = L.validate(draft.format, n, s);
  const dupes = new Set(names.map(x => x.toLowerCase())).size !== n;
  const p = L.plan(draft.format, n, s);
  let html;
  if (err || dupes) html = `<span class="t-over">${tr('scheduleLbl')}</span><p class="t-body warn" style="color:#FFB4A6">${err ? tr('err_' + err) : tr('errDupes')}</p>`;
  else {
    const per = draft.format === 'knockout' ? p.per[1] : p.per[0] === p.per[1] ? p.per[0] : `${p.per[0]}–${p.per[1]}`;
    const parts = [];
    if (p.stage) parts.push(tr('sumStage', { n: p.stage }));
    if (p.playoff) parts.push(tr(draft.format === 'knockout' ? 'sumKo' : 'sumPlayoff', { n: p.playoff }));
    html = `<span class="t-over">${tr('scheduleLbl')}</span>
      <div class="row" style="align-items:baseline;gap:8px"><span class="num big">${p.total}</span><span class="t-h3">${tr('matchesWord')}</span></div>
      <p class="t-sm ink-2">${tr('nPlayers', { n })} · ${parts.join(' + ')}. ${draft.format === 'knockout' ? tr('sumPerKo', { per }) : tr('sumPer', { per })}${draft.tables > 1 ? ' ' + tr('sumTables', { n: draft.tables }) : ''}</p>`;
  }
  $('#summary').innerHTML = html;
  $('#createBtn').disabled = !!err || dupes;
  $('#createBtn').classList.toggle('off', !!err || dupes);
}

function renderPlayerList(focusLast = false) {
  $('#plist').innerHTML = draft.names.map(pRow).join('');
  $('#known').innerHTML = knownChips();
  updateSummary();
  if (focusLast) $(`#p-${draft.names.length - 1}`)?.focus();
}

function createFromDraft() {
  const names = filledNames();
  const s = draftSettings();
  if (L.validate(draft.format, names.length, s)) return;
  const t = L.createTournament({ name: draft.name.trim() || tr('defaultName'), format: draft.format, game: draft.game, names, settings: s });
  if (draft.replaceId) removeTournament(draft.replaceId);
  if (!upsertTournament(t)) toast(tr('saveFailed'));
  draft = null;
  go({ name: 't', id: t.id, tab: 'overview' });
  toast(tr('created'));
}

// ---------- Tournament ----------
function tabsFor(t) {
  const tabs = [['overview', tr('tabOverview')]];
  if (t.format === 'knockout') tabs.push(['bracket', tr('tabBracket')]);
  else {
    tabs.push(['matches', tr('tabMatches')], ['table', tr('tabTable')]);
    if (L.hasPlayoff(t)) tabs.push(['bracket', tr('tabPlayoff')]);
  }
  tabs.push(['stats', tr('tabStats')], ['manage', tr('tabManage')]);
  return tabs;
}

function viewTournament(t, tab) {
  const tabs = tabsFor(t);
  if (!tabs.some(([k]) => k === tab)) tab = 'overview';
  const sub = `${fmtName(t.format)} · ${tr('nPlayers', { n: t.players.length })} · ${tr('game_' + t.game)}`;
  const body = { overview: tabOverview, matches: tabMatches, table: tabTable, bracket: tabBracket, stats: tabStats, manage: tabManage }[tab](t);
  return `<div class="hdr-wrap">${header({ back: '#/', title: t.name, sub, actions: `${liveBadge(t)}<button class="iconbtn" data-act="share" aria-label="${tr('share')}">${ICON.share}</button>` })}
    <nav class="tabs" aria-label="${esc(t.name)}">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-tab="${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</button>`).join('')}</nav></div>
    <main class="page tight">${t.demo ? `<div class="note">${tr('demoNote')}</div>` : ''}${t.live && liveError ? `<div class="note warn-note">${tr('liveError')}</div>` : ''}${body}</main>`;
}

function currentRound(t) {
  const i = t.rounds.findIndex(r => !r.matches.every(L.isDone));
  return i < 0 ? t.rounds.length : i + 1;
}

/** One tick per match: played, live, waiting, then the playoff in gold outline. */
function ticks(t) {
  const st = L.stageMatches(t).map(m => (L.isDone(m) ? 'd' : L.isLive(m) ? 'l' : ''));
  const p = L.plan(t.format, t.players.length, t.settings);
  let ko;
  if (t.bracket) ko = L.bracketMatches(t).filter(m => !L.isBye(m)).map(m => (L.isDone(m) ? 'd' : L.isLive(m) ? 'l' : 'p'));
  else ko = Array(t.format === 'knockout' ? 0 : p.playoff).fill('p');
  if (t.format === 'swiss') for (let i = st.length; i < p.stage; i++) st.push('');
  const cell = c => `<i class="${c}"></i>`;
  if (st.length + ko.length > 64) return '';
  return `<div class="ticks" aria-hidden="true">${st.map(cell).join('')}${st.length && ko.length ? '<b></b>' : ''}${ko.map(cell).join('')}</div>`;
}

function heroCard(t) {
  const ph = L.phase(t);
  const { done, total } = L.progress(t);
  const foot = `${ticks(t)}<div class="hero-foot t-sm tnum"><span>${tr('matchesOf', { done, total })}</span><span class="ink-2">${tr('left', { n: total - done })}</span></div>`;
  if (ph === 'done') {
    if (!t.celebrated) { t.celebrated = true; upsertTournament(t); afterRender.push(() => confetti()); }
    return championCard(t, L.podium(t));
  }
  if (ph === 'nextRound') {
    return `<section class="feltbox hero-box"><span class="t-over">${fmtName(t.format)}</span>
      <h2 class="t-h1">${tr('roundDone', { n: t.rounds.length })}</h2>
      <p class="t-sm ink-2">${tr('nextRoundHint')}</p>
      <button class="btn btn-p" data-act="nextRound">${tr('makeRound', { n: t.rounds.length + 1 })}</button>${foot}</section>`;
  }
  if (ph === 'readyForPlayoff') {
    const q = L.qualifiers(t);
    return `<section class="feltbox hero-box"><span class="t-over">${tr('playoff')}</span>
      <h2 class="t-h2">${tr('stageDoneTitle')}</h2>
      <div class="qual">${q.map(x => `<span class="chip">${pball(t, x.id, 24)}<span class="seed">${esc(x.label)}</span>${esc(L.playerName(t, x.id))}</span>`).join('')}</div>
      <button class="btn btn-g" data-act="startPlayoff">${ICON.trophy}<span>${tr('startPlayoff')}</span></button>${foot}</section>`;
  }
  let title, over = fmtName(t.format);
  if (ph === 'playoff') {
    over = t.format === 'knockout' ? fmtName('knockout') : tr('playoff');
    const R = t.bracket.rounds;
    const r = R.findIndex(round => !round.every(L.isDone));
    title = r < 0 ? (t.bracket.bronze ? tr('bronze') : tr('final')) : roundName(R.length - 1 - r, r);
  } else if (t.format === 'swiss') title = tr('roundXofY', { x: t.rounds.length, y: t.settings.swissRounds });
  else title = tr('roundXofY', { x: Math.min(currentRound(t), t.rounds.length), y: t.rounds.length });
  return `<section class="feltbox hero-box"><span class="t-over">${over}</span><h2 class="t-h1">${title}</h2>${foot}</section>`;
}

function championCard(t, pod) {
  const n = id => esc(L.playerName(t, id));
  const flecks = range(0, 13).map(i => {
    const kind = i % 3 === 0 ? 'fleck' : 'cube';
    const anim = 'abc'[i % 3];
    return `<span class="cf ${anim}" style="left:${(i * 37) % 100}%;animation-duration:${4 + (i % 5) * 0.7}s;animation-delay:-${(i * 0.53).toFixed(2)}s"><span class="${kind}" style="${kind === 'cube' && i % 2 ? 'background:#F5F0E4' : ''}"></span></span>`;
  }).join('');
  const col = (id, place, h, plate) => id ? `<div class="pcol">${pball(t, id, 30, 'lift')}<span class="nm">${n(id)}</span>
    <div class="plinth pod" style="height:${h}px;animation-delay:${place * 120}ms"><span class="plate ${plate}">${place}</span></div></div>` : '<div class="pcol"></div>';
  return `<section class="felt-hero champ">
    <div class="cone" style="left:50%;top:0;width:360px;height:100%;margin-left:-180px"></div>
    <div class="cf-wrap">${flecks}</div>
    <span class="t-over">${tr('champion')}</span>
    ${pball(t, pod.first, 64, 'lift rise')}
    <div class="t-hero rise">${n(pod.first)}</div>
    <div class="podium">${col(pod.second, 2, 62, 's')}${col(pod.first, 1, 92, '')}${col(pod.third, 3, 44, 'b')}</div>
    <button class="btn btn-g btn-sm" data-act="shareText">${ICON.share}<span>${tr('shareResult')}</span></button>
  </section>`;
}

/** Kit match row: name | score | name, both names with their ball. */
function matchRow(t, m, { start = false, ctx = false } = {}) {
  if (L.isBye(m)) return '';
  const live = L.isLive(m), done = L.isDone(m), ready = L.isReady(m);
  const [a, b] = L.score(m);
  const w = L.winnerOf(m);
  const cls = id => (done ? (id === w ? 'win' : 'lose') : '');
  let small = '';
  if (live) small = `<small>${m.table ? tr('tableN', { n: m.table }) : tr('live')}</small>`;
  else if (ctx) small = `<small>${esc(ctxLabel(t, m))}</small>`;
  else if (m.group) small = `<small class="grp-s">${tr('groupN', { g: m.group })}</small>`;
  const mid = done || live ? `${a}–${b}` : start ? '' : `<span class="t-sm ink-3" style="font-family:var(--f-body)">${tr('vs')}</span>`;
  const inner = `<span class="mp ${cls(m.a)}">${pball(t, m.a)}<span class="ell">${pname(t, m.a)}</span></span>
    <span class="ms ${live ? 'live' : ''}">${start ? `<span class="btn btn-p btn-sm" style="height:36px;padding:0 12px" data-act="startMatch" data-mid="${m.id}">${tr('start')}</span>` : mid}${small}</span>
    <span class="mp r ${cls(m.b)}">${pball(t, m.b)}<span class="ell">${pname(t, m.b)}</span></span>`;
  return `<button class="match ${live ? 'on' : ''}" data-act="openMatch" data-mid="${m.id}" ${ready ? '' : 'disabled'}>${inner}</button>`;
}

function tabOverview(t) {
  let html = heroCard(t);
  let side = '';
  const live = L.allMatches(t).filter(L.isLive);
  if (live.length) html += `<section class="stack"><div class="sec"><span class="t-over"><span class="live-dot" style="margin-right:8px"></span>${tr('liveNow')}</span></div><div class="card">${live.map(m => matchRow(t, m)).join('')}</div></section>`;
  if (L.phase(t) !== 'done') {
    const next = L.upNext(t).slice(0, Math.max(3, t.settings.tables * 2));
    if (next.length) html += `<section class="stack"><div class="sec"><span class="t-over">${tr('upNext')}</span></div><div class="card">${next.map(m => matchRow(t, m, { start: true })).join('')}</div></section>`;
  }
  if (t.format !== 'knockout') {
    const groups = t.format === 'groups' ? t.groups : [{ name: null, players: null }];
    side += `<section class="stack"><div class="sec"><span class="t-over">${tr('tabTable')}</span><button class="link" data-act="tab" data-tab="table">${tr('seeAll')}${ICON.chev}</button></div>`;
    side += groups.map(g => {
      const rows = L.standingsFor(t, g.players || undefined).slice(0, g.name ? 99 : 5);
      const cut = g.name ? t.settings.advance : L.hasPlayoff(t) ? L.playoffCount(t.format, t.players.length, t.settings) : 0;
      return `<div class="card">${g.name ? `<div class="round-h"><span class="t-over">${tr('groupN', { g: g.name })}</span></div>` : ''}
        ${rows.map((r, i) => `<div class="list-row"><span class="pos ${i < cut ? 'adv' : ''}">${i + 1}</span>${pball(t, r.id, 24)}<span class="grow t-body ell" style="font-weight:600">${esc(r.name)}</span><span class="t-sm ink-3 tnum">${r.w}–${r.l}</span><span class="num t-h3" style="min-width:24px;text-align:right">${r.pts}</span></div>`).join('')}</div>`;
    }).join('') + '</section>';
  } else if (t.bracket && L.phase(t) !== 'done') {
    side += `<button class="link" data-act="tab" data-tab="bracket">${tr('seeBracket')}${ICON.chev}</button>`;
  }
  return `<div class="ov"><div class="ov-main">${html}</div><div class="ov-side">${side}</div></div>`;
}

function tabMatches(t) {
  const f = ui.filter, pid = ui.player;
  const keep = m => (f === 'all' || (f === 'open' ? !L.isDone(m) : L.isDone(m))) && (!pid || m.a === pid || m.b === pid);
  let html = `<div class="stack">
    ${segBtns([['all', tr('fAll')], ['open', tr('fOpen')], ['done', tr('fDone')]], f, v => `data-act="filter" data-f="${v}"`)}
    <div class="field">${pid ? pball(t, pid, 22) : ICON.users}
      <select id="playerFilter" aria-label="${tr('filterPlayer')}"><option value="">${tr('allPlayers')}</option>
      ${t.players.map(p => `<option value="${p.id}" ${pid === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
  </div>`;
  if (L.canNextSwissRound(t)) html += `<div class="feltbox hero-box"><h2 class="t-h2">${tr('roundDone', { n: t.rounds.length })}</h2><button class="btn btn-p" data-act="nextRound">${tr('makeRound', { n: t.rounds.length + 1 })}</button></div>`;
  let shown = 0;
  html += '<div class="rounds">';
  t.rounds.forEach((r, i) => {
    const ms = r.matches.filter(keep);
    if (!ms.length) return;
    shown += ms.length;
    const allDone = r.matches.every(L.isDone);
    html += `<section class="card">
      <div class="round-h"><span class="t-h3">${tr('roundN', { n: i + 1 })}</span>${allDone ? `<span class="tag tag-win">${tr('roundComplete')}</span>` : r.matches.some(L.isLive) ? `<span class="tag tag-live"><span class="live-dot"></span>${tr('live')}</span>` : ''}</div>
      ${ms.map(m => matchRow(t, m)).join('')}
      ${r.byes.length && !pid ? `<div class="byes">${tr(t.format === 'swiss' ? 'byeWin' : 'sitsOut')}: <strong class="ink-2">${r.byes.map(id => esc(L.playerName(t, id))).join(', ')}</strong></div>` : ''}
    </section>`;
  });
  html += '</div>';
  if (t.format === 'swiss' && t.rounds.length < t.settings.swissRounds && !L.canNextSwissRound(t)) {
    html += `<p class="t-sm ink-3 center">${tr('swissLater', { n: t.settings.swissRounds - t.rounds.length })}</p>`;
  }
  if (!shown) html += `<p class="empty">${tr('noMatches')}</p>`;
  return html;
}

function standingsTable(t, rows, cut, cutLabel) {
  const swiss = t.format === 'swiss';
  const balls = !!t.settings.ballCount;
  const finished = L.phase(t) === 'done' && !L.hasPlayoff(t);
  const cols = 8 + (balls ? 1 : 0) + (swiss ? 1 : 0);
  let body = '';
  rows.forEach((r, i) => {
    if (cut && i === cut) body += `<tr class="cutrow"><td colspan="${cols}"><div class="cut">${cutLabel}</div></td></tr>`;
    body += `<tr>
      <td><span class="pos ${finished && i === 0 ? 'gold' : i < cut ? 'adv' : ''}">${i + 1}</span></td>
      <td class="l nm"><div class="row">${pball(t, r.id, 22)}<span class="ell">${esc(r.name)}</span></div></td>
      <td>${r.p}</td><td>${r.w}</td><td>${r.l}</td>
      <td class="hide-xs">${r.ff}–${r.fa}</td><td>${sign(r.diff)}</td>${balls ? `<td>${sign(r.bdiff)}</td>` : ''}${swiss ? `<td>${r.bh}</td>` : ''}
      <td class="p">${r.pts}</td>
      <td class="hide-xs"><span class="form">${r.form.slice(-5).map(x => `<span class="vt sm ${x === 'L' ? 't' : 'v'}">${tr('form' + x)}</span>`).join('')}</span></td>
    </tr>`;
  });
  return `<div class="card tbl-wrap"><table class="st">
    <thead><tr><th>#</th><th class="l">${tr('player')}</th><th title="${tr('colPLong')}">${tr('colP')}</th><th>${tr('colW')}</th><th>${tr('colL')}</th>
      <th class="hide-xs">${tr('colFrames')}</th><th title="${tr('colFrameDiffLong')}">+/−</th>${balls ? `<th title="${tr('colBallsLong')}">${tr('colBalls')}</th>` : ''}${swiss ? `<th title="Buchholz">BH</th>` : ''}<th>${tr('colPts')}</th><th class="hide-xs">${tr('colForm')}</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function matrix(t, ids) {
  const ps = t.players.filter(p => ids.includes(p.id));
  const res = {};
  for (const m of L.stageMatches(t)) {
    if (L.isDone(m)) {
      (res[m.a + '|' + m.b] ||= []).push([m.sa, m.sb]);
      (res[m.b + '|' + m.a] ||= []).push([m.sb, m.sa]);
    } else if (L.isLive(m)) {
      res[m.a + '|' + m.b + '|live'] = res[m.b + '|' + m.a + '|live'] = true;
    }
  }
  let cells = `<span></span>${ps.map(p => `<span class="h" title="${esc(p.name)}">${pball(t, p.id, 22)}</span>`).join('')}`;
  for (const p of ps) {
    cells += `<span class="rh">${pball(t, p.id, 18)}${esc(p.name)}</span>`;
    for (const q of ps) {
      if (p.id === q.id) { cells += '<span class="mx x"></span>'; continue; }
      const r = res[p.id + '|' + q.id];
      const live = res[p.id + '|' + q.id + '|live'];
      if (!r) { cells += `<span class="mx ${live ? 'lv' : ''}">${live ? '•' : '·'}</span>`; continue; }
      const [x, y] = r[r.length - 1];
      cells += `<span class="mx ${x > y ? 'w' : 'l'}" title="${r.map(([a, b]) => `${a}–${b}`).join(', ')}">${r.map(([a, b]) => `${a}–${b}`).join(' ')}</span>`;
    }
  }
  return `<div class="card tbl-wrap"><div class="mxg" style="grid-template-columns:auto repeat(${ps.length}, minmax(44px, 1fr))">${cells}</div></div>`;
}

function tabTable(t) {
  const rules = tr('tiebreak' + (t.format === 'swiss' ? 'Swiss' : t.settings.ballCount ? 'Balls' : ''), { p: t.settings.pointsPerWin });
  if (t.format === 'groups') {
    return `<div class="duo">${t.groups.map(g => `<section class="stack"><div class="sec"><span class="t-over">${tr('groupN', { g: g.name })}</span></div>${standingsTable(t, L.standingsFor(t, g.players), t.settings.advance, tr('playoff'))}</section>`).join('')}</div>` +
      `<p class="t-sm ink-3">${rules} ${tr('qualifyGroups', { n: t.settings.advance })}</p>` +
      `<div class="duo">${t.groups.map(g => `<section class="stack"><div class="sec"><span class="t-over">${tr('resultsGroup', { g: g.name })}</span></div>${matrix(t, g.players)}</section>`).join('')}</div>`;
  }
  const cut = L.hasPlayoff(t) ? L.playoffCount(t.format, t.players.length, t.settings) : 0;
  return standingsTable(t, L.standingsFor(t), cut, tr('playoff')) +
    `<p class="t-sm ink-3">${rules} ${cut ? tr('qualifyTop', { n: cut }) : ''}</p>` +
    (t.format === 'league' ? `<section class="stack"><div class="sec"><span class="t-over">${tr('allResults')}</span></div>${matrix(t, t.players.map(p => p.id))}</section>` : '');
}

function bmatch(t, m, isFinal) {
  const labels = t.bracket.labels || {};
  if (L.isBye(m)) {
    return `<div class="bk wait"><div class="bkl win">${pball(t, m.a, 18)}<span class="nm">${pname(t, m.a)}</span></div>
      <div class="bkl tbd"><span class="nm">${tr('byeAdvance')}</span></div></div>`;
  }
  const done = L.isDone(m), live = L.isLive(m), ready = L.isReady(m);
  const [a, b] = L.score(m);
  const w = L.winnerOf(m);
  const line = (id, s) => {
    const cls = !id ? 'tbd' : done ? (id === w ? 'win' : 'lose') : '';
    return `<div class="bkl ${cls}"><span class="seed">${esc(labels[id] || '')}</span>${pball(t, id, 18)}<span class="nm">${pname(t, id)}</span><span class="sc">${done || live ? s : ''}</span></div>`;
  };
  const cls = `bk ${live ? 'live' : ''} ${!ready ? 'wait' : ''} ${isFinal && ready ? 'final' : ''}`;
  return `<button class="${cls}" data-act="openMatch" data-mid="${m.id}" ${ready ? '' : 'disabled'}>${line(m.a, a)}${line(m.b, b)}</button>`;
}

function tabBracket(t) {
  if (!t.bracket) {
    const q = L.qualifiers(t);
    const complete = L.stageComplete(t);
    return `<section class="feltbox hero-box">
      <span class="t-over">${tr('playoff')}</span>
      <h2 class="t-h1">${tr('playoffNotStarted')}</h2>
      <p class="t-sm ink-2">${tr('playoffExplain', { n: q.length, semis: t.settings.koRace, final: t.settings.finalRace })}</p>
      <div class="qual">${q.map(x => `<span class="chip">${pball(t, x.id, 24)}<span class="seed">${esc(x.label)}</span>${esc(L.playerName(t, x.id))}</span>`).join('')}</div>
      ${complete ? '' : `<p class="t-sm" style="color:#FFD58A">${tr('playoffEarly')}</p>`}
      <button class="btn btn-g" data-act="startPlayoff">${ICON.trophy}<span>${tr('startPlayoff')}</span></button>
    </section>`;
  }
  const R = t.bracket.rounds;
  let html = `<div class="bracket-scroll"><div class="brk" style="--cols:${R.length}">`;
  R.forEach((ms, r) => {
    const last = r === R.length - 1;
    const race = last ? t.settings.finalRace : t.settings.koRace;
    html += `<div class="brk-col"><div class="bk-h"><span>${last ? '🏆 ' : ''}${roundName(R.length - 1 - r, r)}</span><span class="tnum">${tr('raceShort', { n: race })}</span></div>
      <div class="brk-body">${ms.map(m => bmatch(t, m, last)).join('')}
      ${last && t.bracket.bronze ? `<div class="bronze-box"><div class="bk-h"><span>${tr('bronze')}</span><span>${tr('raceShort', { n: t.settings.koRace })}</span></div>${bmatch(t, t.bracket.bronze, false)}</div>` : ''}
      </div></div>`;
  });
  html += '</div></div>';
  const pod = L.podium(t);
  if (pod) html += championCard(t, pod);
  if (t.format !== 'knockout') html += `<div class="row center"><button class="btn btn-ghost btn-sm" data-act="resetPlayoff">${tr('resetPlayoff')}</button></div>`;
  return html;
}

function tabStats(t) {
  const { players, highlights: h, matches } = L.playerStats(t);
  if (!matches) return `<p class="empty">${tr('noStatsYet')}</p>`;
  const n = id => esc(L.playerName(t, id));
  const big = h.biggest?.m;
  const kpis = [
    [tr('stMatches'), matches],
    [tr('stFrames'), h.frames],
    t.settings.ballCount ? [tr('stBlacks'), h.blacks] : [tr('stBR'), h.br],
    [tr('stBiggest'), big ? `${big.sa}–${big.sb}` : '–', big ? `${n(big.a)} – ${n(big.b)}` : ''],
  ];
  const balls = !!t.settings.ballCount;
  return `<div class="kpis">${kpis.map(([k, v, s]) => `<div class="kpi"><span class="t-over">${k}</span><span class="v">${v}</span>${s ? `<span class="t-xs">${s}</span>` : ''}</div>`).join('')}</div>
    <div class="card tbl-wrap"><table class="st">
      <thead><tr><th class="l">${tr('player')}</th><th>${tr('colP')}</th><th>${tr('colW')}–${tr('colL')}</th><th class="l">${tr('winPct')}</th><th class="hide-xs">${tr('framePct')}</th><th title="${tr('streakLong')}">${tr('streak')}</th>${balls ? `<th title="${tr('colBallsLong')}">${tr('colBalls')}</th>` : ''}<th title="Break &amp; run">B&amp;R</th></tr></thead>
      <tbody>${players.map(r => `<tr><td class="l nm"><div class="row">${pball(t, r.id, 22)}<span class="ell">${esc(r.name)}</span></div></td><td>${r.p}</td><td>${r.w}–${r.l}</td>
        <td class="l"><span class="pbar"><i style="width:${pct(r.winPct)}"></i></span>${pct(r.winPct)}</td>
        <td class="hide-xs">${pct(r.framePct)}</td><td>${r.best}</td>${balls ? `<td>${sign(r.bdiff)}</td>` : ''}<td>${r.br}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="t-sm ink-3">${tr('brHint')}</p>`;
}

function tabManage(t) {
  const s = t.settings;
  return `<div class="duo"><div class="stack" style="gap:20px"><section class="stack">
      <div class="sec"><span class="t-over">${tr('tournament')}</span></div>
      <div class="field"><input id="m-name" value="${esc(t.name)}" maxlength="60" aria-label="${tr('tName')}"></div>
      <span class="lbl" style="margin:4px 0 0">${tr('renamePlayers')}</span>
      <div class="stack" style="gap:8px">${t.players.map(p => `<div class="field">${pball(t, p.id, 26)}<input id="m-p-${p.id}" data-rename="${p.id}" value="${esc(p.name)}" maxlength="30" aria-label="${esc(p.name)}"></div>`).join('')}</div>
      <button class="btn btn-p" data-act="saveNames">${tr('save')}</button>
    </section>
    <section class="stack">
      <div class="sec"><span class="t-over">${tr('during')}</span></div>
      <div class="card">
        ${optRow(tr('tables'), '', stepper(s.tables, d => `data-act="stepSetting" data-field="tables" data-d="${d}"`, tr('tables')))}
        <div class="list-row"><div class="stack grow" style="gap:8px"><span class="t-body">${tr('breakRule')}</span>
          ${segBtns([['alternate', tr('breakAlternate')], ['winner', tr('breakWinner')]], s.breakRule, v => `data-act="setSetting" data-field="breakRule" data-value="${v}"`)}</div></div>
        ${optRow(tr('ballCount'), tr('ballCountHint', { n: L.maxBalls(t.game) }), switchBtn(s.ballCount, 'data-act="toggleSetting" data-field="ballCount"', tr('ballCount')))}
      </div>
      <p class="t-xs ink-3">${tr('racesFixed', { a: s.raceTo, b: s.koRace, c: s.finalRace })}</p>
    </section></div>
    <div class="stack" style="gap:20px">${liveSection(t)}<section class="stack">
      <div class="sec"><span class="t-over">${tr('shareBackup')}</span></div>
      <p class="t-sm ink-2">${tr('shareBackupHint')}</p>
      <div class="row wrap">
        <button class="btn btn-s" data-act="share">${ICON.share}<span>${tr('share')}</span></button>
        ${framed ? '' : `<button class="btn btn-s" data-act="download">${ICON.import}<span>${tr('downloadFile')}</span></button>`}
      </div>
    </section>
    <section class="stack">
      <div class="sec"><span class="t-over">${tr('again')}</span></div>
      <div class="row wrap">
        <button class="btn btn-s" data-act="rematch">${tr('rematch')}</button>
        <button class="btn btn-s" data-act="changeFormat">${tr('changeFormat')}</button>
      </div>
      <p class="t-xs ink-3">${tr('againHint')}</p>
      <button class="btn btn-d" data-act="deleteT">${ICON.trash}<span>${tr('deleteT')}</span></button>
    </section></div></div>`;
}

function liveSection(t) {
  if (!Live.isAvailable() && !t.live) return '';
  const w = Live.isWritable();
  let body;
  if (t.live) {
    body = `<p class="t-sm ink-2">${tr('liveOnHint')}</p><p class="t-xs ink-3">${tr('liveHowTo')}</p>
      ${w && Live.isAvailable() ? `<button class="btn btn-s" data-act="stopLive">${tr('stopLive')}</button>` : ''}`;
  } else {
    body = `<p class="t-sm ink-2">${tr('liveOffHint')}</p><p class="t-xs ink-3">${tr('liveHowTo')}</p>
      ${w ? `<button class="btn btn-p" data-act="goLive"><span class="live-dot" style="background:currentColor"></span><span>${tr('goLive')}</span></button>` : `<p class="t-sm warn">${tr('readOnlyLive')}</p>`}`;
  }
  return `<section class="stack"><div class="sec"><span class="t-over">${tr('liveTitle')}</span>${liveBadge(t)}</div><div class="card pad">${body}</div></section>`;
}

// ---------- Match screen: the table ----------
function viewMatch(t, mid) {
  const info = L.matchInfo(t, mid);
  const backTo = `#/t/${t.id}/${info?.stage === 'bracket' || t.format === 'knockout' ? 'bracket' : 'overview'}`;
  if (!info || !L.isReady(info.m)) {
    return header({ back: backTo, title: t.name }) + `<main class="page tight"><p class="empty">${tr('matchNotReady')}</p></main>`;
  }
  const { m, race } = info;
  const [a, b] = L.score(m);
  const done = L.isDone(m);
  const ro = !!t.live && !Live.isWritable(); // watching a live tournament without write access
  const frames = m.frames || [];
  const nextBreak = done ? null : L.breakerFor(m, frames.length, t.settings.breakRule);
  const w = L.winnerOf(m);
  const half = (s, val) => {
    const id = m[s];
    const state = done ? (id === w ? 'won' : 'lost') : nextBreak === s ? 'brk' : '';
    const popped = ui.pop === s;
    // Race diamonds: the sight markers on a real rail, lit per frame won.
    const dias = range(1, Math.min(race, 11)).map(i => `<span class="dia ${i <= val ? (done && id === w ? 'gold' : 'on') : ''}"></span>`).join('');
    return `<button class="half ${state}" data-act="frame" data-side="${s}" ${done || ro ? 'disabled' : ''} aria-label="${tr('addFrameFor', { name: L.playerName(t, id) })}">
      <span class="lamp"></span>
      <span class="brk-tag">${cue(18)}${tr('breakTag')}</span>
      <span class="pl">${pball(t, id, 30, 'lift')}<span class="pl-name">${pname(t, id)}</span></span>
      <span class="score"><span class="${popped ? 'pop' : ''}">${val}</span></span>
      ${popped ? '<span class="puff"></span>' : ''}
      <span class="dias">${dias}</span>
      <span class="hint">${done ? (id === w ? tr('winner') : '&nbsp;') : ro ? '&nbsp;' : tr('tapFrame')}</span>
    </button>`;
  };
  // A phone shows the table standing up (long rails left and right); a computer shows it lying down.
  // Both sets of sights and side pockets are drawn, and CSS shows the set that fits.
  const long = [12.5, 25, 37.5, 62.5, 75, 87.5], short = [25, 50, 75];
  const sight = (cls, pos) => `<span class="sight ${cls}" style="${pos}"></span>`;
  const sights =
    long.map(p => sight('po', `left:4px;top:calc(${p}% - 3.5px)`) + sight('po', `right:4px;top:calc(${p}% - 3.5px)`)).join('') +
    short.map(p => sight('po', `top:4px;left:calc(${p}% - 3.5px)`) + sight('po', `bottom:4px;left:calc(${p}% - 3.5px)`)).join('') +
    long.map(p => sight('la', `top:4px;left:calc(${p}% - 3.5px)`) + sight('la', `bottom:4px;left:calc(${p}% - 3.5px)`)).join('') +
    short.map(p => sight('la', `left:4px;top:calc(${p}% - 3.5px)`) + sight('la', `right:4px;top:calc(${p}% - 3.5px)`)).join('');
  const pocket = (cls, pos) => `<span class="pocket ${cls}" style="${pos}"></span>`;
  const pockets = pocket('', 'top:-11px;left:-11px') + pocket('', 'top:-11px;right:-11px') + pocket('', 'bottom:-11px;left:-11px') + pocket('', 'bottom:-11px;right:-11px') +
    pocket('po', 'top:calc(50% - 15px);left:-17px') + pocket('po', 'top:calc(50% - 15px);right:-17px') +
    pocket('la', 'left:calc(50% - 15px);top:-17px') + pocket('la', 'left:calc(50% - 15px);bottom:-17px');

  let banner = '';
  if (done) {
    const nxt = L.upNext(t)[0];
    const finished = L.phase(t) === 'done';
    banner = `<section class="card result banner-in">
      ${pball(t, w, 44, 'lift')}
      <div class="t-h2">${tr('wonBy', { name: esc(L.playerName(t, w)), a: Math.max(a, b), b: Math.min(a, b) })}</div>
      ${finished ? `<button class="btn btn-g btn-block" data-act="nav" data-to="#/t/${t.id}/overview">${ICON.trophy}<span>${tr('seeChampion')}</span></button>`
        : nxt ? `<button class="btn btn-p btn-block" data-act="openMatch" data-mid="${nxt.id}"><span class="ell">${tr('nextMatch')}: ${pname(t, nxt.a)} – ${pname(t, nxt.b)}</span></button>` : ''}
      <button class="btn btn-s btn-block" data-act="nav" data-to="#/t/${t.id}/overview">${tr('toOverview')}</button>
    </section>`;
  }
  const tables = t.settings.tables > 1 && !done
    ? `<div class="table-pick"><span class="t-over">${tr('table')}</span>${segBtns(range(1, t.settings.tables).map(k => [k, String(k)]), m.table, v => `data-act="setTable" data-n="${v}"`)}</div>`
    : '';
  const log = frames.map((f, i) => ({ f, i })).reverse().map(({ f, i }) => {
    const ballsTag = !t.settings.ballCount ? ''
      : f.left == null ? `<button class="tag btn-ghost" data-act="editBalls" data-i="${i}">${tr('addBalls')}</button>`
        : f.black ? `<button class="tag tag-mute" data-act="editBalls" data-i="${i}">${ballEl(8, 14)}${tr('earlyBlackShort')}</button>`
          : `<button class="tag tag-mute" data-act="editBalls" data-i="${i}">${tr('leftN', { n: f.left })}</button>`;
    const br = f.w === f.b ? `<button class="tag ${f.br ? 'tag-gold' : 'btn-ghost'}" data-act="toggleBR" data-i="${i}" aria-pressed="${!!f.br}" title="Break &amp; run">${ICON.bolt}B&amp;R</button>` : '';
    return `<div class="logr"><span class="fno">${String(i + 1).padStart(2, '0')}</span>
      <span class="who"><span class="row" style="gap:8px">${pball(t, m[f.w], 18)}<strong class="ell">${pname(t, m[f.w])}</strong></span><span class="t-xs">${tr('brokeBy', { name: pname(t, m[f.b]) })}</span></span>
      <span class="tools">${ballsTag}${br}</span></div>`;
  }).join('');

  return header({ back: backTo, title: ctxLabel(t, m), sub: `${t.name} · ${tr('raceShort', { n: race })}`, actions: liveBadge(t) }) + `<main class="page tight match-page match-grid">
    <div class="match-main">
    ${tables}
    <div class="table">${sights}<div class="felt">${pockets}<div class="halves">${half('a', a)}${half('b', b)}</div></div></div>
    </div><div class="match-side">
    ${done ? banner : ro ? `<p class="t-sm ink-3 center">${tr('readOnlyLive')}</p>` : `<p class="t-sm ink-3 center">${frames.length ? tr('tapHint') : tr('tapHintFirst')}</p><p class="t-xs ink-3 center desk-only">${tr('keysMatch')}</p>`}
    <div class="acts ${ro ? 'hide' : ''}">
      <button class="act ${frames.length ? '' : 'off'}" data-act="undo">${ICON.undo}<span>${tr('undo')}</span></button>
      <button class="act" data-act="quickResult">${ICON.edit}<span>${tr('enterResultShort')}</span></button>
      <button class="act ${!frames.length && !done ? '' : 'off'}" data-act="swapBreak">${ICON.swap}<span>${tr('swapBreak')}</span></button>
      <button class="act warn ${m.startedAt || done ? '' : 'off'}" data-act="resetMatch">${ICON.trash}<span>${tr('resetShort')}</span></button>
    </div>
    ${frames.length ? `<section class="stack"><div class="sec"><span class="t-over">${tr('frames')}</span><span class="t-xs ink-3 tnum">${frames.length}</span></div><div class="card">${log}</div></section>` : ''}
    </div>
  </main>`;
}

/** Sheet: how many balls the loser of frame i had left. */
function ballsSheet(t, m, i) {
  const f = m.frames[i];
  if (!f) return;
  const loser = m[f.w === 'a' ? 'b' : 'a'];
  const max = L.maxBalls(t.game);
  openSheet(`<div class="grab"></div>
    <div class="row">${pball(t, loser, 32, 'lift')}<div class="grow"><h3 class="t-h2">${tr('ballsQ', { name: esc(L.playerName(t, loser)) })}</h3>
      <p class="t-sm ink-3">${tr('ballsSub', { n: i + 1, name: esc(L.playerName(t, m[f.w])) })}</p></div></div>
    <div class="picks">${range(0, max).map(n => `<button class="pick ${f.left === n && !f.black ? 'on' : ''}" data-act="pickBalls" data-i="${i}" data-n="${n}"><span class="num">${n}</span><span class="t-xs">${tr('leftLbl')}</span></button>`).join('')}</div>
    <button class="btn btn-s btn-block" data-act="pickBlack" data-i="${i}" aria-pressed="${!!f.black}" style="${f.black ? 'box-shadow:inset 0 0 0 2px var(--ink)' : ''}">${ballEl(8, 22, 'lift')}<span class="ell">${tr('earlyBlack', { name: esc(L.playerName(t, loser)) })}</span></button>
    <p class="t-xs ink-3 center" style="margin-top:8px">${tr('earlyBlackHint', { n: max })}</p>
    <button class="btn btn-ghost btn-block" data-act="skipBalls" data-i="${i}">${f.left == null ? tr('skip') : tr('clearBalls')}</button>`);
}

function quickResult(t, m, race) {
  let a = m.sa ?? L.score(m)[0], b = m.sb ?? L.score(m)[1];
  const useBalls = !!t.settings.ballCount;
  let [la, lb] = L.ballsLeft(m);
  const max = L.maxBalls(t.game);
  const side = (id, val, k, label) => `<div class="qr-side"><span class="nm">${pball(t, id, 20)}<span class="ell">${pname(t, id)}</span></span>
    <div class="stepper lg"><button type="button" data-q="${k}" data-d="-1" aria-label="${label} −1">−</button><output>${val}</output><button type="button" data-q="${k}" data-d="1" aria-label="${label} +1">+</button></div></div>`;
  const draw = () => {
    const ok = L.validScore(a, b, race);
    la = Math.min(la, b * max); lb = Math.min(lb, a * max);
    $('#qr').innerHTML = side(m.a, a, 'a', tr('frames')) + side(m.b, b, 'b', tr('frames'));
    $('#qrHint').textContent = ok ? tr('wonBy', { name: L.playerName(t, a > b ? m.a : m.b), a: Math.max(a, b), b: Math.min(a, b) }) : tr('needRace', { n: race });
    $('#qrSave').classList.toggle('off', !ok);
    if (useBalls) {
      $('#qrBalls').innerHTML = `<span class="t-over">${tr('ballsLeftTotal')}</span><div class="qr" style="margin-top:8px">${side(m.a, la, 'la', tr('colBalls'))}${side(m.b, lb, 'lb', tr('colBalls'))}</div>
        <p class="t-xs ink-3" style="margin-top:8px">${tr('ballsTotalHint', { n: max })}</p>`;
    }
  };
  openDialog(`<h3 class="t-h2">${tr('enterResult')}</h3><p class="t-sm ink-3">${tr('raceShort', { n: race })}</p>
    <div class="qr" id="qr"></div><p class="t-sm center" id="qrHint" style="margin-top:12px"></p>
    ${useBalls ? '<div id="qrBalls" style="margin-top:16px"></div>' : ''}
    <div class="modal-actions"><button class="btn btn-s" data-act="closeModal">${tr('cancel')}</button><button class="btn btn-p" id="qrSave">${tr('save')}</button></div>`);
  draw();
  $('#modal').onclick = e => {
    const s = e.target.closest('[data-q]');
    if (!s) return;
    const k = s.dataset.q, d = +s.dataset.d;
    if (k === 'la') la = Math.max(0, Math.min(b * max, la + d));
    else if (k === 'lb') lb = Math.max(0, Math.min(a * max, lb + d));
    else {
      if (k === 'a') a = Math.max(0, Math.min(race, a + d)); else b = Math.max(0, Math.min(race, b + d));
      if (a === race && b === race) k === 'a' ? (b = race - 1) : (a = race - 1);
    }
    draw();
  };
  $('#qrSave').addEventListener('click', () => {
    if (!L.validScore(a, b, race)) return;
    const [fa, fb] = L.score({ frames: m.frames });
    const [oa, ob] = L.ballsLeft(m);
    // Keep per-frame ball counts when the frames already add up to this result.
    const keepFrames = fa === a && fb === b && oa === la && ob === lb;
    L.setResult(t, m, a, b, useBalls && !keepFrames ? [la, lb] : undefined);
    closeModal();
    afterResult(t, m);
  });
}

function afterResult(t) {
  commit(t);
  vibrate([30, 40, 60]);
  if (L.phase(t) === 'done') confetti();
  else toast(tr('saved'));
}

// ---------- Players across tournaments ----------
function viewPlayers() {
  const rows = L.hallOfFame(db.tournaments.filter(t => !t.demo));
  const body = rows.length
    ? `<div class="card">${rows.map((r, i) => `<button class="list-row tap" data-act="playerCard" data-name="${esc(r.name)}">
        <span class="pos ${i === 0 && r.titles ? 'gold' : ''}">${i + 1}</span>${ballEl(idxBall(i), 28, 'lift')}
        <span class="ttl"><span class="t-body ell" style="font-weight:650">${esc(r.name)}</span><span class="t-xs ink-3 tnum">${tr('eventsN', { n: r.events })} · ${r.w}–${r.l} · ${pct(r.winPct)}</span></span>
        ${r.titles ? `<span class="plate">${r.titles}×</span>` : ''}${ICON.chev}
      </button>`).join('')}</div><p class="t-xs ink-3">${tr('hofHint')}</p>`
    : `<p class="empty">${tr('hofEmpty')}</p>`;
  return bigHeader(tr('navPlayers'), tr('ranking')) + `<main class="page">${body}</main>` + tabbar('players');
}

function playerCard(name) {
  const r = L.hallOfFame(db.tournaments.filter(t => !t.demo)).find(x => x.name === name);
  if (!r) return;
  const medal = p => (p ? `<span class="ball m${p}" style="font-size:24px"><i>${p}</i></span>` : `<span class="ball-ph" style="font-size:24px"></span>`);
  openSheet(`<div class="grab"></div><h3 class="t-h1">${esc(r.name)}</h3>
    <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:16px 0">
      <div class="kpi"><span class="t-over">${tr('titles')}</span><span class="v">${r.titles}</span></div>
      <div class="kpi"><span class="t-over">${tr('winPct')}</span><span class="v">${pct(r.winPct)}</span></div>
      <div class="kpi"><span class="t-over">${tr('framePct')}</span><span class="v">${pct(r.framePct)}</span></div>
    </div>
    <div class="card">${r.history.map(h => `<div class="list-row">${medal(h.place)}<span class="grow ell" style="font-weight:600">${esc(h.name)}</span><span class="t-sm ink-3 tnum">${h.w}–${h.l}${h.done ? '' : ' · ' + tr('ongoing')}</span></div>`).join('')}</div>
    <button class="btn btn-s btn-block" style="margin-top:16px" data-act="closeModal">${tr('close')}</button>`);
}

// ---------- Settings ----------
function viewSettings() {
  const prefSeg = (field, opts) => segBtns(opts, db.prefs[field] || (field === 'lang' ? getLang() : 'auto'), v => `data-act="pref" data-field="${field}" data-value="${v}"`);
  return bigHeader(tr('navSettings'), tr('appName')) + `<main class="page">
    <section class="stack"><div class="sec"><span class="t-over">${tr('language')}</span></div>${prefSeg('lang', LANGS.map(l => [l.code, l.name]))}</section>
    <section class="stack"><div class="sec"><span class="t-over">${tr('theme')}</span></div>${prefSeg('theme', [['auto', tr('themeAuto')], ['dark', tr('themeDark')], ['light', tr('themeLight')]])}</section>
    <section class="stack">
      <div class="sec"><span class="t-over">${tr('backupAll')}</span></div>
      <p class="t-sm ink-2">${tr('backupAllHint')}</p>
      <div class="row wrap">
        <button class="btn btn-s" data-act="backupCode">${ICON.copy}<span>${tr('copyBackup')}</span></button>
        ${framed ? '' : `<button class="btn btn-s" data-act="backupFile">${ICON.import}<span>${tr('downloadFile')}</span></button>`}
        <button class="btn btn-s" data-act="import">${ICON.import}<span>${tr('importBtn')}</span></button>
      </div>
    </section>
    ${installEvt ? `<section class="stack"><div class="sec"><span class="t-over">${tr('install')}</span></div><p class="t-sm ink-2">${tr('installHint')}</p><button class="btn btn-p" data-act="install">${tr('install')}</button></section>` : ''}
    <section class="stack">
      <div class="sec"><span class="t-over">${tr('about')}</span></div>
      <div class="card pad"><div class="row">${gameBall('8ball', 36, 'lift')}<div class="ttl grow"><span class="t-h3">${tr('appName')}</span><span class="t-xs ink-3">${tr('version')} ${VERSION}</span></div></div>
      <p class="t-sm ink-2">${tr('aboutText')}</p></div>
      <button class="btn btn-d" data-act="wipe">${ICON.trash}<span>${tr('wipe')}</span></button>
    </section>
  </main>` + tabbar('settings');
}

// ---------- Sharing and import ----------
let sharedCache = null;
function viewShared(code) {
  if (!sharedCache || sharedCache.code !== code) {
    sharedCache = { code, t: null, err: false };
    decode(code).then(x => { sharedCache.t = isTournament(x) ? x : null; sharedCache.err = !sharedCache.t; render(); }).catch(() => { sharedCache.err = true; render(); });
  }
  const t = sharedCache.t;
  let body;
  if (sharedCache.err) body = `<p class="empty">${tr('badCode')}</p>`;
  else if (!t) body = `<p class="empty">${tr('loading')}</p>`;
  else {
    const exists = !!getTournament(t.id);
    const pod = L.podium(t);
    const { done, total } = L.progress(t);
    body = `<section class="feltbox hero-box">
      <span class="t-over">${tr('sharedWithYou')}</span>
      <h2 class="t-h1">${esc(t.name)}</h2>
      <p class="t-sm ink-2">${fmtName(t.format)} · ${tr('nPlayers', { n: t.players.length })} · ${tr('matchesOf', { done, total })}</p>
      ${pod ? `<span class="tag tag-gold">${esc(L.playerName(t, pod.first))}</span>` : ''}
      <button class="btn btn-p" data-act="saveShared">${exists ? tr('updateCopy') : tr('saveCopy')}</button>
    </section>`;
  }
  return header({ back: '#/', title: tr('appName') }) + `<main class="page tight">${body}</main>`;
}

async function importText(text) {
  text = String(text || '').trim();
  if (!text) return toast(tr('pasteFirst'));
  let data;
  try {
    data = text.startsWith('{') ? JSON.parse(text) : await decode(text);
  } catch {
    return toast(tr('badCode'));
  }
  let list = [];
  if (Array.isArray(data?.tournaments)) list = data.tournaments;
  else if (isTournament(data)) list = [data];
  else if (data?.mode !== undefined || (Array.isArray(data?.players) && Array.isArray(data?.rounds))) list = [L.migrateV1(data)];
  list = list.filter(isTournament);
  if (!list.length) return toast(tr('badCode'));
  const clashes = list.filter(t => getTournament(t.id)).length;
  if (clashes && !(await ask(tr('replaceExisting', { n: clashes }), tr('replace'), false))) return;
  list.forEach(t => upsertTournament(t));
  closeModal();
  toast(tr('imported', { n: list.length }));
  if (list.length === 1) go({ name: 't', id: list[0].id, tab: 'overview' });
  else go({ name: 'home' });
}

function importDialog() {
  openSheet(`<div class="grab"></div><h3 class="t-h2">${tr('importTitle')}</h3>
    <p class="t-sm ink-3" style="margin:4px 0 14px">${tr('importHint')}</p>
    <div class="field" style="height:auto;padding:12px 14px"><textarea id="impText" rows="5" placeholder="POOL2.…" aria-label="${tr('importTitle')}" class="mono"></textarea></div>
    <label class="t-sm ink-2" style="display:block;margin-top:12px"><input type="file" id="impFile" accept="application/json,.json,.txt"> ${tr('orFile')}</label>
    <div class="modal-actions"><button class="btn btn-s" data-act="closeModal">${tr('cancel')}</button><button class="btn btn-p" id="impGo">${tr('importBtn')}</button></div>`);
  $('#impGo').addEventListener('click', () => importText($('#impText').value));
  $('#impFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (f) importText(await f.text());
  });
}

async function shareDialog(t) {
  const text = summaryText(t, tr);
  const live = Live.isAvailable() || t.live
    ? `<section class="feltbox hero-box" style="margin-top:14px;padding:16px;gap:8px">
        <span class="t-over">${tr('liveTitle')}</span>
        <p class="t-sm">${t.live ? tr('liveOnHint') : tr('liveOffHint')}</p>
        ${!t.live && Live.isWritable() ? `<button class="btn btn-p btn-sm" data-act="goLive">${tr('goLive')}</button>` : ''}
        <p class="t-xs" style="color:var(--ink-2)">${tr('liveHowTo')}</p>
      </section>`
    : '';
  openSheet(`<div class="grab"></div><h3 class="t-h2">${tr('share')}</h3>${live}
    <section class="stack" style="margin-top:14px">
      <span class="t-over">${tr('shareTextTitle')}</span>
      <pre class="card-2 mono t-xs" id="shText" style="padding:12px;white-space:pre-wrap;max-height:200px;overflow:auto;margin:0">${esc(text)}</pre>
      <div class="row wrap"><button class="btn btn-p btn-sm" data-act="copy" data-src="shText">${ICON.copy}<span>${tr('copyText')}</span></button>
      ${!framed && navigator.share ? `<button class="btn btn-s btn-sm" data-act="nativeShare">${ICON.share}<span>${tr('shareVia')}</span></button>` : ''}</div>
    </section>
    <section class="stack" style="margin-top:20px">
      <span class="t-over">${tr('shareCodeTitle')}</span>
      <p class="t-sm ink-3">${tr('shareCodeHint')}</p>
      <div class="field" style="height:auto;padding:12px 14px"><textarea id="shCode" rows="3" readonly aria-label="${tr('shareCodeTitle')}" class="mono">…</textarea></div>
      <div class="row wrap"><button class="btn btn-s btn-sm" data-act="copy" data-src="shCode">${ICON.copy}<span>${tr('copyCode')}</span></button>
      ${framed ? '' : `<button class="btn btn-s btn-sm" data-act="copyLink">${ICON.share}<span>${tr('copyLink')}</span></button>`}</div>
    </section>
    <button class="btn btn-ghost btn-block" style="margin-top:12px" data-act="closeModal">${tr('close')}</button>`);
  const code = await encode(t);
  const el = $('#shCode');
  if (el) { el.value = code; el.dataset.link = `${location.origin}${location.pathname}#/shared/${code}`; }
}

async function copyText(text, el) {
  try {
    await navigator.clipboard.writeText(text);
    toast(tr('copied'));
  } catch {
    if (el && el.select) { el.focus(); el.select(); }
    else if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    toast(tr('copyManually'));
  }
}

function downloadJSON(obj, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9æøå]+/gi, '-').replace(/^-|-$/g, '') || 'pool';

// ---------- Sheets, dialogs, toast, confetti ----------
function openModal(inner) {
  const d = $('#modal');
  d.onclick = null;
  d.innerHTML = `<div class="scrim" data-act="closeModal"></div>${inner}`;
  if (!d.open) d.showModal();
}
const openSheet = html => openModal(`<div class="sheet" role="document">${html}</div>`);
const openDialog = html => openModal(`<div class="dialog" role="document">${html}</div>`);
function closeModal() {
  const d = $('#modal');
  if (d.open) d.close();
}

function ask(text, yes = tr('yes'), danger = true) {
  return new Promise(resolve => {
    openDialog(`<h3 class="t-h2">${esc(text)}</h3><div class="modal-actions"><button class="btn btn-s" id="askNo">${tr('cancel')}</button><button class="btn ${danger ? 'btn-d solid' : 'btn-p'}" id="askYes">${esc(yes)}</button></div>`);
    const d = $('#modal');
    const done = ok => { d.removeEventListener('close', onClose); if (d.open) d.close(); resolve(ok); };
    const onClose = () => done(false);
    d.addEventListener('close', onClose);
    $('#askYes').onclick = () => done(true);
    $('#askNo').onclick = () => done(false);
    $('#modal .scrim').onclick = e => { e.stopPropagation(); done(false); };
  });
}

function toast(msg) {
  const host = $('#toast-host');
  host.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { host.innerHTML = ''; }, 2600);
}

function vibrate(p) { try { navigator.vibrate?.(p); } catch { /* not supported */ } }

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(route.name === 'match'); });

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#confetti');
  const ctx = c.getContext('2d');
  const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  c.hidden = false;
  // Pool ball colours plus chalk and gold, as in the kit
  const colors = ['#F4C21B', '#1E4FC2', '#D82A1E', '#5A2D91', '#F26A1B', '#0E8043', '#7C1F22', '#151515', '#7FCDF3', '#F0BE55'];
  const parts = Array.from({ length: 150 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 140, y: innerHeight * 0.32,
    vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 14 - 4,
    r: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  const step = now => {
    const el = now - t0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.vx *= 0.99;
      ctx.globalAlpha = Math.max(0, 1 - el / 2800);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    if (el < 2800) requestAnimationFrame(step);
    else { ctx.clearRect(0, 0, innerWidth, innerHeight); c.hidden = true; }
  };
  requestAnimationFrame(step);
}

/** Deletes on this device; a live tournament is deleted for everyone by someone who may write. */
async function deleteTournament(t) {
  if (!t) return false;
  const forAll = t.live && Live.isAvailable() && Live.isWritable();
  if (!(await ask(tr(forAll ? 'confirmDeleteLive' : 'confirmDelete', { name: t.name }), tr('deleteT')))) return false;
  if (forAll) await Live.remove(t.id);
  else if (t.live) { db.prefs.hiddenLive = [...new Set([...(db.prefs.hiddenLive || []), t.id])]; save(); }
  removeTournament(t.id);
  toast(tr('deleted'));
  return true;
}

// ---------- Events ----------
const curT = () => (route.id ? getTournament(route.id) : null);
const curMatch = () => { const t = curT(); return t ? L.matchInfo(t, route.mid)?.m : null; };
const clampDraft = (field, v) => { const [lo, hi] = draftLimits(field); return Math.max(lo, Math.min(hi, v)); };

const actions = {
  nav: el => go(parseHash(el.dataset.to)),
  new: () => { draft = newDraft(); go({ name: 'new' }); },
  demo: createDemo,
  open: el => go({ name: 't', id: el.dataset.id, tab: 'overview' }),
  tab: el => go({ ...route, name: 't', tab: el.dataset.tab }),
  import: importDialog,
  closeModal,

  setDraft: el => {
    draft[el.dataset.field] = el.dataset.num ? +el.dataset.value : el.dataset.value;
    if (el.dataset.field === 'game') { render(); return; }
    updateSummary(true);
  },
  stepDraft: el => {
    const f = el.dataset.field;
    draft[f] = clampDraft(f, effective(f) + +el.dataset.d);
    if (f === 'swissRounds') draft.swissAuto = false;
    updateSummary(true);
  },
  toggleDraft: el => { draft[el.dataset.field] = !draft[el.dataset.field]; updateSummary(true); },
  addPlayer: () => { draft.names.push(''); renderPlayerList(true); },
  rmPlayer: el => { draft.names.splice(+el.dataset.i, 1); if (!draft.names.length) draft.names.push(''); renderPlayerList(); },
  addKnown: el => {
    const i = draft.names.findIndex(n => !n.trim());
    if (i >= 0) draft.names[i] = el.dataset.name; else draft.names.push(el.dataset.name);
    renderPlayerList();
  },
  shufflePlayers: () => { draft.names = L.shuffle(filledNames()); renderPlayerList(); toast(tr('shuffled')); },
  pasteList: () => {
    openSheet(`<div class="grab"></div><h3 class="t-h2">${tr('pasteList')}</h3><p class="t-sm ink-3" style="margin:4px 0 14px">${tr('pasteListHint')}</p>
      <div class="field" style="height:auto;padding:12px 14px"><textarea id="plText" rows="7" aria-label="${tr('pasteList')}"></textarea></div>
      <div class="modal-actions"><button class="btn btn-s" data-act="closeModal">${tr('cancel')}</button><button class="btn btn-p" id="plGo">${tr('add')}</button></div>`);
    $('#plGo').addEventListener('click', () => {
      const add = $('#plText').value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      draft.names = [...filledNames(), ...add];
      closeModal();
      renderPlayerList();
    });
  },
  create: createFromDraft,

  share: () => { const t = curT(); if (t) shareDialog(t); },
  shareText: () => { const t = curT(); if (t) shareDialog(t); },
  copy: el => { const src = $('#' + el.dataset.src); copyText(src.value ?? src.textContent, src); },
  copyLink: () => { const el = $('#shCode'); if (el?.dataset.link) copyText(el.dataset.link, el); },
  nativeShare: async () => { const t = curT(); try { await navigator.share({ title: t.name, text: summaryText(t, tr) }); } catch { /* cancelled */ } },
  download: () => { const t = curT(); downloadJSON(t, `${slug(t.name)}.json`); },
  backupCode: async () => {
    const code = await encode({ tournaments: db.tournaments });
    openSheet(`<div class="grab"></div><h3 class="t-h2">${tr('copyBackup')}</h3><p class="t-sm ink-3" style="margin:4px 0 14px">${tr('backupCodeHint')}</p>
      <div class="field" style="height:auto;padding:12px 14px"><textarea id="bkCode" rows="6" readonly class="mono" aria-label="${tr('copyBackup')}">${esc(code)}</textarea></div>
      <div class="modal-actions"><button class="btn btn-s" data-act="closeModal">${tr('close')}</button><button class="btn btn-p" data-act="copy" data-src="bkCode">${ICON.copy}<span>${tr('copyCode')}</span></button></div>`);
  },
  backupFile: () => downloadJSON({ tournaments: db.tournaments }, `pool-backup-${new Date().toISOString().slice(0, 10)}.json`),
  saveShared: () => {
    const t = sharedCache?.t;
    if (!t) return;
    upsertTournament(t);
    toast(tr('savedCopy'));
    go({ name: 't', id: t.id, tab: 'overview' });
  },

  openMatch: el => go({ name: 'match', id: route.id, mid: el.dataset.mid }),
  startMatch: el => {
    const t = curT();
    const m = L.matchInfo(t, el.dataset.mid)?.m;
    if (!m) return;
    L.startMatch(t, m);
    commit(t);
    go({ name: 'match', id: t.id, mid: m.id });
  },
  frame: el => {
    const t = curT();
    const info = L.matchInfo(t, route.mid);
    const finished = L.addFrame(t, info.m, el.dataset.side, info.race);
    ui.pop = el.dataset.side;
    vibrate(15);
    if (finished) afterResult(t, info.m);
    else commit(t);
    if (t.settings.ballCount) ballsSheet(t, info.m, info.m.frames.length - 1);
  },
  editBalls: el => ballsSheet(curT(), curMatch(), +el.dataset.i),
  pickBalls: el => { const t = curT(); L.setFrameBalls(t, curMatch(), +el.dataset.i, +el.dataset.n); closeModal(); commit(t); },
  pickBlack: el => { const t = curT(); L.setFrameBalls(t, curMatch(), +el.dataset.i, null, true); closeModal(); commit(t); },
  skipBalls: el => { const t = curT(); L.setFrameBalls(t, curMatch(), +el.dataset.i, null); closeModal(); commit(t); },
  undo: () => { const t = curT(); L.undoFrame(t, curMatch()); commit(t); },
  swapBreak: () => { const t = curT(); const m = curMatch(); m.firstBreak = (m.firstBreak || 'a') === 'a' ? 'b' : 'a'; commit(t); },
  toggleBR: el => { const t = curT(); const f = curMatch().frames[+el.dataset.i]; f.br = !f.br; commit(t); },
  setTable: el => { const t = curT(); curMatch().table = +el.dataset.n; commit(t); },
  quickResult: () => { const t = curT(); const info = L.matchInfo(t, route.mid); quickResult(t, info.m, info.race); },
  resetMatch: async () => {
    const t = curT();
    if (!(await ask(tr('confirmResetMatch'), tr('resetMatch')))) return;
    L.clearMatch(t, curMatch());
    commit(t);
  },

  filter: el => { ui.filter = el.dataset.f; render(); },
  nextRound: () => { const t = curT(); L.nextSwissRound(t); commit(t); toast(tr('roundMade', { n: t.rounds.length })); },
  startPlayoff: async () => {
    const t = curT();
    if (!L.stageComplete(t) && !(await ask(tr('confirmEarlyPlayoff'), tr('startPlayoff'), false))) return;
    L.startPlayoff(t);
    commit(t);
    go({ ...route, name: 't', tab: 'bracket' });
  },
  resetPlayoff: async () => {
    const t = curT();
    if (!(await ask(tr('confirmResetPlayoff'), tr('resetPlayoff')))) return;
    t.bracket = null;
    t.celebrated = false;
    commit(t);
  },

  saveNames: () => {
    const t = curT();
    const name = $('#m-name').value.trim();
    const renames = [...document.querySelectorAll('[data-rename]')].map(i => [i.dataset.rename, i.value.trim()]);
    if (!name || renames.some(([, v]) => !v)) return toast(tr('noEmptyNames'));
    t.name = name;
    renames.forEach(([id, v]) => { t.players.find(p => p.id === id).name = v; });
    commit(t);
    toast(tr('saved'));
  },
  stepSetting: el => { const t = curT(); t.settings.tables = Math.max(1, Math.min(12, t.settings.tables + +el.dataset.d)); commit(t); },
  setSetting: el => { const t = curT(); t.settings[el.dataset.field] = el.dataset.value; commit(t); toast(tr('saved')); },
  toggleSetting: el => { const t = curT(); t.settings[el.dataset.field] = !t.settings[el.dataset.field]; commit(t); toast(tr('saved')); },
  rematch: () => { draft = newDraft(curT()); go({ name: 'new' }); },
  changeFormat: () => { draft = newDraft(curT(), true); go({ name: 'new' }); toast(tr('changeFormatHint')); },
  deleteT: async () => {
    if (await deleteTournament(curT())) go({ name: 'home' });
  },
  deleteFromHome: async el => {
    if (await deleteTournament(getTournament(el.dataset.id))) render();
  },
  goLive: async () => {
    closeModal();
    const t = curT();
    if (Live.stable(Live.toShared(t)).length > 240000) return toast(tr('liveTooBig'));
    t.live = true;
    db.prefs.hiddenLive = (db.prefs.hiddenLive || []).filter(id => id !== t.id);
    save();
    const ok = await commit(t);
    if (!ok) { t.live = false; upsertTournament(t); render(); }
    toast(ok ? tr('liveOn') : tr('liveFailed'));
  },
  stopLive: async () => {
    const t = curT();
    if (!(await ask(tr('confirmStopLive'), tr('stopLive')))) return;
    // Mark it local first, so the deletion arriving from the server doesn't take our own copy.
    t.live = false;
    upsertTournament(t);
    render();
    await Live.remove(t.id);
  },

  pref: el => {
    db.prefs[el.dataset.field] = el.dataset.value;
    if (el.dataset.field === 'lang') setLang(el.dataset.value);
    save();
    render();
  },
  install: async () => { if (installEvt) { installEvt.prompt(); installEvt = null; render(); } },
  wipe: async () => {
    if (!(await ask(tr('confirmWipe'), tr('wipe')))) return;
    clearAll();
    go({ name: 'home' });
  },
  playerCard: el => playerCard(el.dataset.name),
};

// Actions that change a tournament; blocked for people who may only watch a live tournament.
const MUTATING = new Set(['startMatch', 'frame', 'undo', 'swapBreak', 'toggleBR', 'setTable', 'quickResult', 'resetMatch',
  'editBalls', 'pickBalls', 'pickBlack', 'skipBalls', 'nextRound', 'startPlayoff', 'resetPlayoff', 'saveNames',
  'stepSetting', 'setSetting', 'toggleSetting', 'changeFormat', 'goLive', 'stopLive', 'walkover', 'withdraw']);

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || el.classList.contains('off')) return;
  if (MUTATING.has(el.dataset.act) && readOnlyNow()) { e.preventDefault(); toast(tr('readOnlyLive')); return; }
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); e.stopPropagation(); fn(el, e); }
});

/** Keyboard on the match screen: arrows score, Backspace undoes, digits answer the balls-left sheet. */
function matchKeys(e) {
  if (route.name !== 'match' || e.ctrlKey && e.key !== 'z' || e.altKey) return false;
  if (e.target.matches('input, textarea, select')) return false;
  const click = sel => { const b = document.querySelector(sel); if (b && !b.disabled && !b.classList.contains('off')) { b.click(); return true; } return false; };
  const modal = $('#modal');
  if (modal.open) {
    if (!modal.querySelector('.picks')) return false;
    if (/^[0-9]$/.test(e.key)) return click(`.pick[data-n="${e.key}"]`);
    if (e.key === 'b' || e.key === 'B') return click('[data-act=pickBlack]');
    if (e.key === 's' || e.key === 'S') return click('[data-act=skipBalls]');
    return false;
  }
  if (e.key === 'ArrowLeft') return click('.half[data-side=a]');
  if (e.key === 'ArrowRight') return click('.half[data-side=b]');
  if (e.key === 'Backspace' || ((e.ctrlKey || e.metaKey) && e.key === 'z')) return click('[data-act=undo]');
  if (e.key === 'r' || e.key === 'R') return click('[data-act=quickResult]');
  return false;
}

document.addEventListener('keydown', e => {
  if (matchKeys(e)) { e.preventDefault(); return; }
  const el = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && el.matches('[role="button"][data-act]')) {
    e.preventDefault();
    el.click();
  }
  if (e.key === 'Enter' && el.dataset.pi != null) {
    e.preventDefault();
    const i = +el.dataset.pi;
    if (i === draft.names.length - 1) actions.addPlayer();
    else $(`#p-${i + 1}`)?.focus();
  }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (route.name === 'new' && draft) {
    if (el.dataset.pi != null) { draft.names[+el.dataset.pi] = el.value; updateSummary(); return; }
    if (el.dataset.draft) draft[el.dataset.draft] = el.value;
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'playerFilter') { ui.player = e.target.value; render(); }
});

// ---------- App install / offline ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
if ('serviceWorker' in navigator && !framed && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
}

// Keep several open tabs in step.
window.addEventListener('storage', e => {
  if (e.key && e.key.startsWith('pool-turnering')) { load(); render(); }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());

render();
// Inside the Claude viewer this connects to the shared database; elsewhere it resolves false.
Live.init(onLive).then(on => { if (on) render(); });
