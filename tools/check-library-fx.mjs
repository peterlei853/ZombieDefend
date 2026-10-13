/**
 * v0.27.1 — a library FX anim with no frames must not throw on `.duration`.
 * No Phaser. Run: node tools/check-library-fx.mjs
 */
import { readFileSync } from 'node:fs';
import {
  LIBRARY_FX_FALLBACK_MS,
  createLibraryAnims,
  libraryAnimReady,
  libraryFxDuration,
  playLibraryAnim,
  playLibraryFx,
} from '../src/assets/libraryAssets.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const DURATION_ERROR = "Cannot read properties of undefined (reading 'duration')";

assert(libraryAnimReady(null) === false, 'missing anim is not ready');
assert(libraryAnimReady({ frames: [] }) === false, 'empty frame list is not ready');
assert(libraryAnimReady({ frames: [undefined] }) === false, 'missing first frame is not ready');
assert(libraryAnimReady({ frames: [{ duration: Number.NaN }] }) === false, 'non-finite duration is not ready');
assert(libraryAnimReady({ frames: [{ duration: 0 }] }) === true, 'zero duration is playable (Phaser uses msPerFrame)');
assert(libraryAnimReady({ frames: [{ duration: 80 }, { duration: 80 }] }) === true, 'framed anim is ready');

assert(libraryFxDuration(null, null) === LIBRARY_FX_FALLBACK_MS, 'fallback duration');
assert(libraryFxDuration({ duration: 500 }, { frames: 4, frameRate: 10 }) === 500, 'positive anim duration wins');
assert(libraryFxDuration({ duration: 0, frames: [] }, { frames: 6, frameRate: 12 }) === 500, 'asset frame rate when anim duration is 0');
assert(libraryFxDuration(null, { frames: 4, frameRate: 10 }) === 400, 'water projectile still is 400ms');

function spriteThatThrows() {
  return {
    frame: null,
    active: true,
    played: null,
    stopped: false,
    texture: { key: 'fx-water-proj' },
    play() {
      throw new TypeError(DURATION_ERROR);
    },
    setFrame(frame) {
      this.frame = frame;
    },
    anims: {
      stop() {
        this.stopped = true;
      },
    },
    once() {},
    destroy() {
      this.active = false;
    },
    setOrigin() {},
    setFlipX() {},
    setScale() {},
    setRotation() {},
    setDepth() {},
  };
}

function animsWith(entries) {
  const map = new Map(Object.entries(entries));
  return {
    exists(key) {
      return map.has(key);
    },
    get(key) {
      return map.get(key);
    },
    remove(key) {
      map.delete(key);
    },
    create(config) {
      map.set(config.key, {
        frames: config.frames.map((frame) => ({ ...frame, duration: 0 })),
        frameRate: config.frameRate,
        duration: (config.frames.length / config.frameRate) * 1000,
      });
    },
  };
}

const emptyScene = {
  anims: animsWith({
    'fx-water-proj': { frames: [] },
    'fx-water-impact': { frames: [] },
    'fx-sling-knockback': { frames: [{ duration: 40 }] },
  }),
  textures: { exists: () => true },
};

const firstShot = spriteThatThrows();
let threw = false;
try {
  assert(playLibraryAnim(firstShot, 'fx-water-proj', emptyScene) === false, 'first shot skips an empty projectile anim');
} catch (err) {
  threw = true;
  console.error(err);
}
assert(!threw, 'first shot does not throw');
assert(firstShot.frame === 0, 'first shot holds a still frame');
assert(firstShot.played == null, 'first shot never reached a successful play');

const splash = spriteThatThrows();
threw = false;
try {
  assert(playLibraryAnim(splash, 'fx-water-impact', emptyScene) === false, 'water splash skips an empty impact anim');
} catch (err) {
  threw = true;
  console.error(err);
}
assert(!threw, 'water splash does not throw');
assert(splash.frame === 0, 'water splash holds a still frame');

