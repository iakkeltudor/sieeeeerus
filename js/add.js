// The add-a-night form. It builds one night, checks it with the same rules the site uses, shows
// the result before anything is sent, then asks GitHub to run the "Save quiz night" action.
import { ROUNDS, CHEATS, PERSONAL, scoreSeason, validateNight, nightPersonal } from './scoring.js?v=7';
import { cleanNight, NIGHT_KEYS } from './night.js?v=1';

const REPO = 'iakkeltudor/sieeeeerus';
const TOKEN_KEY = 'sq-token';
const DRAFT_KEY = 'sq-draft';

const root = document.getElementById('add');
const $ = (sel) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (x) => (x == null ? '–' : Number(x).toLocaleString('en-GB', { maximumFractionDigits: 2 }));
const signed = (x) => (x > 0 ? `+${fmt(x)}` : x < 0 ? `−${fmt(-x)}` : '0');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parseNum = (v) => {
  const s = String(v ?? '').trim().replace(',', '.');
  return s === '' ? NaN : Number(s);
};
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: the form still works */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

async function getJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} could not be loaded (HTTP ${res.status}).`);
  return res.json();
}

// Data ---------------------------------------------------------------------------------
const seasons = new Map(); // season number -> { raw, file }
let current; // the season being added to
let state;
let lastCompute = null;
let sending = false;

const CATS = Object.entries(PERSONAL).map(([key, c]) => ({ key, name: c.name }));
const roster = () => [...current.raw.players, ...state.newPlayers.filter((p) => !current.raw.players.includes(p))];
const usedNewPlayers = () => state.newPlayers.filter((p) => state.attendees.includes(p) && !current.raw.players.includes(p));
const editable = (n) => Array.isArray(n.attendees) && Array.isArray(n.rounds) && Object.keys(n).every((k) => NIGHT_KEYS.includes(k));

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const suggestId = () => {
  const nums = current.raw.nights.map((n) => /^Quiz (\d+)$/.exec(n.id)?.[1]).filter(Boolean).map(Number);
  return `Quiz ${Math.max(0, ...nums) + 1}`;
};
const blank = () => ({
  mode: 'add', editId: null, id: suggestId(), date: today(), theme: '', place: '', guests: '',
  attendees: [], newPlayers: [], rounds: Array(8).fill(''), topics: { 4: '', 5: '', 7: '' }, joker: null, cheats: [],
  entries: [], beers: {}, typed: {}, beerTypes: [],
});
const isDirty = () => state.attendees.length || state.theme || state.rounds.some((r) => r !== '') || state.entries.length;

// A saved night -> form state, so it can be edited.
function fromNight(n) {
  const s = blank();
  Object.assign(s, {
    mode: 'edit', editId: n.id, id: n.id, date: n.date ?? '', theme: n.theme ?? '', place: n.place ?? '', guests: n.guests ?? '',
    attendees: [...n.attendees], rounds: n.rounds.map(String), joker: n.joker ?? null, cheats: [...(n.cheats ?? [])],
    topics: { 4: n.topics?.[4] ?? '', 5: n.topics?.[5] ?? '', 7: n.topics?.[7] ?? '' },
    beerTypes: Object.entries(n.beerTypes ?? {}).map(([name, count]) => ({ name, count: String(count) })),
  });
  for (const [round, people] of Object.entries(n.personal ?? {})) {
    for (const [player, cats] of Object.entries(people)) for (const [cat, v] of Object.entries(cats)) s.entries.push({ round, player, cat, n: v });
  }
  for (const [player, drinks] of Object.entries(n.beers ?? {})) {
    for (const [beer, count] of Object.entries(drinks)) {
      if (beer.toLowerCase() === 'unknown') s.beers[player] = count;
      else (s.typed[player] ??= {})[beer] = count;
    }
  }
  return s;
}

// Form state -> the night as it will be stored.
function buildRaw() {
  const personal = {};
  for (const e of state.entries) {
    const byPlayer = (personal[String(e.round)] ??= {});
    const cats = (byPlayer[e.player] ??= {});
    cats[e.cat] = (cats[e.cat] ?? 0) + e.n;
  }
  const beers = {};
  for (const p of state.attendees) {
    const drinks = { ...(state.typed[p] ?? {}) };
    if ((state.beers[p] ?? 0) > 0) drinks.Unknown = state.beers[p];
    if (Object.keys(drinks).length) beers[p] = drinks;
  }
  const beerTypes = {};
  for (const t of state.beerTypes) {
    const name = t.name.trim();
    const count = parseNum(t.count);
    if (name && count > 0) beerTypes[name] = count;
  }
  return {
    id: state.id.trim(), date: state.date || null, theme: state.theme, attendees: [...state.attendees],
    guests: parseNum(state.guests) || 0, place: state.place === '' ? null : parseNum(state.place),
    rounds: state.rounds.map(parseNum), topics: { ...state.topics }, joker: state.joker, cheats: [...state.cheats],
    personal, beers, beerTypes,
  };
}

// Checks the night and scores it as part of the season. Nothing here touches the network.
function compute() {
  const problems = [];
  const raw = buildRaw();
  if (state.mode === 'edit' && !state.editId) return { problems: ['Choose the night you want to edit.'] };
  if (!raw.id) problems.push('Give the night a name, like "Quiz 5".');
  if (state.mode === 'add' && current.raw.nights.some((n) => n.id === raw.id)) problems.push(`${raw.id} already exists. Use "Edit a night" to change it.`);
  if (!raw.attendees.length) problems.push('Pick who went.');
  if (!(raw.place >= 1)) problems.push('Enter the place the team finished.');
  const missing = raw.rounds.map((r, i) => (Number.isNaN(r) ? i + 1 : null)).filter(Boolean);
  if (missing.length) problems.push(`Enter the score for round${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`);
  if (raw.joker == null) problems.push('Pick the joker round.');
  if (missing.length) return { problems };

  let night;
  try {
    night = cleanNight(raw);
  } catch (err) {
    return { problems: [...problems, err.message] };
  }
  problems.push(...validateNight(night, roster()));
  if (problems.length) return { problems, night };

  const nights = state.mode === 'edit'
    ? current.raw.nights.map((n) => (n.id === night.id ? night : n))
    : [...current.raw.nights, night];
  try {
    const scored = scoreSeason({ ...current.raw, players: roster(), nights });
    return { problems: [], night, scored, sn: scored.nights.find((n) => n.id === night.id) };
  } catch (err) {
    return { problems: [err.message], night };
  }
}

// Rendering -----------------------------------------------------------------------------
const shell = () => `
  <div id="banner"></div>

  <section class="add-card">
    <h2>Which night?</h2>
    <div class="seg" role="group" aria-label="New or existing night">
      <button type="button" data-action="mode" data-mode="add" aria-pressed="${state.mode === 'add'}">New night</button>
      <button type="button" data-action="mode" data-mode="edit" aria-pressed="${state.mode === 'edit'}">Edit a night</button>
    </div>
    <div class="grid2">
      <label class="field"><span>Season</span><select id="f-season" ${seasons.size < 2 ? 'disabled' : ''}>
        ${[...seasons.values()].map((s) => `<option value="${s.raw.season}" ${s === current ? 'selected' : ''}>Season ${s.raw.season}</option>`).join('')}</select></label>
      <label class="field" id="edit-pick" ${state.mode === 'edit' ? '' : 'hidden'}><span>Night to edit</span><select id="f-edit">
        <option value="">Choose…</option>
        ${current.raw.nights.filter(editable).map((n) => `<option value="${esc(n.id)}" ${n.id === state.editId ? 'selected' : ''}>${esc(n.id)}${n.theme ? ` · ${esc(n.theme)}` : ''}</option>`).join('')}</select></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Name</span><input data-f="id" value="${esc(state.id)}" ${state.mode === 'edit' ? 'readonly' : ''} maxlength="40" autocomplete="off"></label>
      <label class="field"><span>Date</span><input type="date" data-f="date" value="${esc(state.date)}"></label>
      <label class="field full"><span>Theme</span><input data-f="theme" value="${esc(state.theme)}" maxlength="120" placeholder="e.g. Science / Technology" autocomplete="off"></label>
      <label class="field"><span>Place</span><input type="number" inputmode="numeric" min="1" step="1" data-f="place" value="${esc(state.place)}" placeholder="1"></label>
      <label class="field"><span>Guests (not on the list)</span><input type="number" inputmode="numeric" min="0" max="10" step="1" data-f="guests" value="${esc(state.guests)}" placeholder="0"></label>
    </div>
  </section>

  <section class="add-card">
    <h2>Who went?</h2>
    <p class="hint">Team size comes from this list, so tap everyone who was at the table.</p>
    <div class="pills" id="who"></div>
    <div class="newplayer">
      <input id="newplayer" placeholder="New player's name" maxlength="40" autocomplete="off">
      <button type="button" class="btn" data-action="add-player">Add</button>
    </div>
  </section>

  <section class="add-card">
    <h2>Rounds</h2>
    <p class="hint">Score for each round. Tap J on the round the joker went on.</p>
    ${ROUNDS.map((r, i) => `<div class="round-row">
      <span class="rn">R${r.n}</span>
      <div class="rl"><span>${esc(r.name)}</span>${r.weekly ? `<input data-topic="${r.n}" placeholder="Topic" maxlength="60" value="${esc(state.topics[r.n] ?? '')}" autocomplete="off">` : ''}</div>
      <input inputmode="decimal" autocomplete="off" data-round="${i}" placeholder="0" value="${esc(state.rounds[i])}" aria-label="Round ${r.n} score">
      <button type="button" class="joker-btn" data-action="joker" data-joker="${r.n}" aria-pressed="${state.joker === r.n}" aria-label="Joker on round ${r.n}">J</button>
    </div>`).join('')}
    <p class="hint" style="margin:14px 0 8px">Season cheats used tonight</p>
    <div class="pills">${Object.entries(CHEATS).map(([key, c]) => `<label class="pill"><input type="checkbox" data-cheat="${key}" ${state.cheats.includes(key) ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')}</div>
  </section>

  <section class="add-card">
    <h2>Personal points</h2>
    <p class="hint">One entry per thing that happened. A red question is worth double, so enter it as 2.</p>
    <div class="adder">
      <select id="ad-round" aria-label="Round">${ROUNDS.map((r) => `<option value="${r.n}">R${r.n} · ${esc(r.name)}</option>`).join('')}<option value="night">Round not known</option></select>
      <select id="ad-player" aria-label="Player"></select>
      <select id="ad-cat" aria-label="What happened">${CATS.map((c) => `<option value="${c.key}">${esc(c.name)} (${signed(PERSONAL[c.key].points)})</option>`).join('')}</select>
      <input id="ad-n" type="number" inputmode="decimal" step="0.5" min="0.5" value="1" aria-label="How many">
      <button type="button" class="btn" data-action="add-entry">Add entry</button>
    </div>
    <ul class="entries" id="entries"></ul>
  </section>

  <section class="add-card">
    <h2>Beers</h2>
    <p class="hint">How many each person drank. Leave people at 0 if they didn't.</p>
    <div id="beers"></div>
    <details style="margin-top:12px"><summary class="hint" style="cursor:pointer">Know how many of each beer? (optional)</summary>
      <div id="types"></div>
      <button type="button" class="btn small" data-action="add-type" style="margin-top:8px">+ Add a beer</button>
    </details>
  </section>

  <section class="add-card preview">
    <h2>Check before sending</h2>
    <div id="preview-body"></div>
  </section>

  <details class="add-card settings" id="settings">
    <summary>GitHub token ${store.get(TOKEN_KEY) ? '· saved on this phone' : '· not set up yet'}</summary>
    <p class="hint" style="margin-top:8px">Publishing needs a token that can only touch this repository. It stays on this device.</p>
    <ol>
      <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → fine-grained tokens → new</a>.</li>
      <li>Repository access: <b>Only select repositories</b>, then pick <code>sieeeeerus</code>.</li>
      <li>Repository permissions → <b>Contents: Read and write</b>. Nothing else.</li>
      <li>Generate the token, copy it and paste it below.</li>
    </ol>
    <div class="row"><input id="token" type="password" placeholder="github_pat_…" autocomplete="off" spellcheck="false" aria-label="GitHub token"></div>
    <div class="row">
      <button type="button" class="btn small" data-action="save-token">Save token</button>
      <button type="button" class="btn small" data-action="check-token">Test it</button>
      <button type="button" class="btn small link" data-action="clear-token">Forget it</button>
    </div>
    <p id="token-msg" class="hint" role="status"></p>
  </details>

  <div class="publish-bar">
    <span class="status" id="pub-status"></span>
    <button type="button" class="btn primary" id="publish" data-action="publish">Publish to the site</button>
  </div>`;

function renderWho() {
  $('#who').innerHTML = roster().map((p) => `<label class="pill"><input type="checkbox" data-who="${esc(p)}" ${state.attendees.includes(p) ? 'checked' : ''}><span>${esc(p)}</span></label>`).join('');
  const sel = $('#ad-player');
  const keep = sel.value;
  sel.innerHTML = state.attendees.length
    ? state.attendees.map((p) => `<option ${p === keep ? 'selected' : ''}>${esc(p)}</option>`).join('')
    : '<option value="">Pick who went first</option>';
}

const entryPoints = (e) => (PERSONAL[e.cat]?.points ?? 0) * e.n;
function renderEntries() {
  $('#entries').innerHTML = state.entries.length
    ? state.entries.map((e, i) => {
      const pts = entryPoints(e);
      return `<li><span>${e.round === 'night' ? 'No round' : `R${esc(e.round)}`} · <b>${esc(e.player)}</b> · ${esc(PERSONAL[e.cat]?.name ?? e.cat)} ×${fmt(e.n)}</span>
        <span class="pts ${pts < 0 ? 'neg' : 'pos'}">${signed(pts)}</span>
        <button type="button" class="x" data-action="del-entry" data-i="${i}" aria-label="Remove this entry">×</button></li>`;
    }).join('')
    : '<li class="secondary">Nothing added yet.</li>';
}

function renderBeers() {
  $('#beers').innerHTML = state.attendees.length
    ? state.attendees.map((p) => {
      const typed = Object.entries(state.typed[p] ?? {});
      const n = state.beers[p] ?? 0;
      return `<div class="stepper-row"><span class="who">${esc(p)}${typed.length ? `<span class="typed">+ ${esc(typed.map(([k, c]) => `${fmt(c)} ${k}`).join(', '))} already recorded</span>` : ''}</span>
        <span class="stepper"><button type="button" data-action="beer" data-p="${esc(p)}" data-dir="-1" ${n <= 0 ? 'disabled' : ''} aria-label="One less beer for ${esc(p)}">−</button>
        <output>${fmt(n)}</output>
        <button type="button" data-action="beer" data-p="${esc(p)}" data-dir="1" aria-label="One more beer for ${esc(p)}">+</button></span></div>`;
    }).join('')
    : '<p class="secondary">Pick who went first.</p>';
}

function renderTypes() {
  $('#types').innerHTML = state.beerTypes.map((t, i) => `<div class="type-row">
      <input data-type="${i}" data-k="name" placeholder="Beer, e.g. Ursus" value="${esc(t.name)}" maxlength="40" autocomplete="off">
      <input data-type="${i}" data-k="count" inputmode="numeric" placeholder="0" value="${esc(t.count)}">
      <button type="button" class="x" data-action="del-type" data-i="${i}" aria-label="Remove this beer">×</button></div>`).join('');
}

function renderPreview() {
  const c = compute();
  lastCompute = c;
  let html = '';
  if (c.problems.length) html += `<ul class="problems">${c.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
  if (c.sn) {
    const n = c.sn;
    const boost = n.generalPoints - n.nightPoints;
    const lines = [
      ['Round scores', fmt(n.base)],
      n.joker && [`Joker on round ${n.joker}`, signed(n.jokerScore)],
      n.deduction && [`Team of ${n.teamSize}`, signed(-n.deduction)],
    ].filter(Boolean);
    const standing = [
      n.reinforcementsRelief && [n.reinforcementsRelief < n.deduction ? `Reinforcements, ${fmt(n.reinforcementsRelief)} of ${fmt(n.deduction)} back` : 'Reinforcements, deduction back', signed(n.reinforcementsRelief)],
      n.tripleExtra && ['Triple joker', signed(n.tripleExtra)],
      n.noYouExtra && ['No, you', signed(n.noYouExtra)],
    ].filter(Boolean);
    const list = (rows) => rows.map(([k, v]) => `<li><span>${esc(k)}</span><span>${v}</span></li>`).join('');
    const tonight = c.night.attendees.map((name) => ({ name, p: nightPersonal(c.night, name).points })).filter((x) => x.p).sort((a, b) => b.p - a.p);
    const beers = Object.values(c.night.beers ?? {}).reduce((a, d) => a + Object.values(d).reduce((x, y) => x + y, 0), 0);
    const board = (c.scored.personal?.rows ?? []).filter((r) => r.played && r.points !== 0).slice(0, 8);
    html += `<dl class="sum-grid">
        <div><dt>Quiz-night points</dt><dd>${fmt(n.nightPoints)}</dd></div>
        <div><dt>Standings points</dt><dd>${fmt(n.generalPoints)}${boost ? `<small>${signed(boost)} from cheats</small>` : ''}</dd></div>
        <div><dt>Place</dt><dd>${esc(c.night.place)}<small>team of ${n.teamSize}</small></dd></div>
      </dl>
      <ul class="sum-lines">${list(lines)}<li class="total"><span>Quiz-night points</span><span>${fmt(n.nightPoints)}</span></li>${list(standing)}${standing.length ? `<li class="total"><span>Standings points</span><span>${fmt(n.generalPoints)}</span></li>` : ''}</ul>
      ${n.jokerLoss ? `<p class="hint">The joker missed ${fmt(n.jokerLoss)} point${n.jokerLoss === 1 ? '' : 's'}: the best round was ${fmt(n.best)}.</p>` : ''}
      ${tonight.length ? `<p class="hint" style="margin:0 0 4px">Personal points tonight</p><p style="margin:0 0 12px">${tonight.map((x) => `<b>${esc(x.name)}</b> ${signed(x.p)}`).join(' · ')}</p>` : ''}
      ${beers ? `<p class="hint">${fmt(beers)} beers in total.</p>` : ''}
      ${board.length ? `<p class="hint" style="margin:0 0 4px">Personal standings after tonight</p>
        <table class="mini-board"><tbody>${board.map((r) => `<tr><td>${r.rank}</td><th scope="row">${esc(r.name)}</th><td class="r">${fmt(r.points)}</td><td class="r">${r.move ? `${r.move > 0 ? '▲' : '▼'}${Math.abs(r.move)}` : ''}</td></tr>`).join('')}</tbody></table>` : ''}`;
  }
  $('#preview-body').innerHTML = html || '<p class="secondary">Fill in the night above and the totals appear here.</p>';
  $('#publish').disabled = sending || c.problems.length > 0;
  $('#pub-status').textContent = c.problems.length ? 'Fix the issues above to publish.' : 'Looks good. Ready to publish.';
  saveDraft();
}

function renderAll() {
  root.innerHTML = shell();
  renderWho();
  renderEntries();
  renderBeers();
  renderTypes();
  renderPreview();
}

// Draft ---------------------------------------------------------------------------------
let draftTimer;
let draftLocked = false; // set once a night is sent, so a late save can't bring the draft back
function saveDraft() {
  if (draftLocked) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if (isDirty()) store.set(DRAFT_KEY, JSON.stringify({ season: current.raw.season, state }));
    else store.del(DRAFT_KEY);
  }, 250);
}

// Events --------------------------------------------------------------------------------
function setBanner(kind, html) {
  const el = $('#banner');
  if (el) el.innerHTML = html ? `<div class="banner ${kind}" role="status">${html}</div>` : '';
}

root.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.f) state[t.dataset.f] = t.value;
  else if (t.dataset.round != null) state.rounds[Number(t.dataset.round)] = t.value;
  else if (t.dataset.topic) state.topics[t.dataset.topic] = t.value;
  else if (t.dataset.type != null) state.beerTypes[Number(t.dataset.type)][t.dataset.k] = t.value;
  else return;
  renderPreview();
});

root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'f-season') {
    if (isDirty() && !confirm('Discard the night you are filling in?')) { t.value = current.raw.season; return; }
    current = seasons.get(Number(t.value));
    state = blank();
    renderAll();
  } else if (t.id === 'f-edit') {
    const night = current.raw.nights.find((n) => n.id === t.value);
    state = night ? fromNight(night) : { ...blank(), mode: 'edit' };
    renderAll();
  } else if (t.dataset.who) {
    const name = t.dataset.who;
    if (t.checked) state.attendees.push(name);
    else {
      const has = state.entries.some((x) => x.player === name) || state.beers[name] || state.typed[name];
      if (has && !confirm(`Remove ${name}'s points and beers too?`)) { t.checked = true; return; }
      state.attendees = state.attendees.filter((p) => p !== name);
      state.entries = state.entries.filter((x) => x.player !== name);
      delete state.beers[name];
      delete state.typed[name];
    }
    renderWho();
    renderBeers();
    renderEntries();
    renderPreview();
  } else if (t.dataset.cheat) {
    state.cheats = t.checked ? [...state.cheats, t.dataset.cheat] : state.cheats.filter((c) => c !== t.dataset.cheat);
    renderPreview();
  }
});

