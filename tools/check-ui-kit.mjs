/**
 * UI kit glyph and HP-fill checks. No Phaser.
 * Run: node tools/check-ui-kit.mjs
 */
import { readFileSync } from 'node:fs';
import {
  FONT_HUD,
  HP_FRAMES,
  HP_FRAMES_WAVE3,
  KIT_GLYPHS,
  TITLE_BG_ALIAS,
  TOAST_BODY_W,
  UI,
  WAVE3_HUD_FROM,
  KitHpBar,
  hpFillKey,
  hpFrameSpec,
  supportsKitGlyphs,
  toastFitScale,
  toastRowWidth,
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
assert(WAVE3_HUD_FROM === 3, 'wave3 HUD starts at wave 3');
assert(hpFrameSpec('player', 1).frame === 'ui-hp-bar-player', 'wave 1 keeps the player frame');
assert(hpFrameSpec('player', 2).w === 248 && hpFrameSpec('player', 2).h === 36, 'wave 2 player frame is 248x36');
assert(hpFrameSpec('barricade', 2).frame === 'ui-hp-bar-barricade', 'wave 2 keeps the wall frame');
assert(hpFrameSpec('player', 3).frame === 'ui-hp-bar-player-wave3', 'wave 3 uses the player panel');
assert(hpFrameSpec('player', 4).w === 384 && hpFrameSpec('player', 4).h === 192, 'wave 4 player panel is 384x192');
assert(hpFrameSpec('barricade', 3).frame === 'ui-hp-bar-barricade-wave3', 'wave 3 uses the wall panel');
assert(hpFrameSpec('barricade', 4).w === 384 && hpFrameSpec('barricade', 4).h === 192, 'wave 4 wall panel is 384x192');
assert(HP_FRAMES_WAVE3.player.trough.w > 0 && HP_FRAMES_WAVE3.barricade.trough.h > 0, 'wave3 troughs are measured');
assert(hpFrameSpec('enemy', 4).frame === 'ui-hp-bar-enemy', 'enemy bars stay on the stock frame');
assert(hpFrameSpec('enemy', 4).w === 118, 'enemy frame size does not follow the wave');
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

// Native toast parchment is 218px. Icon (32) + gap + "STAND BEHIND A GUN" (210)
// is wider, which is why the last N sat in the right pillar.
const tipRow = toastRowWidth(32, 210);
assert(tipRow === 248, `tip row width ${tipRow}`);
assert(TOAST_BODY_W < tipRow, 'native hole is narrower than the tip row');
const tipScale = toastFitScale(tipRow);
assert(tipScale > 1, 'long tip widens the toast');
assert(TOAST_BODY_W * tipScale >= tipRow, 'scaled hole covers the tip row');
assert(218 * tipScale >= tipRow + 8, 'scaled parchment keeps a margin past the glyphs');
assert(toastFitScale(80) === 1, 'short wave line does not scale the toast');
const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
assert(stageSrc.includes('playerHp?.setWave(wave)'), 'stage swaps the player frame with the wave');
assert(stageSrc.includes('barricade?.setHudWave(wave)'), 'stage swaps the wall frame with the wave');
assert(!stageSrc.includes('lockMove: true'), 'stage start does not lock pathing');
assert(stageSrc.includes('the shoot tip lives on the title'), 'the opening tip moved to the title');
assert(stageSrc.includes('movementLocked'), 'stage exposes the move lock');
const defenderSrc = readFileSync(new URL('../src/entities/Defender.js', import.meta.url), 'utf8');
assert(defenderSrc.includes('movementLocked'), 'defender rests axes while the tip is up');
const wallSrc = readFileSync(new URL('../src/entities/Barricade.js', import.meta.url), 'utf8');
assert(wallSrc.includes('this._hpBar?.setWave?.(wave)'), 'wall frame swap does not retune HP');

function fakeImage(key) {
  return {
    texture: { key },
    frame: { width: 120, height: 10, cutWidth: 120, cutHeight: 10 },
    setOrigin() {
      return this;
    },
    setScale(x, y) {
      this.scaleX = x;
      this.scaleY = y ?? x;
      return this;
    },
    setScrollFactor() {
      return this;
    },
    setDepth() {
      return this;
    },
    setPosition(x, y) {
      this.x = x;
      this.y = y;
      return this;
    },
    setTexture(next) {
      this.texture.key = next;
      return this;
    },
    setCrop() {
      return this;
    },
    setVisible(shown) {
      this.visible = shown;
      return this;
    },
    setFillStyle() {
      return this;
    },
  };
}

function fakeScene() {
  const keys = new Set([
    'ui-hp-bar-player',
    'ui-hp-bar-barricade',
    'ui-hp-bar-enemy',
    'ui-hp-bar-player-wave3',
    'ui-hp-bar-barricade-wave3',
    'ui-hp-fill-ok',
    'ui-hp-fill-full',
    'ui-hp-fill-mid',
    'ui-hp-fill-low',
    'ui-barricade-fill-ok',
    'ui-barricade-fill-mid',
    'ui-barricade-fill-low',
    'ui-hp-enemy-fill-ok',
    'ui-hp-enemy-fill-mid',
    'ui-hp-enemy-fill-low',
  ]);
  return {
    textures: { exists: (key) => keys.has(key) },
    add: {
      image(_x, _y, key) {
        return fakeImage(key);
      },
    },
  };
}

const scene = fakeScene();
const player = new KitHpBar(scene, 'player', 174, 22, { ratio: 1 });
assert(player.frame.texture.key === 'ui-hp-bar-player', 'constructed player bar is the stock frame');
assert(player.frame.y === 22, 'stock player frame sits on the HUD anchor');
player.setWave(2);
assert(player.frame.texture.key === 'ui-hp-bar-player', 'wave 2 does not swap the player frame');
player.setWave(3);
assert(player.frame.texture.key === 'ui-hp-bar-player-wave3', 'wave 3 swaps in the player panel');
assert(player.spec.w === 384 && player.spec.h === 192, 'live player spec is the 384x192 panel');
assert(player.frame.y === 22 + (192 / 2 - 169.5), 'wave3 player pivot keeps the painted bar on the anchor');
assert(player.ratio === 1, 'player ratio stays full across the swap');
player.setWave(4);
assert(player.frame.texture.key === 'ui-hp-bar-player-wave3', 'wave 4 keeps the player panel');

const wall = new KitHpBar(scene, 'barricade', 900, 24, { ratio: 1 });
wall.setRatio(0.4);
const wallRatio = wall.ratio;
wall.setWave(4);
assert(wall.frame.texture.key === 'ui-hp-bar-barricade-wave3', 'wave 4 swaps in the wall panel');
assert(wall.spec.w === 384 && wall.spec.h === 192, 'live wall spec is the 384x192 panel');
assert(wall.ratio === wallRatio && wall.ratio === 0.4, 'wall ratio is unchanged by the frame swap');
assert(wall.fill.texture.key === 'ui-barricade-fill-mid', 'wall fill still follows the same HP cuts');

const enemy = new KitHpBar(scene, 'enemy', 10, 10, { wave: 4, ratio: 0.5 });
assert(enemy.frame.texture.key === 'ui-hp-bar-enemy', 'enemy bar ignores the wave3 panels');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('ui kit checks ok');
