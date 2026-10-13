/**
 * v0.28 roster + shopping list (no Phaser, no browser).
 * Run: node tools/check-v028.mjs
 *
 * Stage 1 spawns three profession skins. Each later stage adds one.
 * The 64px zombie-office-* sheets stay as the fallback and are not deleted.
 * Shop buys and upgrades spend only through the spendGold callback.
 * Wave HP, gold-by-HP, and barricade HP stay on the v0.27 table.
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/data/GameConfig.js';
import { getGoldByHP } from '../src/data/economy.js';
import { rosterForStage, STAGE_ROSTER } from '../src/data/stageRoster.js';
import {
  SHOP_UPGRADE_COST,
  SHOP_WEAPON_COST,
  tryShopAction,
  upgradedDamage,
} from '../src/data/shopList.js';
import { BARRICADE_MAX_HP, WAVE_DEFS, waveDefsForStage } from '../src/data/waves.js';
import { WaveManager } from '../src/systems/WaveManager.js';
import { resolveSpawnSkin, ZOMBIE_LIBRARY_SKINS } from '../src/assets/zombieSprites.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

assert(APP_VERSION === '0.28.0', `APP_VERSION ${APP_VERSION}`);
assert(getGoldByHP(40) === 10 && getGoldByHP(105) === 15 && getGoldByHP(165) === 20, 'gold-by-HP unchanged');
assert(BARRICADE_MAX_HP === 720, 'barricade max HP unchanged');
assert(WAVE_DEFS.map((wave) => wave.total).join() === '5,6,10,48', 'wave counts unchanged');
assert(WAVE_DEFS[0].archetypes[0].hp === 40 && WAVE_DEFS[3].archetypes.map((row) => row.hp).join() === '50,115,165', 'wave HP rows unchanged');
assert(!WAVE_DEFS[0].archetypes[0].skins, 'combat table itself has no skin list');

const stage1 = rosterForStage(1);
const stage2 = rosterForStage(2);
const stage3 = rosterForStage(3);
assert(stage1.join() === 'office-worker-v2,delivery,chef', `stage 1 roster ${stage1}`);
assert(stage2.join() === 'office-worker-v2,delivery,chef,nurse', `stage 2 adds nurse ${stage2}`);
assert(stage3.length === 5 && stage3[4] === 'clown', 'stage 3 adds one more type');
assert(!STAGE_ROSTER.includes('office-worker'), 'old office skin is not in the roster');
assert(rosterForStage(99).length === STAGE_ROSTER.length, 'later stages stay a mix, capped by the catalog list');

const defs1 = waveDefsForStage(1);
assert(defs1[0].archetypes[0].hp === 40 && defs1[0].archetypes[0].speed === 32 && defs1[0].archetypes[0].dps === 4, 'stamped row keeps wave 1 numbers');
assert(defs1[0].archetypes[0].skins.join() === stage1.join(), 'stage 1 waves carry the three skins');
assert(waveDefsForStage(2)[0].archetypes[0].skins.join() === stage2.join(), 'stage 2 waves carry four skins');

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
assert(Object.keys(mix1).sort().join() === 'chef,delivery,office-worker-v2', `stage 1 spawn mix ${Object.keys(mix1)}`);
assert(Object.values(mix1).every((n) => n === 23), `stage 1 skins are spread, not one type ${JSON.stringify(mix1)}`);
const mix2 = skinCounts(2);
assert(Object.keys(mix2).sort().join() === 'chef,delivery,nurse,office-worker-v2', `stage 2 spawn mix ${Object.keys(mix2)}`);
assert(Object.values(mix2).every((n) => n > 0), 'stage 2 uses every roster skin');

const office = ZOMBIE_LIBRARY_SKINS['office-worker'];
const v2 = ZOMBIE_LIBRARY_SKINS['office-worker-v2'];
const nurse = ZOMBIE_LIBRARY_SKINS.nurse;
assert(office?.actions?.walk === 'zombie-office-walk', 'old zombie-office-walk key remains');
assert(v2?.actions?.walk === 'zombie-office-worker-v2-walk' && v2.fallbackId === 'office-worker', 'v2 prefers its own strip and falls back to office');
assert(ZOMBIE_LIBRARY_SKINS.delivery.actions.walk === 'zombie-delivery-walk', 'delivery key');
assert(ZOMBIE_LIBRARY_SKINS.chef.actions.walk === 'zombie-chef-walk', 'chef key');
assert(nurse?.actions?.attach === 'zombie-nurse-attach', 'nurse attach strip is wired');

function sceneWith(keys) {
  const has = new Set(keys);
  return {
    textures: { exists: (key) => has.has(key) },
    anims: { exists: (key) => has.has(key) },
  };
}

const onlyOffice = sceneWith(['zombie-office-walk']);
assert(resolveSpawnSkin(onlyOffice, 'office-worker-v2', 'walker')?.id === 'office-worker', 'missing v2 sheet uses zombie-office');
const both = sceneWith(['zombie-office-walk', 'zombie-office-worker-v2-walk', 'zombie-delivery-walk']);
assert(resolveSpawnSkin(both, 'office-worker-v2', 'walker')?.id === 'office-worker-v2', 'v2 wins when its strip is loaded');
assert(resolveSpawnSkin(both, 'delivery', 'walker')?.id === 'delivery', 'delivery is not replaced when loaded');
assert(resolveSpawnSkin(onlyOffice, 'delivery', 'walker')?.id === 'office-worker', 'missing delivery falls back to old office');

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
