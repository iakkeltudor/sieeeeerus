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

test('season 4 personal standings after quiz 1', () => {
  // Only Quiz 1, so this keeps passing as later nights are added to the file.
  const raw = load('season-4.json');
  const s4 = scoreSeason({ ...raw, nights: raw.nights.filter((n) => n.id === 'Quiz 1') });
  const rows = s4.personal.rows.filter((p) => p.played).map((p) => [p.rank, p.name, p.points]);
  // Dragos 9 CI; Iakkel 1 CI + 2 duels; Marc 1 + 1.5 - 1.5 ranks above Alin and Muri on saves.
  assert.deepEqual(rows, [[1, 'Dragos', 9], [2, 'Iakkel', 3], [3, 'Marc', 1], [4, 'Muri', 1], [4, 'Alin', 1]]);
});

test('season 4 quiz 2 totals 89.5 and counts night-level personal points', () => {
  const raw = load('season-4.json');
  for (const n of raw.nights) assert.deepEqual(validateNight(n, raw.players), [], n.id);
  const s4 = scoreSeason(raw);
  const q2 = s4.nights.find((n) => n.id === 'Quiz 2');
  assert.equal(q2.teamSize, 7);
  assert.equal(q2.deduction, 1);
  assert.equal(q2.base, 79.5);
  assert.equal(q2.nightPoints, 89.5);
  const rows = Object.fromEntries(s4.personal.rows.map((p) => [p.name, p]));
  assert.equal(rows.Dragos.points, 19);
  assert.equal(rows.Dragos.unassigned, 10);
  assert.equal(rows.Dragos.played, 2);
  assert.equal(rows.Madaras.points, 2);
  assert.equal(rows.Iakkel.played, 1);
  // Quiz 2's beers are logged as totals-only (no per-person type), via beerTypes.
  assert.equal(s4.beers.nights, 2);
});

test('season 4 beers after quiz 1 (Marc and Muri both drank 7)', () => {
  const raw = load('season-4.json');
  const b = scoreSeason({ ...raw, nights: raw.nights.filter((n) => n.id === 'Quiz 1') }).beers;
  assert.equal(b.total, 32);
  assert.deepEqual(b.record, { count: 7, holders: [{ player: 'Marc', night: 'Quiz 1' }, { player: 'Muri', night: 'Quiz 1' }] });
  assert.deepEqual(b.types, [{ name: 'Birra', count: 24 }, { name: 'Ciuc', count: 7 }, { name: 'Heineken', count: 1 }]);
  assert.deepEqual(b.rows.filter((r) => r.nightsLogged).map((r) => [r.rank, r.name, r.total]),
    [[1, 'Marc', 7], [1, 'Muri', 7], [3, 'Iakkel', 6], [3, 'Dragos', 6], [3, 'Alin', 6]]);
});

test('season 4 beers: quiz 2 known as team totals only (18 Birra, 12 Ciuc), still add up to 30', () => {
  const raw = load('season-4.json');
  const q2 = raw.nights.find((n) => n.id === 'Quiz 2');
  const personTotal = Object.values(q2.beers).reduce((a, d) => a + Object.values(d).reduce((x, y) => x + y, 0), 0);
  assert.equal(personTotal, 30);
  assert.deepEqual(q2.beerTypes, { Birra: 18, Ciuc: 12 });
  const full = scoreSeason(raw).beers;
  // Season totals combine Quiz 1's real per-person types with Quiz 2's team-only split.
  assert.equal(full.total, 62);
  assert.deepEqual(full.types, [{ name: 'Birra', count: 42 }, { name: 'Ciuc', count: 19 }, { name: 'Heineken', count: 1 }]);
  const rows = Object.fromEntries(full.rows.map((p) => [p.name, p]));
  assert.equal(rows.Marc.total, 14); // 7 on Quiz 1 + 7 on Quiz 2
  assert.equal(rows.Madaras.total, 5); // only played Quiz 2
});

test('personal points: CI +1, save +1.5, lacheala -1.5, duels +/-1', () => {
  assert.equal(personalPoints({ ci: 1 }), 1);
  assert.equal(personalPoints({ save: 1 }), 1.5);
  assert.equal(personalPoints({ lacheala: 1 }), -1.5);
  assert.equal(personalPoints({ duelWon: 1, duelLost: 1 }), 0);
  assert.equal(personalPoints({ ci: 2, save: 1, lacheala: 1, duelWon: 2, duelLost: 1 }), 3);
});

