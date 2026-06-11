import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
type Screen = "lobby" | "battle" | "shop";

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
  morphIds?: number[]; // for Rotom-style cyclers
  morphIdx?: number;
  morphLastSwap?: number;
};
type Projectile = {
  id: number; fromIdx: number; targetIdx: number;
  from: Vec; pos: Vec; angle: number;
  color: string; dmg: number; crit: boolean; kind: AttackKind;
  bornAt: number; duration: number;
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
      lsSet(`ppb-mon-${id}`, cached);
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
  const sp = await fetchSpecies(startSpeciesId);
  if (!sp) return fetchMon(startSpeciesId, uid);
  const chain = await fetchEvoChain(sp.evoChainUrl);
  // Find the index of this species in the chain and walk forward.
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
// Component
// ============================================================
function Game() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [mode, setMode] = useState<Mode>("ffa");
  const [battleSize, setBattleSize] = useState(5);
  const [rosterMode, setRosterMode] = useState<"random" | "custom">("random");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [randomRoster, setRandomRoster] = useState<MonData[]>([]);
  const [betAmount, setBetAmount] = useState(10);
  const [betTarget, setBetTarget] = useState<string | null>(null);
  const [coins, setCoins] = useState<number>(STARTING_COINS);
  const [soundOn, setSoundOn] = useState(true);
  const [volume] = useState(0.4);
  const [loading, setLoading] = useState(false);
  const [evolveSec, setEvolveSec] = useState(15);
  const [shop, setShop] = useState<ShopState>(DEFAULT_SHOP);

  useEffect(() => { setCoins(readCoins()); setShop(readShop()); }, []);
  useEffect(() => { writeCoins(coins); }, [coins]);
  useEffect(() => { writeShop(shop); }, [shop]);

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

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);

  const pushLog = (text: string, color: string) => {
    setLog((l) => [{ id: idRef.current++, text, color }, ...l].slice(0, 14));
  };

  // ============ Combat loop (throttled render ~30fps) ============
  useEffect(() => {
    if (screen !== "battle") return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (runningRef.current && status === "fighting") step(dt, now);
      // Throttle React renders to ~16fps so HP bars/log update without thrashing
      if (now - lastRenderRef.current > 62) {
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

  const step = (dt: number, now: number) => {
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
        } else if (m.plusLevel === 0) {
          // Plus evolution — no Mega/Gmax/regional available, but still grant a power boost
          const oldName = d.name;
          m.data = { ...d, name: d.name.startsWith("✦") ? d.name : `✦${d.name}`,
            baseAtk: Math.round(d.baseAtk * 1.25), baseDef: Math.round(d.baseDef * 1.15),
            baseSpd: Math.round(d.baseSpd * 1.1), baseHp: Math.round(d.baseHp * 1.25),
            signature: { ...d.signature, dmg: Math.round(d.signature.dmg * 1.25) },
            basic: { ...d.basic, dmg: Math.round(d.basic.dmg * 1.25) } };
          m.plusLevel = 1;
          m.evolveTimer = 0;
          m.evolveFlashUntil = now + EVOLVE_FLASH_MS;
          const newMax = Math.round(m.maxHp * 1.25);
          m.maxHp = newMax;
          m.hp = Math.min(newMax, Math.round(m.hp + newMax * 0.25));
          pushLog(`${oldName} powered up to ✦Plus form!`, d.color);
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

      const atkCd = Math.max(700, ABILITY_COOLDOWN_BASE * (80 / Math.max(20, d.baseSpd)));
      if (now - m.lastAttack >= atkCd && dist <= ATTACK_RANGE + 60) {
        m.lastAttack = now;
        m.attackFlash = now + 300;
        const crit = Math.random() < 0.15;
        const eff = typeMult(d.type, t.data.type);
        const atkMul = 0.7 + 0.6 * (d.baseAtk / 100);
        const defReduction = 1 - Math.min(0.55, t.data.baseDef / 360);
        const dmg = Math.max(1, Math.round(d.basic.dmg * atkMul * formMul * (crit ? 1.5 : 1) * eff * defReduction * (0.75 + Math.random() * 0.5)));
        const ang = Math.atan2(t.pos.y - m.pos.y, t.pos.x - m.pos.x);
        if (projectilesRef.current.length < 60) {
          projectilesRef.current.push({
            id: idRef.current++, fromIdx: i, targetIdx: tgt,
            from: { ...m.pos }, pos: { ...m.pos }, angle: ang,
            color: d.color, dmg, crit, kind: d.basic.kind, bornAt: now,
            duration: d.basic.kind === "lightning" ? 200 : 420,
          });
        }
        pushLog(`${d.name} → ${t.data.name}: ${d.basic.name} ${crit ? "CRIT " : ""}${dmg}${effLabel(eff)}`, d.color);
      }

      if (now - m.lastSpecial >= SPECIAL_COOLDOWN_BASE && dist <= ATTACK_RANGE + 120) {
        m.lastSpecial = now;
        m.attackFlash = now + 400;
        const crit = Math.random() < 0.22;
        const eff = typeMult(d.type, t.data.type);
        const atkMul = 0.8 + 0.6 * (d.baseAtk / 100);
        const defReduction = 1 - Math.min(0.5, t.data.baseDef / 380);
        const dmg = Math.max(1, Math.round(d.signature.dmg * atkMul * formMul * (crit ? 1.7 : 1) * eff * defReduction * (0.85 + Math.random() * 0.3)));
        const ang = Math.atan2(t.pos.y - m.pos.y, t.pos.x - m.pos.x);
        if (projectilesRef.current.length < 60) {
          projectilesRef.current.push({
            id: idRef.current++, fromIdx: i, targetIdx: tgt,
            from: { ...m.pos }, pos: { ...m.pos }, angle: ang,
            color: d.color, dmg, crit, kind: d.signature.kind, bornAt: now,
            duration: d.signature.kind === "lightning" ? 240 : 500,
          });
        }
        pushLog(`★ ${d.name} unleashed ${d.signature.name}! ${crit ? "CRIT " : ""}${dmg}${effLabel(eff)}`, d.color);
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
          popsRef.current.push({ id: idRef.current++, x: tgt.pos.x, y: tgt.pos.y - 28, value: p.dmg, crit: p.crit, bornAt: now, color: p.crit ? "#ffd83a" : "#ff5566" });
          if (tgt.hp === 0) {
            pushLog(`${tgt.data.name} was knocked out!`, "var(--color-muted-foreground)");
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
      // Uniform sample across all 1025 species
      const seen = new Set<number>();
      const picksIds: number[] = [];
      while (picksIds.length < battleSize) {
        const id = 1 + Math.floor(Math.random() * 1025);
        if (!seen.has(id)) { seen.add(id); picksIds.push(id); }
      }
      const built = await Promise.all(picksIds.map((id, i) => buildLinkedFromSpecies(id, `r${i}`)));
      setRandomRoster(built.filter((b): b is MonData => !!b));
    } finally { setLoading(false); }
  }, [battleSize]);

  useEffect(() => {
    if (screen === "lobby" && rosterMode === "random") void rollRandomRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, rosterMode, battleSize]);

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
        return {
          pos, vel: { x: rand(-30, 30), y: rand(-30, 30) },
          hp: maxHp, maxHp, team: entry.team, data: d,
          lastAttack: -rand(0, 1500),
          lastSpecial: -rand(0, SPECIAL_COOLDOWN_BASE),
          evolveTimer: 0, hitFlash: 0, attackFlash: 0, evolveFlashUntil: 0,
          evolveEnabled: entry.evolve && (!!d.evolveTo || true), // also enable for plus-evolution
          plusLevel: 0,
        };
      });

      monsRef.current = mons;
      projectilesRef.current = [];
      popsRef.current = [];
      evolveMsRef.current = evolveSec * 1000;
      if (typeof window !== "undefined") (window as unknown as { __ppbEvolveMs?: number }).__ppbEvolveMs = evolveSec * 1000;

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

  if (screen === "lobby") {
    return (
      <Lobby
        mode={mode} setMode={setMode}
        battleSize={battleSize} setBattleSize={setBattleSize}
        rosterMode={rosterMode} setRosterMode={setRosterMode}
        picks={picks} setPicks={setPicks}
        randomRoster={randomRoster} reroll={rollRandomRoster}
        betAmount={betAmount} setBetAmount={setBetAmount}
        betTarget={betTarget} setBetTarget={setBetTarget}
        coins={coins} soundOn={soundOn} setSoundOn={setSoundOn}
        evolveSec={evolveSec} setEvolveSec={setEvolveSec}
        shop={shop}
        onStart={startBattle} loading={loading}
        openShop={() => setScreen("shop")}
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
  betAmount: number; setBetAmount: (n: number) => void;
  betTarget: string | null; setBetTarget: (t: string | null) => void;
  coins: number; soundOn: boolean; setSoundOn: (s: boolean) => void;
  evolveSec: number; setEvolveSec: (n: number) => void;
  shop: ShopState;
  onStart: () => void; loading: boolean;
  openShop: () => void;
}) {
  const { mode, setMode, battleSize, setBattleSize, rosterMode, setRosterMode,
    picks, setPicks, randomRoster, reroll,
    betAmount, setBetAmount, betTarget, setBetTarget,
    coins, soundOn, setSoundOn, evolveSec, setEvolveSec, shop, onStart, loading, openShop } = props;

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | ElementType>("all");
  const [filterGen, setFilterGen] = useState<"all" | number>("all");
  const [filterRarity, setFilterRarity] = useState<"all" | "legendary" | "mythical" | "ultrabeast" | "normal">("all");
  const [filterForm, setFilterForm] = useState<"all" | "mega" | "gmax" | "regional">("all");
  const [filterEvos, setFilterEvos] = useState<"all" | "1" | "2" | "3" | "4">("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [typeIdSet, setTypeIdSet] = useState<Set<number> | null>(null);

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
      if (filterEvos !== "all") {
        // Approx: 4 = has Mega/Gmax/regional in name; otherwise we can't know without an extra fetch.
        const hasSpecial = isMegaName(c.name) || isGmaxName(c.name) || isRegionalName(c.name);
        if (filterEvos === "4" && !hasSpecial) return false;
        if (filterEvos !== "4" && hasSpecial) return false;
      }
      if (!s) return true;
      return c.name.includes(s) || c.display.toLowerCase().includes(s);
    }).slice(0, 320);
  }, [catalog, search, filterType, filterGen, filterRarity, filterForm, filterEvos, typeIdSet]);

  const addPick = async (entry: CatalogEntry) => {
    if (picks.length >= 14) return;
    setBusyId(entry.id);
    const m = await fetchMon(entry.id, `pick-${entry.id}-${Date.now()}`);
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
          <button onClick={() => alert("Catch & Gym mode is in early scaffold — coming next update! Pick starters, walk in grass, catch wild Pokémon, then challenge Rock/Water/Electric/Grass gym leaders.")}
            className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] sm:text-[10px]">🎒 Catch & Gym</button>
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
              <input type="range" min={2} max={14} value={battleSize} onChange={(e) => setBattleSize(Number(e.target.value))} className="w-full" />
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
                onChange={(e) => setBetAmount(Math.max(0, Math.min(coins, Number(e.target.value) || 0)))}
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
              <select value={filterEvos} onChange={(e) => setFilterEvos(e.target.value as "all" | "1" | "2" | "3" | "4")}
                className="rounded border-2 border-border bg-background px-2 py-1 text-[8px] sm:text-[10px]" title="Evolutions">
                <option value="all">Any evo</option>
                <option value="1">Base/no special</option>
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
              const isPicked = picks.some((p) => p.mon.id === c.id);
              return (
                <button key={c.id} disabled={isPicked || busyId === c.id}
                  onClick={() => addPick(c)}
                  className="flex flex-col items-center rounded border-2 border-border bg-muted p-1 text-[7px] hover:brightness-125 disabled:opacity-40 sm:text-[8px]"
                  title={c.display}>
                  <img src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${c.id}.png`}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://play.pokemonshowdown.com/sprites/gen5/${slugify(c.name)}.png`; }}
                    alt={c.display}
                    loading="lazy" className="h-10 w-10" style={{ imageRendering: "pixelated", objectFit: "contain" }} />
                  <span className="truncate w-full text-center">{c.display}</span>
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
    if (coins < price) return;
    setCoins((c) => c - price);
    setShop((s) => ({ ...s, ownedBgs: [...s.ownedBgs, id], selectedBg: id }));
  };
  const buyFx = (id: string, price: number) => {
    if (shop.ownedFx.includes(id)) { setShop((s) => ({ ...s, selectedFx: id })); return; }
    if (coins < price) return;
    setCoins((c) => c - price);
    setShop((s) => ({ ...s, ownedFx: [...s.ownedFx, id], selectedFx: id }));
  };
  const buyAbility = (kind: "pick" | "evolve") => {
    const price = kind === "pick" ? ABILITY_PICK_PRICE : ABILITY_EVOLVE_PRICE;
    if (coins < price) return;
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
}) {
  const { monsRef, projectilesRef, popsRef, mode, log, status, winnerIdx, winnerTeam, running, setRunning, payout, coins, shop, onManualEvolve, backToLobby } = props;
  const mons = monsRef.current;
  const now = performance.now();
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ idx: number; offX: number; offY: number } | null>(null);

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
          <h1 className="text-[10px] tracking-wider text-primary sm:text-sm">BATTLE</h1>
          <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">
            {mode === "teams" ? "Team Battle" : `${mons.length}-way FFA`} · COINS {coins}
            {!running && " · PAUSED (drag mons to reposition)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
              {!dead && m.evolveEnabled && (d.evolveTo || m.plusLevel === 0) && (() => {
                const total = (typeof window !== "undefined" ? (window as unknown as { __ppbEvolveMs?: number }).__ppbEvolveMs : 0) || 15000;
                const remain = Math.max(0, Math.ceil((total - m.evolveTimer) / 1000));
                const label = d.evolveTo ? (d.evolveTo.isMega ? "Mega" : d.evolveTo.isGmax ? "G-Max" : "Evo") : "Plus";
                return <p className="text-[6px] sm:text-[7px]" style={{ color: "#ffd83a" }}>{label} in {remain}s</p>;
              })()}
            </div>
          );
        })}
      </div>

      <div ref={arenaRef} className="arena-wrap relative w-full overflow-hidden rounded-xl border-4 border-border" style={{ aspectRatio: `${ARENA_W} / ${ARENA_H}` }}>
        <div className={`${bgCls} absolute inset-0`} />
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
            const size = d.isGmax ? 100 : d.isMega ? 84 : (m.plusLevel > 0 ? 72 : 64);
            const evolving = m.evolveFlashUntil && now < m.evolveFlashUntil;
            return (
              <div key={d.uid}
                onPointerDown={(e) => !fainted && onPointerDown(e, i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={`absolute flex flex-col items-center ${running ? "anim-float" : ""}`}
                style={{
                  left: `${(m.pos.x / ARENA_W) * 100}%`,
                  top: `${(m.pos.y / ARENA_H) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: size, opacity: fainted ? 0.2 : 1,
                  cursor: !running && !fainted ? "grab" : "default",
                  touchAction: "none",
                  filter: m.hitFlash ? "brightness(2.4) saturate(0)"
                    : evolving ? "drop-shadow(0 0 18px #fff8b0) drop-shadow(0 0 8px #ffe066) brightness(1.5) saturate(1.4)"
                    : `drop-shadow(0 0 6px ${d.color})`,
                  transition: "filter 120ms",
                }}>
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
                    <span className="mt-0.5 rounded bg-black/70 px-1 text-[7px]" style={{ color: d.color }}>
                      {d.isMega ? "⚡" : d.isGmax ? "🌀" : ""}{d.name}
                    </span>
                    <div className="mt-0.5 h-1 w-14 overflow-hidden rounded bg-black/60">
                      <div className="h-full" style={{ width: `${(m.hp / m.maxHp) * 100}%`, background: m.hp > m.maxHp * 0.4 ? "#62e07a" : "#ff5566" }} />
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {popsRef.current.map((p) => (
            <span key={p.id} className="dmg-pop pointer-events-none absolute text-[10px] sm:text-xs"
              style={{ left: `${(p.x / ARENA_W) * 100}%`, top: `${(p.y / ARENA_H) * 100}%`, color: p.color }}>
              -{p.value}{p.crit ? "!" : ""}
            </span>
          ))}
        </div>

        {status === "ended" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
            <div className="rounded border-2 border-border bg-panel px-5 py-4 text-center">
              {winnerTeam !== null ? (
                <>
                  <p className="text-[10px] sm:text-sm" style={{ color: TEAM_COLORS[winnerTeam] }}>{TEAM_NAMES[winnerTeam]} WINS!</p>
                  <div className="my-2 flex justify-center gap-2">
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
              <p className="mt-1 text-[7px] text-muted-foreground">FX: {shop.selectedFx}</p>
              <button onClick={backToLobby} className="mt-2 rounded border-2 border-border bg-primary px-3 py-2 text-[9px] text-primary-foreground hover:brightness-110 sm:text-[10px]">
                Back to Lobby
              </button>
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
