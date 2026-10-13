import * as L from './logic.js';
import { db, load, save, getTournament, upsertTournament, removeTournament, clearAll } from './store.js';
import { tr, setLang, getLang, LANGS } from './i18n.js';
import { encode, decode, isTournament, summaryText } from './share.js';

const VERSION = '2.0.0';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = x => Math.round(x * 100) + '%';
// Inside an embedded viewer, downloads and share sheets are unavailable.
const framed = (() => { try { return window.top !== window.self; } catch { return true; } })();

load();
setLang(db.prefs.lang || (navigator.language || 'da').slice(0, 2));

// ---------- Icons ----------
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const ICON = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  share: svg('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  swap: svg('<path d="M7 16V4M3 8l4-4 4 4"/><path d="M17 8v12M21 16l-4 4-4-4"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  import: svg('<path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 21h16"/>'),
  download: svg('<path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 21h16"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a4 4 0 0 1-3 4M7 5H4v2a4 4 0 0 0 3 4"/>'),
  users: svg('<circle cx="9" cy="8" r="4"/><path d="M1 21v-1a7 7 0 0 1 14 0v1"/><path d="M17 4a4 4 0 0 1 0 8M23 21v-1a7 7 0 0 0-5-6.7"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  rack: svg('<path d="M12 3L2 20h20z"/><circle cx="12" cy="11" r="1.5"/><circle cx="9" cy="16" r="1.5"/><circle cx="15" cy="16" r="1.5"/>'),
  play: svg('<path d="M7 4l13 8-13 8z"/>'),
  close: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  bolt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
};

const BALL = { '8ball': ['8', 'b8'], '9ball': ['9', 'b9'], '10ball': ['10', 'b10'], other: ['1', 'b1'] };
const ball = game => { const [n, c] = BALL[game] || BALL['8ball']; return `<span class="ball ${c}" aria-hidden="true"><span>${n}</span></span>`; };

// ---------- Routing ----------
let route = parseHash(location.hash);
let draft = null;
const ui = { filter: 'all', player: '' };

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
  route = r;
  try { if (location.hash !== toHash(r)) history.pushState(null, '', toHash(r)); } catch { /* sandboxed */ }
  render();
  if (!keepScroll) window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => { route = parseHash(location.hash); render(); });

// ---------- Rendering ----------
let themeSet = false;
function applyTheme() {
  const th = db.prefs.theme;
  if (th === 'dark' || th === 'light') { document.documentElement.dataset.theme = th; themeSet = true; }
  else if (themeSet) { delete document.documentElement.dataset.theme; themeSet = false; }
  document.documentElement.lang = getLang();
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
    if (!t) { route = { name: 'home' }; return render(); }
    html = r.name === 'match' ? viewMatch(t, r.mid) : viewTournament(t, r.tab);
  } else if (r.name === 'players') html = viewPlayers();
  else if (r.name === 'settings') html = viewSettings();
  else if (r.name === 'shared') html = viewShared(r.code);
  else html = viewHome();
  $('#app').innerHTML = html;
  afterRender.forEach(f => f());
  keepAwake(r.name === 'match');
}

function commit(t, { keepScroll = true } = {}) {
  t.updatedAt = Date.now();
  L.syncBracket(t.bracket);
  if (!upsertTournament(t)) toast(tr('saveFailed'));
  render();
  if (!keepScroll) window.scrollTo(0, 0);
}

function bar({ back, title, sub, actions = '' }) {
  return `<header class="bar">
    ${back ? `<button class="icon-btn" data-act="nav" data-to="${back}" aria-label="${tr('back')}">${ICON.back}</button>` : `<span class="logo">${ball('8ball')}</span>`}
    <div class="bar-title"><div class="bar-name">${esc(title)}</div>${sub ? `<div class="bar-sub">${esc(sub)}</div>` : ''}</div>
    <div class="bar-actions">${actions}</div>
  </header>`;
}

function tabbar(active) {
  const item = (key, to, icon, label) =>
    `<button class="tb ${active === key ? 'on' : ''}" data-act="nav" data-to="${to}" ${active === key ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`;
  return `<nav class="tabbar" aria-label="${tr('appName')}">
    ${item('home', '#/', ICON.rack, tr('navTournaments'))}
    ${item('players', '#/players', ICON.users, tr('navPlayers'))}
    ${item('settings', '#/settings', ICON.gear, tr('navSettings'))}
  </nav>`;
}

const fmtName = f => tr('fmt_' + f);
const pname = (t, id) => (id === L.BYE ? tr('bye') : id ? esc(L.playerName(t, id)) : `<span class="muted">${tr('tbd')}</span>`);

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
  const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, s] of units) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), u);
  return tr('justNow');
}

// ---------- Home ----------
function tCard(t) {
  const ph = L.phase(t);
  const { done, total } = L.progress(t);
  const pod = L.podium(t);
  let status;
  if (pod) status = `<span class="gold">${ICON.trophy} ${esc(L.playerName(t, pod.first))}</span>`;
  else if (ph === 'playoff') status = tr('phPlayoff');
  else if (ph === 'nextRound') status = tr('phNextRound');
  else if (ph === 'readyForPlayoff') status = tr('phReadyPlayoff');
  else {
    const live = L.allMatches(t).filter(L.isLive).length;
    status = live ? `<span class="live-dot"></span>${tr('nLive', { n: live })}` : tr('phStage');
  }
  return `<button class="tcard" data-act="open" data-id="${t.id}">
    <div class="tcard-top">${ball(t.game)}<div class="tcard-name">${esc(t.name)}</div><span class="chip">${fmtName(t.format)}</span></div>
    <div class="tcard-meta">${tr('nPlayers', { n: t.players.length })} · ${status}</div>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
    <div class="tcard-foot"><span>${tr('matchesOf', { done, total })}</span><span>${relTime(t.updatedAt)}</span></div>
  </button>`;
}

function viewHome() {
  const list = [...db.tournaments].sort((a, b) => b.updatedAt - a.updatedAt);
  if (!list.length) return viewWelcome();
  const active = list.filter(t => L.phase(t) !== 'done');
  const finished = list.filter(t => L.phase(t) === 'done');
  return bar({ title: tr('appName'), actions: `<button class="btn primary small" data-act="new">${ICON.plus}<span>${tr('newShort')}</span></button>` }) +
    `<main class="wrap">
      ${active.length ? `<h2 class="sec">${tr('inProgress')}</h2><div class="cards">${active.map(tCard).join('')}</div>` : ''}
      ${finished.length ? `<h2 class="sec">${tr('finished')}</h2><div class="cards">${finished.map(tCard).join('')}</div>` : ''}
      <div class="center-row"><button class="btn ghost" data-act="import">${ICON.import}<span>${tr('importBtn')}</span></button></div>
    </main>` + tabbar('home');
}

function rack() {
  // 15 balls in the classic 8-ball rack: 8 in the middle, a solid and a stripe in the back corners.
  const rows = [[1], [9, 2], [10, 8, 3], [11, 4, 12, 5], [6, 13, 7, 14, 15]];
  return `<div class="rack" aria-hidden="true">${rows.map(r => `<div>${r.map(n => `<span class="rb n${n}"><span>${n}</span></span>`).join('')}</div>`).join('')}</div>`;
}

