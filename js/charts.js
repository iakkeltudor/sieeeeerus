// Small hand-rolled SVG charts. No dependencies, so the site stays a plain static folder.

const SVG = 'http://www.w3.org/2000/svg';

export const fmt = (x, digits = 2) =>
  x == null ? '–' : Number(x).toLocaleString('en-GB', { maximumFractionDigits: digits });

export const shortId = (id) => id.replace(/^Quiz\s*/i, '');

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

// Shared tooltip ---------------------------------------------------------
const tip = () => document.getElementById('tooltip');

export function showTip(html, x, y) {
  const t = tip();
  t.innerHTML = html;
  t.hidden = false;
  const pad = 14;
  const { width, height } = t.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + width > window.innerWidth - 8) left = x - width - pad;
  if (top + height > window.innerHeight - 8) top = y - height - pad;
  t.style.left = `${Math.max(8, left)}px`;
  t.style.top = `${Math.max(8, top)}px`;
}

export function hideTip() {
  tip().hidden = true;
  tipOwner = null;
}

// Mouse: follow the pointer. Touch and pen: a tap opens the tooltip and the next tap
// anywhere else (or a scroll) closes it, instead of it flashing for a split second.
let tipOwner = null;
export function bindTip(node, html) {
  const content = () => (typeof html === 'function' ? html() : html);
  node.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') showTip(content(), e.clientX, e.clientY);
  });
  node.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hideTip();
  });
  node.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (tipOwner === node && !tip().hidden) { hideTip(); return; }
    tipOwner = node;
    showTip(content(), e.clientX, e.clientY);
  });
}
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' && tipOwner && !tipOwner.contains(e.target)) hideTip();
}, true);
window.addEventListener('scroll', () => hideTip(), { passive: true });

function niceTicks(lo, hi) {
  const step = hi - lo > 30 ? 10 : 5;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end; v += step) ticks.push(v);
  return ticks;
}

