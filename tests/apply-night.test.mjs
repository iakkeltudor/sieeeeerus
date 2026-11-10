// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyNight, NightError } from '../scripts/apply-night.mjs';
import { formatSeason } from '../scripts/format-json.mjs';
import { cleanNight } from '../js/night.js';
import { scoreSeason } from '../js/scoring.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const read = (f) => readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const season = () => load('season-4.json');

// A valid new night for the real Season 4 roster.
const night = (over = {}) => ({
  id: 'Quiz 99', date: '2026-12-01', theme: 'Test night',
  attendees: ['Marc', 'Dragos', 'Muri'], place: 2,
  rounds: [10, 9, 8, 7, 6, 10, 9, 8], topics: { 4: 'A', 5: 'B', 7: 'C' }, joker: 6, cheats: [],
  personal: { 1: { Marc: { ci: 1 } }, 3: { Dragos: { save: 1 } } },
  beers: { Marc: { Unknown: 5 }, Dragos: { Unknown: 4 } },
  ...over,
});
const apply = (over, mode = 'add', extra = {}) => applyNight({ season: 4, mode, night: night(over), ...extra }, season());
const problemsOf = (fn) => { try { fn(); } catch (err) { assert.ok(err instanceof NightError, err.message); return err.problems; } assert.fail('expected a NightError'); };

test('the formatter writes season files exactly as they are, so commits only contain the new night', () => {
  assert.equal(formatSeason(load('season-4.json')), read('season-4.json'));
  assert.equal(formatSeason(load('season-3.json')), read('season-3.json'));
});

test('adding a night appends it and keeps the file scoring', () => {
  const { season: next, message } = apply();
  assert.equal(next.nights.length, season().nights.length + 1);
  assert.equal(next.nights.at(-1).id, 'Quiz 99');
  assert.equal(message, 'Season 4: add Quiz 99');
  const scored = scoreSeason(next).nights.at(-1);
  assert.equal(scored.base, 67);
  assert.equal(scored.nightPoints, 67 + 10); // joker on round 6 (10), team of 3
  // Existing nights are untouched.
  assert.deepEqual(next.nights.slice(0, -1), season().nights);
});

test('the written file reads back as the same season', () => {
  const { season: next } = apply();
  assert.deepEqual(JSON.parse(formatSeason(next)), next);
  assert.equal(formatSeason(JSON.parse(formatSeason(next))), formatSeason(next));
});

test('new players join the roster and can be used straight away', () => {
  const { season: next } = apply({ attendees: ['Marc', 'Zzyzx'], personal: { 1: { Zzyzx: { ci: 2 } } }, beers: undefined }, 'add', { newPlayers: ['Zzyzx'] });
  assert.equal(next.players.at(-1), 'Zzyzx');
  assert.ok(problemsOf(() => apply({ attendees: ['Marc', 'Zzyzx'] })).some((p) => /Zzyzx.*not in the season's players list/.test(p)));
  assert.ok(problemsOf(() => apply({}, 'add', { newPlayers: ['marc'] })).some((p) => /already on the players list/.test(p)));
});

test('editing replaces the night with the same id', () => {
  const original = season().nights[0];
  const edited = { ...original, place: 3 };
  const { season: next, message } = applyNight({ season: 4, mode: 'edit', night: edited }, season());
  assert.equal(next.nights.length, season().nights.length);
  assert.equal(next.nights[0].place, 3);
  assert.equal(message, 'Season 4: update Quiz 1');
  assert.deepEqual(next.nights.slice(1), season().nights.slice(1));
});

test('adding an id that exists, or editing one that does not, is refused', () => {
  assert.ok(problemsOf(() => apply({ id: 'Quiz 1' })).some((p) => /already exists/.test(p)));
  assert.ok(problemsOf(() => apply({}, 'edit')).some((p) => /nothing to edit/.test(p)));
});

test('a night that breaks the rules is refused with every reason', () => {
  const problems = problemsOf(() => apply({ rounds: [10, 9, 8, 7, 6, 10, 9, 99], joker: 12, beers: { Marc: { Unknown: 2 } }, beerTypes: { Birra: 5 } }));
  assert.ok(problems.some((p) => /round 8 score must be/.test(p)));
  assert.ok(problems.some((p) => /joker must be/.test(p)));
  assert.ok(problems.some((p) => /should match/.test(p)));
  assert.ok(problemsOf(() => apply({ attendees: [] })).some((p) => /Nobody/.test(p)));
  assert.ok(problemsOf(() => apply({ rounds: [1, 2, 3] })).some((p) => /8 round scores/.test(p)));
});

test('malformed data is refused, not written', () => {
  assert.ok(problemsOf(() => apply({ date: '13/10/2026' }))[0].includes('date'));
  assert.ok(problemsOf(() => apply({ rounds: ['x', 1, 1, 1, 1, 1, 1, 1] }))[0].includes('Round 1'));
  assert.ok(problemsOf(() => apply({ personal: { 9: { Marc: { ci: 1 } } } }))[0].includes('round number'));
  assert.ok(problemsOf(() => apply({ id: '__proto__' }))[0].includes('valid name'));
  assert.ok(problemsOf(() => applyNight({ season: 4, mode: 'overwrite', night: night() }, season()))[0].includes('mode'));
});

test('seasons without a players list (Season 3) cannot be edited from the website', () => {
  assert.ok(problemsOf(() => applyNight({ season: 3, mode: 'add', night: night() }, load('season-3.json')))[0].includes('no players list'));
});

test('a night with fields the form cannot handle is not editable', () => {
  const current = season();
  current.nights[0].manualTotal = 80;
  assert.ok(problemsOf(() => applyNight({ season: 4, mode: 'edit', night: current.nights[0] }, current))[0].includes('manualTotal'));
});

test('cleanNight drops empties and puts keys in the order the files use', () => {
  const n = cleanNight({
    joker: 6, cheats: [], rounds: [1, 2, 3, 4, 5, 6, 7, 8], place: 1, attendees: ['A'], theme: '  ', date: '',
    id: ' Q ', guests: 0, topics: { 4: '', 5: ' Maps ' },
    personal: { night: { A: { ci: 1 } }, 3: { A: { ci: 0 } }, 1: { A: { ci: 2, save: 1 } } }, beers: { A: {} },
  });
  assert.deepEqual(Object.keys(n), ['id', 'date', 'theme', 'attendees', 'place', 'rounds', 'topics', 'joker', 'cheats', 'personal']);
  assert.equal(n.id, 'Q');
  assert.equal(n.date, null);
  assert.deepEqual(n.topics, { 5: 'Maps' });
  assert.deepEqual(Object.keys(n.personal), ['1', 'night']); // round 3 had only a zero
});
