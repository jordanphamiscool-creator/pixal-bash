
Huge batch. Grouping into 6 chunks, all edits confined to `src/routes/index.tsx` + `src/styles.css`. No new packages.

## 1. Battle engine upgrades

- **45s Sudden Damage**: at `matchTime >= 45s`, apply a global `damageMult = 2` to every attack (both sides). Banner: "⚔️ SUDDEN DAMAGE — ×2!". Stacks with events.
- **Crits**: every attack rolls crit chance = `min(0.35, 0.05 + speed/400 + (isSpecial?0.05:0))`. Crits do ×1.75, show gold "CRIT!" popup + brief screen shake.
- **Multi-move loadout**: each mon gets 3 moves picked from a per-type pool (Tackle-tier basic + 2 flashy). AI picks weighted by cooldown/HP context. Move object: `{name, power, type, effect?, anim}`.
- **Status effects**:
  - `burn` – tick 3% max HP/s, orange flame overlay, ×0.85 dmg dealt.
  - `poison` – tick 4% max HP/s (ramping), purple bubbles.
  - `freeze` – 30% chance skip attack, blue ice tint, thaws over 4s.
  - `paralyze` – 25% skip, yellow spark tint.
  - Applied by move `effect` field (e.g. Flamethrower 20% burn). Icons under HP bar.
- **Per-move animations** (each is a distinct CSS/DOM effect, not a recolored bolt):
  - Flame stream, water pulse, leaf spiral, lightning strike from sky, ice shards, psychic wave, shadow orb, rock throw arc, dragon beam, poison cloud, punch dash, bite lunge, hyper-beam laser. Registered in a `MOVE_FX` map keyed by move name → renderer.
- **Fight during countdown**: remove the `if (countdown>0) return` guard in `step()`; only lock movement, allow idle animations + wandering. Actually — user wants them to *fight*: allow full combat, just show the countdown banner overlaid. Simpler: fights start immediately, countdown becomes cosmetic HUD.

## 2. Event visualizations (real, not just text)

Each event triggers an on-screen effect:
- **Meteor shower** → 8 meteors fall from top, on impact each hits nearest mon for 15 dmg + burn 20%.
- **Thunder strike** → 3 lightning bolts from sky pick random mons, 25 dmg + 40% paralyze.
- **Healing rain** → blue droplets fall over arena, +2 HP/s to all for 6s.
- **Blizzard** → snow drift + 15% freeze roll per mon.
- **Sandstorm** → sand haze overlay, 5 dmg/s to non-Rock/Ground.
- **Earthquake** → arena shakes, 20 dmg to all grounded.
- **Solar flare** → white flash + Fire moves ×2 for 8s.
- **Shiny storm** → all sprites get gold/hue-rotate for 10s (visual only).
- **Teleport chaos** → all mons swap positions with a warp flash.
- **Frenzy** → red aura, attack cooldowns ×0.4 for 6s.
- **Sudden death** → HP bars drain 5%/s until KO.
- **Double XP** → gold particles + evolve timers ×0.3.

All rendered via an events-layer div with keyframed elements.

## 3. Twenty flashiness / dopamine features

1. Combo counter (chains of hits within 1.5s), on-screen "×5 COMBO!" with escalating pitch color.
2. Kill streak announcer: "DOUBLE KO!", "TRIPLE KO!", "RAMPAGE!".
3. Screen shake on crits + KOs (CSS var driven).
4. Chromatic aberration flash on Sudden Damage / KO.
5. Hit-stop: 80ms freeze frame on crits.
6. Slow-mo final blow: last 20% HP of last enemy → 0.5× time for 1.2s.
7. Damage-number stacking with escalating font-size per combo hit.
8. Confetti + fireworks on victory (already partial, expand to 6s + sparks).
9. Announcer text banner ("Pikachu is on fire!" after 3 kills).
10. Type-effectiveness popup ("Super Effective!" in colored badge, "Not very effective…").
11. Move-name banner slides in bottom when a special fires.
12. Rainbow shiny trail on any mon over 5 KOs.
13. Boss aura on last-standing mon (pulsing red glow).
14. Camera zoom-in on 1v1 last duel.
15. Ambient particle drift matching arena theme (grass motes, snowflakes, embers).
16. Hype meter bar filling per hit; when full → 10s "OVERDRIVE" (all ×1.3 dmg).
17. Random crowd cheer SFX substitute via Web Audio bleeps on KO (togglable).
18. On-hit color splashes matching move type.
19. Post-match "Play of the Game" — replays the single biggest damage event as a slowed animation.
20. Score ticker in header (kills / dmg dealt live, per team).

## 4. Catch & Gym fixes + 10 new ideas

**Fix**: Wild Pokémon actually attack back. Currently the wild mon just stands there. Rework `CGBattle`:
- Turn-based: player picks Fight (menu of 4 moves) / Bag / Ball / Run.
- On Fight: player move → damage w/ crit + status → wild mon retaliates with its own move (from pool) → tick statuses.
- Wild mon HP bar, level, name shown.
- Gym leader battles: 3v3, wild mon behavior applied to each leader mon in sequence.

**Gym perks bugfix**: currently perks are gated by quiz/win but never toggled on. On `beatGym(gymId)`:
```
setPerks(p => ({...p, [PERKS[gymId]]: true}))
```
And gate map interactions (`canCut`, `canSurf`, `canStrength`, `canFly`) on the perks object, not on a variable that's never updated. Also persist to localStorage.

**10 new C&G ideas**:
1. **Shiny hunt** – 1/512 chance per encounter, sparkle SFX, ×2 sell/trade value.
2. **Egg hatching** – daycare gives egg after 200 steps, hatches to random starter.
3. **Weather on overworld** – rain boosts Water spawns, sun boosts Fire.
4. **Time-of-day evolutions** – Eevee → Umbreon at night, Espeon at day.
5. **Contest hall** – mini rhythm game, wins ribbons.
6. **Safari zone** – no damage, throw-only, timer + step limit.
7. **Battle Tower** – 21 straight fights with rental teams, leaderboard.
8. **Regional variants** – Alolan/Galarian forms as separate catches.
9. **Trade evolutions** – Machoke → Machamp via NPC trader.
10. **Team battle mode** – 2v2 doubles with spread moves.

## 5. Files & effort

```text
src/routes/index.tsx     ← ~90% of the work
src/styles.css           ← ~20 new keyframes / classes (meteors, lightning, rain, shake, aberration, combo pop, boss aura, particles)
```

## 6. Technical notes

- `MOVES` registry: `Record<string, { name; type; power; cd; effect?: StatusKind; effectChance?; fx: FxKind }>`.
- `MOVE_FX`: `Record<FxKind, (opts)=>DOMEffect>` – imperatively appends absolutely-positioned divs to arena and removes on animation end.
- Status stored on `MonData`: `statuses: {kind, until, tickAt}[]`.
- Event visuals share the same DOM-effect helper.
- Speed multiplier already exists; new global `damageMult` folds in at 45s.
- Combat during countdown: drop the early-return in `step()`, keep countdown as HUD only.
- Perks: single `perks` state object persisted to `localStorage["ppb-perks"]`.

Big diff but self-contained. Ready to build on approval.
