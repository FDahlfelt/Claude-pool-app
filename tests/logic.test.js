import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/logic.js';

const names = n => Array.from({ length: n }, (_, i) => `P${i + 1}`);
const key = m => [m.a, m.b].sort().join('|');

function playAll(t, pick = m => (Math.random() < 0.5 ? 'a' : 'b')) {
  for (let guard = 0; guard < 500; guard++) {
    const m = L.allMatches(t).find(x => L.isReady(x) && !L.isDone(x));
    if (!m) {
      if (L.canNextSwissRound(t)) { L.nextSwissRound(t); continue; }
      if (L.phase(t) === 'readyForPlayoff') { L.startPlayoff(t); continue; }
      return;
    }
    const { race } = L.matchInfo(t, m.id);
    const side = pick(m);
    while (!L.addFrame(t, m, side, race)) { /* keep scoring */ }
  }
  throw new Error('tournament never finished');
}

test('round robin: every pair once, nobody twice in a round', () => {
  for (const n of [3, 4, 7, 8, 11]) {
    const ids = names(n);
    const rounds = L.roundRobin(ids);
    const pairs = rounds.flatMap(r => r.matches).map(key);
    assert.equal(pairs.length, (n * (n - 1)) / 2);
    assert.equal(new Set(pairs).size, pairs.length);
    for (const r of rounds) {
      const seen = r.matches.flatMap(m => [m.a, m.b]).concat(r.byes);
      assert.equal(new Set(seen).size, n, 'each player once per round');
    }
  }
});

test('double round robin plays every pair twice with swapped sides', () => {
  const rounds = L.roundRobin(names(5), { legs: 2 });
  const ms = rounds.flatMap(r => r.matches);
  assert.equal(ms.length, 20);
  const directed = new Set(ms.map(m => m.a + '>' + m.b));
  assert.equal(directed.size, 20);
});

test('groups are balanced and only play inside the group', () => {
  const { groups, rounds } = L.groupStage(names(7), 2);
  assert.deepEqual(groups.map(g => g.players.length).sort(), [3, 4]);
  for (const m of rounds.flatMap(r => r.matches)) {
    const g = groups.find(g => g.name === m.group);
    assert.ok(g.players.includes(m.a) && g.players.includes(m.b));
  }
  assert.equal(rounds.flatMap(r => r.matches).length, 9);
});

