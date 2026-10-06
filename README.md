# Sieeeeerus quiz tracker

Pub quiz results for team Sieeeeerus, season by season. A plain static site (HTML, CSS, JS, no build step) meant for GitHub Pages.

Season 3 was moved over from `Sieeeeerus.xlsx`. The scoring code reproduces every number from that workbook, and `tests/` checks that it still does.

## Logging a quiz night

Add an entry to the end of the `nights` list in `data/season-4.json`. You can do this from the GitHub website: open the file, click the pencil icon, edit, then commit. The site updates a minute or two later.

```json
{
  "id": "Quiz 1",
  "date": "2026-10-02",
  "theme": "Movies / Board games",
  "teamSize": 7,
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
| `teamSize` | 1-10. Teams of 7 or more lose points on the night (7: -1, 8: -3, 9: -6, 10: -10) |
| `place` | Final position on the night |
| `rounds` | All 8 round scores in order, each 0-11. Decimals are fine |
| `topics` | Topics for the weekly rounds 4, 5 and 7 |
| `joker` | The round number (1-8) the joker was played on |
| `cheats` | Any of `"reinforcements"`, `"tripleJoker"`, `"noYou"`, `"afk"`. Leave `[]` if none |
| `manualTotal` | Optional. Only for nights where the round scores weren't written down. Overrides `rounds` |

For an AFK night, leave out `rounds` and set `"cheats": ["afk"]`. The night scores the average of every other night.

Remember the comma between nights. If an entry is wrong, the site shows a message saying which night and what to fix.

## Starting a new season

1. Create `data/season-5.json` containing `{ "season": 5, "nights": [] }`.
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
