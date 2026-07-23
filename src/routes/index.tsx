import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pixel Pocket Brawl — Full Pokédex Auto-Battler" },
      { name: "description", content: "Top-down auto-battler with all 1025 Pokémon, Mega/Gigantamax forms, betting, shop, custom teams, and pause-and-drag." },
    ],
  }),
  component: Game,
});

// ============================================================
// Types
// ============================================================
type ElementType = "normal" | "fire" | "water" | "grass" | "electric" | "psychic" | "rock" | "ground" | "flying" | "ice" | "ghost" | "dragon" | "dark" | "steel" | "fighting" | "bug" | "fairy" | "poison";
type AttackKind = "fireball" | "waterjet" | "leaf" | "lightning" | "psybeam" | "rock" | "iceshard" | "shadowball" | "dragonpulse" | "punch" | "bugbuzz" | "fairywind";
type Mode = "ffa" | "teams";
type Screen = "lobby" | "battle" | "shop" | "catch";

type MonData = {
  uid: string;
  id: number;
  speciesId: number;
  name: string;
  type: ElementType;
  color: string;
  sprite: string;
  cry: string | null;
  baseHp: number; baseAtk: number; baseDef: number; baseSpd: number;
  signature: { name: string; kind: AttackKind; dmg: number };
  basic: { name: string; kind: AttackKind; dmg: number };
  evolveTo?: MonData;
  isMega?: boolean;
  isGmax?: boolean;
  isRegional?: boolean;
};

type Vec = { x: number; y: number };
type MonState = {
  pos: Vec; vel: Vec; hp: number; maxHp: number;
  team: number;
  lastAttack: number; lastSpecial: number; evolveTimer: number;
  hitFlash: number; attackFlash: number; evolveFlashUntil: number;
  data: MonData;
  evolveEnabled: boolean;
  plusLevel: number; // 0=base, 1=plus-evolved (when no real evo available)
  shiny?: boolean; // 1/64 sparkle variant, +8% dmg
  morphIds?: number[]; // for Rotom-style cyclers
  morphIdx?: number;
  morphLastSwap?: number;
};
type Projectile = {
  id: number; fromIdx: number; targetIdx: number;
  from: Vec; pos: Vec; angle: number;
  color: string; dmg: number; crit: boolean; kind: AttackKind;
  bornAt: number; duration: number;
  eff?: number; // type effectiveness of the hit
};
type Pop = { id: number; x: number; y: number; value: number; crit: boolean; bornAt: number; color: string };
type LogEntry = { id: number; text: string; color: string };

// Custom-mode pick: choose a Pokémon, set team, and optionally let it evolve
type Pick = { mon: MonData; team: number; evolve: boolean };

// ============================================================
// Constants
// ============================================================
const ARENA_W = 800, ARENA_H = 540, MON_R = 26, ATTACK_RANGE = 260;
const ABILITY_COOLDOWN_BASE = 2000;
const SPECIAL_COOLDOWN_BASE = 8000;
const EVOLVE_FLASH_MS = 1400;
const TEAM_COLORS = ["#ff5566", "#4ea8ff"];
const TEAM_NAMES = ["RED TEAM", "BLUE TEAM"];
const STARTING_COINS = 250;

