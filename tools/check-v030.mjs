/**
 * v0.30 single-weapon immerse (?weapon=<id>).
 * Run: node tools/check-v030.mjs
 *
 * Player Tester: hard-refresh each link. The stage boots with only that gun.
 * SPACE / SWAP stays on it. Stop-to-fire and the west ray are unchanged.
 * Without ?weapon=, stage 1 still owns all six.
 * Gold, saves, barricade, roster, and BGM are unchanged.
 *
 *   https://peterlei853.github.io/ZombieDefend/?weapon=water
 *   https://peterlei853.github.io/ZombieDefend/?weapon=sling
 *   https://peterlei853.github.io/ZombieDefend/?weapon=bubble
 *   https://peterlei853.github.io/ZombieDefend/?weapon=lightning
 *   https://peterlei853.github.io/ZombieDefend/?weapon=frost
 *   https://peterlei853.github.io/ZombieDefend/?weapon=flame
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION, demoWeaponId } from '../src/data/GameConfig.js';
import { BARRICADE_MAX_HP } from '../src/data/waves.js';
import { getGoldByHP } from '../src/data/economy.js';
import { rosterForStage } from '../src/data/stageRoster.js';
import {
  DEPLOY_HOLD_MS,
  OWNED_WEAPON_ORDER,
  forwardVelocity,
  grantStageWeapons,
  resolveOwnedWeapons,
} from '../src/assets/heroDeploy.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';

const IDS = ['water', 'sling', 'bubble', 'lightning', 'frost', 'flame'];

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const titleSrc = readFileSync(new URL('../src/scenes/TitleScene.js', import.meta.url), 'utf8');
const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const configSrc = readFileSync(new URL('../src/data/GameConfig.js', import.meta.url), 'utf8');
const deploySrc = readFileSync(new URL('../src/assets/heroDeploy.js', import.meta.url), 'utf8');
const weaponSrc = readFileSync(new URL('../src/systems/WeaponSystem.js', import.meta.url), 'utf8');

assert(pkg.version === '0.31.0' && APP_VERSION === '0.31.0', 'package and APP_VERSION are v0.31.0');
assert(html.includes('v0.31.0'), 'document title is v0.31.0');
assert(IDS.join(',') === OWNED_WEAPON_ORDER.join(','), 'immerse ids match shop order');

for (const id of IDS) {
  assert(demoWeaponId(`?weapon=${id}`) === id, `?weapon=${id}`);
  assert(demoWeaponId(`?weapon=${id.toUpperCase()}`) === id, `uppercase ${id}`);
  assert(demoWeaponId(`?weapon=${id}&petLowHp=1`) === id, `${id} keeps petLowHp combo`);
  assert(resolveOwnedWeapons(1, [], id).join(',') === id, `stage 1 immerse is only ${id}`);
  assert(resolveOwnedWeapons(1, OWNED_WEAPON_ORDER.slice(), id).join(',') === id, `immerse replaces the all-six grant (${id})`);
  assert(resolveOwnedWeapons(2, OWNED_WEAPON_ORDER.slice(), id).join(',') === id, `later stage stays on ${id}`);
}

assert(demoWeaponId('') === null, 'missing query is ignored');
assert(demoWeaponId('?petLowHp=1') === null, 'petLowHp alone is not a weapon immerse');
assert(demoWeaponId('?weapon=') === null, 'empty weapon is ignored');
assert(demoWeaponId('?weapon=handgun') === null, 'unknown id is ignored');
assert(demoWeaponId('?weapon=Water ') === 'water', 'trim and lowercase');
assert(resolveOwnedWeapons(1, [], null).join(',') === OWNED_WEAPON_ORDER.join(','), 'no query: stage 1 still owns all six');
assert(resolveOwnedWeapons(1, ['sling'], 'nope').join(',') === OWNED_WEAPON_ORDER.join(','), 'invalid demo id does not shrink stage 1');
assert(grantStageWeapons(1, []).join(',') === OWNED_WEAPON_ORDER.join(','), 'stage-1 grant helper itself is unchanged');
assert(resolveOwnedWeapons(2, ['flame', 'water'], null).join(',') === 'water,flame', 'later stages keep carried order');

const library = { textures: { exists: () => true } };
for (const id of IDS) {
  const guns = new WeaponSystem(library);
  guns.setOwnedWeapons([id]);
  assert(guns.ownedIds().join(',') === id, `owned list is ${id}`);
  assert(guns.getSkin()?.id === id, `equipped skin boots as ${id}`);
  const profile = guns.getWeapon();
  guns.toggleWeapon();
  guns.toggleWeapon();
  assert(guns.getSkin()?.id === id, `SPACE stays on ${id}`);
  assert(guns.ownedIds().join(',') === id, `SPACE does not add guns to ${id}`);
  assert(guns.getWeapon() === profile, `SPACE does not flip the ${id} profile`);
}

const six = new WeaponSystem(library);
six.setOwnedWeapons(OWNED_WEAPON_ORDER.slice());
const first = six.getSkin()?.id;
six.toggleWeapon();
assert(six.ownedIds().length === 6, 'normal run still owns six');
assert(six.getSkin()?.id !== first, 'SPACE still cycles when all six are owned');

const bare = new WeaponSystem({ textures: { exists: () => false } });
bare.setOwnedWeapons(['flame']);
bare.toggleWeapon();
assert(bare.ownedIds().join(',') === 'flame', 'legacy sheets still cannot cycle off the immerse gun');
assert(bare.getWeapon() === 'Shotgun', 'flame stays on its shotgun profile');

const west = forwardVelocity(100);
assert(DEPLOY_HOLD_MS === 180, 'stop-to-fire hold is still 180ms');
assert(west.vx === -100 && west.vy === 0, 'shots still travel west');

assert(titleSrc.includes('demoWeaponId()'), 'title auto-starts for ?weapon=');
assert(stageSrc.includes('resolveOwnedWeapons'), 'stage resolves the immerse list');
assert(stageSrc.includes('demoWeaponId()'), 'stage reads the query itself');
assert(weaponSrc.includes('this._ownedIds.length === 1'), 'single-gun cycle lock is in WeaponSystem');
assert(!configSrc.includes('localStorage') && !deploySrc.includes('localStorage'), 'weapon override does not touch localStorage');
assert(!/MockDB\./.test(configSrc) && !configSrc.includes("data/MockDB"), 'GameConfig does not call MockDB');
assert(!deploySrc.includes('MockDB'), 'resolveOwnedWeapons does not touch MockDB');
assert(!stageSrc.includes('localStorage.setItem') && !stageSrc.includes('MockDB.'), 'stage does not write the immerse list to a save');

assert(BARRICADE_MAX_HP === 720, 'barricade HP stays 720');
assert(getGoldByHP(40) === 10 && getGoldByHP(120) === 15 && getGoldByHP(300) === 50, 'gold-by-HP stays put');
assert(rosterForStage(1).join() === 'office-worker-v2,delivery,chef', 'stage 1 roster stays put');
assert(stageSrc.includes('startStageBgm'), 'stage BGM hook stays');

if (failed) {
  console.error(`${failed} v0.30 check(s) failed`);
  process.exit(1);
}
console.log('v0.30 checks passed');
