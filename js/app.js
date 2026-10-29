// The ?v= on these two imports (and on index.html's links to this file and to styles.css) is a
// manual cache-buster: GitHub Pages lets browsers cache these files for ~10 minutes, so bump every
// "v=" by one, in all four places, whenever this file, scoring.js, charts.js or styles.css changes.
import { ROUNDS, CHEATS, PERSONAL, MAX_ROUND_SCORE, scoreSeason, validateNight, teamSizeDeduction, nightPersonal } from './scoring.js?v=7';
import { fmt, ordinal, shortId, pointsChart, roundsChart, raceChart, raceTop, RACE_COLOURS, scoreColor, rampSwatches, bindTip, hideTip } from './charts.js?v=7';
import { race, specialists, teamSize, partnerships, beersVsBrains, streaks, jokers } from './stats.js?v=7';

const app = document.getElementById('app');
const tabs = document.getElementById('season-tabs');
const jump = document.getElementById('jump-links');
let seasons = [];
let index = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const signed = (x) => (x > 0 ? `+${fmt(x)}` : x < 0 ? `−${fmt(-x)}` : '0');

async function getJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} could not be loaded (HTTP ${res.status}).`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${path} is not valid JSON. Check for a missing comma or bracket.`);
  }
}

async function load() {
  try {
    index = await getJson('data/seasons.json');
    seasons = await Promise.all(index.seasons.map(async (meta) => {
      const raw = await getJson(`data/${meta.file}`);
      const problems = raw.nights.flatMap((n, i) => validateNight(n, raw.players?.length ? raw.players : null).map((p) => `${n.id ?? `night ${i + 1}`}: ${p}`));
      return { ...scoreSeason(raw), status: meta.status, file: meta.file, problems };
    }));
  } catch (err) {
    app.innerHTML = `<div class="error"><strong>The results could not be loaded.</strong><p>${esc(err.message)}</p></div>`;
    return;
  }
  renderRules();
  window.addEventListener('hashchange', route);
  route();
}

function pickDefault() {
  const current = seasons.find((s) => s.season === index.current);
  if (current?.summary.played) return current.season;
  return seasons.find((s) => s.summary.played)?.season ?? index.current;
}

function route() {
  const m = location.hash.match(/season-(\d+)/);
  const wanted = m ? Number(m[1]) : pickDefault();
  const season = seasons.find((s) => s.season === wanted) ?? seasons.find((s) => s.season === pickDefault());
  hideTip();
  renderTabs(season.season);
  render(season);
  document.title = `Sieeeeerus, season ${season.season}`;
}

function renderTabs(active) {
  tabs.innerHTML = seasons.map((s) => `
    <button type="button" data-season="${s.season}" aria-current="${s.season === active}">
      Season ${s.season}<small>${esc(s.status)}</small>
    </button>`).join('');
  tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    location.hash = `season-${b.dataset.season}`;
  }));
}

// Page -------------------------------------------------------------------
function render(season) {
  const parts = [];
  if (season.problems.length) {
    parts.push(`<div class="error"><strong>Some entries in ${esc(season.file)} need fixing</strong>
      <ul>${season.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`);
  }
  if (!season.summary.played) {
    const previous = seasons.find((s) => s.season !== season.season && s.summary.played);
    parts.push(`<section class="empty">
      <h2>No nights logged for Season ${season.season} yet</h2>
      <p class="secondary">Results show up here once the first quiz night is added.</p>
      ${previous ? `<p><button type="button" class="linkish" data-goto="${previous.season}">See Season ${previous.season} results</button></p>` : ''}
    </section>`);
    parts.push(cheatsSection(season));
    app.innerHTML = parts.join('');
    app.querySelector('[data-goto]')?.addEventListener('click', (e) => { location.hash = `season-${e.target.dataset.goto}`; });
    renderJump();
    return;
  }

  parts.push(summarySection(season));
  parts.push(gridSection(season));
  if (season.personal) parts.push(personalSection(season));
  parts.push(statsSection(season));
  if (season.attendance?.tracked) parts.push(attendanceSection(season));
  parts.push(`<section class="section two-up" id="charts" data-jump="Charts">
    <div class="panel chart" id="points-chart">
      <h3>Points per night</h3>
      <p class="sub">Season cheats lift a night above its quiz-night score in the general standings.</p>
      <div class="legend">
        <span><i style="background:var(--series-1)"></i>Quiz-night points</span>
        <span><i class="dot" style="background:var(--series-2)"></i>Standings with cheats</span>
      </div>
    </div>
    <div class="panel chart" id="rounds-chart">
      <h3>Rounds, from worst to best</h3>
      <p class="sub">${jokerSentence(season.summary)}</p>
    </div>
  </section>`);
  parts.push(cheatsSection(season));
  if (season.beers) parts.push(beerSection(season));
  app.innerHTML = parts.join('');

  drawCharts(season);
  wireGrid(season);
  wireMatrix();
  renderJump();
}

// Jump links in the sticky bar (shown on phones), built from whichever sections are on the page.
function renderJump() {
  const sections = [...app.querySelectorAll('section[data-jump]')];
  jump.innerHTML = sections.map((s) => `<a href="#${s.id}" data-target="${s.id}">${esc(s.dataset.jump)}</a>`).join('');
  jump.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => {
    // Scroll without touching the URL hash, which holds the season.
    e.preventDefault();
    document.getElementById(a.dataset.target)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
}

// Charts are drawn at their real pixel width so text stays readable on phones.
function drawCharts(season) {
  const charts = [
    ['points-chart', (w) => pointsChart(season.nights, w)],
    ['rounds-chart', (w) => roundsChart(season.rounds, w)],
    ['race-chart', (w) => raceChart(race(season), w)],
  ];
  for (const [id, draw] of charts) {
    const box = app.querySelector(`#${id}`);
    if (!box) continue;
    box.querySelector('svg')?.remove();
    const style = getComputedStyle(box);
    const width = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    box.appendChild(draw(Math.max(280, Math.round(width))));
  }
}

let resizeTimer;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return; // ignore mobile toolbar show/hide
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const season = seasons.find((s) => tabs.querySelector('[aria-current="true"]')?.dataset.season == s.season);
    if (season?.summary.played) drawCharts(season);
  }, 150);
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => seasons.length && route());