// Points per night: quiz-night line, with standings boosts drawn as a lift above it.
export function pointsChart(nights, W = 560) {
  const played = nights.filter((n) => n.played);
  const H = 290, m = { l: 36, r: 28, t: 18, b: 46 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Points per quiz night' });
  if (!played.length) return svg;

  const values = played.flatMap((n) => [n.nightPoints, n.generalPoints]);
  const ticks = niceTicks(Math.min(...values) - 2, Math.max(...values) + 2);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const x = (i) => m.l + (played.length === 1 ? (W - m.l - m.r) / 2 : (i * (W - m.l - m.r)) / (played.length - 1));
  const y = (v) => m.t + ((y1 - v) / (y1 - y0)) * (H - m.t - m.b);

  for (const t of ticks) {
    el('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === y0 ? 'baseline' : 'gridline' }, svg);
    el('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, svg).textContent = t;
  }
  played.forEach((n, i) => {
    el('text', { x: x(i), y: H - m.b + 18, 'text-anchor': 'middle' }, svg).textContent = shortId(n.id);
  });
  el('text', { x: (m.l + W - m.r) / 2, y: H - 4, 'text-anchor': 'middle', class: 'label' }, svg).textContent = 'Quiz night';

  const cross = el('line', { y1: m.t, y2: H - m.b, class: 'crosshair', visibility: 'hidden' }, svg);

  // Boost connectors sit under the line so the dots stay on top.
  played.forEach((n, i) => {
    if (n.generalPoints > n.nightPoints) {
      el('line', {
        x1: x(i), x2: x(i), y1: y(n.nightPoints), y2: y(n.generalPoints),
        stroke: 'var(--series-2)', 'stroke-width': 2, 'stroke-linecap': 'round',
      }, svg);
    }
  });

  const d = played.map((n, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(n.nightPoints).toFixed(1)}`).join('');
  el('path', { d, fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);

  played.forEach((n, i) => {
    el('circle', { cx: x(i), cy: y(n.nightPoints), r: 4.5, fill: 'var(--series-1)', stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
    if (n.generalPoints > n.nightPoints) {
      el('circle', { cx: x(i), cy: y(n.generalPoints), r: 4.5, fill: 'var(--series-2)', stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
      const gain = n.generalPoints - n.nightPoints;
      el('text', { x: x(i) + 9, y: y(n.generalPoints) + 4, class: 'label' }, svg).textContent = `+${fmt(gain)}`;
    }
  });

  // Hover bands wider than the marks, one per night.
  const band = played.length > 1 ? (x(1) - x(0)) : W - m.l - m.r;
  played.forEach((n, i) => {
    const hit = el('rect', { x: x(i) - band / 2, y: m.t, width: band, height: H - m.t - m.b, class: 'hit' }, svg);
    hit.addEventListener('pointerenter', () => {
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.setAttribute('visibility', 'visible');
    });
    hit.addEventListener('pointerleave', () => cross.setAttribute('visibility', 'hidden'));
    bindTip(hit, () => `
      <strong>${n.id}</strong>
      ${n.theme ? `<div class="secondary">${n.theme}</div>` : ''}
      <div class="row"><span><i style="background:var(--series-1)"></i>Quiz night</span><b>${fmt(n.nightPoints)}</b></div>
      <div class="row"><span><i style="background:var(--series-2)"></i>Standings</span><b>${fmt(n.generalPoints)}</b></div>
      ${n.place ? `<div class="row"><span>Place</span><b>${ordinal(n.place)}</b></div>` : ''}`);
  });
  return svg;
}

// Round ranges: worst-to-best line with the average as a dot.
export function roundsChart(rounds, W = 560) {
  const rows = rounds.filter((r) => r.count);
  const rowH = 40, labelW = Math.min(170, Math.round(W * 0.4)), valueW = 52;
  const m = { t: 8, b: 30 };
  const H = m.t + rows.length * rowH + m.b;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Score range for each round' });
  if (!rows.length) return svg;

  const lo = Math.min(5, Math.floor(Math.min(...rows.map((r) => r.worst))));
  const hi = 11;
  const x = (v) => labelW + ((v - lo) / (hi - lo)) * (W - labelW - valueW);

  for (let t = lo; t <= hi; t++) {
    el('line', { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, class: 'gridline' }, svg);
    el('text', { x: x(t), y: H - m.b + 18, 'text-anchor': 'middle' }, svg).textContent = t;
  }

  rows.forEach((r, i) => {
    const cy = m.t + i * rowH + rowH / 2;
    const name = el('text', { x: 0, y: cy - 2, class: 'label strong' }, svg);
    name.textContent = `${r.n}. ${r.name}`;
    const meta = el('text', { x: 0, y: cy + 13 }, svg);
    meta.textContent = r.timesJokered ? `jokered ${r.timesJokered}×` : r.weekly ? 'changes weekly' : '';

    el('line', { x1: x(r.worst), x2: x(r.best), y1: cy, y2: cy, stroke: 'var(--axis)', 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
    el('line', { x1: x(r.worst), x2: x(r.worst), y1: cy - 5, y2: cy + 5, stroke: 'var(--axis)', 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
    el('line', { x1: x(r.best), x2: x(r.best), y1: cy - 5, y2: cy + 5, stroke: 'var(--axis)', 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
    el('circle', { cx: x(r.avg), cy, r: 5.5, fill: 'var(--series-1)', stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
    el('text', { x: W, y: cy + 4, 'text-anchor': 'end', class: 'label strong' }, svg).textContent = fmt(r.avg);

    const hit = el('rect', { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: 'hit' }, svg);
    bindTip(hit, `
      <strong>Round ${r.n}: ${r.name}</strong>
      <div class="row"><span>Average</span><b>${fmt(r.avg)}</b></div>
      <div class="row"><span>Best / worst</span><b>${fmt(r.best)} / ${fmt(r.worst)}</b></div>
      <div class="row"><span>Our best round of the night</span><b>${r.timesBest} of ${r.count}</b></div>
      <div class="row"><span>Jokered</span><b>${r.timesJokered ? `${r.timesJokered}× (${r.jokeredOnBest} on our best)` : 'never'}</b></div>`);
  });
  el('text', { x: W, y: H - m.b + 18, 'text-anchor': 'end' }, svg).textContent = 'avg';
  return svg;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Blue sequential ramp (light to dark), for round scores.
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

// On a dark surface the ramp runs the other way, so a better round is always the one that stands out.
export const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const stepFor = (t) => {
  const i = Math.round(t * (RAMP.length - 1));
  return isDark() ? RAMP.length - 1 - i : i;
};

export function scoreColor(score, max = 11, floor = 5) {
  const i = stepFor(Math.min(1, Math.max(0, (score - floor) / (max - floor))));
  return { bg: RAMP[i], fg: i >= 7 ? '#ffffff' : '#13233a' };
}

export const rampSwatches = (n = 7) => Array.from({ length: n }, (_, k) => RAMP[stepFor(k / (n - 1))]);