root.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const act = b.dataset.action;
  if (act === 'mode') {
    if (b.dataset.mode === state.mode) return;
    if (isDirty() && !confirm('Discard the night you are filling in?')) return;
    state = { ...blank(), mode: b.dataset.mode };
    renderAll();
  } else if (act === 'joker') {
    const n = Number(b.dataset.joker);
    state.joker = state.joker === n ? null : n;
    root.querySelectorAll('.joker-btn').forEach((x) => x.setAttribute('aria-pressed', Number(x.dataset.joker) === state.joker));
    renderPreview();
  } else if (act === 'add-player') {
    const input = $('#newplayer');
    const name = input.value.trim();
    if (!name) return;
    if (roster().some((p) => p.toLowerCase() === name.toLowerCase())) { setBanner('err', `${esc(name)} is already on the list.`); return; }
    state.newPlayers.push(name);
    state.attendees.push(name);
    input.value = '';
    setBanner('', '');
    renderWho();
    renderBeers();
    renderPreview();
  } else if (act === 'add-entry') {
    const player = $('#ad-player').value;
    const n = parseNum($('#ad-n').value);
    if (!player || !(n > 0)) return;
    const round = $('#ad-round').value;
    state.entries.push({ round, player, cat: $('#ad-cat').value, n });
    $('#ad-n').value = '1';
    renderEntries();
    renderPreview();
  } else if (act === 'del-entry') {
    state.entries.splice(Number(b.dataset.i), 1);
    renderEntries();
    renderPreview();
  } else if (act === 'beer') {
    const p = b.dataset.p;
    state.beers[p] = Math.max(0, (state.beers[p] ?? 0) + Number(b.dataset.dir));
    renderBeers();
    renderPreview();
  } else if (act === 'add-type') {
    state.beerTypes.push({ name: '', count: '' });
    renderTypes();
  } else if (act === 'del-type') {
    state.beerTypes.splice(Number(b.dataset.i), 1);
    renderTypes();
    renderPreview();
  } else if (act === 'save-token') saveToken();
  else if (act === 'clear-token') {
    store.del(TOKEN_KEY);
    $('#token').value = '';
    $('#token-msg').textContent = 'Token removed from this device.';
  } else if (act === 'check-token') checkToken();
  else if (act === 'discard-draft') {
    store.del(DRAFT_KEY);
    state = blank();
    renderAll();
  } else if (act === 'publish') publish();
});

