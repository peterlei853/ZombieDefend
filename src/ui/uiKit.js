import { HUD_DEPTH } from '../systems/DepthView.js';

/**
 * ZombieDefend UI kit (v0.22.2).
 *
 * Textures load from assets/library/ui/ through the asset index.
 * HP frames are empty; the fill strip is cropped to the HP ratio and
 * scaled into the frame's trough. Latin labels use the bitmap atlases.
 * Chinese is not in those atlases, so it stays on the system font.
 * The defender has no HP pool: the player frame in the HUD stays full.
 * Barricade and enemy bars track real HP. Pet HUD keys are not touched.
 * v0.22.2 draws the 118×24 enemy frame with the compact enemy fills,
 * and the title prefers the clean splash (no baked menu or v0.21 footer).
 */

/** Catalog keys. Outlined, gold, and cream are the faces used on screen. */
export const FONT_HUD = 'ui-font-hud-bold-atlas-outlined';
export const FONT_GOLD = 'ui-font-hud-bold-atlas-gold';
/** Black silhouette atlas. Tint it for labels that sit on parchment. */
export const FONT_INK = 'ui-font-hud-bold-atlas';
export const FONT_TINY = 'ui-font-hud-tiny-atlas-cream';
export const FONT_TINY_INK = 'ui-font-hud-tiny-atlas';

/** Dark brown multiply for the black atlases on a light parchment inset. */
export const INK_TINT = 0x2a2118;

export const UI = {
  dialog: 'ui-dialog-panel',
  toast: 'ui-toast-panel',
  button: 'ui-btn-parchment',
  heart: 'ui-icon-hp-heart',
  wave: 'ui-icon-wave-warn',
  heal: 'ui-icon-heal',
  damage: 'ui-icon-damage',
  pause: 'ui-icon-pause',
  ready: 'ui-icon-ready',
  gameover: 'ui-icon-gameover',
  select: 'ui-icon-select-x',
  title: 'ui-title-bg',
  titleHd: 'ui-title-bg-hd',
  /** Clean splash: no baked NEW/LOAD/SCOREBOARD and no v0.21 footer. */
  titleClean: 'ui-title-bg-clean',
  titleCleanHd: 'ui-title-bg-clean-hd',
  joystickBase: 'ui-joystick-base',
  joystickKnob: 'ui-joystick-knob',
  joystickKnobPressed: 'ui-joystick-knob-pressed',
};

/**
 * Catalog alias for the native 688×384 title splash.
 * `extra.aliases` in the UI manifest is the source of truth; this is the
 * fallback when the generated index has not been read yet.
 */
export const TITLE_BG_ALIAS = 'bg-title-zombie-vs-buddy';

/** Row-major, 8 columns × 10 rows. There is no space glyph. */
export const KIT_GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,!?:;'\"-+()0123456789/%*=_$";

export const SYSTEM_FONT =
  'system-ui, "Noto Sans CJK TC", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

/** @type {Record<string, [number, number, number, number]>} cols, rows, cellW, cellH */
const FONT_GRID = {
  [FONT_HUD]: [8, 10, 16, 16],
  [FONT_GOLD]: [8, 10, 16, 16],
  [FONT_INK]: [8, 10, 16, 16],
  [FONT_TINY]: [8, 10, 8, 8],
  [FONT_TINY_INK]: [8, 10, 8, 8],
};

/**
 * Texture-pixel trough inside each empty frame.
 * Measured from the navy interior so the fill stays off the stone rim.
 * Waves 1–2 keep these sheets. Enemy bars stay on this frame at every wave.
 */
export const HP_FRAMES = {
  player: {
    frame: 'ui-hp-bar-player',
    w: 248,
    h: 36,
    trough: { x: 24, y: 13, w: 200, h: 10 },
  },
  barricade: {
    frame: 'ui-hp-bar-barricade',
    w: 251,
    h: 45,
    trough: { x: 25, y: 15, w: 201, h: 16 },
  },
  enemy: {
    frame: 'ui-hp-bar-enemy',
    w: 118,
    h: 24,
    // Navy interior of the 118×24 stone frame (rows 10–14, columns 16–101).
    trough: { x: 16, y: 10, w: 86, h: 5 },
  },
};

