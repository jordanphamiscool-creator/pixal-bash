import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pixel Pocket Brawl — All 1025 + Mega & Gigantamax" },
      { name: "description", content: "Top-down auto-battler with the full Pokédex, Mega & Gigantamax forms, betting, picker lobby, cries, and stat-driven combat." },
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
type Screen = "lobby" | "battle";

// A fully-resolved mon ready for combat
type MonData = {
  uid: string;            // unique per battle slot
  id: number;             // pokeapi id (may be a form id like 10034 for mega)
  speciesId: number;      // base species id (for cries)
  name: string;           // display name
  type: ElementType;
  color: string;
  sprite: string;
  cry: string | null;
  // stats (scaled 0..1-ish from base stats)
  baseHp: number; baseAtk: number; baseDef: number; baseSpd: number;
  // signature move
  signature: { name: string; kind: AttackKind; dmg: number };
  // basic move
  basic: { name: string; kind: AttackKind; dmg: number };
  // evolution metadata (random mode only)
  evolveTo?: MonData;
  isMega?: boolean;
  isGmax?: boolean;
};

type Vec = { x: number; y: number };
type MonState = {
  pos: Vec; vel: Vec; hp: number; maxHp: number;
  team: number;
  lastAttack: number; lastSpecial: number; evolveTimer: number;
  hitFlash: number; attackFlash: number; evolveFlashUntil: number;
  data: MonData;
};
type Projectile = {
  id: number; fromIdx: number; targetIdx: number;
  from: Vec; pos: Vec; angle: number;
  color: string; dmg: number; crit: boolean; kind: AttackKind;
  bornAt: number; duration: number;
};
type Pop = { id: number; x: number; y: number; value: number; crit: boolean; bornAt: number; color: string };
type LogEntry = { id: number; text: string; color: string };

// ============================================================
// Constants
// ============================================================
const ARENA_W = 800, ARENA_H = 540, MON_R = 26, ATTACK_RANGE = 260;
const ABILITY_COOLDOWN_BASE = 1800; // ms — scaled by speed
const SPECIAL_COOLDOWN_BASE = 7500;
const EVOLVE_INTERVAL = 15000;
const EVOLVE_FLASH_MS = 1400;
const TEAM_COLORS = ["#ff5566", "#4ea8ff"];
const TEAM_NAMES = ["RED TEAM", "BLUE TEAM"];

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

// Generic move-name pools per type for fallback (used when no signature is curated)
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

