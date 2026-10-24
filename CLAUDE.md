# Ramen Quest: notes for Claude Code

Static, no-build, vanilla-JS PWA on GitHub Pages for Murray & Liat to rate Oxford ramen. Key rules:

- **External deps are only Leaflet 1.9.4 (unpkg, with SRI) and the Fredoka Google Font.** Ask before adding anything.
- **All paths relative**: the site is served from `/ramen-quest/`.
- **Never commit, log or put a token in a URL.** Tokens live in `localStorage` (`rq.token`) only; `github.js` puts them in the Authorization header and nowhere else.
- **Data changes go through ops** (`js/ops.js`): `rate`, `unrate`, `deleteVisit`, `addRestaurant`. `store.flush()` refetches, replays pending ops, and PUTs with the sha, retrying on 409/422 up to 3 times. Per-person rating merges are last-`updatedAt`-wins. Keep `ops.js` and `scoring.js` pure (no DOM) so `node --test` can cover them.
- After editing `data/*.json`, run `node scripts/validate-data.mjs`. Run `node --test tests/*.test.mjs` after touching scoring/ops.
- Restaurant coordinates come from OSM Nominatim, geocoded once at dev time (1 req/s, descriptive User-Agent). Never geocode at runtime, and never scrape Google Maps or TripAdvisor.
- Main quest vs side quest (`bonus: true`): chains and places where ramen is a side dish are side quests. Red Star Noodle Bar (Cowley Rd) and Sushi Bowl (Covered Market) were deliberately left out (Oct 2026).
- Test at 375px (and 360px) wide. Respect `prefers-reduced-motion` and dark mode (tokens on `:root`).
- When you change files in the app shell, bump `VERSION` in `sw.js`.
- `globalThis.RQ_API_BASE` is a test-only hook for pointing `github.js` at a mock API.