/**
 * Stage wave 3+ swaps the player and barricade frames for these panels.
 * Each sheet is 384×192. The painted bar sits on the bottom; the rest is
 * empty. `pivot` is the painted-bar center, in texture pixels, and stays
 * on the same HUD point as the stock frame. Troughs were measured on these
 * sheets (player gradient interior right of the heart; barricade dark trough
 * right of the wall icon). Gold, banners, and the other wave3 panels are
 * not HP frames, so they stay off this path. SFX tags are not generated.
 */
export const WAVE3_HUD_FROM = 3;

export const HP_FRAMES_WAVE3 = {
  player: {
    frame: 'ui-hp-bar-player-wave3',
    w: 384,
    h: 192,
    trough: { x: 110, y: 160, w: 192, h: 16 },
    pivot: { x: 192, y: 169.5 },
  },
  barricade: {
    frame: 'ui-hp-bar-barricade-wave3',
    w: 384,
    h: 192,
    trough: { x: 104, y: 160, w: 174, h: 15 },
    pivot: { x: 191.5, y: 166.5 },
  },
};

/**
 * Frame the Stage HUD should draw for this wave.
 * Player and barricade use the 384×192 wave3 panels from wave 3 up.
 * Enemy bars stay on the 118×24 frame.
 * @param {'player'|'barricade'|'enemy'} kind
 * @param {number} [wave]
 */