// Type effectiveness chart (attacker → defender)
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
function typeMult(att: ElementType, def: ElementType): number {
  return TYPE_CHART[att]?.[def] ?? 1;
}
function effLabel(m: number) {
  if (m === 0) return " (no effect)";
  if (m >= 2) return " — super effective!";
  if (m <= 0.5) return " — not very effective";
  return "";
}

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function titleCase(s: string) {
  return s.split("-").map((w) => w[0] ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}

// ============================================================
// Catalog (fetched from PokéAPI)
// ============================================================
type CatalogEntry = { id: number; name: string; display: string };
let CATALOG_CACHE: CatalogEntry[] | null = null;
const POKE_CACHE = new Map<number, MonData>();

async function loadCatalog(): Promise<CatalogEntry[]> {
  if (CATALOG_CACHE) return CATALOG_CACHE;
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
  return list;
}

// Hand-curated signature moves for Gen 1 (1-151)
const SPECIALS: Record<number, { name: string; kind: AttackKind; dmg: number }> = {
  1:{name:"Vine Whip",kind:"leaf",dmg:18},2:{name:"Razor Leaf",kind:"leaf",dmg:22},3:{name:"Solar Beam",kind:"leaf",dmg:34},
  4:{name:"Ember",kind:"fireball",dmg:18},5:{name:"Flamethrower",kind:"fireball",dmg:24},6:{name:"Blast Burn",kind:"fireball",dmg:36},
  7:{name:"Water Gun",kind:"waterjet",dmg:17},8:{name:"Bubble Beam",kind:"waterjet",dmg:22},9:{name:"Hydro Pump",kind:"waterjet",dmg:34},
  25:{name:"Thunderbolt",kind:"lightning",dmg:26},26:{name:"Thunder",kind:"lightning",dmg:36},
  65:{name:"Psychic",kind:"psybeam",dmg:34},68:{name:"Dynamic Punch",kind:"punch",dmg:34},
  76:{name:"Stone Edge",kind:"rock",dmg:34},94:{name:"Shadow Ball",kind:"shadowball",dmg:32},
  131:{name:"Blizzard",kind:"iceshard",dmg:34},143:{name:"Body Slam",kind:"punch",dmg:30},
  144:{name:"Blizzard",kind:"iceshard",dmg:44},145:{name:"Thunder",kind:"lightning",dmg:44},146:{name:"Sky Attack",kind:"fireball",dmg:44},
  149:{name:"Hyper Beam",kind:"dragonpulse",dmg:38},150:{name:"Psystrike",kind:"psybeam",dmg:48},151:{name:"Aura Sphere",kind:"fairywind",dmg:40},
  // Notable gen 2+ signatures
  157:{name:"Eruption",kind:"fireball",dmg:40},160:{name:"Hydro Cannon",kind:"waterjet",dmg:40},
  248:{name:"Stone Edge",kind:"rock",dmg:38},249:{name:"Aeroblast",kind:"fairywind",dmg:42},250:{name:"Sacred Fire",kind:"fireball",dmg:42},
  254:{name:"Frenzy Plant",kind:"leaf",dmg:40},257:{name:"Blaze Kick",kind:"fireball",dmg:38},260:{name:"Hydro Pump",kind:"waterjet",dmg:38},
  445:{name:"Outrage",kind:"dragonpulse",dmg:38},448:{name:"Aura Sphere",kind:"fairywind",dmg:36},
  483:{name:"Spacial Rend",kind:"dragonpulse",dmg:46},484:{name:"Roar of Time",kind:"dragonpulse",dmg:46},487:{name:"Shadow Force",kind:"shadowball",dmg:46},
  493:{name:"Judgment",kind:"fairywind",dmg:48},643:{name:"Blue Flare",kind:"fireball",dmg:48},644:{name:"Bolt Strike",kind:"lightning",dmg:48},
  646:{name:"Glaciate",kind:"iceshard",dmg:44},716:{name:"Geomancy",kind:"fairywind",dmg:46},718:{name:"Dragon Pulse",kind:"dragonpulse",dmg:46},
  800:{name:"Photon Geyser",kind:"psybeam",dmg:48},898:{name:"Astral Barrage",kind:"shadowball",dmg:46},
  1007:{name:"Glaive Rush",kind:"dragonpulse",dmg:48},1008:{name:"Sacred Sword",kind:"punch",dmg:46},
};

function isMegaName(n: string) { return n.startsWith("mega-") || n.endsWith("-mega") || n.endsWith("-mega-x") || n.endsWith("-mega-y"); }
function isGmaxName(n: string) { return n.includes("-gmax"); }

async function fetchMon(id: number, uid: string): Promise<MonData | null> {
  let cached = POKE_CACHE.get(id);
  if (!cached) {
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      if (!res.ok) return null;
      const j = await res.json();
      const types = (j.types as { slot: number; type: { name: string } }[])
        .sort((a, b) => a.slot - b.slot).map((t) => t.type.name as ElementType);
      const primary = types[0] || "normal";
      const stats: Record<string, number> = {};
      (j.stats as { stat: { name: string }; base_stat: number }[]).forEach((s) => { stats[s.stat.name] = s.base_stat; });
      const speciesId = Number((j.species.url as string).match(/\/pokemon-species\/(\d+)\//)?.[1] || id);
      const animated = j.sprites?.versions?.["generation-v"]?.["black-white"]?.animated?.front_default;
      const official = j.sprites?.other?.["official-artwork"]?.front_default;
      const fallback = j.sprites?.front_default;
      const sprite = (speciesId <= 649 && animated) ? animated : (official || fallback || "");
      const cry = speciesId <= 1025 ? `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${speciesId}.ogg` : null;
      const sig = SPECIALS[speciesId];
      const kind = TYPE_KIND[primary];
      const atk = stats["attack"] ?? 60;
      const totalForSig = (stats["special-attack"] ?? 60) > atk ? (stats["special-attack"] ?? 60) : atk;
      const sigDmg = sig?.dmg ?? Math.round(14 + totalForSig * 0.18);
      const sigName = sig?.name ?? GENERIC_MOVES[primary][1];
      const sigKind = sig?.kind ?? kind;
      const basicDmg = Math.round(6 + atk * 0.08);
      const basicName = GENERIC_MOVES[primary][0];
      const name = titleCase(j.name as string);
      cached = {
        uid, id, speciesId, name, type: primary, color: TYPE_COLORS[primary] || "#fff",
        sprite, cry,
        baseHp: stats["hp"] ?? 60, baseAtk: atk, baseDef: stats["defense"] ?? 60, baseSpd: stats["speed"] ?? 60,
        signature: { name: sigName, kind: sigKind, dmg: sigDmg },
        basic: { name: basicName, kind, dmg: basicDmg },
        isMega: isMegaName(j.name), isGmax: isGmaxName(j.name),
      };
      POKE_CACHE.set(id, cached);
    } catch {
      return null;
    }
  }
  return { ...cached, uid };
}

// ============================================================
// Curated evolution lines (Random + Evolve mode)
// ============================================================
const EVO_LINES: number[][] = [
  [1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15], [16, 17, 18],
  [25, 26], [27, 28], [29, 30, 31], [32, 33, 34], [60, 61, 62], [63, 64, 65],
  [66, 67, 68], [74, 75, 76], [92, 93, 94], [147, 148, 149], [152, 153, 154],
  [155, 156, 157], [158, 159, 160], [246, 247, 248], [252, 253, 254], [255, 256, 257],
  [258, 259, 260], [387, 388, 389], [390, 391, 392], [393, 394, 395], [443, 444, 445],
  [495, 496, 497], [498, 499, 500], [501, 502, 503], [650, 651, 652], [653, 654, 655],
  [656, 657, 658], [722, 723, 724], [725, 726, 727], [728, 729, 730],
  [810, 811, 812], [813, 814, 815], [816, 817, 818], [906, 907, 908], [909, 910, 911], [912, 913, 914],
];

async function buildEvoLine(line: number[], uid: string): Promise<MonData | null> {
  const stages: MonData[] = [];
  for (const id of line) {
    const m = await fetchMon(id, `${uid}-${id}`);
    if (!m) return null;
    stages.push(m);
  }
  // Link forward
  for (let i = stages.length - 2; i >= 0; i--) stages[i].evolveTo = stages[i + 1];
  return stages[0];
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
// Coins
// ============================================================
function readCoins(): number {
  if (typeof window === "undefined") return 100;
  const v = localStorage.getItem("ppb-coins");
  if (v === null) return 100;
  const n = Number(v); return Number.isFinite(n) ? n : 100;
}
function writeCoins(n: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem("ppb-coins", String(Math.max(0, Math.round(n))));
}

// ============================================================
// Component
// ============================================================
function Game() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [mode, setMode] = useState<Mode>("ffa");
  const [battleSize, setBattleSize] = useState(5);
  const [rosterMode, setRosterMode] = useState<"random" | "custom">("random");
  const [picked, setPicked] = useState<MonData[]>([]); // for custom mode
  const [betAmount, setBetAmount] = useState(10);
  const [betTarget, setBetTarget] = useState<string | null>(null); // uid (FFA) or "team-0"/"team-1"
  const [coins, setCoins] = useState<number>(100);
  const [soundOn, setSoundOn] = useState(true);
  const [volume] = useState(0.4);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setCoins(readCoins()); }, []);
  useEffect(() => { writeCoins(coins); }, [coins]);

  // Battle state
  const monsRef = useRef<MonState[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const popsRef = useRef<Pop[]>([]);
  const idRef = useRef(1);
  const [, force] = useState(0);
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

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);

  const pushLog = (text: string, color: string) => {
    setLog((l) => [{ id: idRef.current++, text, color }, ...l].slice(0, 14));
  };

  // ============ Combat loop ============
  useEffect(() => {
    if (screen !== "battle") return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (runningRef.current && status === "fighting") step(dt, now);
      force((n) => (n + 1) % 1_000_000);
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
      setCoins((c) => Math.max(0, c - bet.amount));
      setPayout(-bet.amount);
      pushLog(`💸 You lost ${bet.amount} coins on your bet.`, "#ff7777");
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
        setWinnerIdx(null);
        setStatus("ended");
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
      setWinnerIdx(w);
      setWinnerTeam(null);
      setStatus("ended");
      if (w !== null) {
        pushLog(`${mons[w].data.name} WINS!`, mons[w].data.color);
        settleBet(mons[w].data.uid);
      } else { pushLog("Draw!", "var(--color-muted-foreground)"); settleBet(null); }
    }
  };

  const step = (dt: number, now: number) => {
    const mons = monsRef.current;
    mons.forEach((m, i) => {
      if (m.hp <= 0) return;
      const d = m.data;

      // Evolution (only in random mode where evolveTo is set)
      m.evolveTimer += dt * 1000;
      if (d.evolveTo && m.evolveTimer >= EVOLVE_INTERVAL) {
        const next = d.evolveTo;
        const oldName = d.name;
        m.data = { ...next, uid: d.uid };
        m.evolveTimer = 0;
        m.evolveFlashUntil = now + EVOLVE_FLASH_MS;
        // scale HP up a bit on evolve
        const newMax = Math.round(60 + next.baseHp * 1.0);
        const ratio = m.hp / m.maxHp;
        m.maxHp = newMax;
        m.hp = Math.min(newMax, Math.max(20, Math.round(newMax * ratio + 30)));
        pushLog(`${oldName} evolved into ${next.name}!`, next.color);
        if (soundRef.current) playSound(next.cry, volume);
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

      // Avoidance
      mons.forEach((o, j) => {
        if (i === j || o.hp <= 0) return;
        const ox = m.pos.x - o.pos.x, oy = m.pos.y - o.pos.y;
        const od = Math.hypot(ox, oy) || 1;
        if (od < MON_R * 2.4) { m.vel.x += (ox / od) * 80; m.vel.y += (oy / od) * 80; }
      });

      m.pos.x = Math.max(MON_R, Math.min(ARENA_W - MON_R, m.pos.x + m.vel.x * dt));
      m.pos.y = Math.max(MON_R, Math.min(ARENA_H - MON_R, m.pos.y + m.vel.y * dt));

      // Basic attack — cooldown scaled by speed (faster = shorter)
      const atkCd = Math.max(500, ABILITY_COOLDOWN_BASE * (80 / Math.max(20, d.baseSpd)));
      if (now - m.lastAttack >= atkCd && dist <= ATTACK_RANGE + 60) {
        m.lastAttack = now;
        m.attackFlash = now + 300;
        const crit = Math.random() < 0.18;
        const eff = typeMult(d.type, t.data.type);
        const atkMul = 0.8 + d.baseAtk / 130;
        const defReduction = 1 - Math.min(0.6, t.data.baseDef / 320);
        const dmg = Math.max(1, Math.round(d.basic.dmg * atkMul * (crit ? 1.6 : 1) * eff * defReduction * (0.85 + Math.random() * 0.3)));
        const ang = Math.atan2(t.pos.y - m.pos.y, t.pos.x - m.pos.x);
        projectilesRef.current.push({
          id: idRef.current++, fromIdx: i, targetIdx: tgt,
          from: { ...m.pos }, pos: { ...m.pos }, angle: ang,
          color: d.color, dmg, crit, kind: d.basic.kind, bornAt: now,
          duration: d.basic.kind === "lightning" ? 200 : 420,
        });
        pushLog(`${d.name} → ${t.data.name}: ${d.basic.name} ${crit ? "CRIT " : ""}${dmg}${effLabel(eff)}`, d.color);
      }

      // Signature
      if (now - m.lastSpecial >= SPECIAL_COOLDOWN_BASE && dist <= ATTACK_RANGE + 120) {
        m.lastSpecial = now;
        m.attackFlash = now + 400;
        const crit = Math.random() < 0.28;
        const eff = typeMult(d.signature.kind === d.basic.kind ? d.type : d.type, t.data.type);
        const atkMul = 0.9 + Math.max(d.baseAtk, d.baseAtk) / 110;
        const defReduction = 1 - Math.min(0.55, t.data.baseDef / 340);
        const dmg = Math.max(1, Math.round(d.signature.dmg * atkMul * (crit ? 1.8 : 1) * eff * defReduction * (0.9 + Math.random() * 0.2)));
        const ang = Math.atan2(t.pos.y - m.pos.y, t.pos.x - m.pos.x);
        projectilesRef.current.push({
          id: idRef.current++, fromIdx: i, targetIdx: tgt,
          from: { ...m.pos }, pos: { ...m.pos }, angle: ang,
          color: d.color, dmg, crit, kind: d.signature.kind, bornAt: now,
          duration: d.signature.kind === "lightning" ? 240 : 500,
        });
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
    if (killed) checkEnd();
  };

  // ============ Start battle ============
  const startBattle = async () => {
    setLoading(true);
    try {
      let roster: MonData[] = [];
      if (rosterMode === "random") {
        const lines = [...EVO_LINES];
        for (let i = lines.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [lines[i], lines[j]] = [lines[j], lines[i]];
        }
        const chosen = lines.slice(0, battleSize);
        const built = await Promise.all(chosen.map((ln, idx) => buildEvoLine(ln, `r${idx}`)));
        roster = built.filter((b): b is MonData => !!b);
      } else {
        roster = picked.slice(0, battleSize).map((m, i) => ({ ...m, uid: `c${i}-${m.id}` }));
      }

      if (roster.length < 2) {
        alert("Need at least 2 Pokémon to start a battle.");
        setLoading(false);
        return;
      }

      // Build mon states
      const mons: MonState[] = roster.map((d, i) => {
        let pos: Vec, team: number;
        if (mode === "teams") {
          team = i < roster.length / 2 ? 0 : 1;
          const teamIdx = team === 0 ? i : i - Math.ceil(roster.length / 2);
          const teamCount = team === 0 ? Math.ceil(roster.length / 2) : Math.floor(roster.length / 2);
          const x = team === 0 ? 120 : ARENA_W - 120;
          const y = 80 + ((ARENA_H - 160) * (teamIdx + 0.5)) / teamCount;
          pos = { x, y };
        } else {
          team = i;
          const a = (i / roster.length) * Math.PI * 2 + Math.random() * 0.4;
          pos = { x: ARENA_W / 2 + Math.cos(a) * 200, y: ARENA_H / 2 + Math.sin(a) * 180 };
        }
        const maxHp = Math.round(60 + d.baseHp * 1.0);
        return {
          pos, vel: { x: rand(-30, 30), y: rand(-30, 30) },
          hp: maxHp, maxHp, team, data: d,
          lastAttack: -rand(0, 1500),
          lastSpecial: -rand(0, SPECIAL_COOLDOWN_BASE),
          evolveTimer: 0, hitFlash: 0, attackFlash: 0, evolveFlashUntil: 0,
        };
      });

      monsRef.current = mons;
      projectilesRef.current = [];
      popsRef.current = [];

      // Validate bet target
      let resolvedTarget: string | null = null;
      if (betAmount > 0 && betAmount <= coins && betTarget) {
        if (mode === "teams" && (betTarget === "team-0" || betTarget === "team-1")) resolvedTarget = betTarget;
        else if (mode === "ffa" && mons.some((m) => m.data.uid === betTarget)) resolvedTarget = betTarget;
      }
      battleBet.current = resolvedTarget ? { amount: betAmount, target: resolvedTarget } : null;
      setPayout(0);

      setLog([{ id: idRef.current++, text: mode === "teams" ? "Team Battle! Wipe the other team." : `${roster.length}-way Free-for-All. Last one standing wins!`, color: "var(--color-muted-foreground)" }]);
      if (battleBet.current) pushLog(`You bet ${battleBet.current.amount} coins on ${resolveBetLabel(resolvedTarget!, mons)}.`, "#ffd83a");

      setStatus("fighting");
      setWinnerIdx(null);
      setWinnerTeam(null);
      setRunning(true);
      setScreen("battle");

      // Intro cries
      if (soundOn) {
        mons.slice(0, 3).forEach((m, i) => setTimeout(() => playSound(m.data.cry, volume * 0.5), i * 250));
      }
    } finally {
      setLoading(false);
    }
  };

  const resolveBetLabel = (target: string, mons: MonState[]) => {
    if (target.startsWith("team-")) return TEAM_NAMES[Number(target.slice(5))];
    const m = mons.find((mm) => mm.data.uid === target);
    return m ? m.data.name : target;
  };

  if (screen === "lobby") {
    return (
      <Lobby
        mode={mode} setMode={setMode}
        battleSize={battleSize} setBattleSize={setBattleSize}
        rosterMode={rosterMode} setRosterMode={setRosterMode}
        picked={picked} setPicked={setPicked}
        betAmount={betAmount} setBetAmount={setBetAmount}
        betTarget={betTarget} setBetTarget={setBetTarget}
        coins={coins} setCoins={setCoins}
        soundOn={soundOn} setSoundOn={setSoundOn}
        onStart={startBattle} loading={loading}
      />
    );
  }

  return (
    <Battle
      monsRef={monsRef} projectilesRef={projectilesRef} popsRef={popsRef}
      mode={mode} log={log} status={status} winnerIdx={winnerIdx} winnerTeam={winnerTeam}
      running={running} setRunning={setRunning}
      payout={payout} coins={coins}
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
  picked: MonData[]; setPicked: (p: MonData[]) => void;
  betAmount: number; setBetAmount: (n: number) => void;
  betTarget: string | null; setBetTarget: (t: string | null) => void;
  coins: number; setCoins: (n: number) => void;
  soundOn: boolean; setSoundOn: (s: boolean) => void;
  onStart: () => void; loading: boolean;
}) {
  const { mode, setMode, battleSize, setBattleSize, rosterMode, setRosterMode,
    picked, setPicked, betAmount, setBetAmount, betTarget, setBetTarget,
    coins, soundOn, setSoundOn, onStart, loading } = props;

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [showOnly, setShowOnly] = useState<"all" | "mega" | "gmax" | "regional">("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return catalog.filter((c) => {
      if (showOnly === "mega" && !isMegaName(c.name)) return false;
      if (showOnly === "gmax" && !isGmaxName(c.name)) return false;
      if (showOnly === "regional" && !/-(alola|galar|hisui|paldea)/.test(c.name)) return false;
      if (!s) return true;
      return c.name.includes(s) || c.display.toLowerCase().includes(s);
    }).slice(0, 200);
  }, [catalog, search, showOnly]);

  const addPick = async (entry: CatalogEntry) => {
    if (picked.length >= battleSize) return;
    setBusyId(entry.id);
    const m = await fetchMon(entry.id, `pick-${entry.id}-${Date.now()}`);
    setBusyId(null);
    if (m) setPicked([...picked, m]);
  };
  const removePick = (uid: string) => setPicked(picked.filter((p) => p.uid !== uid));

  const canBet = betAmount > 0 && betAmount <= coins && betTarget !== null;
  const canStart = rosterMode === "random" ? battleSize >= 2 : picked.length >= 2;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-3 p-3 sm:p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[10px] tracking-wider text-primary sm:text-sm">PIXEL POCKET BRAWL</h1>
          <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">All 1025 Pokémon · Mega · Gigantamax · Stats matter · Bet to earn coins</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded border-2 border-border bg-panel px-3 py-2 text-[9px] sm:text-[11px]">
            <span className="text-muted-foreground">COINS </span>
            <span className="text-primary">{coins}</span>
          </div>
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
              <input type="range" min={2} max={8} value={battleSize} onChange={(e) => setBattleSize(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <p className="mb-1 text-muted-foreground">Roster</p>
              <div className="flex gap-2">
                <button onClick={() => setRosterMode("random")} className={`flex-1 rounded border-2 border-border px-2 py-2 ${rosterMode === "random" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Random + Evolve</button>
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
              ) : rosterMode === "custom" ? (
                picked.length === 0 ? <p className="text-muted-foreground">Pick fighters below to bet on one.</p> : (
                  <div className="flex flex-wrap gap-1">
                    {picked.map((m) => (
                      <button key={m.uid} onClick={() => setBetTarget(m.uid)}
                        className="rounded border-2 px-2 py-1"
                        style={{ borderColor: betTarget === m.uid ? m.color : "var(--color-border)", background: betTarget === m.uid ? m.color : "var(--color-muted)", color: betTarget === m.uid ? "#000" : "inherit" }}>
                        {m.name}
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <p className="text-muted-foreground">In Random + FFA you can't pre-bet on a specific mon. Switch to Pick Your Own or Teams mode.</p>
              )}
            </div>
            <p className="text-[7px] text-muted-foreground sm:text-[9px]">Win: bet × {mode === "teams" ? 2 : Math.max(2, battleSize)}. Lose: lose your bet.</p>
          </div>
        </div>
      </section>

      {/* Custom picker */}
      {rosterMode === "custom" && (
        <section className="rounded border-2 border-border bg-panel p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[9px] text-primary sm:text-[11px]">PICK YOUR FIGHTERS ({picked.length}/{battleSize})</p>
            <div className="flex gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search..."
                className="rounded border-2 border-border bg-background px-2 py-1 text-[8px] sm:text-[10px]" />
              <select value={showOnly} onChange={(e) => setShowOnly(e.target.value as "all" | "mega" | "gmax" | "regional")}
                className="rounded border-2 border-border bg-background px-2 py-1 text-[8px] sm:text-[10px]">
                <option value="all">All</option>
                <option value="mega">Mega only</option>
                <option value="gmax">Gigantamax only</option>
                <option value="regional">Regional forms</option>
              </select>
            </div>
          </div>

          {picked.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 rounded border border-border bg-background/40 p-2">
              {picked.map((m) => (
                <div key={m.uid} className="flex items-center gap-2 rounded border-2 px-2 py-1 text-[8px] sm:text-[10px]" style={{ borderColor: m.color }}>
                  <img src={m.sprite} alt={m.name} className="h-7 w-7" style={{ imageRendering: "pixelated", objectFit: "contain" }} />
                  <span style={{ color: m.color }}>{m.name}</span>
                  <span className="text-muted-foreground">{m.type}</span>
                  <button onClick={() => removePick(m.uid)} className="ml-1 text-red-400">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="grid max-h-72 grid-cols-3 gap-1 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8">
            {catalog.length === 0 ? (
              <p className="col-span-full text-center text-[8px] text-muted-foreground">Loading Pokédex…</p>
            ) : filtered.map((c) => {
              const isPicked = picked.some((p) => p.id === c.id);
              const full = picked.length >= battleSize;
              return (
                <button key={c.id} disabled={isPicked || full || busyId === c.id}
                  onClick={() => addPick(c)}
                  className="flex flex-col items-center rounded border-2 border-border bg-muted p-1 text-[7px] hover:brightness-125 disabled:opacity-40 sm:text-[8px]"
                  title={c.display}>
                  <img src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${c.id}.png`} alt={c.display}
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
          {rosterMode === "random" ? "Random rosters evolve every 15s during battle." : `Pick ${battleSize} Pokémon to start.`}
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
// Battle screen
// ============================================================
function Battle(props: {
  monsRef: React.MutableRefObject<MonState[]>;
  projectilesRef: React.MutableRefObject<Projectile[]>;
  popsRef: React.MutableRefObject<Pop[]>;
  mode: Mode; log: LogEntry[];
  status: "fighting" | "ended"; winnerIdx: number | null; winnerTeam: number | null;
  running: boolean; setRunning: (b: boolean) => void;
  payout: number; coins: number;
  backToLobby: () => void;
}) {
  const { monsRef, projectilesRef, popsRef, mode, log, status, winnerIdx, winnerTeam, running, setRunning, payout, coins, backToLobby } = props;
  const mons = monsRef.current;
  const now = performance.now();

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-3 p-3 sm:p-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[10px] tracking-wider text-primary sm:text-sm">BATTLE</h1>
          <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">
            {mode === "teams" ? "Team Battle" : `${mons.length}-way FFA`} · COINS {coins}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRunning(!running)} className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] sm:text-[10px]">
            {running ? "Pause" : "Resume"}
          </button>
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
            </div>
          );
        })}
      </div>

      <div className="arena-wrap relative w-full overflow-hidden rounded-xl border-4 border-border" style={{ aspectRatio: `${ARENA_W} / ${ARENA_H}` }}>
        <div className="arena-grass absolute inset-0" />
        <div className="relative h-full w-full">
          <svg viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
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
            const size = d.isMega ? 78 : d.isGmax ? 92 : 64;
            const evolving = m.evolveFlashUntil && now < m.evolveFlashUntil;
            return (
              <div key={d.uid} className="absolute flex flex-col items-center anim-float"
                style={{
                  left: `${(m.pos.x / ARENA_W) * 100}%`,
                  top: `${(m.pos.y / ARENA_H) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: size, opacity: fainted ? 0.2 : 1,
                  filter: m.hitFlash ? "brightness(2.4) saturate(0)"
                    : evolving ? "drop-shadow(0 0 18px #fff8b0) drop-shadow(0 0 8px #ffe066) brightness(1.5) saturate(1.4)"
                    : `drop-shadow(0 0 6px ${d.color})`,
                  transition: "filter 120ms",
                }}>
                <img src={d.sprite} alt={d.name} className={evolving ? "anim-evolve-spin" : ""}
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
      <circle cx={-10} cy={-4} r={2} fill="#bfe6ff" opacity={0.7} /><circle cx={-14} cy={3} r={1.5} fill="#bfe6ff" opacity={0.6} />
    </g>);
    case "leaf": return (<g transform={`translate(${x} ${y}) rotate(${(now / 4) % 360})`}>
      <path d="M -10 0 Q 0 -10 10 0 Q 0 10 -10 0 Z" fill="#6bd36b" stroke="#2c6b2c" strokeWidth={1.2} />
      <line x1={-8} y1={0} x2={8} y2={0} stroke="#2c6b2c" strokeWidth={0.8} />
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
      {[0, 60, 120, 180, 240, 300].map((a) => { const rad = (a * Math.PI) / 180 + now / 200; return <circle key={a} cx={Math.cos(rad) * 10} cy={Math.sin(rad) * 10} r={1.6} fill="#fff" />; })}
    </g>);
    case "rock": return (<g transform={`translate(${x} ${y}) rotate(${(now / 3) % 360})`}>
      <polygon points="-9,-5 -3,-9 7,-6 9,2 4,9 -6,7 -10,1" fill="#8a7a55" stroke="#3d3520" strokeWidth={1.2} />
      <polygon points="-4,-2 -1,-4 3,-2 2,2 -3,2" fill="#b89a6c" />
    </g>);
    case "iceshard": return (<g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <polygon points="-12,-3 8,0 -12,3" fill="#bfe9ff" stroke="#4ea8ff" strokeWidth={1.2} />
      <polygon points="-6,-2 4,0 -6,2" fill="#fff" /><circle cx={-12} r={2} fill="#bfe9ff" opacity={0.6} />
    </g>);
    case "shadowball": return (<g transform={`translate(${x} ${y})`}>
      <circle r={11} fill="#5a2d8a" opacity={0.5} /><circle r={8} fill="#9d6bff" /><circle r={4} fill="#2a1043" />
      <circle cx={2} cy={-2} r={1.5} fill="#fff" opacity={0.6} />
    </g>);
    case "dragonpulse": return (<g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <ellipse rx={14} ry={6} fill="#a366ff" opacity={0.5} /><ellipse rx={9} ry={4} fill="#f0b84a" /><circle cx={4} r={2} fill="#fff" />
    </g>);
    case "punch": return (<g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <circle r={9} fill="#ffd9b0" stroke="#6b3a18" strokeWidth={1.5} />
      <path d="M -3 -3 L 4 -3 M -3 0 L 4 0 M -3 3 L 4 3" stroke="#6b3a18" strokeWidth={1} fill="none" />
      <line x1={-15} y1={0} x2={-8} y2={0} stroke="#fff" strokeWidth={2} />
    </g>);
    case "bugbuzz": return (<g transform={`translate(${x} ${y})`}>
      {[0, 120, 240].map((a) => { const rad = (a * Math.PI) / 180 + now / 80; return <ellipse key={a} cx={Math.cos(rad) * 6} cy={Math.sin(rad) * 6} rx={5} ry={2} fill="#a4d850" opacity={0.7} transform={`rotate(${(rad * 180) / Math.PI} ${Math.cos(rad) * 6} ${Math.sin(rad) * 6})`} />; })}
      <circle r={4} fill="#5a8a20" />
    </g>);
    case "fairywind": return (<g transform={`translate(${x} ${y})`}>
      <circle r={10} fill="#ffb6e0" opacity={0.4} />
      {[0, 72, 144, 216, 288].map((a) => { const rad = (a * Math.PI) / 180 + now / 150; return <path key={a} d={`M 0 0 L ${Math.cos(rad) * 8} ${Math.sin(rad) * 8}`} stroke="#fff" strokeWidth={1.4} />; })}
      <circle r={3} fill="#fff" />
    </g>);
  }
}
