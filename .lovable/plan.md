
Big batch of fixes + features for `src/routes/index.tsx` and `src/styles.css`. One mode (the existing auto-battler) gets a lot of polish, plus a new lightweight "Catch & Gym" mode scaffolded so we can flesh it out next round.

## 1. Power & evolution rebalance
- **Mega forms**: damage ×1.6, HP ×1.5 (was ~1.3/1.3).
- **G-Max forms**: damage ×1.7, HP ×1.8 (chonky, hard hits).
- **Plus Evolution** (new tier between normal final and Mega/G-Max): when a Pokémon has no Mega/Gmax/regional variety available, the evolution timer instead grants "+ Form": damage ×1.25, HP ×1.25, speed ×1.1, glowing aura, prefix "✦". Cheaper than Mega so picking a Caterpie still isn't useless.
- All applied as multipliers on the existing `MonData` at evolve time.

## 2. Lobby QoL
- **Delete All Selected** button next to the picker.
- **Infinite Coins** toggle (dev/test) → sets coins to 999,999 and locks writes.
- **Coin floor**: every shop purchase and every losing bet clamps balance to **≥ 10**. Bets above `coins - 10` are auto-capped. Shop buttons disable if `coins - price < 10`.
- **Custom lobby background**: upload image (data URL, `localStorage["ppb-lobby-bg"]`) + reset-to-default button. Already partly stubbed; finishing the UI.
- **Pick more than battle size**: if `picks.length > battleSize`, randomly draw `battleSize` from picks at battle start (keep team distribution where possible).

## 3. Sorting fixes
- **Type filter bug**: today it only checks `mon.type` which is the primary type stored on the curated list. Fix: load secondary types from PokéAPI (`/pokemon/{id}`), cache, and match on either; also widen the per-gen catalog so filtering by Type across "All gens" actually iterates all 1025 ids, not just the curated subset.
- Add **"Evolutions" sort**: bucket 1/2/3/4, where 4 = has any of Mega/G-Max/Regional/Plus past the base. Computed from species `varieties` + chain length.
- Verify Generation + Rarity filters still apply on top of Type (currently they short-circuit) — combine with AND, not OR.

## 4. Performance
- Drop React state updates from ~30fps → **15fps** for non-critical UI (HP bars, timers). Projectile rendering stays at rAF via direct DOM refs (escape hatch: `useRef` + `transform` writes, no re-render).
- Replace per-frame `.filter()`/`.map()` allocations in `step()` with index loops + in-place splicing.
- Skip `<img>` re-render by keying purely on `mon.uid` and never mutating the src attr; sprite swap on evolve uses a separate layer.
- Stop reading `localStorage` inside render — read once, keep in state.

## 5. Special attack coverage
- Extend `SPECIALS` map so every species 1..1025 either has a hand-picked entry or maps via a deterministic `signatureFor(id, type)` that picks from a per-type pool of ~6 named moves (e.g. Electric → Thunderbolt / Volt Tackle / Zap Cannon / Discharge / Wild Charge / Spark). Result: no two Pokémon of the same type share the same exact name unless coincident, and every mon shows a real move name.

## 6. Battle screen polish
- **Next-evolution countdown**: small badge under each mon showing `Evo in 8s` (or `Mega in 8s` / `Plus in 8s`) using the per-mon `evolveTimer`. Hides when no evolution path.
- **Rotom (#479)**: every 3 seconds, rotate sprite + type + signature across its forms (Heat/Wash/Frost/Fan/Mow). Implemented as a per-mon "morph" interval set up at battle start when `speciesId === 479`.
- **Fullscreen button**: requests fullscreen on the arena wrapper via `el.requestFullscreen()` and scales the arena to viewport with CSS `transform: scale(fit)`.

## 7. New mode: Catch & Gym (scaffold)
- New top-level screen toggle in lobby: **Auto-Battler** | **Catch & Gym**.
- Catch & Gym v1 (scaffold only — playable loop, not a full game):
  - **Starter pick** (3 starters from a random gen).
  - **Grass walking**: arrow keys / on-screen dpad on a tiny 10×10 grid, random encounter → mini battle (reuses the existing battle engine, 1v1) → "Throw Pokéball" button with catch chance based on remaining HP %.
  - **Team box**: caught Pokémon stored in `localStorage["ppb-team"]`, max 6 active.
  - **Gym Leaders**: 4 placeholder gyms (Rock/Water/Electric/Grass leaders), each a 3v3 fight. Beat all 4 → "Champion" screen.
  - Stats AND type matchups matter heavily here: damage formula uses real `atk/def` ratios (no flattening), and crit chance scales with speed.
  - Abilities: pull `abilities[0]` from PokéAPI per mon; light effect map (e.g. Blaze → +20% fire dmg under 33% HP, Torrent same for water, Static → 20% chance to paralyze on hit = skip one attack). Unmapped abilities just display the name.
- This mode lives in the same file under `screen === "catch"` so the existing game is untouched.

## 8. Files
```text
src/routes/index.tsx      ← almost all changes
src/styles.css            ← .anim-plus-aura, .fullscreen-arena
```

No new packages, no backend. All persistent state via `localStorage`.