export function hpFrameSpec(kind, wave = 1) {
  const key = kind === 'barricade' || kind === 'enemy' ? kind : 'player';
  const n = Number(wave);
  if ((key === 'player' || key === 'barricade') && Number.isFinite(n) && n >= WAVE3_HUD_FROM) {
    return HP_FRAMES_WAVE3[key];
  }
  return HP_FRAMES[key];
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function supportsKitGlyphs(text) {
  const value = String(text ?? '');
  for (const ch of value) {
    if (ch === ' ' || ch === '\n') continue;
    if (!KIT_GLYPHS.includes(ch)) return false;
  }
  return true;
}

/**
 * Fill strip for a ratio in 0..1.
 * Player: green ok above 75%, red full above 50%, yellow mid above 25%, critical low.
 * Enemy: compact strips. Green ok above 50%, yellow mid above 25%, red low.
 * Those mid/low cuts match the rectangle fallback and the barricade bar.
 * Barricade: green ok, yellow mid, red low (same cuts as the old wall bar).
 * @param {'player'|'barricade'|'enemy'} kind
 * @param {number} ratio
 * @returns {string}
 */
export function hpFillKey(kind, ratio) {
  const r = clamp01(ratio);
  if (kind === 'barricade') {
    if (r > 0.5) return 'ui-barricade-fill-ok';
    if (r > 0.25) return 'ui-barricade-fill-mid';
    return 'ui-barricade-fill-low';
  }
  if (kind === 'enemy') {
    if (r > 0.5) return 'ui-hp-enemy-fill-ok';
    if (r > 0.25) return 'ui-hp-enemy-fill-mid';
    return 'ui-hp-enemy-fill-low';
  }
  if (r > 0.75) return 'ui-hp-fill-ok';
  if (r > 0.5) return 'ui-hp-fill-full';
  if (r > 0.25) return 'ui-hp-fill-mid';
  return 'ui-hp-fill-low';
}

/**
 * @param {number} ratio
 * @returns {number}
 */
function clamp01(ratio) {
  const n = Number(ratio);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {Phaser.Scene} scene
 * @param {string[]} keys
 * @returns {string|null}
 */
function firstReadyTexture(scene, keys) {
  for (const key of keys) {
    if (key && scene.textures?.exists?.(key)) return key;
  }
  return null;
}

/**
 * @param {Phaser.Scene} scene
 * @param {string} fontKey
 * @returns {boolean}
 */
export function kitFontReady(scene, fontKey) {
  return !!scene?.cache?.bitmapFont?.exists?.(fontKey);
}

/**
 * Build bitmap fonts from the atlases once textures are in the cache.
 * Safe to call more than once. Missing textures are skipped.
 * @param {Phaser.Scene} scene
 */
/**
 * @param {Phaser.Scene} scene
 * @param {Record<string, string>|null|undefined} [aliases]
 */
export function installUiKit(scene, aliases) {
  if (!scene?.textures) return;
  if (scene.cache?.bitmapFont) {
    for (const fontKey of Object.keys(FONT_GRID)) {
      registerBitmapFont(scene, fontKey);
    }
  }
  installTextureAliases(scene, aliases);
}

/**
 * Point alias keys at textures already in the cache. Nearest filter, same
 * pixels as the source. Safe to call more than once.
 * @param {Phaser.Scene} scene
 * @param {Record<string, string>|null|undefined} [aliases]
 */
function installTextureAliases(scene, aliases) {
  const map = { [TITLE_BG_ALIAS]: UI.title, ...(aliases || {}) };
  const nearest = globalThis.Phaser?.Textures?.FilterMode?.NEAREST;
  for (const [alias, source] of Object.entries(map)) {
    if (!alias || !source || alias === source) continue;
    if (!scene.textures.exists(source) || scene.textures.exists(alias)) continue;
    const image = scene.textures.get(source).getSourceImage?.();
    if (!image) continue;
    scene.textures.addImage(alias, image);
    const tex = scene.textures.get(alias);
    if (nearest !== undefined && typeof tex.setFilter === 'function') {
      tex.setFilter(nearest);
    }
  }
}

/** 1280×720 splashes already match the canvas, so they stay at 1:1. */
const TITLE_HD_KEYS = new Set([UI.titleCleanHd, UI.titleHd]);

/**
 * Title backdrop. Prefers `ui-title-bg-clean` (688×384, no baked menu or
 * v0.21 footer) at an integer cover scale. `ui-title-bg-clean-hd` is the
 * 1280×720 fallback at 1:1. The older alias and `ui-title-bg` remain if
 * the clean textures are not in the cache. Menu buttons stay separate UI.
 * @param {Phaser.Scene} scene
 * @param {number} width
 * @param {number} height
 * @returns {Phaser.GameObjects.Image|null}
 */
export function addTitleBackdrop(scene, width, height) {
  const key = firstReadyTexture(scene, [
    UI.titleClean,
    UI.titleCleanHd,
    TITLE_BG_ALIAS,
    UI.title,
    UI.titleHd,
  ]);
  if (!key || !scene.add?.image) return null;
  const img = scene.add.image(width / 2, height / 2, key).setDepth(0);
  const source = scene.textures.get(key).getSourceImage?.();
  const sw = source?.width || 0;
  const sh = source?.height || 0;
  if (TITLE_HD_KEYS.has(key)) {
    img.setScale(1);
    return img;
  }
  if (sw > 0 && sh > 0) {
    const cover = Math.max(width / sw, height / sh);
    img.setScale(Math.max(1, Math.round(cover)));
  }
  return img;
}

/**
 * @param {Phaser.Scene} scene
 * @param {string} fontKey
 */
function registerBitmapFont(scene, fontKey) {
  if (scene.cache.bitmapFont.exists(fontKey)) return;
  if (!scene.textures.exists(fontKey)) return;
  const [cols, rows, cellW, cellH] = FONT_GRID[fontKey];
  const texture = scene.textures.get(fontKey);
  const source = texture.getSourceImage?.();
  if (!source?.width || !source?.height) return;
  const nearest = globalThis.Phaser?.Textures?.FilterMode?.NEAREST;
  if (nearest !== undefined && typeof texture.setFilter === 'function') {
    texture.setFilter(nearest);
  }
  const texW = source.width;
  const texH = source.height;
  /** @type {Record<number, object>} */
  const chars = {};
  chars[32] = glyphRecord(0, 0, 0, 0, 0, 0, Math.max(3, Math.round(cellW * 0.45)), texW, texH);
  for (let i = 0; i < KIT_GLYPHS.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const sx = col * cellW;
    const sy = row * cellH;
    const ink = measureInk(source, sx, sy, cellW, cellH);
    const code = KIT_GLYPHS.charCodeAt(i);
    if (!ink) {
      chars[code] = glyphRecord(sx, sy, cellW, cellH, 0, 0, cellW, texW, texH);
      continue;
    }
    chars[code] = glyphRecord(
      sx + ink.minX,
      sy + ink.minY,
      ink.width,
      ink.height,
      0,
      ink.minY,
      ink.width + 1,
      texW,
      texH
    );
  }
  scene.cache.bitmapFont.add(fontKey, {
    data: {
      font: fontKey,
      size: cellH,
      lineHeight: cellH,
      chars,
    },
    texture: fontKey,
    frame: '__BASE',
    fromAtlas: false,
  });
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} xOffset
 * @param {number} yOffset
 * @param {number} xAdvance
 * @param {number} texW
 * @param {number} texH
 */
function glyphRecord(x, y, width, height, xOffset, yOffset, xAdvance, texW, texH) {
  return {
    x,
    y,
    width,
    height,
    centerX: width / 2,
    centerY: height / 2,
    xOffset,
    yOffset,
    xAdvance,
    data: {},
    kerning: {},
    u0: texW > 0 ? x / texW : 0,
    v0: texH > 0 ? y / texH : 0,
    u1: texW > 0 ? (x + width) / texW : 0,
    v1: texH > 0 ? (y + height) / texH : 0,
  };
}

/**
 * @param {CanvasImageSource} source
 * @param {number} sx
 * @param {number} sy
 * @param {number} cw
 * @param {number} ch
 * @returns {{ minX: number, minY: number, width: number, height: number }|null}
 */
function measureInk(source, sx, sy, cw, ch) {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(source, sx, sy, cw, ch, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch).data;
    let minX = cw;
    let minY = ch;
    let maxX = -1;
    let maxY = -1;
    for (let py = 0; py < ch; py++) {
      for (let px = 0; px < cw; px++) {
        if (data[(py * cw + px) * 4 + 3] > 16) {
          if (px < minX) minX = px;
          if (py < minY) minY = py;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;
        }
      }
    }
    if (maxX < 0) return { minX: 0, minY: 0, width: Math.max(1, Math.round(cw * 0.35)), height: ch };
    return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  } catch (_) {
    return null;
  }
}

/**
 * Bitmap label when every character is in the atlas. Otherwise system font,
 * which is how Chinese (血量 / 波次 / 遊戲結束) is drawn.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} content
 * @param {{ font?: string, size?: number, tint?: number|null, color?: string, depth?: number, scrollFactor?: number, originX?: number, originY?: number, system?: boolean, fontStyle?: string }} [opts]
 */
export function addKitText(scene, x, y, content, opts = {}) {
  const str = String(content ?? '');
  const fontKey = opts.font || FONT_HUD;
  const size = opts.size || 16;
  const useBitmap = !opts.system && kitFontReady(scene, fontKey) && supportsKitGlyphs(str);
  /** @type {Phaser.GameObjects.GameObject} */
  let go;
  if (useBitmap && scene.add?.bitmapText) {
    go = scene.add.bitmapText(x, y, fontKey, str, size);
    if (opts.tint != null && typeof go.setTint === 'function') go.setTint(opts.tint);
  } else {
    go = scene.add.text(x, y, str, {
      fontFamily: SYSTEM_FONT,
      fontSize: `${opts.systemSize || size}px`,
      color: opts.color || '#f3e6c4',
      fontStyle: opts.fontStyle || 'bold',
    });
  }
  go.setOrigin(opts.originX ?? 0.5, opts.originY ?? 0.5);
  if (typeof go.setScrollFactor === 'function') go.setScrollFactor(opts.scrollFactor ?? 0);
  if (opts.depth != null && typeof go.setDepth === 'function') go.setDepth(opts.depth);
  return go;
}

/**
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} key
 * @param {{ scale?: number, depth?: number, scrollFactor?: number, originX?: number, originY?: number }} [opts]
 * @returns {Phaser.GameObjects.Image|null}
 */
export function addKitImage(scene, x, y, key, opts = {}) {
  if (!key || !scene?.textures?.exists?.(key) || !scene.add?.image) return null;
  const img = scene.add.image(x, y, key);
  img.setOrigin(opts.originX ?? 0.5, opts.originY ?? 0.5);
  if (opts.scale) img.setScale(opts.scale);
  img.setScrollFactor(opts.scrollFactor ?? 0);
  if (opts.depth != null) img.setDepth(opts.depth);
  return img;
}

/**
 * Parchment button. The label uses the tintable ink atlas so it reads on
 * the light center. Falls back to a flat rectangle if the texture is missing.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} label
 * @param {() => void} onClick
 * @param {{ scale?: number, depth?: number, scrollFactor?: number, fontSize?: number, w?: number, h?: number, fill?: number }} [opts]
 */
export function addParchmentButton(scene, x, y, label, onClick, opts = {}) {
  const depth = opts.depth ?? HUD_DEPTH + 2;
  const scroll = opts.scrollFactor ?? 0;
  const scale = opts.scale ?? 2;
  /** @type {Phaser.GameObjects.GameObject} */
  let bg;
  if (scene.textures?.exists?.(UI.button)) {
    bg = scene.add.image(x, y, UI.button).setOrigin(0.5).setScale(scale);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setTint(0xfff4d2));
    bg.on('pointerout', () => bg.clearTint());
    bg.on('pointerup', () => onClick?.());
  } else {
    const w = opts.w ?? 200;
    const h = opts.h ?? 48;
    const fill = opts.fill ?? 0x6b5344;
    bg = scene.add.rectangle(x, y, w, h, fill).setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x8a6a52));
    bg.on('pointerout', () => bg.setFillStyle(fill));
    bg.on('pointerup', () => onClick?.());
  }
  bg.setScrollFactor(scroll);
  bg.setDepth(depth);
  const txt = addKitText(scene, x, y, label, {
    font: FONT_INK,
    size: opts.fontSize ?? 16,
    tint: INK_TINT,
    color: '#2a2118',
    depth: depth + 1,
    scrollFactor: scroll,
  });
  return { bg, txt };
}

