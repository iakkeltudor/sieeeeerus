// Run by the "Save quiz night" GitHub Action: node scripts/apply-night.mjs <event.json> <message.txt>
// Takes the night sent from the add-a-night form, checks it again, and writes it into the
// season file. Nothing is written unless every check passes.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { scoreSeason, validateNight } from '../js/scoring.js';
import { cleanNight, NIGHT_KEYS } from '../js/night.js';
import { formatSeason } from './format-json.mjs';

export class NightError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.problems = problems;
  }
}

const fail = (...problems) => { throw new NightError(problems); };

// payload: { season, mode: 'add' | 'edit', newPlayers: [...], night: {...} }
// current: the parsed season file. Returns the updated season and a commit message.
export function applyNight(payload, current) {
  if (!payload || typeof payload !== 'object') fail('The request had no data.');
  const { mode } = payload;
  if (mode !== 'add' && mode !== 'edit') fail('mode must be "add" or "edit".');
  if (!Array.isArray(current.players)) fail(`Season ${current.season} has no players list, so nights can't be added to it from the website.`);

  let night;
  try {
    night = cleanNight(payload.night);
  } catch (err) {
    fail(err.message);
  }

  const season = structuredClone(current);
  for (const raw of payload.newPlayers ?? []) {
    const p = String(raw ?? '').trim();
    if (!p || p.length > 40 || ['__proto__', 'constructor', 'prototype'].includes(p)) fail(`"${p}" is not a valid player name.`);
    if (season.players.some((x) => x.toLowerCase() === p.toLowerCase())) fail(`${p} is already on the players list.`);
    season.players.push(p);
  }

  const at = season.nights.findIndex((n) => n.id === night.id);
  if (mode === 'add' && at >= 0) fail(`${night.id} already exists. Use "Edit a night" to change it.`);
  if (mode === 'edit' && at < 0) fail(`${night.id} doesn't exist yet, so there is nothing to edit.`);
  if (mode === 'edit') {
    const extra = Object.keys(season.nights[at]).filter((k) => !NIGHT_KEYS.includes(k));
    if (extra.length) fail(`${night.id} has fields the form doesn't handle (${extra.join(', ')}), so it can't be edited here.`);
  }

  const problems = validateNight(night, season.players);
  if (!night.attendees.length) problems.push('Nobody is listed as attending.');
  if (night.rounds.length !== 8) problems.push('All 8 round scores are needed.');
  if (problems.length) fail(...problems);

  if (mode === 'add') season.nights.push(night);
  else season.nights[at] = night;
  try {
    scoreSeason(season);
  } catch (err) {
    fail(`The season couldn't be scored: ${err.message}`);
  }
  return { season, message: `Season ${season.season}: ${mode === 'add' ? 'add' : 'update'} ${night.id}` };
}

// Command line -----------------------------------------------------------------
const dataUrl = (file) => new URL(`../data/${file}`, import.meta.url);

function main(eventPath, messagePath) {
  const payload = JSON.parse(readFileSync(eventPath, 'utf8')).client_payload;
  const index = JSON.parse(readFileSync(dataUrl('seasons.json'), 'utf8'));
  const meta = index.seasons.find((s) => s.season === payload?.season);
  if (!meta || !/^season-\d+\.json$/.test(meta.file)) fail(`Season ${payload?.season} isn't listed in data/seasons.json.`);

  const current = JSON.parse(readFileSync(dataUrl(meta.file), 'utf8'));
  const { season, message } = applyNight(payload, current);
  writeFileSync(dataUrl(meta.file), formatSeason(season));
  writeFileSync(messagePath, `${message}\n`);
  console.log(message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv[2], process.argv[3]);
  } catch (err) {
    // ::error:: lines show up as annotations on the failed run.
    for (const line of err.problems ?? [err.message]) console.log(`::error::${line}`);
    process.exit(1);
  }
}
