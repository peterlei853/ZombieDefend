/**
 * v0.28 roster + shopping list (no Phaser, no browser).
 * Run: node tools/check-v028.mjs
 *
 * Each main stage spawns one skin: office-worker-v2, delivery, chef,
 * nurse, then brute. A missing strip falls back to office-worker-v2.
 * Retired zombie-office-* keys are not a skin and are not required.
 * Shop buys and upgrades spend only through the spendGold callback.
 * Wave HP, gold-by-HP, and barricade HP stay on the v0.27 table.
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION, DEMO_ENEMY_IDS } from '../src/data/GameConfig.js';
import { getGoldByHP } from '../src/data/economy.js';
import {
  clampStage,
  rosterForStage,
  STAGE_COUNT,
  STAGE_ROSTER,
  skinForStage,
  stageFromQuery,
} from '../src/data/stageRoster.js';
import {
  SHOP_UPGRADE_COST,
  SHOP_WEAPON_COST,
  tryShopAction,
  upgradedDamage,
} from '../src/data/shopList.js';
import { BARRICADE_MAX_HP, WAVE_DEFS, waveDefsForStage } from '../src/data/waves.js';
import { WaveManager } from '../src/systems/WaveManager.js';
import {
  isRetiredOfficeKey,
  resolveSpawnSkin,
  SPAWN_FALLBACK_SKIN,
  ZOMBIE_LIBRARY_SKINS,
} from '../src/assets/zombieSprites.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

assert(APP_VERSION === '0.36.27', `APP_VERSION ${APP_VERSION}`);
assert(getGoldByHP(40) === 10 && getGoldByHP(105) === 15 && getGoldByHP(165) === 20, 'gold-by-HP unchanged');
assert(BARRICADE_MAX_HP === 720, 'barricade max HP unchanged');
assert(WAVE_DEFS.map((wave) => wave.total).join() === '5,6,10,48', 'wave counts unchanged');
assert(WAVE_DEFS[0].archetypes[0].hp === 40 && WAVE_DEFS[3].archetypes.map((row) => row.hp).join() === '50,115,165', 'wave HP rows unchanged');
assert(!WAVE_DEFS[0].archetypes[0].skins, 'combat table itself has no skin list');

const expected = ['office-worker-v2', 'delivery', 'chef', 'nurse', 'brute'];
assert(STAGE_COUNT === 5 && STAGE_ROSTER.join() === expected.join(), `roster ${STAGE_ROSTER}`);
assert(STAGE_ROSTER.join() === DEMO_ENEMY_IDS.slice(0, 5).join(), 'roster is the first five feel-booth ids');
assert(!STAGE_ROSTER.includes('office-worker'), 'old office skin is not in the roster');
assert(!STAGE_ROSTER.includes('clown') && !STAGE_ROSTER.includes('cyborg') && !STAGE_ROSTER.includes('slime'), 'old progressive mix is gone');
assert(rosterForStage(1).join() === 'office-worker-v2,delivery,chef', 'stage 1 rolls types 1/2/3');
assert(skinForStage(1) === 'office-worker-v2', 'stage 1 headline skin stays type 1');
for (let stage = 1; stage <= STAGE_COUNT; stage += 1) {
  assert(skinForStage(stage) === expected[stage - 1], `skinForStage ${stage}`);
}
assert(rosterForStage(2).join() === 'office-worker-v2,delivery,chef', 'stage 2 pool is the early trio');
assert(rosterForStage(3).join() === 'office-worker-v2,delivery,chef,nurse', 'stage 3 pool adds nurse');
assert(rosterForStage(4).join() === 'nurse' && rosterForStage(5).join() === 'brute', 'stage 4–5 stay one skin');
assert(clampStage(0) === 1 && clampStage(99) === 5 && rosterForStage(99).join() === 'brute', 'stages outside 1–5 clamp');
assert(stageFromQuery('?stage=4') === 4 && stageFromQuery('?stage=6') === null && stageFromQuery('') === null, 'stage query stays on 1–5');

const defs1 = waveDefsForStage(1);
assert(defs1[0].archetypes[0].hp === 24 && defs1[0].archetypes[0].speed === 26 && defs1[0].archetypes[0].dps === 2, 'stage 1 wave 1 is the rising row');
assert(defs1[0].archetypes[0].gold === 8, 'stage 1 wave 1 gold is explicit');
assert(WAVE_DEFS.slice(0, 3).map((wave) => wave.archetypes[0].dps).join() === '3,5,8', 'legacy waves 1–3 contact DPS is 3/5/8');
assert(WAVE_DEFS[3].archetypes.map((row) => row.dps).join() === '11,16,20', 'wave 4 DPS mix is unchanged');
assert(defs1[0].archetypes[0].skins.join() === 'office-worker-v2,office-worker-v2,delivery,chef', 'stage 1 wave 1 weights office');
assert(waveDefsForStage(2)[0].archetypes[0].skins.includes('chef'), 'stage 2 waves include chef');
assert(waveDefsForStage(4)[0].archetypes[0].hp === 40 && waveDefsForStage(4)[0].total === 5, 'stage 4 keeps the legacy wave 1 row');
assert(waveDefsForStage(5)[3].archetypes.every((row) => row.skins.join() === 'brute'), 'stage 5 wave 4 is only brute');

function skinCounts(stage) {
  const wm = new WaveManager({ stage });
  const counts = {};
  for (const intent of wm.queue) {
    const id = intent.archetype.skin;
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

const mix1 = skinCounts(1);
const mix1Ids = Object.keys(mix1).sort();
const mix1Total = Object.values(mix1).reduce((sum, n) => sum + n, 0);
assert(
  mix1Ids.every((id) => rosterForStage(1).includes(id)) && mix1Total === 16,
  `stage 1 rolls types 1/2/3 ${JSON.stringify(mix1)}`
);
const earlyTotals = { 2: 24, 3: 28 };
for (const stage of [2, 3]) {
  const mix = skinCounts(stage);
  const ids = Object.keys(mix).sort();
  const total = Object.values(mix).reduce((sum, n) => sum + n, 0);
  assert(ids.every((id) => rosterForStage(stage).includes(id)) && total === earlyTotals[stage], `stage ${stage} pool ${JSON.stringify(mix)}`);
}
for (const stage of [4, 5]) {
  const mix = skinCounts(stage);
  const id = expected[stage - 1];
  assert(Object.keys(mix).join() === id && mix[id] === 69, `stage ${stage} spawns only ${id} ${JSON.stringify(mix)}`);
}

const v2 = ZOMBIE_LIBRARY_SKINS['office-worker-v2'];
const nurse = ZOMBIE_LIBRARY_SKINS.nurse;
assert(!ZOMBIE_LIBRARY_SKINS['office-worker'], 'retired office-worker skin is not shipped');
assert(SPAWN_FALLBACK_SKIN === 'office-worker-v2', 'spawn fallback is office-worker-v2');
assert(v2?.actions?.walk === 'zombie-office-worker-v2-walk' && !v2.fallbackId, 'v2 has no fallback to the removed sheets');
assert(ZOMBIE_LIBRARY_SKINS.delivery.actions.walk === 'zombie-delivery-walk', 'delivery key');
assert(ZOMBIE_LIBRARY_SKINS.chef.actions.walk === 'zombie-chef-walk', 'chef key');
assert(nurse?.actions?.attach === 'zombie-nurse-attach', 'nurse attach strip is wired');
assert(isRetiredOfficeKey('zombie-office-walk') && !isRetiredOfficeKey('zombie-office-worker-v2-walk'), 'retired office keys are distinct from v2');

const spriteSrc = readFileSync(new URL('../src/assets/zombieSprites.js', import.meta.url), 'utf8');
assert(!spriteSrc.includes('zombie-office-walk'), 'gameplay does not name zombie-office-walk');
assert(!spriteSrc.includes("'office-worker'"), 'gameplay does not ship the office-worker skin id');

function sceneWith(keys) {
  const has = new Set(keys);
  return {
    textures: { exists: (key) => has.has(key) },
    anims: { exists: (key) => has.has(key) },
  };
}

const onlyRetired = sceneWith(['zombie-office-walk']);
assert(resolveSpawnSkin(onlyRetired, 'office-worker-v2', 'walker') == null, 'retired office sheet is not a fallback');
assert(resolveSpawnSkin(onlyRetired, 'delivery', 'walker') == null, 'missing delivery does not use zombie-office');
assert(resolveSpawnSkin(onlyRetired, 'office-worker', 'walker') == null, 'the old skin id does not use a retired sheet');
const live = sceneWith(['zombie-office-walk', 'zombie-office-worker-v2-walk', 'zombie-delivery-walk']);
assert(resolveSpawnSkin(live, 'office-worker-v2', 'walker')?.id === 'office-worker-v2', 'v2 wins when its strip is loaded');
assert(resolveSpawnSkin(live, 'delivery', 'walker')?.id === 'delivery', 'delivery is not replaced when loaded');
assert(resolveSpawnSkin(live, 'chef', 'walker')?.id === 'office-worker-v2', 'a missing profession falls back to office-worker-v2 only');
assert(resolveSpawnSkin(live, 'office-worker', 'walker')?.id === 'office-worker-v2', 'a stale office id falls back to v2');

let spends = 0;
const purse = { gold: 80 };
const spend = (cost) => {
  spends += 1;
  if (purse.gold < cost) return { ok: false, reason: 'gold', gold: purse.gold };
  purse.gold -= cost;
  return { ok: true, gold: purse.gold };
};
const bought = tryShopAction({ gold: 80, ownedWeapons: ['water'], upgrades: {} }, 'buy', 'sling', spend);
assert(bought.ok && bought.ownedWeapons.join() === 'water,sling' && bought.purchase === 'weapon:sling', 'buy adds the gun');
assert(purse.gold === 40 && spends === 1, 'buy spends 40 once');
const denied = tryShopAction({ gold: purse.gold, ownedWeapons: bought.ownedWeapons, upgrades: {} }, 'buy', 'sling', spend);
assert(!denied.ok && denied.reason === 'owned' && spends === 1, 'owned gun does not spend again');
const shortPurse = { gold: 10 };
const broke = tryShopAction({ gold: 10, ownedWeapons: ['water'], upgrades: {} }, 'buy', 'flame', (cost) => {
  if (shortPurse.gold < cost) return { ok: false, reason: 'gold', gold: shortPurse.gold };
  shortPurse.gold -= cost;
  return { ok: true, gold: shortPurse.gold };
});
assert(!broke.ok && broke.reason === 'gold' && shortPurse.gold === 10 && purse.gold === 40, 'short gold does not spend');
const up = tryShopAction(
  { gold: purse.gold, ownedWeapons: bought.ownedWeapons, upgrades: {} },
  'upgrade',
  'water',
  spend
);
assert(up.ok && up.level === 1 && up.upgrades.water === 1 && purse.gold === 15, 'upgrade spends 25 and ranks the owned gun');
assert(SHOP_WEAPON_COST === 40 && SHOP_UPGRADE_COST === 25, 'list prices');
const locked = tryShopAction({ gold: 100, ownedWeapons: ['water'], upgrades: {} }, 'upgrade', 'frost', spend);
assert(!locked.ok && locked.reason === 'unowned', 'upgrade requires an owned gun');
assert(upgradedDamage(18, 0) === 18 && upgradedDamage(18, 1) === 22, 'rank 0 keeps base damage');

const shopSrc = readFileSync(new URL('../src/scenes/ShopScene.js', import.meta.url), 'utf8');
const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const zombieSrc = readFileSync(new URL('../src/entities/Zombie.js', import.meta.url), 'utf8');
assert(shopSrc.includes('spendGold') && shopSrc.includes('startShopBgm()'), 'shop still spends through spendGold and starts bgm-shop');
assert(shopSrc.includes('buyWeapon') && shopSrc.includes('upgradeWeapon') && shopSrc.includes("continue("), 'shop actions stay');
assert(shopSrc.includes('STAGE_COUNT') && shopSrc.includes('TitleScene'), 'shop stops after the fifth stage');
const titleSrc = readFileSync(new URL('../src/scenes/TitleScene.js', import.meta.url), 'utf8');
assert(titleSrc.includes('STAGE_COUNT') && titleSrc.includes('startStage(stage)'), 'title can start each stage');
assert(!/localStorage\.(get|set|remove|clear|key)/.test(shopSrc), 'shop does not touch localStorage');
assert(stageSrc.includes('new WaveManager({ stage: this.stage })'), 'stage passes its number into the spawner');
assert(stageSrc.includes('skin: arch.skin'), 'spawn intent carries the roster skin');
assert(stageSrc.includes('startStageBgm()') && stageSrc.includes('playVictory()'), 'stage and victory beds stay');
assert(zombieSrc.includes('resolveSpawnSkin') && zombieSrc.includes("_animKey('attach')"), 'bodies use the roster skin and nurse attach');
assert(!shopSrc.includes('.shake(') && !stageSrc.includes('.shake('), 'no camera shake');

if (failed) {
  console.error(`${failed} v0.28 check(s) failed`);
  process.exit(1);
}
console.log('v0.28 checks passed');
