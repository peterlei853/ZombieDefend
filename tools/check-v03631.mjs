/**
 * v0.36.31: thinner feet, lane dodge, pet stand-attack,
 * stage 4 waves, stage 5 Balun.
 * Run: node tools/check-v03631.mjs
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/data/GameConfig.js';
import { getGoldByHP } from '../src/data/economy.js';
import {
  EARLY_STAGE_WAVES,
  STAGE5_BOSS_BASELINE,
  STAGE5_BOSS_DPS,
  STAGE5_BOSS_HP,
  STAGE5_BOSS_ID,
  stageBalanceRows,
} from '../src/data/stageBalance.js';
import {
  EARLY_STAGE_POOLS,
  PLAYABLE_STAGE_CAP,
  STAGE_1_MIX,
  STAGE_5_ESCORTS,
  rosterForStage,
  shopOffersNext,
} from '../src/data/stageRoster.js';
import { BARRICADE_MAX_HP, WAVE_DEFS, waveDefsForStage } from '../src/data/waves.js';
import {
  S4_SALARYMAN_ID,
  ZOMBIE_BOSS_SKINS,
  ZOMBIE_LIBRARY_SKINS,
} from '../src/assets/zombieSprites.js';
import { meleeStandPoint } from '../src/systems/PetCombat.js';
import {
  BOSS_FEET_WIDTH_RATIO,
  FEET_WIDTH_RATIO,
  feetWidthFromDisplay,
  separateFootprints,
} from '../src/systems/footprints.js';
import { layoutPx } from '../src/systems/DepthView.js';
import { GAME_CONFIG } from '../src/data/GameConfig.js';
import { titleStageButtonFrames } from '../src/scenes/titleStageButtons.js';
import { Zombie } from '../src/entities/Zombie.js';
import { WaveManager } from '../src/systems/WaveManager.js';
import { phaserIndexForCatalogFrame } from '../src/data/enemyShowcase.js';

let failed = 0;
function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert(pkg.version === '0.36.31' && APP_VERSION === '0.36.31', 'version is 0.36.31');
assert(BARRICADE_MAX_HP === 1440, 'barricade max HP stays 1440');
assert(getGoldByHP(40) === 10 && getGoldByHP(120) === 15 && getGoldByHP(300) === 50, 'gold-by-HP table stays put');
assert(getGoldByHP(4700) === 50, 'boss HP still uses the existing ceiling');
assert(PLAYABLE_STAGE_CAP === 5, 'stages 1–5 are playable');
assert(WAVE_DEFS[0].archetypes[0].hp === 40, 'legacy WAVE_DEFS stay');

const officeFeet = feetWidthFromDisplay(84);
const constructionFeet = feetWidthFromDisplay(88);
const bossFeet = feetWidthFromDisplay(128, BOSS_FEET_WIDTH_RATIO);
assert(FEET_WIDTH_RATIO <= 0.32 && officeFeet < 30 && officeFeet > 16, `office feet ${officeFeet} follow the legs`);
assert(constructionFeet < 32 && constructionFeet < 88 * 0.5, 'construction feet are thinner than the 88 canvas');
assert(bossFeet < 70 && bossFeet > 40, `balun feet ${bossFeet} follow the sole, not 128`);

const rear = {
  kind: 'zombie',
  id: 2,
  x: 0,
  y: 400,
  footprintWidth: () => 30,
  footprintHeight: () => 84,
  shift(dx, dy) {
    this.x += dx;
    this.y += dy;
    return true;
  },
};
const front = {
  kind: 'zombie',
  id: 3,
  x: 10,
  y: 400,
  footprintWidth: () => 30,
  footprintHeight: () => 84,
  shift(dx, dy) {
    this.x += dx;
    this.y += dy;
    return true;
  },
};
separateFootprints([rear, front], { rounds: 6 });
assert(rear.x >= -0.5, `rear marcher is not shoved back (${rear.x})`);
assert(Math.abs(rear.y - front.y) > 6, `rear marcher dodges in Y (${rear.y} vs ${front.y})`);

const locked = {
  kind: 'zombie',
  id: 4,
  x: 0,
  y: 420,
  footprintWidth: () => 30,
  footprintHeight: () => 84,
  shift() {
    return false;
  },
};
const ahead = {
  kind: 'zombie',
  id: 5,
  x: 8,
  y: 420,
  footprintWidth: () => 30,
  footprintHeight: () => 84,
  shift(dx, dy) {
    this.x += dx;
    this.y += dy;
    return true;
  },
};
separateFootprints([locked, ahead], { rounds: 4 });
assert(locked.x === 0 && locked.y === 420, 'hurt-locked sole stays planted');
assert(ahead.y !== 420 || ahead.x !== 8, 'the other sole takes the separation');
assert(locked.x === 0 && locked.y === 420, 'fence gap does not move a hurt-locked sole');

const fenceRear = {
  kind: 'zombie',
  id: 8,
  x: layoutPx(700),
  y: 400,
  footprintWidth: () => 28,
  footprintHeight: () => 84,
  shift(dx, dy) {
    this.x += dx;
    this.y += dy;
    return true;
  },
};
const fenceFront = {
  kind: 'zombie',
  id: 9,
  x: layoutPx(700) + 12,
  y: 400,
  footprintWidth: () => 28,
  footprintHeight: () => 84,
  shift(dx, dy) {
    this.x += dx;
    this.y += dy;
    return true;
  },
};
separateFootprints([fenceRear, fenceFront], { rounds: 6 });
assert(fenceRear.x >= layoutPx(700) - 1, 'a fence pack is not shoved back down the road');
assert(Math.abs(fenceRear.y - fenceFront.y) >= layoutPx(36) - 1, `fence pack splits lanes (${fenceRear.y} vs ${fenceFront.y})`);

const slots = titleStageButtonFrames(1280, 720);
assert(slots.frames.length === 5, 'title draws five stage buttons');
assert(slots.frames.every((slot) => slot.gated === false), 'stages 1–5 are live, none say SOON');
for (const slot of slots.frames) {
  assert(slot.x - slot.w / 2 >= slots.inner.l - 0.5, `stage ${slot.stage} stays inside the parchment left`);
  assert(slot.x + slot.w / 2 <= slots.inner.r + 0.5, `stage ${slot.stage} stays inside the parchment right`);
  assert(slot.y >= slots.inner.t && slot.y <= slots.inner.b, `stage ${slot.stage} sits on the parchment`);
}
assert(shopOffersNext(4) === true, 'shop Next from stage 4 enters stage 5');
assert(shopOffersNext(5) === false, 'shop after stage 5 returns to the title');

const range = layoutPx(GAME_CONFIG.PETS.MELEE.RANGE);
const held = meleeStandPoint(500, 400, 500 - range + 8, 400);
assert(held.hold === true && held.x === 500, 'a pet already in range keeps its X');
const approach = meleeStandPoint(800, 400, 200, 420);
assert(approach.hold === false && approach.x === 200 + range, 'out of range, the stand is the melee edge');
assert(approach.x > 200 + range * 0.7, 'the stand is not the old 0.7 walk-in');

const stander = Object.create(Zombie.prototype);
stander.alive = true;
stander.atBarricade = false;
stander._isSprite = true;
stander._haltX = null;
stander._attackCooldown = 0.4;
stander._marchVx = 0;
stander._attackBeat = false;
stander.petBiteTarget = null;
stander.body = {
  x: 300,
  y: 400,
  displayWidth: 48,
  anims: { stop() {}, currentAnim: null, isPlaying: false },
};
stander.scene = { tweens: { killTweensOf() {} } };
stander.hurtMarchLocked = () => false;
stander._standHitReach = () => range;
stander._clearAttackContact = () => {};
stander._playAttackPunch = () => {
  stander.punched = true;
};
stander._stopWalkAnim = () => {};
const walked = stander._chasePet(0.16, { x: 300 + range + 40, y: 400 }, 900);
assert(walked === false && stander.body.x === 300 && stander.body.y === 400, 'an out-of-range pet does not pull the zombie');
const bit = stander._chasePet(0.16, { x: 300 + range - 6, y: 404 }, 900);
assert(bit === true && stander.body.x === 300 && stander.body.y === 400, 'an in-range pet is bitten in place');
assert(stander.petBiteTarget && stander.petBiteTarget.x === 300 + range - 6, 'the bite target is the pet');

assert(rosterForStage(1).join() === STAGE_1_MIX.join(), 'stage 1 roster is the mix');
assert(rosterForStage(1).includes('slime') && !rosterForStage(1).includes('nurse'), 'stage 1 gains slime and not nurse');
assert(rosterForStage(2).includes('sprinter') && rosterForStage(2).includes('exploder') && !rosterForStage(2).includes('nurse'), 'stage 2 adds sprinter and exploder');
assert(rosterForStage(3).includes('nurse') && rosterForStage(3).includes('cyborg') && rosterForStage(3).includes('trashcan'), 'stage 3 adds nurse, cyborg, trashcan');
assert(rosterForStage(4).includes('riot') && rosterForStage(4).includes(S4_SALARYMAN_ID), 'stage 4 adds riot and salaryman');
for (let stage = 1; stage <= 3; stage += 1) {
  for (const id of rosterForStage(stage)) {
    assert(rosterForStage(stage + 1).includes(id), `stage ${stage + 1} keeps ${id}`);
  }
  assert(rosterForStage(stage + 1).length > rosterForStage(stage).length, `stage ${stage + 1} is a wider pool`);
}
assert(!rosterForStage(4).includes('s4-delivery'), 's4-delivery stays unwired');
assert(ZOMBIE_LIBRARY_SKINS[S4_SALARYMAN_ID]?.actions?.walk === 'zombie-s4-salaryman-walk', 'salaryman walk key');
assert(ZOMBIE_LIBRARY_SKINS[S4_SALARYMAN_ID]?.actions?.death === 'zombie-s4-salaryman-die', 'salaryman die key');

const s3 = stageBalanceRows(3);
const s4 = stageBalanceRows(4);
assert(s4.length === 4, 'stage 4 has four waves');
assert(s4[0].hp === 94 && s4[0].count === 11 && s4[0].dps === 7 && s4[0].gold === 24, 'stage 4 wave 1');
assert(s4[3].hp === 235 && s4[3].count === 15 && s4[3].dps === 14 && s4[3].gold === 48, 'stage 4 wave 4 is the boss baseline');
assert(s4[3].hp > s3[3].hp && s4[3].count > s3[3].count && s4[3].dps > s3[3].dps, 'stage 4 is harder than stage 3');
assert(s4.every((row) => row.skins.includes('s4-salaryman') && row.skins.includes('riot') && row.skins.includes('nurse')), 'stage 4 waves list the new skins');
assert(EARLY_STAGE_WAVES[1][0].archetypes[0].hp === 34 && EARLY_STAGE_WAVES[3][3].archetypes[0].hp === 168, 'stages 1–3 rows stay');
assert(!stageBalanceRows(1).some((row) => row.skins.includes('nurse')), 'stage 1 waves have no nurse');
assert(!stageBalanceRows(2).some((row) => row.skins.includes('nurse')), 'stage 2 waves have no nurse');

assert(STAGE5_BOSS_BASELINE.hp === 235 && STAGE5_BOSS_BASELINE.dps === 14, 'baseline is the stage 4 wave-4 walker');
assert(STAGE5_BOSS_HP === 235 * 20 && STAGE5_BOSS_DPS === 14 * 3, 'boss is 20× HP and 3× DPS');
const bossWave = waveDefsForStage(5)[1];
assert(bossWave.total === 1 && bossWave.archetypes[0].hp === STAGE5_BOSS_HP, 'stage 5 wave 2 is one boss');
assert(bossWave.archetypes[0].dps === STAGE5_BOSS_DPS && bossWave.archetypes[0].gold === 50, 'boss contact and gold');
assert(bossWave.archetypes[0].skins.join() === STAGE5_BOSS_ID, 'boss skin is lava-balon');
assert(STAGE_5_ESCORTS.includes('sprinter') && !STAGE_5_ESCORTS.includes('nurse'), 'escorts are not the nurse line');
assert(waveDefsForStage(5)[0].archetypes[0].skins.join() === STAGE_5_ESCORTS.join(), 'wave 1 uses the escort pool');

const skills = ZOMBIE_BOSS_SKINS[STAGE5_BOSS_ID].bossSkills;
assert(skills?.length === 3, 'balun has three combat skills');
const index = JSON.parse(readFileSync(new URL('../assets/library/asset-index.json', import.meta.url), 'utf8'));
for (const skill of skills) {
  const strip = index.assets.find((row) => row.key === skill.anim);
  const fx = index.assets.find((row) => row.key === skill.fx);
  assert(!!strip && strip.frames > 1, `index has ${skill.anim}`);
  assert(!!fx && fx.frames > 1, `index has ${skill.fx}`);
  assert(strip.category === 'bosses' && fx.category === 'bosses', `${skill.anim} loads with bosses`);
  const png = readFileSync(new URL(`../${strip.path}`, import.meta.url));
  assert(png.readUInt32BE(16) === strip.frameWidth * strip.frames, `${skill.anim} png width`);
  const fxPng = readFileSync(new URL(`../${fx.path}`, import.meta.url));
  assert(fxPng.readUInt32BE(16) > 0, `${skill.fx} png exists`);
}

const fired = [];
const boss = Object.create(Zombie.prototype);
boss.alive = true;
boss._isSprite = true;
boss.skin = ZOMBIE_BOSS_SKINS[STAGE5_BOSS_ID];
boss.dps = STAGE5_BOSS_DPS;
boss._skillBlocker = null;
boss._skillsFired = 0;
boss._showcaseToken = 0;
boss._attackContactToken = 0;
boss._attackContactHandler = null;
/** @type {Function|null} */
let onUpdate = null;
boss.body = {
  x: 240,
  y: 400,
  depth: 3,
  scaleX: 1,
  play(key) {
    this.played = key;
    return this;
  },
  once() {},
  on(event, fn) {
    if (event === 'animationupdate') onUpdate = fn;
  },
  off() {},
  anims: { currentAnim: null, currentFrame: null, isPlaying: false },
};
boss.scene = {
  anims: {
    exists: (key) => skills.some((skill) => skill.anim === key),
    get: () => ({ frames: new Array(12), frameRate: 10, repeat: 0 }),
  },
  audio: { playEnemyCue(_id, cue) { fired.push(cue); } },
  events: { emit(name, payload) { fired.push({ name, ...payload }); } },
  add: null,
};
boss._animReady = (key) => boss.scene.anims.exists(key);
const cast = boss._castBossSkill(skills[0]);
assert(cast === true, boss._skillBlocker || 'slam cast failed');
assert(boss.body.played === 'zombie-boss-lava-lava_slam', 'slam strip plays');
assert(fired.includes('skill-lava_slam'), 'slam cue fires');
assert(typeof onUpdate === 'function', 'slam waits for the impact frame');
const impact = phaserIndexForCatalogFrame(skills[0].impactFrame);
boss.atBarricade = true;
onUpdate({ key: skills[0].anim }, { index: impact });
assert(boss._lastSkillFx === 'zombie-boss-lava-fx-slam', `slam FX fired (${boss._skillBlocker || 'no blocker'})`);
assert(fired.some((row) => row.fx === 'zombie-boss-lava-fx-slam'), 'slam impact emits the fx key');
assert((boss._skillBurst || 0) > 0, 'slam queues a hit');