function summarySection({ season, summary: s, status }) {
  const finished = status === 'finished';
  return `<section class="summary">
    <div>
      <div class="hero-figure">${fmt(s.generalPoints)}</div>
      <p class="hero-label">general standings points ${finished ? 'in' : 'so far in'} Season ${season}</p>
    </div>
    <dl class="figures">
      <div><dt>Nights played</dt><dd>${s.played}</dd></div>
      <div><dt>Wins</dt><dd>${s.wins}</dd></div>
      <div><dt>Average place</dt><dd>${fmt(s.avgPlace, 1)}</dd></div>
      <div><dt>Average per night</dt><dd>${fmt(s.avgGeneralPoints, 1)}</dd></div>
      <div><dt>Points from cheats</dt><dd>${fmt(s.cheatBenefit)}</dd></div>
    </dl>
  </section>`;
}

function jokerSentence(s) {
  if (!s.jokersPlayed) return 'The dot is the average score, the line runs from the worst to the best night.';
  return `The dot is the average. ${s.jokersOnBest} of our ${s.jokersPlayed} joker${s.jokersPlayed === 1 ? '' : 's'} went on the best round of the night, `
    + `earning ${fmt(s.jokerPoints)} of a possible ${fmt(s.jokerPoints + s.jokerLoss)} points.`;
}

// Scoresheet -------------------------------------------------------------
function gridSection(season) {
  const head = ROUNDS.map((r) => `<th class="round" scope="col">R${r.n}<span>${r.weekly ? 'weekly' : esc(r.name)}</span></th>`).join('');
  const rows = season.nights.map((n, i) => nightRow(n, i, season.players)).join('');
  const swatches = rampSwatches().map((c) => `<i style="background:${c}"></i>`).join('');
  return `<section class="section" id="nights" data-jump="Nights">
    <div class="section-head">
      <h2>Night by night</h2>
      <p>Each square is one round, scored out of ${MAX_ROUND_SCORE}. Select a night to see how its total was worked out.</p>
    </div>
    <div class="panel sheet-scroll desk-only">
      <table class="sheet">
        <thead><tr>
          <th scope="col" class="night-cell">Night</th>${head}
          <th class="total" scope="col">Quiz night</th><th class="total" scope="col">Standings</th><th class="total" scope="col">Place</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <ol class="night-cards mob-only">${season.nights.map((n, i) => nightCard(n, i, season.players)).join('')}</ol>
    <div class="legend-row">
      <span>5 or less<span class="ramp" aria-hidden="true">${swatches}</span>11</span>
      <span><span class="key-joker" aria-hidden="true">J</span>joker round, counted twice</span>
    </div>
  </section>`;
}

// Gold, silver and bronze for the top three places; any other place is plain text.
const MEDALS = { 1: 'gold', 2: 'silver', 3: 'bronze' };
const placeBadge = (place) => `<span class="place${MEDALS[place] ? ` medal ${MEDALS[place]}` : ''}">${ordinal(place)}</span>`;

function nightRow(n, i, players) {
  const chips = n.cheats.map((c) => `<span class="chip">${esc(CHEATS[c].name)}</span>`).join('');
  let cells;
  if (n.afk) {
    cells = `<td class="no-rounds" colspan="8">Skipped with AFK, scored the season average</td>`;
  } else if (!n.hasRounds) {
    cells = `<td class="no-rounds" colspan="8">Only the final total was recorded</td>`;
  } else {
    cells = n.rounds.map((s, r) => {
      const { bg, fg } = scoreColor(s);
      const joker = n.joker === r + 1;
      return `<td class="score${joker ? ' joker' : ''}" data-night="${i}" data-round="${r}" style="background:${bg};color:${fg}">${fmt(s)}</td>`;
    }).join('');
  }
  const boost = n.generalPoints - n.nightPoints;
  const place = n.place ? placeBadge(n.place) : '<span class="muted">–</span>';
  return `<tr data-row="${i}">
      <th scope="row" class="night-cell">
        <button type="button" class="night-btn" aria-expanded="false" aria-controls="detail-${i}">
          <strong>${esc(n.id)}<span class="chev" aria-hidden="true">›</span></strong>
          <span class="theme">${n.theme ? esc(n.theme) : '<span class="muted">Theme not recorded</span>'}</span>
        </button>
        ${chips ? `<div class="chips">${chips}</div>` : ''}
      </th>
      ${cells}
      <td class="total-cell">${fmt(n.nightPoints)}</td>
      <td class="total-cell"><b>${fmt(n.generalPoints)}</b>${boost > 0 ? `<span class="boost">${signed(boost)}</span>` : ''}</td>
      <td class="total-cell">${place}</td>
    </tr>
    <tr class="detail-row" id="detail-${i}" hidden><td colspan="12">${detail(n, players)}</td></tr>`;
}

