/**
 * Early BGM beds only (no Phaser).
 * Run: node tools/check-bgm.mjs
 *
 * Title, stage, shop, and victory loop at 0.28. Stage stops before the
 * game-over sting and before the victory bed. Main's ult / exp / melee
 * preload stays; this pass does not add wave, shout, or shop cues.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { debugBgmEnabled } from '../src/debugBgm.js';
import {
  AUDIO_VOLUME,
  BGM_KEY,
  BGM_SHOP_KEY,
  BGM_TITLE_KEY,
  BGM_VICTORY_KEY,
  GAME_AUDIO,
  SoundManager,
  preloadGameAudio,
} from '../src/systems/SoundManager.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const BEDS = ['bgm-title', 'bgm-stage', 'bgm-shop', 'bgm-victory'];

for (const key of BEDS) {
  const file = new URL(`../assets/audio/${key}.mp3`, import.meta.url);
  assert(existsSync(file), `${key}.mp3 is in assets/audio`);
  const row = GAME_AUDIO.find((clip) => clip.key === key);
  assert(row?.url === `assets/audio/${key}.mp3`, `${key} preloads from its filename`);
}

const audioNames = readdirSync(new URL('../assets/audio/', import.meta.url))
  .filter((name) => name.endsWith('.mp3'))
  .sort();
const audioKeys = GAME_AUDIO.map((clip) => clip.key);
assert(new Set(audioKeys).size === audioKeys.length, 'GAME_AUDIO keys are unique');
assert(audioNames.length === GAME_AUDIO.length, `assets/audio (${audioNames.length}) matches GAME_AUDIO (${GAME_AUDIO.length})`);
for (const name of audioNames) {
  const key = name.slice(0, -4);
  const row = GAME_AUDIO.find((clip) => clip.key === key);
  assert(row?.url === `assets/audio/${name}`, `${name} is registered at its basename`);
}
for (const clip of GAME_AUDIO) {
  assert(audioNames.includes(`${clip.key}.mp3`), `${clip.key} file is in assets/audio`);
  assert(clip.url === `assets/audio/${clip.key}.mp3`, `${clip.key} url is assets/audio/<key>.mp3`);
}
assert(
  GAME_AUDIO.some((clip) => clip.key === 'bgm-stage-chiptune-G')
    && GAME_AUDIO.some((clip) => clip.key === 'bgm-boss-chiptune-H'),
  'chiptune candidates are cataloged beside the live beds'
);

assert(AUDIO_VOLUME.bgm === 0.28, 'BGM volume is 0.28');
assert(BGM_TITLE_KEY === 'bgm-title' && BGM_KEY === 'bgm-stage', 'title and stage keys');
assert(BGM_KEY !== 'bgm-stage-chiptune-G' && BGM_KEY !== 'bgm-boss-chiptune-H', 'chiptune candidates are not the live stage bed');
assert(BGM_SHOP_KEY === 'bgm-shop' && BGM_VICTORY_KEY === 'bgm-victory', 'shop and victory keys');

const NOT_THIS_PASS = [
  'wave-start',
  'wave-clear',
  'go-shout',
  'back-shout',
  'barricade-warning',
  'ui-confirm',
  'ui-toast',
  'ui-cancel',
  'shop-buy',
  'heal',
  'pearl-pickup',
  // pet-summon and pet-recall are sandbox try-out clips. check-pet-tryout owns them.
  'pet-death',
  'pet-sleep',
  'pet-bark',
  'pet-attack',
  'pet-orb-ready',
  'pet-orb-cast',
  'pet-revive-ready',
];
const extra = GAME_AUDIO.filter((clip) => NOT_THIS_PASS.includes(clip.key));
assert(extra.length === 0, `BGM pass did not add those cues (${extra.map((c) => c.key).join(',')})`);
for (const key of ['ult-phoenix', 'pet-melee-hit', 'exp-orb-drop', 'skill-telegraph']) {
  assert(GAME_AUDIO.some((clip) => clip.key === key), `${key} from main stays preloaded`);
}

const titleSrc = readFileSync(new URL('../src/scenes/TitleScene.js', import.meta.url), 'utf8');
const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const shopSrc = readFileSync(new URL('../src/scenes/ShopScene.js', import.meta.url), 'utf8');
const soundSrc = readFileSync(new URL('../src/systems/SoundManager.js', import.meta.url), 'utf8');

assert(titleSrc.includes('startTitleBgm()'), 'TitleScene starts bgm-title');
assert(stageSrc.includes('startStageBgm()'), 'StageScene starts bgm-stage');
assert(stageSrc.includes('playVictory()'), 'StageScene plays victory on clear');
assert(stageSrc.includes('playGameOver()'), 'StageScene still uses the game-over sting');
assert(stageSrc.includes('delayedCall(1500'), 'victory hold before the shop bed');
assert(shopSrc.includes('startShopBgm()'), 'ShopScene starts bgm-shop');
assert(
  /if \(debugBgmEnabled\(\)\) \{\s*this\._installDebugClear\(\);/.test(stageSrc),
  'debug clear stays off unless the query flag is on'
);
assert(debugBgmEnabled('') === false, 'debug shortcut is off with no query');
assert(debugBgmEnabled('?debugBgm=0') === false, 'debugBgm=0 stays off');
assert(debugBgmEnabled('?debug=0') === false, 'debug=0 stays off');
assert(debugBgmEnabled('?debugBgm=1') === true, 'debugBgm=1 opens the shortcut');
assert(debugBgmEnabled('?debug=1') === true, 'debug=1 opens the shortcut');
assert(debugBgmEnabled('?stage=2&debugBgm=1') === true, 'debugBgm=1 works beside other params');
assert(stageSrc.includes('KeyCodes.V'), 'V triggers the debug clear');
assert(stageSrc.includes('DEBUG CLEAR'), 'on-screen DEBUG CLEAR chip is present');
assert(
  /_installDebugClear\(\) \{[\s\S]*?this\._onWin\(\)/.test(stageSrc),
  'debug clear uses the real win path'
);
const wavesSrc = readFileSync(new URL('../src/data/waves.js', import.meta.url), 'utf8');
assert(/export const STAGE_DURATION = 90;/.test(wavesSrc), 'stage timer stays 90s');
assert(!shopSrc.includes('playUiConfirm') && !stageSrc.includes('playWaveStart'), 'no extra UI or wave cues');
assert(!soundSrc.includes('wave-clear') && !soundSrc.includes('go-shout'), 'SoundManager stays BGM-only for the new cues');

function mockScene(keys, { locked = false } = {}) {
  const cache = new Set(keys);
  const added = [];
  const listeners = new Map();
  const queued = [];
  const sound = {
    mute: false,
    locked,
    add(key, cfg) {
      const node = {
        key,
        loop: cfg.loop,
        volume: cfg.volume,
        isPlaying: false,
        play() {
          this.isPlaying = true;
        },
        stop() {
          this.isPlaying = false;
        },
        destroy() {
          this.isPlaying = false;
        },
        setVolume(v) {
          this.volume = v;
        },
        once() {},
      };
      added.push(node);
      return node;
    },
    once(ev, fn) {
      const list = listeners.get(ev) || [];
      list.push(fn);
      listeners.set(ev, list);
    },
    off(ev, fn) {
      const list = listeners.get(ev) || [];
      listeners.set(ev, list.filter((item) => item !== fn));
    },
    play(key, cfg) {
      queued.push({ key, ...cfg });
    },
    emit(ev) {
      for (const fn of [...(listeners.get(ev) || [])]) fn();
    },
  };
  return {
    added,
    queued,
    sound,
    cache: { audio: { exists: (key) => cache.has(key) } },
    time: { now: 0, delayedCall() {} },
    load: { audio(key, url) { queued.push({ preload: key, url }); } },
  };
}

const beds = mockScene(BEDS);
const audio = new SoundManager(beds);
audio.startTitleBgm();
assert(beds.added.at(-1)?.key === 'bgm-title', 'title bed key');
assert(beds.added.at(-1)?.loop === true, 'title bed loops');
assert(beds.added.at(-1)?.volume === 0.28, 'title bed volume');
assert(beds.added.at(-1)?.isPlaying === true, 'title bed is playing');

audio.startStageBgm();
assert(beds.added.at(-1)?.key === 'bgm-stage', 'stage replaces title');
assert(beds.added.at(-2)?.isPlaying === false, 'previous bed stopped');

audio.playVictory();
assert(beds.added.at(-1)?.key === 'bgm-victory', 'victory bed after clear');
assert(beds.added.at(-1)?.loop === true && beds.added.at(-1)?.volume === 0.28, 'victory loops at 0.28');
const stageNode = beds.added.find((node) => node.key === 'bgm-stage');
assert(stageNode?.isPlaying === false, 'stage bed is stopped before victory');

const over = mockScene([...BEDS, 'game-over']);
const overAudio = new SoundManager(over);
overAudio.startStageBgm();
overAudio.playGameOver();
assert(over.added.some((node) => node.key === 'game-over' && node.loop === false), 'game-over sting still plays');
assert(!over.added.some((node) => node.key === 'bgm-victory'), 'game over does not start victory');
assert(over.added[0]?.key === 'bgm-stage', 'game over fades the stage bed instead of swapping it');
assert(overAudio._bgmAllowed === false && overAudio._bgmKey === null, 'game over cancels a late stage restart');

const fadeSteps = [];
const fadeScene = mockScene(BEDS);
fadeScene.time.delayedCall = (_ms, fn) => fadeSteps.push(fn);
const fadeAudio = new SoundManager(fadeScene);
fadeAudio.startStageBgm();
const clock = Date.now;
Date.now = () => clock() + 1000;
try {
  fadeAudio.fadeBgm(100);
  while (fadeSteps.length) fadeSteps.shift()();
} finally {
  Date.now = clock;
}
assert(fadeScene.added[0]?.isPlaying === false, 'a finished fade stops the stage bed');

const shop = mockScene(BEDS);
new SoundManager(shop).startShopBgm();
assert(shop.added.at(-1)?.key === 'bgm-shop' && shop.added.at(-1)?.volume === 0.28, 'shop bed');

const locked = mockScene(BEDS, { locked: true });
const lockedAudio = new SoundManager(locked);
lockedAudio.startTitleBgm();
assert(locked.added.length === 0, 'locked context waits');
locked.sound.locked = false;
locked.sound.emit('unlocked');
assert(locked.added.at(-1)?.key === 'bgm-title', 'unlock starts the title bed');

const loaderScene = {
  load: { audio(key, url) { this.queued.push({ key, url }); } , queued: [] },
  cache: { audio: { exists: (key) => key === 'bgm-stage' } },
};
preloadGameAudio(loaderScene);
const loaded = loaderScene.load.queued.map((row) => row.key);
assert(!loaded.includes('bgm-stage'), 'cached stage bed is not queued again');
assert(loaded.includes('bgm-title') && loaded.includes('bgm-shop') && loaded.includes('bgm-victory'), 'missing beds are preloaded');

if (failed) {
  console.error(`${failed} BGM check(s) failed`);
  process.exit(1);
}
console.log('bgm checks ok');
