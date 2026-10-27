/**
 * Short Traditional Chinese lines. Auto-dismiss, no hit target, no move lock.
 *
 * `slim` is a one-line strip under the HUD so a stage bark can sit beside
 * the WAVE banner. `banner` reuses `showKitBanner` for title, pet confirm,
 * and the clear card.
 */
import { GAME_WIDTH } from '../data/waves.js';
import { HUD_DEPTH } from '../systems/DepthView.js';
import { addKitText, showKitBanner } from './uiKit.js';

/** Opaque hold before the fade. Inside the 2–3s band. */
export const NARRATION_HOLD_MS = 2400;
/** Fade after the hold. Matches the stage banner. */
export const NARRATION_FADE_MS = 280;
/** Slim strip. Wave banner center is 230 and its panel is 192 tall. */
export const STAGE_NARRATION_Y = 112;

/**
 * @param {Phaser.Scene} scene
 * @param {{ x?: number, y?: number, style?: 'slim'|'banner', depth?: number }} [opts]
 */
export function createNarrationToast(scene, opts = {}) {
  return new NarrationToast(scene, opts);
}

class NarrationToast {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ x?: number, y?: number, style?: 'slim'|'banner', depth?: number }} [opts]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    const width = scene.scale?.width || GAME_WIDTH;
    this.x = opts.x ?? width / 2;
    this.y = opts.y ?? STAGE_NARRATION_Y;
    this.style = opts.style === 'banner' ? 'banner' : 'slim';
    this.depth = opts.depth ?? HUD_DEPTH + 48;
    /** @type {{ id: string, lines: string[], style?: string, y?: number, depth?: number }[]} */
    this._queue = [];
    /** @type {Set<string>} */
    this._seen = new Set();
    this._currentId = null;
    this._until = 0;
    this._timer = null;
    this._banner = null;
    this._dead = false;
    scene.events?.once?.('shutdown', () => this.destroy());
  }

  /**
   * @param {string} id
   * @param {string|string[]} lines
   * @param {{ once?: boolean, refresh?: boolean, style?: 'slim'|'banner', y?: number, depth?: number }} [opts]
   * @returns {boolean}
   */
  say(id, lines, opts = {}) {
    if (this._dead || !id) return false;
    const text = normalizeLines(lines);
    if (!text.length) return false;
    if (opts.once) {
      if (this._seen.has(id)) return false;
      this._seen.add(id);
    }
    if (this._currentId === id) {
      if (opts.refresh) this._restartHold();
      return true;
    }
    if (this._queue.some((item) => item.id === id)) return false;
    this._queue.push({
      id,
      lines: text,
      style: opts.style,
      y: opts.y,
      depth: opts.depth,
    });
    if (!this._currentId) this._pump();
    return true;
  }

  /**
   * @param {string} id
   * @param {string|string[]} lines
   * @param {{ refresh?: boolean, style?: 'slim'|'banner', y?: number, depth?: number }} [opts]
   */
  once(id, lines, opts = {}) {
    return this.say(id, lines, { ...opts, once: true });
  }

  /** Ms until the queue has faded out. */
  msUntilIdle() {
    const life = NARRATION_HOLD_MS + NARRATION_FADE_MS;
    const now = this.scene.time?.now ?? 0;
    const current = this._currentId ? Math.max(0, this._until - now) : 0;
    return current + this._queue.length * life;
  }

  destroy() {
    if (this._dead) return;
    this._dead = true;
    this._timer?.remove?.();
    this._timer = null;
    this._banner?.destroy?.();
    this._banner = null;
    this._queue.length = 0;
    this._currentId = null;
    this._until = 0;
  }

  _pump() {
    if (this._dead) return;
    const item = this._queue.shift();
    if (!item) {
      this._currentId = null;
      this._until = 0;
      return;
    }
    this._currentId = item.id;
    const style = item.style || this.style;
    const y = item.y ?? this.y;
    const depth = item.depth ?? this.depth;
    this._banner = style === 'banner' ? this._presentBanner(item, y, depth) : this._presentSlim(item, y, depth);
    const life = NARRATION_HOLD_MS + NARRATION_FADE_MS;
    this._until = (this.scene.time?.now ?? 0) + life;
    this._timer?.remove?.();
    this._timer = this.scene.time?.delayedCall?.(NARRATION_HOLD_MS, () => this._fade()) || null;
    if (!this._timer) this._finishCurrent();
  }

  _restartHold() {
    if (this._dead || !this._currentId) return;
    const life = NARRATION_HOLD_MS + NARRATION_FADE_MS;
    this._until = (this.scene.time?.now ?? 0) + life;
    this._timer?.remove?.();
    this._timer = this.scene.time?.delayedCall?.(NARRATION_HOLD_MS, () => this._fade()) || null;
  }

  /**
   * @param {{ lines: string[] }} item
   * @param {number} y
   * @param {number} depth
   */
  _presentBanner(item, y, depth) {
    return showKitBanner(this.scene, {
      x: this.x,
      y,
      depth,
      zh: item.lines.join('\n'),
    });
  }

  /**
   * @param {{ lines: string[] }} item
   * @param {number} y
   * @param {number} depth
   */
  _presentSlim(item, y, depth) {
    const scene = this.scene;
    const label = item.lines.join('\n');
    const text = addKitText(scene, this.x, y, label, {
      system: true,
      size: 18,
      color: '#f6e7c2',
      depth: depth + 1,
    });
    const w = Math.max(120, Math.round((text?.width || 80) + 28));
    const h = Math.max(36, Math.round((text?.height || 18) + 14));
    const bg = scene.add.rectangle(this.x, y, w, h, 0x1a120c, 0.9);
    bg.setStrokeStyle?.(2, 0xc4a574, 1);
    bg.setScrollFactor?.(0);
    bg.setDepth?.(depth);
    return {
      objects: [bg, text].filter(Boolean),
      dead: false,
      destroy() {
        if (this.dead) return;
        this.dead = true;
        bg?.destroy?.();
        text?.destroy?.();
      },
    };
  }

  _fade() {
    if (this._dead) return;
    const banner = this._banner;
    const targets = banner?.objects?.filter(Boolean) || [];
    const tweens = this.scene.tweens;
    if (!banner || !targets.length || typeof tweens?.add !== 'function') {
      this._finishCurrent();
      return;
    }
    tweens.add({
      targets,
      alpha: 0,
      duration: NARRATION_FADE_MS,
      onComplete: () => this._finishCurrent(banner),
    });
  }

  /**
   * @param {{ destroy?: () => void }|null} [banner]
   */
  _finishCurrent(banner = this._banner) {
    if (this._dead) return;
    if (banner && this._banner === banner) {
      banner.destroy?.();
      this._banner = null;
    } else if (banner && banner !== this._banner) {
      banner.destroy?.();
    }
    this._currentId = null;
    this._pump();
  }
}

/**
 * @param {string|string[]|null|undefined} lines
 * @returns {string[]}
 */
function normalizeLines(lines) {
  const list = Array.isArray(lines) ? lines : [lines];
  /** @type {string[]} */
  const out = [];
  for (const line of list) {
    const text = String(line ?? '').trim();
    if (text) out.push(text);
  }
  return out;
}
