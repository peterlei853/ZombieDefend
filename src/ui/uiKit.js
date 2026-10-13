import { HUD_DEPTH } from '../systems/DepthView.js';

/**
 * ZombieDefend UI kit (v0.22.1).
 *
 * Textures load from assets/library/ui/ through the asset index.
 * HP frames are empty; the fill strip is cropped to the HP ratio and
 * scaled into the frame's trough. Latin labels use the bitmap atlases.
 * Chinese is not in those atlases, so it stays on the system font.
 * The defender has no HP pool: the player frame in the HUD stays full.
 * Barricade and enemy bars track real HP. Pet HUD keys are not touched.
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
};

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
    w: 96,
    h: 32,
    trough: { x: 11, y: 14, w: 74, h: 4 },
  },
};

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
 * Player and enemy: green ok, red full, yellow mid, critical low.
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
export function installUiKit(scene) {
  if (!scene?.cache?.bitmapFont || !scene.textures) return;
  for (const fontKey of Object.keys(FONT_GRID)) {
    registerBitmapFont(scene, fontKey);
  }
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
    this.spec = HP_FRAMES[this.kind];
    this.scale = opts.scale ?? 1;
    this.shown = opts.visible !== false;
    this.ratio = 1;
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
    this.x = x;
    this.y = y;
    this.frame?.setPosition?.(x, y);
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
      this.fill.setPosition(this.x - this.spec.w / 2, this.y);
      return;
    }
    const s = this.scale;
    const trough = this.spec.trough;
    const left = this.x - (this.spec.w * s) / 2 + trough.x * s;
    const mid = this.y - (this.spec.h * s) / 2 + (trough.y + trough.h / 2) * s;
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
 * Toast or dialog panel with a bitmap title, optional icon, and a system-font
 * Chinese line. The caller owns the lifetime.
 * @param {Phaser.Scene} scene
 * @param {{ x: number, y: number, panel?: string, icon?: string, title?: string, sub?: string, zh?: string, depth?: number, titleSize?: number, titleFont?: string, onParchment?: boolean }} opts
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

  pin(addKitImage(scene, opts.x, opts.y, panelKey, { depth, scrollFactor: 0 }));
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
  if (opts.sub) {
    const sub = pin(
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
    const zh = pin(
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
