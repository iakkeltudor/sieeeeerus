// Scoring rules, ported 1:1 from the "Quiz Data" formulas in Sieeeeerus.xlsx.
// Pure functions only, so the same module runs in the browser and in `node --test`.

export const ROUNDS = [
  { n: 1, name: 'General knowledge', weekly: false },
  { n: 2, name: 'Images', weekly: false },
  { n: 3, name: 'Cinema', weekly: false },
  { n: 4, name: 'Weekly topic', weekly: true },
  { n: 5, name: 'Weekly topic', weekly: true },
  { n: 6, name: 'History & geography', weekly: false },
  { n: 7, name: 'Surprise', weekly: true },
  { n: 8, name: 'Music', weekly: false },
];

export const MAX_ROUND_SCORE = 11;
export const MAX_TEAM_SIZE = 10;

export const CHEATS = {
  reinforcements: {
    name: 'Reinforcements',
    rule: 'The big-team deduction still applies on the night, but is given back in the general standings.',
  },
  tripleJoker: {
    name: 'Triple joker',
    rule: 'The joker round counts once more in the general standings. On the night it scores like a normal joker.',
  },
  noYou: {
    name: 'No, you',
    rule: 'Adds the gap between your best and worst round to the general standings.',
  },
  afk: {
    name: 'AFK',
    rule: 'Skip a night and score the average of your other nights, both on the night and in the standings.',
  },
};

// Personal standings categories. The values recorded are counts per round; a question worth
// double (a "red" question) is already entered as 2, so no doubling happens here.
export const PERSONAL = {
  ci: { name: 'CI', long: 'Contributie individuala', points: 1, rule: 'Only this person knew the answer.' },
  safe: { name: 'Safe', long: 'Safe', points: 1.5, rule: 'We were about to write a wrong answer and this person changed it to the right one at the last minute.' },
  lacheala: { name: 'Lacheala', long: 'Lacheala', points: -1.5, rule: 'Confidently gave us a wrong answer.' },
  duelWon: { name: 'Duel won', long: 'Duel won', points: 1, rule: 'Two of us disagreed, this person’s answer went down, and it was right.' },
  duelLost: { name: 'Duel lost', long: 'Duel lost', points: -1, rule: 'Two of us disagreed, this person’s answer went down, and it was wrong.' },
};

export const personalPoints = (counts) =>
  tidy(Object.entries(counts ?? {}).reduce((a, [cat, v]) => a + (PERSONAL[cat]?.points ?? 0) * v, 0));

// Team-size deduction on the night (Rules & Assumptions sheet).
export function teamSizeDeduction(size) {
  if (size == null) return 0;
  if (size <= 6) return 0;
  const table = { 7: 1, 8: 3, 9: 6, 10: 10 };
  if (!(size in table)) throw new Error(`Team size ${size} is outside 1-${MAX_TEAM_SIZE}`);
  return table[size];
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const avg = (xs) => (xs.length ? sum(xs) / xs.length : null);
// Round away float noise (e.g. 74.65000000000001) so totals print and compare cleanly.
const tidy = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);

// Team size counts everyone at the table: listed attendees plus any guests.
export function teamSizeOf(night) {
  if (night.teamSize != null) return night.teamSize;
  if (Array.isArray(night.attendees)) return night.attendees.length + (night.guests ?? 0);
  return null;
}

export function validateNight(night, roster = null) {
  const problems = [];
  const cheats = night.cheats ?? [];
  if (night.attendees != null) {
    if (!Array.isArray(night.attendees)) problems.push('attendees must be a list of names');
    else {
      if (roster) for (const p of night.attendees) if (!roster.includes(p)) problems.push(`"${p}" is not in the season's players list`);
      const dupes = night.attendees.filter((p, i) => night.attendees.indexOf(p) !== i);
      if (dupes.length) problems.push(`listed twice: ${[...new Set(dupes)].join(', ')}`);
      const counted = night.attendees.length + (night.guests ?? 0);
      if (night.teamSize != null && night.teamSize !== counted) problems.push(`team size is ${night.teamSize} but ${counted} people are listed`);
    }
  }
  for (const c of cheats) if (!(c in CHEATS)) problems.push(`unknown cheat "${c}"`);
  if (night.personal != null) {
    const reported = new Set();
    for (const [round, people] of Object.entries(night.personal)) {
      if (!/^[1-8]$/.test(round)) { problems.push(`personal: "${round}" is not a round number 1-8`); continue; }
      for (const [name, counts] of Object.entries(people ?? {})) {
        if (roster && !roster.includes(name)) {
          if (!reported.has(name)) problems.push(`personal: "${name}" is not in the season's players list`);
          reported.add(name);
          continue;
        }
        if (Array.isArray(night.attendees) && !night.attendees.includes(name) && !reported.has(name)) {
          problems.push(`personal: ${name} has points but isn't listed as attending`);
          reported.add(name);
        }
        for (const [cat, v] of Object.entries(counts ?? {})) {
          if (!(cat in PERSONAL)) problems.push(`personal round ${round}, ${name}: unknown category "${cat}" (use ${Object.keys(PERSONAL).join(', ')})`);
          else if (typeof v !== 'number' || v < 0) problems.push(`personal round ${round}, ${name}: ${cat} must be a number of 0 or more`);
        }
      }
    }
  }
  if (night.rounds != null) {
    if (!Array.isArray(night.rounds) || night.rounds.length !== 8) problems.push('rounds must list 8 scores');
    else night.rounds.forEach((s, i) => {
      if (typeof s !== 'number' || s < 0 || s > MAX_ROUND_SCORE) problems.push(`round ${i + 1} score must be 0-${MAX_ROUND_SCORE}`);
    });
  }
  if (night.joker != null && (night.joker < 1 || night.joker > 8)) problems.push('joker must be a round number 1-8');
  const size = Array.isArray(night.attendees) || night.teamSize != null ? teamSizeOf(night) : null;
  if (size != null && (size < 1 || size > MAX_TEAM_SIZE)) problems.push(`team size must be 1-${MAX_TEAM_SIZE}`);
  if (cheats.includes('tripleJoker') && night.joker == null) problems.push('triple joker needs a joker round');
  return problems;
}

