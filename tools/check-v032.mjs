/**
 * v0.32 sling mounts and impact-synced HP.
 * Run: node tools/check-v032.mjs
 *
 * ?weapon=sling: six fence mounts, stop behind one, shot aims at the
 * nearest living zombie, HP and knockback drop on the fx-sling-impact beat.
 * Per-skin fx-hit-sling-* plays on that same beat. Beside water, sling
 * still travels straight west. Barricade contact math stays.
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/data/GameConfig.js';
import { BULLET_SPEED } from '../src/data/waves.js';
import { HERO_UNARMED, WEAPON_TRAITS } from '../src/assets/heroDeploy.js';
import { slingBodyHitKey } from '../src/assets/zombieSprites.js';
import { WATER_MOUNT_HI_VIS_KEY } from '../src/assets/waterMounts.js';
import {
  SLING_IMPACT_FPS,
  SLING_IMPACT_FRAMES,
  SLING_MOUNT_ALIGN_FIELD,
  SLING_MOUNT_ALT_KEY,
  SLING_MOUNT_COUNT,
  SLING_MOUNT_FALLBACK_KEY,
  SLING_MOUNT_GUN_KEY,
  SLING_MOUNT_HI_VIS_KEY,
  SLING_MOUNT_KEY,
  buildSlingMountSlots,
  nearestSlingMount,
  slingActiveKey,
  slingAimVelocity,
  slingImpactBeatMs,
  slingImpactKey,
  slingMountKey,
  slingRowKey,
} from '../src/assets/slingMounts.js';
import { SlingMounts } from '../src/systems/SlingMounts.js';
import { SLING_OVERLAY_DEPTH_BIAS, SLING_OVERLAY_SCALE, WeaponSystem } from '../src/systems/WeaponSystem.js';
import { depthFromY, layoutPx, LAYOUT_SCALE } from '../src/systems/DepthView.js';

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
const mountSrc = readFileSync(new URL('../src/systems/SlingMounts.js', import.meta.url), 'utf8');
const slingAssetSrc = readFileSync(new URL('../src/assets/slingMounts.js', import.meta.url), 'utf8');

assert(pkg.version === '0.36.26' && APP_VERSION === '0.36.26', 'package and APP_VERSION are 0.36.26');
assert(html.includes('v0.36.26'), 'document title is v0.36.26');
assert(HERO_UNARMED.towerFire === 'player-girl-tower-fire', 'tower-fire pose key');
assert(SLING_MOUNT_HI_VIS_KEY === 'prop-sling-mount-hi-vis', 'sling hi-vis mount key');
assert(SLING_MOUNT_KEY === 'prop-sling-mount', 'sling mount key');
assert(SLING_MOUNT_ALT_KEY === 'prop-sling-mount-front-alt', 'sling front alt mount key');
assert(SLING_MOUNT_FALLBACK_KEY === WATER_MOUNT_HI_VIS_KEY, 'water hi-vis is the sling mount fallback');
assert(SLING_MOUNT_GUN_KEY === 'player-girl-front-sling-still', 'cradle gun still');
assert(SLING_MOUNT_COUNT === 6, 'six sling mounts');
assert(mountSrc.includes('setActive') && mountSrc.includes('slingActiveKey'), 'active slot can take the hi-vis cradle');
assert(defenderSrc.includes('slingMounts.nearest'), 'sling-only demo snaps to the nearest mount');
assert(defenderSrc.includes('slingFromMount'), 'sling fire is gated on the fence');
assert(defenderSrc.includes('HERO_UNARMED.towerFire'), 'tower-fire still is held on a mount');
assert(weaponSrc.includes('slingImpactKey') && weaponSrc.includes('_queueSlingImpact'), 'impact plays before HP');
assert(weaponSrc.includes('PIXELLAB_HOOK: fx-hit-sling-<skinId>'), 'per-monster sling hit hook');
assert(slingBodyHitKey('office-worker-v2') === 'fx-hit-sling-office-v2', 'office sling hit');
assert(slingBodyHitKey('delivery') === 'fx-hit-sling-delivery', 'delivery sling hit');
assert(slingBodyHitKey('chef') === 'fx-hit-sling-chef', 'chef sling hit');
assert(slingBodyHitKey('nurse') === 'fx-hit-sling-nurse', 'nurse sling hit');
assert(slingBodyHitKey('clown') === 'fx-hit-sling-clown', 'clown sling hit hook');
assert(slingBodyHitKey('slime-mini') === 'fx-hit-sling-slime-mini', 'slime-mini sling hit hook');
assert(slingBodyHitKey('') === null && slingBodyHitKey(null) === null, 'empty skin has no sling hit hook');

const existsHi = (key) => key === SLING_MOUNT_HI_VIS_KEY;
const existsPlain = (key) => key === SLING_MOUNT_KEY;
const existsWater = (key) => key === WATER_MOUNT_HI_VIS_KEY;
const existsBoth = (key) => key === SLING_MOUNT_HI_VIS_KEY || key === SLING_MOUNT_KEY;
const existsAlt = (key) => key === SLING_MOUNT_ALT_KEY || key === SLING_MOUNT_HI_VIS_KEY;
assert(slingMountKey(existsHi) === SLING_MOUNT_HI_VIS_KEY, 'hi-vis sling mount wins');
assert(slingMountKey(existsPlain) === SLING_MOUNT_KEY, 'plain sling mount is next');
assert(slingMountKey(existsWater) === WATER_MOUNT_HI_VIS_KEY, 'water hi-vis is the last mount');
assert(slingMountKey(() => false) === null, 'no mount texture resolves to null');
assert(slingRowKey(existsBoth) === SLING_MOUNT_HI_VIS_KEY, 'hi-vis is the row when both sling sheets exist');
assert(slingRowKey(existsWater) === WATER_MOUNT_HI_VIS_KEY, 'row uses the water fallback');
assert(slingActiveKey(existsAlt) === SLING_MOUNT_ALT_KEY, 'active slot prefers the front alt');
assert(slingActiveKey(existsHi) === SLING_MOUNT_HI_VIS_KEY, 'missing front alt keeps the row texture');
assert(slingImpactKey((key) => key === 'fx-sling-impact') === 'fx-sling-impact', 'impact prefers the burst');
assert(slingImpactKey((key) => key === 'fx-sling-pellet') === 'fx-sling-pellet', 'impact falls back to the pellet');

assert(WEAPON_TRAITS.sling.damage === 16 && WEAPON_TRAITS.sling.knockbackBodies === 2, 'sling damage table unchanged');
assert(WEAPON_TRAITS.sling.projectile === 'fx-sling-pellet', 'sling projectile key');
assert(WEAPON_TRAITS.sling.impact === 'fx-sling-impact', 'sling impact key');
const impactBeat = (SLING_IMPACT_FRAMES / SLING_IMPACT_FPS) * 1000 * 0.5;
assert(Math.abs(slingImpactBeatMs() - impactBeat) < 1e-6, 'HP beat is mid impact sheet');

const aimed = slingAimVelocity(200, 50, { x: 100, y: 60 }, 80);
assert(aimed.vx < 0 && aimed.vy > 0, 'sling aims west toward the body');
const east = slingAimVelocity(200, 50, { x: 400, y: 90 }, 80);
assert(east.vx === -80 && east.vy === 0, 'an east target falls back to straight west');

const slots = buildSlingMountSlots((y) => ({ x: 900, groundY: y, postH: 80 }));
assert(slots.length === 6 && slots.every((s) => s.muzzleX < s.x), 'muzzles point west of the post');
const align = layoutPx(SLING_MOUNT_ALIGN_FIELD);
assert(nearestSlingMount(slots[2].y, slots, align) === slots[2], 'standing on a mount aligns');
const between = (slots[2].y + slots[3].y) / 2;
assert(nearestSlingMount(between, slots, align) === null, 'the gap between mounts does not fire');
assert(nearestSlingMount(between, slots, Infinity)?.index === 2, 'spawn snap still picks a nearest mount');

assert(barricadeSrc.includes('return barricadeXAtY(y, postW / 2) - postW / 2'), 'contact face is unchanged');
assert(!barricadeSrc.includes('localStorage') && !barricadeSrc.includes('spendGold'), 'mount anchor does not touch saves or gold');
assert(!slingAssetSrc.includes('localStorage') && !mountSrc.includes('localStorage'), 'sling mounts do not touch saves');
assert(!stageSrc.includes('new SlingMounts') && !stageSrc.includes('new WaterMounts'), 'stage does not place gun mounts');
assert(!stageSrc.includes('!ownsWater'), 'stage does not keep a fence when water is owned');

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
    setScale(scale) { obj.scale = scale; return obj; },
    setDepth(depth) { obj.depth = depth; return obj; },
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

const fallback = new SlingMounts(makeScene([SLING_MOUNT_GUN_KEY]), anchor);
assert(fallback.sprites.length === 6 && fallback.guns.length === 0, 'missing cradle falls back to the gun still');
assert(fallback.sprites.every((s) => s.key === SLING_MOUNT_GUN_KEY), 'placeholder gun until a mount exists');

const waterOnly = new SlingMounts(makeScene([WATER_MOUNT_HI_VIS_KEY, SLING_MOUNT_GUN_KEY]), anchor);
assert(waterOnly.sprites.every((s) => s.key === WATER_MOUNT_HI_VIS_KEY), 'water hi-vis fills in for a missing sling cradle');
assert(waterOnly.guns.every((s) => s.key === SLING_MOUNT_GUN_KEY), 'sling still sits in the fallback cradle');

const mounts = new SlingMounts(
  makeScene([
    SLING_MOUNT_HI_VIS_KEY,
    SLING_MOUNT_KEY,
    SLING_MOUNT_ALT_KEY,
    SLING_MOUNT_GUN_KEY,
    'fx-sling-impact',
    'fx-hit-sling-chef',
  ]),
  anchor
);
assert(mounts.sprites.length === 6 && mounts.guns.length === 6, 'six cradles and six seated guns');
assert(mounts.sprites.every((s) => s.key === SLING_MOUNT_HI_VIS_KEY), 'hi-vis sling cradle is the row');
mounts.setActive(4);
assert(mounts.sprites[4].key === SLING_MOUNT_ALT_KEY, 'aligned slot uses the front alt');
assert(mounts.sprites.every((s, i) => i === 4 || s.key === SLING_MOUNT_HI_VIS_KEY), 'other slots stay the hi-vis cradle');
mounts.setActive(-1);
assert(mounts.sprites.every((s) => s.key === SLING_MOUNT_HI_VIS_KEY), 'clearing the slot restores the hi-vis cradle');
assert(mounts.aligned(mounts.slots[4].y)?.index === 4, 'aligned() matches the slot under the hero');
assert(mounts.aligned(between) === null, 'aligned() refuses the gap');

const knocked = [];
const damaged = [];
function zed(id, x, y = 100, skinId = 'chef') {
  return {
    id,
    x,
    y,
    alive: true,
    body: { active: true },
    bodyCenterY: y - 20,
    displayHalf: 12,
    goldValue: 4,
    skin: { id: skinId },
    applyKnockback() { knocked.push(id); },
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

const scene = makeScene(['fx-sling-impact', 'fx-sling-pellet', 'fx-hit-sling-chef', 'fx-sling-knockback']);
const guns = new WeaponSystem(scene);
guns.setOwnedWeapons(['sling']);
const primary = zed(1, 0, 100);
guns.armHits([primary], []);
spawned.length = 0;
knocked.length = 0;
const early = guns.applyDirectHit(primary, {
  weaponId: 'sling',
  damage: 16,
  impact: 'fx-sling-impact',
  knockbackBodies: 2,
});
assert(early.gold === 0 && early.kills === 0, 'contact does not pay gold');
assert(damaged.length === 0 && knocked.length === 0, 'contact does not drop HP or shove');
const burst = spawned.find((s) => s.key === 'fx-sling-impact');
const aboveBody = depthFromY(primary.y) + SLING_OVERLAY_DEPTH_BIAS;
assert(burst && burst.y === primary.bodyCenterY, 'impact FX is at the body center');
assert(burst.depth === aboveBody && burst.depth > depthFromY(primary.bodyCenterY), 'impact sorts above the zombie sprite');
assert(burst.scale === SLING_OVERLAY_SCALE, 'impact scale reads on the body');
assert(!spawned.some((s) => s.key === 'fx-hit-sling-chef'), 'profession hit waits for the damage beat');
guns.stepOverlays(impactBeat - 1);
assert(damaged.length === 0 && knocked.length === 0, 'HP waits through the first half of the impact');
guns.stepOverlays(2);
assert(knocked[0] === 1 && damaged[0]?.id === 1 && damaged[0].amount === 16, 'knockback then HP land on the beat');
const bodyHits = spawned.filter((s) => s.key === 'fx-hit-sling-chef');
assert(bodyHits.length === 1 && bodyHits[0].y === primary.bodyCenterY, 'chef hit FX lands at the body center');
assert(bodyHits[0].depth === aboveBody && bodyHits[0].scale === SLING_OVERLAY_SCALE, 'chef hit sorts above the body and stays large');
const streak = spawned.find((s) => s.key === 'fx-sling-knockback');
assert(streak && streak.y === primary.bodyCenterY && streak.depth === aboveBody, 'knockback streak plays above the body on the beat');
const pending = guns.consumePending();
assert(pending.gold === 4 && pending.kills === 1, 'kill gold lands with the FX beat');

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
  applyKnockback() {},
  takeDamage(amount) {
    legacyHits.push(amount);
    return false;
  },
};
const legacyScene = makeScene(['fx-sling-pellet']);
const legacy = new WeaponSystem(legacyScene);
legacy.armHits([legacyZ], []);
spawned.length = 0;
legacy.applyDirectHit(legacyZ, { weaponId: 'sling', damage: 9, knockbackBodies: 2 });
assert(spawned.some((s) => s.key === 'fx-sling-pellet' && s.y === legacyZ.bodyCenterY && s.depth === depthFromY(legacyZ.y) + SLING_OVERLAY_DEPTH_BIAS), 'missing impact uses the pellet sheet above the body');
const pelletBeat = slingImpactBeatMs((4 / 14) * 1000);
legacy.stepOverlays(pelletBeat - 1);
assert(legacyHits.length === 0, 'pellet sheet still waits for its midpoint');
legacy.stepOverlays(2);
assert(legacyHits.length === 1 && legacyHits[0] === 9, 'pellet sheet drops HP at its midpoint');
assert(spawned.filter((s) => s.key === 'fx-sling-pellet').length >= 2, 'missing hook falls back to the pellet on the beat');

const bullets = [];
const lane = new WeaponSystem(scene);
lane.setOwnedWeapons(['sling']);
const near = zed(4, 100, 80);
near.bodyCenterY = 60;
const fired = lane.updatePlayerFire(1000, 500, 50, [near], bullets, {
  frontFloat: true,
  canFire: true,
  visualScale: 1,
  muzzles: [{ id: 'sling', x: 400, y: 50 }],
  slingFromMount: true,
  slingMount: { muzzleX: 200, muzzleY: 50 },
});
assert(fired === 'sling', 'sling reports the volley when it shoots');
const slingBullet = bullets.find((b) => b.weaponId === 'sling');
assert(slingBullet && slingBullet.gfx.x === 200 && slingBullet.gfx.y === 50, 'sling leaves the mount muzzle');
assert(slingBullet.vx < 0 && slingBullet.vy !== 0, 'sling shot is west but not a flat ray');
const speed = BULLET_SPEED * LAYOUT_SCALE * WEAPON_TRAITS.sling.speed;
const expectDx = 100 - 200;
const expectDy = 60 - 50;
const expectLen = Math.hypot(expectDx, expectDy);
assert(Math.abs(slingBullet.vx - (expectDx / expectLen) * speed) < 1e-6, 'sling velocity x tracks the nearest body');
assert(Math.abs(slingBullet.vy - (expectDy / expectLen) * speed) < 1e-6, 'sling velocity y tracks the nearest body');

const idle = [];
const held = new WeaponSystem(scene);
held.setOwnedWeapons(['sling']);
held.updatePlayerFire(1000, 0, 0, [near], idle, {
  frontFloat: true,
  canFire: true,
  visualScale: 1,
  muzzles: [{ id: 'sling', x: 12, y: 12 }],
  slingFromMount: true,
  slingMount: null,
});
assert(idle.length === 0, 'sling does not free-fire off a mount');

const mixed = [];
const arc = new WeaponSystem(scene);
arc.setOwnedWeapons(['water', 'sling']);
arc.updatePlayerFire(1000, 0, 0, [near], mixed, {
  frontFloat: true,
  canFire: true,
  visualScale: 1,
  muzzles: [{ id: 'sling', x: 400, y: 50 }],
  waterMount: null,
});
const arcBullet = mixed.find((b) => b.weaponId === 'sling');
assert(arcBullet && arcBullet.vy === 0 && arcBullet.vx < 0 && arcBullet.gfx.x === 400, 'beside water, sling stays on the west ray');

if (failed) {
  console.error(`${failed} v0.32 check(s) failed`);
  process.exit(1);
}
console.log('v0.32 checks passed');