function viewWelcome() {
  const feats = ['feat1', 'feat2', 'feat3', 'feat4'];
  return bar({ title: tr('appName') }) + `<main class="wrap">
    <section class="hero">
      ${rack()}
      <h1>${tr('heroTitle')}</h1>
      <p>${tr('heroText')}</p>
      <div class="hero-actions">
        <button class="btn primary" data-act="new">${ICON.plus}<span>${tr('newTournament')}</span></button>
        <button class="btn ghost" data-act="demo">${ICON.play}<span>${tr('tryDemo')}</span></button>
      </div>
    </section>
    <ul class="feats">${feats.map(f => `<li><strong>${tr(f + 'T')}</strong><span>${tr(f + 'D')}</span></li>`).join('')}</ul>
    <div class="center-row"><button class="btn ghost small" data-act="import">${ICON.import}<span>${tr('importBtn')}</span></button></div>
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
    m.frames.forEach((f, k) => { f.at = start + i * 20 * 60000 + k * 5 * 60000; if (f.w === f.b && Math.random() < 0.2) f.br = true; });
    m.startedAt = m.frames[0].at; m.endedAt = m.frames[m.frames.length - 1].at;
  });
  const live = L.upNext(t)[0];
  if (live) { L.addFrame(t, live, 'a', 3); }
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
function seg(field, options, { num = false } = {}) {
  const cur = effective(field);
  return `<div class="seg" role="group">${options.map(([v, label]) =>
    `<button type="button" class="seg-btn" data-act="setDraft" data-field="${field}" data-value="${v}" ${num ? 'data-num="1"' : ''} aria-pressed="${cur === v}">${label}</button>`).join('')}</div>`;
}
function selectField(id, field, values, label, fmt = v => v) {
  const cur = effective(field);
  return `<div class="field"><label class="lbl" for="${id}">${label}</label>
    <select id="${id}" class="input" data-draft="${field}" data-num="1">${values.map(v => `<option value="${v}" ${cur === v ? 'selected' : ''}>${fmt(v)}</option>`).join('')}</select></div>`;
}
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

function pRow(name, i) {
  return `<div class="prow"><span class="pnum">${i + 1}</span>
    <input class="input" id="p-${i}" data-pi="${i}" value="${esc(name)}" placeholder="${tr('playerN', { n: i + 1 })}" autocomplete="off" enterkeyhint="next" maxlength="30" aria-label="${tr('playerN', { n: i + 1 })}">
    <button type="button" class="icon-btn" data-act="rmPlayer" data-i="${i}" aria-label="${tr('remove')}">${ICON.close}</button></div>`;
}

function knownChips() {
  const have = new Set(draft.names.map(n => n.trim().toLowerCase()));
  const known = L.hallOfFame(db.tournaments.filter(t => !t.demo)).map(r => r.name).filter(n => !have.has(n.toLowerCase())).slice(0, 30);
  if (!known.length) return '';
  return `<div class="known"><div class="lbl">${tr('knownPlayers')}</div><div class="chips">${known.map(n => `<button type="button" class="chip-btn" data-act="addKnown" data-name="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div></div>`;
}

function formatCards() {
  const n = filledNames().length;
  return L.FORMATS.map(f => {
    const ok = f === 'groups' ? n >= 4 : f === 'knockout' ? n >= 2 : n >= 3;
    const p = L.plan(f, Math.max(n, 2), draftSettings());
    return `<button type="button" class="fcard" data-act="setDraft" data-field="format" data-value="${f}" aria-pressed="${draft.format === f}" ${ok ? '' : 'disabled'}>
      <span class="fcard-top"><span class="fcard-name">${fmtName(f)}</span><span class="fcard-n">${ok ? tr('nMatches', { n: p.total }) : tr('needMore')}</span></span>
      <span class="fcard-d">${tr('fmtDesc_' + f)}</span>
    </button>`;
  }).join('');
}

function formatOptions() {
  const d = draft, n = filledNames().length;
  const playoffOpts = [[0, tr('none')], [2, tr('top2')], [4, tr('top4')], [8, tr('top8')]].filter(([v]) => v <= Math.max(n, 2));
  if (d.format === 'league') {
    return `<div class="lbl">${tr('legs')}</div>${seg('legs', [[1, tr('legs1')], [2, tr('legs2')]], { num: true })}
      <div class="lbl">${tr('playoff')}</div>${seg('playoffSize', playoffOpts, { num: true })}`;
  }
  if (d.format === 'groups') {
    const es = draftSettings();
    const sizes = L.groupSizes(Math.max(n, 4), es.groupCount);
    return `<div class="grid2">
      ${selectField('f-groups', 'groupCount', range(2, Math.max(2, Math.floor(n / 2))), tr('groupCount'))}
      ${selectField('f-adv', 'advance', range(1, Math.max(1, Math.min(...sizes))), tr('advance'))}
    </div>
    <p class="hint">${tr('groupsHint', { sizes: sizes.join(' + '), p: es.groupCount * es.advance })}</p>
    <div class="lbl">${tr('legs')}</div>${seg('legs', [[1, tr('legs1')], [2, tr('legs2')]], { num: true })}`;
  }
  if (d.format === 'swiss') {
    const rec = L.recommendedSwissRounds(Math.max(n, 2));
    return `${selectField('f-swiss', 'swissRounds', range(1, Math.max(1, n - 1)), tr('swissRounds'), v => v === rec ? `${v} (${tr('recommended')})` : v)}
      <p class="hint">${tr('swissHint')}</p>
      <div class="lbl">${tr('playoff')}</div>${seg('playoffSize', playoffOpts, { num: true })}`;
  }
  return `<div class="lbl">${tr('seeding')}</div>${seg('seeding', [['random', tr('seedRandom')], ['list', tr('seedList')]])}
    <p class="hint">${tr(d.seeding === 'list' ? 'seedListHint' : 'seedRandomHint')}</p>`;
}

function rulesFields() {
  const d = draft, n = filledNames().length;
  const ko = d.format === 'knockout';
  const P = ko ? n : L.playoffCount(d.format, n, draftSettings());
  const races = range(1, 11);
  const raceFmt = v => tr('raceOpt', { n: v, b: 2 * v - 1 });
  return `<div class="grid2">
      ${ko ? '' : selectField('f-race', 'raceTo', races, d.format === 'groups' ? tr('raceGroups') : tr('raceStage'), raceFmt)}
      ${P >= 3 ? selectField('f-korace', 'koRace', races, ko ? tr('raceKoRounds') : tr('raceSemis'), raceFmt) : ''}
      ${P >= 2 ? selectField('f-final', 'finalRace', races, tr('raceFinal'), raceFmt) : ''}
      ${ko ? '' : selectField('f-ppw', 'pointsPerWin', [1, 2, 3], tr('pointsPerWin'))}
      ${selectField('f-tables', 'tables', range(1, 12), tr('tables'))}
    </div>
    ${P >= 4 ? `<label class="check"><input type="checkbox" id="f-bronze" data-draft="bronze" ${d.bronze ? 'checked' : ''}> ${tr('bronzeMatch')}</label>` : ''}
    <div class="lbl">${tr('breakRule')}</div>${seg('breakRule', [['alternate', tr('breakAlternate')], ['winner', tr('breakWinner')]])}`;
}

function viewNew() {
  afterRender.push(updateSummary);
  return bar({ back: '#/', title: draft.replaceId ? tr('changeFormat') : tr('newTournament') }) + `<main class="wrap form">
    <section class="panel">
      <label class="lbl" for="f-name">${tr('tName')}</label>
      <input id="f-name" class="input big" data-draft="name" value="${esc(draft.name)}" maxlength="60" autocomplete="off">
      <div class="lbl">${tr('game')}</div>
      ${seg('game', L.GAMES.map(g => [g, tr('game_' + g)]))}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>${tr('players')}</h2><span class="count" id="pcount"></span></div>
      <div id="plist" class="plist">${draft.names.map(pRow).join('')}</div>
      <div class="btn-row">
        <button type="button" class="btn ghost small" data-act="addPlayer">${ICON.plus}<span>${tr('addPlayer')}</span></button>
        <button type="button" class="btn ghost small" data-act="pasteList">${tr('pasteList')}</button>
        <button type="button" class="btn ghost small" data-act="shufflePlayers">${tr('shuffle')}</button>
      </div>
      <div id="known">${knownChips()}</div>
    </section>
    <section class="panel">
      <h2>${tr('format')}</h2>
      <div class="formats" id="formats">${formatCards()}</div>
      <div id="fmtOpts" class="opts">${formatOptions()}</div>
    </section>
    <section class="panel"><h2>${tr('rules')}</h2><div id="rules">${rulesFields()}</div></section>
    <div class="summary" id="summary" aria-live="polite"></div>
    <button type="button" class="btn primary block big" data-act="create" id="createBtn">${tr('createSchedule')}</button>
  </main>`;
}

let lastCount = -1;
function updateSummary(force = false) {
  if (route.name !== 'new' || !$('#summary')) return;
  const names = filledNames(), n = names.length;
  if (n !== lastCount || force) {
    lastCount = n;
    $('#formats').innerHTML = formatCards();
    $('#fmtOpts').innerHTML = formatOptions();
    $('#rules').innerHTML = rulesFields();
  }
  $('#pcount').textContent = n;
  const s = draftSettings();
  const err = L.validate(draft.format, n, s);
  const dupes = new Set(names.map(x => x.toLowerCase())).size !== n;
  const p = L.plan(draft.format, n, s);
  let html;
  if (err) html = `<span class="warn">${tr('err_' + err)}</span>`;
  else if (dupes) html = `<span class="warn">${tr('errDupes')}</span>`;
  else {
    const per = draft.format === 'knockout' ? p.per[1] : p.per[0] === p.per[1] ? p.per[0] : `${p.per[0]}–${p.per[1]}`;
    const parts = [];
    if (p.stage) parts.push(tr('sumStage', { n: p.stage }));
    if (p.playoff) parts.push(tr(draft.format === 'knockout' ? 'sumKo' : 'sumPlayoff', { n: p.playoff }));
    html = `<strong>${tr('sumHead', { n, total: p.total })}</strong> ${parts.join(' + ')}. ${draft.format === 'knockout' ? tr('sumPerKo', { per }) : tr('sumPer', { per })}`;
    if (draft.tables > 1) html += ' ' + tr('sumTables', { n: draft.tables });
  }
  $('#summary').innerHTML = html;
  $('#createBtn').disabled = !!err || dupes;
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
  lastCount = -1;
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
  const sub = `${fmtName(t.format)} · ${tr('nPlayers', { n: t.players.length })}`;
  const body = { overview: tabOverview, matches: tabMatches, table: tabTable, bracket: tabBracket, stats: tabStats, manage: tabManage }[tab](t);
  return bar({ back: '#/', title: t.name, sub, actions: `<button class="icon-btn" data-act="share" aria-label="${tr('share')}">${ICON.share}</button>` }) +
    `<nav class="tabs" aria-label="${esc(t.name)}">${tabs.map(([k, l]) => `<button class="tab" data-act="tab" data-tab="${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</button>`).join('')}</nav>
    <main class="wrap">${t.demo ? `<div class="demo-note">${tr('demoNote')}</div>` : ''}${body}</main>`;
}

function currentRound(t) {
  const i = t.rounds.findIndex(r => !r.matches.every(L.isDone));
  return i < 0 ? t.rounds.length : i + 1;
}

function heroCard(t) {
  const ph = L.phase(t);
  const { done, total } = L.progress(t);
  const meter = `<div class="meter big"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
    <div class="hero-foot"><span>${tr('matchesOf', { done, total })}</span><span>${tr('left', { n: total - done })}</span></div>`;
  if (ph === 'done') {
    const pod = L.podium(t);
    if (!t.celebrated) { t.celebrated = true; upsertTournament(t); afterRender.push(() => confetti()); }
    return championCard(t, pod);
  }
  if (ph === 'nextRound') {
    return `<section class="hero-card">
      <div class="eyebrow">${fmtName(t.format)}</div>
      <h2>${tr('roundDone', { n: t.rounds.length })}</h2>
      <p class="muted">${tr('nextRoundHint')}</p>
      <button class="btn primary" data-act="nextRound">${tr('makeRound', { n: t.rounds.length + 1 })}</button>
      ${meter}
    </section>`;
  }
  if (ph === 'readyForPlayoff') {
    const q = L.qualifiers(t);
    return `<section class="hero-card">
      <div class="eyebrow">${tr('playoff')}</div>
      <h2>${tr('stageDoneTitle')}</h2>
      <div class="chips">${q.map(x => `<span class="chip"><b>${esc(x.label)}</b> ${esc(L.playerName(t, x.id))}</span>`).join('')}</div>
      <button class="btn primary" data-act="startPlayoff">${ICON.trophy}<span>${tr('startPlayoff')}</span></button>
    </section>`;
  }
  let title, eyebrow = fmtName(t.format);
  if (ph === 'playoff') {
    eyebrow = t.format === 'knockout' ? fmtName('knockout') : tr('playoff');
    const R = t.bracket.rounds;
    const r = R.findIndex(round => !round.every(L.isDone));
    title = r < 0 ? (t.bracket.bronze ? tr('bronze') : tr('final')) : roundName(R.length - 1 - r, r);
  } else if (t.format === 'swiss') title = tr('roundXofY', { x: t.rounds.length, y: t.settings.swissRounds });
  else title = tr('roundXofY', { x: Math.min(currentRound(t), t.rounds.length), y: t.rounds.length });
  return `<section class="hero-card"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2>${meter}</section>`;
}

function championCard(t, pod) {
  const n = id => esc(L.playerName(t, id));
  return `<section class="champ">
    <div class="champ-trophy">${ICON.trophy}</div>
    <div class="eyebrow">${tr('champion')}</div>
    <div class="champ-name">${n(pod.first)}</div>
    <div class="podium">
      ${pod.second ? `<div><span class="medal m2">2</span>${n(pod.second)}</div>` : ''}
      ${pod.third ? `<div><span class="medal m3">3</span>${n(pod.third)}</div>` : ''}
    </div>
    <button class="btn ghost small" data-act="shareText">${ICON.share}<span>${tr('shareResult')}</span></button>
  </section>`;
}

function matchLine(t, m, { start = false } = {}) {
  const live = L.isLive(m), done = L.isDone(m);
  const [a, b] = L.score(m);
  const w = L.winnerOf(m);
  const cls = id => (done ? (id === w ? 'win' : 'lose') : '');
  return `<div class="mline ${live ? 'is-live' : ''}" data-act="openMatch" data-mid="${m.id}" role="button" tabindex="0">
    ${m.table ? `<span class="table-no" title="${tr('tableN', { n: m.table })}">${m.table}</span>` : ''}
    <div class="mline-main">
      <div class="mline-names"><span class="${cls(m.a)}">${pname(t, m.a)}</span><span class="vs">${live || done ? `<b>${a}–${b}</b>` : tr('vs')}</span><span class="${cls(m.b)}">${pname(t, m.b)}</span></div>
      <div class="mline-ctx">${live ? `<span class="live-dot"></span>${tr('live')} · ` : ''}${ctxLabel(t, m)}</div>
    </div>
    ${start ? `<button class="btn small primary" data-act="startMatch" data-mid="${m.id}">${ICON.play}<span>${tr('start')}</span></button>` : ''}
  </div>`;
}

function tabOverview(t) {
  let html = heroCard(t);
  const live = L.allMatches(t).filter(L.isLive);
  if (live.length) html += `<h2 class="sec">${tr('liveNow')}</h2><div class="list">${live.map(m => matchLine(t, m)).join('')}</div>`;
  if (L.phase(t) !== 'done') {
    const next = L.upNext(t).slice(0, Math.max(3, t.settings.tables * 2));
    if (next.length) html += `<h2 class="sec">${tr('upNext')}</h2><div class="list">${next.map(m => matchLine(t, m, { start: true })).join('')}</div>`;
  }
  if (t.format !== 'knockout') {
    const groups = t.format === 'groups' ? t.groups : [{ name: null, players: null }];
    html += `<h2 class="sec">${tr('tabTable')}</h2>`;
    html += groups.map(g => {
      const rows = L.standingsFor(t, g.players || undefined).slice(0, g.name ? 99 : 5);
      return `<div class="mini">${g.name ? `<div class="mini-head">${tr('groupN', { g: g.name })}</div>` : ''}
        ${rows.map((r, i) => `<div class="mini-row"><span class="pos">${i + 1}</span><span class="nm">${esc(r.name)}</span><span class="muted">${r.w}-${r.l}</span><b>${r.pts}</b></div>`).join('')}</div>`;
    }).join('');
    html += `<button class="link" data-act="tab" data-tab="table">${tr('seeFullTable')} →</button>`;
  } else if (t.bracket && L.phase(t) !== 'done') {
    html += `<button class="link" data-act="tab" data-tab="bracket">${tr('seeBracket')} →</button>`;
  }
  return html;
}

function matchRow(t, m) {
  if (L.isBye(m)) return '';
  const live = L.isLive(m), done = L.isDone(m);
  const [a, b] = L.score(m);
  const w = L.winnerOf(m);
  const cls = id => (done ? (id === w ? 'win' : 'lose') : '');
  const ready = L.isReady(m);
  return `<button class="mrow ${live ? 'is-live' : ''}" data-act="openMatch" data-mid="${m.id}" ${ready ? '' : 'disabled'}>
    <span class="mn a ${cls(m.a)}">${pname(t, m.a)}</span>
    <span class="ms ${done ? 'done' : ''}">${done || live ? `${a}<i>–</i>${b}` : tr('vs')}</span>
    <span class="mn b ${cls(m.b)}">${pname(t, m.b)}</span>
    ${m.group ? `<span class="gtag">${m.group}</span>` : ''}
  </button>`;
}

function tabMatches(t) {
  const f = ui.filter, pid = ui.player;
  const keep = m => (f === 'all' || (f === 'open' ? !L.isDone(m) : L.isDone(m))) && (!pid || m.a === pid || m.b === pid);
  const filters = [['all', tr('fAll')], ['open', tr('fOpen')], ['done', tr('fDone')]];
  let html = `<div class="filters">
    <div class="seg" role="group">${filters.map(([k, l]) => `<button class="seg-btn" data-act="filter" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
    <select class="input" id="playerFilter" data-act-change="playerFilter" aria-label="${tr('filterPlayer')}">
      <option value="">${tr('allPlayers')}</option>
      ${t.players.map(p => `<option value="${p.id}" ${pid === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
    </select>
  </div>`;
  if (L.canNextSwissRound(t)) html += `<div class="callout"><span>${tr('roundDone', { n: t.rounds.length })}</span><button class="btn primary small" data-act="nextRound">${tr('makeRound', { n: t.rounds.length + 1 })}</button></div>`;
  let shown = 0;
  t.rounds.forEach((r, i) => {
    const ms = r.matches.filter(keep);
    if (!ms.length) return;
    shown += ms.length;
    const allDone = r.matches.every(L.isDone);
    html += `<section class="round">
      <div class="round-head"><h3>${tr('roundN', { n: i + 1 })}</h3>${allDone ? `<span class="ok">${tr('roundComplete')}</span>` : ''}</div>
      ${ms.map(m => matchRow(t, m)).join('')}
      ${r.byes.length && !pid ? `<div class="byes">${tr(t.format === 'swiss' ? 'byeWin' : 'sitsOut')}: ${r.byes.map(id => esc(L.playerName(t, id))).join(', ')}</div>` : ''}
    </section>`;
  });
  if (t.format === 'swiss' && t.rounds.length < t.settings.swissRounds && !L.canNextSwissRound(t)) {
    html += `<p class="hint center">${tr('swissLater', { n: t.settings.swissRounds - t.rounds.length })}</p>`;
  }
  if (!shown) html += `<p class="empty">${tr('noMatches')}</p>`;
  return html;
}

function standingsTable(t, rows, cut) {
  const swiss = t.format === 'swiss';
  return `<div class="tablewrap"><table class="stand">
    <thead><tr><th>#</th><th class="l">${tr('player')}</th><th title="${tr('colPLong')}">${tr('colP')}</th><th>${tr('colW')}</th><th>${tr('colL')}</th>
      <th class="hide-xs">${tr('colFrames')}</th><th>+/−</th>${swiss ? `<th title="Buchholz">BH</th>` : ''}<th>${tr('colPts')}</th><th class="hide-xs l">${tr('colForm')}</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr class="${i < cut ? 'q' : ''}">
      <td class="pos">${i + 1}</td><td class="l nm">${esc(r.name)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.l}</td>
      <td class="hide-xs">${r.ff}–${r.fa}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td>${swiss ? `<td>${r.bh}</td>` : ''}<td class="pts">${r.pts}</td>
      <td class="hide-xs l"><span class="form">${r.form.slice(-5).map(x => `<i class="f${x}">${tr('form' + x)}</i>`).join('')}</span></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function matrix(t, ids) {
  const ps = t.players.filter(p => ids.includes(p.id));
  const res = {};
  for (const m of L.stageMatches(t)) {
    if (!L.isDone(m)) continue;
    (res[m.a + '|' + m.b] ||= []).push([m.sa, m.sb]);
    (res[m.b + '|' + m.a] ||= []).push([m.sb, m.sa]);
  }
  const short = n => esc(n.length > 5 ? n.slice(0, 4) + '.' : n);
  return `<div class="tablewrap"><table class="matrix">
    <thead><tr><th></th>${ps.map(p => `<th title="${esc(p.name)}">${short(p.name)}</th>`).join('')}</tr></thead>
    <tbody>${ps.map(p => `<tr><th class="l">${esc(p.name)}</th>${ps.map(q => {
      if (p.id === q.id) return '<td class="self"></td>';
      const r = res[p.id + '|' + q.id];
      if (!r) return '<td class="muted">·</td>';
      return `<td>${r.map(([x, y]) => `<span class="${x > y ? 'win' : 'lose'}">${x}–${y}</span>`).join('<br>')}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function tabTable(t) {
  const rules = tr('tiebreak' + (t.format === 'swiss' ? 'Swiss' : ''), { p: t.settings.pointsPerWin });
  if (t.format === 'groups') {
    return t.groups.map(g => `<h2 class="sec">${tr('groupN', { g: g.name })}</h2>${standingsTable(t, L.standingsFor(t, g.players), t.settings.advance)}`).join('') +
      `<p class="hint">${rules} ${tr('qualifyGroups', { n: t.settings.advance })}</p>` +
      t.groups.map(g => `<h2 class="sec">${tr('resultsGroup', { g: g.name })}</h2>${matrix(t, g.players)}`).join('');
  }
  const cut = L.hasPlayoff(t) ? L.playoffCount(t.format, t.players.length, t.settings) : 0;
  return standingsTable(t, L.standingsFor(t), cut) +
    `<p class="hint">${rules} ${cut ? tr('qualifyTop', { n: cut }) : ''}</p>` +
    (t.format === 'league' ? `<h2 class="sec">${tr('allResults')}</h2>${matrix(t, t.players.map(p => p.id))}` : '');
}

function bmatch(t, m) {
  const labels = t.bracket.labels || {};
  if (L.isBye(m)) {
    return `<div class="bm bye"><span class="bm-p win"><span class="seed">${esc(labels[m.a] || '')}</span><span class="nm">${pname(t, m.a)}</span><b></b></span>
      <span class="bm-p muted"><span class="seed"></span><span class="nm">${tr('byeAdvance')}</span><b></b></span></div>`;
  }
  const done = L.isDone(m), live = L.isLive(m);
  const [a, b] = L.score(m);
  const w = L.winnerOf(m);
  const cls = id => (done ? (id === w ? 'win' : 'lose') : '');
  const row = (id, s) => `<span class="bm-p ${cls(id)}"><span class="seed">${esc(labels[id] || '')}</span><span class="nm">${pname(t, id)}</span><b>${done || live ? s : ''}</b></span>`;
  return `<button class="bm ${live ? 'is-live' : ''}" data-act="openMatch" data-mid="${m.id}" ${L.isReady(m) ? '' : 'disabled'}>${row(m.a, a)}${row(m.b, b)}</button>`;
}

function tabBracket(t) {
  if (!t.bracket) {
    const q = L.qualifiers(t);
    const complete = L.stageComplete(t);
    return `<section class="hero-card">
      <div class="eyebrow">${tr('playoff')}</div>
      <h2>${tr('playoffNotStarted')}</h2>
      <p class="muted">${tr('playoffExplain', { n: q.length, semis: t.settings.koRace, final: t.settings.finalRace })}</p>
      <div class="chips">${q.map(x => `<span class="chip"><b>${esc(x.label)}</b> ${esc(L.playerName(t, x.id))}</span>`).join('')}</div>
      ${complete ? '' : `<p class="warn">${tr('playoffEarly')}</p>`}
      <button class="btn primary" data-act="startPlayoff">${ICON.trophy}<span>${tr('startPlayoff')}</span></button>
    </section>`;
  }
  const R = t.bracket.rounds;
  let html = `<div class="bracket-scroll"><div class="bracket" style="--cols:${R.length}">`;
  R.forEach((ms, r) => {
    const race = r === R.length - 1 ? t.settings.finalRace : t.settings.koRace;
    html += `<div class="bcol"><div class="bcol-head">${roundName(R.length - 1 - r, r)}<span>${tr('raceShort', { n: race })}</span></div>
      <div class="bcol-body">${ms.map(m => bmatch(t, m)).join('')}
      ${r === R.length - 1 && t.bracket.bronze ? `<div class="bronze-wrap"><div class="bcol-head">${tr('bronze')}<span>${tr('raceShort', { n: t.settings.koRace })}</span></div>${bmatch(t, t.bracket.bronze)}</div>` : ''}
      </div></div>`;
  });
  html += '</div></div>';
  const pod = L.podium(t);
  if (pod) html += championCard(t, pod);
  if (t.format !== 'knockout') html += `<div class="center-row"><button class="btn ghost small" data-act="resetPlayoff">${tr('resetPlayoff')}</button></div>`;
  return html;
}

function tabStats(t) {
  const { players, highlights: h, matches } = L.playerStats(t);
  if (!matches) return `<p class="empty">${tr('noStatsYet')}</p>`;
  const n = id => esc(L.playerName(t, id));
  const big = h.biggest?.m;
  const tiles = [
    [tr('stMatches'), matches],
    [tr('stFrames'), h.frames],
    [tr('stBR'), h.br],
    [tr('stBiggest'), big ? `${big.sa}–${big.sb}` : '–', big ? `${n(big.a)} – ${n(big.b)}` : ''],
  ];
  return `<div class="tiles">${tiles.map(([k, v, s]) => `<div class="tile"><div class="tile-k">${k}</div><div class="tile-v">${v}</div>${s ? `<div class="tile-s">${s}</div>` : ''}</div>`).join('')}</div>
    <div class="tablewrap"><table class="stand stats">
      <thead><tr><th class="l">${tr('player')}</th><th>${tr('colP')}</th><th>${tr('colW')}–${tr('colL')}</th><th class="l">${tr('winPct')}</th><th class="hide-xs">${tr('framePct')}</th><th title="${tr('streakLong')}">${tr('streak')}</th><th title="Break &amp; run">B&amp;R</th></tr></thead>
      <tbody>${players.map(r => `<tr><td class="l nm">${esc(r.name)}</td><td>${r.p}</td><td>${r.w}–${r.l}</td>
        <td class="l"><span class="pbar"><i style="width:${pct(r.winPct)}"></i></span>${pct(r.winPct)}</td>
        <td class="hide-xs">${pct(r.framePct)}</td><td>${r.best}</td><td>${r.br}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="hint">${tr('brHint')}</p>`;
}

function tabManage(t) {
  return `<section class="panel">
      <h2>${tr('tournament')}</h2>
      <label class="lbl" for="m-name">${tr('tName')}</label>
      <input class="input" id="m-name" value="${esc(t.name)}" maxlength="60">
      <div class="lbl">${tr('renamePlayers')}</div>
      <div class="plist">${t.players.map(p => `<input class="input" id="m-p-${p.id}" data-rename="${p.id}" value="${esc(p.name)}" maxlength="30" aria-label="${esc(p.name)}">`).join('')}</div>
      <button class="btn primary" data-act="saveNames">${tr('save')}</button>
    </section>
    <section class="panel">
      <h2>${tr('during')}</h2>
      <div class="grid2">
        <div class="field"><label class="lbl" for="m-tables">${tr('tables')}</label>
          <select class="input" id="m-tables" data-setting="tables">${range(1, 12).map(v => `<option ${t.settings.tables === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label class="lbl" for="m-break">${tr('breakRule')}</label>
          <select class="input" id="m-break" data-setting="breakRule">${[['alternate', tr('breakAlternate')], ['winner', tr('breakWinner')]].map(([v, l]) => `<option value="${v}" ${t.settings.breakRule === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <p class="hint">${tr('racesFixed', { a: t.settings.raceTo, b: t.settings.koRace, c: t.settings.finalRace })}</p>
    </section>
    <section class="panel">
      <h2>${tr('shareBackup')}</h2>
      <p class="hint">${tr('shareBackupHint')}</p>
      <div class="btn-row">
        <button class="btn ghost" data-act="share">${ICON.share}<span>${tr('share')}</span></button>
        ${framed ? '' : `<button class="btn ghost" data-act="download">${ICON.download}<span>${tr('downloadFile')}</span></button>`}
      </div>
    </section>
    <section class="panel">
      <h2>${tr('again')}</h2>
      <div class="btn-row">
        <button class="btn ghost" data-act="rematch">${tr('rematch')}</button>
        <button class="btn ghost" data-act="changeFormat">${tr('changeFormat')}</button>
      </div>
      <p class="hint">${tr('againHint')}</p>
      <button class="btn danger" data-act="deleteT">${ICON.trash}<span>${tr('deleteT')}</span></button>
    </section>`;
}

// ---------- Match screen ----------
function viewMatch(t, mid) {
  const info = L.matchInfo(t, mid);
  const backTo = `#/t/${t.id}/${info?.stage === 'bracket' ? 'bracket' : t.format === 'knockout' ? 'bracket' : 'overview'}`;
  if (!info || !L.isReady(info.m)) {
    return bar({ back: backTo, title: t.name }) + `<main class="wrap"><p class="empty">${tr('matchNotReady')}</p></main>`;
  }
  const { m, race } = info;
  const [a, b] = L.score(m);
  const done = L.isDone(m);
  const frames = m.frames || [];
  const nextBreak = done ? null : L.breakerFor(m, frames.length, t.settings.breakRule);
  const w = L.winnerOf(m);
  const side = (s, val) => {
    const id = m[s];
    const state = done ? (id === w ? 'win' : 'lose') : '';
    return `<button class="side ${state} ${nextBreak === s ? 'breaking' : ''}" data-act="frame" data-side="${s}" ${done ? 'disabled' : ''} aria-label="${tr('addFrameFor', { name: L.playerName(t, id) })}">
      <span class="side-name">${pname(t, id)}</span>
      <span class="side-score">${val}</span>
      <span class="pips">${range(1, race).map(i => `<i class="${i <= val ? 'on' : ''}"></i>`).join('')}</span>
      <span class="side-hint">${done ? (id === w ? tr('winner') : '&nbsp;') : nextBreak === s ? `<span class="cue"></span>${tr('breaks')}` : '&nbsp;'}</span>
    </button>`;
  };
  let banner = '';
  if (done) {
    const nxt = L.upNext(t)[0];
    const finished = L.phase(t) === 'done';
    banner = `<div class="result">
      <div class="result-t">${tr('wonBy', { name: esc(L.playerName(t, w)), a: Math.max(a, b), b: Math.min(a, b) })}</div>
      <div class="btn-row center">
        ${finished ? `<button class="btn primary" data-act="nav" data-to="#/t/${t.id}/overview">${ICON.trophy}<span>${tr('seeChampion')}</span></button>`
          : nxt ? `<button class="btn primary" data-act="openMatch" data-mid="${nxt.id}">${tr('nextMatch')}: ${pname(t, nxt.a)} – ${pname(t, nxt.b)}</button>` : ''}
        <button class="btn ghost" data-act="nav" data-to="#/t/${t.id}/overview">${tr('toOverview')}</button>
      </div>
    </div>`;
  }
  const tables = t.settings.tables > 1 && !done
    ? `<div class="table-pick"><span class="lbl">${tr('table')}</span>${range(1, t.settings.tables).map(k => `<button class="seg-btn" data-act="setTable" data-n="${k}" aria-pressed="${m.table === k}">${k}</button>`).join('')}</div>`
    : '';
  const log = frames.map((f, i) => ({ f, i })).reverse().map(({ f, i }) => `<li>
      <span class="fl-n">${i + 1}</span>
      <span class="fl-w">${pname(t, m[f.w])}</span>
      <span class="fl-b muted">${tr('brokeBy', { name: pname(t, m[f.b]) })}</span>
      ${f.w === f.b ? `<button class="br-chip" data-act="toggleBR" data-i="${i}" aria-pressed="${!!f.br}" title="Break &amp; run">${ICON.bolt}B&amp;R</button>` : ''}
    </li>`).join('');
  return bar({ back: backTo, title: ctxLabel(t, m), sub: `${t.name} · ${tr('raceShort', { n: race })}` }) + `<main class="wrap match">
    ${tables}
    <div class="board">${side('a', a)}${side('b', b)}</div>
    ${done ? banner : `<p class="hint center">${frames.length ? tr('tapHint') : tr('tapHintFirst')}</p>`}
    <div class="match-actions">
      <button class="btn ghost" data-act="undo" ${frames.length ? '' : 'disabled'}>${ICON.undo}<span>${tr('undo')}</span></button>
      <button class="btn ghost" data-act="quickResult">${ICON.edit}<span>${tr('enterResult')}</span></button>
      ${!frames.length && !done ? `<button class="btn ghost" data-act="swapBreak">${ICON.swap}<span>${tr('swapBreak')}</span></button>` : ''}
      ${m.startedAt || done ? `<button class="btn ghost" data-act="resetMatch">${ICON.trash}<span>${tr('resetMatch')}</span></button>` : ''}
    </div>
    ${frames.length ? `<h2 class="sec">${tr('frames')}</h2><ol class="framelog">${log}</ol>` : ''}
  </main>`;
}

function quickResult(t, m, race) {
  let a = m.sa ?? L.score(m)[0], b = m.sb ?? L.score(m)[1];
  const draw = () => {
    const ok = L.validScore(a, b, race);
    $('#qr').innerHTML = `
      <div class="qr-side"><div class="qr-name">${pname(t, m.a)}</div><div class="qr-val">${a}</div>
        <div class="qr-ctl"><button class="step" data-q="a" data-d="-1" aria-label="−1">−</button><button class="step" data-q="a" data-d="1" aria-label="+1">+</button></div></div>
      <div class="qr-side"><div class="qr-name">${pname(t, m.b)}</div><div class="qr-val">${b}</div>
        <div class="qr-ctl"><button class="step" data-q="b" data-d="-1" aria-label="−1">−</button><button class="step" data-q="b" data-d="1" aria-label="+1">+</button></div></div>`;
    $('#qrHint').textContent = ok ? tr('wonBy', { name: L.playerName(t, a > b ? m.a : m.b), a: Math.max(a, b), b: Math.min(a, b) }) : tr('needRace', { n: race });
    $('#qrSave').disabled = !ok;
  };
  openModal(`<h3>${tr('enterResult')}</h3><p class="muted">${tr('raceShort', { n: race })}</p>
    <div class="qr" id="qr"></div><p class="hint" id="qrHint"></p>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">${tr('cancel')}</button><button class="btn primary" id="qrSave">${tr('save')}</button></div>`);
  draw();
  $('#qr').addEventListener('click', e => {
    const s = e.target.closest('[data-q]');
    if (!s) return;
    const k = s.dataset.q, d = +s.dataset.d;
    if (k === 'a') a = Math.max(0, Math.min(race, a + d)); else b = Math.max(0, Math.min(race, b + d));
    if (a === race && b === race) k === 'a' ? (b = race - 1) : (a = race - 1);
    draw();
  });
  $('#qrSave').addEventListener('click', () => {
    L.setResult(t, m, a, b);
    closeModal();
    afterResult(t, m);
  });
}

function afterResult(t, m) {
  commit(t);
  vibrate([30, 40, 60]);
  if (L.phase(t) === 'done') confetti();
  else toast(tr('saved'));
}

// ---------- Players across tournaments ----------
function viewPlayers() {
  const rows = L.hallOfFame(db.tournaments.filter(t => !t.demo));
  const body = rows.length
    ? `<div class="tablewrap"><table class="stand hof">
        <thead><tr><th>#</th><th class="l">${tr('player')}</th><th title="${tr('titles')}">${ICON.trophy}</th><th>${tr('events')}</th><th>${tr('colW')}–${tr('colL')}</th><th class="l">${tr('winPct')}</th><th class="hide-xs">B&amp;R</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr data-act="playerCard" data-name="${esc(r.name)}" tabindex="0">
          <td class="pos">${i + 1}</td><td class="l nm">${esc(r.name)}</td><td class="gold-t">${r.titles || ''}</td><td>${r.events}</td><td>${r.w}–${r.l}</td>
          <td class="l"><span class="pbar"><i style="width:${pct(r.winPct)}"></i></span>${pct(r.winPct)}</td><td class="hide-xs">${r.br}</td></tr>`).join('')}</tbody>
      </table></div><p class="hint">${tr('hofHint')}</p>`
    : `<p class="empty">${tr('hofEmpty')}</p>`;
  return bar({ title: tr('navPlayers') }) + `<main class="wrap">${body}</main>` + tabbar('players');
}

function playerCard(name) {
  const r = L.hallOfFame(db.tournaments.filter(t => !t.demo)).find(x => x.name === name);
  if (!r) return;
  const medal = p => (p ? `<span class="medal m${p}">${p}</span>` : '');
  openModal(`<h3>${esc(r.name)}</h3>
    <div class="tiles small">
      <div class="tile"><div class="tile-k">${tr('titles')}</div><div class="tile-v">${r.titles}</div></div>
      <div class="tile"><div class="tile-k">${tr('winPct')}</div><div class="tile-v">${pct(r.winPct)}</div></div>
      <div class="tile"><div class="tile-k">${tr('framePct')}</div><div class="tile-v">${pct(r.framePct)}</div></div>
    </div>
    <ul class="history">${r.history.map(h => `<li>${medal(h.place)}<span class="nm">${esc(h.name)}</span><span class="muted">${h.w}–${h.l}${h.done ? '' : ' · ' + tr('ongoing')}</span></li>`).join('')}</ul>
    <div class="modal-actions"><button class="btn primary" data-act="closeModal">${tr('close')}</button></div>`);
}

// ---------- Settings ----------
function viewSettings() {
  const segP = (field, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button class="seg-btn" data-act="pref" data-field="${field}" data-value="${v}" aria-pressed="${(db.prefs[field] || (field === 'lang' ? getLang() : 'auto')) === v}">${l}</button>`).join('')}</div>`;
  return bar({ title: tr('navSettings') }) + `<main class="wrap">
    <section class="panel"><h2>${tr('language')}</h2>${segP('lang', LANGS.map(l => [l.code, l.name]))}</section>
    <section class="panel"><h2>${tr('theme')}</h2>${segP('theme', [['auto', tr('themeAuto')], ['dark', tr('themeDark')], ['light', tr('themeLight')]])}</section>
    <section class="panel">
      <h2>${tr('backupAll')}</h2>
      <p class="hint">${tr('backupAllHint')}</p>
      <div class="btn-row">
        <button class="btn ghost" data-act="backupCode">${ICON.copy}<span>${tr('copyBackup')}</span></button>
        ${framed ? '' : `<button class="btn ghost" data-act="backupFile">${ICON.download}<span>${tr('downloadFile')}</span></button>`}
        <button class="btn ghost" data-act="import">${ICON.import}<span>${tr('importBtn')}</span></button>
      </div>
    </section>
    ${installEvt ? `<section class="panel"><h2>${tr('install')}</h2><p class="hint">${tr('installHint')}</p><button class="btn primary" data-act="install">${tr('install')}</button></section>` : ''}
    <section class="panel">
      <h2>${tr('about')}</h2>
      <p class="hint">${tr('aboutText')}</p>
      <p class="hint">${tr('version')} ${VERSION}</p>
      <button class="btn danger" data-act="wipe">${ICON.trash}<span>${tr('wipe')}</span></button>
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
    body = `<section class="hero-card">
      <div class="eyebrow">${tr('sharedWithYou')}</div>
      <h2>${esc(t.name)}</h2>
      <p class="muted">${fmtName(t.format)} · ${tr('nPlayers', { n: t.players.length })} · ${tr('matchesOf', { done, total })}</p>
      ${pod ? `<p class="gold">${ICON.trophy} ${esc(L.playerName(t, pod.first))}</p>` : ''}
      <button class="btn primary" data-act="saveShared">${exists ? tr('updateCopy') : tr('saveCopy')}</button>
    </section>`;
  }
  return bar({ back: '#/', title: tr('appName') }) + `<main class="wrap">${body}</main>`;
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
  openModal(`<h3>${tr('importTitle')}</h3>
    <p class="hint">${tr('importHint')}</p>
    <textarea class="input code" id="impText" rows="5" placeholder="POOL2.…" aria-label="${tr('importTitle')}"></textarea>
    <label class="filepick"><input type="file" id="impFile" accept="application/json,.json,.txt"> ${tr('orFile')}</label>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">${tr('cancel')}</button><button class="btn primary" id="impGo">${tr('importBtn')}</button></div>`);
  $('#impGo').addEventListener('click', () => importText($('#impText').value));
  $('#impFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (f) importText(await f.text());
  });
}

async function shareDialog(t) {
  const text = summaryText(t, tr);
  openModal(`<h3>${tr('share')}</h3>
    <div class="share-sec">
      <div class="lbl">${tr('shareTextTitle')}</div>
      <pre class="preview" id="shText">${esc(text)}</pre>
      <div class="btn-row"><button class="btn primary" data-act="copy" data-src="shText">${ICON.copy}<span>${tr('copyText')}</span></button>
      ${!framed && navigator.share ? `<button class="btn ghost" data-act="nativeShare">${ICON.share}<span>${tr('shareVia')}</span></button>` : ''}</div>
    </div>
    <div class="share-sec">
      <div class="lbl">${tr('shareCodeTitle')}</div>
      <p class="hint">${tr('shareCodeHint')}</p>
      <textarea class="input code" id="shCode" rows="3" readonly aria-label="${tr('shareCodeTitle')}">…</textarea>
      <div class="btn-row"><button class="btn ghost" data-act="copy" data-src="shCode">${ICON.copy}<span>${tr('copyCode')}</span></button>
      ${framed ? '' : `<button class="btn ghost" data-act="copyLink">${ICON.share}<span>${tr('copyLink')}</span></button>`}</div>
    </div>
    <div class="modal-actions"><button class="btn ghost" data-act="closeModal">${tr('close')}</button></div>`);
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

// ---------- Modal, toast, confetti ----------
function openModal(html) {
  const d = $('#modal');
  d.innerHTML = `<div class="modal">${html}</div>`;
  if (!d.open) d.showModal();
}
function closeModal() {
  const d = $('#modal');
  if (d.open) d.close();
}
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function ask(text, yes = tr('yes'), danger = true) {
  return new Promise(resolve => {
    openModal(`<h3>${esc(text)}</h3><div class="modal-actions"><button class="btn ghost" id="askNo">${tr('cancel')}</button><button class="btn ${danger ? 'danger' : 'primary'}" id="askYes">${esc(yes)}</button></div>`);
    const d = $('#modal');
    const done = ok => { d.removeEventListener('close', onClose); if (d.open) d.close(); resolve(ok); };
    const onClose = () => done(false);
    d.addEventListener('close', onClose);
    $('#askYes').onclick = () => done(true);
    $('#askNo').onclick = () => done(false);
  });
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
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
  const colors = ['#f2c14e', '#2f6fd6', '#d8423a', '#6b3fa0', '#f08a2b', '#1f9d55', '#8a1c1c', '#111111'];
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 13 - 4,
    r: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  const step = now => {
    const el = now - t0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.vx *= 0.99;
      ctx.globalAlpha = Math.max(0, 1 - el / 2600);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    if (el < 2600) requestAnimationFrame(step);
    else { ctx.clearRect(0, 0, innerWidth, innerHeight); c.hidden = true; }
  };
  requestAnimationFrame(step);
}

// ---------- Events ----------
const curT = () => (route.id ? getTournament(route.id) : null);

const actions = {
  nav: el => go(parseHash(el.dataset.to)),
  new: () => { draft = newDraft(); lastCount = -1; go({ name: 'new' }); },
  demo: createDemo,
  open: el => go({ name: 't', id: el.dataset.id, tab: 'overview' }),
  tab: el => go({ ...route, name: 't', tab: el.dataset.tab }),
  import: importDialog,
  closeModal,

  setDraft: el => {
    const v = el.dataset.num ? +el.dataset.value : el.dataset.value;
    draft[el.dataset.field] = v;
    if (el.dataset.field === 'swissRounds') draft.swissAuto = false;
    $$(`[data-act="setDraft"][data-field="${el.dataset.field}"]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === String(v))));
    updateSummary(true);
  },
  addPlayer: () => { draft.names.push(''); renderPlayerList(true); },
  rmPlayer: el => { draft.names.splice(+el.dataset.i, 1); if (!draft.names.length) draft.names.push(''); renderPlayerList(); },
  addKnown: el => {
    const i = draft.names.findIndex(n => !n.trim());
    if (i >= 0) draft.names[i] = el.dataset.name; else draft.names.push(el.dataset.name);
    renderPlayerList();
  },
  shufflePlayers: () => { draft.names = L.shuffle(filledNames()); renderPlayerList(); toast(tr('shuffled')); },
  pasteList: () => {
    openModal(`<h3>${tr('pasteList')}</h3><p class="hint">${tr('pasteListHint')}</p>
      <textarea class="input" id="plText" rows="8" aria-label="${tr('pasteList')}"></textarea>
      <div class="modal-actions"><button class="btn ghost" data-act="closeModal">${tr('cancel')}</button><button class="btn primary" id="plGo">${tr('add')}</button></div>`);
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
    openModal(`<h3>${tr('copyBackup')}</h3><p class="hint">${tr('backupCodeHint')}</p><textarea class="input code" id="bkCode" rows="6" readonly aria-label="${tr('copyBackup')}">${esc(code)}</textarea>
      <div class="modal-actions"><button class="btn ghost" data-act="closeModal">${tr('close')}</button><button class="btn primary" data-act="copy" data-src="bkCode">${ICON.copy}<span>${tr('copyCode')}</span></button></div>`);
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
    vibrate(15);
    if (finished) afterResult(t, info.m);
    else commit(t);
  },
  undo: () => { const t = curT(); L.undoFrame(t, L.matchInfo(t, route.mid).m); commit(t); },
  swapBreak: () => { const t = curT(); const m = L.matchInfo(t, route.mid).m; m.firstBreak = (m.firstBreak || 'a') === 'a' ? 'b' : 'a'; commit(t); },
  toggleBR: el => { const t = curT(); const f = L.matchInfo(t, route.mid).m.frames[+el.dataset.i]; f.br = !f.br; commit(t); },
  setTable: el => { const t = curT(); const m = L.matchInfo(t, route.mid).m; m.table = +el.dataset.n; commit(t); },
  quickResult: () => { const t = curT(); const info = L.matchInfo(t, route.mid); quickResult(t, info.m, info.race); },
  resetMatch: async () => {
    const t = curT();
    if (!(await ask(tr('confirmResetMatch'), tr('resetMatch')))) return;
    L.clearMatch(t, L.matchInfo(t, route.mid).m);
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
    const renames = $$('[data-rename]').map(i => [i.dataset.rename, i.value.trim()]);
    if (!name || renames.some(([, v]) => !v)) return toast(tr('noEmptyNames'));
    t.name = name;
    renames.forEach(([id, v]) => { t.players.find(p => p.id === id).name = v; });
    commit(t);
    toast(tr('saved'));
  },
  rematch: () => { draft = newDraft(curT()); lastCount = -1; go({ name: 'new' }); },
  changeFormat: () => { draft = newDraft(curT(), true); lastCount = -1; go({ name: 'new' }); toast(tr('changeFormatHint')); },
  deleteT: async () => {
    const t = curT();
    if (!(await ask(tr('confirmDelete', { name: t.name }), tr('deleteT')))) return;
    removeTournament(t.id);
    go({ name: 'home' });
    toast(tr('deleted'));
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

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('keydown', e => {
  const el = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && el.matches('[role="button"][data-act], tr[data-act]')) {
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
    if (el.dataset.draft) {
      draft[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.dataset.num ? +el.value : el.value;
      if (el.dataset.draft === 'swissRounds') draft.swissAuto = false;
      updateSummary(el.tagName === 'SELECT' || el.type === 'checkbox');
    }
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'playerFilter') { ui.player = el.value; render(); }
  if (el.dataset.setting) {
    const t = curT();
    t.settings[el.dataset.setting] = el.dataset.setting === 'tables' ? +el.value : el.value;
    commit(t);
    toast(tr('saved'));
  }
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

render();
