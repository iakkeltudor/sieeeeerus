import { ROUNDS, CHEATS, PERSONAL, MAX_ROUND_SCORE, scoreSeason, validateNight, teamSizeDeduction, nightPersonal } from './scoring.js';
import { fmt, ordinal, shortId, pointsChart, roundsChart, scoreColor, rampSwatches, bindTip, hideTip } from './charts.js';

const app = document.getElementById('app');
const tabs = document.getElementById('season-tabs');
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
    return;
  }

  parts.push(summarySection(season));
  parts.push(gridSection(season));
  if (season.personal) parts.push(personalSection(season));
  if (season.beers) parts.push(beerSection(season));
  if (season.attendance?.tracked) parts.push(attendanceSection(season));
  parts.push(`<section class="section two-up">
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
  app.innerHTML = parts.join('');

  drawCharts(season);
  wireGrid(season);
  wireBeers(season);
}

// Charts are drawn at their real pixel width so text stays readable on phones.
function drawCharts(season) {
  for (const [id, draw] of [['points-chart', (w) => pointsChart(season.nights, w)], ['rounds-chart', (w) => roundsChart(season.rounds, w)]]) {
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
  return `<section class="section">
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
  const place = n.place ? `<span class="place${n.place === 1 ? ' first' : ''}">${ordinal(n.place)}</span>` : '<span class="muted">–</span>';
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
  const place = n.place ? `<span class="place${n.place === 1 ? ' first' : ''}">${ordinal(n.place)}</span>` : '';
  return `<li class="night-card">
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
  const beers = beerEntries.length
    ? `<div><h4>Beers</h4><ul>${beerEntries.map(([name, d]) => {
        const total = Object.values(d).reduce((a, c) => a + c, 0);
        return `<li><span>${esc(name)} <span class="secondary small">${esc(Object.entries(d).map(([k, c]) => `${fmt(c)} ${k.trim()}`).join(', '))}</span></span><span class="num">${fmt(total)}</span></li>`;
      }).join('')}</ul></div>`
    : '';
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
    n.cheats.includes('reinforcements') && n.deduction && ['Reinforcements, deduction back', signed(n.deduction)],
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

// Phone layout for one league row: position, name and points up top, the breakdown below.
function leagueCard(p, started) {
  const move = started ? moveMark(p.move) : '';
  const form = formMarks(p.form);
  const stat = (label, value) => `<span><span class="muted">${label}</span> ${value}</span>`;
  return `<li class="league-card">
      <span class="lc-rank num">${started ? p.rank : '–'}</span>
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
      <td class="rank num">${started ? p.rank : dash}</td>
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
  return `<section class="section">
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
  </section>${started ? byRoundSection(season) : ''}`;
}

// Players × rounds: who carries which round. Diverging tint: blue up, red down.
function tint(v, max) {
  if (!v || !max) return '';
  const pct = Math.round(12 + 43 * Math.min(1, Math.abs(v) / max));
  return `background: color-mix(in srgb, var(${v > 0 ? '--series-1' : '--neg'}) ${pct}%, transparent)`;
}

