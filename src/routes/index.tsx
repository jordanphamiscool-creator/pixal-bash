import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import fire1 from "@/assets/fire-1.png";
import fire2 from "@/assets/fire-2.png";
import fire3 from "@/assets/fire-3.png";
import water1 from "@/assets/water-1.png";
import water2 from "@/assets/water-2.png";
import water3 from "@/assets/water-3.png";
import grass1 from "@/assets/grass-1.png";
import grass2 from "@/assets/grass-2.png";
import grass3 from "@/assets/grass-3.png";
import electric1 from "@/assets/electric-1.png";
import electric2 from "@/assets/electric-2.png";
import electric3 from "@/assets/electric-3.png";
import psychic1 from "@/assets/psychic-1.png";
import psychic2 from "@/assets/psychic-2.png";
import psychic3 from "@/assets/psychic-3.png";
import bossImg from "@/assets/boss.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pixel Pocket Brawl — Auto Pokémon-Style Battle" },
      { name: "description", content: "A pixel-art auto-battler: five elemental creatures fight a shadow boss, unleashing type abilities every 5s and evolving every 15s." },
    ],
  }),
  component: Game,
});

type ElementType = "fire" | "water" | "grass" | "electric" | "psychic";

type StageData = {
  name: string;
  sprite: string;
  ability: string;
  dmg: number;
};

type Mon = {
  id: string;
  type: ElementType;
  color: string;
  stages: [StageData, StageData, StageData];
};

const ROSTER: Mon[] = [
  {
    id: "fire",
    type: "fire",
    color: "var(--color-fire)",
    stages: [
      { name: "Emberlit", sprite: fire1, ability: "Ember", dmg: 8 },
      { name: "Pyroclaw", sprite: fire2, ability: "Flame Wing", dmg: 16 },
      { name: "Infernax", sprite: fire3, ability: "Solar Inferno", dmg: 30 },
    ],
  },
  {
    id: "water",
    type: "water",
    color: "var(--color-water)",
    stages: [
      { name: "Squirtide", sprite: water1, ability: "Bubble", dmg: 7 },
      { name: "Cannonshell", sprite: water2, ability: "Hydro Cannon", dmg: 17 },
      { name: "Leviathar", sprite: water3, ability: "Tidal Wrath", dmg: 32 },
    ],
  },
  {
    id: "grass",
    type: "grass",
    color: "var(--color-grass)",
    stages: [
      { name: "Sprouty", sprite: grass1, ability: "Leaf Cut", dmg: 6 },
      { name: "Bloomadon", sprite: grass2, ability: "Petal Storm", dmg: 15 },
      { name: "Eldertree", sprite: grass3, ability: "Ancient Bloom", dmg: 28 },
    ],
  },
  {
    id: "electric",
    type: "electric",
    color: "var(--color-electric)",
    stages: [
      { name: "Sparkpip", sprite: electric1, ability: "Spark", dmg: 9 },
      { name: "Boltfox", sprite: electric2, ability: "Thunder Fang", dmg: 18 },
      { name: "Stormwolf", sprite: electric3, ability: "Lightning Howl", dmg: 33 },
    ],
  },
  {
    id: "psychic",
    type: "psychic",
    color: "var(--color-psychic)",
    stages: [
      { name: "Wispling", sprite: psychic1, ability: "Confuse", dmg: 7 },
      { name: "Voidmage", sprite: psychic2, ability: "Mind Blast", dmg: 16 },
      { name: "Cosmind", sprite: psychic3, ability: "Galaxy Beam", dmg: 31 },
    ],
  },
];