const knock = spriteThatThrows();
threw = false;
try {
  assert(playLibraryAnim(knock, 'fx-sling-knockback', emptyScene) === false, 'sling knockback survives a throwing play');
} catch (err) {
  threw = true;
  console.error(err);
}
assert(!threw, 'sling knockback does not throw');
assert(knock.frame === 0, 'sling knockback falls back to a still');
assert(knock.anims.stopped === true, 'failed play stops the anim state');

const readySprite = spriteThatThrows();
readySprite.play = function play(key) {
  this.played = key;
};
assert(playLibraryAnim(readySprite, 'fx-sling-knockback', emptyScene) === true, 'ready knockback still plays');
assert(readySprite.played === 'fx-sling-knockback', 'ready knockback uses its key');

const opaque = spriteThatThrows();
opaque.play = function play(key) {
  this.played = key;
};
const opaqueScene = { anims: { exists: () => true }, textures: { exists: () => true } };
assert(playLibraryAnim(opaque, 'fx-pet-phoenix-spark-feather', opaqueScene) === true, 'uninspected anim manager still plays');
assert(opaque.played === 'fx-pet-phoenix-spark-feather', 'pet FX key is unchanged');

let splashDelay = 0;
const fxSprite = spriteThatThrows();
const fxScene = {
  anims: emptyScene.anims,
  textures: { exists: () => true },
  cache: { json: { exists: () => false } },
  add: { sprite: () => fxSprite },
  time: {
    delayedCall(ms) {
      splashDelay = ms;
    },
  },
};
let fxResult = null;
threw = false;
try {
  fxResult = playLibraryFx(fxScene, 10, 20, 'fx-water-impact', { scale: 1, depth: 4 });
} catch (err) {
  threw = true;
  console.error(err);
}
assert(!threw && fxResult === fxSprite, 'playLibraryFx returns the splash sprite');
assert(splashDelay === 400, 'unplayable splash is cleared after the fallback duration');

function texture(frames) {
  const names = frames.map(String);
  return {
    setFilter() {},
    has(frame) {
      return names.includes(String(frame));
    },
    getFrameNames() {
      return names;
    },
  };
}

const sheets = new Map([
  ['fx-water-proj', texture([])],
  ['fx-water-impact', texture([0, 1, 2, 3, 4, 5])],
]);
const bootAnims = animsWith({
  'fx-water-proj': { frames: [] },
  'fx-water-impact': { frames: [] },
});
const bootScene = {
  textures: {
    exists(key) {
      return sheets.has(key);
    },
    get(key) {
      return sheets.get(key);
    },
  },
  anims: bootAnims,
  cache: {
    json: {
      exists() {
        return true;
      },
      get() {
        return {
          assets: [
            { key: 'fx-water-proj', frames: 4, frameRate: 10, loop: true },
            { key: 'fx-water-impact', frames: 6, frameRate: 12, loop: false },
          ],
        };
      },
    },
  },
};
createLibraryAnims(bootScene);
assert(bootAnims.exists('fx-water-proj') === false, 'empty projectile sheet is not registered');
assert(libraryAnimReady(bootAnims.get('fx-water-impact')), 'impact anim is rebuilt from real frames');
assert(bootAnims.get('fx-water-impact').frames.length === 6, 'impact keeps every texture frame');

const weapon = readFileSync(new URL('../src/systems/WeaponSystem.js', import.meta.url), 'utf8');
const floats = readFileSync(new URL('../src/systems/HeroFloats.js', import.meta.url), 'utf8');
assert(!weapon.includes('.play('), 'WeaponSystem plays library strips through playLibraryAnim');
assert(weapon.includes('playLibraryAnim'), 'WeaponSystem imports the guard');
assert(!floats.includes('.play('), 'front-float bob uses the guard');
assert(floats.includes('playLibraryAnim'), 'HeroFloats imports the guard');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('library fx duration guards ok');