const r10 = [10, 10, 10, 10, 10, 10, 10, 10];
const league = () => scoreSeason({
  season: 0,
  players: ['Ana', 'Bogdan', 'Cris'],
  nights: [
    { id: 'Quiz 1', rounds: r10, attendees: ['Ana', 'Bogdan', 'Cris'], cheats: [],
      personal: { 1: { Ana: { ci: 1 }, Bogdan: { save: 1 } }, 4: { Ana: { ci: 1 }, Cris: { lacheala: 1 } } } },
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
  assert.deepEqual(rows.Bogdan.counts, { ci: 2, save: 1, lacheala: 0, duelWon: 1, duelLost: 0 });
  assert.deepEqual(rows.Ana.byRound, { 1: 1, 2: 0, 3: 0, 4: 1, 5: 0, 6: 0, 7: 0, 8: -1 });
  assert.deepEqual(rows.Ana.form.map((f) => f.points), [2, -1]);
  // After Quiz 1 Ana led (2) ahead of Bogdan (1.5); after Quiz 2 Bogdan is top.
  assert.equal(rows.Bogdan.move, 1);
  assert.equal(rows.Ana.move, -1);
  assert.equal(rows.Cris.move, 0);
});

test('league table tiebreakers: points per night, then saves, then fewer lachealas', () => {
  const s = scoreSeason({
    season: 0,
    players: ['A', 'B', 'C', 'D'],
    nights: [
      { id: '1', rounds: r10, attendees: ['A', 'B', 'C', 'D'], cheats: [], personal: { 1: { A: { ci: 3 }, B: { save: 2 }, C: { ci: 3 }, D: { ci: 3 } } } },
      { id: '2', rounds: r10, attendees: ['A', 'C', 'D'], cheats: [], personal: { 1: { C: { save: 2, lacheala: 2 } }, 2: { D: { save: 2, lacheala: 2 } } } },
    ],
  });
  // B: 3 pts in 1 night. A, C, D: 3 pts in 2 nights. C and D tie on saves and lachealas too.
  assert.deepEqual(s.personal.rows.map((p) => [p.rank, p.name]), [[1, 'B'], [2, 'C'], [2, 'D'], [4, 'A']]);
});

test('personal validation', () => {
  const roster = ['Ana', 'Bogdan'];
  const night = (personal) => ({ attendees: ['Ana'], personal, cheats: [] });
  assert.deepEqual(validateNight(night({ 1: { Ana: { ci: 1 } } }), roster), []);
  assert.deepEqual(validateNight(night({ 9: { Ana: { ci: 1 } } }), roster), ['personal: "9" is not a round number 1-8 or "night"']);
  assert.deepEqual(validateNight(night({ night: { Ana: { ci: 2 } } }), roster), []);
  assert.deepEqual(validateNight(night({ 1: { Bogdan: { ci: 1 } }, 2: { Bogdan: { ci: 1 } } }), roster), ["personal: Bogdan has points but isn't listed as attending"]);
  assert.deepEqual(validateNight(night({ 1: { Zed: { ci: 1 } } }), roster), ['personal: "Zed" is not in the season\'s players list']);
  assert.match(validateNight(night({ 1: { Ana: { cl: 1 } } }), roster)[0], /unknown category "cl"/);
  assert.match(validateNight(night({ 1: { Ana: { ci: -1 } } }), roster)[0], /must be a number of 0 or more/);
});

test('beer tracker: totals, per night, favourites, types and record', () => {
  const s = scoreSeason({
    season: 0,
    players: ['Ana', 'Bogdan', 'Cris'],
    nights: [
      { id: 'Quiz 1', rounds: r10, attendees: ['Ana', 'Bogdan', 'Cris'], cheats: [],
        beers: { Ana: { Ursus: 2, Guinness: 1 }, Bogdan: { ursus: 1 } } },
      { id: 'Quiz 2', rounds: r10, attendees: ['Ana', 'Bogdan'], cheats: [],
        beers: { Bogdan: { 'Ursus ': 3, Leffe: 1 } } },
      { id: 'Quiz 3', rounds: r10, attendees: ['Ana', 'Bogdan', 'Cris'], cheats: [] }, // not logged
    ],
  });
  const b = s.beers;
  assert.equal(b.nights, 2);
  assert.equal(b.total, 8);
  assert.equal(b.perNight, 4);
  assert.deepEqual(b.record, { count: 4, holders: [{ player: 'Bogdan', night: 'Quiz 2' }] });
  assert.deepEqual(b.rows.map((r) => [r.rank, r.name, r.total, r.nightsLogged, r.perNight]),
    [[1, 'Bogdan', 5, 2, 2.5], [2, 'Ana', 3, 2, 1.5], [3, 'Cris', 0, 1, 0]]);
  // Names are matched ignoring case and spaces; the first spelling is kept.
  assert.deepEqual(b.types, [{ name: 'Ursus', count: 6 }, { name: 'Guinness', count: 1 }, { name: 'Leffe', count: 1 }]);
  assert.deepEqual(b.rows[0].favourite, { name: 'Ursus', count: 4 });
  assert.deepEqual(b.rows[1].beers, [{ name: 'Ursus', count: 2 }, { name: 'Guinness', count: 1 }]);
  assert.equal(b.rows[2].favourite, null);
});

test('beer record lists everyone tied for it', () => {
  const s = scoreSeason({
    season: 0,
    players: ['Ana', 'Bogdan', 'Cris'],
    nights: [
      { id: 'Quiz 1', rounds: r10, attendees: ['Ana', 'Bogdan'], cheats: [], beers: { Ana: { Ursus: 3 }, Bogdan: { Ursus: 2 } } },
      { id: 'Quiz 2', rounds: r10, attendees: ['Bogdan', 'Cris'], cheats: [], beers: { Bogdan: { Ursus: 3 }, Cris: { Leffe: 3 } } },
    ],
  });
  assert.deepEqual(s.beers.record, { count: 3, holders: [
    { player: 'Ana', night: 'Quiz 1' }, { player: 'Bogdan', night: 'Quiz 2' }, { player: 'Cris', night: 'Quiz 2' },
  ] });
});

test('beer validation', () => {
  const roster = ['Ana', 'Bogdan'];
  const night = (beers) => ({ attendees: ['Ana'], beers, cheats: [] });
  assert.deepEqual(validateNight(night({ Ana: { Ursus: 2 } }), roster), []);
  assert.deepEqual(validateNight(night({ Bogdan: { Ursus: 1 } }), roster), ["beers: Bogdan has beers but isn't listed as attending"]);
  assert.deepEqual(validateNight(night({ Zed: { Ursus: 1 } }), roster), ['beers: "Zed" is not in the season\'s players list']);
  assert.deepEqual(validateNight(night({ Ana: { Ursus: 0 } }), roster), ["beers: Ana's Ursus count must be a number above 0"]);
  assert.deepEqual(validateNight(night({ Ana: { ' ': 1 } }), roster), ['beers: Ana has a beer with no name']);
});

test('beerTypes: a night can record team totals per beer without saying who drank what', () => {
  const s = scoreSeason({
    season: 0,
    players: ['Ana', 'Bogdan'],
    nights: [
      { id: 'Quiz 1', rounds: r10, attendees: ['Ana', 'Bogdan'], cheats: [],
        beers: { Ana: { Unknown: 3 }, Bogdan: { Unknown: 2 } }, beerTypes: { Ursus: 4, Ciuc: 1 } },
    ],
  });
  const b = s.beers;
  // Total comes from the per-person counts, not doubled up with beerTypes.
  assert.equal(b.total, 5);
  assert.deepEqual(b.types, [{ name: 'Ursus', count: 4 }, { name: 'Ciuc', count: 1 }]);
  assert.deepEqual(b.rows.map((r) => [r.rank, r.name, r.total]), [[1, 'Ana', 3], [2, 'Bogdan', 2]]);
});

test('beerTypes validation: shape, zero/negative counts, and must match the per-person total', () => {
  const roster = ['Ana'];
  const night = (beers, beerTypes) => ({ attendees: ['Ana'], beers, beerTypes, cheats: [] });
  assert.deepEqual(validateNight(night({ Ana: { Unknown: 3 } }, { Ursus: 3 }), roster), []);
  assert.deepEqual(validateNight(night({ Ana: { Unknown: 3 } }, { Ursus: 2 }), roster),
    ['beers add up to 3 per person but 2 in beerTypes — these should match']);
  assert.deepEqual(validateNight(night(undefined, { Ursus: 0 }), roster), ['beerTypes: Ursus count must be a number above 0']);
  assert.deepEqual(validateNight(night(undefined, { ' ': 2 }), roster), ['beerTypes has a beer with no name']);
  assert.deepEqual(validateNight(night(undefined, ['Ursus']), roster), ['beerTypes must look like { "Beer": 18 }']);
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