// GitHub --------------------------------------------------------------------------------
const gh = (path, opts = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, {
  ...opts,
  headers: {
    Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json',
    Authorization: `Bearer ${store.get(TOKEN_KEY)}`, ...(opts.headers ?? {}),
  },
});

function saveToken() {
  const v = $('#token').value.trim();
  if (!v) { $('#token-msg').textContent = 'Paste the token first.'; return; }
  store.set(TOKEN_KEY, v);
  $('#token').value = '';
  $('#token-msg').textContent = 'Saved on this device. Press "Test it" to check it works.';
  $('#settings summary').textContent = 'GitHub token · saved on this phone';
}

async function checkToken() {
  const msg = $('#token-msg');
  if (!store.get(TOKEN_KEY)) { msg.textContent = 'Save a token first.'; return; }
  msg.textContent = 'Checking…';
  try {
    const res = await gh('');
    msg.textContent = res.ok ? 'The token works for this repository.'
      : res.status === 401 ? 'GitHub rejected the token. It may have expired or been copied wrongly.'
        : 'The token can\'t see this repository. Choose "Only select repositories" and pick sieeeeerus.';
  } catch {
    msg.textContent = 'Could not reach GitHub. Check your connection.';
  }
}

async function publish() {
  const c = lastCompute;
  if (!c || c.problems.length || sending) return;
  if (!store.get(TOKEN_KEY)) {
    $('#settings').open = true;
    $('#settings').scrollIntoView({ behavior: 'smooth' });
    setBanner('err', 'Add your GitHub token first (at the bottom of the page).');
    return;
  }
  if (!confirm(`Publish ${c.night.id} to the site?`)) return;

  sending = true;
  $('#publish').disabled = true;
  $('#pub-status').textContent = 'Sending…';
  const payload = { season: current.raw.season, mode: state.mode, newPlayers: usedNewPlayers(), night: c.night };
  let res;
  try {
    res = await gh('/dispatches', { method: 'POST', body: JSON.stringify({ event_type: 'save-night', client_payload: payload }) });
  } catch {
    sending = false;
    $('#pub-status').textContent = 'Could not reach GitHub. Your draft is saved, try again.';
    $('#publish').disabled = false;
    return;
  }
  sending = false;
  if (res.status === 204) {
    draftLocked = true;
    clearTimeout(draftTimer);
    store.del(DRAFT_KEY);
    showSent(payload);
    return;
  }
  const why = res.status === 401 ? 'GitHub rejected the token. Make a new one in the settings below.'
    : res.status === 403 || res.status === 404 ? 'The token isn\'t allowed to do this. It needs "Contents: Read and write" on the sieeeeerus repository.'
      : `GitHub said no (${res.status}).`;
  $('#pub-status').textContent = why;
  $('#publish').disabled = false;
}

