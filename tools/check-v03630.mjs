/**
 * v0.36.30 gameplay slice: S4 construction + schoolgirl on stages 1–3,
 * early HP ×1.4, wave totals ×1.35, barricade 1440.
 * Run: node tools/check-v03630.mjs
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION, DEMO_ENEMY_IDS } from '../src/data/GameConfig.js';
import { getGoldByHP } from '../src/data/economy.js';
import { EARLY_STAGE_WAVES, stageBalanceRows } from '../src/data/stageBalance.js';
import { EARLY_STAGE_POOLS, STAGE_1_MIX, rosterForStage } from '../src/data/stageRoster.js';
import { BARRICADE_MAX_HP, WAVE_DEFS, waveDefsForStage } from '../src/data/waves.js';
import {
  S4_EARLY_SKIN_IDS,
  S4_FRAME_SIZE,
  ZOMBIE_LIBRARY_SKINS,
  ZOMBIE_ORIGIN_X,
  ZOMBIE_ORIGIN_Y,
} from '../src/assets/zombieSprites.js';
import { ENEMY_SFX_FILES, attackContactFrame, enemySfxClips } from '../src/data/enemyShowcase.js';
import { WaveManager } from '../src/systems/WaveManager.js';
import { Zombie } from '../src/entities/Zombie.js';

let failed = 0;
function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert(pkg.version === '0.36.30' && APP_VERSION === '0.36.30', 'version is 0.36.30');
assert(BARRICADE_MAX_HP === 1440, 'barricade max HP is 1440');
assert(getGoldByHP(40) === 10 && getGoldByHP(120) === 15 && getGoldByHP(300) === 50, 'gold-by-HP table stays put');
assert(WAVE_DEFS.map((def) => def.total).join() === '5,6,10,48', 'stage 4+ totals stay');
assert(WAVE_DEFS[0].archetypes[0].hp === 40, 'stage 4+ wave 1 HP stays 40');
assert(WAVE_DEFS[3].archetypes.map((row) => row.hp).join() === '50,115,165', 'stage 4+ wave 4 HP mix stays');
assert(waveDefsForStage(4)[0].total === 5 && waveDefsForStage(4)[0].archetypes[0].hp === 40, 'stage 4 still stamps WAVE_DEFS');
assert(waveDefsForStage(4).every((def) => def.archetypes.every((row) => row.skins.join() === 'nurse')), 'stage 4 stays nurse');
assert(waveDefsForStage(5).every((def) => def.archetypes.every((row) => row.skins.join() === 'brute')), 'stage 5 stays brute');

const S4 = ['s4-construction', 's4-schoolgirl'];
assert(S4_EARLY_SKIN_IDS.join() === S4.join(), 'wired S4 ids are construction and schoolgirl');
assert(STAGE_1_MIX.join() === ['office-worker-v2', 'delivery', 'chef', ...S4].join(), 'stage 1 pool appends both S4 ids');
assert(rosterForStage(1).join() === STAGE_1_MIX.join(), 'stage 1 roster is the mix');
assert(rosterForStage(2).join() === ['office-worker-v2', 'delivery', 'chef', ...S4].join(), 'stage 2 pool appends both S4 ids');
assert(
  rosterForStage(3).join() === ['office-worker-v2', 'delivery', 'chef', 'nurse', ...S4].join(),
  'stage 3 pool keeps nurse and appends both S4 ids',
);
assert(EARLY_STAGE_POOLS[1] === STAGE_1_MIX, 'stage 1 pool is the stage-1 alias');
for (const banned of ['sprinter', 'trashcan', 'riot', 'slime', 'exploder', 'cyborg', 'salaryman', 's4-delivery', 's4-salaryman']) {
  for (const stage of [1, 2, 3]) {
    assert(!rosterForStage(stage).includes(banned), `stage ${stage} does not spawn ${banned}`);
  }
}

/** Previous early rows, before the ×1.4 / ×1.35 pass. */
const BEFORE = {
  1: [
    { total: 4, hp: 24, speed: 26, dps: 2, gold: 8, window: '0–22s' },
    { total: 5, hp: 36, speed: 30, dps: 3, gold: 10, window: '23–44s' },
    { total: 3, hp: 30, speed: 28, dps: 2, gold: 16, window: '45–64s' },
    { total: 4, hp: 36, speed: 30, dps: 3, gold: 18, window: '65–80s' },
  ],
  2: [
    { total: 5, hp: 36, speed: 32, dps: 4, gold: 10, window: '0–20s' },
    { total: 6, hp: 56, speed: 36, dps: 6, gold: 12, window: '21–42s' },
    { total: 6, hp: 72, speed: 40, dps: 7, gold: 16, window: '43–64s' },
    { total: 7, hp: 88, speed: 42, dps: 8, gold: 18, window: '65–90s' },
  ],
  3: [
    { total: 6, hp: 48, speed: 34, dps: 5, gold: 12, window: '0–20s' },
    { total: 7, hp: 72, speed: 38, dps: 7, gold: 16, window: '21–42s' },
    { total: 7, hp: 96, speed: 42, dps: 9, gold: 20, window: '43–64s' },
    { total: 8, hp: 120, speed: 40, dps: 11, gold: 24, window: '65–90s' },
  ],
};

