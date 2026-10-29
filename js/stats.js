// Extra season stats for the "Stats" section and the race chart. Works on a season that has
// already been through scoreSeason(), and stays pure so `node --test` can check it.
import { ROUNDS, nightPersonal } from './scoring.js';

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const avg = (xs) => (xs.length ? sum(xs) / xs.length : null);
const tidy = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);

const hasPersonal = (n) => n.played && n.personal && Object.keys(n.personal).length > 0;
const went = (n, name) => Array.isArray(n.attendees) && n.attendees.includes(name);

// Running personal points after each night that has personal points. A player's line starts at
// the first of those nights they went to.
export function race(season) {
  const players = season.players ?? [];
  const nights = season.nights.filter(hasPersonal);
  const series = players.map((name) => {
    let total = 0;
    let start = null;
    const points = nights.map((n, i) => {
      if (went(n, name)) {
        if (start == null) start = i;
        total += nightPersonal(n, name).points;
      }
      return tidy(total);
    });
    return { name, start, points };
  }).filter((s) => s.start != null);
  return { nights: nights.map((n) => n.id), series };
}

// Each person's strongest round slot, plus their share of all the team's CIs.
export function specialists(season) {
  const rows = (season.personal?.rows ?? []).filter((p) => p.played);
  const totalCi = sum(rows.map((p) => p.counts.ci));
  const nights = season.nights.filter(hasPersonal);
  return rows.map((p) => {
    let best = null;
    for (const r of ROUNDS) {
      const pts = p.byRound[r.n];
      if (pts > 0 && (!best || pts > best.points)) best = { round: r.n, name: r.name, weekly: r.weekly, points: pts };
    }
    if (best?.weekly) {
      // A weekly round changes topic, so name the topics they scored in.
      best.topics = nights
        .filter((n) => went(n, p.name) && nightPersonal(n, p.name).byRound[best.round]?.points > 0)
        .map((n) => n.topics?.[best.round])
        .filter(Boolean);
    }
    return {
      name: p.name,
      points: p.points,
      best,
      ci: p.counts.ci,
      ciShare: totalCi ? tidy(p.counts.ci / totalCi) : null,
    };
  })
    .filter((s) => s.best || s.ci)
    .sort((a, b) => (b.ciShare ?? 0) - (a.ciShare ?? 0) || b.points - a.points);
}

// Does a bigger team score more? "Raw" is the score before the team-size deduction.
export function teamSize(season) {
  const nights = season.nights.filter((n) => n.played && n.hasRounds && n.teamSize != null && !n.afk);
  const sizes = [...new Set(nights.map((n) => n.teamSize))].sort((a, b) => a - b);
  const groups = sizes.map((size) => {
    const ns = nights.filter((n) => n.teamSize === size);
    return {
      size,
      nights: ns.length,
      raw: tidy(avg(ns.map((n) => n.base + (n.jokerScore ?? 0)))),
      onNight: tidy(avg(ns.map((n) => n.nightPoints))),
      wins: ns.filter((n) => n.place === 1).length,
    };
  });
  const side = (filter) => {
    const ns = nights.filter(filter);
    return ns.length ? { nights: ns.length, raw: tidy(avg(ns.map((n) => n.base + (n.jokerScore ?? 0)))), onNight: tidy(avg(ns.map((n) => n.nightPoints))) } : null;
  };
  return { groups, small: side((n) => n.teamSize <= 6), big: side((n) => n.teamSize >= 7) };
}

// Pairs of players who went to the most nights together, and how the team did on those nights.
export function partnerships(season, limit = 6) {
  const players = season.players ?? [];
  const nights = season.nights.filter((n) => n.played && Array.isArray(n.attendees));
  const pairs = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const together = nights.filter((n) => went(n, players[i]) && went(n, players[j]));
      if (together.length < 2) continue;
      pairs.push({
        a: players[i],
        b: players[j],
        nights: together.length,
        avg: tidy(avg(together.map((n) => n.nightPoints))),
        wins: together.filter((n) => n.place === 1).length,
        avgPlace: tidy(avg(together.map((n) => n.place).filter((p) => p != null))),
      });
    }
  }
  pairs.sort((x, y) => y.nights - x.nights || y.wins - x.wins || y.avg - x.avg);
  return pairs.slice(0, limit);
}

// Personal points per beer, only counting nights where beers were written down.
export function beersVsBrains(season) {
  const players = season.players ?? [];
  const nights = season.nights.filter((n) => n.played && n.beers && typeof n.beers === 'object');
  const beersOf = (n, name) => sum(Object.values(n.beers[name] ?? {}).filter((v) => typeof v === 'number'));
  const rows = players.map((name) => {
    const mine = nights.filter((n) => went(n, name));
    const beers = sum(mine.map((n) => beersOf(n, name)));
    const points = tidy(sum(mine.map((n) => nightPersonal(n, name).points)));
    return { name, beers, points, perBeer: beers ? tidy(points / beers) : null };
  })
    .filter((r) => r.beers > 0)
    .sort((a, b) => b.perBeer - a.perBeer || a.beers - b.beers);
  const team = nights.map((n) => ({
    id: n.id,
    beers: sum(Object.keys(n.beers).map((name) => beersOf(n, name))),
    score: n.nightPoints,
    place: n.place ?? null,
  }));
  return { nights: nights.length, rows, team };
}

// Attendance and scoring runs, and how long since each person's last lacheala.
export function streaks(season) {
  const players = season.players ?? [];
  const nights = season.nights.filter((n) => n.played && Array.isArray(n.attendees));
  const longestRun = (flags) => {
    let best = 0;
    let run = 0;
    for (const f of flags) { run = f ? run + 1 : 0; best = Math.max(best, run); }
    return best;
  };
  const currentRun = (flags) => {
    let run = 0;
    for (let i = flags.length - 1; i >= 0 && flags[i]; i--) run++;
    return run;
  };
  return players.map((name) => {
    const attended = nights.map((n) => went(n, name));
    // Scoring runs only look at nights they went to that have personal points recorded.
    const mine = nights.filter((n) => went(n, name) && hasPersonal(n));
    const scored = mine.map((n) => nightPersonal(n, name).points > 0);
    const lastLach = mine.map((n) => nightPersonal(n, name).counts.lacheala > 0).lastIndexOf(true);
    return {
      name,
      attended: attended.filter(Boolean).length,
      longestAttend: longestRun(attended),
      currentAttend: currentRun(attended),
      longestScoring: longestRun(scored),
      currentScoring: currentRun(scored),
      // Nights since the last lacheala; null means they've never had one.
      sinceLacheala: lastLach < 0 ? null : mine.length - 1 - lastLach,
    };
  })
    .filter((r) => r.attended > 0)
    .sort((a, b) => b.currentScoring - a.currentScoring || b.longestAttend - a.longestAttend);
}

// Where each joker went, night by night.
export function jokers(season) {
  const nights = season.nights.filter((n) => n.played && n.hasRounds && n.jokerScore);
  // The round the joker went on most often, and how many times.
  const counts = {};
  for (const n of nights) counts[n.joker] = (counts[n.joker] ?? 0) + 1;
  const [favRound, favCount] = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [];
  return {
    favourite: favRound ? { round: Number(favRound), count: favCount } : null,
    nights: nights.map((n) => ({ id: n.id, round: n.joker, score: n.jokerScore, best: n.best, hit: n.jokerLoss === 0 })),
    onBest: season.summary.jokersOnBest,
    played: season.summary.jokersPlayed,
    efficiency: season.summary.jokerEfficiency,
    earned: season.summary.jokerPoints,
    lost: season.summary.jokerLoss,
  };
}