// Phone layout: one card per night, rounds as a 4×2 grid so nothing scrolls sideways.
function nightCard(n, i, players) {
  const chips = n.cheats.map((c) => `<span class="chip">${esc(CHEATS[c].name)}</span>`).join('');
  let squares;
  if (n.afk) squares = '<p class="no-rounds card-note">Skipped with AFK, scored the season average</p>';
  else if (!n.hasRounds) squares = '<p class="no-rounds card-note">Only the final total was recorded</p>';
  else {
    squares = `<ol class="card-rounds">${n.rounds.map((s, r) => {
      const { bg, fg } = scoreColor(s);
      const joker = n.joker === r + 1;
      return `<li class="score${joker ? ' joker' : ''}" style="background:${bg};color:${fg}" aria-label="Round ${r + 1}: ${fmt(s)}${joker ? ', joker' : ''}">
          <span class="rn">R${r + 1}</span>${fmt(s)}</li>`;
    }).join('')}</ol>`;
  }
  const boost = n.generalPoints - n.nightPoints;
  const place = n.place ? placeBadge(n.place) : '';
  return `<li class="night-card${MEDALS[n.place] ? ` medal-${MEDALS[n.place]}` : ''}">
      <div class="card-head">
        <div><strong>${esc(n.id)}</strong>
          <span class="theme">${n.theme ? esc(n.theme) : '<span class="muted">Theme not recorded</span>'}</span></div>
        ${place}
      </div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      ${squares}
      <dl class="card-totals">
        <div><dt>Quiz night</dt><dd>${fmt(n.nightPoints)}</dd></div>
        <div><dt>Standings</dt><dd>${fmt(n.generalPoints)}${boost > 0 ? ` <span class="boost">${signed(boost)}</span>` : ''}</dd></div>
      </dl>
      <button type="button" class="night-btn card-toggle" aria-expanded="false" aria-controls="mdetail-${i}">
        <span class="when-closed">Show details</span><span class="when-open">Hide details</span><span class="chev" aria-hidden="true">›</span>
      </button>
      <div id="mdetail-${i}" class="card-detail" hidden>${detail(n, players, true)}</div>
    </li>`;
}

function detail(n, players, compact = false) {
  const facts = [
    n.date && ['Date', esc(n.date)],
    n.teamSize && ['Team size', n.teamSize],
    n.place && ['Place', ordinal(n.place)],
  ].filter(Boolean);
  const who = Array.isArray(n.attendees)
    ? `<div><h4>Who went</h4><p>${n.attendees.map(esc).join(', ')}${n.guests ? `, plus ${n.guests} guest${n.guests === 1 ? '' : 's'}` : ''}</p></div>`
    : '';
  const beerEntries = Object.entries(n.beers ?? {}).filter(([, d]) => d && Object.keys(d).length);
  const beerTypeNote = n.beerTypes
    ? `<p class="secondary small">Known for the whole night: ${esc(Object.entries(n.beerTypes).map(([k, c]) => `${fmt(c)} ${k.trim()}`).join(', '))}. Who drank which wasn't recorded.</p>`
    : '';
  const beers = beerEntries.length
    ? `<div><h4>Beers</h4>${beerTypeNote}<ul>${beerEntries.map(([name, d]) => {
        const total = Object.values(d).reduce((a, c) => a + c, 0);
        const keys = Object.keys(d);
        const detail = keys.length === 1 && keys[0].trim().toLowerCase() === 'unknown'
          ? 'type not recorded'
          : esc(Object.entries(d).map(([k, c]) => `${fmt(c)} ${k.trim()}`).join(', '));
        return `<li><span>${esc(name)} <span class="secondary small">${detail}</span></span><span class="num">${fmt(total)}</span></li>`;
      }).join('')}</ul></div>`
    : beerTypeNote ? `<div><h4>Beers</h4>${beerTypeNote}</div>` : '';
  const factsList = (facts.length ? `<div><h4>The night</h4><ul>${facts.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('')}</ul></div>` : '') + who + beers;

  if (n.afk) return `<div class="detail">${factsList}<div><h4>Score</h4><p>We used AFK, so this night scores the average of all our other nights: ${fmt(n.nightPoints)} on the night and ${fmt(n.generalPoints)} in the standings.</p></div></div>`;
  if (!n.hasRounds) return `<div class="detail">${factsList}<div><h4>Score</h4><p>Only the final total of ${fmt(n.nightPoints)} was recorded for this night, so there is no round breakdown.</p></div></div>`;

  const topics = ROUNDS.filter((r) => r.weekly).map((r) => [`Round ${r.n}`, esc(n.topics?.[r.n] ?? '–')]);
  const nightLines = [
    ['Round scores', fmt(n.base)],
    n.joker && [`Joker on round ${n.joker}`, signed(n.jokerScore)],
    n.deduction && [`Team of ${n.teamSize}`, signed(-n.deduction)],
  ].filter(Boolean);
  const standingLines = [
    ['Quiz-night points', fmt(n.nightPoints)],
    n.reinforcementsRelief && [
      n.reinforcementsRelief < n.deduction ? `Reinforcements, ${fmt(n.reinforcementsRelief)} of ${fmt(n.deduction)} back` : 'Reinforcements, deduction back',
      signed(n.reinforcementsRelief),
    ],
    n.tripleExtra && ['Triple joker, joker round again', signed(n.tripleExtra)],
    n.noYouExtra && ['No, you, best minus worst round', signed(n.noYouExtra)],
  ].filter(Boolean);
  const list = (title, lines, total, totalLabel) => `<div><h4>${title}</h4><ul>
      ${lines.map(([k, v]) => `<li><span>${k}</span><span class="num">${v}</span></li>`).join('')}
      <li class="sum"><span>${totalLabel}</span><span class="num">${fmt(total)}</span></li></ul></div>`;
  return `<div class="detail">
    ${list('On the night', nightLines, n.nightPoints, 'Quiz-night points')}
    ${list('General standings', standingLines, n.generalPoints, 'Standings points')}
    <div><h4>Weekly topics</h4><ul>${topics.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('')}</ul></div>
    ${factsList}
    ${compact ? nightPersonalList(n, players) : nightPersonalTable(n, players)}
  </div>`;
}

