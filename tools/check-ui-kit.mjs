/**
 * UI kit glyph and HP-fill checks. No Phaser.
 * Run: node tools/check-ui-kit.mjs
 */
import { readFileSync } from 'node:fs';
import {
  FONT_HUD,
  HP_FRAMES,
  KIT_GLYPHS,
  TITLE_BG_ALIAS,
  UI,
  hpFillKey,
  supportsKitGlyphs,
} from '../src/ui/uiKit.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

assert(KIT_GLYPHS.length === 80, `glyph count ${KIT_GLYPHS.length}`);
assert(!KIT_GLYPHS.includes(' '), 'atlas has no space glyph');
assert(supportsKitGlyphs('STAGE CLEAR'), 'stage clear is latin');
assert(supportsKitGlyphs('GOLD 120'), 'gold line is latin');
assert(supportsKitGlyphs('RETRY STARTS AT 0 GOLD'), 'retry line is latin');
assert(supportsKitGlyphs('W/S LANE  SPACE SWAP'), 'tip line is latin');
assert(supportsKitGlyphs('v0.22.1c STAGE 1'), 'v0.22.1c line is latin');
assert(supportsKitGlyphs('v0.22.1d STAGE 1'), 'v0.22.1d line is latin');
assert(supportsKitGlyphs('v0.22.2 STAGE 1'), 'v0.22.2 line is latin');
assert(!supportsKitGlyphs('遊戲結束'), 'chinese is not a kit glyph');
assert(!supportsKitGlyphs('關卡通過'), 'chinese clear line is not a kit glyph');
assert(!supportsKitGlyphs('第2波'), 'wave chinese is not a kit glyph');

assert(hpFillKey('barricade', 1) === 'ui-barricade-fill-ok', 'wall full is ok');
assert(hpFillKey('barricade', 0.5) === 'ui-barricade-fill-mid', 'wall 0.5 is mid');
assert(hpFillKey('barricade', 0.25) === 'ui-barricade-fill-low', 'wall 0.25 is low');
assert(hpFillKey('player', 1) === 'ui-hp-fill-ok', 'player full is ok');
assert(hpFillKey('player', 0.6) === 'ui-hp-fill-full', 'player mid-high is red full');
assert(hpFillKey('enemy', 1) === 'ui-hp-enemy-fill-ok', 'enemy full is ok');
assert(hpFillKey('enemy', 0.51) === 'ui-hp-enemy-fill-ok', 'enemy just over half is ok');
assert(hpFillKey('enemy', 0.5) === 'ui-hp-enemy-fill-mid', 'enemy 0.5 is mid');
assert(hpFillKey('enemy', 0.4) === 'ui-hp-enemy-fill-mid', 'enemy mid');
assert(hpFillKey('enemy', 0.25) === 'ui-hp-enemy-fill-low', 'enemy 0.25 is low');
assert(hpFillKey('enemy', 0.1) === 'ui-hp-enemy-fill-low', 'enemy low');
assert(HP_FRAMES.enemy.frame === 'ui-hp-bar-enemy', 'enemy frame key');
assert(HP_FRAMES.enemy.w === 118 && HP_FRAMES.enemy.h === 24, 'enemy frame is 118x24');
assert(hpFillKey('player', Number.NaN) === 'ui-hp-fill-low', 'bad ratio clamps low');
assert(FONT_HUD === 'ui-font-hud-bold-atlas-outlined', 'hud face is the outlined atlas');
assert(TITLE_BG_ALIAS === 'bg-title-zombie-vs-buddy', 'title alias name');
assert(UI.title === 'ui-title-bg', 'native title key');
assert(UI.titleHd === 'ui-title-bg-hd', 'hd title key');
assert(UI.titleClean === 'ui-title-bg-clean', 'clean title key');
assert(UI.titleCleanHd === 'ui-title-bg-clean-hd', 'clean hd title key');
assert(UI.joystickBase === 'ui-joystick-base', 'joystick base key');
assert(UI.joystickKnob === 'ui-joystick-knob', 'joystick knob key');
assert(UI.joystickKnobPressed === 'ui-joystick-knob-pressed', 'joystick pressed key');
const titleSrc = readFileSync(new URL('../src/scenes/TitleScene.js', import.meta.url), 'utf8');
assert(titleSrc.includes('addTitleBackdrop'), 'title scene draws the splash');
assert(titleSrc.includes('ui-title-bg-clean'), 'title scene names the clean splash');
assert(titleSrc.includes('TITLE_BG_ALIAS'), 'title scene names the alias');
const controlsSrc = readFileSync(new URL('../src/ui/VirtualControls.js', import.meta.url), 'utf8');
assert(controlsSrc.includes('UI.joystickBase'), 'stick uses the kit base');
assert(controlsSrc.includes('UI.joystickKnobPressed'), 'stick swaps the pressed knob');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('ui kit checks ok');