// One night, before the AFK average is known (columns W-AF, AH-AJ).
function scoreOne(input) {
  const night = { ...input, teamSize: teamSizeOf(input) };
  const cheats = new Set(night.cheats ?? []);
  const afk = cheats.has('afk');
  const rounds = night.rounds ?? null;
  const manual = night.manualTotal ?? null;
  const hasRounds = Array.isArray(rounds) && rounds.length === 8;

  const base = hasRounds ? sum(rounds) : null;
  const jokerScore = hasRounds && night.joker ? rounds[night.joker - 1] : null;
  const deduction = hasRounds ? teamSizeDeduction(night.teamSize) : null;
  const standingsDeduction = hasRounds ? (cheats.has('reinforcements') ? 0 : deduction) : null;
  const tripleExtra = hasRounds && cheats.has('tripleJoker') && jokerScore != null ? jokerScore : 0;
  const best = hasRounds ? Math.max(...rounds) : null;
  const worst = hasRounds ? Math.min(...rounds) : null;
  const noYouExtra = hasRounds && cheats.has('noYou') ? best - worst : 0;
  const reinforcementsRelief = hasRounds && cheats.has('reinforcements') ? deduction : 0;

  let night_ = null;
  let general = null;
  if (!afk) {
    // The manual total wins over round scores, as in the workbook.
    if (manual != null) {
      night_ = manual;
      general = manual;
    } else if (hasRounds) {
      night_ = base + (jokerScore ?? 0) - deduction;
      general = base + (jokerScore ?? 0) - standingsDeduction + tripleExtra + noYouExtra;
    }
  }

  return {
    ...night,
    cheats: [...cheats],
    afk,
    hasRounds,
    base: tidy(base),
    jokerScore,
    deduction,
    tripleExtra,
    noYouExtra,
    cheatBenefit: manual != null || hasRounds ? tidy(reinforcementsRelief + tripleExtra + noYouExtra) : null,
    best,
    worst,
    jokerLoss: jokerScore ? tidy(best - jokerScore) : null,
    nightPoints: tidy(night_),
    generalPoints: tidy(general),
  };
}

// Score a whole season. AFK nights take the average of every non-AFK scored night.
export function scoreSeason(season) {
  const scored = season.nights.map(scoreOne);
  const nightAvg = avg(scored.filter((n) => n.nightPoints != null).map((n) => n.nightPoints));
  const generalAvg = avg(scored.filter((n) => n.generalPoints != null).map((n) => n.generalPoints));
  for (const n of scored) {
    if (n.afk) {
      n.nightPoints = tidy(nightAvg);
      n.generalPoints = tidy(generalAvg);
    }
    n.played = n.nightPoints != null;
  }
  return {
    ...season,
    nights: scored,
    summary: summarise(scored),
    rounds: roundStats(scored),
    attendance: attendance(season.players, scored),
    personal: personalStandings(season.players, scored),
  };
}

// Personal standings ---------------------------------------------------------
// night.personal = { "<round>": { "<player>": { ci, safe, lacheala, duelWon, duelLost } } }

const hasPersonal = (n) => n.played && n.personal && Object.keys(n.personal).length > 0;
const emptyCounts = () => Object.fromEntries(Object.keys(PERSONAL).map((k) => [k, 0]));
const addCounts = (into, counts) => {
  for (const [k, v] of Object.entries(counts ?? {})) if (k in into) into[k] += v;
  return into;
};

// One player's counts for one night, by round and in total.
export function nightPersonal(night, name) {
  const byRound = {};
  const total = emptyCounts();
  for (const [round, people] of Object.entries(night.personal ?? {})) {
    if (people?.[name]) {
      byRound[round] = { counts: { ...people[name] }, points: personalPoints(people[name]) };
      addCounts(total, people[name]);
    }
  }
  return { byRound, counts: total, points: personalPoints(total) };
}