for (const skill of skills.slice(1)) {
  onUpdate = null;
  const ok = boss._castBossSkill(skill);
  assert(ok === true, boss._skillBlocker || `${skill.anim} cannot fire`);
  const frame = phaserIndexForCatalogFrame(skill.impactFrame);
  onUpdate({ key: skill.anim }, { index: frame });
  assert(boss._lastSkillFx === skill.fx, `${skill.anim} impact fx`);
}

const seenBoss = new Set();
for (let i = 0; i < 8; i += 1) {
  const wm = new WaveManager({ stage: 5 });
  for (const intent of wm.queue) {
    if (intent.wave === 2) seenBoss.add(intent.archetype.skin);
  }
}
assert(seenBoss.has('lava-balon') && seenBoss.size === 1, `stage 5 wave 2 spawns only balun (${[...seenBoss].join()})`);

assert(EARLY_STAGE_POOLS[4].includes('s4-salaryman'), 'stage 4 pool includes salaryman');
assert(!ZOMBIE_LIBRARY_SKINS['s4-delivery'], 's4-delivery stays unwired');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('v0.36.31 checks passed');
console.log(`boss ${STAGE5_BOSS_ID} hp ${STAGE5_BOSS_HP} (${STAGE5_BOSS_HP_MULT_TEXT()}) dps ${STAGE5_BOSS_DPS} vs baseline ${STAGE5_BOSS_BASELINE.hp}/${STAGE5_BOSS_BASELINE.dps}`);

function STAGE5_BOSS_HP_MULT_TEXT() {
  return `${STAGE5_BOSS_HP / STAGE5_BOSS_BASELINE.hp}× HP, ${STAGE5_BOSS_DPS / STAGE5_BOSS_BASELINE.dps}× DPS`;
}
