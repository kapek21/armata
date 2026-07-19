import fs from 'fs';
import path from 'path';

const ROOT = 'c:/Fundusz/Gry/Armata/src/levels';
const TIME = 180; // 3 minuty
const pad = (n) => String(n).padStart(2, '0');

const runCount = 20;
const castlePool = 10;
const kinds = Array.from({ length: runCount }, () => null);
for (let i = 3; i <= runCount; i += 3) kinds[i - 1] = 'castle';
let castlesPlaced = kinds.filter((k) => k === 'castle').length;
let remaining = Math.max(0, castlePool - castlesPlaced);
for (let i = runCount; i >= 1 && remaining > 0; i--) {
  if (kinds[i - 1] == null) {
    kinds[i - 1] = 'castle';
    remaining--;
  }
}
for (let i = 0; i < runCount; i++) if (kinds[i] == null) kinds[i] = 'siege';

let castleOrder = 0;
const slots = kinds.map((kind, i) => {
  const run = i + 1;
  if (kind === 'castle') {
    castleOrder++;
    return { run, kind, src: Math.min(castlePool, castleOrder) };
  }
  return { run, kind, src: run };
});

function load(slot, v = 1) {
  const file =
    slot.kind === 'castle'
      ? path.join(ROOT, 'run/data', `d${pad(slot.src)}-v${pad(v)}.json`)
      : path.join(ROOT, 'siege/data', `t${pad(slot.src)}-v${pad(v)}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function keystones(j) {
  return j.enemyCastle.modules.filter(
    (m) => m.type === 'keystone' || m.importance === 'critical',
  ).length;
}

// Model czasu jednego strzału (s)
const AIM_SHOT = 4.5;
const BALL_FLIGHT = 1.8;
const POST_BALL = 0.35;
const PER_SHOT = AIM_SHOT + BALL_FLIGHT + POST_BALL; // ~6.65
const LEVEL_OVERHEAD = 2.0; // load + win delay + UI

function shotsNeeded(j, skill) {
  const ks = Math.max(1, keystones(j));
  const tier = j.siegeTier ?? j.runDifficulty ?? 1;
  let mult = skill === 'good' ? 1.25 : skill === 'avg' ? 1.9 : 2.8;
  if (tier >= 10) mult += skill === 'good' ? 0.15 : 0.35;
  if (tier >= 13) mult += skill === 'good' ? 0.2 : 0.4;
  if (j.blueprint || slotIsCastle(j)) {
    // zamki: często 2 tarcze + więcej przeszkód
    mult += skill === 'good' ? 0.15 : 0.25;
  }
  let shots = Math.ceil(ks * mult);
  shots = Math.max(ks, Math.min(j.ammoLimit, shots));
  return shots;
}

function slotIsCastle(j) {
  return typeof j.id === 'string' && j.id.startsWith('run-');
}

function simulate(skill) {
  let t = 0;
  let cleared = 0;
  const rows = [];
  for (const slot of slots) {
    const j = load(slot);
    const shots = shotsNeeded(j, skill);
    const levelTime = shots * PER_SHOT + LEVEL_OVERHEAD;
    if (t + levelTime > TIME) {
      const left = TIME - t;
      const shotsPossible = Math.max(0, Math.floor((left - LEVEL_OVERHEAD) / PER_SHOT));
      rows.push({
        slot: slot.run,
        kind: slot.kind,
        name: j.name,
        ammo: j.ammoLimit,
        ks: keystones(j),
        shots,
        levelTime: +levelTime.toFixed(1),
        status: 'timeout',
        shotsPossible,
        left: +left.toFixed(1),
      });
      break;
    }
    t += levelTime;
    cleared++;
    rows.push({
      slot: slot.run,
      kind: slot.kind,
      name: j.name,
      ammo: j.ammoLimit,
      ks: keystones(j),
      shots,
      levelTime: +levelTime.toFixed(1),
      tCum: +t.toFixed(1),
      status: 'clear',
    });
  }
  return { skill, cleared, timeUsed: +t.toFixed(1), timeLeft: +(TIME - t).toFixed(1), rows };
}

console.log(`Czas runu: ${TIME}s | ~${PER_SHOT.toFixed(2)}s / strzał | overhead ${LEVEL_OVERHEAD}s / cel\n`);

console.log('Slot | typ | ammo | tarcze | nazwa');
for (const slot of slots) {
  const j = load(slot);
  console.log(
    `${String(slot.run).padStart(2)} | ${slot.kind.padEnd(6)} | ${String(j.ammoLimit).padStart(2)} | ${keystones(j)} | ${j.name}`,
  );
}

for (const skill of ['good', 'avg', 'poor']) {
  const r = simulate(skill);
  console.log(`\n=== ${skill.toUpperCase()} → ${r.cleared}/20 celów w ${r.timeUsed}s (zostaje ${r.timeLeft}s) ===`);
  for (const p of r.rows) {
    if (p.status === 'clear') {
      console.log(
        `  #${p.slot} ${p.kind[0]} ks=${p.ks} ~${p.shots} strzałów ${p.levelTime}s (suma ${p.tCum}s) OK`,
      );
    } else {
      console.log(
        `  #${p.slot} ${p.kind[0]} timeout po ${p.left}s (trzeba ~${p.shots} strzałów / ${p.levelTime}s, zdążyłby ~${p.shotsPossible})`,
      );
    }
  }
}

// Bounds: theoretical max if 1 shot per level
const minShotsPerLevel = slots.map((s) => Math.max(1, keystones(load(s))));
let tFast = 0;
let maxTheo = 0;
for (let i = 0; i < slots.length; i++) {
  const dt = minShotsPerLevel[i] * PER_SHOT + LEVEL_OVERHEAD;
  if (tFast + dt > TIME) break;
  tFast += dt;
  maxTheo++;
}
console.log(`\nTeoretyczne maksimum (1 skuteczny strzał / tarczę, zero pudła): ${maxTheo}/20`);

let tSlow = 0;
let maxFullAmmo = 0;
for (const slot of slots) {
  const j = load(slot);
  const dt = j.ammoLimit * PER_SHOT + LEVEL_OVERHEAD;
  if (tSlow + dt > TIME) break;
  tSlow += dt;
  maxFullAmmo++;
}
console.log(`Jeśli zużywa CAŁĄ amunicję na każdy cel: ${maxFullAmmo}/20`);
