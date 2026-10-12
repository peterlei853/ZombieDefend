/**
 * Display-only checks for floating damage numbers.
 * Run: node tools/check-damage-readout.mjs
 *
 * A Flame volley used to spawn one `-10` per pellet, stepped left by
 * knockback. These assert that those hits share one label and that the
 * printed integer never exceeds JUICE.DAMAGE_TEXT_MAX.
 */
import { GAME_CONFIG } from '../src/data/GameConfig.js';
import { DAMAGE_COLORS, damageReadoutAmount, showDamageText } from '../src/ui/damageText.js';

const CAP = GAME_CONFIG.JUICE.DAMAGE_TEXT_MAX;
const MERGE = GAME_CONFIG.JUICE.DAMAGE_TEXT_MERGE_MS;
const PELLET = GAME_CONFIG.WEAPONS.SHOTGUN.PELLET_DAMAGE;
const HANDGUN = GAME_CONFIG.WEAPONS.HANDGUN.DAMAGE;

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

function makeScene() {
  const state = { now: 0 };
  /** @type {any[]} */
  const created = [];
  const scene = {
    time: {
      get now() {
        return state.now;
      },
    },
    add: {
      text(x, y, str) {
        /** @type {Record<string, Function>} */
        const handlers = {};
        const text = {
          x,
          y,
          str,
          active: true,
          alpha: 1,
          setOrigin() {
            return text;
          },
          setDepth() {
            return text;
          },
          setText(s) {
            text.str = s;
            return text;
          },
          setAlpha(a) {
            text.alpha = a;
            return text;
          },
          once(ev, fn) {
            handlers[ev] = fn;
            return text;
          },
          destroy() {
            if (!text.active) return;
            text.active = false;
            handlers.destroy?.();
          },
        };
        created.push(text);
        return text;
      },
    },
    tweens: {
      killTweensOf() {},
      add(cfg) {
        return {
          stopped: false,
          stop() {
            this.stopped = true;
          },
          complete() {
            if (!this.stopped) cfg.onComplete?.();
          },
        };
      },
    },
    created,
    state,
  };
  return scene;
}

function activeTexts(scene) {
  return scene.created.filter((t) => t.active);
}

function amounts(scene) {
  return activeTexts(scene).map((t) => {
    assert(/^-\d+$/.test(t.str), `label ${t.str} is not a plain -N`);
    const n = Number(t.str.slice(1));
    assert(n <= CAP, `${t.str} exceeds cap ${CAP}`);
    assert(!t.str.includes('1000'), `absurd magnitude ${t.str}`);
    return n;
  });
}

// Single-hit amounts stay honest and the cap still blocks a raw 10000.
assert(damageReadoutAmount(HANDGUN) === 30, 'handgun readout');
assert(damageReadoutAmount(PELLET) === 10, 'pellet readout');
assert(damageReadoutAmount(28) === 28, 'pet readout');
assert(damageReadoutAmount(15) === 15, 'bite 15');
assert(damageReadoutAmount(11) === 11, 'bite 11');
assert(damageReadoutAmount(16) === 16, 'bite 16');
assert(damageReadoutAmount(25) === 25, 'max bite under cap');
assert(damageReadoutAmount(1000) === CAP, '1000 clamps');
assert(damageReadoutAmount(10000) === CAP, '10000 clamps');
assert(damageReadoutAmount(0) === 0, 'zero');
assert(damageReadoutAmount(Number.NaN) === 0, 'NaN');

{
  const scene = makeScene();
  assert(showDamageText(scene, 10, 10, 0, DAMAGE_COLORS.shotgun, 1) === null, 'zero prints nothing');
  assert(showDamageText(scene, Number.NaN, 10, 10, DAMAGE_COLORS.shotgun, 1) === null, 'bad x');
  assert(scene.created.length === 0, 'no label for rejected hits');
}

{
  const scene = makeScene();
  const step = 12.8;
  let label = null;
  for (let i = 0; i < 20; i++) {
    label = showDamageText(scene, 400 - i * step, 200, PELLET, DAMAGE_COLORS.shotgun, 7);
  }
  const live = activeTexts(scene);
  assert(live.length === 1, `volley spawned ${live.length} labels, want 1`);
  assert(label.str === `-${CAP}`, `full volley shows ${label?.str}, want -${CAP}`);
  assert(label.x === 400, 'merged label stays on the first hit');
  assert(Math.max(...amounts(scene)) === CAP, 'max shown number');
}