// After sending: wait until the night shows up on the live site, so "Sent" doesn't mean "hopefully".
async function showSent(payload) {
  const file = current.file;
  root.innerHTML = `<section class="add-card">
      <h2>Sent</h2>
      <p id="sent-status">${esc(payload.night.id)} is on its way. GitHub checks it, saves it and rebuilds the site, which usually takes 2 to 3 minutes.</p>
      <p class="hint" id="sent-hint">Waiting for it to appear on the site…</p>
      <div class="pills" style="margin-top:12px"><a class="btn" href="./" style="display:inline-flex;align-items:center;text-decoration:none">Open the results</a>
        <a class="btn" href="https://github.com/${REPO}/actions" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none">See the GitHub run</a>
        <button type="button" class="btn" onclick="location.reload()">Add another night</button></div>
    </section>`;
  const expected = JSON.stringify(payload.night);
  const started = Date.now();
  while (Date.now() - started < 8 * 60 * 1000) {
    await sleep(10000);
    try {
      const raw = await getJson(`data/${file}?t=${Date.now()}`);
      const found = raw.nights.find((n) => n.id === payload.night.id);
      if (found && JSON.stringify(found) === expected) {
        $('#sent-status').textContent = `${payload.night.id} is live. `;
        $('#sent-hint').textContent = 'You can open the results now. If you don\'t see it yet, refresh once.';
        return;
      }
    } catch { /* keep waiting */ }
  }
  $('#sent-status').textContent = `${payload.night.id} hasn't shown up after 8 minutes.`;
  $('#sent-hint').textContent = 'The GitHub run probably refused it. Open "See the GitHub run" to read why. Nothing was changed on the site.';
}

// Start ---------------------------------------------------------------------------------
async function init() {
  try {
    const index = await getJson('data/seasons.json');
    for (const meta of index.seasons) {
      const raw = await getJson(`data/${meta.file}`);
      if (Array.isArray(raw.players)) seasons.set(raw.season, { raw, file: meta.file });
    }
    current = seasons.get(index.current) ?? [...seasons.values()][0];
    if (!current) throw new Error('No season with a players list was found.');
  } catch (err) {
    root.innerHTML = `<div class="banner err">${esc(err.message)}</div>`;
    return;
  }
  state = blank();
  let restored = false;
  try {
    const saved = JSON.parse(store.get(DRAFT_KEY) ?? 'null');
    if (saved?.state && seasons.has(saved.season)) {
      current = seasons.get(saved.season);
      state = { ...blank(), ...saved.state };
      restored = true;
    }
  } catch { /* ignore a broken draft */ }
  renderAll();
  if (restored) setBanner('', 'Your unsaved night was restored. <button type="button" class="btn link" data-action="discard-draft">Start over</button>');
}

init();
