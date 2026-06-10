This is a large set of changes. I'll ship them in one pass, focused on the file `src/routes/index.tsx` plus a small CSS tweak. Here's exactly what I'll do.

## Performance
- Throttle the React re-render loop to ~30fps (game logic still runs at full rAF) so the DOM update cost drops in half.
- Reuse sprite `<img>` nodes with stable keys to stop layout thrash.
- Skip drawing offscreen/dead projectiles and cap projectile array length.
- Preload sprite + cry the moment a mon is locked in (so battle start is smooth).
- Cache catalog + species data in `localStorage` so repeat lobbies don't re-hit the API.

## Balance (longer fights)
- Cut all damage globally (~40%).
- Reduce stat influence: damage now uses `0.7 + 0.6 * (atk/100)` instead of scaling 1:1, so a Caterpie still loses to Dialga but a mid-tier mon isn't useless.
- Bump base HP multiplier so fights last roughly 2–3× longer.
- Type effectiveness chart unchanged.

## Evolution
- New lobby slider: **Evolution timer** from 6s to 25s (also applies in custom mode).
- New custom-mode toggle per picked mon: **"Evolve this one"** — when on, that mon evolves/megas/Gmaxes at the timer tick.
- Final-stage logic: when a mon is already at its last evolution but has a Mega / G-Max / alternate form, the timer turns it into that form. If multiple alt-forms exist (e.g. Mega X + Mega Y, or Mega + G-Max), one is picked at random. Forms are looked up from PokéAPI species' `varieties` list.

## Random roster fix
- Old code was biased toward starters/legendaries via the curated evo lines. New random pulls uniformly from the full catalog (1..1025 species + their varieties), then attaches evolution chain on the fly via `/pokemon-species/{id}/evolution_chain`.
- Lobby now **shows the random roster up front** so you can bet before the round starts.

## Custom teams
- In Teams mode, each picked slot has a **Red / Blue** team selector — so 7v1, 5v3, etc. are all valid as long as both teams have ≥1 mon.
- Battle size slider now goes 2–14.

## Pause & drag
- New **Pause** button (already had Pause/Resume; now while paused you can click+drag any mon around the arena to reposition it). Drag uses pointer events; release resumes positioning but stays paused until you click Resume.

## Missing sprites (Gen 9 megas etc.)
- Sprite fallback chain extended: animated → official-artwork → `front_default` → **Pokémon Showdown** sprite by name (`https://play.pokemonshowdown.com/sprites/gen5/{slug}.png`) → **Serebii** dex artwork by id → generic type-colored placeholder. The Showdown CDN covers most fan-named forms PokéAPI lacks images for.

## Shop & coins
- Starting coins: **250** (existing players keep their current balance unless it's the default 100, in which case it's bumped to 250 on first load of this version via a migration flag).
- New **Shop** tab in the lobby with three categories:
  - **Backgrounds** (5 options: Grass, Sand, Snow, Volcano, Lobby-fanart). Owned ones are selectable.
  - **Win effects** (3: Confetti, Fireworks, Pixel rain).
  - **Abilities** (2 consumable powers usable once per round): **Pick Winner** (50% chance, costs 75 coins) and **Manual Evolve** (force-evolve a friendly mon now, 40 coins).
- Custom lobby background: upload an image (stored as data-URL in localStorage) to use as the lobby backdrop.
- All shop state persisted in `localStorage` under `ppb-shop-v1`.

## Pre-bet visibility
- Random rosters render in the lobby with name + sprite + type before the **Place bet / Start** button is enabled, so you can bet meaningfully on random battles too.

## Sorting filters (custom picker)
- New filter bar: **Generation** (1–9), **Type** (all 18), **Rarity** (Legendary / Mythical / Ultra Beast / Normal). Lists derived from hard-coded id ranges and a small rarity set (no extra API calls needed for gen/rarity buckets).

## Technical sketch

```text
src/routes/index.tsx
  + SHOP state, persisted              (~120 lines)
  + filters (gen/type/rarity)           (~60 lines)
  + custom team assignment UI           (~40 lines)
  + evolution timer slider + per-mon evolve toggle
  + pause-drag pointer handlers         (~50 lines)
  + alt-form resolution via species varieties
  + sprite fallback chain util
  + render throttle (30fps)
  - damage/HP balance tweaks
  - random roster: uniform sample from full catalog

src/styles.css
  + bg-* utility classes for shop backgrounds
```

No backend changes, no new packages. Everything stays client-side and uses `localStorage`.