{
  const scene = makeScene();
  showDamageText(scene, 100, 40, PELLET, DAMAGE_COLORS.shotgun, 3);
  showDamageText(scene, 88, 40, PELLET, DAMAGE_COLORS.shotgun, 3);
  showDamageText(scene, 76, 40, PELLET, DAMAGE_COLORS.shotgun, 3);
  showDamageText(scene, 64, 40, PELLET, DAMAGE_COLORS.shotgun, 3);
  showDamageText(scene, 52, 40, PELLET, DAMAGE_COLORS.shotgun, 3);
  const live = activeTexts(scene);
  assert(live.length === 1 && live[0].str === '-50', `5 pellets show ${live[0]?.str}`);
}

{
  const scene = makeScene();
  showDamageText(scene, 10, 10, HANDGUN, DAMAGE_COLORS.handgun, 4);
  scene.state.now += 500;
  showDamageText(scene, 0, 10, HANDGUN, DAMAGE_COLORS.handgun, 4);
  const live = activeTexts(scene);
  assert(live.length === 2, `handgun shots merged: ${live.length}`);
  assert(live.every((t) => t.str === '-30'), `handgun labels ${live.map((t) => t.str).join(',')}`);
}

{
  const scene = makeScene();
  showDamageText(scene, 10, 10, 28, DAMAGE_COLORS.pet, 4);
  const live = activeTexts(scene);
  assert(live.length === 1 && live[0].str === '-28', `pet shows ${live[0]?.str}`);
}

{
  const scene = makeScene();
  showDamageText(scene, 500, 80, 15, DAMAGE_COLORS.barricade);
  showDamageText(scene, 490, 120, 11, DAMAGE_COLORS.barricade);
  showDamageText(scene, 480, 160, 16, DAMAGE_COLORS.barricade);
  const live = activeTexts(scene).map((t) => t.str);
  assert(live.length === 3, `barricade merged: ${live.join(',')}`);
  assert(live.join(',') === '-15,-11,-16', `barricade labels ${live.join(',')}`);
}

{
  const scene = makeScene();
  for (let i = 0; i < 8; i++) {
    showDamageText(scene, 200, 40, PELLET, DAMAGE_COLORS.shotgun, 1);
  }
  for (let i = 0; i < 2; i++) {
    showDamageText(scene, 200, 90, PELLET, DAMAGE_COLORS.shotgun, 2);
  }
  const live = activeTexts(scene).map((t) => t.str).sort();
  assert(live.join(',') === '-20,-60', `two targets show ${live.join(',')}`);
}

{
  const scene = makeScene();
  showDamageText(scene, 10, 10, PELLET, DAMAGE_COLORS.shotgun, 9);
  scene.state.now += MERGE;
  showDamageText(scene, 10, 10, PELLET, DAMAGE_COLORS.shotgun, 9);
  assert(activeTexts(scene).length === 1, 'hit on the window edge should merge');
  scene.state.now += 1;
  showDamageText(scene, 0, 10, PELLET, DAMAGE_COLORS.shotgun, 9);
  const live = activeTexts(scene);
  assert(live.length === 2, `window expiry spawned ${live.length}`);
  assert(live[1].str === '-10', `new window shows ${live[1]?.str}`);
}

{
  const scene = makeScene();
  showDamageText(scene, 10, 10, 10000, DAMAGE_COLORS.shotgun, 5);
  showDamageText(scene, 0, 10, PELLET, DAMAGE_COLORS.shotgun, 5);
  const live = activeTexts(scene);
  assert(live.length === 1 && live[0].str === `-${CAP}`, `stacked raw damage shows ${live[0]?.str}`);
}

{
  const scene = makeScene();
  showDamageText(scene, 10, 10, PELLET, DAMAGE_COLORS.shotgun, 6);
  showDamageText(scene, 10, 10, HANDGUN, DAMAGE_COLORS.handgun, 6);
  const live = activeTexts(scene).map((t) => t.str).sort();
  assert(live.join(',') === '-10,-30', `colors merged ${live.join(',')}`);
}

if (failed) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}

console.log(
  `ok: cap ${CAP}, merge ${MERGE}ms, flame volley shows one -${CAP} (20×${PELLET} clamped)`
);
