/**
 * Locked narration copy. No Phaser.
 * Run: node tools/check-narration.mjs
 *
 * Strings stay Traditional Chinese. Stage 4–5 stay SOON. Shop stays a list.
 */
import { readFileSync } from 'node:fs';
import { earlyWaveDefs } from '../src/data/stageBalance.js';
import {
  DISASTER_SEEN_KEY,
  NARRATION,
  NURSE_MIN_WAVE,
  WALL_DANGER_RATIO,
  departLine,
  nurseWaveFromDefs,
  wallInDanger,
  waveCallout,
} from '../src/data/narrationCopy.js';
import { waveDefsForStage } from '../src/data/waves.js';
import { NARRATION_FADE_MS, NARRATION_HOLD_MS, createNarrationToast } from '../src/ui/NarrationToast.js';
import { PLAYABLE_STAGE_CAP } from '../src/data/stageRoster.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

assert(NARRATION.disaster === '城市被『未完成的加班契約』拖進長夜。', 'disaster line');
assert(NARRATION.baseName === '東側街口據點', 'base name stays the soft outpost');
assert(NARRATION.stageOpen === '從左邊來了……別讓它們碰到牆。', 'stage open');
assert(NARRATION.go === '上！', 'first GO line');
assert(NARRATION.back === '回來。', 'back line');
assert(NARRATION.tide === '潮退了。先換彈。', 'clear line');
assert(NARRATION.wall === '牆撐不住了！', 'wall line is traditional 撐');
assert(!NARRATION.wall.includes('撑'), 'wall line does not use simplified 撑');
assert(NARRATION.gameOver === '圍棚破了。', 'game over line');
assert(NARRATION.nightClose === '今晚先到這。', 'night close');
assert(NARRATION.rumble === '圍棚另一側傳來轟鳴……', 'stage 3 rumble');
assert(NARRATION.wave3 === '第 3 波警報', 'wave 3 alarm');
assert(NARRATION.nurse === '護士也混進來了……', 'nurse line');
assert(DISASTER_SEEN_KEY === 'narrationDisasterSeen', 'disaster flag name');

assert(departLine('phoenix') === '走吧，藍羽。', 'phoenix depart');
assert(departLine('panda') === '走吧，墨墨。', 'panda depart');
assert(departLine('lion') === '走吧，雷歐。', 'lion depart');
assert(departLine('dragon') === '走吧，翠火。', 'dragon depart');
assert(departLine('hero') === null && departLine('') === null, 'unknown pet says nothing');
for (const id of ['phoenix', 'panda', 'lion', 'dragon']) {
  const line = departLine(id);
  assert(line.startsWith('走吧，') && line.endsWith('。'), `${id} depart has no catchphrase`);
}

assert(waveCallout(3) === NARRATION.wave3, 'wave 3 uses the alarm');
assert(waveCallout(1) === '第1波' && waveCallout(2) === '第2波' && waveCallout(4) === '第4波', 'other waves keep the count');

assert(NURSE_MIN_WAVE === 3, 'nurse line prefers wave 3+');
assert(nurseWaveFromDefs(earlyWaveDefs(1)) === null, 'stage 1 has no nurse wave');
assert(nurseWaveFromDefs(earlyWaveDefs(2)) === null, 'stage 2 has no nurse wave');
assert(nurseWaveFromDefs(earlyWaveDefs(3)) === 3, 'stage 3 nurse line waits for wave 3');
const stage3 = earlyWaveDefs(3);
assert(stage3[0].archetypes[0].skins.includes('nurse'), 'stage 3 wave 1 already lists nurse');
assert(nurseWaveFromDefs(stage3) !== 1, 'wave 1 nurse pool does not speak yet');
assert(nurseWaveFromDefs(waveDefsForStage(4)) === 3, 'a later nurse stage still waits for wave 3');
assert(nurseWaveFromDefs(waveDefsForStage(5)) === null, 'brute stage has no nurse line');

assert(WALL_DANGER_RATIO === 0.25, 'wall cut matches the red barricade fill');
assert(wallInDanger(180, 720) === true, '25% wall is in danger');
assert(wallInDanger(144, 720) === true, '20% wall is in danger');
assert(wallInDanger(181, 720) === false, 'just above the red cut stays quiet');
assert(wallInDanger(0, 720) === false, 'a broken wall is not the danger toast');
assert(wallInDanger(720, 720) === false, 'a full wall stays quiet');

assert(NARRATION_HOLD_MS >= 2000 && NARRATION_HOLD_MS <= 3000, 'hold is about 2–3s');
assert(NARRATION_FADE_MS > 0 && NARRATION_FADE_MS < 500, 'fade is short');
assert(PLAYABLE_STAGE_CAP === 3, 'playable cap stays 3');

/**
 * Tiny scene stub. Banner art is missing, so the toast falls through to
 * system text. No hit zone is created.
 */