// Table order: points, then points per night, then most safes, then fewest lachealas.
function compareRows(a, b) {
  return b.points - a.points
    || (b.perNight ?? 0) - (a.perNight ?? 0)
    || b.counts.safe - a.counts.safe
    || a.counts.lacheala - b.counts.lacheala;
}

function table(players, nights) {
  const rows = players.map((name, order) => {
    const attended = nights.filter((n) => Array.isArray(n.attendees) && n.attendees.includes(name));
    const counts = emptyCounts();
    const byRound = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((r) => [r, 0]));
    const form = [];
    for (const n of attended) {
      const p = nightPersonal(n, name);
      addCounts(counts, p.counts);
      for (const [r, v] of Object.entries(p.byRound)) byRound[r] = tidy(byRound[r] + v.points);
      if (hasPersonal(n)) form.push({ id: n.id, points: p.points });
    }
    const points = personalPoints(counts);
    return {
      name, order, counts, byRound, points,
      played: attended.length,
      perNight: attended.length ? tidy(points / attended.length) : null,
      form: form.slice(-5),
    };
  });
  rows.sort((a, b) => compareRows(a, b) || a.order - b.order);
  rows.forEach((r, i) => {
    r.rank = i > 0 && compareRows(r, rows[i - 1]) === 0 ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

function personalStandings(players, nights) {
  if (!Array.isArray(players) || !players.length) return null;
  const played = nights.filter((n) => n.played);
  const scored = played.filter(hasPersonal);
  const rows = table(players, played);

  // Movement since the previous night with personal points.
  if (scored.length > 1) {
    const before = table(players, played.slice(0, played.indexOf(scored[scored.length - 1])));
    const prevRank = Object.fromEntries(before.map((r) => [r.name, r.played ? r.rank : null]));
    for (const r of rows) r.move = prevRank[r.name] == null ? null : prevRank[r.name] - r.rank;
  }
  return { nights: scored.length, rows };
}

// Who went to which night. Only nights with an attendees list count towards the totals.
function attendance(players, nights) {
  if (!Array.isArray(players) || !players.length) return null;
  const tracked = nights.filter((n) => n.played && Array.isArray(n.attendees));
  const rows = players.map((name, order) => {
    const went = tracked.filter((n) => n.attendees.includes(name));
    return { name, order, nights: went.map((n) => n.id), count: went.length, wins: went.filter((n) => n.place === 1).length };
  });
  rows.sort((a, b) => b.count - a.count || a.order - b.order);
  return { tracked: tracked.length, rows };
}

function summarise(nights) {
  const played = nights.filter((n) => n.played);
  const places = played.map((n) => n.place).filter((p) => p != null);
  const sizes = played.map((n) => n.teamSize).filter((s) => s != null);
  const jokered = played.filter((n) => n.hasRounds && n.jokerScore);
  const jokerPoints = sum(jokered.map((n) => n.jokerScore));
  const jokerBest = sum(jokered.map((n) => n.best));
  return {
    played: played.length,
    nightPoints: tidy(sum(played.map((n) => n.nightPoints))),
    generalPoints: tidy(sum(played.map((n) => n.generalPoints))),
    avgNightPoints: tidy(avg(played.map((n) => n.nightPoints))),
    avgGeneralPoints: tidy(avg(played.map((n) => n.generalPoints))),
    avgPlace: tidy(avg(places)),
    bestPlace: places.length ? Math.min(...places) : null,
    wins: places.filter((p) => p === 1).length,
    avgTeamSize: tidy(avg(sizes)),
    deductions: sum(played.map((n) => n.deduction ?? 0)),
    cheatBenefit: tidy(sum(played.map((n) => n.cheatBenefit ?? 0))),
    jokerPoints: tidy(jokerPoints),
    jokerLoss: tidy(sum(jokered.map((n) => n.jokerLoss))),
    jokerEfficiency: jokerBest ? tidy(jokerPoints / jokerBest) : null,
    jokersOnBest: jokered.filter((n) => n.jokerLoss === 0).length,
    jokersPlayed: jokered.length,
  };
}

// Round Analysis sheet: per-round averages, ranges and joker quality.
function roundStats(nights) {
  const withRounds = nights.filter((n) => n.played && n.hasRounds);
  return ROUNDS.map((r, i) => {
    const scores = withRounds.map((n) => n.rounds[i]);
    const jokeredHere = withRounds.filter((n) => n.joker === r.n);
    return {
      ...r,
      count: scores.length,
      avg: tidy(avg(scores)),
      best: scores.length ? Math.max(...scores) : null,
      worst: scores.length ? Math.min(...scores) : null,
      timesBest: withRounds.filter((n) => n.rounds[i] === n.best).length,
      timesJokered: jokeredHere.length,
      jokeredOnBest: jokeredHere.filter((n) => n.rounds[i] === n.best).length,
    };
  });
}
