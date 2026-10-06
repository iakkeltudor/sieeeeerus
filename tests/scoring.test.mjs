// Run with: node --test tests/
// Expected values are the cached results from Sieeeeerus.xlsx (Season 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreSeason, teamSizeDeduction, validateNight, personalPoints } from '../js/scoring.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const s3 = scoreSeason(load('season-3.json'));

test('per-night points match the workbook', () => {
  const expected = {
    'Quiz 1': [84.75, 84.75, 0], 'Quiz 2': [75.5, 75.5, 0], 'Quiz 3': [88, 94, 6],
    'Quiz 4': [91.75, 102.75, 11], 'Quiz 5': [88, 88, 0], 'Quiz 6': [87, 87, 0],
    'Quiz 7': [82.75, 82.75, 0], 'Quiz 8': [90, 93, 3], 'Quiz 9': [87.5, 87.5, 0],
    'Quiz 10': [84.65, 84.65, 0],
  };
  for (const n of s3.nights) {
    const [night, general, benefit] = expected[n.id];
    assert.equal(n.nightPoints, night, `${n.id} quiz-night points`);
    assert.equal(n.generalPoints, general, `${n.id} standings points`);
    assert.equal(n.cheatBenefit, benefit, `${n.id} cheat benefit`);
  }
});

test('season summary matches the Stats sheet', () => {
  const s = s3.summary;
  assert.equal(s.played, 10);
  assert.equal(s.nightPoints, 859.9);
  assert.equal(s.generalPoints, 879.9);
  assert.equal(s.avgNightPoints, 85.99);
  assert.equal(s.avgGeneralPoints, 87.99);
  assert.equal(s.avgPlace, 2.2);
  assert.equal(s.bestPlace, 1);
  assert.equal(s.wins, 4);
  assert.equal(s.avgTeamSize, 6.875);
  assert.equal(s.deductions, 11);
  assert.equal(s.cheatBenefit, 20);
  assert.equal(s.jokerPoints, 83.5);
  assert.equal(s.jokerLoss, 4);
  assert.equal(s.jokerEfficiency.toFixed(6), (0.95428571428571429).toFixed(6));
});

test('round analysis matches the Round Analysis sheet', () => {
  const avgs = s3.rounds.map((r) => r.avg);
  assert.deepEqual(avgs, [9.5, 9.875, 8.6875, 10.125, 9.75, 10.26875, 9.78125, 10.40625]);
  assert.deepEqual(s3.rounds.map((r) => r.timesJokered), [0, 0, 0, 2, 2, 4, 0, 0]);
  assert.deepEqual(s3.rounds.map((r) => r.jokeredOnBest), [0, 0, 0, 2, 2, 1, 0, 0]);
  assert.deepEqual(s3.rounds.map((r) => r.timesBest), [1, 2, 1, 4, 4, 3, 3, 4]);
});

test('AFK night scores the average of the other nights', () => {
  const season = scoreSeason({
    season: 0,
    nights: [
      { id: 'a', rounds: [10, 10, 10, 10, 10, 10, 10, 10], joker: 1, teamSize: 6, cheats: [] },
      { id: 'b', rounds: [9, 9, 9, 9, 9, 9, 9, 9], joker: 1, teamSize: 6, cheats: [] },
      { id: 'c', cheats: ['afk'] },
    ],
  });
  assert.equal(season.nights[2].nightPoints, (90 + 81) / 2);
  assert.equal(season.nights[2].generalPoints, (90 + 81) / 2);
  assert.equal(season.summary.played, 3);
});

test('team size deductions', () => {
  assert.deepEqual([1, 6, 7, 8, 9, 10].map(teamSizeDeduction), [0, 0, 1, 3, 6, 10]);
  assert.throws(() => teamSizeDeduction(11));
});

