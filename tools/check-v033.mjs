/**
 * v0.33 composite fence: six mounts, one weapon each.
 * Run: node tools/check-v033.mjs
 *
 * Default stage (no ?weapon=) places six cradles, top to bottom
 * water, sling, bubble, lightning, frost, flame. Stopping behind one
 * fires only that gun at the nearest living zombie. ?weapon= keeps
 * the single-gun immerse. Gold, saves, barricade, roster, and BGM stay.
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/data/GameConfig.js';
import { getGoldByHP } from '../src/data/economy.js';
import { STAGE1_TYPE_COUNT, STAGE_ROSTER } from '../src/data/stageRoster.js';
import { BULLET_SPEED } from '../src/data/waves.js';
import { OWNED_WEAPON_ORDER, WEAPON_TRAITS } from '../src/assets/heroDeploy.js';
import { WATER_MOUNT_ALT_KEY, WATER_MOUNT_FRAME, WATER_MOUNT_HI_VIS_KEY, WATER_MOUNT_LIFT, WATER_MOUNT_SCALE } from '../src/assets/waterMounts.js';
import { SLING_MOUNT_ALT_KEY, SLING_MOUNT_HI_VIS_KEY } from '../src/assets/slingMounts.js';
import {
  FENCE_MOUNT_COUNT,
  FENCE_WEAPON_ORDER,
  buildFenceMountSlots,
  fenceActiveKey,
  fenceFloatKey,
  fenceRowKey,
  nearestFenceMount,
} from '../src/assets/fenceMounts.js';
import { FenceMounts } from '../src/systems/FenceMounts.js';
import { AUDIO_VOLUME } from '../src/systems/SoundManager.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { layoutPx, LAYOUT_SCALE } from '../src/systems/DepthView.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const defenderSrc = readFileSync(new URL('../src/entities/Defender.js', import.meta.url), 'utf8');
const weaponSrc = readFileSync(new URL('../src/systems/WeaponSystem.js', import.meta.url), 'utf8');
const barricadeSrc = readFileSync(new URL('../src/entities/Barricade.js', import.meta.url), 'utf8');
const fenceAssetSrc = readFileSync(new URL('../src/assets/fenceMounts.js', import.meta.url), 'utf8');
const fenceSysSrc = readFileSync(new URL('../src/systems/FenceMounts.js', import.meta.url), 'utf8');

assert(pkg.version === '0.35.0' && APP_VERSION === '0.35.0', 'package and APP_VERSION are 0.35.0');
assert(html.includes('v0.35.0'), 'document title is v0.35.0');
assert(FENCE_MOUNT_COUNT === 6, 'six fence mounts');
assert(FENCE_WEAPON_ORDER.join() === OWNED_WEAPON_ORDER.join(), 'mount order is OWNED_WEAPON_ORDER');
assert(
  FENCE_WEAPON_ORDER.join() === 'water,sling,bubble,lightning,frost,flame',
  'top to bottom is water, sling, bubble, lightning, frost, flame'
);

assert(fenceRowKey('water', (key) => key === WATER_MOUNT_HI_VIS_KEY) === WATER_MOUNT_HI_VIS_KEY, 'water cradle is hi-vis');
assert(fenceRowKey('sling', (key) => key === SLING_MOUNT_HI_VIS_KEY) === SLING_MOUNT_HI_VIS_KEY, 'sling cradle is hi-vis');
assert(
  fenceRowKey('bubble', (key) => key === 'prop-bubble-mount-hi-vis') === 'prop-bubble-mount-hi-vis',
  'bubble prefers its own hi-vis cradle'
);
assert(
  fenceRowKey('lightning', (key) => key === 'prop-lightning-mount-hi-vis') === 'prop-lightning-mount-hi-vis',
  'lightning cradle is its hi-vis'
);
assert(
  fenceRowKey('lightning', (key) => key === SLING_MOUNT_HI_VIS_KEY) === null,
  'lightning does not borrow the sling cradle'
);
assert(
  fenceRowKey('frost', (key) => key === 'prop-frost-mount') === 'prop-frost-mount',
  'frost plain mount is next when hi-vis is missing'
);
assert(fenceRowKey('flame', () => false) === null, 'a missing cradle chain is null');
assert(fenceActiveKey('water', (key) => key === WATER_MOUNT_ALT_KEY) === WATER_MOUNT_ALT_KEY, 'water active slot is the front alt');
assert(fenceActiveKey('sling', (key) => key === SLING_MOUNT_ALT_KEY) === SLING_MOUNT_ALT_KEY, 'sling active slot is the front alt');
assert(fenceActiveKey('bubble', (key) => key === SLING_MOUNT_ALT_KEY) === null, 'bubble does not borrow the sling front alt');
assert(fenceActiveKey('bubble', (key) => key === 'prop-bubble-mount-front-alt') === 'prop-bubble-mount-front-alt', 'bubble active slot is its front alt');
assert(fenceActiveKey('lightning', (key) => key === 'prop-lightning-mount-front-alt') === 'prop-lightning-mount-front-alt', 'lightning active slot is its front alt');
assert(fenceActiveKey('frost', (key) => key === 'prop-frost-mount-front-alt') === 'prop-frost-mount-front-alt', 'frost active slot is its front alt');
assert(
  fenceActiveKey('flame', (key) => key === 'prop-flame-mount-front-alt') === 'prop-flame-mount-front-alt',
  'flame uses its own front alt when that sheet is loaded'
);
assert(
  fenceFloatKey('bubble', (key) => key === 'player-girl-front-bubble-still' || key === 'icon-bubble') === 'player-girl-front-bubble-still',
  'bubble float prefers the still over the icon'
);
assert(fenceFloatKey('frost', (key) => key === 'icon-frost') === 'icon-frost', 'frost float falls back to the icon');

const slots = buildFenceMountSlots((y) => ({ x: 900, groundY: y, postH: 80 }));
assert(slots.length === 6, 'six slots');
assert(slots.map((s) => s.weaponId).join() === FENCE_WEAPON_ORDER.join(), 'slot weapon ids follow the order');
assert(slots.every((s) => s.muzzleX < s.x), 'muzzles point west of the post');
const expectScale = (80 / WATER_MOUNT_FRAME) * WATER_MOUNT_SCALE;
assert(slots.every((s) => Math.abs(s.scale - expectScale) < 1e-9), 'cradles use the water 0.85 scale');
assert(
  slots.every((s) => Math.abs(s.feetY - (s.y - WATER_MOUNT_LIFT * (80 / WATER_MOUNT_FRAME))) < 1e-9),
  'cradles use the water lift'
);
const align = layoutPx(18);
assert(nearestFenceMount(slots[0].y, slots, align) === slots[0], 'standing on the top mount aligns water');
assert(nearestFenceMount(slots[5].y, slots, align) === slots[5], 'standing on the bottom mount aligns flame');
const between = (slots[2].y + slots[3].y) / 2;
assert(nearestFenceMount(between, slots, align) === null, 'the gap between mounts does not fire');

assert(stageSrc.includes('new FenceMounts'), 'stage places the composite mounts');
assert(stageSrc.includes('weaponImmerse'), 'default stage is separate from ?weapon=');
assert(stageSrc.includes('new WaterMounts') && stageSrc.includes('new SlingMounts'), 'immerse still builds the single-gun rows');
assert(stageSrc.includes('!ownsWater'), 'sling immerse still yields the fence to water');
assert(defenderSrc.includes('fenceMounts.nearest'), 'opening stance snaps to a mount');
assert(defenderSrc.includes('fenceOnly'), 'composite fire is gated on the fence');
assert(defenderSrc.includes('HERO_UNARMED.towerFire'), 'tower-fire still is held on a mount');
assert(weaponSrc.includes('_updateFenceFire') && weaponSrc.includes('_spawnWaterShot') && weaponSrc.includes('_spawnSlingShot'), 'fence fire reuses water and sling shots');
assert(barricadeSrc.includes('return barricadeXAtY(y, postW / 2) - postW / 2'), 'contact face is unchanged');
assert(!barricadeSrc.includes('localStorage') && !fenceAssetSrc.includes('localStorage') && !fenceSysSrc.includes('spendGold'), 'mounts do not touch saves or gold');
assert(getGoldByHP(90) === 10 && getGoldByHP(300) === 50, 'gold-by-HP table is unchanged');
assert(STAGE1_TYPE_COUNT === 3 && STAGE_ROSTER[0] === 'office-worker-v2', 'stage roster is unchanged');
assert(AUDIO_VOLUME.bgm === 0.28 && AUDIO_VOLUME.fire === 0.35, 'BGM and fire volumes are unchanged');
assert(WEAPON_TRAITS.water.damage === 18 && WEAPON_TRAITS.water.fireMs === 680, 'water damage table unchanged');
assert(WEAPON_TRAITS.sling.damage === 16 && WEAPON_TRAITS.sling.knockbackBodies === 2, 'sling damage table unchanged');
assert(WEAPON_TRAITS.bubble.damage === 12 && WEAPON_TRAITS.bubble.fireMs === 900, 'bubble damage table unchanged');
assert(WEAPON_TRAITS.lightning.damage === 14 && WEAPON_TRAITS.lightning.fireMs === 340, 'lightning damage table unchanged');
assert(WEAPON_TRAITS.frost.damage === 14 && WEAPON_TRAITS.frost.freezeMs === 900, 'frost damage table unchanged');
assert(WEAPON_TRAITS.flame.chip === 4 && WEAPON_TRAITS.flame.tickMs === 200, 'flame damage table unchanged');

const spawned = [];
function sprite(x, y, key) {
  const obj = {
    x, y, key, active: true,
    texture: { key },
    setOrigin() { return obj; },
    setScale(scale) { obj.scale = scale; return obj; },
    setDepth(depth) { obj.depth = depth; return obj; },
    setPosition(px, py) { obj.x = px; obj.y = py; return obj; },
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
      text() {
        const obj = {
          active: true,
          setOrigin() { return obj; },
          setDepth() { return obj; },
          setAlpha() { return obj; },
          setText() { return obj; },
          destroy() { obj.active = false; },
          once() { return obj; },
        };
        return obj;
      },
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
const ROW = [
  WATER_MOUNT_HI_VIS_KEY,
  SLING_MOUNT_HI_VIS_KEY,
  'prop-bubble-mount-hi-vis',
  'prop-lightning-mount-hi-vis',
  'prop-frost-mount-hi-vis',
  'prop-flame-mount-hi-vis',
];
const ALT = [
  WATER_MOUNT_ALT_KEY,
  SLING_MOUNT_ALT_KEY,
  'prop-bubble-mount-front-alt',
  'prop-lightning-mount-front-alt',
  'prop-frost-mount-front-alt',
  'prop-flame-mount-front-alt',
];
const floats = [
  'player-girl-front-water-still',
  'player-girl-front-sling-still',
  'player-girl-front-bubble-still',
  'player-girl-front-lightning-still',
  'player-girl-front-frost-still',
  'player-girl-front-flame-still',
];
const mounts = new FenceMounts(makeScene([...ROW, ...ALT, ...floats]), anchor);
assert(mounts.sprites.length === 6 && mounts.guns.length === 6, 'six cradles and six seated guns');
assert(mounts.sprites.map((s) => s.key).join() === ROW.join(), 'each slot uses its own hi-vis cradle');
assert(mounts.guns.map((g) => g.key).join() === floats.join(), 'each cradle floats a different still');
assert(mounts.sprites.every((s, i) => s.key !== mounts.guns[i].key), 'the gun is not baked into the cradle');
mounts.setActive(0);
assert(mounts.sprites[0].key === WATER_MOUNT_ALT_KEY, 'water slot uses the front alt while she is stopped there');
assert(mounts.sprites[2].key === 'prop-bubble-mount-hi-vis', 'bubble cradle stays put while water is active');
mounts.setActive(2);
assert(mounts.sprites[0].key === WATER_MOUNT_HI_VIS_KEY, 'leaving water restores the hi-vis cradle');
assert(mounts.sprites[2].key === 'prop-bubble-mount-front-alt', 'bubble slot uses its front alt');
mounts.setActive(5);
assert(mounts.sprites[5].key === 'prop-flame-mount-front-alt', 'flame slot uses its front alt');
assert(mounts.sprites[2].key === 'prop-bubble-mount-hi-vis', 'leaving bubble restores its hi-vis cradle');
mounts.setActive(1);
assert(mounts.sprites[1].key === SLING_MOUNT_ALT_KEY, 'sling slot uses the front alt');
assert(mounts.aligned(mounts.slots[4].y)?.weaponId === 'frost', 'aligned() is the frost mount');
assert(mounts.aligned(between) === null, 'aligned() refuses the gap');

const own = new FenceMounts(
  makeScene(['prop-bubble-mount-hi-vis', 'player-girl-front-bubble-still', SLING_MOUNT_HI_VIS_KEY]),
  anchor
);
assert(own.sprites[2].key === 'prop-bubble-mount-hi-vis', 'a dedicated bubble cradle wins');
assert(own.sprites[3].key !== SLING_MOUNT_HI_VIS_KEY, 'lightning does not borrow the sling cradle');

function zed(id, x, y) {
  return {
    id,
    x,
    y,
    alive: true,
    body: { active: true },
    bodyCenterY: y - 16,
    displayHalf: 12,
    goldValue: 10,
    skin: { id: 'chef' },
    applyKnockback() {},
    applyBurn() {},
    applyRoot() {},
    takeDamage(amount) {
      this.hits = (this.hits || 0) + 1;
      this.last = amount;
      return false;
    },
  };
}

function fireMount(id, muzzle) {
  const scene = makeScene(['fx-flame-cone', 'fx-water-proj', 'fx-sling-pellet']);
  const guns = new WeaponSystem(scene);
  guns.setOwnedWeapons(OWNED_WEAPON_ORDER);
  const bullets = [];
  const from = muzzle || { muzzleX: 0, muzzleY: 0 };
  const near = zed(3, from.muzzleX - 120, from.muzzleY + 30);
  const fired = guns.updatePlayerFire(1000, 0, 0, [near], bullets, {
    frontFloat: true,
    canFire: true,
    visualScale: 1,
    muzzles: OWNED_WEAPON_ORDER.map((weaponId) => ({ id: weaponId, x: 10, y: 10 })),
    fenceOnly: true,
    fenceMount: muzzle ? { ...muzzle, weaponId: id } : null,
  });
  return { fired, bullets, near, guns };
}

const bubble = fireMount('bubble', { muzzleX: 200, muzzleY: 80 });
assert(bubble.fired === 'bubble', 'bubble mount reports bubble');
assert(bubble.bullets.length === 1 && bubble.bullets[0].weaponId === 'bubble', 'only the bubble slug spawns');
assert(bubble.bullets[0].gfx.x === 200 && bubble.bullets[0].gfx.y === 80, 'bubble leaves the mount muzzle');
assert(bubble.bullets[0].vx < 0 && bubble.bullets[0].vy !== 0, 'bubble aims at the nearest living enemy');
const bSpeed = BULLET_SPEED * LAYOUT_SCALE * WEAPON_TRAITS.bubble.speed;
const bDx = bubble.near.x - 200;
const bDy = bubble.near.bodyCenterY - 80;
const bLen = Math.hypot(bDx, bDy);
assert(Math.abs(bubble.bullets[0].vx - (bDx / bLen) * bSpeed) < 1e-6, 'bubble velocity tracks the body');

const water = fireMount('water', { muzzleX: 220, muzzleY: 40 });
assert(water.fired === 'water' && water.bullets.every((b) => b.weaponId === 'water'), 'water mount fires only water');
const sling = fireMount('sling', { muzzleX: 220, muzzleY: 60 });
assert(sling.fired === 'sling' && sling.bullets.every((b) => b.weaponId === 'sling'), 'sling mount fires only sling');
const frost = fireMount('frost', { muzzleX: 220, muzzleY: 100 });
assert(frost.fired === 'frost' && frost.bullets.length === 1, 'frost mount fires one frost slug');

const gap = fireMount('bubble', null);
assert(gap.fired === null && gap.bullets.length === 0, 'a gap fires nothing');

const held = new WeaponSystem(makeScene([]));
held.setOwnedWeapons(OWNED_WEAPON_ORDER);
const idle = [];
held.updatePlayerFire(1000, 0, 0, [zed(1, 0, 0)], idle, {
  frontFloat: true,
  canFire: true,
  visualScale: 1,
  muzzles: [{ id: 'flame', x: 12, y: 12 }],
  fenceOnly: true,
  fenceMount: null,
});
assert(idle.length === 0, 'composite mode does not free-fire the front arc');

const flameScene = makeScene(['fx-flame-cone']);
const flameGun = new WeaponSystem(flameScene);
flameGun.setOwnedWeapons(['flame']);
const flameZ = zed(9, 100, 50);
flameZ.bodyCenterY = 50;
const flameBullets = [];
const flameFired = flameGun.updatePlayerFire(1000, 0, 0, [flameZ], flameBullets, {
  frontFloat: true,
  canFire: true,
  visualScale: 1,
  fenceOnly: true,
  fenceMount: { weaponId: 'flame', muzzleX: 400, muzzleY: 50 },
});
assert(flameFired === null && flameBullets.length === 0, 'flame stays a cone, not a new slug');
assert(flameZ.last === WEAPON_TRAITS.flame.chip, 'flame chip is the existing table');

const arc = [];
const arcGun = new WeaponSystem(makeScene(['fx-sling-pellet']));
arcGun.setOwnedWeapons(['water', 'sling']);
arcGun.updatePlayerFire(1000, 0, 0, [zed(4, 100, 80)], arc, {
  frontFloat: true,
  canFire: true,
  visualScale: 1,
  muzzles: [{ id: 'sling', x: 400, y: 50 }],
  waterMount: null,
});
const arcBullet = arc.find((b) => b.weaponId === 'sling');
assert(arcBullet && arcBullet.vy === 0 && arcBullet.gfx.x === 400, 'without the composite fence, sling stays on the west ray');

if (failed) {
  console.error(`${failed} v0.33 check(s) failed`);
  process.exit(1);
}
console.log('v0.33 checks passed');
