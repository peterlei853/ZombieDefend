/**
 * v0.31 water mounts and splash-synced HP.
 * Run: node tools/check-v031.mjs
 *
 * ?weapon=water: six fence mounts, stop behind one, shot aims at the
 * nearest living zombie, HP drops on the fx-water-splash-big beat.
 * Other guns still travel straight west. Barricade contact math stays.
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/data/GameConfig.js';
import { BULLET_SPEED } from '../src/data/waves.js';
import { HERO_UNARMED, WEAPON_TRAITS, forwardVelocity } from '../src/assets/heroDeploy.js';
import { waterBodyHitKey, zombieHitFxKey } from '../src/assets/zombieSprites.js';
import {
  WATER_MOUNT_ALIGN_FIELD,
  WATER_MOUNT_ALT_KEY,
  WATER_MOUNT_COUNT,
  WATER_MOUNT_FALLBACK_KEY,
  WATER_MOUNT_GUN_KEY,
  WATER_MOUNT_HI_VIS_KEY,
  WATER_MOUNT_KEY,
  WATER_MOUNT_LIFT,
  WATER_MOUNT_SCALE,
  WATER_SPLASH_FPS,
  WATER_SPLASH_FRAMES,
  buildWaterMountSlots,
  nearestWaterMount,
  waterAimVelocity,
  waterImpactBeatMs,
  waterMountYs,
  waterSplashKey,
  waterWetKey,
} from '../src/assets/waterMounts.js';
import { WaterMounts } from '../src/systems/WaterMounts.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { grassYMax, grassYMin, layoutPx, LAYOUT_SCALE } from '../src/systems/DepthView.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const weaponSrc = readFileSync(new URL('../src/systems/WeaponSystem.js', import.meta.url), 'utf8');
const defenderSrc = readFileSync(new URL('../src/entities/Defender.js', import.meta.url), 'utf8');
const barricadeSrc = readFileSync(new URL('../src/entities/Barricade.js', import.meta.url), 'utf8');
const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const mountSrc = readFileSync(new URL('../src/systems/WaterMounts.js', import.meta.url), 'utf8');

assert(pkg.version === '0.36.11' && APP_VERSION === '0.36.11', 'package and APP_VERSION are 0.36.11');
assert(html.includes('v0.36.11'), 'document title is v0.36.11');
assert(HERO_UNARMED.towerFire === 'player-girl-tower-fire', 'tower-fire pose key');
assert(HERO_UNARMED.command === 'player-girl-command', 'command pose stays the backup');
assert(WATER_MOUNT_HI_VIS_KEY === 'prop-water-mount-hi-vis', 'hi-vis mount sprite key');
assert(WATER_MOUNT_KEY === 'prop-water-mount', 'fallback mount sprite key');
assert(WATER_MOUNT_ALT_KEY === 'prop-water-mount-front-alt', 'front alt mount key');
assert(WATER_MOUNT_GUN_KEY === 'player-girl-front-water-still', 'cradle gun still');
assert(WATER_MOUNT_FALLBACK_KEY === WATER_MOUNT_GUN_KEY, 'still remains the missing-mount fallback');
assert(WATER_MOUNT_SCALE === 0.85 && WATER_MOUNT_LIFT === 4, 'cradle scale and lift keep the fork on the stake');
assert(mountSrc.includes('setActive') && mountSrc.includes('WATER_MOUNT_ALT_KEY'), 'active slot swaps to the front alt');
assert(mountSrc.includes('WATER_MOUNT_HI_VIS_KEY') && mountSrc.includes('WATER_MOUNT_KEY'), 'row prefers hi-vis, then the steel fork');
assert(defenderSrc.includes('HERO_UNARMED.towerFire') && defenderSrc.includes('HERO_UNARMED.command'), 'tower-fire is held before the command backup');
assert(defenderSrc.indexOf('HERO_UNARMED.towerFire') < defenderSrc.indexOf('HERO_UNARMED.command'), 'tower-fire is tried first');
assert(weaponSrc.includes('waterSplashKey'), 'HP beat still times off the splash sheet');
assert(weaponSrc.includes('fx-lightning-impact'), 'water hit names the lightning impact');
assert(!weaponSrc.includes('waterWetKey'), 'water hit does not resolve a wet sheet');
assert(weaponSrc.includes('PIXELLAB_HOOK: fx-hit-<skinId>'), 'unmapped skins keep the generic hit hook');
assert(waterBodyHitKey('office-worker-v2') === 'fx-hit-water-office-v2', 'office water hit');
assert(waterBodyHitKey('delivery') === 'fx-hit-water-delivery', 'delivery water hit');
assert(waterBodyHitKey('chef') === 'fx-hit-water-chef', 'chef water hit');
assert(waterBodyHitKey('nurse') === 'fx-hit-water-nurse', 'nurse water hit');
assert(waterBodyHitKey('clown') === null && waterBodyHitKey('') === null, 'unmapped skin has no water overlay');
assert(zombieHitFxKey('chef') === 'fx-hit-chef', 'chef hit fx key');
assert(zombieHitFxKey('office-worker-v2') === 'fx-hit-office-worker-v2', 'office hit fx key');
assert(zombieHitFxKey('') === null && zombieHitFxKey(null) === null, 'empty skin has no hit fx');
assert(waterSplashKey((key) => key === 'fx-water-splash-big') === 'fx-water-splash-big', 'splash prefers the big sheet');
assert(waterSplashKey((key) => key === 'fx-water-impact') === 'fx-water-impact', 'splash falls back to the legacy impact');
assert(waterWetKey((key) => key === 'fx-water-wet-ground') === 'fx-water-wet-ground', 'wet prefers the ground sheet');
assert(waterWetKey((key) => key === 'fx-water-wet') === 'fx-water-wet', 'wet falls back to the legacy puddle');

assert(WEAPON_TRAITS.water.projectile === 'fx-water-proj', 'water projectile key');
assert(WEAPON_TRAITS.water.impact === 'fx-water-impact', 'water trait keeps the legacy impact name');
assert(WEAPON_TRAITS.water.ground === 'fx-water-wet', 'water trait keeps the legacy wet name');
assert(WEAPON_TRAITS.water.splash === 10 && WEAPON_TRAITS.water.splashRadius === 56, 'splash table unchanged');
const splashBeat = (WATER_SPLASH_FRAMES / WATER_SPLASH_FPS) * 1000 * 0.5;
assert(Math.abs(waterImpactBeatMs() - splashBeat) < 1e-6, 'HP beat is mid splash-big sheet');
assert(waterImpactBeatMs(500) === 250, 'legacy impact sheet still beats at 250ms');

const west = forwardVelocity(100);
assert(west.vx === -100 && west.vy === 0, 'other guns stay on the west ray');
const aimed = waterAimVelocity(200, 50, { x: 100, y: 60 }, 80);
assert(aimed.vx < 0 && aimed.vy > 0, 'water aims west toward the body');
const east = waterAimVelocity(200, 50, { x: 400, y: 90 }, 80);
assert(east.vx === -80 && east.vy === 0, 'an east target falls back to straight west');
assert(waterAimVelocity(10, 10, null, 40).vy === 0, 'no target is straight west');

const ys = waterMountYs();
assert(ys.length === WATER_MOUNT_COUNT, 'six mount lanes');
const gap = ys[1] - ys[0];
assert(gap > layoutPx(18) * 2, 'alignment window is narrower than the gap');
for (let i = 1; i < ys.length; i++) {
  assert(Math.abs(ys[i] - ys[i - 1] - gap) < 1e-6, `even spacing ${i}`);
}
assert(ys[0] > grassYMin() && ys[ys.length - 1] < grassYMax(), 'mounts sit inside the grass');

const slots = buildWaterMountSlots((y) => ({ x: 900, groundY: y, postH: 80 }));
assert(slots.length === 6 && slots.every((s) => s.muzzleX < s.x), 'muzzles point west of the post');
const frameScale = 80 / 64;
assert(slots.every((s) => Math.abs(s.scale - frameScale * WATER_MOUNT_SCALE) < 1e-9), 'mount scale is under the post height');
assert(
  slots.every((s) => Math.abs(s.feetY - (s.y - WATER_MOUNT_LIFT * frameScale)) < 1e-6),
  'mount feet lift clear of the picket tip'
);
const align = layoutPx(WATER_MOUNT_ALIGN_FIELD);
assert(nearestWaterMount(slots[2].y, slots, align) === slots[2], 'standing on a mount aligns');
const between = (slots[2].y + slots[3].y) / 2;
assert(nearestWaterMount(between, slots, align) === null, 'the gap between mounts does not fire');
assert(nearestWaterMount(between, slots, Infinity)?.index === 2, 'spawn snap still picks a nearest mount');

assert(barricadeSrc.includes('return barricadeXAtY(y, postW / 2) - postW / 2'), 'contact face is unchanged');
assert(!barricadeSrc.includes('localStorage') && !barricadeSrc.includes('spendGold'), 'mount anchor does not touch saves or gold');
assert(stageSrc.includes('new WaterMounts'), 'stage places the mounts');
assert(defenderSrc.includes('waterMount'), 'fire is gated on a mount slot');

const spawned = [];
function label() {
  const obj = {
    active: true,
    setOrigin() { return obj; },
    setDepth() { return obj; },
    setAlpha() { return obj; },
    setText() { return obj; },
    once() { return obj; },
  };
  return obj;
}
function sprite(x, y, key) {
  const obj = {
    x, y, key, active: true,
    texture: { key },
    setOrigin() { return obj; },
    setScale() { return obj; },
    setDepth() { return obj; },
    setFlipX() { return obj; },
    setRotation() { return obj; },
    setTexture(next) {
      obj.key = next;
      obj.texture = { key: next };
      return obj;
    },
    once() { return obj; },
  };
  spawned.push(obj);
  return obj;
}
function makeScene(keys) {
  const known = new Set(keys);
  return {
    textures: { exists: (key) => known.has(key) },
    anims: { exists: () => false },
    add: {
      sprite,
      rectangle(x, y, w, h, color) {
        return sprite(x, y, `rect:${color}`);
      },
      text() { return label(); },
    },
    tweens: { add: () => ({}), killTweensOf() {} },
    time: { now: 0 },
  };
}
const anchor = {
  postAnchorAt(y) {
    return { x: 880, groundY: y, postH: 90 };
  },
};

const fallback = new WaterMounts(makeScene([WATER_MOUNT_FALLBACK_KEY]), anchor);
assert(fallback.sprites.length === 6 && fallback.guns.length === 0, 'missing cradle falls back to the gun still');
assert(fallback.sprites.every((s) => s.key === WATER_MOUNT_FALLBACK_KEY), 'placeholder gun until prop-water-mount exists');

const plain = new WaterMounts(makeScene([WATER_MOUNT_KEY, WATER_MOUNT_GUN_KEY]), anchor);
assert(plain.sprites.every((s) => s.key === WATER_MOUNT_KEY), 'missing hi-vis falls back to prop-water-mount');

const scene = makeScene([
  WATER_MOUNT_HI_VIS_KEY,
  WATER_MOUNT_KEY,
  WATER_MOUNT_ALT_KEY,
  WATER_MOUNT_GUN_KEY,
  'fx-lightning-impact',
  'fx-lightning-chain',
  'fx-water-splash-big',
  'fx-water-wet-ground',
  'fx-water-impact',
  'fx-water-wet',
  'fx-hit-water-chef',
]);
const mounts = new WaterMounts(scene, anchor);
assert(mounts.sprites.length === 6 && mounts.guns.length === 6, 'six cradles and six seated guns');
assert(mounts.sprites.every((s) => s.key === WATER_MOUNT_HI_VIS_KEY), 'hi-vis cradle is the row');
assert(mounts.guns.every((s) => s.key === WATER_MOUNT_GUN_KEY), 'still sits in the cradle');
mounts.setActive(4);
assert(mounts.sprites[4].key === WATER_MOUNT_ALT_KEY, 'aligned slot uses the front alt');
assert(mounts.sprites.every((s, i) => i === 4 || s.key === WATER_MOUNT_HI_VIS_KEY), 'other slots stay the hi-vis cradle');
mounts.setActive(-1);
assert(mounts.sprites.every((s) => s.key === WATER_MOUNT_HI_VIS_KEY), 'clearing the slot restores the hi-vis cradle');
assert(mounts.aligned(mounts.slots[4].y)?.index === 4, 'aligned() matches the slot under the hero');
assert(mounts.aligned(between) === null, 'aligned() refuses the gap');

const damaged = [];
function zed(id, x, y = 100) {
  return {
    id,
    x,
    y,
    alive: true,
    body: { active: true },
    bodyCenterY: y - 20,
    displayHalf: 10,
    goldValue: 4,
    skin: { id: 'chef' },
    takeDamage(amount) {
      damaged.push({ id, amount });
      if (id === 1) {
        this.alive = false;
        this.body = null;
        return true;
      }
      return false;
    },
  };
}

const guns = new WeaponSystem(scene);
guns.setOwnedWeapons(['water']);
const primary = zed(1, 0, 100);
const neighbor = zed(2, layoutPx(40), 100);
const outsider = zed(3, layoutPx(400), 100);
guns.armHits([primary, neighbor, outsider], []);
spawned.length = 0;
const early = guns.applyDirectHit(primary, {
  weaponId: 'water',
  damage: 18,
  knockbackBodies: 0,
  touchX: 12,
  touchY: 34,
});
assert(early.gold === 0 && early.kills === 0, 'contact does not pay gold');
assert(damaged.length === 0, 'contact does not drop HP');
const zap = spawned.filter((s) => s.key === 'fx-lightning-impact');
assert(zap.length === 1 && zap[0].x === 12 && zap[0].y === 34, 'lightning impact sits on the opaque contact');
assert(!spawned.some((s) => s.key === 'fx-lightning-chain'), 'water does not chain');
assert(!spawned.some((s) => s.key === 'fx-water-splash-big' || s.key === 'fx-water-wet-ground' || s.key === 'fx-water-impact' || s.key === 'fx-water-wet' || s.key === 'fx-hit-water-chef'), 'water attack sheets stay off on contact');
guns.stepOverlays(splashBeat - 1);
assert(damaged.length === 0, 'HP waits through the first half of the splash');
guns.stepOverlays(1);
assert(damaged.length === 2, 'primary and splash share one beat');
assert(damaged[0].id === 1 && damaged[0].amount === 18, 'primary takes the direct hit on the beat');
assert(damaged[1].id === 2 && damaged[1].amount === 10, 'neighbor takes splash damage on the same beat');
assert(!damaged.some((d) => d.id === 3), 'outside the splash radius is spared');
assert(!spawned.some((s) => s.key === 'fx-hit-water-chef' || s.key === 'fx-water-impact' || s.key === 'fx-water-splash-big' || s.key === 'fx-water-wet' || s.key === 'fx-water-wet-ground'), 'the damage beat does not play water sheets');
assert(spawned.filter((s) => s.key === 'fx-lightning-impact').length === 1, 'the beat does not add a second lightning burst');
assert(spawned.filter((s) => s.key === 'fx-lightning-chain').length === 0, 'splash neighbors are not a chain');
const pending = guns.consumePending();
assert(pending.gold === 4 && pending.kills === 1, 'kill gold lands with the FX beat');

const legacyScene = makeScene(['fx-water-impact', 'fx-water-wet']);
const legacyHits = [];
const legacyZ = {
  id: 7,
  x: 0,
  y: 40,
  alive: true,
  body: { active: true },
  bodyCenterY: 20,
  displayHalf: 10,
  goldValue: 0,
  skin: { id: 'clown' },
  takeDamage(amount) {
    legacyHits.push(amount);
    return false;
  },
};
const legacy = new WeaponSystem(legacyScene);
legacy.armHits([legacyZ], []);
spawned.length = 0;
legacy.applyDirectHit(legacyZ, {
  weaponId: 'water',
  damage: 9,
  knockbackBodies: 0,
  touchX: 3,
  touchY: 8,
});
assert(!spawned.some((s) => s.key === 'fx-water-impact' || s.key === 'fx-water-wet'), 'legacy water sheets are not played');
assert(!spawned.some((s) => s.key === 'fx-lightning-impact'), 'a missing lightning sheet does not fall back to water');
legacy.stepOverlays(249);
assert(legacyHits.length === 0, 'legacy sheet still waits 250ms');
legacy.stepOverlays(1);
assert(legacyHits.length === 1 && legacyHits[0] === 9, 'legacy sheet drops HP at 250ms');
assert(!spawned.some((s) => s.key === 'fx-water-impact' || s.key === 'fx-water-wet'), 'the beat still does not play water sheets');

const slingHits = [];
const slingZ = {
  id: 9,
  x: 10,
  y: 10,
  alive: true,
  body: { active: true },
  bodyCenterY: 0,
  displayHalf: 12,
  goldValue: 1,
  skin: { id: 'delivery' },
  applyKnockback() { slingHits.push('knock'); },
  takeDamage(amount) {
    slingHits.push(amount);
    return false;
  },
};
const slingGun = new WeaponSystem(scene);
slingGun.armHits([slingZ], []);
slingGun.applyDirectHit(slingZ, {
  weaponId: 'sling',
  damage: 16,
  impact: 'fx-sling-impact',
  knockbackBodies: 2,
});
assert(slingHits.length === 0, 'sling contact waits for the impact beat');

const bullets = [];
const lane = new WeaponSystem(scene);
lane.setOwnedWeapons(['water', 'sling']);
const near = zed(4, 100, 80);
near.bodyCenterY = 60;
const far = zed(5, 10, 10);
far.bodyCenterY = 0;
const fired = lane.updatePlayerFire(1000, 500, 50, [near, far], bullets, {
  frontFloat: true,
  canFire: true,
  visualScale: 1,
  muzzles: [{ id: 'sling', x: 400, y: 50 }, { id: 'water', x: 410, y: 40 }],
  waterMount: { muzzleX: 200, muzzleY: 50 },
});
assert(fired === 'water', 'water reports the volley when it shoots');
const waterBullet = bullets.find((b) => b.weaponId === 'water');
const slingBullet = bullets.find((b) => b.weaponId === 'sling');
assert(waterBullet && waterBullet.gfx.x === 200 && waterBullet.gfx.y === 50, 'water leaves the mount muzzle');
assert(waterBullet.vx < 0 && waterBullet.vy !== 0, 'water shot is west but not a flat ray');
const speed = BULLET_SPEED * LAYOUT_SCALE * WEAPON_TRAITS.water.speed;
const expectDx = 100 - 200;
const expectDy = 60 - 50;
const expectLen = Math.hypot(expectDx, expectDy);
assert(Math.abs(waterBullet.vx - (expectDx / expectLen) * speed) < 1e-6, 'water velocity x tracks the nearest body');
assert(Math.abs(waterBullet.vy - (expectDy / expectLen) * speed) < 1e-6, 'water velocity y tracks the nearest body');
assert(slingBullet && slingBullet.vy === 0 && slingBullet.vx < 0, 'sling stays on the west ray');
assert(slingBullet.gfx.x === 400, 'sling still leaves its float muzzle');

const idle = [];
const held = new WeaponSystem(scene);
held.setOwnedWeapons(['water', 'sling']);
held.updatePlayerFire(1000, 0, 0, [near], idle, {
  frontFloat: true,
  canFire: true,
  visualScale: 1,
  muzzles: [{ id: 'sling', x: 12, y: 12 }],
  waterMount: null,
});
assert(!idle.some((b) => b.weaponId === 'water'), 'water does not free-fire off a mount');
assert(idle.some((b) => b.weaponId === 'sling' && b.vy === 0), 'sling still fires off a water mount');

if (failed) {
  console.error(`${failed} v0.31 check(s) failed`);
  process.exit(1);
}
console.log('v0.31 checks passed');