function halfUp(n) {
  return Math.round(n);
}

for (const stage of [1, 2, 3]) {
  const rows = stageBalanceRows(stage);
  assert(rows.length === 4, `stage ${stage} has four waves`);
  rows.forEach((row, i) => {
    const prev = BEFORE[stage][i];
    const hp = halfUp(prev.hp * 1.4);
    const total = halfUp(prev.total * 1.35);
    const gold = halfUp(prev.gold * 1.4);
    assert(row.count === total && row.count >= prev.total + 1, `stage ${stage} wave ${i + 1} total ${row.count} (want ${total})`);
    assert(row.hp === hp, `stage ${stage} wave ${i + 1} hp ${row.hp} (want ${hp})`);
    assert(row.gold === gold && row.gold >= prev.gold, `stage ${stage} wave ${i + 1} gold ${row.gold} (want ${gold})`);
    assert(row.speed === prev.speed && row.dps === prev.dps, `stage ${stage} wave ${i + 1} speed/dps stay`);
    assert(row.window === prev.window, `stage ${stage} wave ${i + 1} window stays`);
    for (const id of S4) {
      assert(row.skins.includes(id), `stage ${stage} wave ${i + 1} skins include ${id}`);
    }
  });
  const defs = EARLY_STAGE_WAVES[stage];
  assert(defs.every((def) => def.archetypes.length === 1 && def.archetypes[0].variant === 'walker'), `stage ${stage} stays one walker row`);
}

for (const id of S4) {
  const skin = ZOMBIE_LIBRARY_SKINS[id];
  assert(!!skin, `${id} is a library skin`);
  assert(skin.ruleAnims == null, `${id} has no rule-anim map`);
  assert(skin.frameWidth === S4_FRAME_SIZE && skin.frameHeight === S4_FRAME_SIZE, `${id} cell is 88`);
  assert(skin.actions.walk === `zombie-${id}-walk`, `${id} walk key`);
  assert(skin.actions.attack === `zombie-${id}-attack`, `${id} attack key`);
  assert(skin.actions.hurt === `zombie-${id}-hurt`, `${id} hurt key`);
  assert(skin.actions.death === `zombie-${id}-die`, `${id} die key is die, not die1`);
  assert(skin.actions.run == null, `${id} has no run strip`);
  assert(skin.actions.deaths.join() === `zombie-${id}-die`, `${id} death list is the one die strip`);
  assert(!DEMO_ENEMY_IDS.includes(id), `${id} stays off the showcase audio list`);
  assert(!ENEMY_SFX_FILES[id], `${id} does not queue showcase audio`);
  assert(attackContactFrame(id, 8) === 6, `${id} 8-frame bite contacts on index 6`);
}
assert(!ZOMBIE_LIBRARY_SKINS.salaryman && !ZOMBIE_LIBRARY_SKINS['s4-salaryman'], 'salaryman stays unwired');
assert(!ZOMBIE_LIBRARY_SKINS['s4-delivery'], 's4-delivery stays unwired');
assert(ZOMBIE_ORIGIN_X === 0.5 && ZOMBIE_ORIGIN_Y === 1, 'feet origin stays (0.5, 1)');
assert(DEMO_ENEMY_IDS.slice(0, 5).join() === 'office-worker-v2,delivery,chef,nurse,brute', 'headline roster stays the first five showcase ids');
assert(!enemySfxClips().some((clip) => clip.key.includes('s4-')), 'no S4 audio clip is queued');

