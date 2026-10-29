// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreSeason } from '../js/scoring.js';
import { race, specialists, teamSize, partnerships, beersVsBrains, streaks, jokers } from '../js/stats.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const r = (best = 10) => [best, 9, 9, 9, 9, 9, 9, 9];

// Three nights, three players: Ana every night, Bogdan nights 1-2, Cris nights 2-3.
const demo = () => scoreSeason({
  season: 0,
  players: ['Ana', 'Bogdan', 'Cris'],
  nights: [
    { id: 'Quiz 1', rounds: r(), joker: 1, place: 1, attendees: ['Ana', 'Bogdan'], guests: 4, cheats: [],
      topics: { 4: 'Maps' },
      personal: { 1: { Ana: { ci: 2 } }, 4: { Bogdan: { ci: 1, lacheala: 1 } } },
      beers: { Ana: { Ursus: 2 }, Bogdan: { Ursus: 4 } } },
    { id: 'Quiz 2', rounds: r(), joker: 2, place: 2, attendees: ['Ana', 'Bogdan', 'Cris'], cheats: [],
      topics: { 4: 'Rivers' },
      personal: { 4: { Bogdan: { ci: 2 } }, 8: { Cris: { save: 1 } } },
      beers: { Ana: { Ursus: 1 }, Cris: { Ursus: 3 } } },
    { id: 'Quiz 3', rounds: r(11), joker: 1, place: 1, attendees: ['Ana', 'Cris'], cheats: [],
      personal: { 1: { Ana: { ci: 1 } } } },
  ],
});

test('race: running points, each line starting at the first night the person went', () => {
  const { nights, series } = race(demo());
  assert.deepEqual(nights, ['Quiz 1', 'Quiz 2', 'Quiz 3']);
  const by = Object.fromEntries(series.map((s) => [s.name, s]));
  assert.deepEqual(by.Ana.points, [2, 2, 3]);
  assert.deepEqual(by.Bogdan.points, [-0.5, 1.5, 1.5]);
  assert.equal(by.Cris.start, 1);
  assert.deepEqual(by.Cris.points, [0, 1.5, 1.5]);
});

test('specialists: best round, the weekly topics behind it, and share of CIs', () => {
  const s = specialists(demo());
  const by = Object.fromEntries(s.map((x) => [x.name, x]));
  assert.equal(by.Ana.best.round, 1);
  assert.equal(by.Ana.best.points, 3);
  assert.equal(by.Bogdan.best.round, 4);
  assert.deepEqual(by.Bogdan.best.topics, ['Rivers']); // Quiz 1's round 4 netted -0.5
  assert.equal(by.Ana.ciShare, 0.5); // 3 of 6 CIs
  assert.equal(by.Cris.ciShare, 0);
  assert.equal(s[0].name, 'Ana'); // ties on share go to more points
});

test('team size: raw score before the deduction versus the score on the night', () => {
  const t = teamSize(demo());
  // Quiz 1 had 6 people (2 + 4 guests); Quiz 2 had 3; Quiz 3 had 2. All under 7, so no deduction.
  assert.deepEqual(t.groups.map((g) => g.size), [2, 3, 6]);
  assert.equal(t.big, null);
  assert.equal(t.small.nights, 3);
  const s4 = teamSize(scoreSeason(load('season-4.json')));
  const ten = s4.groups.find((g) => g.size === 10);
  assert.equal(ten.raw, 92.5);
  assert.equal(ten.onNight, 82.5);
});

test('partnerships: pairs with 2+ nights together, most nights first', () => {
  const p = partnerships(demo());
  // Same nights and wins, so the higher average score (Quiz 3 was a better night) goes first.
  assert.deepEqual(p.map((x) => [x.a, x.b, x.nights, x.wins]), [['Ana', 'Cris', 2, 1], ['Ana', 'Bogdan', 2, 1]]);
  assert.equal(p[0].avgPlace, 1.5);
});

test('beers vs brains: points per beer on nights with beers logged', () => {
  const b = beersVsBrains(demo());
  assert.equal(b.nights, 2);
  const by = Object.fromEntries(b.rows.map((x) => [x.name, x]));
  assert.deepEqual([by.Ana.beers, by.Ana.points, by.Ana.perBeer], [3, 2, 0.666667]); // Quiz 3 has no beers
  assert.deepEqual([by.Bogdan.beers, by.Bogdan.points, by.Bogdan.perBeer], [4, 1.5, 0.375]);
  assert.equal(b.rows[0].name, 'Ana');
  assert.deepEqual(b.team.map((n) => n.beers), [6, 4]);
});

test('streaks: attendance runs, scoring runs, and nights since a lacheala', () => {
  const by = Object.fromEntries(streaks(demo()).map((x) => [x.name, x]));
  assert.deepEqual([by.Ana.longestAttend, by.Ana.currentAttend, by.Ana.currentScoring], [3, 3, 1]); // nothing on Quiz 2
  assert.deepEqual([by.Bogdan.currentAttend, by.Bogdan.sinceLacheala], [0, 1]);
  assert.equal(by.Cris.sinceLacheala, null);
  assert.equal(by.Cris.longestScoring, 1);
});

test('jokers: hits, misses and the favourite round', () => {
  const j = jokers(demo());
  assert.deepEqual(j.nights.map((n) => n.hit), [true, false, true]);
  assert.deepEqual(j.favourite, { round: 1, count: 2 });
  const s4 = jokers(scoreSeason(load('season-4.json')));
  assert.deepEqual(s4.favourite, { round: 6, count: 4 });
});

test('stats work on a season without players (Season 3)', () => {
  const s3 = scoreSeason(load('season-3.json'));
  assert.deepEqual(race(s3).series, []);
  assert.deepEqual(specialists(s3), []);
  assert.deepEqual(partnerships(s3), []);
  assert.deepEqual(streaks(s3), []);
  assert.equal(teamSize(s3).groups.length, 4);
  assert.equal(jokers(s3).onBest, 5);
});
