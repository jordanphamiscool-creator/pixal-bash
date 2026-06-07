import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pixel Pocket Brawl — Open Arena Auto-Battle" },
      { name: "description", content: "Open-arena pixel auto-battler: 5 creatures unleash type abilities every 5s and evolve every 15s." },
    ],
  }),
  component: Game,
});

type ElementType = "fire" | "water" | "grass" | "electric" | "psychic";

const SPRITE = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`;
const SPRITE_BACK = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/back/${id}.gif`;

type StageData = { name: string; id: number; ability: string; dmg: number };

type Mon = {
  key: string;
  type: ElementType;
  color: string;
  stages: [StageData, StageData, StageData];
};

const ROSTER: Mon[] = [
  {
    key: "fire", type: "fire", color: "var(--color-fire)",
    stages: [
      { name: "Charmander", id: 4, ability: "Ember", dmg: 8 },
      { name: "Charmeleon", id: 5, ability: "Flamethrower", dmg: 17 },
      { name: "Charizard", id: 6, ability: "Blast Burn", dmg: 32 },
    ],
  },
  {
    key: "water", type: "water", color: "var(--color-water)",
    stages: [
      { name: "Squirtle", id: 7, ability: "Water Gun", dmg: 7 },
      { name: "Wartortle", id: 8, ability: "Hydro Pump", dmg: 17 },
      { name: "Blastoise", id: 9, ability: "Tidal Cannon", dmg: 31 },
    ],
  },
  {
    key: "grass", type: "grass", color: "var(--color-grass)",
    stages: [
      { name: "Bulbasaur", id: 1, ability: "Vine Whip", dmg: 7 },
      { name: "Ivysaur", id: 2, ability: "Razor Leaf", dmg: 16 },
      { name: "Venusaur", id: 3, ability: "Solar Beam", dmg: 30 },
    ],
  },
  {
    key: "electric", type: "electric", color: "var(--color-electric)",
    stages: [
      { name: "Pichu", id: 172, ability: "Spark", dmg: 9 },
      { name: "Pikachu", id: 25, ability: "Thunderbolt", dmg: 18 },
      { name: "Raichu", id: 26, ability: "Thunder", dmg: 33 },
    ],
  },
  {
    key: "psychic", type: "psychic", color: "var(--color-psychic)",
    stages: [
      { name: "Abra", id: 63, ability: "Confusion", dmg: 7 },
      { name: "Kadabra", id: 64, ability: "Psybeam", dmg: 16 },
      { name: "Alakazam", id: 65, ability: "Psychic", dmg: 31 },
    ],
  },
];

// Boss: Mewtwo (#150)
const BOSS = { name: "Mewtwo", id: 150 };

const BOSS_MAX_HP = 650;
const MON_MAX_HP = 90;
const TICK_MS = 5000;
const EVOLVE_TICKS = 3;

type DmgPop = { id: number; src: "mon" | "boss"; monIndex?: number; value: number; crit: boolean };
type LogEntry = { id: number; text: string; type: ElementType | "boss" | "system" };