/**
 * Empty frame plus a fill cropped to `ratio` and scaled into the trough.
 * Ratio 0 hides the fill. The frame stays.
 */
export class KitHpBar {
  /**
   * @param {Phaser.Scene} scene
   * @param {'player'|'barricade'|'enemy'} kind
   * @param {number} x
   * @param {number} y
   * @param {{ scale?: number, depth?: number, scrollFactor?: number, ratio?: number, visible?: boolean, fallback?: { w: number, h: number, track: number, fill: number, outline?: number } }} [opts]
   */
  constructor(scene, kind, x, y, opts = {}) {
    this.scene = scene;
    this.kind = kind === 'barricade' || kind === 'enemy' ? kind : 'player';
    this.wave = Number.isFinite(Number(opts.wave)) ? Number(opts.wave) : 1;
    this.spec = this._specFor(this.wave);
    this.scale = opts.scale ?? 1;
    this.shown = opts.visible !== false;
    this.ratio = 1;
    this.anchorX = x;
    this.anchorY = y;
    this.x = x;
    this.y = y;
    const fillKey = hpFillKey(this.kind, 1);
    this.kit = !!(scene.textures?.exists?.(this.spec.frame) && scene.textures?.exists?.(fillKey));
    const depth = opts.depth ?? HUD_DEPTH;
    const scroll = opts.scrollFactor ?? 0;
    if (this.kit) {
      this.frame = scene.add.image(x, y, this.spec.frame).setOrigin(0.5, 0.5).setScale(this.scale);
      this.fill = scene.add.image(x, y, fillKey).setOrigin(0, 0.5);
    } else {
      const fb = opts.fallback || {
        w: Math.round(this.spec.w * this.scale),
        h: Math.max(4, Math.round(this.spec.trough.h * this.scale)),
        track: 0x222222,
        fill: 0x3ecf5a,
      };
      this.spec = {
        frame: this.spec.frame,
        w: fb.w,
        h: fb.h,
        trough: { x: 0, y: 0, w: fb.w, h: fb.h },
      };
      this.scale = 1;
      this.frame = scene.add.rectangle(x, y, fb.w, fb.h, fb.track);
      if (fb.outline != null && typeof this.frame.setStrokeStyle === 'function') {
        this.frame.setStrokeStyle(1, fb.outline);
      }
      this.fill = scene.add.rectangle(x - fb.w / 2, y, fb.w, fb.h, fb.fill).setOrigin(0, 0.5);
      this._fallbackFill = fb.fill;
    }
    this.setScrollFactor(scroll);
    this.setDepth(depth);
    this.setPosition(x, y);
    this.setRatio(opts.ratio ?? 1);
    this.setVisible(this.shown);
  }