function wireGrid(season) {
  app.querySelectorAll('.night-btn').forEach((btn) => btn.addEventListener('click', () => {
    const row = btn.closest('tr, .night-card');
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', open);
    row.classList.toggle('open', open);
    document.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
  }));
  app.querySelectorAll('td.score').forEach((td) => {
    const n = season.nights[td.dataset.night];
    const r = ROUNDS[td.dataset.round];
    const s = n.rounds[td.dataset.round];
    const topic = r.weekly ? n.topics?.[r.n] : null;
    const notes = [
      n.joker === r.n && 'Joker round, counted twice',
      s === n.best && 'Our best round of the night',
      s === n.worst && n.best !== n.worst && 'Our worst round of the night',
    ].filter(Boolean);
    bindTip(td, `<strong>${esc(n.id)}, round ${r.n}</strong>
      <div class="secondary">${esc(topic ?? r.name)}</div>
      <div class="row"><span>Score</span><b>${fmt(s)} of ${MAX_ROUND_SCORE}</b></div>
      ${notes.map((x) => `<div>${x}</div>`).join('')}`);
  });
}

// Personal standings -----------------------------------------------------
const pointsText = (x) => (x > 0 ? `+${fmt(x)}` : x < 0 ? `−${fmt(-x)}` : '0');
const countsText = (counts) => Object.entries(counts)
  .filter(([, v]) => v)
  .map(([k, v]) => `${PERSONAL[k].name} ${fmt(v)}`)
  .join(', ');
const scaleText = Object.values(PERSONAL).map((c) => `${c.name} ${pointsText(c.points)}`).join(', ');

function moveMark(move) {
  if (move == null) return '';
  if (move === 0) return '<span class="muted" aria-label="no change">–</span>';
  const up = move > 0;
  return `<span class="${up ? 'up' : 'down'}" aria-label="${up ? 'up' : 'down'} ${Math.abs(move)}">${up ? '▲' : '▼'}${Math.abs(move)}</span>`;
}
const moveCell = (move) => `<td class="move">${moveMark(move)}</td>`;

function formMarks(form) {
  if (!form.length) return '<span class="muted">–</span>';
  return form.map((f) => {
    const kind = f.points > 0 ? 'pos' : f.points < 0 ? 'neg' : 'zero';
    const sym = f.points > 0 ? '+' : f.points < 0 ? '−' : '0';
    return `<span class="form-chip ${kind}" title="${esc(f.id)}: ${pointsText(f.points)}" aria-label="${esc(f.id)} ${pointsText(f.points)}">${sym}</span>`;
  }).join('');
}
const formCell = (form) => `<td class="form">${formMarks(form)}</td>`;

// Gold, silver and bronze for the top three positions (shared on a tie), once they have points.
const rankMark = (p, started) => {
  if (!started) return '<span class="muted">–</span>';
  const medal = p.points > 0 ? MEDALS[p.rank] : null;
  return medal ? `<span class="medal rank-medal ${medal}" aria-label="${ordinal(p.rank)}">${p.rank}</span>` : p.rank;
};

// Phone layout for one league row: position, name and points up top, the breakdown below.
function leagueCard(p, started) {
  const move = started ? moveMark(p.move) : '';
  const form = formMarks(p.form);
  const stat = (label, value) => `<span><span class="muted">${label}</span> ${value}</span>`;
  return `<li class="league-card">
      <span class="lc-rank num">${rankMark(p, started)}</span>
      <span class="lc-move">${move}</span>
      <span class="lc-name">${esc(p.name)}</span>
      <span class="lc-pts num">${started ? fmt(p.points) : '–'}<small>pts</small></span>
      <span class="lc-stats">
        ${stat('P', p.played)}
        ${started ? [
          stat('CI', fmt(p.counts.ci)),
          stat('Save', fmt(p.counts.save)),
          stat('Lach', fmt(p.counts.lacheala)),
          stat('Duels', `${fmt(p.counts.duelWon)}-${fmt(p.counts.duelLost)}`),
        ].join('') : ''}
      </span>
      ${started ? `<span class="lc-form">${form}${p.perNight != null ? `<span class="muted">${fmt(p.perNight)} per night</span>` : ''}</span>` : ''}
    </li>`;
}

function personalSection(season) {
  const { rows, nights } = season.personal;
  const started = nights > 0;
  const dash = '<span class="muted">–</span>';
  const body = rows.map((p) => `<tr>
      <td class="rank num">${rankMark(p, started)}</td>
      ${started ? moveCell(p.move) : '<td class="move"></td>'}
      <th scope="row" class="att-name">${esc(p.name)}</th>
      <td class="num c">${p.played}</td>
      <td class="num c">${started ? fmt(p.counts.ci) : dash}</td>
      <td class="num c">${started ? fmt(p.counts.save) : dash}</td>
      <td class="num c">${started ? fmt(p.counts.lacheala) : dash}</td>
      <td class="num c">${started ? `${fmt(p.counts.duelWon)}-${fmt(p.counts.duelLost)}` : dash}</td>
      ${formCell(p.form)}
      <td class="num pts">${started ? fmt(p.points) : dash}</td>
      <td class="num c secondary">${started && p.perNight != null ? fmt(p.perNight) : dash}</td>
    </tr>`).join('');
  return `<section class="section" id="standings" data-jump="Standings">
    <div class="section-head">
      <h2>Personal standings</h2>
      <p>${started
        ? `After ${nights} night${nights === 1 ? '' : 's'} with personal points. ${scaleText}.`
        : `No personal points recorded yet. ${scaleText}.`}</p>
    </div>
    <ol class="league-cards panel mob-only">${rows.map((p) => leagueCard(p, started)).join('')}</ol>
    <div class="panel sheet-scroll fit desk-only">
      <table class="sheet league">
        <thead><tr>
          <th scope="col" class="rank" title="Position">#</th>
          <th scope="col" class="move"><span class="sr-only">Change since last night</span></th>
          <th scope="col" class="att-name">Player</th>
          <th scope="col" class="c" title="Nights attended">P</th>
          <th scope="col" class="c" title="${esc(PERSONAL.ci.long)}">CI</th>
          <th scope="col" class="c">Save</th>
          <th scope="col" class="c">Lach</th>
          <th scope="col" class="c" title="Duels won-lost">Duels</th>
          <th scope="col" class="form" title="Last 5 nights">Form</th>
          <th scope="col" class="pts">Pts</th>
          <th scope="col" class="c" title="Points per night attended">/night</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${started && nights > 1 ? raceSection(season) : ''}
  </section>${started ? byRoundSection(season) : ''}`;
}

