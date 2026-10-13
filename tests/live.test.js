import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/logic.js';
import { toShared, fromShared, diff, applyPatch, stable } from '../src/live.js';

const names = n => Array.from({ length: n }, (_, i) => `P${i + 1}`);

test('a tournament survives the trip to the shared document and back', () => {
  for (const format of ['league', 'groups', 'swiss', 'knockout']) {
    const t = L.createTournament({ name: format, format, names: names(7), settings: { playoffSize: 4 } });
    const m = L.allMatches(t).find(L.isReady);
    L.addFrame(t, m, 'a', 99);
    L.setFrameBalls(t, m, 0, 4);
    const back = fromShared(JSON.parse(JSON.stringify(toShared(t))));
    // Empty fields come back as null instead of missing, so compare what they mean.
    assert.equal(stable(toShared(back)), stable(toShared(t)), format);
    assert.deepEqual(L.standingsFor(back).map(r => r.id), L.standingsFor(t).map(r => r.id));
    assert.deepEqual(L.progress(back), L.progress(t));
  }
});

test('scoring one match sends only that match', () => {
  const t = L.createTournament({ name: 'x', format: 'league', names: names(5), settings: {} });
  const before = toShared(t);
  const m = L.stageMatches(t)[3];
  L.setResult(t, m, 3, 1);
  const patch = diff(before, toShared(t));
  assert.deepEqual(Object.keys(patch.matches), [m.id]);
  assert.equal(patch.meta, undefined);
  assert.equal(diff(toShared(t), toShared(t)), null);
});

test('two phones scoring different matches both keep their result', () => {
  const t = L.createTournament({ name: 'x', format: 'league', names: names(4), settings: {} });
  const server = JSON.parse(JSON.stringify(toShared(t)));
  const phoneA = fromShared(server), phoneB = fromShared(server);
  L.setResult(phoneA, phoneA.rounds[0].matches[0], 3, 0);
  L.setResult(phoneB, phoneB.rounds[0].matches[1], 1, 3);
  // Each phone diffs against the server state it last saw; the server merges both updates.
  const merged = applyPatch(applyPatch(server, diff(server, toShared(phoneA))), diff(server, toShared(phoneB)));
  const result = fromShared(merged);
  assert.deepEqual([result.rounds[0].matches[0].sa, result.rounds[0].matches[0].sb], [3, 0]);
  assert.deepEqual([result.rounds[0].matches[1].sa, result.rounds[0].matches[1].sb], [1, 3]);
});

test('starting the playoff sends the new structure', () => {
  const t = L.createTournament({ name: 'x', format: 'league', names: names(4), settings: { playoffSize: 2 } });
  for (const m of L.stageMatches(t)) L.setResult(t, m, 3, 0);
  const before = toShared(t);
  L.startPlayoff(t);
  const patch = diff(before, toShared(t));
  assert.ok(patch.meta.bracket);
  assert.equal(Object.keys(patch.matches).length, 1);
});

test('stable() ignores key order', () => {
  assert.equal(stable({ b: 1, a: [{ y: 2, x: 1 }] }), stable({ a: [{ x: 1, y: 2 }], b: 1 }));
});