  /**
   * Wave3 panels when the texture is in the cache. Otherwise the stock frame.
   * @param {number} wave
   */
  _specFor(wave) {
    const wanted = hpFrameSpec(this.kind, wave);
    if (this.scene?.textures?.exists?.(wanted.frame)) return wanted;
    const stock = HP_FRAMES[this.kind];
    if (wanted.frame !== stock.frame && this.scene?.textures?.exists?.(stock.frame)) return stock;
    return wanted;
  }

  /**
   * Swap the player or barricade frame when the stage wave crosses 3.
   * The ratio and the HUD anchor stay put. Enemy bars ignore the wave.
   * @param {number} wave
   */
  setWave(wave) {
    const n = Number(wave);
    const nextWave = Number.isFinite(n) ? n : 1;
    if (nextWave === this.wave && this.spec?.frame === this._specFor(nextWave).frame) return;
    this.wave = nextWave;
    if (!this.kit || !this.frame?.setTexture) return;
    const next = this._specFor(nextWave);
    if (next.frame === this.spec.frame) return;
    if (!this.scene.textures.exists(next.frame)) return;
    this.spec = next;
    this.frame.setTexture(next.frame);
    this.frame.setOrigin(0.5, 0.5);
    this.frame.setScale(this.scale);
    this.setRatio(this.ratio);
    this.setPosition(this.anchorX, this.anchorY);
    this.setVisible(this.shown);
  }