const index = JSON.parse(readFileSync(new URL('../assets/library/asset-index.json', import.meta.url), 'utf8'));
for (const id of S4) {
  for (const action of ['walk', 'attack', 'hurt', 'die']) {
    const key = `zombie-${id}-${action}`;
    const asset = index.assets.find((row) => row.key === key);
    assert(!!asset, `index has ${key}`);
    assert(asset.frameWidth === 88 && asset.frameHeight === 88, `${key} index cell is 88`);
    assert(asset.origin[0] === 0.5 && asset.origin[1] === 1, `${key} origin is feet`);
    assert(asset.category === 'zombies', `${key} loads with the zombie category`);
    const png = readFileSync(new URL(`../${asset.path}`, import.meta.url));
    assert(png.readUInt32BE(16) === 88 * 8 && png.readUInt32BE(20) === 88, `${key} png is 8×88`);
  }
}

function seenSkins(stage) {
  const seen = new Set();
  for (let i = 0; i < 30; i += 1) {
    const wm = new WaveManager({ stage });
    for (const intent of wm.queue) seen.add(intent.archetype.skin);
  }
  return seen;
}
for (const stage of [1, 2, 3]) {
  const seen = seenSkins(stage);
  for (const id of S4) assert(seen.has(id), `stage ${stage} queue rolls ${id}`);
  assert(seen.has('office-worker-v2') || seen.has('delivery') || seen.has('chef'), `stage ${stage} still rolls a profession`);
}

function s4Body(id, ready) {
  const z = Object.create(Zombie.prototype);
  z.skin = ZOMBIE_LIBRARY_SKINS[id];
  z.variant = 'walker';
  z.alive = true;
  z.hp = 100;
  z.maxHp = 100;
  z._isSprite = true;
  z.scene = { anims: { exists: (key) => ready(key) } };
  return z;
}

for (const id of S4) {
  const ready = new Set([
    `zombie-${id}-walk`,
    `zombie-${id}-attack`,
    `zombie-${id}-hurt`,
    `zombie-${id}-die`,
  ]);
  const z = s4Body(id, (key) => ready.has(key));
  assert(z._locomotionAnimKey() === `zombie-${id}-walk`, `${id} walks on the walk strip`);
  assert(z._pickBiteKey() === `zombie-${id}-attack`, `${id} bite falls back to attack`);
  assert(z._hurtAnimKey() === `zombie-${id}-hurt`, `${id} hurt uses the hurt strip`);
  assert(z._libraryDeathKey(false, { crit: true, charge: 3 }) === `zombie-${id}-die`, `${id} crit/L3 falls back to die`);

  const quiet = s4Body(id, () => false);
  quiet.atBarricade = true;
  quiet.petBiteTarget = null;
  quiet._haltX = 10;
  quiet._attackBeat = false;
  quiet.body = {
    x: 10,
    anims: { stop() {}, currentAnim: null, isPlaying: false },
    play() { throw new Error('missing attack must not play'); },
  };
  quiet.scene = {
    anims: { exists: () => false, get: () => null },
    tweens: { killTweensOf() {} },
  };
  quiet._clearAttackContact = () => {};
  quiet._playAttackPunch();
  assert(quiet._attackBeat === true, `${id} missing attack still opens the wall beat`);
  assert(quiet._libraryDeathKey(false, { crit: true }) == null, `${id} missing die does not throw`);
}

const biter = Object.create(Zombie.prototype);
biter.alive = true;
biter.atBarricade = true;
biter.dps = 20;
biter.scene = { waveManager: { isTimeUp: () => true } };
assert(biter.contactDamage(1) === 0, 'after 90s a bite deals 0 wall damage');
biter.scene.waveManager.isTimeUp = () => false;
assert(biter.contactDamage(0.5) === 10, 'before 90s contact DPS still applies');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('v0.36.30 checks passed');
