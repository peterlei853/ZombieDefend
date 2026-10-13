/**
 * Baby-pet combat checks (no Phaser, no browser).
 * Run: node tools/check-pet-combat.mjs
 *
 * Threat pick is distance-to-fence, not distance-to-pet.
 * The lineup sprites stay on their slots through idle → attack → idle.
 */
import { readFileSync } from 'node:fs';
import { GAME_CONFIG, APP_VERSION } from '../src/data/GameConfig.js';
import { PET_STAGE_KEYS, stageLibraryFilter } from '../src/assets/petLineup.js';
import { barricadeXAtY } from '../src/systems/DepthView.js';
import {
  PetCombat,
  closestThreatWhere,
  inForwardBox,
  inLeftCone,
  leftBoltVelocity,
  nearestBarricadeThreat,
} from '../src/systems/PetCombat.js';
import { petLineupSlots } from '../src/assets/petLineup.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert(pkg.version === '0.19.0', `package.json version ${pkg.version}`);
assert(APP_VERSION === '0.19.0', `APP_VERSION ${APP_VERSION}`);
assert(pkg.version === APP_VERSION, 'package version matches APP_VERSION');

const boot = readFileSync(new URL('../src/scenes/BootScene.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert(boot.includes('APP_VERSION'), 'title uses APP_VERSION');
assert(!boot.includes('v0.18'), 'boot title is not 0.18');
assert(stage.includes('APP_VERSION'), 'HUD uses APP_VERSION');
assert(html.includes('v0.19.0'), 'document title is v0.19.0');

for (const file of [
  '../src/systems/PetCombat.js',
  '../src/entities/Defender.js',
  '../src/systems/WeaponSystem.js',
  '../src/scenes/StageScene.js',
]) {
  const text = readFileSync(new URL(file, import.meta.url), 'utf8');
  assert(!text.includes('.shake('), `${file} must not call shake`);
}

assert(PET_STAGE_KEYS.has('pet-phoenix-baby-skill'), 'phoenix skill loads');
assert(PET_STAGE_KEYS.has('fx-pet-phoenix-spark-feather'), 'phoenix bolt loads');
assert(PET_STAGE_KEYS.has('fx-pet-panda-roll-impact'), 'panda impact loads');
assert(PET_STAGE_KEYS.has('fx-pet-lion-pounce-slash'), 'lion slash loads');
assert(!PET_STAGE_KEYS.has('fx-pet-lion-roar-wave'), 'baby lion does not load roar');
assert(PET_STAGE_KEYS.has('fx-pet-dragon-smoke-breath'), 'dragon breath loads');
assert(!PET_STAGE_KEYS.has('fx-pet-dragon-fireball'), 'baby dragon does not load fireball');
assert(!PET_STAGE_KEYS.has('pet-phoenix-young-skill'), 'young form stays unloaded');
assert(stageLibraryFilter({ category: 'hero', key: 'player-girl' }), 'hero still loads');
assert(!stageLibraryFilter({ category: 'pets', key: 'pet-lion-ancient-idle' }), 'ancient filtered');

const petsCfg = GAME_CONFIG.PETS;
assert(petsCfg.COOLDOWN_MIN_MS >= 1000 && petsCfg.COOLDOWN_MAX_MS <= 1500, 'cadence is 1.0–1.5s');
assert(petsCfg.FIRST_DELAY_MS.every((ms) => ms > 0 && ms < 5000), 'first cast is inside 5s');
assert(petsCfg.PHOENIX.DAMAGE < 30 && petsCfg.PANDA.DAMAGE < 30, 'pet hits stay under a handgun shot');
assert(petsCfg.PANDA.RANGE >= 80, 'panda reach covers a zombie at the posts');
assert(petsCfg.DRAGON.BURN > 0 && petsCfg.DRAGON.BURN_MS > 0, 'dragon burn is configured');

const yNear = 220;
const yFar = 520;
const fenceNear = barricadeXAtY(yNear);
const fenceFar = barricadeXAtY(yFar);
const petAt = { x: fenceNear + 30, y: yNear };
const farFromFence = { alive: true, body: {}, x: fenceNear - 110, y: yNear, id: 1 };
const closeToFence = { alive: true, body: {}, x: fenceFar - 36, y: yFar, id: 2 };
const threat = nearestBarricadeThreat([farFromFence, closeToFence]);
assert(threat === closeToFence, 'target is closest to the fence, not the pet');
const petDistFar = Math.hypot(farFromFence.x - petAt.x, farFromFence.y - petAt.y);
const petDistClose = Math.hypot(closeToFence.x - petAt.x, closeToFence.y - petAt.y);
assert(petDistFar < petDistClose, 'fixture really is nearer the pet than the fence threat');

const range = petsCfg.PANDA.RANGE * 1.6;
const yHalf = petsCfg.PANDA.Y_HALF * 1.6;
assert(inForwardBox(1000, 400, 900, 400, range, yHalf), 'box includes a zombie in front');
assert(!inForwardBox(1000, 400, 1040, 400, range, yHalf), 'box rejects a zombie behind the pet');
assert(!inForwardBox(1000, 400, 400, 400, range, yHalf), 'box rejects a zombie past short range');

const half = (petsCfg.LION.HALF_ANGLE_DEG * Math.PI) / 180;
assert(inLeftCone(500, 300, 400, 300, 160, half), 'cone includes straight left');
assert(!inLeftCone(500, 300, 500, 460, 200, half), 'cone rejects a target beside the pet');
assert(!inLeftCone(500, 300, 200, 300, 100, half), 'cone respects range');

const straight = leftBoltVelocity(800, 400, 500, 400, 340, (42 * Math.PI) / 180);
assert(straight.vx < 0, 'bolt travels left');
assert(Math.abs(straight.vy) < 1, 'same-lane bolt is straight');
const clamped = leftBoltVelocity(800, 400, 700, 20, 340, (42 * Math.PI) / 180);
assert(clamped.vx < 0, 'clamped bolt still travels left');
const clampedAim = Math.atan2(clamped.vy, clamped.vx);
const clampedOff = Math.atan2(Math.sin(clampedAim - Math.PI), Math.cos(clampedAim - Math.PI));
assert(Math.abs(clampedOff) <= (42 * Math.PI) / 180 + 0.02, 'aim stays inside the left cone');

const melee = closestThreatWhere([farFromFence, closeToFence], (z) =>
  inForwardBox(fenceFar + 20, yFar, z.x, z.y, range, yHalf)
);
assert(melee === closeToFence, 'in-range smack prefers the fence threat');

// Simulated stage: four slots, one zombie on the phoenix lane, no art textures.
const slots = petLineupSlots();
const scene = mockScene();
const sprites = slots.map((slot) => mockPet(scene, slot));
const homes = sprites.map((sprite) => ({ x: sprite.x, y: sprite.y }));
const combat = new PetCombat(scene, sprites);
const phoenix = sprites[0];
const zombie = mockZombie(phoenix.x - 140, phoenix.y);
let sawSkill = sprites.map(() => false);

for (let t = 0; t < 5000; t += 50) {
  combat.update(50, [zombie]);
  for (const sprite of sprites) {
    if (sprite._anim.key.endsWith('-skill') && sprite._anim.playing) {
      sprite._anim.acc += 50;
      if (sprite._anim.acc >= 100) {
        sprite._anim.acc = 0;
        sprite._anim.frame += 1;
        if (sprite._anim.frame >= 8) sprite._anim.playing = false;
      }
    }
    if (sprite._played.some((key) => key.endsWith('-skill'))) {
      sawSkill[sprites.indexOf(sprite)] = true;
    }
  }
}

assert(sawSkill.every(Boolean), `all four pets entered attack within 5s (${sawSkill.join(',')})`);
sprites.forEach((sprite, i) => {
  assert(sprite.x === homes[i].x && sprite.y === homes[i].y, `pet ${i} stayed on its slot`);
  assert(sprite._flipped === false, `pet ${i} stayed facing left`);
  assert(sprite._played.filter((key) => key.endsWith('-idle')).length > 0, `pet ${i} returned to idle`);
});
assert(zombie.hp < zombie.maxHp, `support damage landed (hp ${zombie.hp})`);
combat.destroy();

if (failed) {
  console.error(`${failed} pet combat check(s) failed`);
  process.exit(1);
}
console.log('pet combat checks passed');

function mockScene() {
  const state = { now: 0 };
  const text = () => {
    const node = {
      active: true,
      setText() { return node; },
      setAlpha() {},
      setOrigin() { return node; },
      setDepth() { return node; },
      once() {},
      destroy() { node.active = false; },
    };
    return node;
  };
  return {
    time: {
      get now() {
        state.now += 16;
        return state.now;
      },
    },
    tweens: {
      add() { return { stop() {} }; },
      killTweensOf() {},
    },
    anims: { exists: () => true },
    textures: { exists: () => false },
    add: { text },
    audio: { playHitImpact() {} },
  };
}

function mockPet(scene, slot) {
  const anim = { key: slot.key, playing: true, frame: 0, acc: 0 };
  const sprite = {
    x: slot.x,
    y: slot.y,
    scaleX: 1.5,
    scaleY: 1.5,
    active: true,
    _anim: anim,
    _played: [slot.key],
    _flipped: false,
    getData(name) {
      return name === 'petId' ? slot.id : undefined;
    },
    setFlipX(value) {
      sprite._flipped = value;
    },
    setFlipY() {},
    play(key) {
      anim.key = key;
      anim.frame = 0;
      anim.acc = 0;
      anim.playing = true;
      sprite._played.push(key);
    },
    anims: {
      get currentAnim() {
        return { key: anim.key };
      },
      get isPlaying() {
        return anim.playing;
      },
      get currentFrame() {
        return { index: anim.frame };
      },
      getProgress() {
        return anim.frame / 8;
      },
    },
    scene,
  };
  return sprite;
}

function mockZombie(x, y) {
  return {
    id: 7,
    alive: true,
    body: {},
    x,
    y,
    maxHp: 40,
    hp: 40,
    visualTop: y - 48,
    bodyCenterY: y - 24,
    goldValue: 10,
    getBounds() {
      return { left: x - 28, right: x + 28, top: y - 56, bottom: y };
    },
    takeDamage(amount) {
      this.hp -= amount;
      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        return true;
      }
      return false;
    },
    applySlow(mult, durationMs) {
      this.slow = { mult, durationMs };
    },
    applyBurn(damage, intervalMs, durationMs) {
      this.burn = { damage, intervalMs, durationMs };
    },
  };
}
