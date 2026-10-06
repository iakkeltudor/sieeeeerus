import { ROUNDS, CHEATS, MAX_ROUND_SCORE, scoreSeason, validateNight, teamSizeDeduction } from './scoring.js';
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
  const rows = season.nights.map((n, i) => nightRow(n, i)).join('');
  const swatches = rampSwatches().map((c) => `<i style="background:${c}"></i>`).join('');
  return `<section class="section">
    <div class="section-head">
      <h2>Night by night</h2>
      <p>Each square is one round, scored out of ${MAX_ROUND_SCORE}. Select a night to see how its total was worked out.</p>
    </div>
    <div class="panel sheet-scroll">
      <table class="sheet">
        <thead><tr>
          <th scope="col" class="night-cell">Night</th>${head}
          <th class="total" scope="col">Quiz night</th><th class="total" scope="col">Standings</th><th class="total" scope="col">Place</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="legend-row">
      <span>5 or less<span class="ramp" aria-hidden="true">${swatches}</span>11</span>
      <span><span class="key-joker" aria-hidden="true">J</span>joker round, counted twice</span>
    </div>
  </section>`;
}

function nightRow(n, i) {
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
    <tr class="detail-row" id="detail-${i}" hidden><td colspan="12">${detail(n)}</td></tr>`;
}

function detail(n) {
  const facts = [
    n.date && ['Date', esc(n.date)],
    n.teamSize && ['Team size', n.teamSize],
    n.place && ['Place', ordinal(n.place)],
  ].filter(Boolean);
  const who = Array.isArray(n.attendees)
    ? `<div><h4>Who went</h4><p>${n.attendees.map(esc).join(', ')}${n.guests ? `, plus ${n.guests} guest${n.guests === 1 ? '' : 's'}` : ''}</p></div>`
    : '';
  const factsList = (facts.length ? `<div><h4>The night</h4><ul>${facts.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('')}</ul></div>` : '') + who;

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
  </div>`;
}

function wireGrid(season) {
  app.querySelectorAll('.night-btn').forEach((btn) => btn.addEventListener('click', () => {
    const row = btn.closest('tr');
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
function personalSection(season) {
  const { rows, nights } = season.personal;
  const started = nights > 0;
  const body = rows.map((p) => `<tr>
      <td class="rank num">${started ? p.rank : '–'}</td>
      <th scope="row" class="att-name">${esc(p.name)}</th>
      <td class="total-cell"><b>${started ? fmt(p.points) : '–'}</b></td>
      <td class="total-cell">${p.attended}</td>
    </tr>`).join('');
  return `<section class="section">
    <div class="section-head">
      <h2>Personal standings</h2>
      <p>${started ? `After ${nights} scored night${nights === 1 ? '' : 's'}.` : 'Personal points haven’t been added yet.'}</p>
    </div>
    <div class="panel sheet-scroll fit">
      <table class="sheet attendance standings">
        <thead><tr><th scope="col" class="rank">#</th><th scope="col" class="att-name">Player</th><th class="total" scope="col">Points</th><th class="total" scope="col">Nights</th></tr></thead>
        <tbody>${body}</tbody>
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
    ['Quiz-night vs standings', 'Quiz-night points are the score on the night. General standings points add the season cheats on top.'],
    ['Old nights', 'Some early nights only have a final total recorded. That total is used for both scores.'],
  ];
  document.getElementById('rules').innerHTML = `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

load();
