# Sieeeeerus quiz tracker

Pub quiz results for team Sieeeeerus, season by season. A plain static site (HTML, CSS, JS, no build step) meant for GitHub Pages.

Season 3 was moved over from `Sieeeeerus.xlsx`. The scoring code reproduces every number from that workbook, and `tests/` checks that it still does.

## After editing css/styles.css, js/app.js, js/scoring.js or js/charts.js

GitHub Pages lets browsers cache these for about 10 minutes, so a phone can keep showing the old version for a while after a deploy. Bump the `?v=` number by one in all four places so the new files get fetched right away:

- `index.html`: the `css/styles.css?v=` link and the `js/app.js?v=` script tag
- `js/app.js`: the `?v=` on its two imports, `./scoring.js?v=` and `./charts.js?v=`

Editing `data/*.json` alone doesn't need a bump — the page fetches those fresh every time.

## Logging a quiz night

Add an entry to the end of the `nights` list in `data/season-4.json`. You can do this from the GitHub website: open the file, click the pencil icon, edit, then commit. The site updates a minute or two later.

```json
{
  "id": "Quiz 1",
  "date": "2026-10-02",
  "theme": "Movies / Board games",
  "attendees": ["Tudor", "Ana", "Bogdan", "Cris", "Diana", "Mihai"],
  "guests": 1,
  "place": 2,
  "rounds": [10, 9, 11, 10, 8.5, 10, 9, 11],
  "topics": { "4": "Movies", "5": "Board games", "7": "Logos" },
  "joker": 3,
  "cheats": []
}
```

| Field | What to enter |
|---|---|
| `id` | Name shown on the site, e.g. `"Quiz 1"` or `"Grand Finale"` |
| `date` | `"YYYY-MM-DD"`, or `null` |
| `theme` | The night's theme, or `null` |
| `attendees` | Who went. Names must match the `players` list at the top of the file exactly, so typos get caught |
| `guests` | Optional. People at the table who aren't on the players list |
| `teamSize` | Optional when `attendees` is filled in: it's counted as attendees plus guests. Teams of 7 or more lose points on the night (7: -1, 8: -3, 9: -6, 10: -10) |
| `place` | Final position on the night |
| `rounds` | All 8 round scores in order, each 0-11. Decimals are fine |
| `topics` | Topics for the weekly rounds 4, 5 and 7 |
| `joker` | The round number (1-8) the joker was played on |
| `cheats` | Any of `"reinforcements"`, `"tripleJoker"`, `"noYou"`, `"afk"`. Leave `[]` if none |
| `manualTotal` | Optional. Only for nights where the round scores weren't written down. Overrides `rounds` |

For an AFK night, leave out `rounds` and set `"cheats": ["afk"]`. The night scores the average of every other night.

Remember the comma between nights. If an entry is wrong, the site shows a message saying which night and what to fix.

## Players

The top of each season file lists the team, which is what the "Who went" table is built from:

```json
{ "season": 4, "players": ["Tudor", "Ana", "Bogdan"], "nights": [ ... ] }
```

When someone joins mid-season, add them to `players`. Earlier nights will show them as not attending.

## Personal standings

Record what each person did in each round, by round number. Leave out anyone who did nothing in a round:

```json
"personal": {
  "1": { "Marc": { "ci": 1 }, "Muri": { "save": 1 } },
  "3": { "Alin": { "lacheala": 1 }, "Iakkel": { "duelWon": 1 } },
  "8": { "Marc": { "duelLost": 1 } }
}
```

| Key | Category | Points |
|---|---|---|
| `ci` | CI (contributie individuala): only this person knew the answer | +1 |
| `save` | Save: changed a wrong answer to the right one at the last minute | +1.5 |
| `lacheala` | Lacheala: confidently gave a wrong answer | −1.5 |
| `duelWon` | Duel won: two people disagreed, their answer was written and it was right | +1 |
| `duelLost` | Duel lost: their answer was written and it was wrong | −1 |

A red question is worth double, so enter it as 2 (e.g. `"ci": 2`). The site applies the point values itself. To change them, edit `PERSONAL` in `js/scoring.js` and every night is re-scored.

The league table ranks by points, then points per night, then most saves, then fewest lachealas. P is nights attended. Form covers the last 5 nights the person attended.

## BeerTracker

Each night can list who drank what:

```json
"beers": {
  "Iakkel": { "Ursus": 3, "Guinness": 1 },
  "Dragos": { "Ciuc Radler": 2 }
}
```

Beer names are matched ignoring capitals and extra spaces, so `Ursus` and `ursus ` count as the same beer. The site shows the first spelling it finds. Only nights with a `beers` entry count towards the per-night averages, so a night you forgot to log doesn't pull them down.

The page only shows how many beers each person drank, not which ones, but the beer names are kept in the data. If you know each person's total but not which beer they drank, use `"Unknown"` as the beer name for them. You can optionally add a separate `beerTypes` with the night's real totals per beer:

```json
"beers": {
  "Marc": { "Unknown": 7 },
  "Dragos": { "Unknown": 6 }
},
"beerTypes": { "Birra": 18, "Ciuc": 12 }
```

`beerTypes` only shows up as a note in that night's details. If both are given, their totals must match — the site flags it if they don't.

## Starting a new season

1. Create `data/season-5.json` containing `{ "season": 5, "players": [], "nights": [] }`.
2. In `data/seasons.json`, add it at the top of the list, set `"current": 5`, and change the previous season's status to `"finished"`.

## Running it locally

The page loads its data with `fetch`, so opening `index.html` straight from disk won't work. Serve the folder instead:

```
py -m http.server 8765
```

Then open http://localhost:8765.

## Tests

```
node --test tests/
```

These check the scoring against the Season 3 numbers from the original workbook.

## Publishing on GitHub Pages

1. Create an empty repository on GitHub, e.g. `sieeeeerus`.
2. Push this folder: `git remote add origin https://github.com/<you>/sieeeeerus.git` then `git push -u origin main`.
3. On GitHub, go to Settings, then Pages. Under "Build and deployment", choose "Deploy from a branch", then `main` and `/ (root)`.
4. The site goes live at `https://<you>.github.io/sieeeeerus/`.
