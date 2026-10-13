// Everything lives in this browser's localStorage.
import { migrateV1 } from './logic.js';

const KEY = 'pool-turnering-v2';
const OLD_KEY = 'pool-turnering-v1';

export const db = { tournaments: [], prefs: { lang: null, theme: 'auto' } };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      db.tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];
      db.prefs = { ...db.prefs, ...data.prefs };
      return;
    }
    // First run after the update: bring the old single tournament along.
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      db.tournaments.push(migrateV1(JSON.parse(old)));
      save();
    }
  } catch { /* storage blocked or corrupt: start empty */ }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

export const getTournament = id => db.tournaments.find(t => t.id === id);

export function upsertTournament(t) {
  const i = db.tournaments.findIndex(x => x.id === t.id);
  if (i >= 0) db.tournaments[i] = t;
  else db.tournaments.unshift(t);
  return save();
}

export function removeTournament(id) {
  db.tournaments = db.tournaments.filter(t => t.id !== id);
  return save();
}

export function clearAll() {
  db.tournaments = [];
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(OLD_KEY);
  } catch { /* ignore */ }
  save();
}
