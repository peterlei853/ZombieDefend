/**
 * UI kit glyph and HP-fill checks. No Phaser.
 * Run: node tools/check-ui-kit.mjs
 */
import { readFileSync } from 'node:fs';
import { FONT_HUD, KIT_GLYPHS, TITLE_BG_ALIAS, UI, hpFillKey, supportsKitGlyphs } from '../src/ui/uiKit.js';

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
assert(supportsKitGlyphs('v0.22.1b STAGE 1'), 'version line is latin');
assert(!supportsKitGlyphs('遊戲結束'), 'chinese is not a kit glyph');
assert(!supportsKitGlyphs('關卡通過'), 'chinese clear line is not a kit glyph');
assert(!supportsKitGlyphs('第2波'), 'wave chinese is not a kit glyph');

assert(hpFillKey('barricade', 1) === 'ui-barricade-fill-ok', 'wall full is ok');
assert(hpFillKey('barricade', 0.5) === 'ui-barricade-fill-mid', 'wall 0.5 is mid');
assert(hpFillKey('barricade', 0.25) === 'ui-barricade-fill-low', 'wall 0.25 is low');
assert(hpFillKey('player', 1) === 'ui-hp-fill-ok', 'player full is ok');
assert(hpFillKey('player', 0.6) === 'ui-hp-fill-full', 'player mid-high is red full');
assert(hpFillKey('enemy', 0.4) === 'ui-hp-fill-mid', 'enemy mid');
assert(hpFillKey('enemy', 0.1) === 'ui-hp-fill-low', 'enemy low');
assert(hpFillKey('player', Number.NaN) === 'ui-hp-fill-low', 'bad ratio clamps low');
assert(FONT_HUD === 'ui-font-hud-bold-atlas-outlined', 'hud face is the outlined atlas');
assert(TITLE_BG_ALIAS === 'bg-title-zombie-vs-buddy', 'title alias name');
assert(UI.title === 'ui-title-bg', 'native title key');
assert(UI.titleHd === 'ui-title-bg-hd', 'hd title key');
const titleSrc = readFileSync(new URL('../src/scenes/TitleScene.js', import.meta.url), 'utf8');
assert(titleSrc.includes('addTitleBackdrop'), 'title scene draws the splash');
assert(titleSrc.includes('TITLE_BG_ALIAS'), 'title scene names the alias');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('ui kit checks ok');
