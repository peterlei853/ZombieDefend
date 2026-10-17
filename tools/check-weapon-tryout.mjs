/**
 * Sandbox weapon try-out stays off stage combat.
 * The hub links to /sandbox/weapons.html. Stage fence mounts stay.
 * Gold, saves, barricade HP, and the five-stage roster are not retargeted.
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/data/GameConfig.js';
import { MUZZLE_WEST_FRAC } from '../src/assets/heroDeploy.js';
import { BARRICADE_MAX_HP } from '../src/data/waves.js';
import { STAGE_COUNT, STAGE_ROSTER } from '../src/data/stageRoster.js';
import {
  SANDBOX_FLOAT_FRAME,
  SANDBOX_FLOAT_OFFSET,
  SANDBOX_WEAPONS,
  sandboxFloatOrigin,
  sandboxMuzzle,
  sandboxWeaponFromSearch,
  sandboxWeaponLabel,
} from '../src/sandbox/weaponFloat.js';

const hub = readFileSync(new URL('../sandbox/index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('../sandbox/weapons.html', import.meta.url), 'utf8');
const demo = readFileSync(new URL('../src/sandbox/weaponTryout.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const weaponSystem = readFileSync(new URL('../src/systems/WeaponSystem.js', import.meta.url), 'utf8');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(APP_VERSION === '0.36.12', 'APP_VERSION is 0.36.12');
assert(pkg.version === '0.36.12', 'package.json tracks 0.36.12');
assert(html.includes('ZombieDefend v0.36.12'), 'title tracks 0.36.12');
assert(BARRICADE_MAX_HP === 720, 'barricade max HP stays 720');
assert(STAGE_COUNT === 5 && STAGE_ROSTER.length === 5, 'five single-type stages stay');

assert(hub.includes('href="weapons.html?weapon=water#water"'), 'hub links water');
assert(hub.includes('/sandbox/weapons.html?weapon=flame'), 'hub names the flame Pages path');
for (const id of ['water', 'sling', 'bubble', 'lightning', 'frost', 'flame']) {
  assert(hub.includes(`weapon=${id}`), `hub lists ${id}`);
  assert(page.includes(`data-weapon="${id}"`), `page button ${id}`);
}
assert(hub.includes('href="pet.html"'), 'pet try-out link stays on the hub');
assert(page.includes('<base href="../">'), 'weapon page resolves catalog paths from the repo root');
assert(page.includes('src="src/sandbox/weaponTryout.js"'), 'weapon page boots the try-out module');
assert(page.includes('1–6') || page.includes('1-6') || page.includes('>1<'), 'page documents the number keys');

assert(SANDBOX_WEAPONS.join() === 'water,sling,bubble,lightning,frost,flame', 'six stage weapons');
assert(SANDBOX_FLOAT_FRAME === 56, 'catalog float frame is 56');
assert(SANDBOX_FLOAT_OFFSET.x < 0 && SANDBOX_FLOAT_OFFSET.y < 0, 'float sits west and above the feet');
assert(sandboxWeaponFromSearch('') === 'water', 'default weapon is water');
assert(sandboxWeaponFromSearch('?weapon=FROST') === 'frost', 'weapon query is case-insensitive');
assert(sandboxWeaponFromSearch('?weapon=tower') === 'water', 'unknown weapon falls back to water');
assert(sandboxWeaponFromSearch('', '#lightning') === 'lightning', 'hash survives the local html redirect');
assert(sandboxWeaponFromSearch('?weapon=water', '#flame') === 'water', 'query wins over the hash');

const origin = sandboxFloatOrigin(1000, 400, 1.5);
assert(origin.x === 1000 + SANDBOX_FLOAT_OFFSET.x * 1.5, 'float x tracks the hero scale');
assert(origin.y === 400 + SANDBOX_FLOAT_OFFSET.y * 1.5, 'float y tracks the hero scale');
assert(origin.scale === 1.5, 'float scale is the hero display scale');
const muzzle = sandboxMuzzle(origin, 56);
assert(muzzle.x === origin.x - 56 * 1.5 * MUZZLE_WEST_FRAC, 'muzzle uses the catalog frame');
assert(muzzle.y === origin.y, 'muzzle stays on the float');
assert(sandboxWeaponLabel('flame').includes('fx-flame-cone'), 'flame label names the cone');
assert(sandboxWeaponLabel('water').includes('fx-water-proj'), 'water label names the projectile');

assert(demo.includes('fenceOnly: false'), 'try-out does not take the fence fire path');
assert(demo.includes('waterMount'), 'water fires from the float muzzle slot');
assert(demo.includes('slingFromMount'), 'sling fires from the float muzzle slot');
assert(!demo.includes('new FenceMounts') && !demo.includes('new WaterMounts') && !demo.includes('new SlingMounts'), 'try-out draws no cradle');
assert(!demo.includes('SaveManager') && !demo.includes("registry.set('gold'"), 'try-out does not write gold');
assert(demo.includes('consumePending()'), 'try-out drops combat gold');
assert(demo.includes('showcaseHold = true'), 'target stays in front of the gun');
assert(demo.includes('playLibraryAnim'), 'float bob uses the library guard');
assert(!demo.includes('.play('), 'try-out does not call sprite.play directly');

assert(stage.includes('new FenceMounts'), 'stage still places fence mounts');
assert(!stage.includes('weaponTryout') && !stage.includes('WeaponTryout'), 'stage scene does not start the try-out');
assert(!main.includes('weaponTryout') && !main.includes('WeaponTryout'), 'main game does not register the try-out');
assert(stage.includes('Keys 5–9 only preview') || stage.includes('Keys 5-9 only preview'), 'feel keys 6–9 stay previews');
assert(weaponSystem.includes('PIXELLAB_HOOK'), 'projectile PIXELLAB_HOOK stays');

console.log('weapon try-out ok');