function stubScene() {
  const texts = [];
  const zones = [];
  let now = 5000;
  /** @type {{ delay: number, fn: Function, removed: boolean, remove: () => void }[]} */
  const timers = [];
  const scene = {
    scale: { width: 1280, height: 720 },
    time: {
      get now() {
        return now;
      },
      delayedCall(delay, fn) {
        const timer = {
          delay,
          fn,
          removed: false,
          remove() {
            this.removed = true;
          },
        };
        timers.push(timer);
        return timer;
      },
    },
    tweens: {
      add(config) {
        config.onComplete?.();
      },
    },
    add: {
      text(_x, _y, content) {
        const node = {
          text: content,
          width: String(content).length * 16,
          height: String(content).includes('\n') ? 36 : 18,
          setOrigin() { return node; },
          setScrollFactor() { return node; },
          setDepth() { return node; },
          destroy() {},
        };
        texts.push(node);
        return node;
      },
      rectangle() {
        return {
          setStrokeStyle() {},
          setScrollFactor() {},
          setDepth() {},
          destroy() {},
        };
      },
      image() {
        return null;
      },
      zone(x, y, w, h) {
        const zone = { x, y, w, h, setInteractive() {}, on() {} };
        zones.push(zone);
        return zone;
      },
    },
    textures: { exists: () => false },
    cache: { bitmapFont: { exists: () => false } },
    events: { once() {} },
  };
  return {
    scene,
    texts,
    zones,
    timers,
    setNow(ms) {
      now = ms;
    },
  };
}

const live = stubScene();
const toast = createNarrationToast(live.scene);
assert(toast.once('open', NARRATION.stageOpen) === true, 'stage open shows once');
assert(toast.once('open', 'nope') === false, 'the same id does not repeat');
assert(live.texts.some((node) => node.text === NARRATION.stageOpen), 'open line is on the stub');
assert(live.zones.length === 0, 'toast does not add a hit target');
const life = toast.msUntilIdle();
assert(life === NARRATION_HOLD_MS + NARRATION_FADE_MS, `idle wait ${life}`);
assert(toast.say('go', NARRATION.go) === true, 'GO queues behind the open line');
assert(toast.msUntilIdle() === life * 2, 'queued line waits its own hold');
const openTimer = live.timers[0];
assert(openTimer && openTimer.removed === false, 'open line is on a timer');
openTimer.fn();
assert(live.texts.some((node) => node.text === NARRATION.go), 'GO shows after the open line');
assert(toast.say('back', NARRATION.back, { refresh: true }) === true, 'back queues');
assert(toast.say('back', NARRATION.back, { refresh: true }) === false, 'a queued back is not stacked');

const banner = stubScene();
const depart = createNarrationToast(banner.scene, { y: 360, style: 'banner' });
assert(depart.say('depart', departLine('lion')) === true, 'confirm banner shows');
assert(banner.texts.some((node) => node.text === '走吧，雷歐。'), 'lion confirm copy');
assert(banner.zones.length === 0, 'confirm banner does not swallow the pointer');
const clear = createNarrationToast(banner.scene, { style: 'slim' });
assert(clear.say('clear', [NARRATION.tide, NARRATION.rumble], { style: 'banner', y: 118 }) === true, 'clear accepts two lines');
assert(banner.texts.some((node) => node.text === `${NARRATION.tide}\n${NARRATION.rumble}`), 'stage 3 clear stacks both lines');

const titleSrc = readFileSync(new URL('../src/scenes/TitleScene.js', import.meta.url), 'utf8');
const petSrc = readFileSync(new URL('../src/scenes/PetSelectScene.js', import.meta.url), 'utf8');
const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const shopSrc = readFileSync(new URL('../src/scenes/ShopScene.js', import.meta.url), 'utf8');
const combatSrc = readFileSync(new URL('../src/systems/PetCombat.js', import.meta.url), 'utf8');
const balanceSrc = readFileSync(new URL('../src/data/stageBalance.js', import.meta.url), 'utf8');

assert(titleSrc.includes('SOON'), 'stages 4–5 still say SOON');
assert(titleSrc.includes('NARRATION.disaster'), 'title shows the disaster line');
assert(titleSrc.includes('NARRATION.nightClose'), 'title shows the night line');
assert(titleSrc.includes('DISASTER_SEEN_KEY'), 'disaster line is once');
assert(!titleSrc.includes('東側街口據點'), 'title does not invent a spoken base line');

assert(petSrc.includes('departLine'), 'pet confirm uses the depart line');
assert(!petSrc.includes('catchphrase'), 'pet select has no catchphrase hook');

assert(stageSrc.includes('NARRATION.stageOpen'), 'stage open wired');
assert(stageSrc.includes('NARRATION.go'), 'first GO wired');
assert(stageSrc.includes('NARRATION.back'), 'back wired');
assert(stageSrc.includes('NARRATION.tide'), 'clear wired');
assert(stageSrc.includes('NARRATION.rumble'), 'stage 3 rumble wired');
assert(stageSrc.includes('NARRATION.wall'), 'wall wired');
assert(stageSrc.includes('NARRATION.gameOver'), 'game over wired');
assert(stageSrc.includes('NARRATION.nurse'), 'nurse wired');
assert(stageSrc.includes('waveCallout'), 'wave 3 callout wired');
assert(!stageSrc.includes('lockMove: true'), 'narration does not lock movement');
assert(stageSrc.includes('maxHp: BARRICADE_MAX_HP'), 'barricade max HP untouched');

assert(shopSrc.includes('nightClose'), 'shop hands the night flag to the title');
assert(!shopSrc.includes('NARRATION.'), 'shop has no narration lines');
assert(!shopSrc.includes('老闆') && !shopSrc.includes('歡迎'), 'shop has no NPC dialogue');

assert(!combatSrc.includes('NARRATION'), 'pet combat is unchanged');
assert(!balanceSrc.includes('NARRATION'), 'stage balance is unchanged');
assert(!stageSrc.includes('東側街口據點'), 'stage does not speak the base name');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('narration checks ok');