// Stats ------------------------------------------------------------------
const pct = (x) => `${Math.round(x * 100)}%`;
const statPanel = (title, sub, body) => `<div class="panel stat-panel">
    <h3>${title}</h3>
    <p class="sub">${sub}</p>
    ${body}
  </div>`;
const statTable = (head, rows) => `<div class="sheet-scroll"><table class="stat-table">
    <thead><tr>${head.map(([label, cls = '']) => `<th scope="col" class="${cls}">${label}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table></div>`;

function statsSection(season) {
  const panels = [];

  const spec = specialists(season);
  if (spec.length) {
    panels.push(statPanel('Specialists', 'Each person’s strongest round, and their share of the team’s CIs.', statTable(
      [['Player'], ['Best round'], ['Share of CIs', 'share']],
      spec.map((s) => {
        const round = s.best
          ? `R${s.best.round} ${s.best.weekly && s.best.topics?.length ? esc(s.best.topics.join(', ')) : esc(s.best.name)} <span class="secondary">${pointsText(s.best.points)}</span>`
          : '<span class="muted">–</span>';
        return `<tr><th scope="row">${esc(s.name)}</th><td>${round}</td>
          <td class="share"><span class="bar"><i style="width:${((s.ciShare ?? 0) * 100).toFixed(1)}%"></i></span><span class="num">${s.ciShare != null ? pct(s.ciShare) : '–'}</span></td></tr>`;
      }),
    )));
  }

  const size = teamSize(season);
  if (size.groups.length) {
    let line = '';
    if (size.small && size.big) {
      const before = size.big.raw - size.small.raw;
      const after = size.big.onNight - size.small.onNight;
      line = `<p class="stat-line">Teams of 7 or more scored <b>${signed(tidyNum(before))}</b> points a night before the deduction, and <b>${signed(tidyNum(after))}</b> after it, compared with teams of 6 or fewer.</p>`;
    }
    panels.push(statPanel('Team size vs score', '“Raw” is the score before the big-team deduction.', `${line}${statTable(
      [['People'], ['Nights', 'c'], ['Raw', 'r'], ['On the night', 'r'], ['Wins', 'c']],
      size.groups.map((g) => `<tr><th scope="row">${g.size}</th><td class="c num">${g.nights}</td><td class="r num">${fmt(g.raw)}</td><td class="r num">${fmt(g.onNight)}</td><td class="c num">${g.wins}</td></tr>`),
    )}`));
  }

  const pairs = partnerships(season);
  if (pairs.length) {
    panels.push(statPanel('Partnerships', 'The pairs who’ve been to the most quizzes together, and how the team did.', statTable(
      [['Pair'], ['Nights', 'c'], ['Wins', 'c'], ['Avg place', 'c opt'], ['Avg score', 'r']],
      pairs.map((p) => `<tr><th scope="row">${esc(p.a)} &amp; ${esc(p.b)}</th><td class="c num">${p.nights}</td><td class="c num">${p.wins}</td>
        <td class="c num opt">${p.avgPlace != null ? fmt(p.avgPlace, 1) : '–'}</td><td class="r num">${fmt(p.avg, 1)}</td></tr>`),
    )));
  }

  const bb = beersVsBrains(season);
  if (bb.rows.length) {
    let line = '';
    if (bb.team.length > 1) {
      const most = [...bb.team].sort((a, b) => b.beers - a.beers)[0];
      const fewest = [...bb.team].sort((a, b) => a.beers - b.beers)[0];
      const night = (n) => `${esc(n.id)} (${fmt(n.beers)} beers): ${fmt(n.score)} points${n.place ? `, ${ordinal(n.place)}` : ''}`;
      line = `<p class="stat-line">Most beers: ${night(most)}. Fewest: ${night(fewest)}.</p>`;
    }
    panels.push(statPanel('Beers vs brains', `Personal points per beer, over the ${bb.nights} night${bb.nights === 1 ? '' : 's'} with beers logged.`, `${line}${statTable(
      [['Player'], ['Beers', 'c'], ['Points', 'c'], ['Per beer', 'r']],
      bb.rows.map((r) => `<tr><th scope="row">${esc(r.name)}</th><td class="c num">${fmt(r.beers)}</td><td class="c num">${fmt(r.points)}</td><td class="r num"><b>${fmt(r.perBeer, 2)}</b></td></tr>`),
    )}`));
  }

  const st = streaks(season);
  if (st.length) {
    const run = (cur, best) => `${cur}${best > cur ? ` <span class="secondary">(best ${best})</span>` : ''}`;
    panels.push(statPanel('Streaks', 'Current runs, with the season best in brackets when it was longer.', statTable(
      [['Player'], ['Quizzes in a row', 'c'], ['Scoring in a row', 'c'], ['Since a lacheala', 'c']],
      st.map((s) => `<tr><th scope="row">${esc(s.name)}</th><td class="c num">${run(s.currentAttend, s.longestAttend)}</td>
        <td class="c num">${run(s.currentScoring, s.longestScoring)}</td>
        <td class="c">${s.sinceLacheala == null ? '<span class="secondary">Never</span>' : `${s.sinceLacheala} quiz${s.sinceLacheala === 1 ? '' : 'zes'}`}</td></tr>`),
    )));
  }

  const j = jokers(season);
  if (j.played) {
    const prev = seasons.find((s) => s.season === season.season - 1 && s.summary.jokersPlayed);
    const fav = j.favourite;
    const favLine = fav && fav.count === j.played && j.played > 1
      ? `Every joker this season went on round ${fav.round}.`
      : fav && fav.count > 1 ? `Favourite round: ${fav.round} (${fav.count} of ${j.played}).` : '';
    const chips = j.nights.map((n) => `<li class="joker-chip ${n.hit ? 'hit' : 'miss'}">
        <span class="jc-id">${esc(shortId(n.id))}</span>
        <span class="jc-round">R${n.round}</span>
        <span class="jc-score num">${fmt(n.score)}/${fmt(n.best)}</span>
        <span class="jc-mark">${n.hit ? '✓ best' : `✗ ${signed(n.score - n.best)}`}</span>
      </li>`).join('');
    panels.push(statPanel('Joker accuracy', 'Did the joker go on our best round of the night?', `
      <div class="joker-figures">
        <div><span class="jf-value">${j.onBest} of ${j.played}</span><span class="jf-label">on the best round</span></div>
        <div><span class="jf-value">${j.efficiency != null ? pct(j.efficiency) : '–'}</span><span class="jf-label">of the possible joker points</span></div>
        ${prev ? `<div><span class="jf-value secondary">${prev.summary.jokersOnBest} of ${prev.summary.jokersPlayed}</span><span class="jf-label">in Season ${prev.season} (${pct(prev.summary.jokerEfficiency)})</span></div>` : ''}
      </div>
      ${favLine ? `<p class="stat-line">${favLine}</p>` : ''}
      <ol class="joker-chips">${chips}</ol>`));
  }

  if (!panels.length) return '';
  return `<section class="section" id="stats" data-jump="Stats">
    <div class="section-head">
      <h2>Stats</h2>
      <p>A few numbers to argue about at the table.</p>
    </div>
    <div class="stat-grid">${panels.join('')}</div>
  </section>`;
}

const tidyNum = (x) => Math.round(x * 100) / 100;

// Running personal points per quiz. The current top five get colour; everyone else is grey.
function raceSection(season) {
  const top = raceTop(race(season));
  const legend = top.map((s, i) => `<span><i style="background:var(${RACE_COLOURS[i]})"></i>${esc(s.name)}</span>`).join('');
  return `<div class="panel chart race" id="race-chart">
      <h3>The race</h3>
      <p class="sub">Running personal points after each quiz. The top five are in colour; hover or tap a quiz to see everyone.</p>
      <div class="legend">${legend}<span><i style="background:var(--axis)"></i>Everyone else</span></div>
    </div>`;
}

// Players × rounds: who carries which round. Diverging tint: blue up, red down.
function tint(v, max) {
  if (!v || !max) return '';
  const pct = Math.round(12 + 43 * Math.min(1, Math.abs(v) / max));
  return `background: color-mix(in srgb, var(${v > 0 ? '--series-1' : '--neg'}) ${pct}%, transparent)`;
}

// One players × rounds table. Each row: { name, byRound: {1..8: points}, unassigned, points,
// counts?, cellCounts?: {round: counts} }. With `detail`, a last column says what each person did.
function matrixTable(rows, max, { detail = false } = {}) {
  const head = ROUNDS.map((r) => `<th class="round" scope="col">R${r.n}<span>${r.weekly ? 'weekly' : esc(r.name)}</span></th>`).join('');
  // Points logged for a whole night (no round given) get their own column, only when there are any.
  const hasUnassigned = rows.some((p) => p.unassigned);
  const cell = (name, label, v, counts) => {
    const what = counts ? countsText(counts) : '';
    return `<td class="pcell num" style="${tint(v, max)}" title="${esc(name)}, ${label}: ${pointsText(v)}${what ? ` (${esc(what)})` : ''}">${v ? pointsText(v) : '<span class="muted">·</span>'}</td>`;
  };
  const body = rows.map((p) => `<tr>
      <th scope="row" class="att-name">${esc(p.name)}</th>
      ${ROUNDS.map((r) => cell(p.name, `round ${r.n}`, p.byRound[r.n], p.cellCounts?.[r.n])).join('')}
      ${hasUnassigned ? cell(p.name, 'round not recorded', p.unassigned, p.cellCounts?.night) : ''}
      <td class="total-cell"><b>${detail ? pointsText(p.points) : fmt(p.points)}</b></td>
      ${detail ? `<td class="what secondary">${esc(countsText(p.counts)) || '<span class="muted">–</span>'}</td>` : ''}
    </tr>`).join('');
  const table = `<table class="sheet attendance byround${detail ? ' with-what' : ''}">
      <thead><tr><th scope="col" class="att-name">Player</th>${head}${hasUnassigned ? '<th class="round" scope="col" title="Round not recorded">?<span>no round</span></th>' : ''}<th class="total" scope="col">${detail ? 'Night' : 'Total'}</th>${detail ? '<th scope="col" class="what">What they did</th>' : ''}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  return { table, hasUnassigned };
}