function Game() {
  const [bossHp, setBossHp] = useState(BOSS_MAX_HP);
  const [monHp, setMonHp] = useState<number[]>(() => ROSTER.map(() => MON_MAX_HP));
  const [stages, setStages] = useState<number[]>(() => ROSTER.map(() => 0));
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(true);
  const [attackingIdx, setAttackingIdx] = useState<number | null>(null);
  const [bossHit, setBossHit] = useState(false);
  const [bossAttacking, setBossAttacking] = useState(false);
  const [hitMonIdx, setHitMonIdx] = useState<number | null>(null);
  const [evolveIdx, setEvolveIdx] = useState<number | null>(null);
  const [bolts, setBolts] = useState<{ id: number; from: number; color: string }[]>([]);
  const [pops, setPops] = useState<DmgPop[]>([]);
  const [log, setLog] = useState<LogEntry[]>([
    { id: 0, text: `A wild ${BOSS.name} appeared!`, type: "system" },
  ]);
  const idRef = useRef(1);

  const status: "fighting" | "victory" | "defeat" = useMemo(() => {
    if (bossHp <= 0) return "victory";
    if (monHp.every((h) => h <= 0)) return "defeat";
    return "fighting";
  }, [bossHp, monHp]);

  const pushLog = (text: string, type: LogEntry["type"]) =>
    setLog((l) => [{ id: idRef.current++, text, type }, ...l].slice(0, 12));

  const popDmg = (p: Omit<DmgPop, "id">) => {
    const id = idRef.current++;
    setPops((arr) => [...arr, { id, ...p }]);
    setTimeout(() => setPops((arr) => arr.filter((x) => x.id !== id)), 900);
  };

  const fireBolt = (from: number, color: string) => {
    const id = idRef.current++;
    setBolts((b) => [...b, { id, from, color }]);
    setTimeout(() => setBolts((b) => b.filter((x) => x.id !== id)), 600);
  };

  useEffect(() => {
    if (!running || status !== "fighting") return;
    const interval = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(interval);
  }, [running, status]);

  useEffect(() => {
    if (tick === 0 || status !== "fighting") return;

    if (tick % EVOLVE_TICKS === 0) {
      setStages((prev) => {
        const next = [...prev];
        ROSTER.forEach((m, i) => {
          if (next[i] < 2 && monHp[i] > 0) {
            next[i] = next[i] + 1;
            const ns = m.stages[next[i]];
            setEvolveIdx(i);
            setTimeout(() => setEvolveIdx(null), 1200);
            pushLog(`${m.stages[next[i] - 1].name} evolved into ${ns.name}!`, m.type);
          }
        });
        return next;
      });
    }

    ROSTER.forEach((mon, i) => {
      if (monHp[i] <= 0) return;
      const delay = i * 320;
      setTimeout(() => {
        const stage = stages[i];
        const data = mon.stages[stage];
        const crit = Math.random() < 0.2;
        const dmg = Math.round(data.dmg * (crit ? 1.7 : 1) * (0.85 + Math.random() * 0.3));
        setAttackingIdx(i);
        setTimeout(() => setAttackingIdx((c) => (c === i ? null : c)), 450);
        fireBolt(i, mon.color);
        setTimeout(() => {
          setBossHit(true);
          setTimeout(() => setBossHit(false), 350);
          setBossHp((hp) => Math.max(0, hp - dmg));
          popDmg({ src: "boss", value: dmg, crit });
        }, 320);
        pushLog(`${data.name} used ${data.ability}! ${crit ? "CRIT! " : ""}${dmg} dmg`, mon.type);
      }, delay);
    });

    setTimeout(() => {
      if (bossHp <= 0) return;
      const aliveIdx = monHp.map((h, i) => (h > 0 ? i : -1)).filter((i) => i >= 0);
      if (aliveIdx.length === 0) return;
      const target = aliveIdx[Math.floor(Math.random() * aliveIdx.length)];
      const dmg = 9 + Math.floor(Math.random() * 10);
      setBossAttacking(true);
      setTimeout(() => setBossAttacking(false), 450);
      setHitMonIdx(target);
      setTimeout(() => setHitMonIdx((c) => (c === target ? null : c)), 400);
      setMonHp((hps) => {
        const next = [...hps];
        next[target] = Math.max(0, next[target] - dmg);
        if (next[target] === 0) pushLog(`${ROSTER[target].stages[stages[target]].name} fainted!`, "system");
        return next;
      });
      popDmg({ src: "mon", monIndex: target, value: dmg, crit: false });
      pushLog(`${BOSS.name} struck ${ROSTER[target].stages[stages[target]].name} for ${dmg}!`, "boss");
    }, ROSTER.length * 320 + 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const reset = () => {
    setBossHp(BOSS_MAX_HP);
    setMonHp(ROSTER.map(() => MON_MAX_HP));
    setStages(ROSTER.map(() => 0));
    setTick(0);
    setRunning(true);
    setLog([{ id: idRef.current++, text: `A new ${BOSS.name} appeared!`, type: "system" }]);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-3 sm:p-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[10px] tracking-wider text-primary sm:text-sm">PIXEL POCKET BRAWL</h1>
          <p className="mt-1 text-[7px] text-muted-foreground sm:text-[9px]">
            Open Arena · Abilities every 5s · Evolve every 15s
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setRunning((r) => !r)}
            className="rounded border-2 border-border bg-muted px-3 py-2 text-[8px] hover:brightness-125 sm:text-[10px]"
          >
            {running ? "Pause" : "Resume"}
          </button>
          <button
            onClick={reset}
            className="rounded border-2 border-border bg-accent px-3 py-2 text-[8px] text-primary-foreground hover:brightness-110 sm:text-[10px]"
          >
            Restart
          </button>
        </div>
      </header>

      {/* OPEN ARENA */}
      <section className="relative overflow-hidden rounded-xl border-4 border-border shadow-[0_0_0_4px_oklch(0.14_0.04_265),0_10px_0_oklch(0.08_0.04_265)]">
        {/* Sky */}
        <div className="arena-sky absolute inset-0" />
        {/* Distant mountains */}
        <div className="arena-mountains absolute inset-x-0 bottom-1/3 h-1/3" />
        {/* Ground */}
        <div className="arena-ground absolute inset-x-0 bottom-0 h-1/3" />

        <div className="relative grid h-[460px] grid-cols-2 sm:h-[520px]">
          {/* Player side */}
          <div className="relative flex items-end justify-center pb-6">
            {/* Battle platform */}
            <div className="platform absolute bottom-3 left-1/2 h-10 w-64 -translate-x-1/2 sm:w-80" />
            <div className="relative grid w-full max-w-md grid-cols-5 items-end gap-1 px-2 pb-2">
              {ROSTER.map((mon, i) => {
                const stage = stages[i];
                const data = mon.stages[stage];
                const fainted = monHp[i] <= 0;
                return (
                  <div key={mon.key} className="relative flex flex-col items-center">
                    {pops
                      .filter((p) => p.src === "mon" && p.monIndex === i)
                      .map((p) => (
                        <span key={p.id} className="dmg-pop pointer-events-none absolute top-0 text-[10px]" style={{ color: "var(--color-hp-low)" }}>
                          -{p.value}
                        </span>
                      ))}
                    <img
                      src={SPRITE_BACK(data.id)}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = SPRITE(data.id); }}
                      alt={data.name}
                      className={`pixel h-14 w-14 object-contain sm:h-20 sm:w-20 ${fainted ? "opacity-20 grayscale" : ""} ${
                        attackingIdx === i ? "anim-attack" : hitMonIdx === i ? "anim-hit" : "anim-float"
                      } ${evolveIdx === i ? "anim-evolve" : ""}`}
                      style={{ filter: `drop-shadow(0 0 6px ${mon.color})` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Enemy side */}
          <div className="relative flex items-center justify-center">
            <div className="platform-enemy absolute top-12 left-1/2 h-10 w-56 -translate-x-1/2 sm:w-72" />
            <div className="relative">
              {pops
                .filter((p) => p.src === "boss")
                .map((p) => (
                  <span
                    key={p.id}
                    className="dmg-pop pointer-events-none absolute left-1/2 top-1/4 text-[12px] sm:text-base"
                    style={{ color: p.crit ? "var(--color-electric)" : "var(--color-hp-low)" }}
                  >
                    -{p.value}{p.crit ? "!" : ""}
                  </span>
                ))}
              <img
                src={SPRITE(BOSS.id)}
                alt={BOSS.name}
                className={`pixel h-40 w-40 object-contain sm:h-56 sm:w-56 ${
                  bossHit ? "anim-hit" : bossAttacking ? "anim-attack" : "anim-float"
                }`}
                style={{ filter: "drop-shadow(0 0 16px oklch(0.7 0.2 320)) drop-shadow(0 0 6px oklch(0.65 0.25 25))" }}
              />
            </div>
          </div>
        </div>

        {/* Projectile bolts (left -> right) */}
        {bolts.map((b) => (
          <span
            key={b.id}
            className="bolt pointer-events-none absolute"
            style={{
              left: "20%",
              top: `${72 + b.from * 4}%`,
              background: `radial-gradient(circle, ${b.color}, transparent 70%)`,
              boxShadow: `0 0 16px ${b.color}, 0 0 32px ${b.color}`,
            }}
          />
        ))}

        {/* HP overlays */}
        <div className="pointer-events-none absolute left-3 top-3 w-44 rounded border-2 border-border bg-panel/90 p-2 sm:w-56">
          <p className="mb-1 text-[7px] text-primary sm:text-[9px]">YOUR TEAM</p>
          <div className="flex flex-col gap-1">
            {ROSTER.map((m, i) => (
              <div key={m.key} className="flex items-center gap-1 text-[6px] sm:text-[8px]">
                <span className="w-14 truncate" style={{ color: m.color }}>{m.stages[stages[i]].name}</span>
                <HpBar value={monHp[i]} max={MON_MAX_HP} />
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute right-3 top-3 w-44 rounded border-2 border-border bg-panel/90 p-2 sm:w-56">
          <div className="mb-1 flex items-center justify-between text-[7px] sm:text-[9px]">
            <span className="text-danger">{BOSS.name.toUpperCase()}</span>
            <span className="text-muted-foreground">{bossHp}/{BOSS_MAX_HP}</span>
          </div>
          <HpBar value={bossHp} max={BOSS_MAX_HP} big />
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
      </section>

      {/* Team detail strip */}
      <section className="grid grid-cols-5 gap-2">
        {ROSTER.map((m, i) => {
          const stage = stages[i];
          const data = m.stages[stage];
          return (
            <div key={m.key} className="rounded border-2 border-border bg-panel p-2 text-center" style={{ boxShadow: `inset 0 -3px 0 ${m.color}` }}>
              <p className="text-[7px] sm:text-[9px]" style={{ color: m.color }}>{data.name}</p>
              <p className="text-[6px] text-muted-foreground sm:text-[8px]">Lv.{stage + 1} · {data.ability}</p>
              <p className="text-[6px] text-muted-foreground sm:text-[8px]">PWR {data.dmg}</p>
            </div>
          );
        })}
      </section>

      {/* Log */}
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
      <div className="h-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}