const BOSS_MAX_HP = 600;
const MON_MAX_HP = 80;
const TICK_MS = 5000;
const EVOLVE_TICKS = 3; // every 15s

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
  const [pops, setPops] = useState<DmgPop[]>([]);
  const [log, setLog] = useState<LogEntry[]>([
    { id: 0, text: "A wild SHADOWLORD appeared!", type: "system" },
  ]);
  const idRef = useRef(1);

  const status: "fighting" | "victory" | "defeat" = useMemo(() => {
    if (bossHp <= 0) return "victory";
    if (monHp.every((h) => h <= 0)) return "defeat";
    return "fighting";
  }, [bossHp, monHp]);

  const pushLog = (text: string, type: LogEntry["type"]) => {
    setLog((l) => [{ id: idRef.current++, text, type }, ...l].slice(0, 14));
  };

  const popDmg = (p: Omit<DmgPop, "id">) => {
    const id = idRef.current++;
    setPops((arr) => [...arr, { id, ...p }]);
    setTimeout(() => setPops((arr) => arr.filter((x) => x.id !== id)), 900);
  };

  // Battle tick
  useEffect(() => {
    if (!running || status !== "fighting") return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [running, status]);

  useEffect(() => {
    if (tick === 0) return;
    if (status !== "fighting") return;

    // Evolution check
    if (tick % EVOLVE_TICKS === 0) {
      setStages((prev) => {
        const next = [...prev];
        ROSTER.forEach((m, i) => {
          if (next[i] < 2 && monHp[i] > 0) {
            next[i] = next[i] + 1;
            const newStage = m.stages[next[i]];
            setEvolveIdx(i);
            setTimeout(() => setEvolveIdx(null), 1200);
            pushLog(`${m.stages[next[i] - 1].name} evolved into ${newStage.name}!`, m.type);
          }
        });
        return next;
      });
    }

    // Each alive mon attacks in sequence
    ROSTER.forEach((mon, i) => {
      if (monHp[i] <= 0) return;
      const delay = i * 280;
      setTimeout(() => {
        const stage = stages[i];
        const data = mon.stages[stage];
        const crit = Math.random() < 0.2;
        const dmg = Math.round(data.dmg * (crit ? 1.7 : 1) * (0.85 + Math.random() * 0.3));
        setAttackingIdx(i);
        setTimeout(() => setAttackingIdx((cur) => (cur === i ? null : cur)), 450);
        setBossHit(true);
        setTimeout(() => setBossHit(false), 400);
        setBossHp((hp) => Math.max(0, hp - dmg));
        popDmg({ src: "boss", value: dmg, crit });
        pushLog(
          `${data.name} used ${data.ability}! ${crit ? "CRIT! " : ""}${dmg} dmg`,
          mon.type,
        );
      }, delay);
    });

    // Boss counter-attacks one random alive mon
    setTimeout(() => {
      if (bossHp <= 0) return;
      const aliveIdx = monHp.map((h, i) => (h > 0 ? i : -1)).filter((i) => i >= 0);
      if (aliveIdx.length === 0) return;
      const target = aliveIdx[Math.floor(Math.random() * aliveIdx.length)];
      const dmg = 8 + Math.floor(Math.random() * 9);
      setBossAttacking(true);
      setTimeout(() => setBossAttacking(false), 450);
      setHitMonIdx(target);
      setTimeout(() => setHitMonIdx((cur) => (cur === target ? null : cur)), 400);
      setMonHp((hps) => {
        const next = [...hps];
        next[target] = Math.max(0, next[target] - dmg);
        if (next[target] === 0) {
          pushLog(`${ROSTER[target].stages[stages[target]].name} fainted!`, "system");
        }
        return next;
      });
      popDmg({ src: "mon", monIndex: target, value: dmg, crit: false });
      pushLog(`Shadowlord struck ${ROSTER[target].stages[stages[target]].name} for ${dmg}!`, "boss");
    }, ROSTER.length * 280 + 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const reset = () => {
    setBossHp(BOSS_MAX_HP);
    setMonHp(ROSTER.map(() => MON_MAX_HP));
    setStages(ROSTER.map(() => 0));
    setTick(0);
    setRunning(true);
    setLog([{ id: idRef.current++, text: "A new SHADOWLORD appeared!", type: "system" }]);
  };

  const nextTickIn = TICK_MS / 1000;
  const ticksToEvolve = EVOLVE_TICKS - (tick % EVOLVE_TICKS);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[10px] tracking-wider text-primary sm:text-sm">
          PIXEL POCKET BRAWL
        </h1>
        <p className="text-[8px] text-muted-foreground sm:text-[10px]">
          Auto-battle · Abilities every 5s · Evolve every 15s
        </p>
      </header>

      {/* Boss arena */}
      <section className="relative rounded-lg border-4 border-border bg-panel p-4 shadow-[0_0_0_4px_oklch(0.14_0.04_265),0_8px_0_oklch(0.1_0.04_265)]">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-[8px] sm:text-[10px]">
              <span className="text-danger">SHADOWLORD</span>
              <span className="text-muted-foreground">
                HP {bossHp}/{BOSS_MAX_HP}
              </span>
            </div>
            <HpBar value={bossHp} max={BOSS_MAX_HP} big />
          </div>
        </div>
        <div className="relative flex h-56 items-center justify-center sm:h-72">
          <div
            className={`relative ${bossHit ? "anim-hit" : bossAttacking ? "anim-attack" : "anim-float"}`}
          >
            <img
              src={bossImg}
              alt="Shadowlord boss"
              width={512}
              height={512}
              className="pixel h-48 w-48 drop-shadow-[0_8px_0_rgba(0,0,0,0.5)] sm:h-64 sm:w-64"
            />
            {pops
              .filter((p) => p.src === "boss")
              .map((p) => (
                <span
                  key={p.id}
                  className="dmg-pop pointer-events-none absolute left-1/2 top-1/3 text-[10px] sm:text-sm"
                  style={{ color: p.crit ? "var(--color-electric)" : "var(--color-hp-low)" }}
                >
                  -{p.value}{p.crit ? "!" : ""}
                </span>
              ))}
          </div>
          {status !== "fighting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <div className="rounded border-2 border-border bg-panel px-4 py-3 text-center">
                <p className="text-[10px] sm:text-sm" style={{ color: status === "victory" ? "var(--color-hp)" : "var(--color-hp-low)" }}>
                  {status === "victory" ? "VICTORY!" : "DEFEAT..."}
                </p>
                <button
                  onClick={reset}
                  className="mt-3 rounded border-2 border-border bg-primary px-3 py-2 text-[8px] text-primary-foreground transition hover:brightness-110 sm:text-[10px]"
                >
                  Battle Again
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Team */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {ROSTER.map((mon, i) => {
          const stage = stages[i];
          const data = mon.stages[stage];
          const hp = monHp[i];
          const fainted = hp <= 0;
          return (
            <div
              key={mon.id}
              className="relative flex flex-col items-center gap-2 rounded-md border-2 border-border bg-panel p-3"
              style={{ boxShadow: `inset 0 -4px 0 ${mon.color}` }}
            >
              <div className="flex w-full items-center justify-between text-[7px] sm:text-[8px]">
                <span style={{ color: mon.color }}>{mon.type.toUpperCase()}</span>
                <span className="text-muted-foreground">Lv.{stage + 1}</span>
              </div>
              <div className="relative h-20 w-20 sm:h-24 sm:w-24">
                <img
                  src={data.sprite}
                  alt={data.name}
                  width={512}
                  height={512}
                  loading="lazy"
                  className={`pixel h-full w-full object-contain transition ${fainted ? "opacity-25 grayscale" : ""} ${
                    attackingIdx === i ? "anim-attack" : hitMonIdx === i ? "anim-hit" : "anim-float"
                  } ${evolveIdx === i ? "anim-evolve" : ""}`}
                  style={{ filter: `drop-shadow(0 0 8px ${mon.color})` }}
                />
                {pops
                  .filter((p) => p.src === "mon" && p.monIndex === i)
                  .map((p) => (
                    <span
                      key={p.id}
                      className="dmg-pop pointer-events-none absolute left-1/2 top-0 text-[9px]"
                      style={{ color: "var(--color-hp-low)" }}
                    >
                      -{p.value}
                    </span>
                  ))}
              </div>
              <p className="text-center text-[8px] sm:text-[9px]" style={{ color: mon.color }}>
                {data.name}
              </p>
              <p className="text-center text-[7px] text-muted-foreground sm:text-[8px]">
                {data.ability} · {data.dmg}
              </p>
              <HpBar value={hp} max={MON_MAX_HP} />
            </div>
          );
        })}
      </section>

      {/* Footer: status + log */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border-2 border-border bg-panel p-3 text-[8px] sm:text-[10px]">
          <p className="mb-2 text-primary">BATTLE STATUS</p>
          <p className="text-muted-foreground">Turn: {tick}</p>
          <p className="text-muted-foreground">Next ability in ~{nextTickIn}s</p>
          <p className="text-muted-foreground">Evolution in {ticksToEvolve * 5}s</p>
          <button
            onClick={() => setRunning((r) => !r)}
            className="mt-3 w-full rounded border-2 border-border bg-muted px-2 py-2 text-[8px] text-foreground transition hover:brightness-125 sm:text-[10px]"
          >
            {running ? "Pause" : "Resume"}
          </button>
          <button
            onClick={reset}
            className="mt-2 w-full rounded border-2 border-border bg-accent px-2 py-2 text-[8px] text-primary-foreground transition hover:brightness-110 sm:text-[10px]"
          >
            Restart
          </button>
        </div>
        <div className="rounded-md border-2 border-border bg-panel p-3 sm:col-span-2">
          <p className="mb-2 text-[8px] text-primary sm:text-[10px]">BATTLE LOG</p>
          <ul className="flex max-h-48 flex-col gap-1 overflow-hidden text-[8px] leading-relaxed sm:text-[10px]">
            {log.map((entry) => (
              <li
                key={entry.id}
                style={{
                  color:
                    entry.type === "system"
                      ? "var(--color-muted-foreground)"
                      : entry.type === "boss"
                      ? "var(--color-danger)"
                      : `var(--color-${entry.type})`,
                }}
              >
                &gt; {entry.text}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function HpBar({ value, max, big }: { value: number; max: number; big?: boolean }) {
  const pct = Math.max(0, (value / max) * 100);
  const color = pct > 50 ? "var(--color-hp)" : pct > 20 ? "var(--color-electric)" : "var(--color-hp-low)";
  return (
    <div
      className={`w-full overflow-hidden rounded-sm border-2 border-border bg-background ${big ? "h-4" : "h-2"}`}
    >
      <div
        className="h-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `inset 0 -2px 0 oklch(0 0 0 / 0.3)` }}
      />
    </div>
  );
}