test('validation catches bad input', () => {
  assert.deepEqual(validateNight({ rounds: [1, 2, 3], cheats: ['nope'] }), ['unknown cheat "nope"', 'rounds must list 8 scores']);
  assert.deepEqual(validateNight({ cheats: ['tripleJoker'] }), ['triple joker needs a joker round']);
  for (const n of load('season-3.json').nights) assert.deepEqual(validateNight(n), [], n.id);
});

test('attendance: team size comes from who went, and totals per player', () => {
  const r = [10, 10, 10, 10, 10, 10, 10, 10];
  const season = scoreSeason({
    season: 0,
    players: ['Ana', 'Bogdan', 'Cris'],
    nights: [
      { id: 'a', rounds: r, joker: 1, place: 1, attendees: ['Ana', 'Bogdan', 'Cris'], guests: 4, cheats: [] },
      { id: 'b', rounds: r, joker: 1, place: 2, attendees: ['Ana', 'Cris'], cheats: [] },
      { id: 'c', rounds: r, joker: 1, place: 3, teamSize: 5, cheats: [] },
    ],
  });
  assert.equal(season.nights[0].teamSize, 7);
  assert.equal(season.nights[0].deduction, 1);
  assert.equal(season.nights[1].teamSize, 2);
  assert.equal(season.attendance.tracked, 2);
  assert.deepEqual(season.attendance.rows.map((p) => [p.name, p.count, p.wins]), [['Ana', 2, 1], ['Cris', 2, 1], ['Bogdan', 1, 1]]);
});

test('attendance validation catches typos and mismatched team size', () => {
  const roster = ['Ana', 'Bogdan'];
  assert.deepEqual(validateNight({ attendees: ['Ana', 'Bgdan'], cheats: [] }, roster), ['"Bgdan" is not in the season\'s players list']);
  assert.deepEqual(validateNight({ attendees: ['Ana', 'Ana'], cheats: [] }, roster), ['listed twice: Ana']);
  assert.deepEqual(validateNight({ attendees: ['Ana', 'Bogdan'], teamSize: 3, cheats: [] }, roster), ['team size is 3 but 2 people are listed']);
  assert.deepEqual(validateNight({ attendees: ['Ana', 'Bogdan'], guests: 1, teamSize: 3, cheats: [] }, roster), []);
});

test('season 4 quiz 1 totals 82.5', () => {
  const s4 = scoreSeason(load('season-4.json'));
  const q1 = s4.nights[0];
  assert.equal(q1.teamSize, 5);
  assert.equal(q1.deduction, 0);
  assert.equal(q1.base, 72.5);
  assert.equal(q1.nightPoints, 82.5);
  assert.equal(q1.generalPoints, 82.5);
  for (const n of load('season-4.json').nights) assert.deepEqual(validateNight(n, load('season-4.json').players), [], n.id);
});

test('personal points: CI +1, safe +1.5, lacheala -1.5, duels +/-1', () => {
  assert.equal(personalPoints({ ci: 1 }), 1);
  assert.equal(personalPoints({ safe: 1 }), 1.5);
  assert.equal(personalPoints({ lacheala: 1 }), -1.5);
  assert.equal(personalPoints({ duelWon: 1, duelLost: 1 }), 0);
  assert.equal(personalPoints({ ci: 2, safe: 1, lacheala: 1, duelWon: 2, duelLost: 1 }), 3);
});

const r10 = [10, 10, 10, 10, 10, 10, 10, 10];
const league = () => scoreSeason({
  season: 0,
  players: ['Ana', 'Bogdan', 'Cris'],
  nights: [
    { id: 'Quiz 1', rounds: r10, attendees: ['Ana', 'Bogdan', 'Cris'], cheats: [],
      personal: { 1: { Ana: { ci: 1 }, Bogdan: { safe: 1 } }, 4: { Ana: { ci: 1 }, Cris: { lacheala: 1 } } } },
    { id: 'Quiz 2', rounds: r10, attendees: ['Ana', 'Bogdan'], cheats: [],
      personal: { 2: { Bogdan: { ci: 2, duelWon: 1 } }, 8: { Ana: { duelLost: 1 } } } },
  ],
});

