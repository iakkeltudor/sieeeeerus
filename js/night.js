// Shared by the add-a-night form (browser) and scripts/apply-night.mjs (GitHub Action).
// cleanNight() turns whatever it is given into the exact shape stored in data/season-N.json,
// or throws a readable error. Game rules (scores, teams, cheats) are checked separately by
// validateNight() in scoring.js.

export const NIGHT_KEYS = ['id', 'date', 'theme', 'attendees', 'guests', 'place', 'rounds', 'topics', 'joker', 'cheats', 'personal', 'beers', 'beerTypes'];

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

const text = (v, max, what) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw new Error(`${what} is too long (${max} characters at most)`);
  return s;
};
const name = (v, what) => {
  const s = text(v, 40, what);
  if (!s || BAD_KEYS.has(s)) throw new Error(`${what} is not a valid name`);
  return s;
};
const num = (v, what) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} must be a number`);
  return v;
};

// { round: { player: { category: n } } } with rounds in order and empty entries dropped.
function cleanPersonal(raw) {
  if (!isObj(raw)) return null;
  const out = {};
  const rounds = Object.keys(raw).sort((a, b) => (a === 'night') - (b === 'night') || Number(a) - Number(b));
  for (const round of rounds) {
    if (!/^([1-8]|night)$/.test(round)) throw new Error(`"${round}" is not a round number (1-8) or "night"`);
    if (!isObj(raw[round])) throw new Error(`Personal points for round ${round} must be an object`);
    const people = {};
    for (const [player, counts] of Object.entries(raw[round])) {
      if (!isObj(counts)) throw new Error(`Personal points for ${player} must be an object`);
      const cats = {};
      for (const [cat, v] of Object.entries(counts)) {
        const k = name(cat, 'A category');
        if (v !== 0) cats[k] = num(v, `${player}'s ${k}`);
      }
      if (Object.keys(cats).length) people[name(player, 'A player')] = cats;
    }
    if (Object.keys(people).length) out[round] = people;
  }
  return Object.keys(out).length ? out : null;
}

function cleanBeers(raw) {
  if (!isObj(raw)) return null;
  const out = {};
  for (const [player, drinks] of Object.entries(raw)) {
    if (!isObj(drinks)) throw new Error(`Beers for ${player} must be an object`);
    const mine = {};
    for (const [beer, count] of Object.entries(drinks)) mine[name(beer, 'A beer')] = num(count, `${player}'s ${beer}`);
    if (Object.keys(mine).length) out[name(player, 'A player')] = mine;
  }
  return Object.keys(out).length ? out : null;
}

export function cleanNight(raw) {
  if (!isObj(raw)) throw new Error('The night must be an object');
  const n = {};
  n.id = name(raw.id, 'The night name');

  if (raw.date == null || raw.date === '') n.date = null;
  else if (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) n.date = raw.date;
  else throw new Error('The date must look like 2026-10-13');

  n.theme = text(raw.theme, 120, 'The theme') || null;

  if (!Array.isArray(raw.attendees) || raw.attendees.length > 20) throw new Error('Attendees must be a list of up to 20 names');
  n.attendees = raw.attendees.map((a) => name(a, 'An attendee'));

  if (raw.guests) n.guests = num(raw.guests, 'Guests');
  n.place = raw.place == null ? null : num(raw.place, 'The place');

  if (!Array.isArray(raw.rounds)) throw new Error('Rounds must be a list of 8 scores');
  n.rounds = raw.rounds.map((r, i) => num(r, `Round ${i + 1}`));

  if (isObj(raw.topics)) {
    const topics = {};
    for (const [round, topic] of Object.entries(raw.topics)) {
      if (!/^[1-8]$/.test(round)) throw new Error(`"${round}" is not a round number`);
      const t = text(topic, 80, `The round ${round} topic`);
      if (t) topics[round] = t;
    }
    if (Object.keys(topics).length) n.topics = topics;
  }

  n.joker = raw.joker == null ? null : num(raw.joker, 'The joker round');
  n.cheats = Array.isArray(raw.cheats) ? raw.cheats.map((c) => text(c, 30, 'A cheat')) : [];

  const personal = cleanPersonal(raw.personal);
  if (personal) n.personal = personal;
  const beers = cleanBeers(raw.beers);
  if (beers) n.beers = beers;
  if (isObj(raw.beerTypes)) {
    const types = {};
    for (const [beer, count] of Object.entries(raw.beerTypes)) types[name(beer, 'A beer')] = num(count, `${beer}`);
    if (Object.keys(types).length) n.beerTypes = types;
  }
  return n;
}
