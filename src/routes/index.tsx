import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pixel Pocket Brawl — Top-Down Arena" },
      { name: "description", content: "Top-down pixel auto-battler: 5 creatures roam an arena, fire type abilities every 5s, and evolve every 15s." },
    ],
  }),
  component: Game,
});

type ElementType = "fire" | "water" | "grass" | "electric" | "psychic";
const SPRITE = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`;

type StageData = { name: string; id: number; ability: string; dmg: number };
type Mon = { key: string; type: ElementType; color: string; stages: [StageData, StageData, StageData] };

const ROSTER: Mon[] = [
  { key: "fire", type: "fire", color: "#ff7a3d", stages: [
    { name: "Charmander", id: 4, ability: "Ember", dmg: 8 },
    { name: "Charmeleon", id: 5, ability: "Flamethrower", dmg: 17 },
    { name: "Charizard", id: 6, ability: "Blast Burn", dmg: 32 },
  ]},
  { key: "water", type: "water", color: "#4ea8ff", stages: [
    { name: "Squirtle", id: 7, ability: "Water Gun", dmg: 7 },
    { name: "Wartortle", id: 8, ability: "Hydro Pump", dmg: 17 },
    { name: "Blastoise", id: 9, ability: "Tidal Cannon", dmg: 31 },
  ]},
  { key: "grass", type: "grass", color: "#6bd36b", stages: [
    { name: "Bulbasaur", id: 1, ability: "Vine Whip", dmg: 7 },
    { name: "Ivysaur", id: 2, ability: "Razor Leaf", dmg: 16 },
    { name: "Venusaur", id: 3, ability: "Solar Beam", dmg: 30 },
  ]},
  { key: "electric", type: "electric", color: "#ffd83a", stages: [
    { name: "Pichu", id: 172, ability: "Spark", dmg: 9 },
    { name: "Pikachu", id: 25, ability: "Thunderbolt", dmg: 18 },
    { name: "Raichu", id: 26, ability: "Thunder", dmg: 33 },
  ]},
  { key: "psychic", type: "psychic", color: "#d976ff", stages: [
    { name: "Abra", id: 63, ability: "Confusion", dmg: 7 },
    { name: "Kadabra", id: 64, ability: "Psybeam", dmg: 16 },
    { name: "Alakazam", id: 65, ability: "Psychic", dmg: 31 },
  ]},
];

const BOSS = { name: "Mewtwo", id: 150 };
const BOSS_MAX_HP = 700;
const MON_MAX_HP = 100;
const ABILITY_COOLDOWN = 5000;
const EVOLVE_INTERVAL = 15000;
const ARENA_W = 800;
const ARENA_H = 520;
const MON_R = 24;
const BOSS_R = 38;
const ATTACK_RANGE = 220;

type Vec = { x: number; y: number };
type MonState = {
  pos: Vec;
  vel: Vec;
  hp: number;
  stage: number;
  lastAttack: number;
  evolveTimer: number;
  hitFlash: number;
  attackFlash: number;
};
type Projectile = {
  id: number;
  from: Vec;
  to: Vec;
  pos: Vec;
  color: string;
  dmg: number;
  crit: boolean;
  target: "boss" | number;
  bornAt: number;
  duration: number;
};
type Pop = { id: number; x: number; y: number; value: number; crit: boolean; bornAt: number; color: string };
type LogEntry = { id: number; text: string; type: ElementType | "boss" | "system" };

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }

function Game() {
  const monsRef = useRef<MonState[]>(
    ROSTER.map((_, i) => ({
      pos: { x: 90 + (i % 3) * 70, y: 110 + Math.floor(i / 3) * 90 },
      vel: { x: rand(-30, 30), y: rand(-30, 30) },
      hp: MON_MAX_HP,
      stage: 0,
      lastAttack: -rand(0, ABILITY_COOLDOWN),
      evolveTimer: 0,
      hitFlash: 0,
      attackFlash: 0,
    })),
  );
  const bossRef = useRef({
    pos: { x: ARENA_W - 150, y: ARENA_H / 2 },
    vel: { x: rand(-40, 40), y: rand(-40, 40) },
    hp: BOSS_MAX_HP,
    lastAttack: 0,
    hitFlash: 0,
    attackFlash: 0,
  });
  const projectilesRef = useRef<Projectile[]>([]);
  const popsRef = useRef<Pop[]>([]);
  const idRef = useRef(1);
  const startRef = useRef(performance.now());
  const [, force] = useState(0);
  const [running, setRunning] = useState(true);
  const runningRef = useRef(true);
  const [log, setLog] = useState<LogEntry[]>([
    { id: 0, text: `A wild ${BOSS.name} appeared!`, type: "system" },
  ]);
  const [status, setStatus] = useState<"fighting" | "victory" | "defeat">("fighting");

  useEffect(() => { runningRef.current = running; }, [running]);

  const pushLog = (text: string, type: LogEntry["type"]) => {
    setLog((l) => [{ id: idRef.current++, text, type }, ...l].slice(0, 12));
  };

  // Main loop
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

  const step = (dt: number, now: number) => {
    const mons = monsRef.current;
    const boss = bossRef.current;

    // --- update mons ---
    mons.forEach((m, i) => {
      if (m.hp <= 0) return;
      const data = ROSTER[i].stages[m.stage];

      // evolution
      m.evolveTimer += dt * 1000;
      if (m.evolveTimer >= EVOLVE_INTERVAL && m.stage < 2) {
        m.stage += 1;
        m.evolveTimer = 0;
        m.attackFlash = now + 600;
        pushLog(`${ROSTER[i].stages[m.stage - 1].name} evolved into ${ROSTER[i].stages[m.stage].name}!`, ROSTER[i].type);
      }

      // movement: orbit/seek boss
      const dx = boss.pos.x - m.pos.x;
      const dy = boss.pos.y - m.pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      const desired = ATTACK_RANGE * 0.8;
      const seek = (dist - desired) * 0.6;
      const tangent = { x: -dy / dist, y: dx / dist };
      const speed = 60 + m.stage * 14;
      m.vel.x = (dx / dist) * seek + tangent.x * speed * 0.7 + rand(-8, 8);
      m.vel.y = (dy / dist) * seek + tangent.y * speed * 0.7 + rand(-8, 8);

      // separation
      mons.forEach((o, j) => {
        if (i === j || o.hp <= 0) return;
        const ox = m.pos.x - o.pos.x;
        const oy = m.pos.y - o.pos.y;
        const od = Math.hypot(ox, oy) || 1;
        if (od < MON_R * 2.2) {
          m.vel.x += (ox / od) * 50;
          m.vel.y += (oy / od) * 50;
        }
      });

      m.pos.x += m.vel.x * dt;
      m.pos.y += m.vel.y * dt;
      m.pos.x = Math.max(MON_R, Math.min(ARENA_W - MON_R, m.pos.x));
      m.pos.y = Math.max(MON_R, Math.min(ARENA_H - MON_R, m.pos.y));

      // attack
      if (now - m.lastAttack >= ABILITY_COOLDOWN && dist <= ATTACK_RANGE + 80) {
        m.lastAttack = now;
        m.attackFlash = now + 300;
        const crit = Math.random() < 0.2;
        const dmg = Math.round(data.dmg * (crit ? 1.7 : 1) * (0.85 + Math.random() * 0.3));
        projectilesRef.current.push({
          id: idRef.current++,
          from: { ...m.pos },
          to: { ...boss.pos },
          pos: { ...m.pos },
          color: ROSTER[i].color,
          dmg,
          crit,
          target: "boss",
          bornAt: now,
          duration: 380,
        });
        pushLog(`${data.name} used ${data.ability}! ${crit ? "CRIT " : ""}${dmg}`, ROSTER[i].type);
      }

      if (m.hitFlash && now > m.hitFlash) m.hitFlash = 0;
      if (m.attackFlash && now > m.attackFlash) m.attackFlash = 0;
    });

    // --- boss movement + attack ---
    if (boss.hp > 0) {
      // wander, gently flee crowd
      let cx = 0, cy = 0, n = 0;
      mons.forEach((m) => { if (m.hp > 0) { cx += m.pos.x; cy += m.pos.y; n++; } });
      if (n > 0) {
        cx /= n; cy /= n;
        const fx = boss.pos.x - cx;
        const fy = boss.pos.y - cy;
        const fd = Math.hypot(fx, fy) || 1;
        boss.vel.x = (fx / fd) * 30 + rand(-20, 20);
        boss.vel.y = (fy / fd) * 30 + rand(-20, 20);
      }
      boss.pos.x += boss.vel.x * dt;
      boss.pos.y += boss.vel.y * dt;
      if (boss.pos.x < BOSS_R || boss.pos.x > ARENA_W - BOSS_R) boss.vel.x *= -1;
      if (boss.pos.y < BOSS_R || boss.pos.y > ARENA_H - BOSS_R) boss.vel.y *= -1;
      boss.pos.x = Math.max(BOSS_R, Math.min(ARENA_W - BOSS_R, boss.pos.x));
      boss.pos.y = Math.max(BOSS_R, Math.min(ARENA_H - BOSS_R, boss.pos.y));

      if (now - boss.lastAttack >= ABILITY_COOLDOWN * 0.9) {
        const alive = mons.map((m, i) => (m.hp > 0 ? i : -1)).filter((i) => i >= 0);
        if (alive.length > 0) {
          boss.lastAttack = now;
          boss.attackFlash = now + 300;
          const target = alive[Math.floor(Math.random() * alive.length)];
          const t = mons[target];
          const dmg = 10 + Math.floor(Math.random() * 12);
          projectilesRef.current.push({
            id: idRef.current++,
            from: { ...boss.pos },
            to: { ...t.pos },
            pos: { ...boss.pos },
            color: "#ff3d8b",
            dmg,
            crit: false,
            target,
            bornAt: now,
            duration: 420,
          });
        }
      }
      if (boss.hitFlash && now > boss.hitFlash) boss.hitFlash = 0;
      if (boss.attackFlash && now > boss.attackFlash) boss.attackFlash = 0;
    }

    // --- projectiles ---
    const remaining: Projectile[] = [];
    for (const p of projectilesRef.current) {
      const t = (now - p.bornAt) / p.duration;
      if (t >= 1) {
        // resolve
        if (p.target === "boss") {
          if (boss.hp > 0) {
            boss.hp = Math.max(0, boss.hp - p.dmg);
            boss.hitFlash = now + 250;
            popsRef.current.push({ id: idRef.current++, x: boss.pos.x, y: boss.pos.y - 30, value: p.dmg, crit: p.crit, bornAt: now, color: p.crit ? "#ffd83a" : "#ff5566" });
            if (boss.hp === 0) {
              pushLog(`${BOSS.name} fainted! VICTORY!`, "system");
              setStatus("victory");
            }
          }
        } else {
          const m = monsRef.current[p.target];
          if (m && m.hp > 0) {
            m.hp = Math.max(0, m.hp - p.dmg);
            m.hitFlash = now + 250;
            popsRef.current.push({ id: idRef.current++, x: m.pos.x, y: m.pos.y - 24, value: p.dmg, crit: false, bornAt: now, color: "#ff5566" });
            if (m.hp === 0) {
              pushLog(`${ROSTER[p.target].stages[m.stage].name} fainted!`, "system");
              if (monsRef.current.every((x) => x.hp <= 0)) {
                pushLog(`DEFEAT...`, "system");
                setStatus("defeat");
              }
            }
          }
        }
      } else {
        // ease toward target
        const cur = p.target === "boss" ? boss.pos : monsRef.current[p.target].pos;
        const e = t * t * (3 - 2 * t);
        p.pos.x = p.from.x + (cur.x - p.from.x) * e;
        p.pos.y = p.from.y + (cur.y - p.from.y) * e;
        remaining.push(p);
      }
    }
    projectilesRef.current = remaining;

    // --- pops cleanup ---
    popsRef.current = popsRef.current.filter((p) => now - p.bornAt < 900);
  };

  const reset = () => {
    monsRef.current = ROSTER.map((_, i) => ({
      pos: { x: 90 + (i % 3) * 70, y: 110 + Math.floor(i / 3) * 90 },
      vel: { x: rand(-30, 30), y: rand(-30, 30) },
      hp: MON_MAX_HP,
      stage: 0,
      lastAttack: -rand(0, ABILITY_COOLDOWN),
      evolveTimer: 0,
      hitFlash: 0,
      attackFlash: 0,
    }));
    bossRef.current = {
      pos: { x: ARENA_W - 150, y: ARENA_H / 2 },
      vel: { x: rand(-40, 40), y: rand(-40, 40) },
      hp: BOSS_MAX_HP,
      lastAttack: performance.now(),
      hitFlash: 0,
      attackFlash: 0,
    };
    projectilesRef.current = [];
    popsRef.current = [];
    startRef.current = performance.now();
    setLog([{ id: idRef.current++, text: `A new ${BOSS.name} appeared!`, type: "system" }]);
    setStatus("fighting");
    setRunning(true);
  };

  const mons = monsRef.current;
  const boss = bossRef.current;
  const now = performance.now();

  const overallEvolveIn = useMemo(() => {
    const t = Math.min(...mons.filter((m) => m.hp > 0 && m.stage < 2).map((m) => EVOLVE_INTERVAL - m.evolveTimer));
    return Number.isFinite(t) ? Math.max(0, Math.ceil(t / 1000)) : 0;
  }, [mons, now]);

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-3 p-3 sm:p-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[10px] tracking-wider text-primary sm:text-sm">PIXEL POCKET BRAWL</h1>
          <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">
            Top-Down Arena · Abilities every 5s · Evolve every 15s
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRunning((r) => !r)} className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] hover:brightness-125 sm:text-[10px]">
            {running ? "Pause" : "Resume"}
          </button>
          <button onClick={reset} className="rounded border-2 border-border bg-accent px-3 py-2 text-[8px] text-primary-foreground hover:brightness-110 sm:text-[10px]">
            Restart
          </button>
        </div>
      </header>

      {/* HP bars overlay */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded border-2 border-border bg-panel p-2">
          <div className="mb-1 flex items-center justify-between text-[7px] sm:text-[9px]">
            <span className="text-danger">{BOSS.name.toUpperCase()}</span>
            <span className="text-muted-foreground">{boss.hp}/{BOSS_MAX_HP}</span>
          </div>
          <HpBar value={boss.hp} max={BOSS_MAX_HP} big />
        </div>
        <div className="rounded border-2 border-border bg-panel p-2 text-[7px] sm:text-[9px]">
          <p className="mb-1 text-primary">EVOLVE IN</p>
          <p className="text-muted-foreground">{overallEvolveIn}s</p>
        </div>
        <div className="rounded border-2 border-border bg-panel p-2 text-[7px] sm:text-[9px]">
          <p className="mb-1 text-primary">ALIVE</p>
          <p className="text-muted-foreground">{mons.filter((m) => m.hp > 0).length} / {ROSTER.length}</p>
        </div>
      </div>

      {/* ARENA */}
      <div
        className="arena-wrap relative w-full overflow-hidden rounded-xl border-4 border-border"
        style={{ aspectRatio: `${ARENA_W} / ${ARENA_H}` }}
      >
        <div className="arena-grass absolute inset-0" />
        <div
          className="relative h-full w-full"
          style={{ transform: "scale(1)", transformOrigin: "top left" }}
        >
          <svg viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
            {/* arena lines */}
            <circle cx={ARENA_W / 2} cy={ARENA_H / 2} r={120} fill="none" stroke="rgba(255,255,255,0.12)" strokeDasharray="6 8" />
            <circle cx={ARENA_W / 2} cy={ARENA_H / 2} r={40} fill="rgba(255,255,255,0.04)" />

            {/* shadows */}
            {mons.map((m, i) =>
              m.hp <= 0 ? null : (
                <ellipse key={`s${i}`} cx={m.pos.x} cy={m.pos.y + MON_R - 4} rx={MON_R * 0.7} ry={5} fill="rgba(0,0,0,0.35)" />
              ),
            )}
            {boss.hp > 0 && (
              <ellipse cx={boss.pos.x} cy={boss.pos.y + BOSS_R - 6} rx={BOSS_R * 0.7} ry={7} fill="rgba(0,0,0,0.45)" />
            )}

            {/* projectiles */}
            {projectilesRef.current.map((p) => (
              <g key={p.id}>
                <circle cx={p.pos.x} cy={p.pos.y} r={9} fill={p.color} opacity={0.4} />
                <circle cx={p.pos.x} cy={p.pos.y} r={5} fill={p.color} />
              </g>
            ))}

            {/* attack range rings when firing */}
            {mons.map((m, i) =>
              m.attackFlash ? (
                <circle key={`r${i}`} cx={m.pos.x} cy={m.pos.y} r={MON_R + 8} fill="none" stroke={ROSTER[i].color} strokeWidth={2} opacity={0.7} />
              ) : null,
            )}
          </svg>

          {/* sprites layered on top */}
          {mons.map((m, i) => {
            const data = ROSTER[i].stages[m.stage];
            const fainted = m.hp <= 0;
            const size = 56 + m.stage * 10;
            return (
              <div
                key={ROSTER[i].key}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${(m.pos.x / ARENA_W) * 100}%`,
                  top: `${(m.pos.y / ARENA_H) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: size,
                  filter: m.hitFlash ? "brightness(2) saturate(0)" : `drop-shadow(0 0 6px ${ROSTER[i].color})`,
                  opacity: fainted ? 0.25 : 1,
                  transition: "filter 120ms",
                }}
              >
                <img
                  src={SPRITE(data.id)}
                  alt={data.name}
                  className="pixel"
                  style={{ width: size, height: size, imageRendering: "pixelated", objectFit: "contain" }}
                />
                {!fainted && (
                  <>
                    <span className="mt-0.5 rounded bg-black/60 px-1 text-[7px]" style={{ color: ROSTER[i].color }}>
                      {data.name} L{m.stage + 1}
                    </span>
                    <div className="mt-0.5 h-1 w-12 overflow-hidden rounded bg-black/60">
                      <div className="h-full" style={{ width: `${(m.hp / MON_MAX_HP) * 100}%`, background: m.hp > MON_MAX_HP * 0.4 ? "#62e07a" : "#ff5566" }} />
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {boss.hp > 0 && (
            <div
              className="absolute flex flex-col items-center"
              style={{
                left: `${(boss.pos.x / ARENA_W) * 100}%`,
                top: `${(boss.pos.y / ARENA_H) * 100}%`,
                transform: "translate(-50%, -50%)",
                filter: boss.hitFlash ? "brightness(2) saturate(0)" : "drop-shadow(0 0 14px #d976ff) drop-shadow(0 0 6px #ff3d8b)",
              }}
            >
              <img
                src={SPRITE(BOSS.id)}
                alt={BOSS.name}
                className="pixel"
                style={{ width: 110, height: 110, imageRendering: "pixelated", objectFit: "contain" }}
              />
            </div>
          )}

          {/* damage pops */}
          {popsRef.current.map((p) => (
            <span
              key={p.id}
              className="dmg-pop pointer-events-none absolute text-[10px] sm:text-xs"
              style={{
                left: `${(p.x / ARENA_W) * 100}%`,
                top: `${(p.y / ARENA_H) * 100}%`,
                color: p.color,
              }}
            >
              -{p.value}{p.crit ? "!" : ""}
            </span>
          ))}
        </div>

        {status !== "fighting" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
            <div className="rounded border-2 border-border bg-panel px-5 py-4 text-center">
              <p className="text-[12px] sm:text-base" style={{ color: status === "victory" ? "var(--color-hp)" : "var(--color-hp-low)" }}>
                {status === "victory" ? "VICTORY!" : "DEFEAT..."}
              </p>
              <button onClick={reset} className="mt-3 rounded border-2 border-border bg-primary px-3 py-2 text-[9px] text-primary-foreground hover:brightness-110 sm:text-[10px]">
                Battle Again
              </button>
            </div>
          </div>
        )}
      </div>

      <section className="rounded-md border-2 border-border bg-panel p-3">
        <p className="mb-2 text-[8px] text-primary sm:text-[10px]">BATTLE LOG</p>
        <ul className="flex max-h-40 flex-col gap-1 overflow-hidden text-[7px] leading-relaxed sm:text-[9px]">
          {log.map((entry) => (
            <li
              key={entry.id}
              style={{
                color:
                  entry.type === "system" ? "var(--color-muted-foreground)"
                  : entry.type === "boss" ? "var(--color-danger)"
                  : `var(--color-${entry.type})`,
              }}
            >
              &gt; {entry.text}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function HpBar({ value, max, big }: { value: number; max: number; big?: boolean }) {
  const pct = Math.max(0, (value / max) * 100);
  const color = pct > 50 ? "var(--color-hp)" : pct > 20 ? "var(--color-electric)" : "var(--color-hp-low)";
  return (
    <div className={`w-full overflow-hidden rounded-sm border border-border bg-background ${big ? "h-3" : "h-1.5"}`}>
      <div className="h-full transition-[width] duration-200" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}