test('league table: totals, per night, by round, form and movement', () => {
  const s = league();
  assert.equal(s.personal.nights, 2);
  const rows = Object.fromEntries(s.personal.rows.map((p) => [p.name, p]));
  assert.deepEqual(s.personal.rows.map((p) => [p.rank, p.name, p.points]), [[1, 'Bogdan', 4.5], [2, 'Ana', 1], [3, 'Cris', -1.5]]);
  assert.equal(rows.Bogdan.played, 2);
  assert.equal(rows.Bogdan.perNight, 2.25);
  assert.equal(rows.Cris.played, 1);
  assert.deepEqual(rows.Bogdan.counts, { ci: 2, safe: 1, lacheala: 0, duelWon: 1, duelLost: 0 });
  assert.deepEqual(rows.Ana.byRound, { 1: 1, 2: 0, 3: 0, 4: 1, 5: 0, 6: 0, 7: 0, 8: -1 });
  assert.deepEqual(rows.Ana.form.map((f) => f.points), [2, -1]);
  // After Quiz 1 Ana led (2) ahead of Bogdan (1.5); after Quiz 2 Bogdan is top.
  assert.equal(rows.Bogdan.move, 1);
  assert.equal(rows.Ana.move, -1);
  assert.equal(rows.Cris.move, 0);
});

test('league table tiebreakers: points per night, then safes, then fewer lachealas', () => {
  const s = scoreSeason({
    season: 0,
    players: ['A', 'B', 'C', 'D'],
    nights: [
      { id: '1', rounds: r10, attendees: ['A', 'B', 'C', 'D'], cheats: [], personal: { 1: { A: { ci: 3 }, B: { safe: 2 }, C: { ci: 3 }, D: { ci: 3 } } } },
      { id: '2', rounds: r10, attendees: ['A', 'C', 'D'], cheats: [], personal: { 1: { C: { safe: 2, lacheala: 2 } }, 2: { D: { safe: 2, lacheala: 2 } } } },
    ],
  });
  // B: 3 pts in 1 night. A, C, D: 3 pts in 2 nights. C and D tie on safes and lachealas too.
  assert.deepEqual(s.personal.rows.map((p) => [p.rank, p.name]), [[1, 'B'], [2, 'C'], [2, 'D'], [4, 'A']]);
});

test('personal validation', () => {
  const roster = ['Ana', 'Bogdan'];
  const night = (personal) => ({ attendees: ['Ana'], personal, cheats: [] });
  assert.deepEqual(validateNight(night({ 1: { Ana: { ci: 1 } } }), roster), []);
  assert.deepEqual(validateNight(night({ 9: { Ana: { ci: 1 } } }), roster), ['personal: "9" is not a round number 1-8']);
  assert.deepEqual(validateNight(night({ 1: { Bogdan: { ci: 1 } }, 2: { Bogdan: { ci: 1 } } }), roster), ["personal: Bogdan has points but isn't listed as attending"]);
  assert.deepEqual(validateNight(night({ 1: { Zed: { ci: 1 } } }), roster), ['personal: "Zed" is not in the season\'s players list']);
  assert.match(validateNight(night({ 1: { Ana: { cl: 1 } } }), roster)[0], /unknown category "cl"/);
  assert.match(validateNight(night({ 1: { Ana: { ci: -1 } } }), roster)[0], /must be a number of 0 or more/);
});

test('a season without a players list has no attendance', () => {
  assert.equal(s3.attendance, null);
});

test('an empty season scores cleanly', () => {
  const s = scoreSeason({ season: 5, players: [], nights: [] });
  assert.equal(s.summary.played, 0);
  assert.equal(s.personal, null);
  assert.equal(s.summary.avgPlace, null);
  assert.equal(s.summary.jokerEfficiency, null);
});
