/**
 * v0.36.33: one Building Robot is guaranteed on stage 4 wave 2 and in the
 * stage 5 opening escort. The rest of each pool stays an equal roll.
 * Run: node tools/check-v03633.mjs
 */
import { readFileSync } from 'node:fs';
import {
  BUILDING_ROBOT_ID,
  MECH_GIANT_ID,
  ZOMBIE_LIBRARY_SKINS,
} from '../src/assets/zombieSprites.js';
import { APP_VERSION } from '../src/data/GameConfig.js';
import { getGoldByHP } from '../src/data/economy.js';
import {
  EARLY_STAGE_WAVES,
  STAGE4_ROBOT_PIN,
  STAGE5_BOSS_DPS,
  STAGE5_BOSS_HP,
  STAGE5_BOSS_ID,
  STAGE5_ROBOT_PIN,
  stageBalanceRows,
} from '../src/data/stageBalance.js';
import { EARLY_STAGE_POOLS, STAGE_5_ESCORTS, rosterForStage } from '../src/data/stageRoster.js';
import { BARRICADE_MAX_HP, waveDefsForStage } from '../src/data/waves.js';
import { WaveManager, waveSpawnNominalSec } from '../src/systems/WaveManager.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${msg}`);
  }
}

assert(pkg.version === '0.36.33' && APP_VERSION === '0.36.33', 'version is 0.36.33');
assert(html.includes('ZombieDefend v0.36.33'), 'document title is v0.36.33');
assert(readme.includes('**v0.36.33:**'), 'readme stamps v0.36.33');
assert(BUILDING_ROBOT_ID === 'building-robot', 'wired id is building-robot');
assert(MECH_GIANT_ID === 'mech-giant', 'mech id is mech-giant');

const robot = ZOMBIE_LIBRARY_SKINS[BUILDING_ROBOT_ID];
assert(robot?.actions?.walk === 'zombie-building-robot-walk', 'robot walk key');
assert(robot?.actions?.attack === 'zombie-building-robot-attack', 'robot attack key');
assert(robot?.actions?.hurt === 'zombie-building-robot-hurt', 'robot hurt key');
assert(robot?.actions?.death === 'zombie-building-robot-die1', 'robot death key');
assert(robot?.frameWidth === 92 && robot?.frameHeight === 92, 'robot cell stays 92');
assert(!robot?.bossSkills, 'robot skill is not a boss damage cast');

const mech = ZOMBIE_LIBRARY_SKINS[MECH_GIANT_ID];
assert(mech?.actions?.walk === 'zombie-mech-giant-walk-normal', 'mech walk key');
assert(mech?.frameWidth === 200 && mech?.frameHeight === 200, 'mech cell stays 200');

const S4_IDS = [
  'office-worker-v2',
  'delivery',
  'chef',
  's4-construction',
  's4-schoolgirl',
  'slime',
  'sprinter',
  'exploder',
  'nurse',
  'cyborg',
  'trashcan',
  'riot',
  's4-salaryman',
  'building-robot',
];
assert(rosterForStage(4).join() === S4_IDS.join(), 'stage 4 pool is the 14-id equal list');
assert(new Set(rosterForStage(4)).size === 14, 'stage 4 does not weight any id twice');
assert(!rosterForStage(4).includes(MECH_GIANT_ID), 'mech stays off stage 4');
assert(!rosterForStage(1).includes(BUILDING_ROBOT_ID), 'stage 1 does not roll the robot');
assert(!rosterForStage(2).includes(BUILDING_ROBOT_ID), 'stage 2 does not roll the robot');
assert(!rosterForStage(3).includes(BUILDING_ROBOT_ID), 'stage 3 does not roll the robot');

const S5_IDS = [
  'sprinter',
  'riot',
  'trashcan',
  'cyborg',
  'exploder',
  'slime',
  's4-construction',
  'building-robot',
  'mech-giant',
];
assert(STAGE_5_ESCORTS.join() === S5_IDS.join(), 'stage 5 escorts stay the 9-id equal list');
assert(new Set(STAGE_5_ESCORTS).size === 9, 'escorts do not weight any id twice');
assert(EARLY_STAGE_POOLS[5][0] === STAGE5_BOSS_ID, 'stage 5 roster still leads with Balun');
assert(!STAGE_5_ESCORTS.includes(STAGE5_BOSS_ID), 'Balun is not an escort roll');

