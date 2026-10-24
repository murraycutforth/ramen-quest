# 🍜 Murray & Liat's Ramen Quest

A small mobile-first web app for working through every ramen restaurant in Oxford, rating each
one separately, and watching the progress bar fill up. It's a static site on GitHub Pages, and the
repo doubles as the database.

**Live:** https://murraycutforth.github.io/ramen-quest/

## How it works

- `data/restaurants.json` holds the list of places and `data/visits.json` holds visits and ratings.
- The app reads both through the GitHub Contents API, which avoids the Pages CDN lag. If that
  fails it falls back to the published copy.
- Saving commits straight to this repo through the Contents API, using a token stored only in
  your phone's browser. Every change becomes a readable commit, e.g.
  `🍜 Murray rated Ramen Kulture (4.5)`.
- If you're offline, or both of you save at once, changes queue on the phone and get replayed on
  top of the latest data. No one's rating gets overwritten.

> The repo is public, so ratings and notes are public too. Keep notes friendly.

## Setting up your phone

1. Open the site and pick **Murray** or **Liat** when asked.
2. Create a token (once per person):
   - GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens →
     Generate new token**
   - **Repository access:** *Only select repositories* → `ramen-quest`
   - **Permissions → Repository permissions → Contents:** *Read and write* (leave everything
     else as *No access*; *Metadata: read* is added automatically)
   - Choose an expiry (a year is fine) and generate the token, then copy it.
3. In the app, go to **⚙️ Settings → Saving key**, paste the token, and tap **Save**. Then tap
   **Test connection**.
4. Add it to your home screen: **Share → Add to Home Screen** on iOS Safari, or **⋮ → Add to
   Home screen / Install app** on Android Chrome.

The token lives in that browser's `localStorage` and nowhere else. **Remove token** in Settings
deletes it. Without a token the app still works, but read-only.

## Adding a restaurant

**In the app:** Settings → *Add a restaurant*. Fill in the details, tap the map to drop a pin, and
tick *Side quest* for chains and places where ramen is a side dish.

**By hand:** add an entry to `data/restaurants.json` (see the existing ones for the shape) with a
kebab-case `id` that will never change. Get the coordinates from
[OpenStreetMap](https://www.openstreetmap.org) (right-click → *Show address*) and run the
validator before committing:

```sh
node scripts/validate-data.mjs
```

If a place closes, set `"active": false`. It stays in the app, greyed out, ratings and all, and
doesn't count against the quest unless you'd already been.

## Development

No build step and no dependencies.

```sh
python3 -m http.server 8080        # then open http://localhost:8080
node --test tests/*.test.mjs       # scoring + merge logic tests
node scripts/validate-data.mjs     # check the data files
```

Layout: `js/main.js` (boot, header, routing glue), `js/store.js` (cache, pending-op queue, sync),
`js/github.js` (Contents API), `js/ops.js` (pure data ops and merging), `js/scoring.js` (pure
scores and stats), `js/views/*` (one module per screen). The map is
[Leaflet](https://leafletjs.com/) with © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors tiles, and it only loads the first time you open the Map tab.
