import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pixel Pocket Brawl — 5-Way Free-For-All" },
      { name: "description", content: "Top-down 1v1v1v1v1 pixel auto-battler. Five creatures fight to be the last one standing, evolving every 15s." },
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
    { name: "Charmander", id: 4, ability: "Ember", dmg: 9 },
    { name: "Charmeleon", id: 5, ability: "Flamethrower", dmg: 18 },
    { name: "Charizard", id: 6, ability: "Blast Burn", dmg: 34 },
  ]},
  { key: "water", type: "water", color: "#4ea8ff", stages: [
    { name: "Squirtle", id: 7, ability: "Water Gun", dmg: 8 },
    { name: "Wartortle", id: 8, ability: "Hydro Pump", dmg: 18 },
    { name: "Blastoise", id: 9, ability: "Tidal Cannon", dmg: 33 },
  ]},
  { key: "grass", type: "grass", color: "#6bd36b", stages: [
    { name: "Bulbasaur", id: 1, ability: "Vine Whip", dmg: 8 },
    { name: "Ivysaur", id: 2, ability: "Razor Leaf", dmg: 17 },
    { name: "Venusaur", id: 3, ability: "Solar Beam", dmg: 32 },
  ]},
  { key: "electric", type: "electric", color: "#ffd83a", stages: [
    { name: "Pichu", id: 172, ability: "Spark", dmg: 10 },
    { name: "Pikachu", id: 25, ability: "Thunderbolt", dmg: 19 },
    { name: "Raichu", id: 26, ability: "Thunder", dmg: 35 },
  ]},
  { key: "psychic", type: "psychic", color: "#d976ff", stages: [
    { name: "Abra", id: 63, ability: "Confusion", dmg: 8 },
    { name: "Kadabra", id: 64, ability: "Psybeam", dmg: 17 },
    { name: "Alakazam", id: 65, ability: "Psychic", dmg: 33 },
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
  evolveFlashUntil: number;
};
type Projectile = {
  id: number;
  fromIdx: number;
  targetIdx: number;
  from: Vec;
  pos: Vec;
  color: string;
  dmg: number;
  crit: boolean;
  bornAt: number;
  duration: number;
};
type Pop = { id: number; x: number; y: number; value: number; crit: boolean; bornAt: number; color: string };
type LogEntry = { id: number; text: string; color: string };

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }

function initialMons(): MonState[] {
  // place around a circle
  return ROSTER.map((_, i) => {
    const a = (i / ROSTER.length) * Math.PI * 2;
    return {
      pos: { x: ARENA_W / 2 + Math.cos(a) * 200, y: ARENA_H / 2 + Math.sin(a) * 180 },
      vel: { x: rand(-30, 30), y: rand(-30, 30) },
      hp: MON_MAX_HP,
      stage: 0,
      lastAttack: -rand(0, ABILITY_COOLDOWN),
      evolveTimer: 0,
      hitFlash: 0,
      attackFlash: 0,
      evolveFlashUntil: 0,
    };
  });
}