const s4rows = stageBalanceRows(4);
assert(s4rows.map((row) => [row.count, row.hp, row.speed, row.dps, row.gold].join('/')).join(' | ')
  === '11/94/36/7/24 | 12/141/40/9/31 | 12/188/44/12/39 | 15/235/42/14/48',
  'stage 4 counts, HP, speed, DPS, and gold stay');
const s5rows = stageBalanceRows(5);
assert(s5rows.map((row) => [row.count, row.hp, row.speed, row.dps, row.gold].join('/')).join(' | ')
  === `3/94/36/7/24 | 1/${STAGE5_BOSS_HP}/28/${STAGE5_BOSS_DPS}/50 | 3/141/40/9/31 | 2/188/42/12/39`,
  'stage 5 escort and Balun rows stay');
assert(STAGE5_BOSS_HP === 4700 && STAGE5_BOSS_DPS === 42, 'Balun stays 4700 HP and 42 contact DPS');
assert(BARRICADE_MAX_HP === 1440, 'barricade max HP stays 1440');
assert(getGoldByHP(94) === 10 && getGoldByHP(141) === 15 && getGoldByHP(188) === 20, 'gold table bands stay');
assert(getGoldByHP(235) === 25 && getGoldByHP(4700) === 50, 'gold table ceiling stays');

const s4defs = waveDefsForStage(4);
assert(EARLY_STAGE_WAVES[4][1].guaranteeSkin === BUILDING_ROBOT_ID, 'the stage 4 table itself carries the pin');
assert(s4defs[1].wave === STAGE4_ROBOT_PIN.wave, 'stage 4 pin is wave 2');
assert(s4defs[1].guaranteeSkin === BUILDING_ROBOT_ID && s4defs[1].guaranteeIndex === 5, 'stage 4 pins spawn index 5');
assert(s4defs[1].total === 12, 'stage 4 wave 2 still spawns 12');
for (const index of [0, 2, 3]) {
  assert(!s4defs[index].guaranteeSkin, `stage 4 wave ${s4defs[index].wave} is not pinned`);
}
assert(s4defs[0].archetypes[0].skins.join() === s4defs[3].archetypes[0].skins.join(), 'wave 1 and wave 4 share the equal pool');
assert(s4defs.every((def) => def.archetypes.length === 1 && def.archetypes[0].skins.filter((id) => id === BUILDING_ROBOT_ID).length === 1), 'robot is one equal entry on every stage 4 wave');

const s4nominal = waveSpawnNominalSec(s4defs[1], STAGE4_ROBOT_PIN.index);
assert(Math.abs(s4nominal - 30.625) < 1e-9, `stage 4 pin nominal is 30.625s (${s4nominal})`);
assert(s4nominal < 40 && s4nominal > 21, 'stage 4 pin sits inside wave 2, before a wave-3 death');

const s5defs = waveDefsForStage(5);
assert(s5defs[0].guaranteeSkin === BUILDING_ROBOT_ID && s5defs[0].guaranteeIndex === STAGE5_ROBOT_PIN.index, 'stage 5 pins the opening escort');
assert(s5defs[0].wave === 1 && s5defs[0].total === 3, 'stage 5 pin is one of the three opening escorts');
assert(!s5defs[1].guaranteeSkin && s5defs[1].archetypes[0].skins.join() === STAGE5_BOSS_ID, 'boss wave is only Balun');
assert(s5defs[1].archetypes[0].hp === STAGE5_BOSS_HP && s5defs[1].archetypes[0].dps === STAGE5_BOSS_DPS && s5defs[1].archetypes[0].gold === 50, 'boss row numbers stay');
for (const index of [2, 3]) {
  assert(!s5defs[index].guaranteeSkin, `stage 5 wave ${s5defs[index].wave} escort is not pinned`);
  assert(s5defs[index].archetypes[0].skins.join() === STAGE_5_ESCORTS.join(), `stage 5 wave ${s5defs[index].wave} keeps the escort pool`);
}
assert(s5defs[0].archetypes[0].skins.includes(MECH_GIANT_ID) && s5defs[0].archetypes[0].skins.includes(BUILDING_ROBOT_ID), 'opening escort list still has mech and robot');
const s5nominal = waveSpawnNominalSec(s5defs[0], STAGE5_ROBOT_PIN.index);
assert(Math.abs(s5nominal - 8) < 1e-9, `stage 5 pin nominal is 8s (${s5nominal})`);
assert(s5nominal < s5defs[1].startSec, 'the pinned escort spawns before Balun');