// A night's matrix rows: everyone who went, best night first, in season order on ties.
function nightMatrixRows(n, players) {
  return (players ?? [])
    .filter((p) => n.attendees?.includes(p))
    .map((name, order) => {
      const p = nightPersonal(n, name);
      const byRound = {};
      const cellCounts = {};
      for (const [r, c] of Object.entries(p.byRound)) { byRound[r] = c.points; cellCounts[r] = c.counts; }
      return { name, order, byRound, unassigned: byRound.night ?? 0, cellCounts, counts: p.counts, points: p.points };
    })
    .sort((a, b) => b.points - a.points || a.order - b.order);
}

function byRoundSection(season) {
  const seasonRows = season.personal.rows.filter((p) => p.played);
  const seasonMax = Math.max(...seasonRows.flatMap((p) => Object.values(p.byRound).map(Math.abs)), 0);
  const seasonView = matrixTable(seasonRows, seasonMax);

  // One view per night with personal points. They share a colour scale, so a dark cell means
  // the same thing on every quiz.
  const nights = season.nights.filter((n) => n.played && n.personal && Object.keys(n.personal).length);
  const nightRows = nights.map((n) => nightMatrixRows(n, season.players));
  const nightMax = Math.max(...nightRows.flat().flatMap((p) => Object.values(p.byRound).map(Math.abs)), 0);
  const views = [
    { id: 'season', label: 'Season', html: seasonView.table,
      note: `Season totals for each round.${seasonView.hasUnassigned ? ' “?” is points from nights where the round wasn’t recorded.' : ''}` },
    ...nights.map((n, i) => {
      const v = matrixTable(nightRows[i], nightMax, { detail: true });
      const total = nightRows[i].reduce((a, p) => a + p.points, 0);
      return {
        id: `n${i}`, label: n.id, html: v.table,
        head: `<div class="matrix-head"><strong>${esc(n.id)}</strong>${n.theme ? `<span class="secondary">${esc(n.theme)}</span>` : ''}${n.place ? placeBadge(n.place) : ''}<span class="matrix-total secondary">${pointsText(total)} personal points in total</span></div>`,
        note: `Everyone who went to ${esc(n.id)}.${v.hasUnassigned ? ' “?” is points where the round wasn’t recorded.' : ''}`,
      };
    }),
  ];
  const tabs = views.map((v, i) => `<button type="button" role="tab" id="mtab-${v.id}" aria-controls="mview-${v.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(v.label)}</button>`).join('');
  const panels = views.map((v, i) => `<div role="tabpanel" id="mview-${v.id}" aria-labelledby="mtab-${v.id}" class="matrix-view"${i === 0 ? '' : ' hidden'}>
      ${v.head ?? ''}
      <div class="panel sheet-scroll fit">${v.html}</div>
      <p class="matrix-note secondary">${v.note}</p>
    </div>`).join('');
  return `<section class="section" id="matrix" data-jump="By round">
    <div class="section-head">
      <h2>Personal points by round</h2>
      <p>Blue is a net gain, red a net loss. Pick a quiz to see that night on its own.</p>
    </div>
    ${views.length > 1 ? `<div class="matrix-tabs" role="tablist" aria-label="Season or a single quiz">${tabs}</div>` : ''}
    ${panels}
  </section>`;
}