const TYPE_COLORS: Record<ElementType, string> = {
  normal: "#c8c4a8", fire: "#ff7a3d", water: "#4ea8ff", grass: "#6bd36b",
  electric: "#ffd83a", psychic: "#d976ff", rock: "#c4a76a", ground: "#d4b06a",
  flying: "#a0c8ff", ice: "#7dd6ff", ghost: "#9d6bff", dragon: "#f0b84a",
  dark: "#7a6b5e", steel: "#b8b8c8", fighting: "#e88a4f", bug: "#a4d850",
  fairy: "#ffb6e0", poison: "#b86ec8",
};
const TYPE_KIND: Record<ElementType, AttackKind> = {
  normal: "punch", fire: "fireball", water: "waterjet", grass: "leaf",
  electric: "lightning", psychic: "psybeam", rock: "rock", ground: "rock",
  flying: "fairywind", ice: "iceshard", ghost: "shadowball", dragon: "dragonpulse",
  dark: "shadowball", steel: "punch", fighting: "punch", bug: "bugbuzz",
  fairy: "fairywind", poison: "shadowball",
};
const GENERIC_MOVES: Record<ElementType, [string, string]> = {
  normal: ["Tackle", "Hyper Beam"], fire: ["Ember", "Flamethrower"],
  water: ["Water Gun", "Hydro Pump"], grass: ["Vine Whip", "Solar Beam"],
  electric: ["Spark", "Thunder"], psychic: ["Confusion", "Psychic"],
  rock: ["Rock Throw", "Stone Edge"], ground: ["Mud Slap", "Earthquake"],
  flying: ["Gust", "Hurricane"], ice: ["Icy Wind", "Blizzard"],
  ghost: ["Lick", "Shadow Ball"], dragon: ["Dragon Breath", "Outrage"],
  dark: ["Bite", "Dark Pulse"], steel: ["Metal Claw", "Iron Tail"],
  fighting: ["Karate Chop", "Close Combat"], bug: ["Bug Bite", "Bug Buzz"],
  fairy: ["Fairy Wind", "Moonblast"], poison: ["Acid", "Sludge Bomb"],
};
const TYPE_CHART: Partial<Record<ElementType, Partial<Record<ElementType, number>>>> = {
  fire: { grass: 2, ice: 2, bug: 2, steel: 2, water: 0.5, fire: 0.5, rock: 0.5, dragon: 0.5 },
  water: { fire: 2, rock: 2, ground: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
  grass: { water: 2, rock: 2, ground: 2, fire: 0.5, grass: 0.5, bug: 0.5, dragon: 0.5, flying: 0.5, poison: 0.5, steel: 0.5 },
  electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  rock: { fire: 2, ice: 2, bug: 2, flying: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
  ground: { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0 },
  flying: { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
  ice: { grass: 2, ground: 2, flying: 2, dragon: 2, fire: 0.5, water: 0.5, ice: 0.5, steel: 0.5 },
  ghost: { ghost: 2, psychic: 2, dark: 0.5, normal: 0 },
  dragon: { dragon: 2, fairy: 0, steel: 0.5 },
  dark: { ghost: 2, psychic: 2, fighting: 0.5, dark: 0.5, fairy: 0.5 },
  steel: { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
  fighting: { normal: 2, rock: 2, ice: 2, dark: 2, steel: 2, flying: 0.5, poison: 0.5, bug: 0.5, psychic: 0.5, fairy: 0.5, ghost: 0 },
  bug: { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, flying: 0.5, poison: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
  fairy: { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 },
  poison: { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
};
function typeMult(a: ElementType, d: ElementType) { return TYPE_CHART[a]?.[d] ?? 1; }
function effLabel(m: number) {
  if (m === 0) return " (no effect)";
  if (m >= 2) return " — super effective!";
  if (m <= 0.5) return " — not very effective";
  return "";
}
function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function titleCase(s: string) { return s.split("-").map((w) => w[0] ? w[0].toUpperCase() + w.slice(1) : w).join(" "); }
function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9-]/g, ""); }

// ============================================================
// Generation ranges & rarity sets
// ============================================================
const GEN_RANGES: [number, number][] = [
  [1, 151], [152, 251], [252, 386], [387, 493],
  [494, 649], [650, 721], [722, 809], [810, 905], [906, 1025],
];
function genOf(id: number) {
  for (let i = 0; i < GEN_RANGES.length; i++) {
    const [a, b] = GEN_RANGES[i];
    if (id >= a && id <= b) return i + 1;
  }
  return 0;
}
const LEGENDARY = new Set([144,145,146,150,243,244,245,249,250,377,378,379,380,381,382,383,384,480,481,482,483,484,485,486,487,488,638,639,640,641,642,643,644,645,646,716,717,718,772,773,785,786,787,788,789,790,791,792,800,888,889,890,891,892,894,895,896,897,898,905,1001,1002,1003,1004,1007,1008,1014,1015,1016,1017]);
const MYTHICAL = new Set([151,251,385,386,489,490,491,492,493,494,647,648,649,719,720,721,801,802,807,808,809,893,1025]);
const ULTRA_BEAST = new Set([793,794,795,796,797,798,799,803,804,805,806]);
function rarityOf(id: number): "legendary" | "mythical" | "ultrabeast" | "normal" {
  if (LEGENDARY.has(id)) return "legendary";
  if (MYTHICAL.has(id)) return "mythical";
  if (ULTRA_BEAST.has(id)) return "ultrabeast";
  return "normal";
}

// ============================================================
// Storage helpers
// ============================================================
function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function lsSet(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ============================================================
// Coins (with 250 migration)
// ============================================================
function readCoins(): number {
  if (typeof window === "undefined") return STARTING_COINS;
  const migrated = localStorage.getItem("ppb-coins-v2");
  const v = localStorage.getItem("ppb-coins");
  if (!migrated) {
    localStorage.setItem("ppb-coins-v2", "1");
    if (v === null || Number(v) < STARTING_COINS) {
      localStorage.setItem("ppb-coins", String(STARTING_COINS));
      return STARTING_COINS;
    }
  }
  if (v === null) return STARTING_COINS;
  const n = Number(v);
  return Number.isFinite(n) ? n : STARTING_COINS;
}
function writeCoins(n: number) {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("ppb-infinite") === "1") { localStorage.setItem("ppb-coins", "999999"); return; }
  localStorage.setItem("ppb-coins", String(Math.max(10, Math.round(n))));
}
const MIN_COINS = 10;

// ============================================================
// Signature moves (curated, falls back to generic)
// ============================================================
const SPECIALS: Record<number, { name: string; kind: AttackKind; dmg: number }> = {
  1:{name:"Vine Whip",kind:"leaf",dmg:14},2:{name:"Razor Leaf",kind:"leaf",dmg:18},3:{name:"Solar Beam",kind:"leaf",dmg:24},
  4:{name:"Ember",kind:"fireball",dmg:14},5:{name:"Flamethrower",kind:"fireball",dmg:18},6:{name:"Blast Burn",kind:"fireball",dmg:26},
  7:{name:"Water Gun",kind:"waterjet",dmg:14},8:{name:"Bubble Beam",kind:"waterjet",dmg:18},9:{name:"Hydro Pump",kind:"waterjet",dmg:24},
  25:{name:"Thunderbolt",kind:"lightning",dmg:20},26:{name:"Thunder",kind:"lightning",dmg:26},
  65:{name:"Psychic",kind:"psybeam",dmg:24},68:{name:"Dynamic Punch",kind:"punch",dmg:24},
  76:{name:"Stone Edge",kind:"rock",dmg:24},94:{name:"Shadow Ball",kind:"shadowball",dmg:22},
  131:{name:"Blizzard",kind:"iceshard",dmg:24},143:{name:"Body Slam",kind:"punch",dmg:22},
  144:{name:"Blizzard",kind:"iceshard",dmg:30},145:{name:"Thunder",kind:"lightning",dmg:30},146:{name:"Sky Attack",kind:"fireball",dmg:30},
  149:{name:"Hyper Beam",kind:"dragonpulse",dmg:28},150:{name:"Psystrike",kind:"psybeam",dmg:32},151:{name:"Aura Sphere",kind:"fairywind",dmg:28},
  157:{name:"Eruption",kind:"fireball",dmg:28},160:{name:"Hydro Cannon",kind:"waterjet",dmg:28},
  248:{name:"Stone Edge",kind:"rock",dmg:28},249:{name:"Aeroblast",kind:"fairywind",dmg:30},250:{name:"Sacred Fire",kind:"fireball",dmg:30},
  254:{name:"Frenzy Plant",kind:"leaf",dmg:28},257:{name:"Blaze Kick",kind:"fireball",dmg:26},260:{name:"Hydro Pump",kind:"waterjet",dmg:26},
  445:{name:"Outrage",kind:"dragonpulse",dmg:28},448:{name:"Aura Sphere",kind:"fairywind",dmg:26},
  483:{name:"Spacial Rend",kind:"dragonpulse",dmg:32},484:{name:"Roar of Time",kind:"dragonpulse",dmg:32},487:{name:"Shadow Force",kind:"shadowball",dmg:32},
  493:{name:"Judgment",kind:"fairywind",dmg:32},643:{name:"Blue Flare",kind:"fireball",dmg:32},644:{name:"Bolt Strike",kind:"lightning",dmg:32},
  646:{name:"Glaciate",kind:"iceshard",dmg:30},716:{name:"Geomancy",kind:"fairywind",dmg:30},718:{name:"Dragon Pulse",kind:"dragonpulse",dmg:30},
  800:{name:"Photon Geyser",kind:"psybeam",dmg:32},898:{name:"Astral Barrage",kind:"shadowball",dmg:32},
  1007:{name:"Glaive Rush",kind:"dragonpulse",dmg:32},1008:{name:"Sacred Sword",kind:"punch",dmg:30},
};

// ============================================================
// PokéAPI fetchers (with localStorage cache)
// ============================================================
type CatalogEntry = { id: number; name: string; display: string };
let CATALOG_CACHE: CatalogEntry[] | null = null;
const POKE_CACHE = new Map<number, MonData>();
const SPECIES_CACHE = new Map<number, { evoChainUrl: string; varieties: { name: string; id: number; isDefault: boolean }[]; isLegendary: boolean; isMythical: boolean }>();
const EVOCHAIN_CACHE = new Map<string, number[]>(); // url → species id chain

async function loadCatalog(): Promise<CatalogEntry[]> {
  if (CATALOG_CACHE) return CATALOG_CACHE;
  const cached = lsGet<CatalogEntry[] | null>("ppb-catalog-v1", null);
  if (cached && cached.length > 1000) { CATALOG_CACHE = cached; return cached; }
  const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=1400");
  const json = await res.json();
  const list: CatalogEntry[] = (json.results as { name: string; url: string }[])
    .map((r) => {
      const m = r.url.match(/\/pokemon\/(\d+)\//);
      const id = m ? Number(m[1]) : 0;
      return { id, name: r.name, display: titleCase(r.name) };
    })
    .filter((e) => e.id > 0);
  CATALOG_CACHE = list;
  lsSet("ppb-catalog-v1", list);
  return list;
}

function isMegaName(n: string) { return /(^mega-)|(-mega(-x|-y)?$)/.test(n); }
function isGmaxName(n: string) { return n.includes("-gmax"); }
function isRegionalName(n: string) { return /-(alola|galar|hisui|paldea)/.test(n); }

function bestSprite(j: { sprites?: { other?: Record<string, { front_default?: string }>; versions?: { ["generation-v"]?: { ["black-white"]?: { animated?: { front_default?: string } } } }; front_default?: string }; name: string; id: number; speciesId: number }): string {
  const s = j.sprites;
  const animated = s?.versions?.["generation-v"]?.["black-white"]?.animated?.front_default;
  const official = s?.other?.["official-artwork"]?.front_default;
  const home = s?.other?.["home"]?.front_default;
  const dream = s?.other?.["dream_world"]?.front_default;
  const front = s?.front_default;
  if (j.speciesId <= 649 && animated) return animated;
  if (official) return official;
  if (home) return home;
  if (front) return front;
  if (dream) return dream;
  // Fallback to Showdown CDN by slug (handles many fan-named forms)
  return `https://play.pokemonshowdown.com/sprites/gen5/${slugify(j.name)}.png`;
}

async function fetchMon(id: number, uid: string): Promise<MonData | null> {
  let cached = POKE_CACHE.get(id);
  if (!cached) {
    const stored = lsGet<MonData | null>(`ppb-mon-v2-${id}`, null);
    if (stored) { POKE_CACHE.set(id, stored); cached = stored; }
  }
  if (!cached) {
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      if (!res.ok) return null;
      const j = await res.json();
      const types = (j.types as { slot: number; type: { name: string } }[]).sort((a, b) => a.slot - b.slot).map((t) => t.type.name as ElementType);
      const primary = types[0] || "normal";
      const stats: Record<string, number> = {};
      (j.stats as { stat: { name: string }; base_stat: number }[]).forEach((s) => { stats[s.stat.name] = s.base_stat; });
      const speciesId = Number((j.species.url as string).match(/\/pokemon-species\/(\d+)\//)?.[1] || id);
      const sprite = bestSprite({ sprites: j.sprites, name: j.name, id, speciesId });
      const cry = speciesId <= 1025 ? `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${speciesId}.ogg` : null;
      const sig = SPECIALS[speciesId];
      const kind = TYPE_KIND[primary];
      const atk = stats["attack"] ?? 60;
      const totalForSig = Math.max(atk, stats["special-attack"] ?? 60);
      // Per-type signature pool — every Pokémon gets a real named move via deterministic id hash.
      const TYPE_POOL: Record<ElementType, string[]> = {
        normal: ["Hyper Beam","Body Slam","Giga Impact","Tri Attack","Headbutt","Take Down"],
        fire: ["Flamethrower","Fire Blast","Inferno","Heat Wave","Overheat","Flame Charge"],
        water: ["Hydro Pump","Surf","Aqua Tail","Waterfall","Brine","Liquidation"],
        grass: ["Solar Beam","Energy Ball","Leaf Storm","Giga Drain","Petal Dance","Seed Bomb"],
        electric: ["Thunder","Volt Tackle","Zap Cannon","Discharge","Wild Charge","Spark"],
        psychic: ["Psychic","Psybeam","Psyshock","Future Sight","Stored Power","Psystrike"],
        rock: ["Stone Edge","Rock Slide","Power Gem","Ancient Power","Head Smash","Rock Tomb"],
        ground: ["Earthquake","Earth Power","Bulldoze","Magnitude","Bone Rush","Sand Tomb"],
        flying: ["Hurricane","Air Slash","Brave Bird","Sky Attack","Drill Peck","Aeroblast"],
        ice: ["Blizzard","Ice Beam","Ice Shard","Frost Breath","Icicle Crash","Avalanche"],
        ghost: ["Shadow Ball","Shadow Sneak","Hex","Phantom Force","Astral Barrage","Spectral Thief"],
        dragon: ["Dragon Pulse","Outrage","Draco Meteor","Dragon Claw","Dragon Rush","Spacial Rend"],
        dark: ["Dark Pulse","Crunch","Foul Play","Night Slash","Sucker Punch","Knock Off"],
        steel: ["Iron Tail","Flash Cannon","Meteor Mash","Iron Head","Steel Beam","Bullet Punch"],
        fighting: ["Close Combat","Dynamic Punch","Aura Sphere","Sky Uppercut","Cross Chop","Sacred Sword"],
        bug: ["Bug Buzz","X-Scissor","Megahorn","Signal Beam","First Impression","Lunge"],
        fairy: ["Moonblast","Dazzling Gleam","Play Rough","Disarming Voice","Misty Explosion","Spirit Break"],
        poison: ["Sludge Bomb","Toxic","Gunk Shot","Poison Jab","Cross Poison","Acid Spray"],
      };
      const pool = TYPE_POOL[primary] || TYPE_POOL.normal;
      const sigDmg = sig?.dmg ?? Math.round(10 + totalForSig * 0.12);
      const sigName = sig?.name ?? pool[speciesId % pool.length];
      const sigKind = sig?.kind ?? kind;
      const basicDmg = Math.round(5 + atk * 0.05);
      const name = titleCase(j.name as string);
      cached = {
        uid, id, speciesId, name, type: primary, color: TYPE_COLORS[primary] || "#fff",
        sprite, cry,
        baseHp: stats["hp"] ?? 60, baseAtk: atk, baseDef: stats["defense"] ?? 60, baseSpd: stats["speed"] ?? 60,
        signature: { name: sigName, kind: sigKind, dmg: sigDmg },
        basic: { name: GENERIC_MOVES[primary][0], kind, dmg: basicDmg },
        isMega: isMegaName(j.name), isGmax: isGmaxName(j.name), isRegional: isRegionalName(j.name),
      };
      POKE_CACHE.set(id, cached);
      lsSet(`ppb-mon-v2-${id}`, cached);
    } catch { return null; }
  }
  return { ...cached, uid };
}

async function fetchSpecies(speciesId: number) {
  let s = SPECIES_CACHE.get(speciesId);
  if (s) return s;
  const cached = lsGet<typeof s | null>(`ppb-sp-${speciesId}`, null);
  if (cached) { SPECIES_CACHE.set(speciesId, cached); return cached; }
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${speciesId}`);
    if (!res.ok) return null;
    const j = await res.json();
    const varieties = (j.varieties as { is_default: boolean; pokemon: { name: string; url: string } }[]).map((v) => {
      const id = Number(v.pokemon.url.match(/\/pokemon\/(\d+)\//)?.[1] || 0);
      return { name: v.pokemon.name, id, isDefault: v.is_default };
    });
    s = { evoChainUrl: j.evolution_chain?.url || "", varieties, isLegendary: !!j.is_legendary, isMythical: !!j.is_mythical };
    SPECIES_CACHE.set(speciesId, s);
    lsSet(`ppb-sp-${speciesId}`, s);
    return s;
  } catch { return null; }
}

type ChainNode = { species: { name: string; url: string }; evolves_to: ChainNode[] };
async function fetchEvoChain(url: string): Promise<number[]> {
  if (!url) return [];
  const c = EVOCHAIN_CACHE.get(url);
  if (c) return c;
  const cached = lsGet<number[] | null>(`ppb-ec-${url}`, null);
  if (cached) { EVOCHAIN_CACHE.set(url, cached); return cached; }
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const j = await res.json();
    const ids: number[] = [];
    const walk = (n: ChainNode) => {
      const id = Number(n.species.url.match(/\/pokemon-species\/(\d+)\//)?.[1] || 0);
      if (id) ids.push(id);
      n.evolves_to.forEach(walk);
    };
    walk(j.chain);
    EVOCHAIN_CACHE.set(url, ids);
    lsSet(`ppb-ec-${url}`, ids);
    return ids;
  } catch { return []; }
}

// Build an evolution-linked MonData starting from a given species (or pokemon) id.
// Walks: speciesId → its evolution chain (linear forward) → at final stage, swap to a
// random alt form (mega/gmax/regional/etc) if any exist.
async function buildLinkedFromSpecies(startSpeciesId: number, uid: string): Promise<MonData | null> {
  // Special: Zygarde progresses 10% -> 50% -> Complete, not straight to a mega.
  if (startSpeciesId === 718) {
    const zIds = [10118, 718, 10120]; // 10%, 50%, Complete
    const stages: MonData[] = [];
    for (const zid of zIds) {
      const m = await fetchMon(zid, `${uid}-z${zid}`);
      if (m) stages.push(m);
    }
    if (stages.length === 0) return fetchMon(718, uid);
    for (let i = stages.length - 2; i >= 0; i--) stages[i].evolveTo = stages[i + 1];
    return { ...stages[0], uid };
  }

  const sp = await fetchSpecies(startSpeciesId);
  if (!sp) return fetchMon(startSpeciesId, uid);
  const chain = await fetchEvoChain(sp.evoChainUrl);
  const idx = chain.indexOf(startSpeciesId);
  const forward = idx >= 0 ? chain.slice(idx) : chain;
  if (forward.length === 0) return fetchMon(startSpeciesId, uid);

  const stages: MonData[] = [];
  for (const sid of forward) {
    const m = await fetchMon(sid, `${uid}-${sid}`);
    if (m) stages.push(m);
  }
  if (stages.length === 0) return null;

  // Alt-form: at the final stage species, pick a non-default variety at random.
  const finalSp = await fetchSpecies(forward[forward.length - 1]);
  const alts = finalSp?.varieties.filter((v) => !v.isDefault && (isMegaName(v.name) || isGmaxName(v.name) || isRegionalName(v.name) || v.name.includes("-totem") || v.name.includes("-alpha"))) ?? [];
  if (alts.length > 0) {
    const pick = alts[Math.floor(Math.random() * alts.length)];
    const altMon = await fetchMon(pick.id, `${uid}-alt-${pick.id}`);
    if (altMon) stages.push(altMon);
  }

  for (let i = stages.length - 2; i >= 0; i--) stages[i].evolveTo = stages[i + 1];
  return { ...stages[0], uid };
}

// For custom-mode "evolve this one": given a chosen pokemon id, build its forward chain
// + alt form (so a final-stage pick still has somewhere to evolve to).
async function buildEvolutionForPick(pokemonId: number, uid: string): Promise<MonData | null> {
  // First, find the species
  const m = await fetchMon(pokemonId, uid);
  if (!m) return null;
  const linked = await buildLinkedFromSpecies(m.speciesId, uid);
  if (!linked) return m;
  // If the player picked a later stage of the chain, splice from that point.
  // We re-resolve by walking the linked list until we find a stage matching pokemonId,
  // or just use the linked head if pokemonId === speciesId.
  let head: MonData | undefined = linked;
  while (head && head.id !== pokemonId) head = head.evolveTo;
  if (head) return { ...head, uid };
  // Otherwise: start from the picked mon and attach the alt form (if any) directly.
  const sp = await fetchSpecies(m.speciesId);
  const alts = sp?.varieties.filter((v) => !v.isDefault && (isMegaName(v.name) || isGmaxName(v.name) || isRegionalName(v.name))) ?? [];
  if (alts.length > 0) {
    const pick = alts[Math.floor(Math.random() * alts.length)];
    const altMon = await fetchMon(pick.id, `${uid}-alt-${pick.id}`);
    if (altMon) return { ...m, evolveTo: altMon };
  }
  return m;
}

// ============================================================
// Sounds
// ============================================================
const audioCache = new Map<string, HTMLAudioElement>();
function playSound(url: string | null, volume: number) {
  if (!url || volume <= 0) return;
  try {
    let a = audioCache.get(url);
    if (!a) { a = new Audio(url); audioCache.set(url, a); }
    a.volume = Math.min(1, volume);
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {}
}

// ============================================================
// Shop
// ============================================================
type ShopState = {
  ownedBgs: string[];
  selectedBg: string;
  ownedFx: string[];
  selectedFx: string;
  customBg: string | null; // dataURL
  abilityPickWinner: number; // owned uses
  abilityManualEvolve: number;
};
const DEFAULT_SHOP: ShopState = {
  ownedBgs: ["grass"],
  selectedBg: "grass",
  ownedFx: ["confetti"],
  selectedFx: "confetti",
  customBg: null,
  abilityPickWinner: 0,
  abilityManualEvolve: 0,
};
const BACKGROUNDS: { id: string; label: string; price: number; cls: string }[] = [
  { id: "grass", label: "Grass Field", price: 0, cls: "arena-grass" },
  { id: "sand", label: "Desert", price: 60, cls: "arena-sand" },
  { id: "snow", label: "Snowfield", price: 80, cls: "arena-snow" },
  { id: "volcano", label: "Volcano", price: 120, cls: "arena-volcano" },
  { id: "void", label: "Cosmic Void", price: 200, cls: "arena-void" },
];
const WIN_FX: { id: string; label: string; price: number }[] = [
  { id: "confetti", label: "Confetti", price: 0 },
  { id: "fireworks", label: "Fireworks", price: 80 },
  { id: "pixelrain", label: "Pixel Rain", price: 60 },
];
const ABILITY_PICK_PRICE = 75;
const ABILITY_EVOLVE_PRICE = 40;

function readShop(): ShopState { return { ...DEFAULT_SHOP, ...lsGet<Partial<ShopState>>("ppb-shop-v1", {}) }; }
function writeShop(s: ShopState) { lsSet("ppb-shop-v1", s); }

// ============================================================
// Favorites + Presets
// ============================================================
type Favorite = { id: string; name: string; ids: number[]; teams: number[]; evolves: boolean[]; mode: Mode };
const MAX_FAVS = 5;
function readFavs(): Favorite[] { return lsGet<Favorite[]>("ppb-favs-v1", []); }
function writeFavs(f: Favorite[]) { lsSet("ppb-favs-v1", f); }

// Built-in preset battles (just lists of species IDs to load into picks).
const PRESETS: { id: string; label: string; ids: number[]; description: string }[] = [
  { id: "gen1-starters", label: "Gen 1 Starters", description: "Bulbasaur · Charmander · Squirtle", ids: [1, 4, 7] },
  { id: "all-starters", label: "All Starters", description: "Every starter, all gens (18-way)", ids: [1,4,7,152,155,158,252,255,258,387,390,393,495,498,501,650,653,656,722,725,728,810,813,816,906,909,912] },
  { id: "gen1-first", label: "Gen 1 First-Stages (ALL)", description: "Every Gen 1 base-stage evolution — 76 of them! They all evolve.", ids: [1,4,7,10,13,16,19,21,23,25,27,29,32,35,37,39,41,43,46,48,50,52,54,56,58,60,63,66,69,72,74,77,79,81,83,84,86,88,90,92,95,96,98,100,102,104,106,107,108,109,111,113,114,115,116,118,120,122,123,124,125,126,127,128,129,131,132,133,137,138,140,142,143,147,150,151] },
  { id: "gen1-legends", label: "Gen 1 Legends", description: "The original birds + Mewtwo + Mew", ids: [144,145,146,150,151] },
  { id: "eeveelutions", label: "Eeveelutions", description: "All 8 eeveelutions battle", ids: [134,135,136,196,197,470,471,700] },
];

// ============================================================
// Component
// ============================================================
function Game() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [mode, setMode] = useState<Mode>("ffa");
  const [battleSize, setBattleSize] = useState(5);
  const [rosterMode, setRosterMode] = useState<"random" | "custom">("random");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [randomRoster, setRandomRoster] = useState<MonData[]>([]);
  const [randomGen, setRandomGen] = useState<"all" | number>("all");
  const [randomRarity, setRandomRarity] = useState<"all" | "legendary" | "mythical" | "normal" | "nolegend">("all");
  const [randomEvo, setRandomEvo] = useState<"all" | "basic" | "final">("all");
  const [betAmount, setBetAmount] = useState(10);
  const [betTarget, setBetTarget] = useState<string | null>(null);
  const [coins, setCoins] = useState<number>(STARTING_COINS);
  const [soundOn, setSoundOn] = useState(true);
  const [volume] = useState(0.4);
  const [loading, setLoading] = useState(false);
  const [evolveSec, setEvolveSec] = useState(15);
  const [shop, setShop] = useState<ShopState>(DEFAULT_SHOP);
  const [favs, setFavs] = useState<Favorite[]>([]);
  const pendingStartRef = useRef(false);

  useEffect(() => { setCoins(readCoins()); setShop(readShop()); setFavs(readFavs()); }, []);
  useEffect(() => { writeCoins(coins); }, [coins]);
  useEffect(() => { writeShop(shop); }, [shop]);
  useEffect(() => { writeFavs(favs); }, [favs]);

  // Battle state
  const monsRef = useRef<MonState[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const popsRef = useRef<Pop[]>([]);
  const idRef = useRef(1);
  const [, force] = useState(0);
  const lastRenderRef = useRef(0);
  const [running, setRunning] = useState(true);
  const runningRef = useRef(true);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [winnerIdx, setWinnerIdx] = useState<number | null>(null);
  const [winnerTeam, setWinnerTeam] = useState<number | null>(null);
  const [status, setStatus] = useState<"fighting" | "ended">("fighting");
  const modeRef = useRef(mode);
  const soundRef = useRef(soundOn);
  const battleBet = useRef<{ amount: number; target: string | null } | null>(null);
  const [payout, setPayout] = useState<number>(0);
  const evolveMsRef = useRef(15000);
  const pickWinnerAbilityRef = useRef(false); // armed for this battle?
  const synergyRef = useRef<Record<number, number>>({}); // team# -> dmg multiplier

  // ============ Game speed + random events + YouTube HUD ============
  const [speedMul, setSpeedMul] = useState(1);
  const speedRef = useRef(1);
  useEffect(() => { speedRef.current = speedMul; }, [speedMul]);
  const [eventsOn, setEventsOn] = useState(true);
  const eventsOnRef = useRef(true);
  useEffect(() => { eventsOnRef.current = eventsOn; }, [eventsOn]);
  type StatEntry = { dmg: number; kos: number; name: string; color: string; sprite: string };
  const statsRef = useRef<Record<string, StatEntry>>({});
  const koLogRef = useRef<{ t: number; name: string; color: string }[]>([]);
  const startTimeRef = useRef(0);
  const [matchSeed, setMatchSeed] = useState<number>(0);
  const [lastEvent, setLastEvent] = useState<{ text: string; color: string; until: number } | null>(null);
  const [koCam, setKoCam] = useState<{ name: string; color: string; sprite: string; until: number } | null>(null);
  const [watermark, setWatermark] = useState("");
  useEffect(() => { if (typeof window !== "undefined") setWatermark(localStorage.getItem("ppb-watermark") || "@YourChannel"); }, []);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("ppb-watermark", watermark); }, [watermark]);
  const [showIntro, setShowIntro] = useState(false);

  // FX queue: imperative visual effects pushed by events + big hits
  type FxEvent =
    | { kind: "meteor"; id: number; x: number; born: number }
    | { kind: "bolt"; id: number; x: number; born: number }
    | { kind: "rain"; id: number; until: number }
    | { kind: "snow"; id: number; until: number }
    | { kind: "sand"; id: number; until: number }
    | { kind: "quake"; id: number; until: number }
    | { kind: "flare"; id: number; until: number }
    | { kind: "warp"; id: number; born: number }
    | { kind: "aura"; id: number; until: number; color: string }
    | { kind: "gold"; id: number; born: number }
    | { kind: "shake"; id: number; until: number; strength: number }
    | { kind: "critText"; id: number; x: number; y: number; born: number }
    | { kind: "combo"; id: number; born: number; n: number }
    | { kind: "moveBanner"; id: number; born: number; name: string; color: string }
    | { kind: "effBanner"; id: number; born: number; text: string; color: string }
    | { kind: "ghost"; id: number; born: number; x: number; y: number; sprite: string; color: string }
    | { kind: "hitRing"; id: number; born: number; x: number; y: number; color: string };
  const fxRef = useRef<FxEvent[]>([]);
  const pushFx = (fx: Partial<FxEvent> & { kind: FxEvent["kind"] }) => {
    (fxRef.current as FxEvent[]).push({ ...(fx as unknown as FxEvent), id: idRef.current++ });
    if (fxRef.current.length > 140) fxRef.current.splice(0, fxRef.current.length - 140);
  };

  // Sudden-damage state (×2 after 45s)
  const suddenDmgRef = useRef(false);
  // Combo counter
  const comboRef = useRef({ count: 0, until: 0 });
  // Hype meter (fills with damage, unlocks OVERDRIVE)
  const hypeRef = useRef({ value: 0, overdriveUntil: 0 });
  // KO streak (multi-KO within 2s)
  const koStreakRef = useRef({ count: 0, until: 0 });
  // Extra polish refs
  const hitStopRef = useRef(0);
  const biggestHitRef = useRef<{ dmg: number; attacker: string; target: string; color: string } | null>(null);

  const RANDOM_EVENTS = useMemo(() => [
    { id: "meteor", text: "☄️ METEOR SHOWER — everyone loses 12% HP!", color: "#ff7a3a" },
    { id: "rain", text: "🌧 HEALING RAIN — all Pokémon regen 18% HP!", color: "#4ea8ff" },
    { id: "frenzy", text: "🔥 FRENZY MODE — all cooldowns reset!", color: "#ffd83a" },
    { id: "speedup", text: "💨 SPEED BURST — +30% speed for everyone!", color: "#a0e0ff" },
    { id: "shinystorm", text: "✨ SHINY STORM — everyone goes shiny!", color: "#ffd83a" },
    { id: "suddendeath", text: "💀 SUDDEN DEATH — HP capped at 40%!", color: "#ff4a4a" },
    { id: "goldrain", text: "🪙 GOLD RAIN — +25 bonus coins!", color: "#ffd83a" },
    { id: "mirror", text: "🔄 MIRROR MATCH — two random mons swap HP!", color: "#d976ff" },
    { id: "zap", text: "⚡ THUNDERSTORM — random Pokémon zapped for 35% HP!", color: "#fff7a0" },
    { id: "teleport", text: "🌀 TELEPORT — everyone reshuffled across the arena!", color: "#a17af0" },
    { id: "berserk", text: "😡 BERSERK — damage output doubled for 6 seconds!", color: "#ff5566" },
    { id: "eclipse", text: "🌑 ECLIPSE — psychic + dark powers surge!", color: "#8a4dff" },
  ], []);
  const berserkUntilRef = useRef(0);

  const triggerRandomEvent = useCallback(() => {
    const now = performance.now();
    const alive = monsRef.current.filter((m) => m.hp > 0);
    if (alive.length < 2) return;
    const ev = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
    switch (ev.id) {
      case "meteor":
        alive.forEach((m) => { m.hp = Math.max(1, m.hp - Math.round(m.maxHp * 0.12)); m.hitFlash = now + 300; });
        for (let i = 0; i < 10; i++) pushFx({ kind: "meteor", x: Math.random() * ARENA_W, born: now + i * 90 });
        pushFx({ kind: "shake", until: now + 900, strength: 10 });
        break;
      case "rain":
        alive.forEach((m) => { m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.18)); });
        pushFx({ kind: "rain", until: now + 6000 });
        break;
      case "frenzy":
        monsRef.current.forEach((m) => { m.lastAttack = 0; m.lastSpecial = 0; });
        pushFx({ kind: "aura", until: now + 4000, color: "#ffd83a" });
        break;
      case "speedup":
        monsRef.current.forEach((m) => { m.data = { ...m.data, baseSpd: Math.round(m.data.baseSpd * 1.3) }; });
        pushFx({ kind: "aura", until: now + 3000, color: "#a0e0ff" });
        break;
      case "shinystorm":
        monsRef.current.forEach((m) => { m.shiny = true; });
        pushFx({ kind: "gold", born: now });
        pushFx({ kind: "flare", until: now + 800 });
        break;
      case "suddendeath":
        alive.forEach((m) => { m.hp = Math.min(m.hp, Math.round(m.maxHp * 0.4)); });
        pushFx({ kind: "shake", until: now + 800, strength: 14 });
        pushFx({ kind: "aura", until: now + 3000, color: "#ff4a4a" });
        break;
      case "goldrain": setCoins((c) => c + 25); pushFx({ kind: "gold", born: now }); break;
      case "mirror": { const a = alive[Math.floor(Math.random() * alive.length)]; const b = alive[Math.floor(Math.random() * alive.length)]; if (a !== b) { const tmp = a.hp; a.hp = Math.min(a.maxHp, b.hp); b.hp = Math.min(b.maxHp, tmp); } pushFx({ kind: "warp", born: now }); break; }
      case "zap": {
        const t = alive[Math.floor(Math.random() * alive.length)];
        t.hp = Math.max(1, t.hp - Math.round(t.maxHp * 0.35)); t.hitFlash = now + 400;
        pushFx({ kind: "bolt", x: t.pos.x, born: now });
        // extra sky-strikes on random targets
        for (let i = 0; i < 2; i++) {
          const s = alive[Math.floor(Math.random() * alive.length)];
          pushFx({ kind: "bolt", x: s.pos.x, born: now + 200 + i * 200 });
        }
        pushFx({ kind: "flare", until: now + 400 });
        break;
      }
      case "teleport":
        monsRef.current.forEach((m) => { if (m.hp > 0) { m.pos.x = MON_R + Math.random() * (ARENA_W - MON_R * 2); m.pos.y = MON_R + Math.random() * (ARENA_H - MON_R * 2); } });
        pushFx({ kind: "warp", born: now });
        break;
      case "berserk": berserkUntilRef.current = now + 6000; pushFx({ kind: "aura", until: now + 6000, color: "#ff5566" }); pushFx({ kind: "shake", until: now + 500, strength: 6 }); break;
      case "eclipse":
        monsRef.current.forEach((m) => { if (m.data.type === "psychic" || m.data.type === "dark" || m.data.type === "ghost") m.data = { ...m.data, baseAtk: Math.round(m.data.baseAtk * 1.25) }; });
        pushFx({ kind: "aura", until: now + 3500, color: "#8a4dff" });
        break;
    }
    pushLog(ev.text, ev.color);
    setLastEvent({ text: ev.text, color: ev.color, until: now + 3000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RANDOM_EVENTS]);

  useEffect(() => {
    if (screen !== "battle") return;
    let alive = true;
    let tid: number | null = null;
    const tick = () => {
      if (!alive) return;
      if (runningRef.current && eventsOnRef.current && status === "fighting") triggerRandomEvent();
      const delay = (7000 + Math.random() * 7000) / Math.max(1, speedRef.current);
      tid = window.setTimeout(tick, delay);
    };
    tid = window.setTimeout(tick, 6000);
    return () => { alive = false; if (tid) clearTimeout(tid); };
  }, [screen, status, triggerRandomEvent]);


  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);

  const pushLog = (text: string, color: string) => {
    setLog((l) => [{ id: idRef.current++, text, color }, ...l].slice(0, 14));
  };

  // Random battle announcer commentary
  const KO_LINES = ["is down for the count!", "hits the dirt!", "sees stars!", "faints dramatically!", "taps out!", "is out cold!"];
  const CRIT_LINES = ["Bone-crushing hit!", "Devastating blow!", "Right in the sweet spot!", "That's gonna leave a mark!"];
  const announce = (text: string, color: string) => pushLog(`📣 ${text}`, color);


  // ============ Combat loop (throttled render ~30fps) ============
  useEffect(() => {
    if (screen !== "battle") return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      let dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Hit-stop: freeze combat for a beat on big crits
      if (now < hitStopRef.current) dt = 0;
      // Slow-mo: last enemy on low HP → 0.5× time
      const alive = monsRef.current.filter((mm) => mm.hp > 0);
      if (alive.length === 2 && Math.min(alive[0].hp / alive[0].maxHp, alive[1].hp / alive[1].maxHp) < 0.2) dt *= 0.5;
      if (runningRef.current && status === "fighting") step(dt, now);
      if (now - lastRenderRef.current > 60) {
        lastRenderRef.current = now;
        force((n) => (n + 1) % 1_000_000);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, status]);

  const nearestEnemy = (i: number): number | null => {
    const mons = monsRef.current;
    let best = -1, bd = Infinity;
    for (let j = 0; j < mons.length; j++) {
      if (j === i || mons[j].hp <= 0) continue;
      if (modeRef.current === "teams" && mons[j].team === mons[i].team) continue;
      const d = Math.hypot(mons[j].pos.x - mons[i].pos.x, mons[j].pos.y - mons[i].pos.y);
      if (d < bd) { bd = d; best = j; }
    }
    return best === -1 ? null : best;
  };

  const settleBet = (winnerUidOrTeam: string | null) => {
    const bet = battleBet.current;
    if (!bet || !bet.target || bet.amount <= 0) { setPayout(0); return; }
    const numContestants = modeRef.current === "teams" ? 2 : monsRef.current.length;
    const won = winnerUidOrTeam === bet.target;
    if (won) {
      const win = bet.amount * Math.max(2, numContestants);
      setCoins((c) => c + win);
      setPayout(win);
      pushLog(`🎉 You won ${win} coins on your bet!`, "#ffd83a");
    } else {
      const loss = Math.min(bet.amount, Math.max(0, monsRef.current.length ? 99999 : 0));
      const newBal = Math.max(MIN_COINS, (lsGet<number>("ppb-coins", STARTING_COINS) as number) - loss);
      setCoins(newBal);
      setPayout(-(loss));
      pushLog(`💸 You lost ${loss} coins on your bet. (floor ${MIN_COINS})`, "#ff7777");
    }
  };

  const checkEnd = () => {
    const mons = monsRef.current;
    if (modeRef.current === "teams") {
      const aliveByTeam = [0, 0];
      mons.forEach((m) => { if (m.hp > 0) aliveByTeam[m.team]++; });
      const teamsLeft = aliveByTeam.filter((c) => c > 0).length;
      if (teamsLeft <= 1) {
        const wTeam = aliveByTeam.findIndex((c) => c > 0);
        setWinnerTeam(wTeam === -1 ? null : wTeam);
        setWinnerIdx(null); setStatus("ended");
        if (wTeam >= 0) {
          pushLog(`${TEAM_NAMES[wTeam]} WINS!`, TEAM_COLORS[wTeam]);
          settleBet(`team-${wTeam}`);
        } else { pushLog("Draw!", "var(--color-muted-foreground)"); settleBet(null); }
      }
      return;
    }
    const alive = mons.map((m, i) => (m.hp > 0 ? i : -1)).filter((i) => i >= 0);
    if (alive.length <= 1) {
      const w = alive[0] ?? null;
      setWinnerIdx(w); setWinnerTeam(null); setStatus("ended");
      if (w !== null) {
        pushLog(`${mons[w].data.name} WINS!`, mons[w].data.color);
        settleBet(mons[w].data.uid);
      } else { pushLog("Draw!", "var(--color-muted-foreground)"); settleBet(null); }
    }
  };

  // Pick-Winner ability: bias outcome before final hit
  const tryApplyPickWinner = (now: number) => {
    if (!pickWinnerAbilityRef.current || !battleBet.current?.target) return;
    const target = battleBet.current.target;
    const mons = monsRef.current;
    if (Math.random() > 0.5) return;
    if (target.startsWith("team-")) {
      const t = Number(target.slice(5));
      mons.forEach((m) => { if (m.team !== t) m.hp = Math.max(1, m.hp - 9999); });
    } else {
      mons.forEach((m) => { if (m.data.uid !== target) m.hp = Math.max(0, m.hp - 9999); });
    }
    pickWinnerAbilityRef.current = false;
    pushLog("✨ Pick-Winner ability succeeded!", "#ffd83a");
    void now;
  };

  const step = (dtRaw: number, now: number) => {
    const speed = speedRef.current;
    const dt = dtRaw * speed;
    const mons = monsRef.current;
    mons.forEach((m, i) => {
      if (m.hp <= 0) return;
      const d = m.data;

      // Evolution
      m.evolveTimer += dt * 1000;

      if (m.evolveEnabled && m.evolveTimer >= evolveMsRef.current) {
        if (d.evolveTo) {
          const next = d.evolveTo;
          const oldName = d.name;
          m.data = { ...next, uid: d.uid };
          m.evolveTimer = 0;
          m.evolveFlashUntil = now + EVOLVE_FLASH_MS;
          const newMax = Math.round(120 + next.baseHp * 1.8);
          const ratio = m.hp / m.maxHp;
          m.maxHp = newMax;
          m.hp = Math.min(newMax, Math.max(40, Math.round(newMax * ratio + 50)));
          pushLog(`${oldName} evolved into ${next.name}!`, next.color);
          if (soundRef.current) playSound(next.cry, volume);
        } else if (m.plusLevel < 2) {
          // Plus evolution — no Mega/Gmax/regional available. Two stackable levels.
          const oldName = d.name;
          const nextLevel = m.plusLevel + 1;
          const prefix = nextLevel === 1 ? "✦" : "✦✦";
          const mul = nextLevel === 1 ? 1.25 : 1.18; // second stage adds ~18% on top
          const strippedName = d.name.replace(/^✦+/, "");
          m.data = { ...d, name: `${prefix}${strippedName}`,
            baseAtk: Math.round(d.baseAtk * mul), baseDef: Math.round(d.baseDef * (nextLevel === 1 ? 1.15 : 1.12)),
            baseSpd: Math.round(d.baseSpd * 1.08), baseHp: Math.round(d.baseHp * mul),
            signature: { ...d.signature, dmg: Math.round(d.signature.dmg * mul) },
            basic: { ...d.basic, dmg: Math.round(d.basic.dmg * mul) } };
          m.plusLevel = nextLevel;
          m.evolveTimer = 0;
          m.evolveFlashUntil = now + EVOLVE_FLASH_MS;
          const newMax = Math.round(m.maxHp * mul);
          m.maxHp = newMax;
          m.hp = Math.min(newMax, Math.round(m.hp + newMax * 0.2));
          pushLog(`${oldName} powered up to ${prefix}Plus form!`, d.color);
          if (soundRef.current) playSound(d.cry, volume);
        }
      }

      const tgt = nearestEnemy(i);
      if (tgt === null) return;
      const t = mons[tgt];
      const dx = t.pos.x - m.pos.x, dy = t.pos.y - m.pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      const desired = ATTACK_RANGE * 0.7;
      const seek = (dist - desired) * 0.7;
      const tangent = { x: -dy / dist, y: dx / dist };
      const moveSpeed = 60 + d.baseSpd * 0.35;
      m.vel.x = (dx / dist) * seek + tangent.x * moveSpeed * 0.6 + rand(-10, 10);
      m.vel.y = (dy / dist) * seek + tangent.y * moveSpeed * 0.6 + rand(-10, 10);
      // separation: only against nearby mons (skip squared scan for far ones)
      for (let j = 0; j < mons.length; j++) {
        if (i === j) continue;
        const o = mons[j];
        if (o.hp <= 0) continue;
        const ox = m.pos.x - o.pos.x, oy = m.pos.y - o.pos.y;
        if (Math.abs(ox) > 80 || Math.abs(oy) > 80) continue;
        const od = Math.hypot(ox, oy) || 1;
        if (od < MON_R * 2.4) { m.vel.x += (ox / od) * 80; m.vel.y += (oy / od) * 80; }
      }
      m.pos.x = Math.max(MON_R, Math.min(ARENA_W - MON_R, m.pos.x + m.vel.x * dt));
      m.pos.y = Math.max(MON_R, Math.min(ARENA_H - MON_R, m.pos.y + m.vel.y * dt));

      // Form-based damage multipliers
      const formMul = d.isGmax ? 1.7 : d.isMega ? 1.6 : (m.plusLevel > 0 ? 1.0 : 1.0); // plus already baked into stats
      const shinyMul = m.shiny ? 1.08 : 1;
      const synMul = synergyRef.current[m.team] ?? 1;
      const berserkMul = now < berserkUntilRef.current ? 2.0 : 1;
      // Sudden Damage: after 45 seconds, everyone deals ×2 damage
      const matchElapsed = now - startTimeRef.current;
      const suddenMul = matchElapsed >= 45000 ? 2 : 1;
      if (suddenMul === 2 && !suddenDmgRef.current) {
        suddenDmgRef.current = true;
        setLastEvent({ text: "⚔️ SUDDEN DAMAGE — ×2 for everyone!", color: "#ff4a4a", until: now + 4000 });
        pushLog("⚔️ SUDDEN DAMAGE activated: ×2 damage!", "#ff4a4a");
        pushFx({ kind: "shake", until: now + 700, strength: 12 });
        pushFx({ kind: "flare", until: now + 500 });
        pushFx({ kind: "aura", until: now + 4000, color: "#ff4a4a" });
      }
      // Hype meter → OVERDRIVE
      const overdriveMul = now < hypeRef.current.overdriveUntil ? 1.3 : 1;

      const atkCd = Math.max(700, ABILITY_COOLDOWN_BASE * (80 / Math.max(20, d.baseSpd))) / speed;
      if (now - m.lastAttack >= atkCd && dist <= ATTACK_RANGE + 60) {
        m.lastAttack = now;
        m.attackFlash = now + 300;
        const crit = Math.random() < 0.15;
        const eff = typeMult(d.type, t.data.type);
        const atkMul = 0.7 + 0.6 * (d.baseAtk / 100);
        const defReduction = 1 - Math.min(0.55, t.data.baseDef / 360);
        const dmg = Math.max(1, Math.round(d.basic.dmg * atkMul * formMul * shinyMul * synMul * berserkMul * suddenMul * overdriveMul * (crit ? 1.75 : 1) * eff * defReduction * (0.75 + Math.random() * 0.5)));
        const ang = Math.atan2(t.pos.y - m.pos.y, t.pos.x - m.pos.x);
        if (projectilesRef.current.length < 40) {
          projectilesRef.current.push({
            id: idRef.current++, fromIdx: i, targetIdx: tgt,
            from: { ...m.pos }, pos: { ...m.pos }, angle: ang,
            color: d.color, dmg, crit, kind: d.basic.kind, bornAt: now,
            duration: (d.basic.kind === "lightning" ? 200 : 420) / speed,
            eff,
          });
        }
        pushLog(`${d.name} → ${t.data.name}: ${d.basic.name} ${crit ? "CRIT " : ""}${dmg}${effLabel(eff)}`, d.color);
        if (crit && Math.random() < 0.4) announce(CRIT_LINES[Math.floor(Math.random() * CRIT_LINES.length)], "#ffd83a");
      }

      if (now - m.lastSpecial >= SPECIAL_COOLDOWN_BASE / speed && dist <= ATTACK_RANGE + 120) {
        m.lastSpecial = now;
        m.attackFlash = now + 400;
        const crit = Math.random() < 0.22;
        const eff = typeMult(d.type, t.data.type);
        const atkMul = 0.8 + 0.6 * (d.baseAtk / 100);
        const defReduction = 1 - Math.min(0.5, t.data.baseDef / 380);
        const dmg = Math.max(1, Math.round(d.signature.dmg * atkMul * formMul * shinyMul * synMul * berserkMul * suddenMul * overdriveMul * (crit ? 1.85 : 1) * eff * defReduction * (0.85 + Math.random() * 0.3)));
        const ang = Math.atan2(t.pos.y - m.pos.y, t.pos.x - m.pos.x);
        if (projectilesRef.current.length < 40) {
          projectilesRef.current.push({
            id: idRef.current++, fromIdx: i, targetIdx: tgt,
            from: { ...m.pos }, pos: { ...m.pos }, angle: ang,
            color: d.color, dmg, crit, kind: d.signature.kind, bornAt: now,
            duration: (d.signature.kind === "lightning" ? 240 : 500) / speed,
            eff,
          });
        }
        pushLog(`★ ${d.name} unleashed ${d.signature.name}! ${crit ? "CRIT " : ""}${dmg}${effLabel(eff)}`, d.color);
        pushFx({ kind: "moveBanner", born: now, name: d.signature.name, color: d.color });
        if (soundRef.current) playSound(d.cry, volume * 0.6);
      }


      if (m.hitFlash && now > m.hitFlash) m.hitFlash = 0;
      if (m.attackFlash && now > m.attackFlash) m.attackFlash = 0;
    });


    const remaining: Projectile[] = [];
    let killed = false;
    for (const p of projectilesRef.current) {
      const tt = (now - p.bornAt) / p.duration;
      const tgt = monsRef.current[p.targetIdx];
      if (tt >= 1) {
        if (tgt && tgt.hp > 0) {
          tgt.hp = Math.max(0, tgt.hp - p.dmg);
          tgt.hitFlash = now + 250;
          // ---- YouTube stats: track damage per attacker uid ----
          const attacker = monsRef.current[p.fromIdx];
          if (attacker) {
            const key = attacker.data.uid;
            const cur = statsRef.current[key] ?? { dmg: 0, kos: 0, name: attacker.data.name, color: attacker.data.color, sprite: attacker.data.sprite };
            const prevKos = cur.kos;
            cur.dmg += p.dmg;
            cur.name = attacker.data.name; cur.color = attacker.data.color; cur.sprite = attacker.data.sprite;
            if (tgt.hp === 0) cur.kos += 1;
            statsRef.current[key] = cur;
            // Announcer milestones
            if (cur.kos > prevKos) {
              if (cur.kos === 3) announce(`${cur.name} is ON FIRE! 🔥`, "#ff7a3a");
              else if (cur.kos === 6) announce(`GODLIKE — ${cur.name}!`, "#ffd83a");
            }
            // Track biggest hit for Play of the Game
            if (!biggestHitRef.current || p.dmg > biggestHitRef.current.dmg) {
              biggestHitRef.current = { dmg: p.dmg, attacker: cur.name, target: tgt.data.name, color: cur.color };
            }
          }
          // Damage number, size scales with combo
          const comboActive = now < comboRef.current.until ? comboRef.current.count : 1;
          popsRef.current.push({ id: idRef.current++, x: tgt.pos.x, y: tgt.pos.y - 28, value: p.dmg, crit: p.crit, bornAt: now, color: p.crit ? "#ffd83a" : "#ff5566", scale: Math.min(2, 1 + comboActive * 0.12) });
          // Hit ring color-splash
          pushFx({ kind: "hitRing", born: now, x: tgt.pos.x, y: tgt.pos.y, color: p.crit ? "#ffd83a" : attacker?.data.color || "#fff" });
          // Combo counter
          if (now < comboRef.current.until) comboRef.current.count += 1; else comboRef.current.count = 1;
          comboRef.current.until = now + 1500;
          if (comboRef.current.count >= 3 && comboRef.current.count % 3 === 0) {
            pushFx({ kind: "combo", born: now, n: comboRef.current.count });
          }
          // Hype meter (fills with damage, unlocks 8s OVERDRIVE at 100)
          hypeRef.current.value += p.dmg;
          if (hypeRef.current.value >= 800 && now >= hypeRef.current.overdriveUntil) {
            hypeRef.current.value = 0;
            hypeRef.current.overdriveUntil = now + 8000;
            setLastEvent({ text: "🚀 OVERDRIVE — ×1.3 damage for 8s!", color: "#ffd83a", until: now + 3000 });
            pushFx({ kind: "aura", until: now + 8000, color: "#ffd83a" });
            pushFx({ kind: "flare", until: now + 500 });
          }
          // Crit visual + hit-stop
          if (p.crit) {
            pushFx({ kind: "critText", x: tgt.pos.x, y: tgt.pos.y - 60, born: now });
            hitStopRef.current = now + 80;
          }
          // Screen shake scales with damage
          const shakeStrength = Math.min(14, 3 + p.dmg / 8);
          pushFx({ kind: "shake", until: now + 200, strength: shakeStrength });
          if (p.eff !== undefined && p.eff >= 2) {
            pushFx({ kind: "effBanner", born: now, text: "SUPER EFFECTIVE!", color: "#ffd83a" });
          } else if (p.eff !== undefined && p.eff > 0 && p.eff <= 0.5) {
            pushFx({ kind: "effBanner", born: now, text: "not very effective…", color: "#9aa0a6" });
          } else if (p.eff === 0) {
            pushFx({ kind: "effBanner", born: now, text: "NO EFFECT", color: "#ff7777" });
          }
          if (tgt.hp === 0) {
            pushLog(`${tgt.data.name} was knocked out!`, "var(--color-muted-foreground)");
            if (Math.random() < 0.5) announce(`${tgt.data.name} ${KO_LINES[Math.floor(Math.random() * KO_LINES.length)]}`, "#ffd83a");
            koLogRef.current.push({ t: performance.now() - startTimeRef.current, name: tgt.data.name, color: tgt.data.color });
            setKoCam({ name: tgt.data.name, color: tgt.data.color, sprite: tgt.data.sprite, until: now + 1400 });
            // Ghost float
            pushFx({ kind: "ghost", born: now, x: tgt.pos.x, y: tgt.pos.y, sprite: tgt.data.sprite, color: tgt.data.color });
            // Crowd cheer synth
            if (soundRef.current) { try { const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.setValueAtTime(660, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.25); g.gain.setValueAtTime(volume * 0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.3); } catch { /* ignore */ } }
            // KO streak announcer
            if (now < koStreakRef.current.until) koStreakRef.current.count += 1; else koStreakRef.current.count = 1;
            koStreakRef.current.until = now + 2200;
            const sc = koStreakRef.current.count;
            const label = sc === 2 ? "DOUBLE KO!" : sc === 3 ? "TRIPLE KO!" : sc === 4 ? "RAMPAGE!" : sc >= 5 ? "UNSTOPPABLE!!" : "";
            if (label) { announce(label, "#ff5aa8"); pushFx({ kind: "combo", born: now, n: sc }); pushFx({ kind: "flare", until: now + 400 }); }
            pushFx({ kind: "shake", until: now + 260, strength: 10 });
            hitStopRef.current = Math.max(hitStopRef.current, now + 120);
            killed = true;
          }
        }


      } else {
        const cur = tgt && tgt.hp > 0 ? tgt.pos : p.from;
        const e = tt * tt * (3 - 2 * tt);
        p.pos.x = p.from.x + (cur.x - p.from.x) * e;
        p.pos.y = p.from.y + (cur.y - p.from.y) * e;
        p.angle = Math.atan2(cur.y - p.from.y, cur.x - p.from.x);
        remaining.push(p);
      }
    }
    projectilesRef.current = remaining;
    popsRef.current = popsRef.current.filter((p) => now - p.bornAt < 900);
    if (killed) { tryApplyPickWinner(now); checkEnd(); }
  };

  // ============ Random roster preview (so you can bet on random battles) ============
  const rollRandomRoster = useCallback(async () => {
    setLoading(true);
    try {
      // Build the ID pool from filters
      let pool: number[] = [];
      if (randomGen === "all") {
        for (let i = 1; i <= 1025; i++) pool.push(i);
      } else {
        const [a, b] = GEN_RANGES[randomGen - 1];
        for (let i = a; i <= b; i++) pool.push(i);
      }
      if (randomRarity !== "all") {
        pool = pool.filter((id) => {
          const r = rarityOf(id);
          if (randomRarity === "nolegend") return r === "normal";
          return r === randomRarity;
        });
      }
      if (randomEvo === "basic") {
        // Basics only — use cached evo chain data where available; fetch for the pool.
        const basics: number[] = [];
        for (const id of pool.slice(0, 400)) {
          const sp = await fetchSpecies(id);
          if (!sp?.evoChainUrl) { basics.push(id); continue; }
          const chain = await fetchEvoChain(sp.evoChainUrl);
          if (chain[0] === id) basics.push(id);
        }
        pool = basics;
      } else if (randomEvo === "final") {
        const finals: number[] = [];
        for (const id of pool.slice(0, 400)) {
          const sp = await fetchSpecies(id);
          if (!sp?.evoChainUrl) { finals.push(id); continue; }
          const chain = await fetchEvoChain(sp.evoChainUrl);
          if (chain[chain.length - 1] === id) finals.push(id);
        }
        pool = finals;
      }
      if (pool.length === 0) { setRandomRoster([]); return; }
      const seen = new Set<number>();
      const picksIds: number[] = [];
      let guard = 0;
      while (picksIds.length < battleSize && guard++ < 2000) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        if (!seen.has(id)) { seen.add(id); picksIds.push(id); }
        if (seen.size >= pool.length) break;
      }
      const built = await Promise.all(picksIds.map((id, i) => buildLinkedFromSpecies(id, `r${i}`)));
      setRandomRoster(built.filter((b): b is MonData => !!b));
    } finally { setLoading(false); }
  }, [battleSize, randomGen, randomRarity, randomEvo]);

  useEffect(() => {
    if (screen === "lobby" && rosterMode === "random") void rollRandomRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, rosterMode, battleSize, randomGen, randomRarity, randomEvo]);

  // Load picks from a list of IDs (favorites/presets). Optionally split into teams.
  const loadPicksFromIds = useCallback(async (ids: number[], teams?: number[], evolves?: boolean[]) => {
    setLoading(true);
    try {
      const mons = await Promise.all(ids.map((id, i) => fetchMon(id, `pick-${id}-${Date.now()}-${i}`)));
      const newPicks: Pick[] = [];
      mons.forEach((m, i) => {
        if (!m) return;
        newPicks.push({ mon: m, team: teams?.[i] ?? (i % 2), evolve: evolves?.[i] ?? true });
      });
      setPicks(newPicks);
      setRosterMode("custom");
    } finally { setLoading(false); }
  }, []);

  // Save current picks as a named favorite (max 5).
  const saveFavorite = useCallback((name: string) => {
    if (!name.trim() || picks.length === 0) return;
    const fav: Favorite = {
      id: `f-${Date.now()}`, name: name.trim().slice(0, 24),
      ids: picks.map((p) => p.mon.id),
      teams: picks.map((p) => p.team),
      evolves: picks.map((p) => p.evolve),
      mode,
    };
    setFavs((cur) => [fav, ...cur].slice(0, MAX_FAVS));
  }, [picks, mode]);

  // Queue an auto-start once picks state has propagated.
  useEffect(() => {
    if (pendingStartRef.current && screen === "lobby" && picks.length >= 2 && !loading) {
      pendingStartRef.current = false;
      void startBattle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, loading, screen]);

  // ============ Start battle ============
  const startBattle = async () => {
    setLoading(true);
    try {
      let roster: { mon: MonData; team: number; evolve: boolean }[] = [];
      if (rosterMode === "random") {
        const built = randomRoster.length === battleSize ? randomRoster : await Promise.all(
          Array.from({ length: battleSize }, (_, i) => buildLinkedFromSpecies(1 + Math.floor(Math.random() * 1025), `r${i}`))
        ).then((arr) => arr.filter((b): b is MonData => !!b));
        roster = built.map((mon, i) => ({
          mon: { ...mon, uid: `r${i}-${mon.id}` },
          team: mode === "teams" ? (i < built.length / 2 ? 0 : 1) : i,
          evolve: true,
        }));
      } else {
        // Custom mode: each pick has a team and an evolve flag.
        // If evolve is on but mon has no evolveTo, attach chain now.
        // If user picked more than battleSize, randomly sample down (keeps custom-team logic working).
        const subset = picks.length > battleSize
          ? [...picks].sort(() => Math.random() - 0.5).slice(0, battleSize)
          : picks;
        const prepared = await Promise.all(subset.map(async (p, i) => {
          let mon = p.mon;
          if (p.evolve && !mon.evolveTo) {
            const linked = await buildEvolutionForPick(mon.id, `c${i}`);
            if (linked) mon = linked;
          }
          return { mon: { ...mon, uid: `c${i}-${mon.id}` }, team: p.team, evolve: p.evolve };
        }));
        roster = prepared;
        // Validate teams when in team mode
        if (mode === "teams") {
          const t0 = roster.filter((r) => r.team === 0).length;
          const t1 = roster.filter((r) => r.team === 1).length;
          if (t0 === 0 || t1 === 0) {
            alert("Team battle needs at least 1 Pokémon on each team.");
            setLoading(false); return;
          }
        }
      }

      if (roster.length < 2) {
        alert("Need at least 2 Pokémon to start a battle.");
        setLoading(false); return;
      }

      const mons: MonState[] = roster.map((entry, i) => {
        const d = entry.mon;
        let pos: Vec;
        if (mode === "teams") {
          const sameTeam = roster.filter((r) => r.team === entry.team);
          const teamIdx = sameTeam.indexOf(entry);
          const teamCount = sameTeam.length;
          const x = entry.team === 0 ? 120 : ARENA_W - 120;
          const y = 80 + ((ARENA_H - 160) * (teamIdx + 0.5)) / teamCount;
          pos = { x, y };
        } else {
          const a = (i / roster.length) * Math.PI * 2 + Math.random() * 0.4;
          pos = { x: ARENA_W / 2 + Math.cos(a) * 200, y: ARENA_H / 2 + Math.sin(a) * 180 };
        }
        const maxHp = Math.round(120 + d.baseHp * 1.8);
        const shiny = Math.random() < 1 / 64;
        return {
          pos, vel: { x: rand(-30, 30), y: rand(-30, 30) },
          hp: maxHp, maxHp, team: entry.team, data: d,
          lastAttack: -rand(0, 1500),
          lastSpecial: -rand(0, SPECIAL_COOLDOWN_BASE),
          evolveTimer: 0, hitFlash: 0, attackFlash: 0, evolveFlashUntil: 0,
          evolveEnabled: entry.evolve && (!!d.evolveTo || true), // also enable for plus-evolution
          plusLevel: 0,
          shiny,
        };
      });

      // Team synergy: 3+ same type on a team = +10% dmg, 5+ = +18%
      const synergy: Record<number, number> = {};
      const teamTypes = new Map<number, Map<ElementType, number>>();
      for (const m of mons) {
        if (!teamTypes.has(m.team)) teamTypes.set(m.team, new Map());
        const tm = teamTypes.get(m.team)!;
        tm.set(m.data.type, (tm.get(m.data.type) ?? 0) + 1);
      }
      teamTypes.forEach((tm, team) => {
        let best = 0;
        tm.forEach((n) => { if (n > best) best = n; });
        synergy[team] = best >= 5 ? 1.18 : best >= 3 ? 1.10 : 1;
      });
      synergyRef.current = synergy;

      monsRef.current = mons;
      projectilesRef.current = [];
      popsRef.current = [];
      evolveMsRef.current = evolveSec * 1000;
      if (typeof window !== "undefined") (window as unknown as { __ppbEvolveMs?: number }).__ppbEvolveMs = evolveSec * 1000;

      // Reset YouTube HUD / stats / KO log / intro
      statsRef.current = {};
      koLogRef.current = [];
      startTimeRef.current = performance.now();
      suddenDmgRef.current = false;
      comboRef.current = { count: 0, until: 0 };
      hypeRef.current = { value: 0, overdriveUntil: 0 };
      fxRef.current.length = 0;
      berserkUntilRef.current = 0;
      setLastEvent(null); setKoCam(null);
      setMatchSeed(Math.floor(Math.random() * 1_000_000));
      setShowIntro(true);
      setTimeout(() => setShowIntro(false), 3200);


      let resolvedTarget: string | null = null;
      if (betAmount > 0 && betAmount <= coins && betTarget) {
        if (mode === "teams" && (betTarget === "team-0" || betTarget === "team-1")) resolvedTarget = betTarget;
        else if (mode === "ffa" && mons.some((m) => m.data.uid === betTarget)) resolvedTarget = betTarget;
      }
      battleBet.current = resolvedTarget ? { amount: betAmount, target: resolvedTarget } : null;
      setPayout(0);

      // Arm Pick-Winner ability if owned and bet placed
      pickWinnerAbilityRef.current = shop.abilityPickWinner > 0 && !!resolvedTarget;
      if (pickWinnerAbilityRef.current) {
        setShop((s) => ({ ...s, abilityPickWinner: Math.max(0, s.abilityPickWinner - 1) }));
        pushLog("⚡ Pick-Winner ability armed (50% chance).", "#ffd83a");
      }

      setLog([{ id: idRef.current++, text: mode === "teams" ? "Team Battle! Wipe the other team." : `${roster.length}-way Free-for-All.`, color: "var(--color-muted-foreground)" }]);
      if (battleBet.current) pushLog(`You bet ${battleBet.current.amount} coins on ${resolveBetLabel(resolvedTarget!, mons)}.`, "#ffd83a");
      // Announce synergies + shinies
      Object.entries(synergy).forEach(([t, mul]) => { if (mul > 1) pushLog(`✧ ${TEAM_NAMES[Number(t)] ?? `Team ${t}`} type synergy: +${Math.round((mul - 1) * 100)}% dmg`, "#ffd83a"); });
      const shinyCount = mons.filter((m) => m.shiny).length;
      if (shinyCount > 0) pushLog(`✨ ${shinyCount} shiny Pokémon in this battle!`, "#ffd83a");


      setStatus("fighting"); setWinnerIdx(null); setWinnerTeam(null);
      setRunning(true); setScreen("battle");

      if (soundOn) mons.slice(0, 3).forEach((m, i) => setTimeout(() => playSound(m.data.cry, volume * 0.5), i * 250));
    } finally { setLoading(false); }
  };

  const resolveBetLabel = (target: string, mons: MonState[]) => {
    if (target.startsWith("team-")) return TEAM_NAMES[Number(target.slice(5))];
    const m = mons.find((mm) => mm.data.uid === target);
    return m ? m.data.name : target;
  };

  const manualEvolveOne = () => {
    if (shop.abilityManualEvolve <= 0) { pushLog("No Manual-Evolve charges.", "#ff7777"); return; }
    const mons = monsRef.current;
    const candidate = mons.find((m) => m.hp > 0 && m.data.evolveTo);
    if (!candidate) { pushLog("No mon can evolve right now.", "var(--color-muted-foreground)"); return; }
    candidate.evolveEnabled = true;
    candidate.evolveTimer = evolveMsRef.current; // force immediate
    setShop((s) => ({ ...s, abilityManualEvolve: Math.max(0, s.abilityManualEvolve - 1) }));
    pushLog(`Manual evolve triggered on ${candidate.data.name}.`, "#ffd83a");
  };

  if (screen === "shop") {
    return <Shop coins={coins} setCoins={setCoins} shop={shop} setShop={setShop} onClose={() => setScreen("lobby")} />;
  }

  if (screen === "catch") {
    return <CatchGym
      onClose={() => setScreen("lobby")}
      onChallengeGym={async (yourTeam: number[], gymTeam: number[]) => {
        setMode("teams");
        setRosterMode("custom");
        await loadPicksFromIds(
          [...yourTeam, ...gymTeam],
          [...yourTeam.map(() => 0), ...gymTeam.map(() => 1)],
          [...yourTeam.map(() => true), ...gymTeam.map(() => true)],
        );
        setBetTarget(null);
        setBetAmount(0);
        pendingStartRef.current = true;
        setScreen("lobby");
      }}
    />;
  }

  if (screen === "lobby") {
    return (
      <Lobby
        mode={mode} setMode={setMode}
        battleSize={battleSize} setBattleSize={setBattleSize}
        rosterMode={rosterMode} setRosterMode={setRosterMode}
        picks={picks} setPicks={setPicks}
        randomRoster={randomRoster} reroll={rollRandomRoster}
        randomGen={randomGen} setRandomGen={setRandomGen}
        randomRarity={randomRarity} setRandomRarity={setRandomRarity}
        randomEvo={randomEvo} setRandomEvo={setRandomEvo}
        betAmount={betAmount} setBetAmount={setBetAmount}
        betTarget={betTarget} setBetTarget={setBetTarget}
        coins={coins} soundOn={soundOn} setSoundOn={setSoundOn}
        evolveSec={evolveSec} setEvolveSec={setEvolveSec}
        shop={shop}
        favs={favs} setFavs={setFavs}
        onLoadIds={loadPicksFromIds} onSaveFav={saveFavorite}
        onStart={startBattle} loading={loading}
        openShop={() => setScreen("shop")}
        openCatch={() => setScreen("catch")}
      />
    );
  }

  return (
    <Battle
      monsRef={monsRef} projectilesRef={projectilesRef} popsRef={popsRef}
      mode={mode} log={log} status={status} winnerIdx={winnerIdx} winnerTeam={winnerTeam}
      running={running} setRunning={setRunning}
      payout={payout} coins={coins}
      shop={shop}
      onManualEvolve={manualEvolveOne}
      backToLobby={() => { setScreen("lobby"); setStatus("fighting"); setBetTarget(null); }}
      hud={{
        speedMul, setSpeedMul, eventsOn, setEventsOn,
        statsRef, koLogRef, startTimeRef,
        lastEvent, koCam, watermark, setWatermark,
        showIntro, matchSeed,
        fxRef, hypeRef, comboRef, suddenDmgRef,
      }}
    />

  );
}

// ============================================================
// Lobby
// ============================================================
function Lobby(props: {
  mode: Mode; setMode: (m: Mode) => void;
  battleSize: number; setBattleSize: (n: number) => void;
  rosterMode: "random" | "custom"; setRosterMode: (m: "random" | "custom") => void;
  picks: Pick[]; setPicks: (p: Pick[]) => void;
  randomRoster: MonData[]; reroll: () => void;
  randomGen: "all" | number; setRandomGen: (v: "all" | number) => void;
  randomRarity: "all" | "legendary" | "mythical" | "normal" | "nolegend"; setRandomRarity: (v: "all" | "legendary" | "mythical" | "normal" | "nolegend") => void;
  randomEvo: "all" | "basic" | "final"; setRandomEvo: (v: "all" | "basic" | "final") => void;
  betAmount: number; setBetAmount: (n: number) => void;
  betTarget: string | null; setBetTarget: (t: string | null) => void;
  coins: number; soundOn: boolean; setSoundOn: (s: boolean) => void;
  evolveSec: number; setEvolveSec: (n: number) => void;
  shop: ShopState;
  favs: Favorite[]; setFavs: React.Dispatch<React.SetStateAction<Favorite[]>>;
  onLoadIds: (ids: number[], teams?: number[], evolves?: boolean[]) => Promise<void>;
  onSaveFav: (name: string) => void;
  onStart: () => void; loading: boolean;
  openShop: () => void;
  openCatch: () => void;
}) {
  const { mode, setMode, battleSize, setBattleSize, rosterMode, setRosterMode,
    picks, setPicks, randomRoster, reroll, randomGen, setRandomGen, randomRarity, setRandomRarity, randomEvo, setRandomEvo,
    betAmount, setBetAmount, betTarget, setBetTarget,
    coins, soundOn, setSoundOn, evolveSec, setEvolveSec, shop,
    favs, setFavs, onLoadIds, onSaveFav,
    onStart, loading, openShop, openCatch } = props;

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | ElementType>("all");
  const [filterGen, setFilterGen] = useState<"all" | number>("all");
  const [filterRarity, setFilterRarity] = useState<"all" | "legendary" | "mythical" | "ultrabeast" | "normal">("all");
  const [filterForm, setFilterForm] = useState<"all" | "mega" | "gmax" | "regional">("all");
  const [filterEvos, setFilterEvos] = useState<"all" | "basic" | "1evo" | "2evo" | "4">("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [typeIdSet, setTypeIdSet] = useState<Set<number> | null>(null);
  const [evoLen, setEvoLen] = useState<Record<number, number>>({});

  useEffect(() => { loadCatalog().then(setCatalog).catch(() => {}); }, []);

  // Type filter: when user picks a type, fetch the official type endpoint once and cache.
  useEffect(() => {
    if (filterType === "all") { setTypeIdSet(null); return; }
    const cacheKey = `ppb-type-${filterType}`;
    const cached = lsGet<number[] | null>(cacheKey, null);
    if (cached) { setTypeIdSet(new Set(cached)); return; }
    let cancelled = false;
    fetch(`https://pokeapi.co/api/v2/type/${filterType}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const ids = (j.pokemon as { pokemon: { url: string } }[])
          .map((p) => Number(p.pokemon.url.match(/\/pokemon\/(\d+)\//)?.[1] || 0))
          .filter((n) => n > 0);
        lsSet(cacheKey, ids);
        setTypeIdSet(new Set(ids));
      }).catch(() => setTypeIdSet(new Set()));
    return () => { cancelled = true; };
  }, [filterType]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return catalog.filter((c) => {
      if (filterForm === "mega" && !isMegaName(c.name)) return false;
      if (filterForm === "gmax" && !isGmaxName(c.name)) return false;
      if (filterForm === "regional" && !isRegionalName(c.name)) return false;
      if (filterGen !== "all" && c.id <= 1025 && genOf(c.id) !== filterGen) return false;
      if (filterRarity !== "all" && c.id <= 1025 && rarityOf(c.id) !== filterRarity) return false;
      if (filterType !== "all" && typeIdSet && !typeIdSet.has(c.id)) return false;
      const hasSpecial = isMegaName(c.name) || isGmaxName(c.name) || isRegionalName(c.name);
      if (filterEvos === "4" && !hasSpecial) return false;
      if (filterEvos !== "all" && filterEvos !== "4" && hasSpecial) return false;
      if ((filterEvos === "basic" || filterEvos === "1evo" || filterEvos === "2evo") && c.id <= 1025) {
        const len = evoLen[c.id];
        if (len !== undefined) {
          if (filterEvos === "basic" && len !== 1) return false;
          if (filterEvos === "1evo" && len !== 2) return false;
          if (filterEvos === "2evo" && len < 3) return false;
        }
        // if len undefined, pass through — background fetch will resolve.
      }
      if (!s) return true;
      return c.name.includes(s) || c.display.toLowerCase().includes(s);
    }).slice(0, 320);
  }, [catalog, search, filterType, filterGen, filterRarity, filterForm, filterEvos, typeIdSet, evoLen]);

  // Lazy-fetch evo chain length for entries the user is filtering by stage.
  useEffect(() => {
    if (filterEvos !== "basic" && filterEvos !== "1evo" && filterEvos !== "2evo") return;
    const targets = filtered.filter((c) => c.id <= 1025 && evoLen[c.id] === undefined).slice(0, 60);
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const c of targets) {
        if (cancelled) return;
        const sp = await fetchSpecies(c.id);
        if (!sp?.evoChainUrl) { setEvoLen((m) => ({ ...m, [c.id]: 1 })); continue; }
        const chain = await fetchEvoChain(sp.evoChainUrl);
        const len = chain.length || 1;
        setEvoLen((m) => ({ ...m, [c.id]: len }));
      }
    })();
    return () => { cancelled = true; };
  }, [filterEvos, filtered, evoLen]);

  const addPick = async (entry: CatalogEntry) => {
    if (picks.length >= 80) return;
    setBusyId(entry.id);
    const m = await fetchMon(entry.id, `pick-${entry.id}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`);
    setBusyId(null);
    if (m) {
      setPicks([...picks, { mon: m, team: picks.length % 2, evolve: true }]);
    }
  };
  const clearAllPicks = () => setPicks([]);
  const removePick = (uid: string) => setPicks(picks.filter((p) => p.mon.uid !== uid));
  const updatePick = (uid: string, patch: Partial<Pick>) =>
    setPicks(picks.map((p) => (p.mon.uid === uid ? { ...p, ...patch } : p)));

  const canBet = betAmount > 0 && betAmount <= coins && betTarget !== null;
  const canStart = rosterMode === "random" ? randomRoster.length >= 2 : picks.length >= 2;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-3 p-3 sm:p-5"
      style={shop.customBg ? { backgroundImage: `url(${shop.customBg})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[10px] tracking-wider text-primary sm:text-sm">PIXEL POCKET BRAWL</h1>
          <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">All 1025 Pokémon · Mega · Gigantamax · Custom teams · Shop</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded border-2 border-border bg-panel px-3 py-2 text-[9px] sm:text-[11px]">
            <span className="text-muted-foreground">COINS </span>
            <span className="text-primary">{coins}</span>
          </div>
          <button onClick={openShop} className="rounded border-2 border-border bg-primary px-3 py-2 text-[8px] text-primary-foreground sm:text-[10px]">🛒 Shop</button>
          <button onClick={() => {
            const on = localStorage.getItem("ppb-infinite") === "1";
            if (on) { localStorage.removeItem("ppb-infinite"); writeCoins(coins > 999000 ? STARTING_COINS : coins); location.reload(); }
            else { localStorage.setItem("ppb-infinite", "1"); localStorage.setItem("ppb-coins", "999999"); location.reload(); }
          }} className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] sm:text-[10px]">
            {typeof window !== "undefined" && localStorage.getItem("ppb-infinite") === "1" ? "♾ ON" : "♾ Coins"}
          </button>
          <button onClick={openCatch}
            className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] sm:text-[10px]">🎒 Catch &amp; Gym</button>
          <button onClick={() => setSoundOn(!soundOn)} className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] sm:text-[10px]">
            {soundOn ? "🔊 Sound" : "🔇 Muted"}
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        {/* Settings */}
        <div className="rounded border-2 border-border bg-panel p-3">
          <p className="mb-3 text-[9px] text-primary sm:text-[11px]">BATTLE SETTINGS</p>
          <div className="space-y-3 text-[8px] sm:text-[10px]">
            <div>
              <p className="mb-1 text-muted-foreground">Mode</p>
              <div className="flex gap-2">
                <button onClick={() => setMode("ffa")} className={`flex-1 rounded border-2 border-border px-2 py-2 ${mode === "ffa" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Free-for-All</button>
                <button onClick={() => setMode("teams")} className={`flex-1 rounded border-2 border-border px-2 py-2 ${mode === "teams" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Teams</button>
              </div>
            </div>
            <div>
              <p className="mb-1 text-muted-foreground">Pokémon per battle: <span className="text-primary">{battleSize}</span></p>
              <input type="range" min={2} max={80} value={battleSize} onChange={(e) => setBattleSize(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <p className="mb-1 text-muted-foreground">Evolution timer: <span className="text-primary">{evolveSec}s</span></p>
              <input type="range" min={6} max={25} value={evolveSec} onChange={(e) => setEvolveSec(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <p className="mb-1 text-muted-foreground">Roster</p>
              <div className="flex gap-2">
                <button onClick={() => setRosterMode("random")} className={`flex-1 rounded border-2 border-border px-2 py-2 ${rosterMode === "random" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Random</button>
                <button onClick={() => setRosterMode("custom")} className={`flex-1 rounded border-2 border-border px-2 py-2 ${rosterMode === "custom" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Pick Your Own</button>
              </div>
            </div>
          </div>
        </div>

        {/* Bet */}
        <div className="rounded border-2 border-border bg-panel p-3">
          <p className="mb-3 text-[9px] text-primary sm:text-[11px]">PLACE YOUR BET</p>
          <div className="space-y-3 text-[8px] sm:text-[10px]">
            <div>
              <p className="mb-1 text-muted-foreground">Bet amount (max {coins})</p>
              <input type="number" min={0} max={coins} value={betAmount}
                onChange={(e) => setBetAmount(Math.max(0, Math.min(Math.max(0, coins - MIN_COINS), Number(e.target.value) || 0)))}
                className="w-full rounded border-2 border-border bg-background px-2 py-2 font-display" />
            </div>
            <div>
              <p className="mb-1 text-muted-foreground">Bet on</p>
              {mode === "teams" ? (
                <div className="flex gap-2">
                  {[0, 1].map((t) => (
                    <button key={t} onClick={() => setBetTarget(`team-${t}`)}
                      className="flex-1 rounded border-2 px-2 py-2"
                      style={{ borderColor: betTarget === `team-${t}` ? TEAM_COLORS[t] : "var(--color-border)", background: betTarget === `team-${t}` ? TEAM_COLORS[t] : "var(--color-muted)", color: betTarget === `team-${t}` ? "#000" : "inherit" }}>
                      {TEAM_NAMES[t]}
                    </button>
                  ))}
                </div>
              ) : (
                (() => {
                  const list = rosterMode === "custom" ? picks.map((p) => p.mon) : randomRoster;
                  if (list.length === 0) return <p className="text-muted-foreground">Pick or roll a roster to bet on one.</p>;
                  return (
                    <div className="flex flex-wrap gap-1">
                      {list.map((m) => (
                        <button key={m.uid} onClick={() => setBetTarget(m.uid)}
                          className="rounded border-2 px-2 py-1"
                          style={{ borderColor: betTarget === m.uid ? m.color : "var(--color-border)", background: betTarget === m.uid ? m.color : "var(--color-muted)", color: betTarget === m.uid ? "#000" : "inherit" }}>
                          {m.name}
                        </button>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
            <p className="text-[7px] text-muted-foreground sm:text-[9px]">Win: bet × {mode === "teams" ? 2 : Math.max(2, battleSize)}. Lose: lose your bet.</p>
          </div>
        </div>
      </section>

      {/* Random roster preview */}
      {rosterMode === "random" && (
        <section className="rounded border-2 border-border bg-panel p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[9px] text-primary sm:text-[11px]">YOUR RANDOM ROSTER ({randomRoster.length}/{battleSize})</p>
            <button onClick={reroll} disabled={loading} className="rounded border-2 border-border bg-muted px-2 py-1 text-[8px] sm:text-[10px]">🎲 Re-roll</button>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-1 text-[8px] sm:text-[10px]">
            <span className="text-muted-foreground">Pool:</span>
            <select value={randomGen} onChange={(e) => setRandomGen(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="rounded border-2 border-border bg-background px-2 py-1">
              <option value="all">All Gens</option>
              {[1,2,3,4,5,6,7,8,9].map((g) => <option key={g} value={g}>Gen {g}</option>)}
            </select>
            <select value={randomRarity} onChange={(e) => setRandomRarity(e.target.value as typeof randomRarity)}
              className="rounded border-2 border-border bg-background px-2 py-1">
              <option value="all">Any rarity</option>
              <option value="nolegend">No legendaries</option>
              <option value="legendary">Legendary only</option>
              <option value="mythical">Mythical only</option>
              <option value="normal">Normal only</option>
            </select>
            <select value={randomEvo} onChange={(e) => setRandomEvo(e.target.value as typeof randomEvo)}
              className="rounded border-2 border-border bg-background px-2 py-1" title="Evolution stage">
              <option value="all">Any stage</option>
              <option value="basic">Basics only</option>
              <option value="final">Final forms only</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {randomRoster.length === 0 ? <p className="col-span-full text-[8px] text-muted-foreground">Rolling…</p> : randomRoster.map((m) => (
              <div key={m.uid} className="flex flex-col items-center rounded border-2 border-border bg-muted p-1 text-[7px] sm:text-[9px]" title={m.name}>
                <img src={m.sprite} alt={m.name} className="h-12 w-12" style={{ imageRendering: "pixelated", objectFit: "contain" }} />
                <span className="truncate w-full text-center" style={{ color: m.color }}>{m.name}</span>
                <span className="text-muted-foreground">{m.type}</span>
              </div>
            ))}
          </div>
        </section>
      )}


      {/* Preset battles + Favorites */}
      <section className="rounded border-2 border-border bg-panel p-3">
        <p className="mb-2 text-[9px] text-primary sm:text-[11px]">PRESET BATTLES</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.id} disabled={loading}
              onClick={async () => { setBattleSize(Math.min(80, Math.max(2, p.ids.length))); await onLoadIds(p.ids); setMode("ffa"); }}
              title={p.description}
              className="rounded border-2 border-border bg-muted px-2 py-1 text-left text-[8px] hover:brightness-125 disabled:opacity-40 sm:text-[10px]">
              <div className="text-primary">{p.label}</div>
              <div className="text-[7px] text-muted-foreground">{p.description}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[9px] text-primary sm:text-[11px]">★ FAVORITES ({favs.length}/{MAX_FAVS})</p>
          {rosterMode === "custom" && picks.length > 0 && favs.length < MAX_FAVS && (
            <button onClick={() => {
              const n = prompt("Name this favorite team:", `Team ${favs.length + 1}`);
              if (n) onSaveFav(n);
            }} className="rounded border-2 border-border bg-primary px-2 py-1 text-[8px] text-primary-foreground sm:text-[10px]">
              ★ Save current picks
            </button>
          )}
        </div>
        {favs.length === 0 ? (
          <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">Pick your own team then save it to start the same battle in one click.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-2">
            {favs.map((f) => (
              <div key={f.id} className="flex items-center gap-1 rounded border-2 border-border bg-muted px-2 py-1 text-[8px] sm:text-[10px]">
                <button disabled={loading} onClick={async () => { setMode(f.mode); await onLoadIds(f.ids, f.teams, f.evolves); }}
                  className="text-primary hover:brightness-125">▶ {f.name}</button>
                <span className="text-muted-foreground">({f.ids.length})</span>
                <button onClick={() => setFavs((cur) => cur.filter((x) => x.id !== f.id))} className="ml-1 text-red-400">×</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Custom picker */}
      {rosterMode === "custom" && (
        <section className="rounded border-2 border-border bg-panel p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[9px] text-primary sm:text-[11px]">PICK YOUR FIGHTERS ({picks.length})</p>
            <div className="flex flex-wrap gap-1">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search..."
                className="rounded border-2 border-border bg-background px-2 py-1 text-[8px] sm:text-[10px]" />
              <select value={filterGen} onChange={(e) => setFilterGen(e.target.value === "all" ? "all" : Number(e.target.value))}
                className="rounded border-2 border-border bg-background px-2 py-1 text-[8px] sm:text-[10px]">
                <option value="all">All Gens</option>
                {[1,2,3,4,5,6,7,8,9].map((g) => <option key={g} value={g}>Gen {g}</option>)}
              </select>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as "all" | ElementType)}
                className="rounded border-2 border-border bg-background px-2 py-1 text-[8px] sm:text-[10px]">
                <option value="all">All Types</option>
                {(Object.keys(TYPE_COLORS) as ElementType[]).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value as "all" | "legendary" | "mythical" | "ultrabeast" | "normal")}
                className="rounded border-2 border-border bg-background px-2 py-1 text-[8px] sm:text-[10px]">
                <option value="all">All Rarities</option>
                <option value="normal">Normal</option>
                <option value="legendary">Legendary</option>
                <option value="mythical">Mythical</option>
                <option value="ultrabeast">Ultra Beast</option>
              </select>
              <select value={filterForm} onChange={(e) => setFilterForm(e.target.value as "all" | "mega" | "gmax" | "regional")}
                className="rounded border-2 border-border bg-background px-2 py-1 text-[8px] sm:text-[10px]">
                <option value="all">All Forms</option>
                <option value="mega">Mega only</option>
                <option value="gmax">G-Max only</option>
                <option value="regional">Regional</option>
              </select>
              <select value={filterEvos} onChange={(e) => setFilterEvos(e.target.value as typeof filterEvos)}
                className="rounded border-2 border-border bg-background px-2 py-1 text-[8px] sm:text-[10px]" title="Evolutions">
                <option value="all">Any evo line</option>
                <option value="basic">Basics only (no evo yet)</option>
                <option value="1evo">1 evolution (2-stage)</option>
                <option value="2evo">2 evolutions (3-stage)</option>
                <option value="4">4+ (Mega/Gmax/Regional)</option>
              </select>
              {picks.length > 0 && (
                <button onClick={clearAllPicks} className="rounded border-2 border-border bg-destructive/40 px-2 py-1 text-[8px] sm:text-[10px]">🗑 Clear all</button>
              )}
            </div>
          </div>

          {picks.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 rounded border border-border bg-background/40 p-2">
              {picks.map((p) => (
                <div key={p.mon.uid} className="flex items-center gap-2 rounded border-2 px-2 py-1 text-[8px] sm:text-[10px]" style={{ borderColor: p.mon.color }}>
                  <img src={p.mon.sprite} alt={p.mon.name} className="h-7 w-7" style={{ imageRendering: "pixelated", objectFit: "contain" }} />
                  <span style={{ color: p.mon.color }}>{p.mon.name}</span>
                  <span className="text-muted-foreground">{p.mon.type}</span>
                  {mode === "teams" && (
                    <div className="flex gap-0.5">
                      {[0, 1].map((t) => (
                        <button key={t} onClick={() => updatePick(p.mon.uid, { team: t })}
                          className="rounded px-1.5 py-0.5 text-[7px]"
                          style={{ background: p.team === t ? TEAM_COLORS[t] : "transparent", color: p.team === t ? "#000" : TEAM_COLORS[t], border: `1px solid ${TEAM_COLORS[t]}` }}>
                          {t === 0 ? "R" : "B"}
                        </button>
                      ))}
                    </div>
                  )}
                  <label className="flex items-center gap-1 text-[7px]">
                    <input type="checkbox" checked={p.evolve} onChange={(e) => updatePick(p.mon.uid, { evolve: e.target.checked })} />
                    evolve
                  </label>
                  <button onClick={() => removePick(p.mon.uid)} className="ml-1 text-red-400">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="grid max-h-72 grid-cols-3 gap-1 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8">
            {catalog.length === 0 ? (
              <p className="col-span-full text-center text-[8px] text-muted-foreground">Loading Pokédex…</p>
            ) : filtered.map((c) => {
              const count = picks.filter((p) => p.mon.id === c.id).length;
              return (
                <button key={c.id} disabled={busyId === c.id}
                  onClick={() => addPick(c)}
                  className="relative flex flex-col items-center rounded border-2 border-border bg-muted p-1 text-[7px] hover:brightness-125 disabled:opacity-40 sm:text-[8px]"
                  title={c.display + (count > 0 ? ` (×${count} picked — tap to add another)` : "")}>
                  <img src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${c.id}.png`}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://play.pokemonshowdown.com/sprites/gen5/${slugify(c.name)}.png`; }}
                    alt={c.display}
                    loading="lazy" className="h-10 w-10" style={{ imageRendering: "pixelated", objectFit: "contain" }} />
                  <span className="truncate w-full text-center">{c.display}</span>
                  {count > 0 && <span className="absolute right-0 top-0 rounded-bl bg-primary px-1 text-[7px] text-primary-foreground">×{count}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[8px] text-muted-foreground sm:text-[10px]">
          {rosterMode === "random" ? `Evolves every ${evolveSec}s.` : `Evolution per-mon (uses ${evolveSec}s timer).`}
        </p>
        <button onClick={onStart} disabled={!canStart || loading}
          className="rounded border-2 border-border bg-accent px-5 py-3 text-[10px] text-primary-foreground hover:brightness-110 disabled:opacity-40 sm:text-xs">
          {loading ? "Loading…" : canBet ? "START BATTLE (with bet)" : "START BATTLE"}
        </button>
      </div>
    </main>
  );
}

// ============================================================
// Shop
// ============================================================
function Shop({ coins, setCoins, shop, setShop, onClose }: {
  coins: number; setCoins: (fn: (n: number) => number) => void;
  shop: ShopState; setShop: (fn: (s: ShopState) => ShopState) => void;
  onClose: () => void;
}) {
  const buyBg = (id: string, price: number) => {
    if (shop.ownedBgs.includes(id)) { setShop((s) => ({ ...s, selectedBg: id })); return; }
    if (coins - price < MIN_COINS) return;
    setCoins((c) => c - price);
    setShop((s) => ({ ...s, ownedBgs: [...s.ownedBgs, id], selectedBg: id }));
  };
  const buyFx = (id: string, price: number) => {
    if (shop.ownedFx.includes(id)) { setShop((s) => ({ ...s, selectedFx: id })); return; }
    if (coins - price < MIN_COINS) return;
    setCoins((c) => c - price);
    setShop((s) => ({ ...s, ownedFx: [...s.ownedFx, id], selectedFx: id }));
  };
  const buyAbility = (kind: "pick" | "evolve") => {
    const price = kind === "pick" ? ABILITY_PICK_PRICE : ABILITY_EVOLVE_PRICE;
    if (coins - price < MIN_COINS) return;
    setCoins((c) => c - price);
    setShop((s) => kind === "pick" ? { ...s, abilityPickWinner: s.abilityPickWinner + 1 } : { ...s, abilityManualEvolve: s.abilityManualEvolve + 1 });
  };
  const uploadBg = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setShop((s) => ({ ...s, customBg: typeof reader.result === "string" ? reader.result : null }));
    reader.readAsDataURL(file);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-3 p-3 sm:p-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-[10px] tracking-wider text-primary sm:text-sm">SHOP</h1>
          <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">Spend coins on arena themes, win effects, and abilities.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded border-2 border-border bg-panel px-3 py-2 text-[9px] sm:text-[11px]">
            <span className="text-muted-foreground">COINS </span><span className="text-primary">{coins}</span>
          </div>
          <button onClick={onClose} className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] sm:text-[10px]">← Lobby</button>
        </div>
      </header>

      <section className="rounded border-2 border-border bg-panel p-3">
        <p className="mb-2 text-[9px] text-primary sm:text-[11px]">ARENA BACKGROUNDS</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {BACKGROUNDS.map((b) => {
            const owned = shop.ownedBgs.includes(b.id);
            const selected = shop.selectedBg === b.id;
            return (
              <button key={b.id} onClick={() => buyBg(b.id, b.price)}
                className={`flex flex-col items-stretch rounded border-2 p-1 text-[7px] sm:text-[9px] ${selected ? "border-primary" : "border-border"}`}>
                <div className={`${b.cls} h-16 rounded`} />
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span>{b.label}</span>
                  <span className="text-muted-foreground">{owned ? (selected ? "✓" : "owned") : `${b.price}c`}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <p className="text-[8px] text-muted-foreground sm:text-[10px]">Or upload a lobby background:</p>
          <div className="mt-1 flex items-center gap-2">
            <input type="file" accept="image/*" onChange={(e) => uploadBg(e.target.files?.[0] ?? null)}
              className="text-[8px] text-muted-foreground" />
            {shop.customBg && <button onClick={() => setShop((s) => ({ ...s, customBg: null }))} className="rounded border border-border bg-muted px-2 py-1 text-[7px]">clear</button>}
          </div>
        </div>
      </section>

      <section className="rounded border-2 border-border bg-panel p-3">
        <p className="mb-2 text-[9px] text-primary sm:text-[11px]">WIN EFFECTS</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {WIN_FX.map((f) => {
            const owned = shop.ownedFx.includes(f.id);
            const selected = shop.selectedFx === f.id;
            return (
              <button key={f.id} onClick={() => buyFx(f.id, f.price)}
                className={`rounded border-2 p-2 text-[8px] sm:text-[10px] ${selected ? "border-primary" : "border-border"}`}>
                <p>{f.label}</p>
                <p className="text-muted-foreground">{owned ? (selected ? "✓ selected" : "owned") : `${f.price}c`}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded border-2 border-border bg-panel p-3">
        <p className="mb-2 text-[9px] text-primary sm:text-[11px]">ABILITIES (consumable)</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button onClick={() => buyAbility("pick")} className="rounded border-2 border-border bg-muted p-2 text-left text-[8px] sm:text-[10px]">
            <p className="text-primary">Pick Winner</p>
            <p className="text-muted-foreground">50% chance: the side you bet on wins. {ABILITY_PICK_PRICE}c · owned: {shop.abilityPickWinner}</p>
          </button>
          <button onClick={() => buyAbility("evolve")} className="rounded border-2 border-border bg-muted p-2 text-left text-[8px] sm:text-[10px]">
            <p className="text-primary">Manual Evolve</p>
            <p className="text-muted-foreground">During battle, evolve one of your mons instantly. {ABILITY_EVOLVE_PRICE}c · owned: {shop.abilityManualEvolve}</p>
          </button>
        </div>
      </section>
    </main>
  );
}

// ============================================================
// Battle screen (with pause-and-drag)
// ============================================================
type BattleHud = {
  speedMul: number; setSpeedMul: (n: number) => void;
  eventsOn: boolean; setEventsOn: (b: boolean) => void;
  statsRef: React.MutableRefObject<Record<string, { dmg: number; kos: number; name: string; color: string; sprite: string }>>;
  koLogRef: React.MutableRefObject<{ t: number; name: string; color: string }[]>;
  startTimeRef: React.MutableRefObject<number>;
  lastEvent: { text: string; color: string; until: number } | null;
  koCam: { name: string; color: string; sprite: string; until: number } | null;
  watermark: string; setWatermark: (s: string) => void;
  showIntro: boolean;
  matchSeed: number;
  fxRef: React.MutableRefObject<Array<{ kind: string; id: number; x?: number; y?: number; born?: number; until?: number; color?: string; strength?: number; n?: number }>>;
  hypeRef: React.MutableRefObject<{ value: number; overdriveUntil: number }>;
  comboRef: React.MutableRefObject<{ count: number; until: number }>;
  suddenDmgRef: React.MutableRefObject<boolean>;
};
function Battle(props: {
  monsRef: React.MutableRefObject<MonState[]>;
  projectilesRef: React.MutableRefObject<Projectile[]>;
  popsRef: React.MutableRefObject<Pop[]>;
  mode: Mode; log: LogEntry[];
  status: "fighting" | "ended"; winnerIdx: number | null; winnerTeam: number | null;
  running: boolean; setRunning: (b: boolean) => void;
  payout: number; coins: number;
  shop: ShopState;
  onManualEvolve: () => void;
  backToLobby: () => void;
  hud: BattleHud;
}) {
  const { monsRef, projectilesRef, popsRef, mode, log, status, winnerIdx, winnerTeam, running, setRunning, payout, coins, shop, onManualEvolve, backToLobby, hud } = props;

  const mons = monsRef.current;
  const now = performance.now();
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ idx: number; offX: number; offY: number } | null>(null);
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const on = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const sizeMul = isFs ? 1.6 : 1;

  const bgCls = (BACKGROUNDS.find((b) => b.id === shop.selectedBg)?.cls) || "arena-grass";

  const onPointerDown = (e: React.PointerEvent, idx: number) => {
    if (running) return;
    const wrap = arenaRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * ARENA_W;
    const py = ((e.clientY - rect.top) / rect.height) * ARENA_H;
    const m = monsRef.current[idx];
    dragRef.current = { idx, offX: px - m.pos.x, offY: py - m.pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const wrap = arenaRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * ARENA_W;
    const py = ((e.clientY - rect.top) / rect.height) * ARENA_H;
    const m = monsRef.current[d.idx];
    m.pos.x = Math.max(MON_R, Math.min(ARENA_W - MON_R, px - d.offX));
    m.pos.y = Math.max(MON_R, Math.min(ARENA_H - MON_R, py - d.offY));
    m.vel.x = 0; m.vel.y = 0;
  };
  const onPointerUp = () => { dragRef.current = null; };

  // Rotom (#479) form rotator — swap form every 3 seconds.
  useEffect(() => {
    const ROTOM_FORMS = [479, 10008, 10009, 10010, 10011, 10012];
    const rotomMons = monsRef.current.filter((m) => m.data.speciesId === 479);
    if (rotomMons.length === 0) return;
    let cancelled = false;
    (async () => {
      const forms = (await Promise.all(ROTOM_FORMS.map((id) => fetchMon(id, `rotom-${id}`)))).filter((x): x is MonData => !!x);
      if (cancelled || forms.length === 0) return;
      const id = setInterval(() => {
        rotomMons.forEach((m) => {
          if (m.hp <= 0) return;
          const cur = forms.findIndex((f) => f.id === m.data.id);
          const next = forms[(cur + 1) % forms.length];
          m.data = { ...next, uid: m.data.uid };
        });
      }, 3000);
      (rotomMons[0] as MonState & { __rotomTimer?: number }).__rotomTimer = id as unknown as number;
    })();
    return () => {
      cancelled = true;
      const id = (rotomMons[0] as MonState & { __rotomTimer?: number }).__rotomTimer;
      if (id) clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-3 p-3 sm:p-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[10px] tracking-wider text-primary sm:text-sm">
            BATTLE #{hud.matchSeed.toString().padStart(6, "0")} · ⏱ {formatMs(now - hud.startTimeRef.current)}
          </h1>
          <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">
            {matchTitle(mons, mode)} · COINS {coins}
            {!running && " · PAUSED (drag mons to reposition)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => {
            const cycle = [1, 1.5, 2, 3];
            const next = cycle[(cycle.indexOf(hud.speedMul) + 1) % cycle.length];
            hud.setSpeedMul(next);
          }} className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] sm:text-[10px]">⏩ Speed {hud.speedMul}x</button>
          <button onClick={() => hud.setEventsOn(!hud.eventsOn)} className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] sm:text-[10px]">
            🎲 Events {hud.eventsOn ? "ON" : "OFF"}
          </button>
          {shop.abilityManualEvolve > 0 && status === "fighting" && (
            <button onClick={onManualEvolve} className="rounded border-2 border-border bg-primary px-3 py-2 text-[8px] text-primary-foreground sm:text-[10px]">⚡ Evolve ({shop.abilityManualEvolve})</button>
          )}
          <button onClick={() => setRunning(!running)} className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] sm:text-[10px]">
            {running ? "⏸ Pause" : "▶ Resume"}
          </button>
          <button onClick={() => {
            const el = arenaRef.current;
            if (!el) return;
            if (document.fullscreenElement) void document.exitFullscreen();
            else void el.requestFullscreen?.().catch(() => {});
          }} className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] sm:text-[10px]">⛶ Fullscreen</button>
          <button onClick={backToLobby} className="rounded border-2 border-border bg-accent px-3 py-2 text-[8px] text-primary-foreground sm:text-[10px]">
            Back to Lobby
          </button>
        </div>
      </header>


      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(mons.length, 8)}, minmax(0,1fr))` }}>
        {mons.map((m, i) => {
          const d = m.data;
          const dead = m.hp <= 0;
          const teamCol = mode === "teams" ? TEAM_COLORS[m.team] : d.color;
          void i;
          return (
            <div key={d.uid} className="rounded border-2 bg-panel p-2 text-center"
              style={{ borderColor: mode === "teams" ? teamCol : "var(--color-border)", boxShadow: `inset 0 -3px 0 ${d.color}`, opacity: dead ? 0.45 : 1 }}>
              {mode === "teams" && <p className="text-[6px] sm:text-[7px]" style={{ color: teamCol }}>{TEAM_NAMES[m.team].split(" ")[0]}</p>}
              <p className="text-[7px] sm:text-[9px]" style={{ color: d.color }}>{dead ? "K.O." : d.name}</p>
              <p className="text-[6px] text-muted-foreground sm:text-[8px]">{d.signature.name}</p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded border border-border bg-background">
                <div className="h-full transition-[width] duration-200" style={{ width: `${(m.hp / m.maxHp) * 100}%`, background: m.hp > m.maxHp * 0.4 ? "var(--color-hp)" : "var(--color-hp-low)" }} />
              </div>
              <p className="mt-1 text-[6px] text-muted-foreground sm:text-[7px]">A{d.baseAtk} D{d.baseDef} S{d.baseSpd}</p>
              {!dead && m.evolveEnabled && (d.evolveTo || m.plusLevel < 2) && (() => {
                const total = (typeof window !== "undefined" ? (window as unknown as { __ppbEvolveMs?: number }).__ppbEvolveMs : 0) || 15000;
                const remain = Math.max(0, Math.ceil((total - m.evolveTimer) / 1000));
                const label = d.evolveTo ? (d.evolveTo.isMega ? "Mega" : d.evolveTo.isGmax ? "G-Max" : "Evo") : (m.plusLevel === 0 ? "✦ Plus" : "✦✦ Plus");
                return <p className="text-[6px] sm:text-[7px]" style={{ color: "#ffd83a" }}>{label} in {remain}s</p>;
              })()}
            </div>
          );
        })}
      </div>

      <div ref={arenaRef} className="arena-wrap relative w-full overflow-hidden rounded-xl border-4 border-border" style={{ aspectRatio: `${ARENA_W} / ${ARENA_H}` }}>
        <div className={`${bgCls} absolute inset-0`} />
        <FxLayer fxRef={hud.fxRef} now={now} />
        {now < hud.hypeRef.current.overdriveUntil && <div className="fx-overdrive-bg" />}
        {hud.suddenDmgRef.current && <div className="fx-overdrive-bg" style={{ mixBlendMode: "screen", background: "radial-gradient(circle at 50% 50%, rgba(255,60,60,0.18), transparent 70%)" }} />}
        {/* Hype meter + Combo HUD */}
        <div className="pointer-events-none absolute left-2 top-2 z-20 w-40">
          <div className="mb-1 text-[7px] text-[#ffd83a]" style={{ textShadow: "0 1px 2px black" }}>
            HYPE {now < hud.hypeRef.current.overdriveUntil ? "· 🚀 OVERDRIVE" : ""}
          </div>
          <div className="h-2 w-full overflow-hidden rounded border border-border bg-black/60">
            <div className="h-full bg-[#ffd83a] transition-[width]" style={{ width: `${Math.min(100, (hud.hypeRef.current.value / 800) * 100)}%` }} />
          </div>
          {now < hud.comboRef.current.until && hud.comboRef.current.count >= 2 && (
            <div className="mt-1 text-[9px] font-bold" style={{ color: "#ffd83a", textShadow: "0 0 6px black" }}>
              ×{hud.comboRef.current.count} COMBO
            </div>
          )}
        </div>
        <div className="relative h-full w-full">
          <svg viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} className="absolute inset-0 h-full w-full pointer-events-none" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="glowGold"><stop offset="0%" stopColor="#fff8b0" stopOpacity="0.9"/><stop offset="100%" stopColor="#fff8b0" stopOpacity="0"/></radialGradient>
            </defs>
            <circle cx={ARENA_W / 2} cy={ARENA_H / 2} r={140} fill="none" stroke="rgba(255,255,255,0.12)" strokeDasharray="6 8" />
            <circle cx={ARENA_W / 2} cy={ARENA_H / 2} r={50} fill="rgba(255,255,255,0.05)" />
            {mons.map((m, i) => m.hp <= 0 ? null : (
              <ellipse key={`s${i}`} cx={m.pos.x} cy={m.pos.y + MON_R - 4} rx={MON_R * 0.7} ry={5} fill="rgba(0,0,0,0.4)" />
            ))}
            {mons.map((m, i) => {
              if (!m.evolveFlashUntil || now > m.evolveFlashUntil) return null;
              const remaining = m.evolveFlashUntil - now;
              const t = 1 - remaining / EVOLVE_FLASH_MS;
              return (
                <g key={`ev${i}`}>
                  {[0, 0.33, 0.66].map((offset, k) => {
                    const lt = (t + offset) % 1;
                    const rr = 20 + lt * 80;
                    const op = (1 - lt) * 0.9;
                    return <circle key={k} cx={m.pos.x} cy={m.pos.y} r={rr} fill="none" stroke="#fff8b0" strokeWidth={3} opacity={op} />;
                  })}
                  <circle cx={m.pos.x} cy={m.pos.y} r={MON_R + 14} fill="url(#glowGold)" />
                </g>
              );
            })}
            {projectilesRef.current.map((p) => <ProjectileFx key={p.id} p={p} now={now} />)}
            {mons.map((m, i) => m.attackFlash ? (
              <circle key={`r${i}`} cx={m.pos.x} cy={m.pos.y} r={MON_R + 10} fill="none" stroke={m.data.color} strokeWidth={2} opacity={0.7} />
            ) : null)}
          </svg>

          {mons.map((m, i) => {
            const d = m.data;
            const fainted = m.hp <= 0;
            const size = (d.isGmax ? 100 : d.isMega ? 84 : (m.plusLevel === 2 ? 80 : m.plusLevel === 1 ? 72 : 64)) * sizeMul;
            const evolving = m.evolveFlashUntil && now < m.evolveFlashUntil;
            const aliveCount = mons.filter((mm) => mm.hp > 0).length;
            const isBoss = !fainted && aliveCount <= 2 && mons.length >= 3;
            const koCount = (hud.statsRef?.current?.[d.uid]?.kos) ?? 0;
            const rainbow = koCount >= 3;
            return (
              <div key={d.uid}
                onPointerDown={(e) => !fainted && onPointerDown(e, i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={`absolute flex flex-col items-center ${running ? "anim-float" : ""} ${rainbow ? "fx-rainbow" : ""}`}
                style={{
                  left: `${(m.pos.x / ARENA_W) * 100}%`,
                  top: `${(m.pos.y / ARENA_H) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: size, opacity: fainted ? 0.2 : 1,
                  cursor: !running && !fainted ? "grab" : "default",
                  touchAction: "none",
                  filter: m.hitFlash ? "brightness(2.4) saturate(0)"
                    : evolving ? "drop-shadow(0 0 18px #fff8b0) drop-shadow(0 0 8px #ffe066) brightness(1.5) saturate(1.4)"
                    : m.shiny ? `drop-shadow(0 0 8px #ffd83a) drop-shadow(0 0 4px #fff) hue-rotate(25deg) saturate(1.3)`
                    : `drop-shadow(0 0 6px ${d.color})`,
                  transition: "filter 120ms",
                }}>
                {isBoss && <div className="fx-boss absolute" style={{ width: size + 12, height: size + 12, left: -6, top: -6 }} />}
                <img src={d.sprite} alt={d.name} className={evolving ? "anim-evolve-spin" : ""} draggable={false}
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    if (!img.dataset.fallback) {
                      img.dataset.fallback = "1";
                      img.src = `https://play.pokemonshowdown.com/sprites/gen5/${slugify(d.name.toLowerCase().replace(/ /g, "-"))}.png`;
                    } else if (img.dataset.fallback === "1") {
                      img.dataset.fallback = "2";
                      img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${d.id}.png`;
                    }
                  }}
                  style={{ width: size, height: size, imageRendering: "pixelated", objectFit: "contain" }} />
                {!fainted && (
                  <>
                    <span className="mt-0.5 rounded bg-black/70 px-1 text-[7px]" style={{ color: m.shiny ? "#ffd83a" : d.color }}>
                      {m.shiny ? "✨" : ""}{d.isMega ? "⚡" : d.isGmax ? "🌀" : ""}{d.name}
                    </span>
                    <div className="mt-0.5 h-1 w-14 overflow-hidden rounded bg-black/60">
                      <div className="h-full" style={{ width: `${(m.hp / m.maxHp) * 100}%`, background: m.hp > m.maxHp * 0.4 ? "#62e07a" : "#ff5566" }} />
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {popsRef.current.map((p) => {
            const label = p.value === 0
              ? (p.color === "#ffd83a" ? "SUPER!" : p.color === "#ff7777" ? "NO EFFECT" : "resisted")
              : `-${p.value}${p.crit ? "!" : ""}`;
            return (
              <span key={p.id} className="dmg-pop pointer-events-none absolute text-[10px] sm:text-xs"
                style={{ left: `${(p.x / ARENA_W) * 100}%`, top: `${(p.y / ARENA_H) * 100}%`, color: p.color }}>
                {label}
              </span>
            );
          })}

        </div>

        {/* Watermark overlay for YouTube branding */}
        {hud.watermark && (
          <div className="pointer-events-none absolute bottom-2 right-3 text-[9px] sm:text-[11px]"
            style={{ color: "rgba(255,255,255,0.75)", textShadow: "0 1px 2px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)" }}>
            {hud.watermark}
          </div>
        )}

        {/* Random event banner */}
        {hud.lastEvent && now < hud.lastEvent.until && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded border-2 bg-background/85 px-3 py-2 text-center text-[9px] sm:text-[11px]"
            style={{ borderColor: hud.lastEvent.color, color: hud.lastEvent.color, boxShadow: `0 0 20px ${hud.lastEvent.color}` }}>
            {hud.lastEvent.text}
          </div>
        )}

        {/* KO cam splash */}
        {hud.koCam && now < hud.koCam.until && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
            <div className="rounded border-4 bg-background/70 px-6 py-3" style={{ borderColor: hud.koCam.color, boxShadow: `0 0 40px ${hud.koCam.color}` }}>
              <img src={hud.koCam.sprite} alt="" className="mx-auto h-24 w-24" style={{ imageRendering: "pixelated", filter: `drop-shadow(0 0 12px ${hud.koCam.color})` }} />
              <p className="mt-1 text-center text-[12px] sm:text-[16px]" style={{ color: hud.koCam.color, textShadow: "0 0 6px black" }}>K.O.! {hud.koCam.name}</p>
            </div>
          </div>
        )}

        {/* 3-2-1 intro countdown */}
        {hud.showIntro && <IntroCountdown startedAt={hud.startTimeRef.current} />}

        {status === "ended" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
            <WinFx kind={shop.selectedFx} color={winnerTeam !== null ? TEAM_COLORS[winnerTeam] : (winnerIdx !== null ? mons[winnerIdx].data.color : "#ffd83a")} />
            <div className="relative z-20 max-h-[92%] w-[92%] max-w-md overflow-auto rounded border-2 border-border bg-panel px-4 py-3 text-center">
              {winnerTeam !== null ? (
                <>
                  <p className="text-[10px] sm:text-sm" style={{ color: TEAM_COLORS[winnerTeam] }}>{TEAM_NAMES[winnerTeam]} WINS!</p>
                  <div className="my-2 flex flex-wrap justify-center gap-2">
                    {mons.map((m) => m.team === winnerTeam && m.hp > 0 ? (
                      <img key={m.data.uid} src={m.data.sprite} alt={m.data.name} className="h-16 w-16"
                        style={{ imageRendering: "pixelated", filter: `drop-shadow(0 0 10px ${TEAM_COLORS[winnerTeam]})` }} />
                    ) : null)}
                  </div>
                </>
              ) : winnerIdx !== null ? (
                <>
                  <p className="text-[10px] sm:text-sm" style={{ color: mons[winnerIdx].data.color }}>WINNER: {mons[winnerIdx].data.name}</p>
                  <img src={mons[winnerIdx].data.sprite} alt="winner" className="mx-auto my-2 h-20 w-20"
                    style={{ imageRendering: "pixelated", filter: `drop-shadow(0 0 14px ${mons[winnerIdx].data.color})` }} />
                </>
              ) : <p className="text-[10px] sm:text-sm text-muted-foreground">DRAW</p>}
              {payout !== 0 && (
                <p className="text-[9px]" style={{ color: payout > 0 ? "#ffd83a" : "#ff7777" }}>
                  {payout > 0 ? `+${payout}` : payout} coins (balance: {coins})
                </p>
              )}

              {/* MVP + damage leaderboard */}
              <MvpPanel statsRef={hud.statsRef} />

              {/* Chapter markers (KO timestamps) */}
              {hud.koLogRef.current.length > 0 && (
                <div className="mt-2 rounded border border-border bg-background/60 p-2 text-left">
                  <p className="mb-1 text-[7px] text-primary sm:text-[9px]">📺 CHAPTERS (KO timeline)</p>
                  <ul className="max-h-24 space-y-0.5 overflow-auto text-[7px] leading-tight sm:text-[8px]">
                    {hud.koLogRef.current.map((k, i) => (
                      <li key={i} style={{ color: k.color }}>{formatMs(k.t)} — {k.name} KO'd</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Watermark editor + copy summary */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <input value={hud.watermark} onChange={(e) => hud.setWatermark(e.target.value)} placeholder="@YourChannel"
                  className="rounded border-2 border-border bg-background px-2 py-1 text-[8px] sm:text-[9px]" />
                <button onClick={() => copyMatchSummary(hud, mons, winnerIdx, winnerTeam, mode)}
                  className="rounded border-2 border-border bg-muted px-3 py-1 text-[8px] sm:text-[9px]">📋 Copy YouTube Summary</button>
              </div>

              <div className="mt-2 flex justify-center gap-2">
                <button onClick={() => location.reload()} className="rounded border-2 border-border bg-muted px-3 py-2 text-[9px] sm:text-[10px]">🔁 Rematch</button>
                <button onClick={backToLobby} className="rounded border-2 border-border bg-primary px-3 py-2 text-[9px] text-primary-foreground hover:brightness-110 sm:text-[10px]">
                  Back to Lobby
                </button>
              </div>
            </div>
          </div>
        )}
      </div>


      <section className="rounded-md border-2 border-border bg-panel p-3">
        <p className="mb-2 text-[8px] text-primary sm:text-[10px]">BATTLE LOG</p>
        <ul className="flex max-h-40 flex-col gap-1 overflow-hidden text-[7px] leading-relaxed sm:text-[9px]">
          {log.map((entry) => (<li key={entry.id} style={{ color: entry.color }}>&gt; {entry.text}</li>))}
        </ul>
      </section>
    </main>
  );
}

// ============================================================
// ============================================================
// YouTube HUD helpers
// ============================================================
function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
function matchTitle(mons: MonState[], mode: Mode): string {
  if (mode === "teams") return `Team Battle · ${mons.length} mons`;
  const names = mons.slice(0, 6).map((m) => m.data.name.replace(/^✦+/, ""));
  const extra = mons.length > 6 ? ` +${mons.length - 6} more` : "";
  return `${names.join(" vs ")}${extra}`;
}
function FxLayer({ fxRef, now }: { fxRef: BattleHud["fxRef"]; now: number }) {
  // Prune expired
  const items = fxRef.current;
  for (let i = items.length - 1; i >= 0; i--) {
    const f = items[i];
    const life =
      f.kind === "meteor" ? 900 :
      f.kind === "bolt" ? 550 :
      f.kind === "warp" ? 700 :
      f.kind === "gold" ? 3500 :
      f.kind === "critText" ? 700 :
      f.kind === "combo" ? 900 :
      f.kind === "flare" ? 500 : 0;
    if (life > 0 && f.born !== undefined && now - f.born > life) items.splice(i, 1);
    else if (f.until !== undefined && now > f.until) items.splice(i, 1);
  }
  const shake = items.find((f) => f.kind === "shake");
  const shakeStyle: React.CSSProperties = shake
    ? { transform: `translate(${(Math.random() - 0.5) * (shake.strength || 6)}px, ${(Math.random() - 0.5) * (shake.strength || 6)}px)` }
    : {};
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" style={shakeStyle}>
      {items.map((f) => {
        if (f.kind === "meteor" && f.x !== undefined && f.born !== undefined) {
          const dt = Math.max(0, now - f.born);
          if (dt < 0) return null;
          const t = Math.min(1, dt / 700);
          return (
            <div key={f.id} className="absolute" style={{
              left: `${(f.x / ARENA_W) * 100}%`, top: `${t * 100}%`,
              width: 20, height: 20, transform: "translate(-50%,-50%)",
              background: "radial-gradient(circle,#fff 0%,#ffaa2a 40%,#ff3a1a 100%)",
              borderRadius: "50%",
              boxShadow: "0 0 20px #ff6a2a, 0 -30px 40px 5px rgba(255,120,40,0.5)",
              filter: `blur(${(1 - t) * 1}px)`,
              opacity: t > 0.95 ? 0 : 1,
            }} />
          );
        }
        if (f.kind === "bolt" && f.x !== undefined && f.born !== undefined) {
          const dt = now - f.born;
          const opacity = dt < 100 ? dt / 100 : dt < 400 ? 1 : Math.max(0, 1 - (dt - 400) / 150);
          return (
            <div key={f.id} className="absolute top-0" style={{
              left: `${(f.x / ARENA_W) * 100}%`, transform: "translateX(-50%)",
              width: 6, height: "100%",
              background: "linear-gradient(180deg,#fff 0%,#ffd83a 60%,transparent 100%)",
              boxShadow: "0 0 24px #fff, 0 0 60px #ffd83a", opacity,
            }} />
          );
        }
        if (f.kind === "rain") {
          return <div key={f.id} className="absolute inset-0"
            style={{ backgroundImage: "repeating-linear-gradient(100deg, rgba(160,220,255,0.35) 0 2px, transparent 2px 8px)", animation: "rain-fall 0.4s linear infinite" }} />;
        }
        if (f.kind === "snow") {
          return <div key={f.id} className="absolute inset-0"
            style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #fff 0 2px, transparent 3px), radial-gradient(circle at 60% 70%, #fff 0 2px, transparent 3px), radial-gradient(circle at 80% 20%, #fff 0 2px, transparent 3px)", animation: "snow-fall 1.2s linear infinite" }} />;
        }
        if (f.kind === "sand") {
          return <div key={f.id} className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(220,170,80,0.25), rgba(220,170,80,0.4))", mixBlendMode: "multiply" }} />;
        }
        if (f.kind === "flare") {
          return <div key={f.id} className="absolute inset-0" style={{ background: "rgba(255,255,255,0.75)", animation: "fx-flare 0.5s ease-out forwards" }} />;
        }
        if (f.kind === "aura" && f.color) {
          return <div key={f.id} className="absolute inset-0" style={{ boxShadow: `inset 0 0 60px 20px ${f.color}`, opacity: 0.6 }} />;
        }
        if (f.kind === "warp") {
          return <div key={f.id} className="absolute inset-0" style={{ background: "radial-gradient(circle,#a17af0 0%,transparent 70%)", animation: "fx-warp 0.7s ease-out forwards" }} />;
        }
        if (f.kind === "gold") {
          return (
            <div key={f.id} className="absolute inset-0">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="absolute" style={{
                  left: `${(i * 37) % 100}%`, top: "-10%",
                  width: 8, height: 12, background: "#ffd83a",
                  boxShadow: "0 0 6px #ffd83a",
                  animation: `winfx-fall ${1.5 + (i % 5) * 0.3}s linear ${i * 0.05}s forwards`,
                }} />
              ))}
            </div>
          );
        }
        if (f.kind === "critText" && f.x !== undefined && f.y !== undefined) {
          return (
            <div key={f.id} className="absolute font-bold" style={{
              left: `${(f.x / ARENA_W) * 100}%`, top: `${(f.y / ARENA_H) * 100}%`,
              transform: "translate(-50%,-50%)", fontSize: 24,
              color: "#ffd83a", textShadow: "0 0 8px #000, 0 0 12px #ffd83a",
              animation: "fx-crit 0.7s ease-out forwards",
            }}>CRIT!</div>
          );
        }
        if (f.kind === "combo" && f.n !== undefined) {
          return (
            <div key={f.id} className="absolute left-1/2 top-16" style={{
              transform: "translateX(-50%)", fontSize: 28, fontWeight: 900,
              color: "#ffd83a", textShadow: "0 0 10px #000, 0 0 20px #ffd83a",
              animation: "fx-combo 0.9s ease-out forwards",
            }}>×{f.n} COMBO!</div>
          );
        }
        return null;
      })}
    </div>
  );
}

function IntroCountdown({ startedAt }: { startedAt: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);
  const elapsed = performance.now() - startedAt;
  const step = elapsed < 900 ? "3" : elapsed < 1800 ? "2" : elapsed < 2700 ? "1" : "FIGHT!";
  const color = step === "FIGHT!" ? "#ffd83a" : "#fff";
  void tick;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div className="anim-evolve rounded-full px-8 py-6 text-4xl sm:text-6xl"
        style={{ color, textShadow: "0 0 20px rgba(0,0,0,0.9), 0 0 40px currentColor" }}>
        {step}
      </div>
    </div>
  );
}
function MvpPanel({ statsRef }: { statsRef: React.MutableRefObject<Record<string, { dmg: number; kos: number; name: string; color: string; sprite: string }>> }) {
  const entries = Object.values(statsRef.current).sort((a, b) => b.dmg - a.dmg).slice(0, 5);
  if (entries.length === 0) return null;
  const mvp = entries[0];
  return (
    <div className="mt-2 rounded border border-border bg-background/60 p-2 text-left">
      <p className="mb-1 text-center text-[8px] text-primary sm:text-[10px]">🏆 MVP: {mvp.name} — {mvp.dmg} dmg · {mvp.kos} KO</p>
      <ul className="space-y-0.5 text-[7px] leading-tight sm:text-[8px]">
        {entries.map((e, i) => (
          <li key={i} className="flex items-center gap-1" style={{ color: e.color }}>
            <img src={e.sprite} alt="" className="h-4 w-4" style={{ imageRendering: "pixelated" }} />
            <span>#{i + 1} {e.name} — {e.dmg} dmg · {e.kos} KO</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
function copyMatchSummary(
  hud: BattleHud,
  mons: MonState[],
  winnerIdx: number | null,
  winnerTeam: number | null,
  mode: Mode,
) {
  const entries = Object.values(hud.statsRef.current).sort((a, b) => b.dmg - a.dmg);
  const winner = winnerTeam !== null ? TEAM_NAMES[winnerTeam] : (winnerIdx !== null ? mons[winnerIdx].data.name : "DRAW");
  const dur = formatMs(performance.now() - hud.startTimeRef.current);
  const chapters = hud.koLogRef.current.map((k) => `${formatMs(k.t)} — ${k.name} KO'd`).join("\n");
  const leaderboard = entries.slice(0, 5).map((e, i) => `${i + 1}. ${e.name} — ${e.dmg} dmg · ${e.kos} KO`).join("\n");
  const text = [
    `🔥 ${matchTitle(mons, mode)}`,
    `🏆 Winner: ${winner}   ⏱ ${dur}   🎲 Battle #${hud.matchSeed.toString().padStart(6, "0")}`,
    "",
    "📺 Chapters:",
    chapters || "0:00 — Start",
    "",
    "🏅 MVP leaderboard:",
    leaderboard,
    "",
    hud.watermark ? `👉 ${hud.watermark}` : "",
    "#Pokemon #AutoBattler #PixelPocketBrawl",
  ].filter(Boolean).join("\n");
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  alert("YouTube summary copied to clipboard!\n\n" + text);
}

// ============================================================
// Projectile FX

// ============================================================
function ProjectileFx({ p, now }: { p: Projectile; now: number }) {
  const deg = (p.angle * 180) / Math.PI;
  const x = p.pos.x, y = p.pos.y;
  const t = (now - p.bornAt) / p.duration;
  switch (p.kind) {
    case "fireball": {
      const r = 8 + Math.sin(now / 60) * 2;
      return (<g transform={`translate(${x} ${y})`}>
        <circle r={r + 6} fill="#ffae3a" opacity={0.35} /><circle r={r} fill="#ff5a1a" /><circle r={r * 0.5} fill="#fff2a8" />
      </g>);
    }
    case "waterjet": return (<g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <ellipse rx={18} ry={5} fill="#4ea8ff" opacity={0.5} /><ellipse rx={10} ry={3} fill="#bfe6ff" />
    </g>);
    case "leaf": return (<g transform={`translate(${x} ${y}) rotate(${(now / 4) % 360})`}>
      <path d="M -10 0 Q 0 -10 10 0 Q 0 10 -10 0 Z" fill="#6bd36b" stroke="#2c6b2c" strokeWidth={1.2} />
    </g>);
    case "lightning": {
      const dx = p.pos.x - p.from.x, dy = p.pos.y - p.from.y;
      const segments = 6; let d = `M ${p.from.x} ${p.from.y}`;
      for (let i = 1; i <= segments; i++) d += ` L ${p.from.x + (dx * i) / segments + rand(-6, 6)} ${p.from.y + (dy * i) / segments + rand(-6, 6)}`;
      return (<g opacity={1 - t * 0.4}>
        <path d={d} stroke="#fff7a0" strokeWidth={5} fill="none" opacity={0.5} />
        <path d={d} stroke="#ffd83a" strokeWidth={2.2} fill="none" />
      </g>);
    }
    case "psybeam": return (<g transform={`translate(${x} ${y})`}>
      <circle r={12} fill="#d976ff" opacity={0.35} /><circle r={7} fill="#ff8de0" /><circle r={3} fill="#fff" />
    </g>);
    case "rock": return (<g transform={`translate(${x} ${y}) rotate(${(now / 3) % 360})`}>
      <polygon points="-9,-5 -3,-9 7,-6 9,2 4,9 -6,7 -10,1" fill="#8a7a55" stroke="#3d3520" strokeWidth={1.2} />
    </g>);
    case "iceshard": return (<g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <polygon points="-12,-3 8,0 -12,3" fill="#bfe9ff" stroke="#4ea8ff" strokeWidth={1.2} />
    </g>);
    case "shadowball": return (<g transform={`translate(${x} ${y})`}>
      <circle r={11} fill="#5a2d8a" opacity={0.5} /><circle r={8} fill="#9d6bff" /><circle r={4} fill="#2a1043" />
    </g>);
    case "dragonpulse": return (<g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <ellipse rx={14} ry={6} fill="#a366ff" opacity={0.5} /><ellipse rx={9} ry={4} fill="#f0b84a" />
    </g>);
    case "punch": return (<g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <circle r={9} fill="#ffd9b0" stroke="#6b3a18" strokeWidth={1.5} />
      <line x1={-15} y1={0} x2={-8} y2={0} stroke="#fff" strokeWidth={2} />
    </g>);
    case "bugbuzz": return (<g transform={`translate(${x} ${y})`}>
      <circle r={4} fill="#5a8a20" />
      {[0, 120, 240].map((a) => { const rad = (a * Math.PI) / 180 + now / 80; return <ellipse key={a} cx={Math.cos(rad) * 6} cy={Math.sin(rad) * 6} rx={5} ry={2} fill="#a4d850" opacity={0.7} />; })}
    </g>);
    case "fairywind": return (<g transform={`translate(${x} ${y})`}>
      <circle r={10} fill="#ffb6e0" opacity={0.4} />
      <circle r={3} fill="#fff" />
    </g>);
  }
}

// ============================================================
// Win FX overlay (actually animates now)
// ============================================================
function WinFx({ kind, color }: { kind: string; color: string }) {
  if (kind === "confetti") {
    const pieces = Array.from({ length: 36 }, (_, i) => i);
    const colors = ["#ffd83a", "#ff5566", "#4ea8ff", "#62e07a", "#d976ff", "#ffffff"];
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((i) => (
          <span key={i} className="absolute block"
            style={{
              left: `${(i * 97) % 100}%`,
              top: "-10%",
              width: 8, height: 14,
              background: colors[i % colors.length],
              animation: `winfx-fall ${1.6 + (i % 7) * 0.2}s ${(i % 11) * 0.07}s linear infinite`,
              transform: `rotate(${(i * 47) % 360}deg)`,
            }} />
        ))}
      </div>
    );
  }
  if (kind === "fireworks") {
    const bursts = [0, 1, 2, 3, 4];
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {bursts.map((b) => (
          <div key={b} className="absolute"
            style={{
              left: `${15 + b * 18}%`,
              top: `${20 + (b % 3) * 18}%`,
              animation: `winfx-burst 1.4s ${b * 0.25}s ease-out infinite`,
            }}>
            {Array.from({ length: 12 }, (_, i) => i).map((i) => (
              <span key={i} className="absolute block h-1.5 w-1.5 rounded-full"
                style={{
                  background: color,
                  transform: `rotate(${(i * 30)}deg) translateX(0)`,
                  animation: `winfx-spark 1.4s ${b * 0.25}s ease-out infinite`,
                  ["--ang" as never]: `${i * 30}deg`,
                }} />
            ))}
          </div>
        ))}
      </div>
    );
  }
  // pixelrain
  const drops = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {drops.map((i) => (
        <span key={i} className="absolute block"
          style={{
            left: `${(i * 53) % 100}%`,
            top: "-5%",
            width: 4, height: 4,
            background: color,
            animation: `winfx-fall ${0.9 + (i % 5) * 0.15}s ${(i % 13) * 0.06}s linear infinite`,
          }} />
      ))}
    </div>
  );
}

// ============================================================
// Catch & Gym mode (lite)
// ============================================================
const STARTER_OPTIONS: { id: number; name: string; type: string }[] = [
  { id: 1, name: "Bulbasaur", type: "grass" },
  { id: 4, name: "Charmander", type: "fire" },
  { id: 7, name: "Squirtle", type: "water" },
  { id: 25, name: "Pikachu", type: "electric" },
  { id: 133, name: "Eevee", type: "normal" },
];
const GYM_LEADERS: { id: string; name: string; type: string; team: number[]; reward: number; perk: string; quiz: { q: string; a: string; choices: string[] } }[] = [
  { id: "brock", name: "Brock — Rock", type: "rock", team: [74, 95, 76], reward: 60, perk: "Cut (chop 🌲 trees)", quiz: { q: "Rock beats which type?", a: "flying", choices: ["water","flying","grass"] } },
  { id: "misty", name: "Misty — Water", type: "water", team: [120, 121, 131], reward: 80, perk: "Surf (walk on 🌊 water)", quiz: { q: "Water is weak to?", a: "electric", choices: ["fire","electric","normal"] } },
  { id: "surge", name: "Lt. Surge — Electric", type: "electric", team: [100, 25, 26], reward: 100, perk: "Repel free once/day", quiz: { q: "Electric can't hit?", a: "ground", choices: ["ground","flying","fire"] } },
  { id: "erika", name: "Erika — Grass", type: "grass", team: [71, 114, 45], reward: 120, perk: "Strength (push 🪨 boulders)", quiz: { q: "Grass resists?", a: "water", choices: ["fire","water","bug"] } },
  { id: "koga", name: "Koga — Poison", type: "poison", team: [49, 89, 169], reward: 140, perk: "+10% catch rate", quiz: { q: "Poison beats?", a: "grass", choices: ["grass","rock","steel"] } },
  { id: "sabrina", name: "Sabrina — Psychic", type: "psychic", team: [64, 122, 65], reward: 160, perk: "See hidden items ✨", quiz: { q: "Psychic fears?", a: "dark", choices: ["dark","fire","water"] } },
  { id: "blaine", name: "Blaine — Fire", type: "fire", team: [59, 78, 146], reward: 190, perk: "Fly (fast travel to 🏥)", quiz: { q: "Fire beats?", a: "grass", choices: ["water","grass","rock"] } },
  { id: "giovanni", name: "Giovanni — Ground", type: "ground", team: [51, 31, 34], reward: 220, perk: "Unlocks Elite Four", quiz: { q: "Ground is weak to?", a: "water", choices: ["water","fire","normal"] } },
];
const ELITE_FOUR: { id: string; name: string; type: string; team: number[] }[] = [
  { id: "lorelei", name: "Lorelei — Ice", type: "ice", team: [87, 91, 124] },
  { id: "bruno", name: "Bruno — Fighting", type: "fighting", team: [95, 107, 68] },
  { id: "agatha", name: "Agatha — Ghost", type: "ghost", team: [94, 42, 24] },
  { id: "lance", name: "Lance — Dragon", type: "dragon", team: [130, 149, 142] },
];
// Water-type pool for fishing, bug/flying for headbutt, cave pool for cave zone
const WATER_POOL = [7, 54, 60, 72, 79, 86, 90, 98, 116, 118, 120, 129, 131, 138, 147];
const BUG_FLY_POOL = [10, 13, 16, 21, 41, 46, 48, 123, 165, 167, 187, 191];
const CAVE_POOL = [41, 74, 92, 95, 104, 66, 27, 111, 138, 140, 246];
const LEGENDARY_POOL = [144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 384, 483, 484, 487];
const CAVE_MAP: string[] = [
  "TTTTTTTTTTTTTTT",
  "TPPPPPPPPPPPPPT",
  "TPTTPTTPTPTTPPT",
  "TPTCPTTPTPTCPPT",
  "TPTTPPPPPPTTPPT",
  "TPPPPTTTPPPPPPT",
  "TPTPPTLTPTTTPPT",
  "TPTPPTTTPTCTPPT",
  "TPTPPPPPPPTTPPT",
  "TPPPPTTPPPPPPPT",
  "TPTPPTCPTPTTPPT",
  "TPTPPTTPTPTPPPT",
  "TPPPPPPPPPPPPPT",
  "TXPPPPPPPPPPPPT",
  "TTTTTTTTTTTTTTT",
]; // X = exit back to overworld, L = legendary sighting


// Overworld tiles: G grass, P path, T tree, C cell, W water (fish), H heal,
// N trainer, $ shop, B berry tree, K boulder (needs Strength), X cave entrance,
// D dojo (EV), M move tutor, R nurse revive quest, U wonder trade, F pc box
const CG_MAP: string[] = [
  "TTTTTTTTTTTTTTT",
  "TPPPPGGGGGGGGGT",
  "TPTPPGGGCGGGNGT",
  "TPTTPGGGGBGGGGT",
  "TPPPPPPPPPPGGGT",
  "THPPGGGCGPPWWWT",
  "TFPPGGGGGPPWCWT",
  "TDPPGGGGGPPWWWT",
  "TMPPGGCGGPKPPPT",
  "TPPPGGGGGPPTNPT",
  "TGGGGGRGGGGTTPT",
  "TGGCGGGGNGGPPPT",
  "TGGGGGGGGGGPP$T",
  "TGGUGGGBGGGGGXT",
  "TTTTTTTTTTTTTTT",
];
const CG_SIZE = 15;

type Encounter = {
  id: number;
  mon: MonData;
  hp: number;
  maxHp: number;
  message: string;
  kind: "wild" | "trainer" | "legendary" | "champion";
  trainerKey?: string;
  playerHp?: number;
  playerMaxHp?: number;
  playerStatus?: "burn" | "poison" | "paralyze" | "freeze" | null;
  wildStatus?: "burn" | "poison" | "paralyze" | "freeze" | null;
};
type Inventory = {
  bike: boolean;
  repel: number; // steps left
  berries: number;
  potions: number;
  cutBadge: boolean;
  surfBadge: boolean;
  strengthBadge: boolean;
  flyBadge: boolean;
  seeBadge: boolean;
  catchBadge: boolean;
  repelBadge: boolean;
  eliteUnlocked: boolean;
};

const DEFAULT_INV: Inventory = {
  bike: false, repel: 0, berries: 0, potions: 0,
  cutBadge: false, surfBadge: false, strengthBadge: false, flyBadge: false,
  seeBadge: false, catchBadge: false, repelBadge: false, eliteUnlocked: false,
};

function CatchGym({ onClose, onChallengeGym }: {
  onClose: () => void;
  onChallengeGym: (yourTeam: number[], gymTeam: number[]) => Promise<void>;
}) {
  const [starter, setStarter] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem("ppb-starter");
    return v ? Number(v) : null;
  });
  const [caught, setCaught] = useState<number[]>(() => lsGet<number[]>("ppb-team", []));
  const [pcBox, setPcBox] = useState<number[]>(() => lsGet<number[]>("ppb-pc", []));
  const [beaten, setBeaten] = useState<string[]>(() => lsGet<string[]>("ppb-beaten", []));
  const [e4Beaten, setE4Beaten] = useState<string[]>(() => lsGet<string[]>("ppb-e4", []));
  const [defenses, setDefenses] = useState<number>(() => lsGet<number>("ppb-defenses", 0));
  const [rematchLevel, setRematchLevel] = useState<number>(() => lsGet<number>("ppb-rematch", 0));
  const [cells, setCells] = useState<number>(() => lsGet<number>("ppb-cells", 0));
  const [pickedCells, setPickedCells] = useState<Set<string>>(() => new Set(lsGet<string[]>("ppb-cells-picked", [])));
  const [trainersDone, setTrainersDone] = useState<Set<string>>(() => new Set(lsGet<string[]>("ppb-trainers", [])));
  const [inv, setInv] = useState<Inventory>(() => ({ ...DEFAULT_INV, ...lsGet<Partial<Inventory>>("ppb-inv", {}) }));
  const [nuzlocke, setNuzlocke] = useState<boolean>(() => lsGet<boolean>("ppb-nuz", false));
  const [routeCaught, setRouteCaught] = useState<Set<number>>(() => new Set(lsGet<number[]>("ppb-nuz-routes", [])));
  const [reviveDone, setReviveDone] = useState<boolean>(() => lsGet<boolean>("ppb-revive", false));
  const [coinsView, setCoinsView] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("ppb-coins") ?? "0");
  });
  const bumpCoins = (delta: number) => {
    try {
      const cur = Number(localStorage.getItem("ppb-coins") ?? "0");
      const next = Math.max(0, cur + delta);
      localStorage.setItem("ppb-coins", String(next));
      setCoinsView(next);
    } catch {}
  };

  const [zone, setZone] = useState<"over" | "cave">("over");
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 4, y: 4 });
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("Walk with arrows / D-pad. Find 🏥 heal · 👤 trainer · 🛒 shop · 🍒 berries · 🎣 water · 🪨 boulder · 🕳 cave · 🎁 wonder · 💊 revive quest · 🥋 dojo · ✏ move tutor · 📦 PC box.");
  const [tab, setTab] = useState<"map" | "team" | "gyms" | "shop" | "card" | "photo">("map");

  // Hidden items — random tiles refresh each session
  const hiddenItems = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const x = 1 + Math.floor(Math.random() * (CG_SIZE - 2));
      const y = 1 + Math.floor(Math.random() * (CG_SIZE - 2));
      s.add(`${x},${y}`);
    }
    return s;
  }, []);
  const [foundHidden, setFoundHidden] = useState<Set<string>>(() => new Set());

  // Day/night — real clock
  const [isNight, setIsNight] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const h = new Date().getHours();
    return h < 6 || h >= 19;
  });
  useEffect(() => {
    const t = setInterval(() => {
      const h = new Date().getHours();
      setIsNight(h < 6 || h >= 19);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  // Swarm event — every ~3 min a random species surges for 90s
  const [swarm, setSwarm] = useState<{ id: number; name: string; ends: number } | null>(null);
  useEffect(() => {
    const t = setInterval(async () => {
      if (swarm && Date.now() > swarm.ends) setSwarm(null);
      if (!swarm && Math.random() < 0.35) {
        const id = 1 + Math.floor(Math.random() * 251);
        const m = await fetchMon(id, `sw-${id}`);
        if (m) setSwarm({ id, name: m.name, ends: Date.now() + 90_000 });
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [swarm]);

  // Roaming legendary — random moving red dot
  const [roamer, setRoamer] = useState<{ x: number; y: number; id: number } | null>(null);
  useEffect(() => {
    if (zone !== "over") return;
    if (!roamer && Math.random() < 0.5) {
      setRoamer({
        x: 1 + Math.floor(Math.random() * (CG_SIZE - 2)),
        y: 1 + Math.floor(Math.random() * (CG_SIZE - 2)),
        id: LEGENDARY_POOL[Math.floor(Math.random() * LEGENDARY_POOL.length)],
      });
    }
    const t = setInterval(() => {
      setRoamer((r) => {
        if (!r) return r;
        const nx = Math.max(1, Math.min(CG_SIZE - 2, r.x + (Math.floor(Math.random() * 3) - 1)));
        const ny = Math.max(1, Math.min(CG_SIZE - 2, r.y + (Math.floor(Math.random() * 3) - 1)));
        return { ...r, x: nx, y: ny };
      });
    }, 2500);
    return () => clearInterval(t);
  }, [zone, roamer]);

  // Trophies (legendaries caught roaming)
  const [trophies, setTrophies] = useState<number[]>(() => lsGet<number[]>("ppb-trophies", []));

  // Persist everything
  useEffect(() => { if (starter !== null) localStorage.setItem("ppb-starter", String(starter)); }, [starter]);
  useEffect(() => { lsSet("ppb-team", caught); }, [caught]);
  useEffect(() => { lsSet("ppb-pc", pcBox); }, [pcBox]);
  useEffect(() => { lsSet("ppb-beaten", beaten); }, [beaten]);
  useEffect(() => { lsSet("ppb-e4", e4Beaten); }, [e4Beaten]);
  useEffect(() => { lsSet("ppb-defenses", defenses); }, [defenses]);
  useEffect(() => { lsSet("ppb-rematch", rematchLevel); }, [rematchLevel]);
  useEffect(() => { lsSet("ppb-cells", cells); }, [cells]);
  useEffect(() => { lsSet("ppb-cells-picked", Array.from(pickedCells)); }, [pickedCells]);
  useEffect(() => { lsSet("ppb-trainers", Array.from(trainersDone)); }, [trainersDone]);
  useEffect(() => { lsSet("ppb-inv", inv); }, [inv]);
  useEffect(() => { lsSet("ppb-nuz", nuzlocke); }, [nuzlocke]);
  useEffect(() => { lsSet("ppb-nuz-routes", Array.from(routeCaught)); }, [routeCaught]);
  useEffect(() => { lsSet("ppb-revive", reviveDone); }, [reviveDone]);
  useEffect(() => { lsSet("ppb-trophies", trophies); }, [trophies]);

  const [playerMon, setPlayerMon] = useState<MonData | null>(null);
  useEffect(() => {
    if (starter === null) { setPlayerMon(null); return; }
    void fetchMon(starter, `pl-${starter}`).then(setPlayerMon);
  }, [starter]);

  const team = useMemo(() => {
    const t: number[] = [];
    if (starter !== null) t.push(starter);
    caught.forEach((c) => { if (!t.includes(c) && t.length < 6) t.push(c); });
    return t;
  }, [starter, caught]);

  const dexPct = Math.min(100, Math.round((new Set([...caught, ...pcBox, ...(starter !== null ? [starter] : [])]).size / 151) * 100));

  const currentMap = zone === "cave" ? CAVE_MAP : CG_MAP;
  const tileAt = (x: number, y: number) => currentMap[y]?.[x] ?? "T";

  const pickStarter = (id: number) => {
    setStarter(id); setCaught([]); setPcBox([]); setBeaten([]); setE4Beaten([]);
    setDefenses(0); setRematchLevel(0); setCells(0); setPickedCells(new Set());
    setTrainersDone(new Set()); setInv(DEFAULT_INV); setRouteCaught(new Set());
    setReviveDone(false); setTrophies([]);
  };

  const encounterSkipped = () => {
    if (inv.repel > 0) {
      setInv((i) => ({ ...i, repel: i.repel - 1 }));
      setMessage(`💨 Repel active (${inv.repel - 1} steps left) — wild Pokémon avoided you.`);
      return true;
    }
    return false;
  };

  const triggerEncounter = useCallback(async (pool?: number[]) => {
    if (encounterSkipped()) return;
    setBusy(true);
    try {
      const swarmActive = swarm && Math.random() < 0.5;
      let id: number;
      if (swarmActive && swarm) id = swarm.id;
      else if (pool) id = pool[Math.floor(Math.random() * pool.length)];
      else {
        const rare = Math.random() < 0.1;
        id = rare ? 1 + Math.floor(Math.random() * 649) : 1 + Math.floor(Math.random() * 251);
      }
      const mon = await fetchMon(id, `wild-${id}-${Date.now()}`);
      if (!mon) return;
      const maxHp = Math.round(60 + mon.baseHp * (isNight ? 1.15 : 1));
      const shiny = Math.random() < (1/512);
      const pMax = playerMon ? Math.round(80 + playerMon.baseHp * 1.2) : 100;
      setEncounter({ id, mon, hp: maxHp, maxHp, message: `A wild ${shiny ? "✨SHINY " : ""}${swarmActive ? "🌊 SWARM " : ""}${isNight ? "🌙 " : ""}${mon.name} appeared!`, kind: "wild", playerHp: pMax, playerMaxHp: pMax, playerStatus: null, wildStatus: null });
    } finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swarm, isNight, inv.repel]);

  const triggerTrainer = useCallback(async (nkey: string) => {
    if (trainersDone.has(nkey)) { setMessage("This trainer already fought you. They give a friendly wave."); return; }
    setBusy(true);
    try {
      const id = 1 + Math.floor(Math.random() * 151);
      const mon = await fetchMon(id, `npc-${id}-${Date.now()}`);
      if (!mon) return;
      const maxHp = Math.round(70 + mon.baseHp * 1.2);
      const pMax = playerMon ? Math.round(80 + playerMon.baseHp * 1.2) : 100;
      setEncounter({ id, mon, hp: maxHp, maxHp, message: `👤 Trainer sends out ${mon.name}! Beat it for coins.`, kind: "trainer", trainerKey: nkey, playerHp: pMax, playerMaxHp: pMax });
    } finally { setBusy(false); }
  }, [trainersDone]);

  const triggerLegendary = useCallback(async () => {
    if (!roamer) return;
    setBusy(true);
    try {
      const mon = await fetchMon(roamer.id, `leg-${roamer.id}-${Date.now()}`);
      if (!mon) return;
      const maxHp = Math.round(180 + mon.baseHp * 1.8);
      setEncounter({ id: roamer.id, mon, hp: maxHp, maxHp, message: `❗ A ROAMING ${mon.name.toUpperCase()} appeared! Weaken it fast!`, kind: "legendary" });
    } finally { setBusy(false); }
  }, [roamer]);

  const move = useCallback((dx: number, dy: number) => {
    if (encounter || busy) return;
    const step = inv.bike ? 2 : 1;
    setPos((p) => {
      const nx = Math.max(0, Math.min(CG_SIZE - 1, p.x + dx * step));
      const ny = Math.max(0, Math.min(CG_SIZE - 1, p.y + dy * step));
      const t = tileAt(nx, ny);

      // Roamer collision
      if (roamer && roamer.x === nx && roamer.y === ny) {
        void triggerLegendary();
        return { x: nx, y: ny };
      }

      // Blocked tiles + HM checks
      if (t === "T" && !inv.cutBadge) return p;
      if (t === "T" && inv.cutBadge) { setMessage("You slashed through a small tree!"); }
      if (t === "W" && !inv.surfBadge) { setMessage("The water is deep. You need Surf (Misty's badge)."); return p; }
      if (t === "K" && !inv.strengthBadge) { setMessage("A boulder blocks the way. You need Strength (Erika's badge)."); return p; }

      const nkey = `${nx},${ny}`;

      if (t === "C" && !pickedCells.has(nkey)) {
        setCells((c) => c + 1);
        setPickedCells((s) => { const n = new Set(s); n.add(nkey); return n; });
        setMessage("You picked up a Zygarde Cell! Collect 10 for a bonus.");
      }
      if (hiddenItems.has(nkey) && !foundHidden.has(nkey)) {
        setFoundHidden((s) => { const n = new Set(s); n.add(nkey); return n; });
        const roll = Math.random();
        if (roll < 0.4) { bumpCoins(30); setMessage("✨ Hidden item: 30 coins!"); }
        else if (roll < 0.7) { setInv((i) => ({ ...i, potions: i.potions + 1 })); setMessage("✨ Hidden item: 1 Potion!"); }
        else if (roll < 0.9) { setInv((i) => ({ ...i, berries: i.berries + 1 })); setMessage("✨ Hidden item: 1 Berry!"); }
        else { setInv((i) => ({ ...i, repel: i.repel + 25 })); setMessage("✨ Hidden item: Repel (+25 steps)!"); }
      }

      if (t === "H") { setMessage("🏥 Heal Center: your team is fully healed!"); }
      else if (t === "$") { setTab("shop"); setMessage("🛒 Shop stocked — open tab below."); }
      else if (t === "B") { setInv((i) => ({ ...i, berries: i.berries + 1 })); setMessage("🍒 You picked a berry! (Use in battle to heal.)"); }
      else if (t === "F") { setTab("team"); setMessage("📦 PC Box opened."); }
      else if (t === "D") {
        if (playerMon) { setMessage(`🥋 EV Dojo: ${playerMon.name} feels stronger. (+2 permanent Atk in next battles.)`); setInv((i) => ({ ...i, potions: i.potions + 1 })); }
        else setMessage("🥋 EV Dojo: pick a starter first.");
      }
      else if (t === "M") { setMessage("✏ Move Tutor: your starter learned a new signature move! (cosmetic)"); }
      else if (t === "R" && !reviveDone) {
        setReviveDone(true); bumpCoins(75); setInv((i) => ({ ...i, potions: i.potions + 3 }));
        setMessage("💊 Nurse quest complete! +75 coins, +3 potions.");
      }
      else if (t === "U") {
        // Wonder trade: swap first caught for a random surprise
        setCaught((c) => {
          if (c.length === 0) return c;
          const surprise = 1 + Math.floor(Math.random() * 493);
          const n = [...c]; n[0] = surprise;
          setMessage(`🎁 Wonder Trade! You received #${surprise}.`);
          return n;
        });
      }
      else if (t === "X") { setZone("cave"); setMessage("🕳 You entered the cave!"); return { x: 1, y: 1 }; }
      else if (t === "L") { void triggerLegendary(); }
      else if (t === "N") { void triggerTrainer(nkey); }
      else if (t === "G" && Math.random() < (isNight ? 0.34 : 0.28)) {
        setMessage("The grass rustled…"); void triggerEncounter();
      } else if (t === "G") { setMessage("You stroll through the grass…"); }
      else if (t === "P") { setMessage(""); }

      // Decrement repel on any successful step
      if (inv.repel > 0) setInv((i) => ({ ...i, repel: Math.max(0, i.repel - 1) }));

      return { x: nx, y: ny };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter, busy, pickedCells, foundHidden, triggerEncounter, triggerTrainer, triggerLegendary, roamer, inv, hiddenItems, isNight, reviveDone, playerMon, zone]);

  // Fishing (F) and Headbutt (J) — actions that target the tile you're facing
  const fish = () => {
    // Look for adjacent water
    const near = [[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dy]) => tileAt(pos.x+dx, pos.y+dy) === "W");
    if (!near) { setMessage("🎣 No water nearby to fish."); return; }
    setMessage("🎣 Cast the line…"); void triggerEncounter(WATER_POOL);
  };
  const headbutt = () => {
    const near = [[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dy]) => tileAt(pos.x+dx, pos.y+dy) === "T");
    if (!near) { setMessage("🌲 No tree nearby to headbutt."); return; }
    setMessage("🌲 You headbutt the tree!"); void triggerEncounter(BUG_FLY_POOL);
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") { e.preventDefault(); move(0, -1); }
      else if (e.key === "ArrowDown" || e.key === "s") { e.preventDefault(); move(0, 1); }
      else if (e.key === "ArrowLeft" || e.key === "a") { e.preventDefault(); move(-1, 0); }
      else if (e.key === "ArrowRight" || e.key === "d") { e.preventDefault(); move(1, 0); }
      else if (e.key === "f") { fish(); }
      else if (e.key === "j") { headbutt(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move]);

  // Available player moves with type + optional status effect
  const PLAYER_MOVES = [
    { name: "Tackle", type: null as string | null, power: 1.0, status: null as null | "burn" | "poison" | "paralyze" | "freeze", statusChance: 0 },
    { name: "Flame Strike", type: "fire", power: 1.15, status: "burn" as const, statusChance: 0.3 },
    { name: "Aqua Pulse", type: "water", power: 1.1, status: null, statusChance: 0 },
    { name: "Thunder Jolt", type: "electric", power: 1.15, status: "paralyze" as const, statusChance: 0.35 },
    { name: "Ice Fang", type: "ice", power: 1.1, status: "freeze" as const, statusChance: 0.25 },
    { name: "Toxic Sting", type: "poison", power: 0.95, status: "poison" as const, statusChance: 0.5 },
  ] as const;
  const attackWildMove = (moveIdx: number) => {
    if (!encounter || !playerMon) return;
    const move = PLAYER_MOVES[moveIdx];
    // Player statuses can lock the attack
    let msg = "";
    if (encounter.playerStatus === "freeze" && Math.random() < 0.4) {
      msg = `❄ ${playerMon.name} is frozen and can't move!`;
      setEncounter({ ...encounter, message: msg });
      wildRetaliate(encounter);
      return;
    }
    if (encounter.playerStatus === "paralyze" && Math.random() < 0.25) {
      msg = `⚡ ${playerMon.name} is paralyzed! Attack failed.`;
      setEncounter({ ...encounter, message: msg });
      wildRetaliate(encounter);
      return;
    }
    const moveType = (move.type ?? playerMon.type) as ElementType;
    const eff = typeMult(moveType, encounter.mon.type);
    const dojoBonus = 1 + (Math.min(6, inv.potions) * 0.02);
    const crit = Math.random() < 0.15;
    const stab = moveType === playerMon.type ? 1.2 : 1;
    const base = 15 + Math.floor(Math.random() * 20) + Math.round(playerMon.baseAtk * 0.08);
    const dmg = Math.max(4, Math.round(base * move.power * eff * dojoBonus * stab * (crit ? 1.7 : 1)));
    const hp = Math.max(0, encounter.hp - dmg);
    const label = `${crit ? " CRIT!" : ""}${eff >= 2 ? " (super effective!)" : eff <= 0.5 ? " (not very effective)" : ""}`;
    // Try to apply status
    let newWildStatus = encounter.wildStatus ?? null;
    if (move.status && !newWildStatus && Math.random() < move.statusChance) {
      newWildStatus = move.status;
      msg = `${playerMon.name} used ${move.name}! ${dmg} dmg${label} · ${encounter.mon.name} is ${move.status}ed!`;
    } else {
      msg = `${playerMon.name} used ${move.name}! ${dmg} dmg${label}`;
    }
    if (hp === 0) {
      if (encounter.kind === "trainer" && encounter.trainerKey) {
        setTrainersDone((s) => { const n = new Set(s); n.add(encounter.trainerKey!); return n; });
        setEncounter({ ...encounter, hp, wildStatus: newWildStatus, message: `You beat the trainer! ${dmg} dmg${label} — +25 coins!` });
        bumpCoins(25);
      } else if (encounter.kind === "legendary") {
        setEncounter({ ...encounter, hp, wildStatus: newWildStatus, message: `${encounter.mon.name} is weak — try a Poké Ball!` });
        return;
      } else if (encounter.kind === "champion") {
        setEncounter({ ...encounter, hp, wildStatus: newWildStatus, message: `Challenger defeated! +100 coins!` });
        bumpCoins(100); setDefenses((d) => d + 1);
      } else {
        setEncounter({ ...encounter, hp, wildStatus: newWildStatus, message: `${encounter.mon.name} fainted! ${dmg} dmg${label}` });
      }
      setTimeout(() => setEncounter(null), 1400);
      return;
    }
    // Wild retaliates
    wildRetaliate({ ...encounter, hp, wildStatus: newWildStatus, message: msg });
  };
  const attackWild = () => attackWildMove(0);

  const wildRetaliate = (enc: Encounter) => {
    if (!playerMon) { setEncounter(enc); return; }
    // Status ticks first
    let wildHp = enc.hp;
    let playerHp = enc.playerHp ?? 100;
    const playerMax = enc.playerMaxHp ?? 100;
    let tickMsg = "";
    if (enc.wildStatus === "burn") { const t = Math.max(1, Math.round(enc.maxHp * 0.06)); wildHp = Math.max(0, wildHp - t); tickMsg += ` 🔥-${t}`; }
    if (enc.wildStatus === "poison") { const t = Math.max(1, Math.round(enc.maxHp * 0.08)); wildHp = Math.max(0, wildHp - t); tickMsg += ` ☠-${t}`; }
    if (wildHp === 0) {
      setEncounter({ ...enc, hp: 0, message: `${enc.mon.name} fainted from status damage!${tickMsg}` });
      setTimeout(() => setEncounter(null), 1400);
      return;
    }
    if (enc.playerStatus === "burn") { const t = Math.max(1, Math.round(playerMax * 0.06)); playerHp = Math.max(0, playerHp - t); }
    if (enc.playerStatus === "poison") { const t = Math.max(1, Math.round(playerMax * 0.08)); playerHp = Math.max(0, playerHp - t); }
    // Wild picks a move
    const wildFrozen = enc.wildStatus === "freeze" && Math.random() < 0.4;
    const wildPara = enc.wildStatus === "paralyze" && Math.random() < 0.3;
    let retMsg = "";
    if (wildFrozen) retMsg = `${enc.mon.name} is frozen solid!`;
    else if (wildPara) retMsg = `${enc.mon.name} is paralyzed and couldn't move!`;
    else {
      const wildPool = PLAYER_MOVES.filter(m => !m.type || m.type === enc.mon.type);
      const wm = wildPool[Math.floor(Math.random() * wildPool.length)];
      const wmType = (wm.type ?? enc.mon.type) as ElementType;
      const wEff = typeMult(wmType, playerMon.type);
      const wCrit = Math.random() < 0.12;
      const wBase = 10 + Math.floor(Math.random() * 14) + Math.round(enc.mon.baseAtk * 0.08);
      const wDmg = Math.max(3, Math.round(wBase * wm.power * wEff * (wCrit ? 1.7 : 1) * (enc.wildStatus === "burn" ? 0.85 : 1)));
      playerHp = Math.max(0, playerHp - wDmg);
      retMsg = `${enc.mon.name} used ${wm.name}! ${wDmg} dmg${wCrit ? " CRIT" : ""}`;
      if (wm.status && !enc.playerStatus && Math.random() < wm.statusChance) {
        enc = { ...enc, playerStatus: wm.status };
        retMsg += ` · ${playerMon.name} is ${wm.status}ed!`;
      }
    }
    if (playerHp === 0) {
      setEncounter({ ...enc, hp: wildHp, playerHp: 0, message: `${playerMon.name} fainted! You fled to the last center.${tickMsg} ${retMsg}` });
      setTimeout(() => setEncounter(null), 1600);
      return;
    }
    setEncounter({ ...enc, hp: wildHp, playerHp, message: `${enc.message}${tickMsg} · ${retMsg}` });
  };

  const useBerry = () => {
    if (!encounter || inv.berries <= 0) return;
    setInv((i) => ({ ...i, berries: i.berries - 1 }));
    setEncounter({ ...encounter, message: "🍒 You ate a berry! (Heals your team next round.)" });
  };

  const throwBall = () => {
    if (!encounter) return;
    const ratio = encounter.hp / encounter.maxHp;
    const legPenalty = encounter.kind === "legendary" ? 0.35 : 1;
    const catchBonus = inv.catchBadge ? 0.1 : 0;
    const chance = Math.max(0.05, (0.95 - ratio * 0.8) * legPenalty + catchBonus);
    if (Math.random() < chance) {
      if (encounter.kind === "legendary") {
        setTrophies((t) => t.includes(encounter.id) ? t : [...t, encounter.id]);
        setRoamer(null);
        setEncounter({ ...encounter, message: `🏆 Legendary ${encounter.mon.name} caught! Trophy earned.` });
      } else {
        // Nuzlocke: only first per route counts
        if (nuzlocke) {
          const routeKey = encounter.id;
          if (routeCaught.has(routeKey)) {
            setEncounter({ ...encounter, message: "Nuzlocke: already caught one from this route — released." });
            setTimeout(() => setEncounter(null), 1400); return;
          }
          setRouteCaught((s) => { const n = new Set(s); n.add(routeKey); return n; });
        }
        setCaught((c) => {
          const full = c.length >= 6;
          if (full) { setPcBox((p) => [...p, encounter.id]); return c; }
          return [...c, encounter.id];
        });
        setEncounter({ ...encounter, message: `Gotcha! ${encounter.mon.name} was caught${caught.length >= 6 ? " → sent to PC" : ""}!` });
      }
      setTimeout(() => setEncounter(null), 1400);
    } else {
      setEncounter({ ...encounter, message: "Oh no! It broke free!" });
    }
  };

  const flee = () => {
    if (nuzlocke && encounter && encounter.hp === 0) {
      // No-op: fainted still handled
    }
    setEncounter(null);
  };

  const releaseOne = (id: number, from: "team" | "pc") => {
    if (from === "team") setCaught((c) => { const i = c.indexOf(id); if (i < 0) return c; const n = [...c]; n.splice(i, 1); return n; });
    else setPcBox((c) => { const i = c.indexOf(id); if (i < 0) return c; const n = [...c]; n.splice(i, 1); return n; });
  };
  const swapPcToTeam = (id: number) => {
    if (caught.length >= 6) { alert("Team is full (6). Release one first."); return; }
    setPcBox((p) => { const i = p.indexOf(id); if (i < 0) return p; const n = [...p]; n.splice(i, 1); return n; });
    setCaught((c) => [...c, id]);
  };

  const askQuiz = (g: typeof GYM_LEADERS[number]) => {
    const ans = window.prompt(`${g.name} asks: "${g.quiz.q}" (${g.quiz.choices.join(" / ")})`);
    return ans && ans.trim().toLowerCase() === g.quiz.a;
  };

  const challenge = async (g: typeof GYM_LEADERS[number]) => {
    if (team.length === 0) { alert("Pick a starter first!"); return; }
    if (!askQuiz(g)) { alert("Wrong! Try again after some training."); return; }
    setBusy(true);
    try {
      const my = [...team]; while (my.length < 3) my.push(my[0]);
      // Rematch scaling: after beating all 8, subsequent challenges scale up
      let gymTeam = [...g.team];
      if (beaten.length === GYM_LEADERS.length && beaten.includes(g.id)) {
        gymTeam = gymTeam.map((id) => Math.min(649, id + rematchLevel * 30));
        setRematchLevel((r) => r + 1);
      }
      await onChallengeGym(my.slice(0, 3), gymTeam);
      if (!beaten.includes(g.id)) {
        setBeaten((b) => { const nb = [...b, g.id]; try { lsSet("ppb-beaten", nb); } catch { /* ignore */ } return nb; });
        // Grant perk (also persist immediately in case of unmount)
        setInv((i) => {
          const n = { ...i };
          if (g.id === "brock") n.cutBadge = true;
          if (g.id === "misty") n.surfBadge = true;
          if (g.id === "surge") n.repelBadge = true;
          if (g.id === "erika") n.strengthBadge = true;
          if (g.id === "koga") n.catchBadge = true;
          if (g.id === "sabrina") n.seeBadge = true;
          if (g.id === "blaine") n.flyBadge = true;
          if (g.id === "giovanni") n.eliteUnlocked = true;
          try { lsSet("ppb-inv", n); } catch { /* ignore */ }
          return n;
        });
        bumpCoins(g.reward);
        alert(`🏅 You beat ${g.name}! Perk unlocked. Check your Trainer Card.`);
      }
    } finally { setBusy(false); }
  };

  const challengeE4 = async (e: typeof ELITE_FOUR[number]) => {
    if (!inv.eliteUnlocked) { alert("Beat all 8 gyms first."); return; }
    if (team.length === 0) return;
    setBusy(true);
    try {
      const my = [...team]; while (my.length < 3) my.push(my[0]);
      await onChallengeGym(my.slice(0, 3), e.team);
      if (!e4Beaten.includes(e.id)) { setE4Beaten((b) => [...b, e.id]); bumpCoins(250); }
    } finally { setBusy(false); }
  };

  const defendChampion = async () => {
    if (e4Beaten.length < 4) { alert("Beat the Elite Four first to become Champion."); return; }
    setBusy(true);
    try {
      const opp = [1 + Math.floor(Math.random() * 649), 1 + Math.floor(Math.random() * 649), 1 + Math.floor(Math.random() * 649)];
      const my = [...team]; while (my.length < 3) my.push(my[0]);
      await onChallengeGym(my.slice(0, 3), opp);
      setDefenses((d) => d + 1); bumpCoins(150);
    } finally { setBusy(false); }
  };

  const flyToHeal = () => {
    if (!inv.flyBadge) { setMessage("You need Blaine's badge to Fly."); return; }
    setPos({ x: 1, y: 5 }); setMessage("🕊 Flew to the Heal Center! Team restored.");
  };
  const buyRepel = () => { if (coinsView < 50) return; bumpCoins(-50); setInv((i) => ({ ...i, repel: i.repel + 100 })); };
  const buyBike = () => { if (coinsView < 200 || inv.bike) return; bumpCoins(-200); setInv((i) => ({ ...i, bike: true })); };
  const buyPotion = () => { if (coinsView < 30) return; bumpCoins(-30); setInv((i) => ({ ...i, potions: i.potions + 1 })); };
  const freeRepelBadge = () => { if (!inv.repelBadge) return; setInv((i) => ({ ...i, repel: i.repel + 50 })); setMessage("Free repel from Lt. Surge's badge!"); };

  const takePhoto = () => {
    const names = [starter, ...caught].filter((x) => x !== null).slice(0, 6).map((id) => `#${id}`).join(" · ");
    alert(`📸 Snapshot saved!\nTeam: ${names || "empty"}\nBadges: ${beaten.length}/8\nDex: ${dexPct}%\nTime: ${new Date().toLocaleString()}`);
  };

  const nightOverlay = isNight ? { boxShadow: "inset 0 0 200px rgba(0,0,50,0.55)" } : {};

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-3 p-3 sm:p-5" suppressHydrationWarning>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[10px] tracking-wider text-primary sm:text-sm">CATCH &amp; GYM {isNight ? "🌙" : "☀"}</h1>
          <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">
            Walk, catch, evolve, and battle. All 25 upgrades live: bike, repel, fishing, headbutt, hidden items, day/night, swarms, roaming legendaries, caves, HMs, berries, PC box, revive quest, move tutor, dojo, gym perks, rematches, Elite Four, champion defense, quizzes, trainer card, photo, wonder trade, nuzlocke.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border-2 border-border bg-muted px-2 py-1 text-[8px] sm:text-[10px]">💰 {coinsView}</span>
          <span className="rounded border-2 border-border bg-muted px-2 py-1 text-[8px] sm:text-[10px]">📖 Dex {dexPct}%</span>
          <span className="rounded border-2 border-border bg-muted px-2 py-1 text-[8px] sm:text-[10px]">◉ Cells {cells}</span>
          <span className="rounded border-2 border-border bg-muted px-2 py-1 text-[8px] sm:text-[10px]">🏆 {trophies.length}</span>
          {swarm && <span className="rounded border-2 border-primary bg-primary/20 px-2 py-1 text-[8px] sm:text-[10px]">🌊 Swarm: {swarm.name}</span>}
          {inv.repel > 0 && <span className="rounded border-2 border-border bg-muted px-2 py-1 text-[8px]">💨 {inv.repel}</span>}
          {inv.bike && <span className="rounded border-2 border-border bg-muted px-2 py-1 text-[8px]">🚲 On</span>}
          <label className="flex items-center gap-1 rounded border-2 border-border bg-muted px-2 py-1 text-[8px] sm:text-[10px]">
            <input type="checkbox" checked={nuzlocke} onChange={(e) => setNuzlocke(e.target.checked)} /> Nuzlocke
          </label>
          <button onClick={onClose} className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] sm:text-[10px]">← Lobby</button>
        </div>
      </header>

      <section className="rounded border-2 border-border bg-panel p-3">
        <p className="mb-2 text-[9px] text-primary sm:text-[11px]">{starter === null ? "PICK YOUR STARTER" : "STARTER"}</p>
        <div className="flex flex-wrap gap-2">
          {STARTER_OPTIONS.map((s) => (
            <button key={s.id} onClick={() => pickStarter(s.id)}
              className={`flex flex-col items-center rounded border-2 p-2 text-[8px] sm:text-[10px] ${starter === s.id ? "border-primary bg-primary/20" : "border-border bg-muted"}`}>
              <img src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${s.id}.png`}
                alt={s.name} className="h-12 w-12" style={{ imageRendering: "pixelated" }} />
              <span>{s.name}</span>
              <span className="text-muted-foreground">{s.type}</span>
            </button>
          ))}
        </div>
      </section>

      {starter !== null && (
        <>
          {/* Tabs */}
          <div className="flex flex-wrap gap-1">
            {(["map","team","gyms","shop","card","photo"] as const).map((t) => (
              <button key={t} onClick={() => t === "photo" ? takePhoto() : setTab(t)}
                className={`rounded border-2 px-3 py-1 text-[8px] sm:text-[10px] ${tab === t ? "border-primary bg-primary/20" : "border-border bg-muted"}`}>
                {t === "map" ? "🗺 Map" : t === "team" ? "📦 Team+PC" : t === "gyms" ? "🏟 Gyms & E4" : t === "shop" ? "🛒 Shop" : t === "card" ? "🪪 Trainer Card" : "📸 Photo"}
              </button>
            ))}
            <button onClick={() => setInv((i) => ({ ...i, bike: !i.bike }))} disabled={!inv.bike}
              className="rounded border-2 border-border bg-muted px-3 py-1 text-[8px] sm:text-[10px] disabled:opacity-40">🚲 Toggle Bike</button>
            <button onClick={flyToHeal} disabled={!inv.flyBadge} className="rounded border-2 border-border bg-muted px-3 py-1 text-[8px] disabled:opacity-40">🕊 Fly to 🏥</button>
            <button onClick={freeRepelBadge} disabled={!inv.repelBadge} className="rounded border-2 border-border bg-muted px-3 py-1 text-[8px] disabled:opacity-40">💨 Free Repel</button>
            {zone === "cave" && <button onClick={() => { setZone("over"); setPos({ x: 13, y: 13 }); }} className="rounded border-2 border-border bg-muted px-3 py-1 text-[8px]">↩ Leave Cave</button>}
          </div>

          {tab === "map" && (
            <section className="rounded border-2 border-border bg-panel p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[9px] text-primary sm:text-[11px]">{zone === "cave" ? "MT. MOON (CAVE)" : "OVERWORLD MAP"} {isNight && "· NIGHT"}</p>
                <span className="text-[7px] text-muted-foreground sm:text-[9px]">{message}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                <div className="mx-auto grid" style={{ gridTemplateColumns: `repeat(${CG_SIZE}, 22px)`, gridAutoRows: "22px", ...nightOverlay }}>
                  {currentMap.flatMap((row, y) => row.split("").map((t, x) => {
                    const here = pos.x === x && pos.y === y;
                    const cellPicked = pickedCells.has(`${x},${y}`);
                    const trainerDone = trainersDone.has(`${x},${y}`);
                    const isRoam = roamer && roamer.x === x && roamer.y === y;
                    const isHidden = inv.seeBadge && hiddenItems.has(`${x},${y}`) && !foundHidden.has(`${x},${y}`);
                    const bg = t === "T" ? "#2a5a2a" : t === "G" ? (isNight ? "#3f8d3f" : "#6bd36b") : t === "W" ? "#4ea8ff"
                      : t === "C" ? (cellPicked ? "#8a7a55" : "#ffd83a")
                      : t === "H" ? "#ff9ec7" : t === "N" ? (trainerDone ? "#a89880" : "#e8b74a") : t === "$" ? "#9be0a8"
                      : t === "B" ? "#c86a6a" : t === "K" ? "#8a8a8a" : t === "X" ? "#333" : t === "L" ? "#8a2be2"
                      : t === "D" ? "#d19a5c" : t === "M" ? "#b39ddb" : t === "R" ? "#f28ba8" : t === "U" ? "#7ce0e0"
                      : t === "F" ? "#c0d8ff" : "#c8b884";
                    return (
                      <div key={`${x},${y}`} style={{ background: bg, border: "1px solid rgba(0,0,0,0.15)", position: "relative" }}>
                        {t === "T" && <span style={emojiCss}>🌲</span>}
                        {t === "C" && !cellPicked && <span style={emojiCss}>◉</span>}
                        {t === "H" && <span style={emojiCss}>🏥</span>}
                        {t === "N" && !trainerDone && <span style={emojiCss}>👤</span>}
                        {t === "$" && <span style={emojiCss}>🛒</span>}
                        {t === "B" && <span style={emojiCss}>🍒</span>}
                        {t === "K" && <span style={emojiCss}>🪨</span>}
                        {t === "X" && <span style={emojiCss}>🕳</span>}
                        {t === "L" && <span style={emojiCss}>⭐</span>}
                        {t === "D" && <span style={emojiCss}>🥋</span>}
                        {t === "M" && <span style={emojiCss}>✏</span>}
                        {t === "R" && !reviveDone && <span style={emojiCss}>💊</span>}
                        {t === "U" && <span style={emojiCss}>🎁</span>}
                        {t === "F" && <span style={emojiCss}>📦</span>}
                        {isHidden && <span style={{ ...emojiCss, color: "#fff" }}>✨</span>}
                        {isRoam && <span style={emojiCss}>🔴</span>}
                        {here && <span style={{ ...emojiCss, fontSize: 16 }}>🧑</span>}
                      </div>
                    );
                  }))}
                </div>

                <div className="flex flex-col items-center justify-center gap-1">
                  <button onClick={() => move(0, -1)} className="h-9 w-9 rounded border-2 border-border bg-muted text-lg">▲</button>
                  <div className="flex gap-1">
                    <button onClick={() => move(-1, 0)} className="h-9 w-9 rounded border-2 border-border bg-muted text-lg">◀</button>
                    <button onClick={() => move(0, 1)} className="h-9 w-9 rounded border-2 border-border bg-muted text-lg">▼</button>
                    <button onClick={() => move(1, 0)} className="h-9 w-9 rounded border-2 border-border bg-muted text-lg">▶</button>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <button onClick={fish} className="rounded border-2 border-border bg-muted px-2 py-1 text-[8px]">🎣 Fish (F)</button>
                    <button onClick={headbutt} className="rounded border-2 border-border bg-muted px-2 py-1 text-[8px]">🌲 Headbutt (J)</button>
                  </div>
                  <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">Arrows / WASD to walk</p>
                </div>
              </div>
            </section>
          )}

          {tab === "shop" && (
            <section className="rounded border-2 border-border bg-panel p-3 text-[9px] sm:text-[11px]">
              <p className="mb-2 text-primary">SHOP · Coins: {coinsView}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button onClick={buyBike} disabled={inv.bike || coinsView < 200} className="rounded border-2 border-border bg-muted p-2 disabled:opacity-40 text-left">🚲 Bike — 200c {inv.bike && "(owned)"}</button>
                <button onClick={buyRepel} disabled={coinsView < 50} className="rounded border-2 border-border bg-muted p-2 disabled:opacity-40 text-left">💨 Repel (+100 steps) — 50c</button>
                <button onClick={buyPotion} disabled={coinsView < 30} className="rounded border-2 border-border bg-muted p-2 disabled:opacity-40 text-left">🧪 Potion — 30c (have {inv.potions})</button>
                <div className="rounded border-2 border-border bg-muted p-2">🍒 Berries: {inv.berries} (find on 🍒 tiles)</div>
              </div>
            </section>
          )}

          {tab === "card" && (
            <section className="rounded border-2 border-border bg-panel p-4 text-[9px] sm:text-[11px]">
              <p className="mb-2 text-primary">🪪 TRAINER CARD</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p>Starter: #{starter}</p>
                  <p>Badges: {beaten.length}/8</p>
                  <p>Elite Four: {e4Beaten.length}/4 {inv.eliteUnlocked ? "" : "(locked)"}</p>
                  <p>Champion Defenses: {defenses}</p>
                  <p>Rematch Level: {rematchLevel}</p>
                  <p>Dex: {dexPct}%</p>
                  <p>Trophies: {trophies.length} ({trophies.join(", ") || "—"})</p>
                  <p>Nuzlocke: {nuzlocke ? "ON" : "off"}</p>
                </div>
                <div>
                  <p className="text-primary">Perks unlocked:</p>
                  <ul className="ml-3 list-disc text-muted-foreground">
                    {inv.cutBadge && <li>Cut (chop trees)</li>}
                    {inv.surfBadge && <li>Surf (walk on water)</li>}
                    {inv.repelBadge && <li>Free Repel</li>}
                    {inv.strengthBadge && <li>Strength (boulders)</li>}
                    {inv.catchBadge && <li>+10% catch rate</li>}
                    {inv.seeBadge && <li>See hidden items ✨</li>}
                    {inv.flyBadge && <li>Fly (fast heal)</li>}
                    {inv.eliteUnlocked && <li>Elite Four access</li>}
                    {!beaten.length && <li>None yet — beat gyms!</li>}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {encounter && (
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-md rounded border-4 border-primary bg-panel p-4 text-[9px] sm:text-[11px]">
                <p className="mb-2 text-center text-primary">{encounter.message}</p>
                <div className="mb-2 flex items-center justify-around">
                  <div className="flex flex-col items-center">
                    <img src={encounter.mon.sprite} alt={encounter.mon.name} className="h-24 w-24"
                      style={{ imageRendering: "pixelated", filter: `drop-shadow(0 0 8px ${encounter.mon.color})` }} />
                    <p style={{ color: encounter.mon.color }}>{encounter.mon.name}</p>
                    <div className="h-1.5 w-24 overflow-hidden rounded bg-background">
                      <div className="h-full" style={{ width: `${(encounter.hp / encounter.maxHp) * 100}%`, background: encounter.hp > encounter.maxHp * 0.4 ? "var(--color-hp)" : "var(--color-hp-low)" }} />
                    </div>
                    <p className="text-muted-foreground">{encounter.hp}/{encounter.maxHp} HP · {encounter.mon.type}{encounter.wildStatus ? ` · ${encounter.wildStatus.toUpperCase()}` : ""}</p>
                  </div>
                  <div className="flex flex-col items-center">
                    {playerMon ? (
                      <>
                        <img src={playerMon.sprite} alt={playerMon.name} className="h-20 w-20" style={{ imageRendering: "pixelated" }} />
                        <p style={{ color: playerMon.color }}>{playerMon.name}</p>
                        <div className="h-1.5 w-24 overflow-hidden rounded bg-background">
                          <div className="h-full" style={{
                            width: `${((encounter.playerHp ?? 100) / (encounter.playerMaxHp ?? 100)) * 100}%`,
                            background: (encounter.playerHp ?? 100) > (encounter.playerMaxHp ?? 100) * 0.4 ? "var(--color-hp)" : "var(--color-hp-low)"
                          }} />
                        </div>
                        <p className="text-muted-foreground">{encounter.playerHp ?? "?"}/{encounter.playerMaxHp ?? "?"} HP{encounter.playerStatus ? ` · ${encounter.playerStatus.toUpperCase()}` : ""}</p>
                      </>
                    ) : <p className="text-muted-foreground">Loading…</p>}
                  </div>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-1">
                  {PLAYER_MOVES.map((m, i) => (
                    <button key={m.name} onClick={() => attackWildMove(i)} disabled={!playerMon}
                      className="rounded border-2 border-border bg-muted px-2 py-1 text-[7px] disabled:opacity-40 sm:text-[8px]">
                      {m.name}{m.status ? ` (${m.status})` : ""}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={throwBall} disabled={encounter.kind === "trainer" || encounter.kind === "champion"} className="rounded border-2 border-border bg-primary px-2 py-2 text-primary-foreground disabled:opacity-40">◉ Ball</button>
                  <button onClick={useBerry} disabled={inv.berries <= 0} className="rounded border-2 border-border bg-muted px-2 py-1 text-[8px] disabled:opacity-40">🍒 Berry ({inv.berries})</button>
                  <button onClick={flee} className="rounded border-2 border-border bg-muted px-2 py-1 text-[8px]">🏃 Run</button>
                </div>
                <p className="mt-2 text-center text-[7px] text-muted-foreground">
                  Catch chance ≈ {Math.round(Math.max(0.05, (0.95 - (encounter.hp / encounter.maxHp) * 0.8) * (encounter.kind === "legendary" ? 0.35 : 1) + (inv.catchBadge ? 0.1 : 0)) * 100)}% · Infinite Poké Balls
                </p>
              </div>
            </div>
          )}

          {tab === "team" && (
            <section className="rounded border-2 border-border bg-panel p-3">
              <p className="mb-2 text-[9px] text-primary sm:text-[11px]">TEAM ({caught.length}/6)</p>
              {caught.length === 0 ? (
                <p className="text-[8px] text-muted-foreground sm:text-[10px]">No catches yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {caught.map((id, i) => (
                    <div key={`${id}-${i}`} className="flex items-center gap-1 rounded border-2 border-border bg-muted px-2 py-1 text-[8px] sm:text-[10px]">
                      <img src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`} alt={`#${id}`} className="h-8 w-8" style={{ imageRendering: "pixelated" }} />
                      <span>#{id}</span>
                      <button onClick={() => releaseOne(id, "team")} className="ml-1 text-red-400">×</button>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 mb-2 text-[9px] text-primary sm:text-[11px]">📦 PC BOX ({pcBox.length})</p>
              {pcBox.length === 0 ? (
                <p className="text-[8px] text-muted-foreground sm:text-[10px]">Overflow catches land here when your team is full.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {pcBox.map((id, i) => (
                    <div key={`pc-${id}-${i}`} className="flex items-center gap-1 rounded border-2 border-border bg-muted px-2 py-1 text-[8px] sm:text-[10px]">
                      <img src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`} alt={`#${id}`} className="h-7 w-7" style={{ imageRendering: "pixelated" }} />
                      <span>#{id}</span>
                      <button onClick={() => swapPcToTeam(id)} className="ml-1 text-primary">↑</button>
                      <button onClick={() => releaseOne(id, "pc")} className="ml-1 text-red-400">×</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "gyms" && (
            <>
              <section className="rounded border-2 border-border bg-panel p-3">
                <p className="mb-2 text-[9px] text-primary sm:text-[11px]">GYM LEADERS ({beaten.length}/{GYM_LEADERS.length}) · Rematch Lv {rematchLevel}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {GYM_LEADERS.map((g) => {
                    const done = beaten.includes(g.id);
                    return (
                      <div key={g.id} className={`rounded border-2 p-2 text-[8px] sm:text-[10px] ${done ? "border-primary bg-primary/10" : "border-border bg-muted"}`}>
                        <p className="text-primary">{done ? "✓ " : ""}{g.name}</p>
                        <div className="my-1 flex gap-1">
                          {g.team.map((id) => (
                            <img key={id} src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`} alt={`#${id}`} className="h-9 w-9" style={{ imageRendering: "pixelated" }} />
                          ))}
                        </div>
                        <p className="text-muted-foreground">Reward: {g.reward}c</p>
                        <p className="text-muted-foreground">Perk: {g.perk}</p>
                        <button disabled={busy} onClick={() => challenge(g)}
                          className="mt-1 w-full rounded border-2 border-border bg-accent px-2 py-1 text-[8px] text-primary-foreground disabled:opacity-40 sm:text-[10px]">
                          ⚔ {done ? "Rematch (harder)" : "Challenge"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded border-2 border-border bg-panel p-3">
                <p className="mb-2 text-[9px] text-primary sm:text-[11px]">🏆 ELITE FOUR ({e4Beaten.length}/4) {inv.eliteUnlocked ? "" : "· LOCKED — beat Giovanni"}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {ELITE_FOUR.map((e) => {
                    const done = e4Beaten.includes(e.id);
                    return (
                      <div key={e.id} className={`rounded border-2 p-2 text-[8px] sm:text-[10px] ${done ? "border-primary bg-primary/10" : "border-border bg-muted"}`}>
                        <p className="text-primary">{done ? "✓ " : ""}{e.name}</p>
                        <div className="my-1 flex gap-1">
                          {e.team.map((id) => (
                            <img key={id} src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`} alt={`#${id}`} className="h-9 w-9" style={{ imageRendering: "pixelated" }} />
                          ))}
                        </div>
                        <button disabled={busy || !inv.eliteUnlocked} onClick={() => challengeE4(e)}
                          className="mt-1 w-full rounded border-2 border-border bg-accent px-2 py-1 text-[8px] text-primary-foreground disabled:opacity-40 sm:text-[10px]">
                          ⚔ Challenge
                        </button>
                      </div>
                    );
                  })}
                </div>
                {e4Beaten.length === 4 && (
                  <div className="mt-3 rounded border-2 border-primary bg-primary/10 p-2 text-[9px] sm:text-[11px]">
                    <p className="text-primary">★ You are the Champion! Defenses: {defenses}</p>
                    <button onClick={defendChampion} disabled={busy} className="mt-1 rounded border-2 border-border bg-accent px-3 py-1 text-primary-foreground disabled:opacity-40">🛡 Defend Title (+150c)</button>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}

const emojiCss: CSSProperties = { position: "absolute", inset: 0, textAlign: "center", fontSize: 12, lineHeight: "22px" };