test('bracket seeding puts byes against top seeds and 1 v 2 only in the final', () => {
  const seeds = names(6);
  const br = L.makeBracket(seeds);
  const first = br.rounds[0];
  assert.equal(first.length, 4);
  const byes = first.filter(L.isBye).map(m => m.a).sort();
  assert.deepEqual(byes, ['P1', 'P2']);
  assert.deepEqual(L.seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  // Bye winners already moved on.
  assert.ok(br.rounds[1].some(m => m.a === 'P1' || m.b === 'P1'));
});

test('knockout with 7 players: 6 matches + bronze, and a champion', () => {
  const t = L.createTournament({ name: 'K', format: 'knockout', names: names(7), settings: { bronze: true } });
  assert.equal(L.plan('knockout', 7, t.settings).total, 7);
  playAll(t);
  const pod = L.podium(t);
  assert.ok(pod.first && pod.second && pod.third);
  assert.equal(L.allMatches(t).filter(m => !L.isBye(m) && L.isDone(m)).length, 7);
});

test('league with top-4 playoff finishes with the planned number of matches', () => {
  const t = L.createTournament({ name: 'L', format: 'league', names: names(7), settings: { playoffSize: 4, bronze: true } });
  playAll(t);
  assert.equal(L.phase(t), 'done');
  assert.equal(L.progress(t).done, L.plan('league', 7, t.settings).total);
});

test('groups: playoff avoids same-group first-round matches', () => {
  for (let i = 0; i < 20; i++) {
    const t = L.createTournament({ name: 'G', format: 'groups', names: names(9), settings: { groupCount: 3, advance: 2, bronze: false } });
    for (const m of L.stageMatches(t)) L.setResult(t, m, 3, 1);
    L.startPlayoff(t);
    const groupOf = id => t.groups.find(g => g.players.includes(id)).name;
    for (const m of t.bracket.rounds[0]) if (!L.isBye(m)) assert.notEqual(groupOf(m.a), groupOf(m.b));
  }
});

test('swiss: no rematches while avoidable, byes rotate', () => {
  const t = L.createTournament({ name: 'S', format: 'swiss', names: names(7), settings: { swissRounds: 4, playoffSize: 0 } });
  playAll(t);
  const pairs = L.stageMatches(t).map(key);
  assert.equal(new Set(pairs).size, pairs.length);
  const byes = t.rounds.flatMap(r => r.byes);
  assert.equal(new Set(byes).size, byes.length);
  assert.equal(L.phase(t), 'done');
});

test('standings tiebreak: points, frame difference, then head to head', () => {
  const players = ['A', 'B', 'C'].map(id => ({ id, name: id }));
  const m = (a, b, sa, sb) => ({ ...L.mkMatch(a, b), sa, sb });
  const st = L.computeStandings({ players, matches: [m('A', 'B', 3, 2), m('B', 'C', 3, 2), m('C', 'A', 3, 2)] });
  // All 1 win, diff 0, frames 5 -> head to head can't separate a cycle; name decides.
  assert.deepEqual(st.map(r => r.id), ['A', 'B', 'C']);
  const st2 = L.computeStandings({ players, matches: [m('A', 'B', 3, 0), m('B', 'C', 3, 0), m('C', 'A', 3, 2)] });
  assert.equal(st2[0].id, 'A');
});

test('live scoring: frames, alternating break, undo reopens a finished match', () => {
  const t = L.createTournament({ name: 'X', format: 'league', names: names(3), settings: { raceTo: 2 } });
  const m = L.stageMatches(t)[0];
  assert.equal(L.addFrame(t, m, 'a', 2), false);
  assert.equal(m.frames[0].b, 'a');
  assert.equal(L.addFrame(t, m, 'a', 2), true);
  assert.equal(m.frames[1].b, 'b');
  assert.deepEqual([m.sa, m.sb], [2, 0]);
  L.undoFrame(t, m);
  assert.equal(L.isDone(m), false);
  assert.deepEqual(L.score(m), [1, 0]);
});

test('changing a knockout result clears later matches that no longer fit', () => {
  const t = L.createTournament({ name: 'K', format: 'knockout', names: names(4), settings: { bronze: false } });
  const [s1, s2] = t.bracket.rounds[0];
  L.setResult(t, s1, 4, 0);
  L.setResult(t, s2, 4, 0);
  const final = t.bracket.rounds[1][0];
  L.setResult(t, final, 5, 1);
  L.setResult(t, s1, 0, 4);
  assert.equal(final.sa, null);
  assert.equal(final.a, s1.b);
});

test('migrates a tournament saved by the first version', () => {
  const old = {
    name: 'Gammel', mode: 'league', raceTo: 3, pointsPerWin: 2, playoffSize: 4, playoffRaceTo: 4, finalRaceTo: 5, bronzeMatch: true,
    players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
    rounds: [{ matches: [{ id: 'm', a: 'a', b: 'b', sa: 3, sb: 1 }], bye: 'c' }],
    playoff: null,
  };
  const t = L.migrateV1(old);
  assert.equal(t.format, 'league');
  assert.deepEqual(t.rounds[0].byes, ['c']);
  assert.deepEqual(t.rounds[0].matches[0].frames, []);
  assert.equal(L.standingsFor(t)[0].id, 'a');
  assert.equal(t.settings.pointsPerWin, 2);
});

test('validate catches impossible setups', () => {
  const s = { ...L.DEFAULT_SETTINGS };
  assert.equal(L.validate('league', 2, s), 'minPlayers3');
  assert.equal(L.validate('knockout', 2, s), null);
  assert.equal(L.validate('groups', 5, { ...s, groupCount: 3 }), 'groupsTooMany');
  assert.equal(L.validate('groups', 7, { ...s, groupCount: 2, advance: 4 }), 'advance');
  assert.equal(L.validate('swiss', 7, { ...s, swissRounds: 7 }), 'swissRounds');
});

test('balls left: ball difference splits players level on points and frames', () => {
  const players = ['A', 'B', 'C'].map(id => ({ id, name: id }));
  // A cycle: everyone 1 win, 3–2 each way, so points, frames and frame difference are level.
  const m = (a, b, sa, sb, balls) => ({ ...L.mkMatch(a, b), sa, sb, balls });
  const matches = [m('A', 'B', 3, 2, [1, 9]), m('B', 'C', 3, 2, [2, 4]), m('C', 'A', 3, 2, [6, 2])];
  const plain = L.computeStandings({ players, matches });
  assert.deepEqual(plain.map(r => r.id), ['A', 'B', 'C']);
  const st = L.computeStandings({ players, matches, balls: true });
  // A: for 9+6=15, against 1+2=3 -> +12. B: for 1+4=5, against 9+2=11 -> -6. C: for 2+2=4, against 4+6=10 -> -6.
  assert.equal(st[0].id, 'A');
  assert.equal(st[0].bdiff, 12);
  assert.deepEqual(st.map(r => r.bdiff), [12, -6, -6]);
});

test('balls left are recorded per frame; an early black counts as every ball left', () => {
  const t = L.createTournament({ name: 'B', format: 'league', game: '8ball', names: names(3), settings: { raceTo: 2 } });
  const m = L.stageMatches(t)[0];
  L.addFrame(t, m, 'a', 2);
  L.setFrameBalls(t, m, 0, 3);
  L.addFrame(t, m, 'b', 2);
  L.setFrameBalls(t, m, 1, null, true);
  assert.deepEqual(L.ballsLeft(m), [7, 3]);
  L.addFrame(t, m, 'a', 2);
  L.setFrameBalls(t, m, 2, 0);
  assert.deepEqual(L.ballsLeft(m), [7, 3]);
  const row = L.standingsFor(t).find(r => r.id === m.a);
  assert.equal(row.bdiff, -4);
  assert.equal(L.playerStats(t).players.find(r => r.id === m.a).blacks, 1);
  // A final score typed in directly carries its own totals.
  L.setResult(t, m, 2, 0, [0, 5]);
  assert.deepEqual(L.ballsLeft(m), [0, 5]);
  L.clearMatch(t, m);
  assert.deepEqual(L.ballsLeft(m), [0, 0]);
});

test('starting a playoff is refused for knockout, without a playoff, or twice', () => {
  const ko = L.createTournament({ name: 'k', format: 'knockout', names: names(6), settings: {} });
  const before = JSON.stringify(ko.bracket);
  assert.equal(L.startPlayoff(ko), false);
  assert.equal(JSON.stringify(ko.bracket), before);
  const league = L.createTournament({ name: 'l', format: 'league', names: names(4), settings: { playoffSize: 0 } });
  assert.equal(L.startPlayoff(league), false);
  assert.equal(league.bracket, null);
  const po = L.createTournament({ name: 'p', format: 'league', names: names(4), settings: { playoffSize: 2 } });
  assert.equal(L.startPlayoff(po), true);
  const first = po.bracket;
  assert.equal(L.startPlayoff(po), false);
  assert.equal(po.bracket, first);
});

test('walkover counts race–0 in the standings but not in the stats', () => {
  const t = L.createTournament({ name: 'w', format: 'league', names: names(3), settings: { raceTo: 3 } });
  const m = L.stageMatches(t)[0];
  L.setWalkover(t, m, 'b', 3);
  assert.deepEqual([m.sa, m.sb, m.wo], [0, 3, 'wo']);
  assert.equal(L.standingsFor(t)[0].id, m.b);
  assert.equal(L.playerStats(t).matches, 0);
  L.clearMatch(t, m);
  assert.equal(m.wo, undefined);
});

test('a player who withdraws hands every open match to the opponent, and can come back', () => {
  const t = L.createTournament({ name: 'w', format: 'league', names: names(5), settings: { raceTo: 3, playoffSize: 2 } });
  const [gone] = t.players;
  const played = L.stageMatches(t).find(m => m.a === gone.id || m.b === gone.id);
  L.setResult(t, played, 3, 1);
  L.withdrawPlayer(t, gone.id);
  const theirs = L.stageMatches(t).filter(m => m.a === gone.id || m.b === gone.id);
  assert.ok(theirs.every(L.isDone));
  assert.ok(theirs.filter(m => m !== played).every(m => m.wo === 'withdraw' && L.winnerOf(m) !== gone.id));
  assert.deepEqual([played.sa, played.sb], [3, 1], 'played results stay');
  // They are left out of the playoff.
  for (const m of L.stageMatches(t)) if (!L.isDone(m)) L.setResult(t, m, 3, 0);
  assert.ok(L.qualifiers(t).every(q => q.id !== gone.id));
  L.reinstatePlayer(t, gone.id);
  assert.ok(theirs.filter(m => m !== played).every(m => !L.isDone(m)));
  assert.deepEqual([played.sa, played.sb], [3, 1]);
});

test('withdrawing from a knockout gives the walkover in the bracket', () => {
  const t = L.createTournament({ name: 'k', format: 'knockout', names: names(4), settings: { bronze: false } });
  const [m1, m2] = t.bracket.rounds[0];
  L.withdrawPlayer(t, m1.a);
  assert.equal(L.winnerOf(m1), m1.b);
  L.setResult(t, m2, 4, 0);
  L.applyWithdrawals(t);
  assert.equal(t.bracket.rounds[1][0].a, m1.b);
});

test('swiss pairing leaves out withdrawn players', () => {
  const t = L.createTournament({ name: 's', format: 'swiss', names: names(6), settings: { swissRounds: 3, playoffSize: 0 } });
  for (const m of t.rounds[0].matches) L.setResult(t, m, 3, 0);
  const gone = t.players[0].id;
  L.withdrawPlayer(t, gone);
  L.nextSwissRound(t);
  const r2 = t.rounds[1];
  assert.ok(r2.matches.every(m => m.a !== gone && m.b !== gone));
  assert.ok(!r2.byes.includes(gone));
});

test('head to head adds up meetings across tournaments by name', () => {
  const t1 = L.createTournament({ name: 'one', format: 'league', names: ['Ann', 'Bo', 'Cy'], settings: {} });
  const t2 = L.createTournament({ name: 'two', format: 'league', names: ['bo', 'ANN', 'Di'], settings: {} });
  const meet = (t, a, b) => L.stageMatches(t).find(m => [m.a, m.b].sort().join() === [a, b].sort().join());
  const id = (t, n) => t.players.find(p => p.name.toLowerCase() === n).id;
  const m1 = meet(t1, id(t1, 'ann'), id(t1, 'bo'));
  L.setResult(t1, m1, m1.a === id(t1, 'ann') ? 3 : 1, m1.a === id(t1, 'ann') ? 1 : 3); // Ann wins 3–1
  const m2 = meet(t2, id(t2, 'ann'), id(t2, 'bo'));
  L.setWalkover(t2, m2, m2.a === id(t2, 'bo') ? 'a' : 'b', 3); // walkovers don't count
  const h = L.headToHead([t1, t2], 'Ann', 'Bo');
  assert.deepEqual([h.a.w, h.b.w, h.a.ff, h.b.ff, h.meetings.length], [1, 0, 3, 1, 1]);
});

test('a real score replaces a walkover', () => {
  const t = L.createTournament({ name: 'w', format: 'league', names: names(3), settings: { raceTo: 3 } });
  const m = L.stageMatches(t)[0];
  L.setWalkover(t, m, 'a', 3);
  L.setResult(t, m, 1, 3);
  assert.equal(m.wo, undefined);
  assert.equal(L.playerStats(t).matches, 1);
});
