import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pixel Pocket Brawl — Random 5-Way FFA" },
      { name: "description", content: "Top-down 1v1v1v1v1 pixel auto-battler with random rosters and custom attack effects per creature." },
    ],
  }),
  component: Game,
});

type ElementType = "fire" | "water" | "grass" | "electric" | "psychic" | "rock" | "ice" | "ghost" | "dragon" | "fighting" | "bug" | "fairy";
type AttackKind = "fireball" | "waterjet" | "leaf" | "lightning" | "psybeam" | "rock" | "iceshard" | "shadowball" | "dragonpulse" | "punch" | "bugbuzz" | "fairywind";

const SPRITE = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`;

type StageData = { name: string; id: number; ability: string; dmg: number; kind: AttackKind };
type Line = { key: string; type: ElementType; color: string; stages: [StageData, StageData, StageData] };

// Pool of evolution lines (Gen 1–5 mons with 3-stage families, plus a couple of 2-stage padded with mid).
const POOL: Line[] = [
  { key: "charizard", type: "fire", color: "#ff7a3d", stages: [
    { name: "Charmander", id: 4, ability: "Ember", dmg: 9, kind: "fireball" },
    { name: "Charmeleon", id: 5, ability: "Flamethrower", dmg: 18, kind: "fireball" },
    { name: "Charizard", id: 6, ability: "Blast Burn", dmg: 34, kind: "fireball" },
  ]},
  { key: "blastoise", type: "water", color: "#4ea8ff", stages: [
    { name: "Squirtle", id: 7, ability: "Water Gun", dmg: 8, kind: "waterjet" },
    { name: "Wartortle", id: 8, ability: "Hydro Pump", dmg: 18, kind: "waterjet" },
    { name: "Blastoise", id: 9, ability: "Tidal Cannon", dmg: 33, kind: "waterjet" },
  ]},
  { key: "venusaur", type: "grass", color: "#6bd36b", stages: [
    { name: "Bulbasaur", id: 1, ability: "Vine Whip", dmg: 8, kind: "leaf" },
    { name: "Ivysaur", id: 2, ability: "Razor Leaf", dmg: 17, kind: "leaf" },
    { name: "Venusaur", id: 3, ability: "Solar Beam", dmg: 32, kind: "leaf" },
  ]},
  { key: "raichu", type: "electric", color: "#ffd83a", stages: [
    { name: "Pichu", id: 172, ability: "Spark", dmg: 10, kind: "lightning" },
    { name: "Pikachu", id: 25, ability: "Thunderbolt", dmg: 19, kind: "lightning" },
    { name: "Raichu", id: 26, ability: "Thunder", dmg: 35, kind: "lightning" },
  ]},
  { key: "alakazam", type: "psychic", color: "#d976ff", stages: [
    { name: "Abra", id: 63, ability: "Confusion", dmg: 8, kind: "psybeam" },
    { name: "Kadabra", id: 64, ability: "Psybeam", dmg: 17, kind: "psybeam" },
    { name: "Alakazam", id: 65, ability: "Psychic", dmg: 33, kind: "psybeam" },
  ]},
  { key: "golem", type: "rock", color: "#c4a76a", stages: [
    { name: "Geodude", id: 74, ability: "Rock Throw", dmg: 9, kind: "rock" },
    { name: "Graveler", id: 75, ability: "Rock Slide", dmg: 18, kind: "rock" },
    { name: "Golem", id: 76, ability: "Stone Edge", dmg: 33, kind: "rock" },
  ]},
  { key: "machamp", type: "fighting", color: "#e88a4f", stages: [
    { name: "Machop", id: 66, ability: "Karate Chop", dmg: 9, kind: "punch" },
    { name: "Machoke", id: 67, ability: "Cross Chop", dmg: 18, kind: "punch" },
    { name: "Machamp", id: 68, ability: "Dynamic Punch", dmg: 34, kind: "punch" },
  ]},
  { key: "gengar", type: "ghost", color: "#9d6bff", stages: [
    { name: "Gastly", id: 92, ability: "Lick", dmg: 8, kind: "shadowball" },
    { name: "Haunter", id: 93, ability: "Shadow Punch", dmg: 18, kind: "shadowball" },
    { name: "Gengar", id: 94, ability: "Shadow Ball", dmg: 33, kind: "shadowball" },
  ]},
  { key: "dragonite", type: "dragon", color: "#f0b84a", stages: [
    { name: "Dratini", id: 147, ability: "Twister", dmg: 9, kind: "dragonpulse" },
    { name: "Dragonair", id: 148, ability: "Dragon Breath", dmg: 18, kind: "dragonpulse" },
    { name: "Dragonite", id: 149, ability: "Hyper Beam", dmg: 35, kind: "dragonpulse" },
  ]},
  { key: "butterfree", type: "bug", color: "#a4d850", stages: [
    { name: "Caterpie", id: 10, ability: "Tackle", dmg: 7, kind: "bugbuzz" },
    { name: "Metapod", id: 11, ability: "Harden", dmg: 14, kind: "bugbuzz" },
    { name: "Butterfree", id: 12, ability: "Bug Buzz", dmg: 31, kind: "bugbuzz" },
  ]},
  { key: "lapras", type: "ice", color: "#7dd6ff", stages: [
    { name: "Seel", id: 86, ability: "Icy Wind", dmg: 9, kind: "iceshard" },
    { name: "Dewgong", id: 87, ability: "Ice Beam", dmg: 18, kind: "iceshard" },
    { name: "Lapras", id: 131, ability: "Blizzard", dmg: 34, kind: "iceshard" },
  ]},
  { key: "togekiss", type: "fairy", color: "#ffb6e0", stages: [
    { name: "Togepi", id: 175, ability: "Pound", dmg: 8, kind: "fairywind" },
    { name: "Togetic", id: 176, ability: "Fairy Wind", dmg: 17, kind: "fairywind" },
    { name: "Togekiss", id: 468, ability: "Dazzling Gleam", dmg: 33, kind: "fairywind" },
  ]},
  { key: "scizor", type: "bug", color: "#ff7a4f", stages: [
    { name: "Scyther", id: 123, ability: "Fury Cutter", dmg: 10, kind: "bugbuzz" },
    { name: "Scyther+", id: 123, ability: "Slash", dmg: 19, kind: "bugbuzz" },
    { name: "Scizor", id: 212, ability: "X-Scissor", dmg: 34, kind: "bugbuzz" },
  ]},
  { key: "tyranitar", type: "rock", color: "#88a070", stages: [
    { name: "Larvitar", id: 246, ability: "Bite", dmg: 9, kind: "rock" },
    { name: "Pupitar", id: 247, ability: "Crunch", dmg: 19, kind: "rock" },
    { name: "Tyranitar", id: 248, ability: "Stone Edge", dmg: 36, kind: "rock" },
  ]},
  { key: "garchomp", type: "dragon", color: "#5fb3d0", stages: [
    { name: "Gible", id: 443, ability: "Dragon Rage", dmg: 10, kind: "dragonpulse" },
    { name: "Gabite", id: 444, ability: "Dragon Claw", dmg: 19, kind: "dragonpulse" },
    { name: "Garchomp", id: 445, ability: "Outrage", dmg: 36, kind: "dragonpulse" },
  ]},
];

const MON_MAX_HP = 120;
const ABILITY_COOLDOWN = 5000;
const EVOLVE_INTERVAL = 15000;
const EVOLVE_FLASH_MS = 1400;
const ARENA_W = 800;
const ARENA_H = 540;
const MON_R = 26;
const ATTACK_RANGE = 260;
const TEAM_SIZE = 5;

type Vec = { x: number; y: number };
type MonState = {
  pos: Vec; vel: Vec; hp: number; stage: number;
  lastAttack: number; evolveTimer: number;
  hitFlash: number; attackFlash: number; evolveFlashUntil: number;
};
type Projectile = {
  id: number; fromIdx: number; targetIdx: number;
  from: Vec; pos: Vec; angle: number;
  color: string; dmg: number; crit: boolean; kind: AttackKind;
  bornAt: number; duration: number;
};
type Pop = { id: number; x: number; y: number; value: number; crit: boolean; bornAt: number; color: string };
type LogEntry = { id: number; text: string; color: string };

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }

// Type effectiveness chart: TYPE_CHART[attacker][defender] = multiplier
const TYPE_CHART: Record<ElementType, Partial<Record<ElementType, number>>> = {
  fire:     { grass: 2, ice: 2, bug: 2, water: 0.5, fire: 0.5, rock: 0.5, dragon: 0.5 },
  water:    { fire: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
  grass:    { water: 2, rock: 2, fire: 0.5, grass: 0.5, bug: 0.5, dragon: 0.5, fighting: 0.5, electric: 0.5, ice: 0.5, ghost: 1, psychic: 1, fairy: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, dragon: 0.5 },
  psychic:  { fighting: 2, psychic: 0.5 },
  rock:     { fire: 2, ice: 2, bug: 2, fighting: 0.5 },
  ice:      { grass: 2, dragon: 2, fire: 0.5, water: 0.5, ice: 0.5 },
  ghost:    { ghost: 2, psychic: 2 },
  dragon:   { dragon: 2, fairy: 0.5 },
  fighting: { rock: 2, ice: 2, bug: 0.5, psychic: 0.5, fairy: 0.5, ghost: 0 },
  bug:      { grass: 2, psychic: 2, fire: 0.5, fighting: 0.5, fairy: 0.5, ghost: 0.5 },
  fairy:    { fighting: 2, dragon: 2, fire: 0.5, bug: 1 },
};
function typeMult(att: ElementType, def: ElementType): number {
  return TYPE_CHART[att]?.[def] ?? 1;
}
function effLabel(m: number): string {
  if (m === 0) return " (no effect)";
  if (m >= 2) return " — super effective!";
  if (m <= 0.5) return " — not very effective";
  return "";
}

function pickRoster(): Line[] {
  const idx = [...POOL.keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, TEAM_SIZE).map((i) => POOL[i]);
}

function initialMons(roster: Line[]): MonState[] {
  return roster.map((_, i) => {
    const a = (i / roster.length) * Math.PI * 2 + Math.random() * 0.4;
    return {
      pos: { x: ARENA_W / 2 + Math.cos(a) * 200, y: ARENA_H / 2 + Math.sin(a) * 180 },
      vel: { x: rand(-30, 30), y: rand(-30, 30) },
      hp: MON_MAX_HP, stage: 0,
      lastAttack: -rand(0, ABILITY_COOLDOWN),
      evolveTimer: 0, hitFlash: 0, attackFlash: 0, evolveFlashUntil: 0,
    };
  });
}

function Game() {
  const [roster, setRoster] = useState<Line[]>(() => pickRoster());
  const rosterRef = useRef(roster);
  useEffect(() => { rosterRef.current = roster; }, [roster]);

  const monsRef = useRef<MonState[]>(initialMons(roster));
  const projectilesRef = useRef<Projectile[]>([]);
  const popsRef = useRef<Pop[]>([]);
  const idRef = useRef(1);
  const [, force] = useState(0);
  const [running, setRunning] = useState(true);
  const runningRef = useRef(true);
  const [log, setLog] = useState<LogEntry[]>([
    { id: 0, text: "Free-for-all! Last creature standing wins!", color: "var(--color-muted-foreground)" },
  ]);
  const [winnerIdx, setWinnerIdx] = useState<number | null>(null);
  const [status, setStatus] = useState<"fighting" | "ended">("fighting");

  useEffect(() => { runningRef.current = running; }, [running]);

  const pushLog = (text: string, color: string) => {
    setLog((l) => [{ id: idRef.current++, text, color }, ...l].slice(0, 14));
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (runningRef.current && status === "fighting") step(dt, now);
      force((n) => (n + 1) % 1000000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const nearestEnemy = (i: number): number | null => {
    const mons = monsRef.current;
    let best = -1; let bd = Infinity;
    for (let j = 0; j < mons.length; j++) {
      if (j === i || mons[j].hp <= 0) continue;
      const d = Math.hypot(mons[j].pos.x - mons[i].pos.x, mons[j].pos.y - mons[i].pos.y);
      if (d < bd) { bd = d; best = j; }
    }
    return best === -1 ? null : best;
  };

  const checkEnd = () => {
    const mons = monsRef.current;
    const alive = mons.map((m, i) => (m.hp > 0 ? i : -1)).filter((i) => i >= 0);
    if (alive.length <= 1) {
      const w = alive[0] ?? null;
      setWinnerIdx(w);
      setStatus("ended");
      if (w !== null) pushLog(`${rosterRef.current[w].stages[mons[w].stage].name} WINS!`, rosterRef.current[w].color);
      else pushLog("Draw! Nobody survived.", "var(--color-muted-foreground)");
    }
  };

  const step = (dt: number, now: number) => {
    const mons = monsRef.current;
    const r = rosterRef.current;

    mons.forEach((m, i) => {
      if (m.hp <= 0) return;
      const data = r[i].stages[m.stage];

      m.evolveTimer += dt * 1000;
      if (m.evolveTimer >= EVOLVE_INTERVAL && m.stage < 2) {
        m.stage += 1;
        m.evolveTimer = 0;
        m.evolveFlashUntil = now + EVOLVE_FLASH_MS;
        pushLog(`${r[i].stages[m.stage - 1].name} evolved into ${r[i].stages[m.stage].name}!`, r[i].color);
      }

      const tgt = nearestEnemy(i);
      if (tgt === null) return;
      const t = mons[tgt];
      const dx = t.pos.x - m.pos.x;
      const dy = t.pos.y - m.pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      const desired = ATTACK_RANGE * 0.7;
      const seek = (dist - desired) * 0.7;
      const tangent = { x: -dy / dist, y: dx / dist };
      const speed = 70 + m.stage * 18;
      m.vel.x = (dx / dist) * seek + tangent.x * speed * 0.6 + rand(-10, 10);
      m.vel.y = (dy / dist) * seek + tangent.y * speed * 0.6 + rand(-10, 10);

      mons.forEach((o, j) => {
        if (i === j || o.hp <= 0) return;
        const ox = m.pos.x - o.pos.x;
        const oy = m.pos.y - o.pos.y;
        const od = Math.hypot(ox, oy) || 1;
        if (od < MON_R * 2.4) {
          m.vel.x += (ox / od) * 80;
          m.vel.y += (oy / od) * 80;
        }
      });

      m.pos.x += m.vel.x * dt;
      m.pos.y += m.vel.y * dt;
      m.pos.x = Math.max(MON_R, Math.min(ARENA_W - MON_R, m.pos.x));
      m.pos.y = Math.max(MON_R, Math.min(ARENA_H - MON_R, m.pos.y));

      if (now - m.lastAttack >= ABILITY_COOLDOWN && dist <= ATTACK_RANGE + 80) {
        m.lastAttack = now;
        m.attackFlash = now + 300;
        const crit = Math.random() < 0.2;
        const dmg = Math.round(data.dmg * (crit ? 1.7 : 1) * (0.85 + Math.random() * 0.3));
        const ang = Math.atan2(t.pos.y - m.pos.y, t.pos.x - m.pos.x);
        projectilesRef.current.push({
          id: idRef.current++,
          fromIdx: i, targetIdx: tgt,
          from: { ...m.pos }, pos: { ...m.pos }, angle: ang,
          color: r[i].color, dmg, crit, kind: data.kind,
          bornAt: now, duration: data.kind === "lightning" ? 200 : 420,
        });
        pushLog(`${data.name} → ${r[tgt].stages[t.stage].name}: ${data.ability} ${crit ? "CRIT " : ""}${dmg}`, r[i].color);
      }

      if (m.hitFlash && now > m.hitFlash) m.hitFlash = 0;
      if (m.attackFlash && now > m.attackFlash) m.attackFlash = 0;
    });

    const remaining: Projectile[] = [];
    let killed = false;
    for (const p of projectilesRef.current) {
      const t = (now - p.bornAt) / p.duration;
      const tgt = monsRef.current[p.targetIdx];
      if (t >= 1) {
        if (tgt && tgt.hp > 0) {
          tgt.hp = Math.max(0, tgt.hp - p.dmg);
          tgt.hitFlash = now + 250;
          popsRef.current.push({ id: idRef.current++, x: tgt.pos.x, y: tgt.pos.y - 28, value: p.dmg, crit: p.crit, bornAt: now, color: p.crit ? "#ffd83a" : "#ff5566" });
          if (tgt.hp === 0) {
            pushLog(`${rosterRef.current[p.targetIdx].stages[tgt.stage].name} was knocked out!`, "var(--color-muted-foreground)");
            killed = true;
          }
        }
      } else {
        const cur = tgt && tgt.hp > 0 ? tgt.pos : p.from;
        const e = t * t * (3 - 2 * t);
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

  const reset = () => {
    const nr = pickRoster();
    setRoster(nr);
    rosterRef.current = nr;
    monsRef.current = initialMons(nr);
    projectilesRef.current = [];
    popsRef.current = [];
    setLog([{ id: idRef.current++, text: "New random battle! Last creature standing wins!", color: "var(--color-muted-foreground)" }]);
    setStatus("fighting");
    setWinnerIdx(null);
    setRunning(true);
  };

  const mons = monsRef.current;
  const now = performance.now();

  const minEvolveIn = useMemo(() => {
    const cands = mons.filter((m) => m.hp > 0 && m.stage < 2).map((m) => EVOLVE_INTERVAL - m.evolveTimer);
    return cands.length ? Math.max(0, Math.ceil(Math.min(...cands) / 1000)) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-3 p-3 sm:p-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[10px] tracking-wider text-primary sm:text-sm">PIXEL POCKET BRAWL</h1>
          <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">
            Random 5-Way · Custom Attacks · Evolve every 15s
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRunning((r) => !r)} className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] hover:brightness-125 sm:text-[10px]">
            {running ? "Pause" : "Resume"}
          </button>
          <button onClick={reset} className="rounded border-2 border-border bg-accent px-3 py-2 text-[8px] text-primary-foreground hover:brightness-110 sm:text-[10px]">
            New Battle
          </button>
        </div>
      </header>

      <div className="grid grid-cols-5 gap-2">
        {roster.map((r, i) => {
          const m = mons[i];
          const data = r.stages[m.stage];
          const dead = m.hp <= 0;
          return (
            <div key={r.key + i} className="rounded border-2 border-border bg-panel p-2 text-center" style={{ boxShadow: `inset 0 -3px 0 ${r.color}`, opacity: dead ? 0.45 : 1 }}>
              <p className="text-[7px] sm:text-[9px]" style={{ color: r.color }}>{dead ? "K.O." : `${data.name} L${m.stage + 1}`}</p>
              <p className="text-[6px] text-muted-foreground sm:text-[8px]">{data.ability}</p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded border border-border bg-background">
                <div className="h-full transition-[width] duration-200" style={{ width: `${(m.hp / MON_MAX_HP) * 100}%`, background: m.hp > MON_MAX_HP * 0.4 ? "var(--color-hp)" : "var(--color-hp-low)" }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded border-2 border-border bg-panel px-3 py-2 text-[7px] sm:text-[9px]">
        <span className="text-primary">ALIVE: {mons.filter((m) => m.hp > 0).length} / {roster.length}</span>
        <span className="text-muted-foreground">Next evolution in {minEvolveIn}s</span>
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

            {/* evolution flash */}
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

            {/* projectiles */}
            {projectilesRef.current.map((p) => <Projectile key={p.id} p={p} now={now} />)}

            {mons.map((m, i) => m.attackFlash ? (
              <circle key={`r${i}`} cx={m.pos.x} cy={m.pos.y} r={MON_R + 10} fill="none" stroke={roster[i].color} strokeWidth={2} opacity={0.7} />
            ) : null)}
          </svg>

          {mons.map((m, i) => {
            const data = roster[i].stages[m.stage];
            const fainted = m.hp <= 0;
            const size = 58 + m.stage * 12;
            const evolving = m.evolveFlashUntil && now < m.evolveFlashUntil;
            return (
              <div key={roster[i].key + i} className="absolute flex flex-col items-center"
                style={{
                  left: `${(m.pos.x / ARENA_W) * 100}%`,
                  top: `${(m.pos.y / ARENA_H) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: size,
                  opacity: fainted ? 0.2 : 1,
                  filter: m.hitFlash ? "brightness(2.4) saturate(0)"
                    : evolving ? "drop-shadow(0 0 18px #fff8b0) drop-shadow(0 0 8px #ffe066) brightness(1.5) saturate(1.4)"
                    : `drop-shadow(0 0 6px ${roster[i].color})`,
                  transition: "filter 120ms",
                }}>
                <img src={SPRITE(data.id)} alt={data.name} className={evolving ? "anim-evolve-spin" : ""}
                  style={{ width: size, height: size, imageRendering: "pixelated", objectFit: "contain" }} />
                {!fainted && (
                  <>
                    <span className="mt-0.5 rounded bg-black/70 px-1 text-[7px]" style={{ color: roster[i].color }}>{data.name} L{m.stage + 1}</span>
                    <div className="mt-0.5 h-1 w-14 overflow-hidden rounded bg-black/60">
                      <div className="h-full" style={{ width: `${(m.hp / MON_MAX_HP) * 100}%`, background: m.hp > MON_MAX_HP * 0.4 ? "#62e07a" : "#ff5566" }} />
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
              {winnerIdx !== null ? (
                <>
                  <p className="text-[10px] sm:text-sm" style={{ color: roster[winnerIdx].color }}>
                    WINNER: {roster[winnerIdx].stages[mons[winnerIdx].stage].name}
                  </p>
                  <img src={SPRITE(roster[winnerIdx].stages[mons[winnerIdx].stage].id)} alt="winner"
                    className="mx-auto my-2 h-20 w-20"
                    style={{ imageRendering: "pixelated", filter: `drop-shadow(0 0 14px ${roster[winnerIdx].color})` }} />
                </>
              ) : (
                <p className="text-[10px] sm:text-sm text-muted-foreground">DRAW</p>
              )}
              <button onClick={reset} className="mt-2 rounded border-2 border-border bg-primary px-3 py-2 text-[9px] text-primary-foreground hover:brightness-110 sm:text-[10px]">
                New Battle
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

function Projectile({ p, now }: { p: Projectile; now: number }) {
  const deg = (p.angle * 180) / Math.PI;
  const x = p.pos.x;
  const y = p.pos.y;
  const t = (now - p.bornAt) / p.duration;

  switch (p.kind) {
    case "fireball": {
      const r = 8 + Math.sin(now / 60) * 2;
      return (
        <g transform={`translate(${x} ${y})`}>
          <circle r={r + 6} fill="#ffae3a" opacity={0.35} />
          <circle r={r} fill="#ff5a1a" />
          <circle r={r * 0.5} fill="#fff2a8" />
        </g>
      );
    }
    case "waterjet":
      return (
        <g transform={`translate(${x} ${y}) rotate(${deg})`}>
          <ellipse rx={18} ry={5} fill="#4ea8ff" opacity={0.5} />
          <ellipse rx={10} ry={3} fill="#bfe6ff" />
          <circle cx={-10} cy={-4} r={2} fill="#bfe6ff" opacity={0.7} />
          <circle cx={-14} cy={3} r={1.5} fill="#bfe6ff" opacity={0.6} />
        </g>
      );
    case "leaf":
      return (
        <g transform={`translate(${x} ${y}) rotate(${(now / 4) % 360})`}>
          <path d="M -10 0 Q 0 -10 10 0 Q 0 10 -10 0 Z" fill="#6bd36b" stroke="#2c6b2c" strokeWidth={1.2} />
          <line x1={-8} y1={0} x2={8} y2={0} stroke="#2c6b2c" strokeWidth={0.8} />
        </g>
      );
    case "lightning": {
      // jagged bolt drawn from origin to target
      const dx = p.pos.x - p.from.x;
      const dy = p.pos.y - p.from.y;
      const segments = 6;
      let d = `M ${p.from.x} ${p.from.y}`;
      for (let i = 1; i <= segments; i++) {
        const fx = p.from.x + (dx * i) / segments + rand(-6, 6);
        const fy = p.from.y + (dy * i) / segments + rand(-6, 6);
        d += ` L ${fx} ${fy}`;
      }
      return (
        <g opacity={1 - t * 0.4}>
          <path d={d} stroke="#fff7a0" strokeWidth={5} fill="none" opacity={0.5} />
          <path d={d} stroke="#ffd83a" strokeWidth={2.2} fill="none" />
        </g>
      );
    }
    case "psybeam":
      return (
        <g transform={`translate(${x} ${y})`}>
          <circle r={12} fill="#d976ff" opacity={0.35} />
          <circle r={7} fill="#ff8de0" />
          <circle r={3} fill="#fff" />
          {[0, 60, 120, 180, 240, 300].map((a) => {
            const rad = (a * Math.PI) / 180 + now / 200;
            return <circle key={a} cx={Math.cos(rad) * 10} cy={Math.sin(rad) * 10} r={1.6} fill="#fff" />;
          })}
        </g>
      );
    case "rock":
      return (
        <g transform={`translate(${x} ${y}) rotate(${(now / 3) % 360})`}>
          <polygon points="-9,-5 -3,-9 7,-6 9,2 4,9 -6,7 -10,1" fill="#8a7a55" stroke="#3d3520" strokeWidth={1.2} />
          <polygon points="-4,-2 -1,-4 3,-2 2,2 -3,2" fill="#b89a6c" />
        </g>
      );
    case "iceshard":
      return (
        <g transform={`translate(${x} ${y}) rotate(${deg})`}>
          <polygon points="-12,-3 8,0 -12,3" fill="#bfe9ff" stroke="#4ea8ff" strokeWidth={1.2} />
          <polygon points="-6,-2 4,0 -6,2" fill="#fff" />
          <circle cx={-12} r={2} fill="#bfe9ff" opacity={0.6} />
        </g>
      );
    case "shadowball":
      return (
        <g transform={`translate(${x} ${y})`}>
          <circle r={11} fill="#5a2d8a" opacity={0.5} />
          <circle r={8} fill="#9d6bff" />
          <circle r={4} fill="#2a1043" />
          <circle cx={2} cy={-2} r={1.5} fill="#fff" opacity={0.6} />
        </g>
      );
    case "dragonpulse":
      return (
        <g transform={`translate(${x} ${y}) rotate(${deg})`}>
          <ellipse rx={14} ry={6} fill="#a366ff" opacity={0.5} />
          <ellipse rx={9} ry={4} fill="#f0b84a" />
          <circle cx={4} r={2} fill="#fff" />
        </g>
      );
    case "punch":
      return (
        <g transform={`translate(${x} ${y}) rotate(${deg})`}>
          <circle r={9} fill="#ffd9b0" stroke="#6b3a18" strokeWidth={1.5} />
          <path d="M -3 -3 L 4 -3 M -3 0 L 4 0 M -3 3 L 4 3" stroke="#6b3a18" strokeWidth={1} fill="none" />
          <line x1={-15} y1={0} x2={-8} y2={0} stroke="#fff" strokeWidth={2} />
        </g>
      );
    case "bugbuzz":
      return (
        <g transform={`translate(${x} ${y})`}>
          {[0, 120, 240].map((a) => {
            const rad = (a * Math.PI) / 180 + now / 80;
            return <ellipse key={a} cx={Math.cos(rad) * 6} cy={Math.sin(rad) * 6} rx={5} ry={2} fill="#a4d850" opacity={0.7} transform={`rotate(${(rad * 180) / Math.PI} ${Math.cos(rad) * 6} ${Math.sin(rad) * 6})`} />;
          })}
          <circle r={4} fill="#5a8a20" />
        </g>
      );
    case "fairywind":
      return (
        <g transform={`translate(${x} ${y})`}>
          <circle r={10} fill="#ffb6e0" opacity={0.4} />
          {[0, 72, 144, 216, 288].map((a) => {
            const rad = (a * Math.PI) / 180 + now / 150;
            return <path key={a} d={`M 0 0 L ${Math.cos(rad) * 8} ${Math.sin(rad) * 8}`} stroke="#fff" strokeWidth={1.4} />;
          })}
          <circle r={3} fill="#fff" />
        </g>
      );
  }
}
