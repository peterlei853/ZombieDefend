/**
 * Sandbox weapon try-out stays off stage combat.
 * The hub links to /sandbox/weapons.html. Stage guns float and fire on SPACE or SWAP.
 * Gold, saves, barricade HP, and the five-stage roster are not retargeted.
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/data/GameConfig.js';
import { MUZZLE_WEST_FRAC, WEAPON_TRAITS } from '../src/assets/heroDeploy.js';
import { BARRICADE_MAX_HP } from '../src/data/waves.js';
import { STAGE_COUNT, STAGE_ROSTER } from '../src/data/stageRoster.js';
import { WATER_HIT_FX, WeaponSystem } from '../src/systems/WeaponSystem.js';
import {
  preloadGameAudio,
  SoundManager,
  WATER_EAR_PREVIEW_KEYS,
  WATER_EAR_VOLUME,
} from '../src/systems/SoundManager.js';
import { pixelBodiesTouchPoint, spriteSweepContact } from '../src/systems/pixelTouch.js';
import {
  pickWaterGuide,
  WATER_AOE_TICK_MS,
  WATER_CHARGE_RELEASE_MS,
  WATER_L2_AOE_MS,
  WATER_L3_ENTER_SLOW,
  WATER_L3_NUDGE_PX,
  waterAuraKey,
  waterChargeTier,
  waterConeVelocity,
  waterHitSizeFor,
  waterLeadAim,
  waterPierceFor,
} from '../src/assets/waterMounts.js';
import {
  SANDBOX_FLOAT_FRAME,
  SANDBOX_FLOAT_OFFSET,
  SANDBOX_WEAPONS,
  sandboxFloatOrigin,
  sandboxMuzzle,
  SANDBOX_WATER_CHARGE_SHEETS,
  sandboxChargeSheetReady,
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
const defender = readFileSync(new URL('../src/entities/Defender.js', import.meta.url), 'utf8');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(APP_VERSION === '0.36.20', 'APP_VERSION is 0.36.20');
assert(pkg.version === '0.36.20', 'package.json tracks 0.36.20');
assert(html.includes('ZombieDefend v0.36.20'), 'title tracks 0.36.20');
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
assert(sandboxWeaponLabel('water').includes('fx-lightning-impact'), 'water label names the lightning impact');
assert(!sandboxWeaponLabel('water').includes('fx-water-impact'), 'water label does not name the splash sheet');

assert(demo.includes('fenceOnly: false'), 'try-out does not take the fence fire path');
assert(demo.includes('waterMount'), 'water fires from the float muzzle slot');
assert(demo.includes('slingFromMount'), 'sling fires from the float muzzle slot');
assert(!demo.includes('new FenceMounts') && !demo.includes('new WaterMounts') && !demo.includes('new SlingMounts'), 'try-out draws no cradle');
assert(!demo.includes('SaveManager') && !demo.includes("registry.set('gold'"), 'try-out does not write gold');
assert(demo.includes('consumePending()'), 'try-out drops combat gold');
assert(demo.includes('showcaseHold = true'), 'target stays in front of the gun');
assert(demo.includes('playLibraryAnim'), 'float bob uses the library guard');
assert(!demo.includes('.play('), 'try-out does not call sprite.play directly');

assert(!stage.includes('new FenceMounts') && !stage.includes('new WaterMounts') && !stage.includes('new SlingMounts'), 'stage does not place fence mounts');
assert(stage.includes('triggerHeld') && stage.includes('weaponHeld'), 'SPACE and SWAP share the shoot hold');
assert(defender.includes('manualFire') && defender.includes('player-girl-water-fire'), 'stage shoots from the water fire pose');
const floats = readFileSync(new URL('../src/systems/HeroFloats.js', import.meta.url), 'utf8');
assert(floats.includes('-still') && floats.includes('prop-water-mount-front-alt'), 'the water float keeps its still sheet and optional cradle');
assert(weaponSystem.includes('manualFire') && weaponSystem.includes('_coneFlight'), 'manual shots use the ±10° cone');
assert(!stage.includes('player-handgun-shoot'), 'stage does not use the old handgun shoot sheet');
assert(!stage.includes('weaponTryout') && !stage.includes('WeaponTryout'), 'stage scene does not start the try-out');
assert(!main.includes('weaponTryout') && !main.includes('WeaponTryout'), 'main game does not register the try-out');
assert(stage.includes('Keys 5–9 only preview') || stage.includes('Keys 5-9 only preview'), 'feel keys 6–9 stay previews');
assert(weaponSystem.includes('PIXELLAB_HOOK'), 'projectile PIXELLAB_HOOK stays');
assert(demo.includes('confirmOpaqueHit'), 'try-out gates water on opaque pixels');
assert(defender.includes('confirmOpaqueHit'), 'stage gates water on the same opaque-pixel test');
assert(WATER_HIT_FX === 'fx-lightning-impact', 'water hit sheet is the lightning impact');
assert(WEAPON_TRAITS.water.projectile === 'fx-water-proj', 'water projectile stays');
const chargeByKey = Object.fromEntries(SANDBOX_WATER_CHARGE_SHEETS.map((spec) => [spec.key, spec]));
assert(sandboxChargeSheetReady(chargeByKey['fx-water-proj-t3'], { frameWidth: 512, frameHeight: 256, frames: 8, frameRate: 10 }), 'L3 projectile cell is 512×256, 8 @ 10');
assert(sandboxChargeSheetReady(chargeByKey['fx-water-t2-aoe'], { frameWidth: 256, frameHeight: 212, frames: 30, frameRate: 8 }), 'L2 AOE cell is 256×212, 30 @ 8');
assert(chargeByKey['fx-water-charge-aura-l2'] && chargeByKey['fx-water-charge-aura-l3'], 'yellow and red charge auras are registered');
assert(demo.includes('SANDBOX_WATER_CHARGE_SHEETS'), 'try-out preloads the charge sheets');
assert(page.includes('fx-water-charge-aura-l2') && page.includes('fx-water-proj-t3') && page.includes('512'), 'weapon page names the r2 charge sheets');
assert(WEAPON_TRAITS.lightning.chainFx === 'fx-lightning-chain', 'lightning chain sheet stays on the lightning gun');

const waterStart = weaponSystem.indexOf('_queueWaterSplash(primary, bullet)');
const waterFn = weaponSystem.slice(waterStart, weaponSystem.indexOf('/**', waterStart));
assert(waterFn.includes('fx-lightning-impact') || waterFn.includes('WATER_HIT_FX'), 'water contact spawns the lightning impact');
assert(!waterFn.includes('_chainLightning') && !waterFn.includes('fx-lightning-chain'), 'water contact does not chain');
assert(!waterFn.includes('_spawnGround') && !waterFn.includes('waterWetKey'), 'water contact does not spawn wet ground');
assert(!waterFn.includes('fx-water-impact') && !waterFn.includes('fx-water-splash') && !waterFn.includes('fx-hit-water'), 'water contact does not name a water hit sheet');

function solid(x, y, w, h, paint) {
  return {
    x,
    y,
    originX: 0.5,
    originY: 0.5,
    displayWidth: w,
    displayHeight: h,
    frameWidth: paint[0].length,
    frameHeight: paint.length,
    alphaAt: (fx, fy) => (paint[fy] && paint[fy][fx] ? 255 : 0),
  };
}
const blob = solid(0, 0, 4, 4, [
  [0, 1],
  [0, 1],
]);
const body = solid(1, 0, 4, 4, [
  [1, 0],
  [1, 0],
]);
const miss = solid(8, 0, 4, 4, [
  [1, 1],
  [1, 1],
]);
const touch = pixelBodiesTouchPoint(blob, body);
assert(touch && touch.x > 0 && touch.x < 2 && touch.y > -2 && touch.y < 2, 'opaque overlap reports a contact point');
assert(pixelBodiesTouchPoint(blob, miss) === null, 'separated opaque pixels do not touch');

const spawned = [];
function fxSprite(x, y, key) {
  const obj = {
    x, y, key, active: true,
    setOrigin() { return obj; },
    setScale() { return obj; },
    setDepth() { return obj; },
    setFlipX() { return obj; },
    setRotation() { return obj; },
    once() { return obj; },
  };
  spawned.push(obj);
  return obj;
}
const scene = {
  textures: {
    exists: (key) => [
      'fx-lightning-impact',
      'fx-lightning-chain',
      'fx-water-impact',
      'fx-water-splash-big',
      'fx-water-wet',
      'fx-water-wet-ground',
      'fx-hit-water-office-v2',
    ].includes(key),
  },
  anims: { exists: () => false },
  add: {
    sprite: fxSprite,
    rectangle(x, y, w, h) {
      return { x, y, w, h, active: true, setDepth() {} };
    },
  },
  time: { now: 0 },
};
const guns = new WeaponSystem(scene);
guns.setOwnedWeapons(['water']);
const chargeSlot = { muzzleX: 900, muzzleY: 400 };
const chargeBullets = [];
const chargeTrait = WEAPON_TRAITS.water;
assert(guns._stepWaterCharge(1000, chargeBullets, chargeSlot, [], chargeTrait, true, true) === false, 'holding does not fire');
assert(guns._stepWaterCharge(16, chargeBullets, chargeSlot, [], chargeTrait, false, true) === false, 'a 16ms SPACE gap does not fire');
assert(chargeBullets.length === 0 && guns.chargeMs() === 1000, 'the gap keeps the same charge');
assert(guns._stepWaterCharge(1600, chargeBullets, chargeSlot, [], chargeTrait, true, true) === false, 'the hold continues after the gap');
assert(guns.chargeTier() === 2, '2.6s of hold with a short slip is L2');
assert(guns._stepWaterCharge(WATER_CHARGE_RELEASE_MS, chargeBullets, chargeSlot, [], chargeTrait, false, true) === true, 'SPACE staying up releases the shot');
assert(chargeBullets.length === 1 && chargeBullets[0].charge === 2, 'the released shot is L2');
assert(guns.chargeMs() === 0, 'release clears the charge');
const l3Bullets = [];
assert(guns._stepWaterCharge(5000, l3Bullets, chargeSlot, [], chargeTrait, true, true) === false, 'a 5s hold is still charging');
assert(guns._stepWaterCharge(16, l3Bullets, chargeSlot, [], chargeTrait, false, true) === false, 'a slip at 5s does not fire early');
assert(guns.chargeTier() === 3, 'the slip leaves the charge on L3');
assert(guns._stepWaterCharge(WATER_CHARGE_RELEASE_MS, l3Bullets, chargeSlot, [], chargeTrait, false, true) === true, 'the 5s hold releases');
assert(l3Bullets[0]?.charge === 3, 'the released shot is L3');
assert(WATER_CHARGE_RELEASE_MS === 120, 'the release gap is 120ms');
const primary = {
  id: 1,
  x: 40,
  y: 80,
  alive: true,
  body: { active: true, fillColor: 1, x: 40, y: 80, displayWidth: 8, displayHeight: 8, originX: 0.5, originY: 0.5 },
  bodyCenterY: 60,
  displayHalf: 8,
  goldValue: 3,
  skin: { id: 'office-worker-v2' },
  takeDamage() { return false; },
};
guns.armHits([primary], []);
const bullet = {
  weaponId: 'water',
  damage: 18,
  knockbackBodies: 0,
  gfx: { fillColor: 1, x: 40, y: 76, displayWidth: 4, displayHeight: 4, originX: 0.5, originY: 0.5, active: true },
};
assert(guns.confirmOpaqueHit(bullet, primary) === true, 'overlapping filled water pixels count as a hit');
assert(Number.isFinite(bullet.touchX) && Number.isFinite(bullet.touchY), 'the hit stores the contact');
const missed = {
  weaponId: 'water',
  gfx: { fillColor: 1, x: 200, y: 0, displayWidth: 4, displayHeight: 4, originX: 0.5, originY: 0.5, active: true },
};
assert(guns.confirmOpaqueHit(missed, primary) === false, 'a water shot missing the body does not hit');
assert(guns.confirmOpaqueHit({ weaponId: 'sling' }, primary) === true, 'other guns keep the box test');
guns.applyDirectHit(primary, bullet);
const waterKeys = spawned.map((s) => s.key);
assert(waterKeys.length === 1 && waterKeys[0] === 'fx-lightning-impact', 'the only water hit sheet is fx-lightning-impact');
assert(spawned[0].x === bullet.touchX && spawned[0].y === bullet.touchY, 'the burst is placed on the contact, not the body center');
assert(spawned[0].y !== primary.bodyCenterY, 'the contact is not rewritten to the chest');

const held = waterLeadAim(100, 0, 0, 0, 0, 100);
assert(held.x === 0 && held.y === 0, 'a stopped body is aimed where it stands');
const led = waterLeadAim(100, 0, 0, 0, 50, 100);
assert(led.y === 0 && led.x > 30 && led.x < 36, 'a marching body is aimed at the intercept');

const crowd = [
  { id: 1, x: 10, y: 0, alive: true },
  { id: 2, x: 40, y: 30, alive: true },
  { id: 3, x: 200, y: 0, alive: false },
];
assert(pickWaterGuide(crowd, 100, 0, 2).id === 2, 'a water shot sticks to the body it is already guiding');
assert(pickWaterGuide(crowd, 100, 0, 3).id === 1, 'a dead guide is replaced by the body on the shot lane');
assert(pickWaterGuide(crowd, 0, 0, null) === null, 'nobody west of the shot is not a guide');
const otherLane = [
  { id: 1, x: 40, y: 0, alive: true },
  { id: 2, x: 80, y: 200, alive: true },
];
assert(pickWaterGuide(otherLane, 100, 0, null).id === 1, 'water prefers the lane it is fired on over a closer other lane');

function box(x, y, w, h) {
  return {
    fillColor: 1,
    active: true,
    x,
    y,
    originX: 0.5,
    originY: 0.5,
    displayWidth: w,
    displayHeight: h,
  };
}
const enemy = box(0, 0, 20, 40);
assert(spriteSweepContact(box(0, -30, 4, 4), enemy) === null, 'a skim that has not entered the body is not a hit');
const swept = spriteSweepContact(box(0, 0, 4, 4), enemy, { x: 0, y: -100 });
assert(swept && Math.abs(swept.x) <= 10 && Math.abs(swept.y) <= 20, 'a step that crosses the opaque box connects');

const near = {
  weaponId: 'water',
  gfx: box(40, 66, 4, 4),
};
assert(guns.confirmOpaqueHit(near, primary) === false, 'a water shot still outside the body does not hit');

const spawnAt = weaponSystem.indexOf('_spawnWaterShot(bullets, slot, zombies, trait, tier = 1) {');
const spawnFn = weaponSystem.slice(spawnAt, weaponSystem.indexOf('_nearestLiving(zombies, x, y)', spawnAt));
assert(spawnFn.includes('waterLeadAim') && spawnFn.includes('marchVx'), 'water leads the marching body');
assert(weaponSystem.includes('_guideWater'), 'water keeps guiding onto a living body ahead');
assert(weaponSystem.includes('spriteSweepContact'), 'water hits on opaque contact, including the step that crosses');
assert(!spawnFn.includes('_chainLightning'), 'the water spawn path does not chain');

const flying = {
  weaponId: 'water',
  guideId: 9,
  vx: -376,
  vy: 0,
  gfx: { x: 900, y: 400, active: true },
};
guns.armHits([{ id: 9, x: 1000, y: 400, alive: false, bodyCenterY: 400 }], []);
guns._guideWater(flying);
assert(flying.vx === -376 && flying.vy === 0, 'a dead guide keeps the last heading');
assert(flying.gfx.active === true && flying.guideId == null, 'a dead guide does not destroy the shot');

const steered = {
  weaponId: 'water',
  guideId: null,
  vx: -100,
  vy: 200,
  gfx: { x: 900, y: 400, active: true },
};
guns.armHits([{
  id: 1,
  x: 700,
  y: 400,
  alive: true,
  bodyCenterY: 400,
  marchVx() { return 0; },
}], []);
guns._guideWater(steered);
assert(steered.guideId === 1, 'a living body ahead is still the guide');
assert(steered.vx < 0 && Math.abs(steered.vy) < 1, 'the shot still turns onto that body');

scene.cameras = { main: { scrollX: 0, scrollY: 0, width: 1280, height: 720 } };
const onTarget = { gfx: { x: 734, y: 369, active: true }, weaponId: 'water', traveled: 226 };
assert(guns.shouldRetireBullet(onTarget) === false, 'a shot still on the sandbox view is not culled at the stage gutter');
const offLeft = { gfx: { x: -90, y: 369, active: true }, weaponId: 'water' };
assert(guns.shouldRetireBullet(offLeft) === true, 'a shot past the left of the view is retired');
scene.cameras = { main: { scrollX: 832, scrollY: 0, width: 1280, height: 720 } };
const stageGutter = { gfx: { x: 700, y: 400, active: true }, weaponId: 'water' };
assert(guns.shouldRetireBullet(stageGutter) === true, 'a shot left of the stage camera is retired off screen');
const stageLive = { gfx: { x: 900, y: 400, active: true }, weaponId: 'water' };
assert(guns.shouldRetireBullet(stageLive) === false, 'a shot still inside the stage view keeps flying');
delete scene.cameras;
const headless = { gfx: { x: 734, y: 369, active: true }, weaponId: 'water' };
assert(guns.shouldRetireBullet(headless) === true, 'without a camera the stage gutter cull still applies');

assert(waterChargeTier(0) === 1 && waterChargeTier(2499) === 1, 'a hold under 2.5s is L1');
assert(waterChargeTier(2500) === 2 && waterChargeTier(4999) === 2, '2.5s is L2');
assert(waterChargeTier(5000) === 3, '5s is L3');
assert(waterPierceFor(1) === 1 && waterPierceFor(2) === 1 && waterPierceFor(3) === Infinity, 'L1 and L2 stop on the first body, L3 crosses the field');
assert(waterHitSizeFor(1) === 16 && waterHitSizeFor(2) === 80 && waterHitSizeFor(3) === 320, 'the L3 AABB covers the native 512-wide cell');
assert(WATER_AOE_TICK_MS === 200, 'AOE contact ticks every 0.2s');
assert(WATER_L2_AOE_MS === 4000, 'the L2 explosion lasts 4 seconds');
assert(WATER_L3_ENTER_SLOW === 0.8, 'each new L3 body slows the shot by 20%');
assert(WATER_L3_NUDGE_PX === 2, 'each L3 damage tick nudges 2px');
assert(waterAuraKey(1) === 'fx-water-charge-aura' && waterAuraKey(2) === 'fx-water-charge-aura-l2' && waterAuraKey(3) === 'fx-water-charge-aura-l3', 'the charge glow swaps sheets by tier');
assert(WEAPON_TRAITS.water.label === '1 weapon', 'the water slot displays as 1 weapon');
assert(weaponSystem.includes('stepChargeAoe') && weaponSystem.includes('fx-water-t2-aoe') && weaponSystem.includes('fx-aoe-touch-x'), 'L2/L3 contact uses the catalog AOE and the white X');
assert(weaponSystem.includes('_spawnWaterExplosion') && weaponSystem.includes('_nudgeEast'), 'L2 leaves a contact explosion and L3 nudges east');
assert(!weaponSystem.includes('_dropPathBurn') && !weaponSystem.includes('fx-water-t3-impact'), 'L3 does not play a pierce-impact or path burn');
const steep = waterConeVelocity(500, 400, { x: 200, y: 40 }, 100);
const steepPitch = Math.atan2(steep.vy, steep.vx);
const steepDelta = steepPitch > 0 ? steepPitch - Math.PI : steepPitch + Math.PI;
assert(steep.vx < 0, 'a steep guide still flies west');
assert(Math.abs(steepDelta) <= (10 * Math.PI) / 180 + 1e-6, 'homing stays inside ±10 degrees');
const flat = waterConeVelocity(500, 400, { x: 200, y: 400 }, 100);
assert(flat.vx < 0 && Math.abs(flat.vy) < 1e-6, 'a body on the lane is a flat shot');
const piercing = { weaponId: 'water', pierce: 5, hitIds: [] };
for (const id of [1, 2, 3, 4]) guns.markWaterPierce(piercing, { id });
assert(guns.waterKeepsFlying(piercing) === true, 'a pierce-5 shot keeps flying before the fifth body');
guns.markWaterPierce(piercing, { id: 5 });
assert(guns.waterKeepsFlying(piercing) === false, 'a pierce-5 shot stops after five bodies');
assert(guns.waterKeepsFlying({ weaponId: 'water', pierce: 1, hitIds: [] }) === false, 'L2 pierce 1 does not keep the shot in the air');
assert(guns.waterKeepsFlying({ weaponId: 'water', pierce: Infinity, hitIds: [1, 2, 3, 4, 5, 6] }) === true, 'L3 keeps flying across the field');
assert(weaponSystem.includes('if (opts.waterCharge) continue'), 'charged water does not auto-fire');
assert(weaponSystem.includes('syncWaterCharge'), 'holding SPACE notifies the charge audio hook');
assert(weaponSystem.includes('playWaterRelease'), 'release notifies the charge audio hook');
assert(weaponSystem.includes('playWaterHitL1'), 'an L1 hit notifies sfx-hit-l1');
assert(weaponSystem.includes('playWaterAoeBoom'), 'the L2 contact notifies the AOE boom once');
assert(weaponSystem.includes('playWaterWhiteX'), 'each white X notifies sfx-white-x');
assert(!weaponSystem.includes('playWaterImpact'), 'the Mega Man impact hooks are gone');
assert(weaponSystem.includes('fx-lightning-impact') || weaponSystem.includes('WATER_HIT_FX'), 'L1 still uses the lightning impact');
assert(demo.includes('waterCharge') && demo.includes('waterHeld'), 'the sandbox charges water from SPACE');
const waterLine = (demo.match(/WATER_LINE_X = \[([^\]]+)\]/) || [])[1]?.split(',').map((part) => Number(part.trim()));
assert(waterLine?.length === 5 && waterLine.every((x, i) => i === 0 || x < waterLine[i - 1]), 'sandbox water still lines up five bodies running west');
assert(waterLine[0] <= 760 && waterLine[4] >= 70, 'the nearest water dummy sits far enough west for an L1 to read, and the last stays on screen');
assert(!stage.includes("_spaceKey.on('down'"), 'SPACE shoots instead of cycling');
assert(stage.includes('preloadGameAudio(this)'), 'stage preload includes the shared audio queue');
assert(stage.includes('KeyCodes.Q'), 'Q still cycles the other loadouts');
const audio = readFileSync(new URL('../src/systems/SoundManager.js', import.meta.url), 'utf8');
for (const key of WATER_EAR_PREVIEW_KEYS) {
  assert(audio.includes(`assets/audio/${key}.mp3`), `${key} is registered in GAME_AUDIO`);
}
assert(demo.includes('preloadGameAudio(this, { sandbox: true })'), 'sandbox water preloads the ear preview');
assert(demo.includes('ear SFX'), 'the water caption reports the ear preview');
assert(WATER_EAR_VOLUME.chargeL1 === 0.28 && WATER_EAR_VOLUME.chargeL2 === 0.3 && WATER_EAR_VOLUME.chargeL3 === 0.32, 'charge volumes stay in 0.28–0.32');
assert(WATER_EAR_VOLUME.fireL1 === 0.28 && WATER_EAR_VOLUME.fireL2 === 0.32 && WATER_EAR_VOLUME.fireL3 === 0.36, 'fire volumes are 0.28 / 0.32 / 0.36');
assert(WATER_EAR_VOLUME.hitL1 === 0.3 && WATER_EAR_VOLUME.aoeL2 === 0.38 && WATER_EAR_VOLUME.whiteX === 0.26, 'hit, boom, and white X volumes');
const stageQueued = [];
preloadGameAudio({
  load: { audio(key) { stageQueued.push(key); } },
  cache: { audio: { exists: () => false } },
});
const sandboxQueued = [];
preloadGameAudio({
  load: { audio(key) { sandboxQueued.push(key); } },
  cache: { audio: { exists: () => false } },
}, { sandbox: true });
for (const key of WATER_EAR_PREVIEW_KEYS) {
  assert(stageQueued.includes(key), `${key} preloads on the stage queue`);
  assert(sandboxQueued.includes(key), `${key} preloads for the sandbox`);
}
assert(stage.includes('preloadGameAudio(this)'), 'stage preload includes the shared audio queue');
assert(stageQueued.includes('bgm-stage') && sandboxQueued.includes('bgm-stage'), 'the ear preview does not drop the live beds');
const played = [];
const nodes = [];
const fake = {
  time: { now: 0 },
  sound: {
    mute: false,
    locked: false,
    add(key, cfg) {
      const node = {
        key,
        volume: cfg.volume,
        loop: !!cfg.loop,
        playing: false,
        play() { this.playing = true; played.push({ key, volume: cfg.volume }); },
        stop() { this.playing = false; },
        destroy() { this.playing = false; },
      };
      nodes.push(node);
      return node;
    },
  },
  cache: { audio: { exists: () => true } },
};
const beds = new SoundManager(fake);
const heard = () => played.map((row) => row.key);
beds.syncWaterCharge(1);
beds.syncWaterCharge(1);
assert(heard().filter((key) => key === 'sfx-charge-l1-blue').length === 1, 'SPACE down starts one blue charge');
assert(!heard().some((key) => key.startsWith('sfx-water-')), 'the Mega Man charge pack stays silent');
assert(!heard().includes('sfx-charge-l2-yellow'), 'yellow waits until the hold passes 2.5s');
beds.syncWaterCharge(2);
assert(heard().filter((key) => key === 'sfx-charge-l2-yellow').length === 1, 'past 2.5s the blue charge stops and yellow plays');
assert(nodes.filter((node) => node.key === 'sfx-charge-l1-blue' && node.playing).length === 0, 'the blue charge is stopped at L2');
beds.syncWaterCharge(3);
assert(heard().filter((key) => key === 'sfx-charge-l3-red').length === 1, 'past 5s yellow stops and the red charge plays');
assert(nodes.filter((node) => node.key === 'sfx-charge-l2-yellow' && node.playing).length === 0, 'the yellow charge is stopped at L3');
beds.syncWaterCharge(3);
assert(heard().filter((key) => key === 'sfx-charge-l3-red').length === 1, 'holding L3 does not restart the red charge');
beds.playWaterRelease(2);
assert(heard().includes('sfx-fire-l2'), 'a 2.5s release plays sfx-fire-l2');
assert(nodes.filter((node) => node.key.startsWith('sfx-charge-') && node.playing).length === 0, 'release stops the charge voice');
assert(played.find((row) => row.key === 'sfx-fire-l2')?.volume === 0.32, 'L2 fire is 0.32');
beds.playWaterRelease(1);
beds.playWaterRelease(3);
assert(heard().includes('sfx-fire-l1') && heard().includes('sfx-fire-l3'), 'L1 and L3 release play their fire cues');
beds.playWaterHitL1();
beds.playWaterAoeBoom();
beds.playWaterAoeBoom();
assert(heard().filter((key) => key === 'sfx-hit-l1').length === 1, 'L1 hit plays sfx-hit-l1');
assert(heard().filter((key) => key === 'sfx-aoe-l2-boom').length === 2, 'the boom helper plays each time the contact calls it');
beds.playWaterWhiteX();
beds.playWaterWhiteX();
assert(heard().filter((key) => key === 'sfx-white-x').length === 1, 'same-frame white X marks do not stack');
fake.time.now = 200;
beds.playWaterWhiteX();
assert(heard().filter((key) => key === 'sfx-white-x').length === 2, 'the next 0.2s tick plays white X again');
assert(played.find((row) => row.key === 'sfx-white-x')?.volume === 0.26, 'white X stays at 0.26');

console.log('weapon try-out ok');