  /**
   * Texture center that puts `pivot` on the HUD anchor.
   * Stock frames have no pivot, so the anchor is the center.
   */
  _frameCenter() {
    const pivot = this.spec.pivot;
    if (!pivot) return { x: this.anchorX, y: this.anchorY };
    const s = this.scale;
    return {
      x: this.anchorX + (this.spec.w / 2 - pivot.x) * s,
      y: this.anchorY + (this.spec.h / 2 - pivot.y) * s,
    };
  }

  get displayWidth() {
    return this.spec.w * this.scale;
  }

  get displayHeight() {
    return this.spec.h * this.scale;
  }

  /**
   * @param {number} factor
   */
  setScrollFactor(factor) {
    this.frame?.setScrollFactor?.(factor);
    this.fill?.setScrollFactor?.(factor);
  }

  /**
   * @param {number} depth
   */
  setDepth(depth) {
    this.frame?.setDepth?.(depth);
    this.fill?.setDepth?.(depth + 1);
  }

  /**
   * @param {boolean} shown
   */
  setVisible(shown) {
    this.shown = !!shown;
    this.frame?.setVisible?.(this.shown);
    this.fill?.setVisible?.(this.shown && this.ratio > 0.01);
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  setPosition(x, y) {
    this.anchorX = x;
    this.anchorY = y;
    this.x = x;
    this.y = y;
    const center = this._frameCenter();
    this.frame?.setPosition?.(center.x, center.y);
    this._layoutFill();
  }

  /**
   * @param {number} ratio
   */
  setRatio(ratio) {
    const r = clamp01(ratio);
    this.ratio = r;
    if (!this.kit) {
      const keyRatio = r;
      const color =
        this.kind === 'barricade'
          ? keyRatio > 0.5
            ? 0x3ecf5a
            : keyRatio > 0.25
              ? 0xe0b040
              : 0xe04848
          : keyRatio > 0.5
            ? 0x3ecf5a
            : keyRatio > 0.25
              ? 0xe0b040
              : 0xe04848;
      this.fill?.setFillStyle?.(color);
      if (this.fill) this.fill.width = this.spec.trough.w * r;
      this.fill?.setVisible?.(this.shown && r > 0.01);
      this._layoutFill();
      return;
    }
    const key = hpFillKey(this.kind, r);
    if (this.fill.texture?.key !== key && this.scene.textures.exists(key)) {
      this.fill.setTexture(key);
    }
    const frame = this.fill.frame;
    const srcW = frame?.width || frame?.cutWidth || 120;
    const srcH = frame?.height || frame?.cutHeight || 10;
    const trough = this.spec.trough;
    this.fill.setScale((trough.w * this.scale) / srcW, (trough.h * this.scale) / srcH);
    if (r <= 0.01) {
      this.fill.setVisible(false);
    } else {
      const cropW = Math.max(1, Math.round(srcW * r));
      this.fill.setCrop(0, 0, cropW, srcH);
      this.fill.setVisible(this.shown);
    }
    this._layoutFill();
  }

  _layoutFill() {
    if (!this.fill) return;
    if (!this.kit) {
      this.fill.setPosition(this.anchorX - this.spec.w / 2, this.anchorY);
      return;
    }
    const center = this._frameCenter();
    const s = this.scale;
    const trough = this.spec.trough;
    const left = center.x - (this.spec.w * s) / 2 + trough.x * s;
    const mid = center.y - (this.spec.h * s) / 2 + (trough.y + trough.h / 2) * s;
    this.fill.setPosition(left, mid);
  }

  destroy() {
    this.frame?.destroy?.();
    this.fill?.destroy?.();
    this.frame = null;
    this.fill = null;
  }
}

/**
 * Safe inner width of `ui-toast-panel` at scale 1.
 * The texture is 512×192, but the body parchment is only x=147..364
 * (218px). 216 leaves the glyph off the inner stone edge.
 */
export const TOAST_BODY_W = 216;
/** Extra parchment past the icon+label row so the last glyph is not in the pillar. */
export const TOAST_BODY_PAD = 24;

/**
 * Icon and label side by side, matching `showKitBanner`'s pair gap.
 * @param {number} iconW
 * @param {number} textW
 */
export function toastRowWidth(iconW, textW) {
  const iw = Number(iconW) || 0;
  const tw = Number(textW) || 0;
  if (iw > 0 && tw > 0) return iw + 6 + tw;
  return Math.max(iw, tw);
}

/**
 * Panel scale so a row fits in the toast parchment. 1 when it already fits.
 * @param {number} contentWidth
 */
export function toastFitScale(contentWidth) {
  const width = Number(contentWidth) || 0;
  const need = width + TOAST_BODY_PAD;
  if (!(width > 0) || need <= TOAST_BODY_W) return 1;
  return need / TOAST_BODY_W;
}

/**
 * Grow the toast from its center when the body row is wider than the parchment,
 * and keep title / sub / zh on the same bands of the art.
 * Glyphs stay at native size. Short rows (wave callouts) stay at scale 1.
 * @param {Phaser.GameObjects.Image|null|undefined} panel
 * @param {Phaser.GameObjects.GameObject|null|undefined} title
 * @param {Phaser.GameObjects.Image|null|undefined} icon
 * @param {Phaser.GameObjects.GameObject|null|undefined} sub
 * @param {Phaser.GameObjects.GameObject|null|undefined} zh
 * @param {{ x: number, y: number, sub?: string }} opts
 */
function fitToastPanel(panel, title, icon, sub, zh, opts) {
  const body = sub || zh;
  const paired = toastRowWidth(icon?.displayWidth || 0, body?.width || 0);
  const plain = Math.max(sub?.width || 0, zh?.width || 0, title?.width || 0);
  const fit = toastFitScale(Math.max(paired, plain));
  if (!(fit > 1)) return;
  panel?.setScale?.(fit);
  const placeY = (go) => {
    if (!go?.setPosition) return;
    const dy = (go.y ?? opts.y) - opts.y;
    go.setPosition(go.x, opts.y + dy * fit);
  };
  placeY(title);
  placeY(sub);
  placeY(zh);
  placeY(icon);
}

/**
 * Toast or dialog panel with a bitmap title, optional icon, and a system-font
 * Chinese line. The caller owns the lifetime.
 * Toast body copy stays inside the parchment hole. A row wider than that hole
 * (icon + `STAND BEHIND A GUN`) scales the panel up from center; glyphs stay
 * at their native size. `onDismiss` adds a hit target that swallows the pointer.
 * @param {Phaser.Scene} scene
 * @param {{ x: number, y: number, panel?: string, icon?: string, title?: string, sub?: string, zh?: string, depth?: number, titleSize?: number, titleFont?: string, onParchment?: boolean, titleOnDark?: boolean, onDismiss?: () => void }} opts
 */
export function showKitBanner(scene, opts) {
  const depth = opts.depth ?? HUD_DEPTH + 40;
  const panelKey = opts.panel || UI.toast;
  const toast = panelKey === UI.toast;
  // The toast's top cap is navy and its inset is a narrow parchment.
  // Outlined Latin sits in the cap. Ink Latin and Chinese sit in the inset.
  const titleOnDark = opts.titleOnDark ?? toast;
  const bodyInk = opts.onParchment ?? true;
  const titleFont = opts.titleFont || (titleOnDark ? FONT_HUD : bodyInk ? FONT_INK : FONT_HUD);
  const titleTint = titleOnDark ? null : bodyInk ? INK_TINT : null;
  /** @type {Phaser.GameObjects.GameObject[]} */
  const objects = [];
  const pin = (go) => {
    if (!go) return go;
    go.setScrollFactor?.(0);
    go.setDepth?.(depth);
    objects.push(go);
    return go;
  };
  const pair = (icon, label, x, y) => {
    if (!icon || !label) return;
    const gap = 6;
    const tw = label.width || 0;
    const iw = icon.displayWidth || 32;
    const total = iw + gap + tw;
    icon.setPosition(x - total / 2 + iw / 2, y);
    label.setPosition(x - total / 2 + iw + gap + tw / 2, y);
  };

  const panel = pin(addKitImage(scene, opts.x, opts.y, panelKey, { depth, scrollFactor: 0 }));
  const titleY = opts.y + (toast ? -42 : opts.sub || opts.zh ? -18 : 0);
  const title = pin(
    addKitText(scene, opts.x, titleY, opts.title || '', {
      font: titleFont,
      size: opts.titleSize ?? 16,
      tint: titleTint,
      color: titleOnDark ? '#f6e7c2' : '#2a2118',
      depth,
    })
  );
  const icon = opts.icon
    ? pin(addKitImage(scene, opts.x, titleY, opts.icon, { depth, scrollFactor: 0 }))
    : null;
  if (!toast) pair(icon, title, opts.x, titleY);

  const subY = toast ? opts.y - 4 : (title?.y || opts.y) + ((title?.height || 16) / 2) + 8;
  let zhY = subY;
  /** @type {Phaser.GameObjects.GameObject|null} */
  let sub = null;
  /** @type {Phaser.GameObjects.GameObject|null} */
  let zh = null;
  if (opts.sub) {
    sub = pin(
      addKitText(scene, opts.x, subY, opts.sub, {
        font: bodyInk ? FONT_INK : FONT_HUD,
        size: 16,
        tint: bodyInk ? INK_TINT : null,
        color: bodyInk ? '#2a2118' : '#f6e7c2',
        originY: toast ? 0.5 : 0,
        depth,
      })
    );
    if (toast) pair(icon, sub, opts.x, subY);
    zhY = toast ? opts.y + 18 : (sub?.y || subY) + (sub?.height || 16) + 6;
  } else if (!toast) {
    zhY = (title?.y || opts.y) + ((title?.height || 16) / 2) + 8;
  } else {
    zhY = opts.y + 6;
  }
  if (opts.zh) {
    zh = pin(
      addKitText(scene, opts.x, zhY, opts.zh, {
        system: true,
        size: 16,
        color: bodyInk ? '#3a2c1c' : '#ffe7b0',
        originY: toast ? 0.5 : 0,
        depth,
      })
    );
    if (toast && !opts.sub) pair(icon, zh, opts.x, zhY);
  }
  if (toast) fitToastPanel(panel, title, icon, sub, zh, opts);
  if (typeof opts.onDismiss === 'function' && scene.add?.zone) {
    const s = panel?.scaleX || 1;
    const zone = pin(scene.add.zone(opts.x, opts.y, Math.round(512 * s), Math.round(192 * s)));
    if (zone?.setInteractive) {
      zone.setInteractive();
      const stop = (pointer) => pointer?.event?.stopPropagation?.();
      zone.on('pointerdown', stop);
      zone.on('pointerup', (pointer) => {
        stop(pointer);
        opts.onDismiss();
      });
    }
  }
  return {
    objects,
    dead: false,
    destroy() {
      if (this.dead) return;
      this.dead = true;
      for (const go of objects) {
        if (go?.active) go.destroy();
      }
    },
  };
}