function byRoundSection(season) {
  const rows = season.personal.rows.filter((p) => p.played);
  const max = Math.max(...rows.flatMap((p) => Object.values(p.byRound).map(Math.abs)), 0);
  const head = ROUNDS.map((r) => `<th class="round" scope="col">R${r.n}<span>${r.weekly ? 'weekly' : esc(r.name)}</span></th>`).join('');
  const body = rows.map((p) => `<tr>
      <th scope="row" class="att-name">${esc(p.name)}</th>
      ${ROUNDS.map((r) => {
        const v = p.byRound[r.n];
        return `<td class="pcell num" style="${tint(v, max)}" title="${esc(p.name)}, round ${r.n}: ${pointsText(v)}">${v ? pointsText(v) : '<span class="muted">·</span>'}</td>`;
      }).join('')}
      <td class="total-cell"><b>${fmt(p.points)}</b></td>
    </tr>`).join('');
  return `<section class="section">
    <div class="section-head">
      <h2>Personal points by round</h2>
      <p>Season totals for each round. Blue is a net gain, red a net loss.</p>
    </div>
    <div class="panel sheet-scroll fit">
      <table class="sheet attendance byround">
        <thead><tr><th scope="col" class="att-name">Player</th>${head}<th class="total" scope="col">Total</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

// Phone version of the night's personal points: one line per player.
function nightPersonalList(n, players) {
  if (!n.personal || !Object.keys(n.personal).length) return '';
  const rows = (players ?? []).filter((p) => n.attendees?.includes(p)).map((name) => ({ name, ...nightPersonal(n, name) }));
  return `<div class="detail-wide"><h4>Personal points</h4><ul class="plist">${rows.map((p) => {
    const rounds = Object.entries(p.byRound).map(([r, c]) => `R${r} ${pointsText(c.points)}`).join(', ');
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
  return `<div class="detail-wide"><h4>Personal points</h4>
    <div class="sheet-scroll"><table class="mini">
      <thead><tr><th></th>${ROUNDS.map((r) => `<th scope="col">R${r.n}</th>`).join('')}<th scope="col" class="r">Night</th><th></th></tr></thead>
      <tbody>${body}</tbody>
    </table></div></div>`;
}

// BeerTracker ------------------------------------------------------------
const beerList = (beers, limit = Infinity) => {
  const shown = beers.slice(0, limit).map((b) => `${esc(b.name)} ${fmt(b.count)}`);
  if (beers.length > limit) shown.push(`+${beers.length - limit} more`);
  return shown.join(', ');
};

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
      <p>${b.nights ? `How many and what we drank, over ${b.nights} night${b.nights === 1 ? '' : 's'}.` : 'How many and what we drank.'}</p>
    </div>`;
  if (!b.nights) {
    return `<section class="section">${head}<p class="secondary">No beers logged yet this season.</p></section>`;
  }
  const max = b.types[0]?.count ?? 0;
  const board = b.rows.map((p) => `<tr>
      <td class="rank num">${p.rank}</td>
      <th scope="row" class="beer-name">${esc(p.name)}
        <span class="beer-sub">${p.beers.length ? beerList(p.beers, 3) : '<span class="muted">Nothing logged</span>'}</span></th>
      <td class="num pts">${fmt(p.total)}</td>
      <td class="num c secondary">${p.perNight != null ? fmt(p.perNight, 1) : '–'}</td>
    </tr>`).join('');
  const bars = b.types.map((t, i) => `<li class="beer-bar" data-beer="${i}">
      <span class="bb-name">${esc(t.name)}</span>
      <span class="bb-track"><span class="bb-fill" style="width:${((t.count / max) * 100).toFixed(1)}%"></span></span>
      <span class="bb-val num">${fmt(t.count)}</span>
    </li>`).join('');
  return `<section class="section">
    ${head}
    <dl class="figures beer-figures">
      <div><dt>Beers this season</dt><dd>${fmt(b.total)}</dd></div>
      <div><dt>Per night, whole team</dt><dd>${fmt(b.perNight, 1)}</dd></div>
      ${b.record ? `<div><dt>Most in one night</dt><dd>${fmt(b.record.count)} <span class="dd-sub">${recordText(b.record.holders)}</span></dd></div>` : ''}
    </dl>
    <div class="two-up">
      <div class="panel beer-board">
        <table class="sheet league beer-table">
          <thead><tr><th scope="col" class="rank">#</th><th scope="col">Player</th><th scope="col" class="pts">Beers</th><th scope="col" class="c" title="Per night attended">/night</th></tr></thead>
          <tbody>${board}</tbody>
        </table>
      </div>
      <div class="panel chart">
        <h3>What we drink</h3>
        <p class="sub">All beers this season, most popular first.</p>
        <ol class="beer-bars">${bars}</ol>
      </div>
    </div>
  </section>`;
}

function wireBeers(season) {
  if (!season.beers?.nights) return;
  app.querySelectorAll('.beer-bar').forEach((li) => {
    const t = season.beers.types[li.dataset.beer];
    const who = season.beers.rows
      .map((p) => ({ name: p.name, count: p.beers.find((x) => x.name === t.name)?.count ?? 0 }))
      .filter((p) => p.count)
      .sort((a, b) => b.count - a.count);
    bindTip(li, `<strong>${esc(t.name)}</strong>
      ${who.map((p) => `<div class="row"><span>${esc(p.name)}</span><b>${fmt(p.count)}</b></div>`).join('')}`);
  });
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
  return `<section class="section">
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
        const gain = key === 'afk' ? n.generalPoints : key === 'tripleJoker' ? n.tripleExtra : key === 'noYou' ? n.noYouExtra : n.deduction;
        const label = key === 'afk' ? `${fmt(gain)} points without playing` : `<span class="gain">${signed(gain)}</span> standings points`;
        return `<p class="status">Used on ${esc(n.id)}: ${label}</p>`;
      }).join('');
    }
    return `<div class="cheat"><h3>${esc(c.name)}</h3><p class="rule">${esc(c.rule)}</p>${status}</div>`;
  }).join('');
  return `<section class="section">
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