function wireMatrix() {
  const list = app.querySelector('.matrix-tabs');
  if (!list) return;
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next == null) return;
      e.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      select(target);
      target.focus();
    });
  });
}

// Phone version of the night's personal points: one line per player.
function nightPersonalList(n, players) {
  if (!n.personal || !Object.keys(n.personal).length) return '';
  const rows = (players ?? []).filter((p) => n.attendees?.includes(p)).map((name) => ({ name, ...nightPersonal(n, name) }));
  return `<div class="detail-wide"><h4>Personal points</h4><ul class="plist">${rows.map((p) => {
    const rounds = Object.entries(p.byRound).map(([r, c]) => `${r === 'night' ? 'round not recorded' : `R${r}`} ${pointsText(c.points)}`).join(', ');
    return `<li><span class="pl-name">${esc(p.name)}</span><b class="num">${pointsText(p.points)}</b>
      <span class="pl-sub secondary">${rounds ? `${esc(countsText(p.counts))} (${rounds})` : 'Nothing this night'}</span></li>`;
  }).join('')}</ul></div>`;
}

// One night's personal points, player by round, shown inside the night breakdown.
function nightPersonalTable(n, players) {
  if (!n.personal || !Object.keys(n.personal).length) return '';
  const people = (players ?? []).filter((p) => n.attendees?.includes(p));
  const rows = people.map((name) => ({ name, ...nightPersonal(n, name) }));
  const max = Math.max(...rows.flatMap((p) => Object.values(p.byRound).map((x) => Math.abs(x.points))), 0);
  const body = rows.map((p) => `<tr>
      <th scope="row">${esc(p.name)}</th>
      ${ROUNDS.map((r) => {
        const cell = p.byRound[r.n];
        if (!cell) return '<td class="pcell"><span class="muted">·</span></td>';
        return `<td class="pcell num" style="${tint(cell.points, max)}" title="${esc(countsText(cell.counts))}">${pointsText(cell.points)}</td>`;
      }).join('')}
      <td class="total-cell"><b>${pointsText(p.points)}</b></td>
      <td class="secondary small">${esc(countsText(p.counts)) || '–'}</td>
    </tr>`).join('');
  const noRounds = 'night' in n.personal;
  return `<div class="detail-wide"><h4>Personal points</h4>
    ${noRounds ? '<p class="secondary small">Some points for this night weren’t recorded by round, so they only show in the night total.</p>' : ''}
    <div class="sheet-scroll"><table class="mini">
      <thead><tr><th></th>${ROUNDS.map((r) => `<th scope="col">R${r.n}</th>`).join('')}<th scope="col" class="r">Night</th><th></th></tr></thead>
      <tbody>${body}</tbody>
    </table></div></div>`;
}

// BeerTracker ------------------------------------------------------------
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// "Marc on Quiz 1", or "Iakkel, Marc and Muri on Quiz 1", or "Ana on Quiz 1 and Bogdan on Quiz 2".
function recordText(holders) {
  const nights = [...new Set(holders.map((h) => h.night))];
  if (nights.length === 1) return `${andList(holders.map((h) => esc(h.player)))} on ${esc(nights[0])}`;
  return andList(holders.map((h) => `${esc(h.player)} on ${esc(h.night)}`));
}

