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

export function validateNight(night) {
  const problems = [];
  const cheats = night.cheats ?? [];
  for (const c of cheats) if (!(c in CHEATS)) problems.push(`unknown cheat "${c}"`);
  if (night.rounds != null) {
    if (!Array.isArray(night.rounds) || night.rounds.length !== 8) problems.push('rounds must list 8 scores');
    else night.rounds.forEach((s, i) => {
      if (typeof s !== 'number' || s < 0 || s > MAX_ROUND_SCORE) problems.push(`round ${i + 1} score must be 0-${MAX_ROUND_SCORE}`);
    });
  }
  if (night.joker != null && (night.joker < 1 || night.joker > 8)) problems.push('joker must be a round number 1-8');
  if (night.teamSize != null && (night.teamSize < 1 || night.teamSize > MAX_TEAM_SIZE)) problems.push(`team size must be 1-${MAX_TEAM_SIZE}`);
  if (cheats.includes('tripleJoker') && night.joker == null) problems.push('triple joker needs a joker round');
  return problems;
}

// One night, before the AFK average is known (columns W-AF, AH-AJ).
function scoreOne(night) {
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
  return { ...season, nights: scored, summary: summarise(scored), rounds: roundStats(scored) };
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