function Game() {
  const monsRef = useRef<MonState[]>(initialMons());
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
      if (w !== null) {
        pushLog(`${ROSTER[w].stages[mons[w].stage].name} WINS!`, ROSTER[w].color);
      } else {
        pushLog("Draw! Nobody survived.", "var(--color-muted-foreground)");
      }
    }
  };

  const step = (dt: number, now: number) => {
    const mons = monsRef.current;

    mons.forEach((m, i) => {
      if (m.hp <= 0) return;
      const data = ROSTER[i].stages[m.stage];

      // evolution
      m.evolveTimer += dt * 1000;
      if (m.evolveTimer >= EVOLVE_INTERVAL && m.stage < 2) {
        m.stage += 1;
        m.evolveTimer = 0;
        m.evolveFlashUntil = now + EVOLVE_FLASH_MS;
        pushLog(`${ROSTER[i].stages[m.stage - 1].name} evolved into ${ROSTER[i].stages[m.stage].name}!`, ROSTER[i].color);
      }

      // pick target
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

      // separation
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

      // attack
      if (now - m.lastAttack >= ABILITY_COOLDOWN && dist <= ATTACK_RANGE + 80) {
        m.lastAttack = now;
        m.attackFlash = now + 300;
        const crit = Math.random() < 0.2;
        const dmg = Math.round(data.dmg * (crit ? 1.7 : 1) * (0.85 + Math.random() * 0.3));
        projectilesRef.current.push({
          id: idRef.current++,
          fromIdx: i,
          targetIdx: tgt,
          from: { ...m.pos },
          pos: { ...m.pos },
          color: ROSTER[i].color,
          dmg,
          crit,
          bornAt: now,
          duration: 380,
        });
        pushLog(`${data.name} → ${ROSTER[tgt].stages[t.stage].name}: ${data.ability} ${crit ? "CRIT " : ""}${dmg}`, ROSTER[i].color);
      }

      if (m.hitFlash && now > m.hitFlash) m.hitFlash = 0;
      if (m.attackFlash && now > m.attackFlash) m.attackFlash = 0;
    });

    // projectiles
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
            pushLog(`${ROSTER[p.targetIdx].stages[tgt.stage].name} was knocked out!`, "var(--color-muted-foreground)");
            killed = true;
          }
        }
      } else {
        const cur = tgt && tgt.hp > 0 ? tgt.pos : p.from;
        const e = t * t * (3 - 2 * t);
        p.pos.x = p.from.x + (cur.x - p.from.x) * e;
        p.pos.y = p.from.y + (cur.y - p.from.y) * e;
        remaining.push(p);
      }
    }
    projectilesRef.current = remaining;

    popsRef.current = popsRef.current.filter((p) => now - p.bornAt < 900);
    if (killed) checkEnd();
  };

  const reset = () => {
    monsRef.current = initialMons();
    projectilesRef.current = [];
    popsRef.current = [];
    setLog([{ id: idRef.current++, text: "Free-for-all! Last creature standing wins!", color: "var(--color-muted-foreground)" }]);
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
            1v1v1v1v1 · Abilities every 5s · Evolve every 15s
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

      {/* Roster strip */}
      <div className="grid grid-cols-5 gap-2">
        {ROSTER.map((r, i) => {
          const m = mons[i];
          const data = r.stages[m.stage];
          const dead = m.hp <= 0;
          return (
            <div
              key={r.key}
              className="rounded border-2 border-border bg-panel p-2 text-center"
              style={{ boxShadow: `inset 0 -3px 0 ${r.color}`, opacity: dead ? 0.45 : 1 }}
            >
              <p className="text-[7px] sm:text-[9px]" style={{ color: r.color }}>
                {dead ? "K.O." : `${data.name} L${m.stage + 1}`}
              </p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded border border-border bg-background">
                <div className="h-full transition-[width] duration-200" style={{ width: `${(m.hp / MON_MAX_HP) * 100}%`, background: m.hp > MON_MAX_HP * 0.4 ? "var(--color-hp)" : "var(--color-hp-low)" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* status */}
      <div className="flex items-center justify-between rounded border-2 border-border bg-panel px-3 py-2 text-[7px] sm:text-[9px]">
        <span className="text-primary">ALIVE: {mons.filter((m) => m.hp > 0).length} / {ROSTER.length}</span>
        <span className="text-muted-foreground">Next evolution in {minEvolveIn}s</span>
      </div>

      {/* ARENA */}
      <div
        className="arena-wrap relative w-full overflow-hidden rounded-xl border-4 border-border"
        style={{ aspectRatio: `${ARENA_W} / ${ARENA_H}` }}
      >
        <div className="arena-grass absolute inset-0" />
        <div className="relative h-full w-full">
          <svg viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
            <circle cx={ARENA_W / 2} cy={ARENA_H / 2} r={140} fill="none" stroke="rgba(255,255,255,0.12)" strokeDasharray="6 8" />
            <circle cx={ARENA_W / 2} cy={ARENA_H / 2} r={50} fill="rgba(255,255,255,0.05)" />

            {/* shadows */}
            {mons.map((m, i) => m.hp <= 0 ? null : (
              <ellipse key={`s${i}`} cx={m.pos.x} cy={m.pos.y + MON_R - 4} rx={MON_R * 0.7} ry={5} fill="rgba(0,0,0,0.4)" />
            ))}

            {/* evolution flash rings */}
            {mons.map((m, i) => {
              if (!m.evolveFlashUntil || now > m.evolveFlashUntil) return null;
              const remaining = m.evolveFlashUntil - now;
              const t = 1 - remaining / EVOLVE_FLASH_MS; // 0->1
              const pulses = [0, 0.33, 0.66];
              return (
                <g key={`ev${i}`}>
                  {pulses.map((offset, k) => {
                    const lt = (t + offset) % 1;
                    const r = 20 + lt * 80;
                    const op = (1 - lt) * 0.9;
                    return (
                      <circle key={k} cx={m.pos.x} cy={m.pos.y} r={r} fill="none" stroke="#fff8b0" strokeWidth={3} opacity={op} />
                    );
                  })}
                  <circle cx={m.pos.x} cy={m.pos.y} r={MON_R + 8} fill="rgba(255, 248, 176, 0.25)">
                    <animate attributeName="r" values={`${MON_R + 4};${MON_R + 14};${MON_R + 4}`} dur="0.4s" repeatCount="indefinite" />
                  </circle>
                </g>
              );
            })}

            {/* projectiles */}
            {projectilesRef.current.map((p) => (
              <g key={p.id}>
                <circle cx={p.pos.x} cy={p.pos.y} r={10} fill={p.color} opacity={0.35} />
                <circle cx={p.pos.x} cy={p.pos.y} r={5} fill={p.color} />
              </g>
            ))}

            {/* attack rings */}
            {mons.map((m, i) => m.attackFlash ? (
              <circle key={`r${i}`} cx={m.pos.x} cy={m.pos.y} r={MON_R + 10} fill="none" stroke={ROSTER[i].color} strokeWidth={2} opacity={0.7} />
            ) : null)}
          </svg>

          {/* sprites */}
          {mons.map((m, i) => {
            const data = ROSTER[i].stages[m.stage];
            const fainted = m.hp <= 0;
            const size = 58 + m.stage * 12;
            const evolving = m.evolveFlashUntil && now < m.evolveFlashUntil;
            return (
              <div
                key={ROSTER[i].key}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${(m.pos.x / ARENA_W) * 100}%`,
                  top: `${(m.pos.y / ARENA_H) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: size,
                  opacity: fainted ? 0.2 : 1,
                  filter: m.hitFlash
                    ? "brightness(2.4) saturate(0)"
                    : evolving
                      ? "drop-shadow(0 0 18px #fff8b0) drop-shadow(0 0 8px #ffe066) brightness(1.5) saturate(1.4)"
                      : `drop-shadow(0 0 6px ${ROSTER[i].color})`,
                  transition: "filter 120ms",
                }}
              >
                <img
                  src={SPRITE(data.id)}
                  alt={data.name}
                  className={evolving ? "anim-evolve-spin" : ""}
                  style={{ width: size, height: size, imageRendering: "pixelated", objectFit: "contain" }}
                />
                {!fainted && (
                  <>
                    <span className="mt-0.5 rounded bg-black/70 px-1 text-[7px]" style={{ color: ROSTER[i].color }}>
                      {data.name} L{m.stage + 1}
                    </span>
                    <div className="mt-0.5 h-1 w-14 overflow-hidden rounded bg-black/60">
                      <div className="h-full" style={{ width: `${(m.hp / MON_MAX_HP) * 100}%`, background: m.hp > MON_MAX_HP * 0.4 ? "#62e07a" : "#ff5566" }} />
                    </div>
                  </>
                )}
              </div>
            );
          })}

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

        {status === "ended" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
            <div className="rounded border-2 border-border bg-panel px-5 py-4 text-center">
              {winnerIdx !== null ? (
                <>
                  <p className="text-[10px] sm:text-sm" style={{ color: ROSTER[winnerIdx].color }}>
                    WINNER: {ROSTER[winnerIdx].stages[mons[winnerIdx].stage].name}
                  </p>
                  <img
                    src={SPRITE(ROSTER[winnerIdx].stages[mons[winnerIdx].stage].id)}
                    alt="winner"
                    className="mx-auto my-2 h-20 w-20"
                    style={{ imageRendering: "pixelated", filter: `drop-shadow(0 0 14px ${ROSTER[winnerIdx].color})` }}
                  />
                </>
              ) : (
                <p className="text-[10px] sm:text-sm text-muted-foreground">DRAW</p>
              )}
              <button onClick={reset} className="mt-2 rounded border-2 border-border bg-primary px-3 py-2 text-[9px] text-primary-foreground hover:brightness-110 sm:text-[10px]">
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
            <li key={entry.id} style={{ color: entry.color }}>&gt; {entry.text}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