function beerSection(season) {
  const b = season.beers;
  const head = `<div class="section-head">
      <h2>BeerTracker</h2>
      <p>${b.nights ? `How many we drank, over ${b.nights} night${b.nights === 1 ? '' : 's'}.` : 'How many we drank.'}</p>
    </div>`;
  if (!b.nights) {
    return `<section class="section" id="beers" data-jump="Beers">${head}<p class="secondary">No beers logged yet this season.</p></section>`;
  }
  // Skip people who weren't at any night where beers were written down.
  const board = b.rows.filter((p) => p.nightsLogged || p.total).map((p) => `<tr>
      <td class="rank num">${p.rank}</td>
      <th scope="row" class="beer-name">${esc(p.name)}</th>
      <td class="num pts">${fmt(p.total)}</td>
      <td class="num c secondary">${p.perNight != null ? fmt(p.perNight, 1) : '–'}</td>
    </tr>`).join('');
  return `<section class="section" id="beers" data-jump="Beers">
    ${head}
    <dl class="figures beer-figures">
      <div><dt>Beers this season</dt><dd>${fmt(b.total)}</dd></div>
      <div><dt>Per night, whole team</dt><dd>${fmt(b.perNight, 1)}</dd></div>
      ${b.record ? `<div><dt>Most in one night</dt><dd>${fmt(b.record.count)} <span class="dd-sub">${recordText(b.record.holders)}</span></dd></div>` : ''}
    </dl>
    <div class="panel beer-board">
      <table class="sheet league beer-table">
        <thead><tr><th scope="col" class="rank">#</th><th scope="col">Player</th><th scope="col" class="pts">Beers</th><th scope="col" class="c" title="Per night attended">/night</th></tr></thead>
        <tbody>${board}</tbody>
      </table>
    </div>
  </section>`;
}

// Attendance -------------------------------------------------------------
function attendanceSection(season) {
  const nights = season.nights.filter((n) => n.played);
  const { rows, tracked } = season.attendance;
  const head = nights.map((n) => `<th scope="col" class="att-night" title="${esc(n.theme ?? n.id)}">${esc(shortId(n.id))}</th>`).join('');
  const body = rows.map((p) => {
    const cells = nights.map((n) => {
      if (!Array.isArray(n.attendees)) return '<td class="att"><span class="muted" title="Not recorded">–</span></td>';
      const went = n.attendees.includes(p.name);
      return `<td class="att"><span class="att-mark${went ? ' went' : ''}" role="img" aria-label="${went ? 'went' : 'missed'}" title="${esc(p.name)} ${went ? 'went to' : 'missed'} ${esc(n.id)}"></span></td>`;
    }).join('');
    return `<tr><th scope="row" class="att-name">${esc(p.name)}</th>${cells}<td class="total-cell">${p.count} of ${tracked}</td></tr>`;
  }).join('');
  const guests = nights.reduce((a, n) => a + (n.guests ?? 0), 0);
  return `<section class="section" id="attendance" data-jump="Who went">
    <div class="section-head">
      <h2>Who went</h2>
      <p>Not all of us make every quiz.${guests ? ` Guests came along ${guests} time${guests === 1 ? '' : 's'} this season.` : ''}</p>
    </div>
    <div class="panel sheet-scroll fit">
      <table class="sheet attendance">
        <thead><tr><th scope="col" class="att-name">Player</th>${head}<th class="total" scope="col">Nights</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

// Cheats -----------------------------------------------------------------
function cheatsSection(season) {
  const finished = season.status === 'finished';
  const items = Object.entries(CHEATS).map(([key, c]) => {
    const used = season.nights.filter((n) => n.cheats.includes(key));
    let status;
    if (!used.length) {
      status = `<p class="status unused">${finished ? 'Not used this season' : 'Still available'}</p>`;
    } else {
      status = used.map((n) => {
        const gain = key === 'afk' ? n.generalPoints : key === 'tripleJoker' ? n.tripleExtra : key === 'noYou' ? n.noYouExtra : n.reinforcementsRelief;
        const label = key === 'afk' ? `${fmt(gain)} points without playing` : `<span class="gain">${signed(gain)}</span> standings points`;
        return `<p class="status">Used on ${esc(n.id)}: ${label}</p>`;
      }).join('');
    }
    return `<div class="cheat"><h3>${esc(c.name)}</h3><p class="rule">${esc(c.rule)}</p>${status}</div>`;
  }).join('');
  return `<section class="section" id="cheats" data-jump="Cheats">
    <div class="section-head">
      <h2>Season cheats</h2>
      <p>Each cheat can be played once a season.</p>
    </div>
    <div class="panel cheats">${items}</div>
  </section>`;
}

// Rules (footer) ---------------------------------------------------------
function renderRules() {
  const ded = [7, 8, 9, 10].map((s) => `${s} people: −${teamSizeDeduction(s)}`).join(', ');
  const rows = [
    ['Rounds', `Eight rounds a night, each out of ${MAX_ROUND_SCORE}. Rounds 4, 5 and 7 change topic every week.`],
    ['Joker', 'One round a night is jokered and counts twice.'],
    ['Team size', `Teams of up to 6 lose nothing. Bigger teams lose points on the night (${ded}). Teams are capped at 10.`],
    ...Object.values(CHEATS).map((c) => [c.name, c.rule]),
    ...Object.values(PERSONAL).map((c) => [`${c.long} (${pointsText(c.points)})`, `Personal standings. ${c.rule}`]),
    ['Red questions', 'A red question is worth double, so a CI, save or other entry on one counts as 2.'],
    ['Quiz-night vs standings', 'Quiz-night points are the score on the night. General standings points add the season cheats on top.'],
    ['Old nights', 'Some early nights only have a final total recorded. That total is used for both scores.'],
  ];
  document.getElementById('rules').innerHTML = `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

load();