for (const stage of [1, 2, 3]) {
  for (const def of waveDefsForStage(stage)) {
    assert(!def.guaranteeSkin, `stage ${stage} wave ${def.wave} has no robot pin`);
  }
}

function withRandom(value, fn) {
  const prev = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

const forcedS4 = withRandom(0, () => new WaveManager({ stage: 4 }));
const s4wave2 = forcedS4.queue.filter((intent) => intent.wave === 2);
const s4robots = s4wave2.filter((intent) => intent.archetype.skin === BUILDING_ROBOT_ID);
assert(forcedS4.totalPlanned === 50, 'stage 4 still plans 50 bodies');
assert(s4wave2.length === 12 && s4robots.length === 1, 'a roll that never picks robot still places exactly one on wave 2');
assert(s4wave2.filter((intent) => intent.archetype.skin === 'office-worker-v2').length === 11, 'the other wave 2 slots keep the pool roll');
const pinnedS4 = s4robots[0];
const s4jitter = (0 - 0.5) * (21 / 12) * 0.6;
assert(Math.abs(pinnedS4.time - (s4nominal + s4jitter)) < 1e-9, 'pinned stage 4 time is the nominal slot plus jitter');
assert(pinnedS4.time < 40, 'pinned stage 4 body is on the field before 40s');
assert(pinnedS4.archetype.hp === 141 && pinnedS4.archetype.speed === 40 && pinnedS4.archetype.dps === 9 && pinnedS4.archetype.gold === 31, 'pinned robot uses the wave 2 row');
assert(forcedS4.queue.filter((intent) => intent.wave === 1 && intent.archetype.skin === BUILDING_ROBOT_ID).length === 0, 'the force is not a wave 1 weight');
assert(forcedS4.queue.filter((intent) => intent.wave === 4 && intent.archetype.skin === BUILDING_ROBOT_ID).length === 0, 'the force is not deferred to wave 4');

const forcedS5 = withRandom(0, () => new WaveManager({ stage: 5 }));
const s5wave1 = forcedS5.queue.filter((intent) => intent.wave === 1);
const s5robots = s5wave1.filter((intent) => intent.archetype.skin === BUILDING_ROBOT_ID);
assert(forcedS5.totalPlanned === 9, 'stage 5 still plans 9 bodies');
assert(s5wave1.length === 3 && s5robots.length === 1, 'a roll that never picks robot still places exactly one opening escort');
assert(s5wave1.filter((intent) => intent.archetype.skin === 'sprinter').length === 2, 'the other opening escorts keep the pool roll');
const pinnedS5 = s5robots[0];
const s5jitter = (0 - 0.5) * (16 / 3) * 0.6;
assert(Math.abs(pinnedS5.time - (s5nominal + s5jitter)) < 1e-9, 'pinned escort time is the nominal slot plus jitter');
assert(pinnedS5.time < 17, 'pinned escort is out before Balun');
assert(pinnedS5.archetype.hp === 94 && pinnedS5.archetype.speed === 36 && pinnedS5.archetype.dps === 7 && pinnedS5.archetype.gold === 24, 'pinned escort uses the escort row');
const bossIntents = forcedS5.queue.filter((intent) => intent.wave === 2);
assert(bossIntents.length === 1 && bossIntents[0].archetype.skin === STAGE5_BOSS_ID, 'boss spawn stays Balun');
assert(bossIntents[0].archetype.hp === 4700 && bossIntents[0].archetype.dps === 42, 'boss combat numbers stay on the spawn');
assert(forcedS5.queue.filter((intent) => intent.wave !== 2 && intent.archetype.skin === MECH_GIANT_ID).length === 0, 'mech is a roll, not a second pin');
assert(forcedS5.queue.filter((intent) => intent.wave > 2 && intent.archetype.skin === BUILDING_ROBOT_ID).length === 0, 'later escorts are not forced to robot');

const seenS4 = new Set();
for (let i = 0; i < 40; i += 1) {
  const wm = new WaveManager({ stage: 4 });
  const earlyRobot = wm.queue.filter((intent) => intent.wave === 2 && intent.archetype.skin === BUILDING_ROBOT_ID && intent.time < 42);
  assert(earlyRobot.length >= 1, `stage 4 run ${i} has a wave 2 robot before 42s`);
  const wave2other = wm.queue.filter((intent) => intent.wave === 2 && intent.archetype.skin !== BUILDING_ROBOT_ID);
  assert(wave2other.length >= 1, `stage 4 run ${i} wave 2 still has another skin`);
  for (const intent of wm.queue) seenS4.add(intent.archetype.skin);
}
assert([...seenS4].sort().join() === [...S4_IDS].sort().join(), `stage 4 runs still cover the whole pool (${[...seenS4].sort().join()})`);

const seenEscort = new Set();
for (let i = 0; i < 40; i += 1) {
  const wm = new WaveManager({ stage: 5 });
  const opening = wm.queue.filter((intent) => intent.wave === 1 && intent.archetype.skin === BUILDING_ROBOT_ID && intent.time < 16);
  assert(opening.length >= 1, `stage 5 run ${i} has a robot in the opening escort`);
  const bosses = new Set(wm.queue.filter((intent) => intent.wave === 2).map((intent) => intent.archetype.skin));
  assert(bosses.size === 1 && bosses.has(STAGE5_BOSS_ID), `stage 5 run ${i} boss is only Balun`);
  const escorts = wm.queue.filter((intent) => intent.wave !== 2);
  assert(escorts.length === 8, `stage 5 run ${i} still has 8 escorts`);
  assert(escorts.some((intent) => intent.archetype.skin !== BUILDING_ROBOT_ID), `stage 5 run ${i} escorts are not all robots`);
  for (const intent of escorts) seenEscort.add(intent.archetype.skin);
}
assert(seenEscort.has(MECH_GIANT_ID), 'stage 5 runs still spawn mech-giant');
assert([...seenEscort].sort().join() === [...S5_IDS].sort().join(), `escort runs still cover the 9-id pool (${[...seenEscort].sort().join()})`);

const fallback = withRandom(0, () => new WaveManager({
  stage: 4,
  waveDefs: [{
    wave: 2,
    startSec: 21,
    endSec: 42,
    total: 5,
    guaranteeSkin: BUILDING_ROBOT_ID,
    archetypes: [{ hp: 141, speed: 40, dps: 9, weight: 1, variant: 'walker', skins: ['slime', 'chef'], gold: 31 }],
  }],
}));
const fallbackRobots = fallback.queue.filter((intent) => intent.archetype.skin === BUILDING_ROBOT_ID);
assert(fallbackRobots.length === 1, 'a pin with no index uses the middle spawn');
assert(fallback.queue.filter((intent) => intent.archetype.skin === 'slime').length === 4, 'the unpinned fallback slots still roll');

const pMissS4 = (13 / 14) ** 23;
const pMissS5 = (8 / 9) ** 8;
const pMissOpen = (8 / 9) ** 3;
const pMech7 = 1 - (8 / 9) ** 7;
console.log(`v0.36.32 stage 4 P(no robot in 23 spawns through wave 2) = ${pMissS4.toFixed(4)}`);
console.log(`v0.36.32 stage 5 P(no robot in 8 escorts) = ${pMissS5.toFixed(4)}`);
console.log(`v0.36.32 stage 5 P(no robot in the 3 opening escorts) = ${pMissOpen.toFixed(4)}`);
console.log(`v0.36.33 unpinned escort P(at least one mech in 7) = ${pMech7.toFixed(4)}`);
console.log(`stage 4 pin nominal ${s4nominal}s, forced time ${pinnedS4.time}s`);
console.log(`stage 5 pin nominal ${s5nominal}s, forced time ${pinnedS5.time}s`);

if (failed) {
  console.error(`${failed} v0.36.33 check(s) failed`);
  process.exit(1);
}
console.log('v0.36.33 checks passed');
