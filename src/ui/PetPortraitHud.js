import { GAME_WIDTH } from '../data/waves.js';
import { HUD_DEPTH, layoutPx } from '../systems/DepthView.js';

/**
 * Top-right party column. Each slot shows the library `ui-pet-*-head` icon
 * (48×48, full texture, no idle-frame crop).
 * Ready slots are bright and tappable. Skill cooldown dims the head (alpha).
 * Death / revive cooldown greys it (tint) and draws an X plus a bandage.
 * A pet on the field shows 「出戰中」 and ignores taps.
 * Tap punch is visual. Summon / death / revive-ready audio is played by PetCombat.
 */
export class PetPortraitHud {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ views: () => PortraitView[], onSummon: (index: number) => { reason?: string }|void }} opts
   */
  constructor(scene, opts) {
    this.scene = scene;
    this._views = opts.views;
    this._onSummon = opts.onSummon;
    this.slot = layoutPx(64);
    this._pulse = 0;
    /** @type {PortraitSlot[]} */
    this._slots = [];
    /** @type {Phaser.GameObjects.Text|null} */
    this._toast = null;
    this._toastGen = 0;
    this._build();
  }

  /**
   * @param {number} deltaMs
   */
  update(deltaMs) {
    this._pulse += Number.isFinite(deltaMs) ? deltaMs : 0;
    const views = this._views?.() || [];
    for (let i = 0; i < this._slots.length; i++) {
      this._sync(this._slots[i], views[i]);
    }
  }

  /** Short line just left of the column. */
  showToast(message) {
    const scene = this.scene;
    if (!scene?.add?.text || !message) return;
    const gen = ++this._toastGen;
    if (this._toast?.active) this._toast.destroy();
    const anchor = this._slots[0];
    const x = (anchor?.x ?? GAME_WIDTH - layoutPx(16)) - this.slot / 2 - layoutPx(8);
    const y = anchor?.y ?? layoutPx(80);
    const text = scene.add
      .text(x, y, message, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${layoutPx(16)}px`,
        color: '#fff8e1',
        backgroundColor: '#3e2723',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 28);
    this._toast = text;
    scene.tweens?.add?.({
      targets: text,
      alpha: 0,
      delay: 680,
      duration: 320,
      onComplete: () => {
        if (this._toastGen !== gen) return;
        if (text.active) text.destroy();
        if (this._toast === text) this._toast = null;
      },
    });
  }

  destroy() {
    this._toast?.destroy?.();
    this._toast = null;
    for (const slot of this._slots) {
      slot.hit?.destroy?.();
      slot.root?.destroy?.();
    }
    this._slots = [];
  }

  _build() {
    const views = this._views?.() || [];
    const scene = this.scene;
    const size = this.slot;
    const gap = layoutPx(6);
    const pad = layoutPx(10);
    const x = GAME_WIDTH - pad - size / 2;
    const y0 = layoutPx(40) + size / 2;
    const depth = HUD_DEPTH + 16;
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      const y = y0 + i * (size + gap);
      const root = scene.add.container(x, y).setScrollFactor(0).setDepth(depth);
      const bg = scene.add.rectangle(0, 0, size, size, 0x0c1218, 0.9);
      bg.setStrokeStyle?.(layoutPx(2), view.color, 0.95);
      const portrait = this._portrait(view);
      const label = scene.add
        .text(-size / 2 + layoutPx(4), -size / 2 + layoutPx(2), view.elementZh || '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: `${layoutPx(11)}px`,
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0);
      label.setColor?.(cssColor(view.color));
      const barW = size - layoutPx(10);
      const barY = size / 2 - layoutPx(6);
      const barBg = scene.add.rectangle(0, barY, barW, layoutPx(5), 0x1a120c, 0.95);
      const barFg = scene.add
        .rectangle(-barW / 2, barY, barW, layoutPx(5), view.color)
        .setOrigin(0, 0.5);
      const badge = scene.add
        .text(0, layoutPx(2), '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: `${layoutPx(12)}px`,
          color: '#fff8e1',
          fontStyle: 'bold',
          backgroundColor: '#1b1208',
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5);
      const down = this._downMark();
      const rim = scene.add.graphics();
      this._strokeRim(rim, size, view.color);
      root.add([bg, portrait, down.bandage, down.cross, label, barBg, barFg, badge, rim]);
      const hit = scene.add
        .rectangle(x, y, size, size, 0xffffff, 0.001)
        .setScrollFactor(0)
        .setDepth(depth + 2)
        .setName(`pet-portrait-${view.id}`)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this._tap(i));
      this._slots.push({
        id: view.id,
        x,
        y,
        root,
        hit,
        bg,
        portrait,
        label,
        barFg,
        badge,
        down,
        rim,
        color: view.color,
      });
    }
  }

  /**
   * @param {PortraitView} view
   */
  _portrait(view) {
    const scene = this.scene;
    const key = view.portraitKey;
    if (key && scene.textures?.exists?.(key) && scene.add?.image) {
      const img = scene.add.image(0, -layoutPx(4), key);
      img.setOrigin?.(0.5, 0.5);
      const src = img.frame?.realWidth || img.width || 48;
      const fit = this.slot - layoutPx(14);
      img.setScale(fit / Math.max(1, src));
      return img;
    }
    const g = scene.add.graphics();
    g.fillStyle(view.color, 1);
    g.fillCircle(0, -layoutPx(4), layoutPx(16));
    return g;
  }

  _downMark() {
    const scene = this.scene;
    const bandage = scene.add.rectangle(layoutPx(16), -layoutPx(16), layoutPx(18), layoutPx(8), 0xf7f7f7);
    bandage.setStrokeStyle?.(1, 0xd32f2f);
    const cross = scene.add.graphics();
    const arm = layoutPx(12);
    cross.lineStyle(layoutPx(3), 0xff5252, 1);
    cross.beginPath();
    cross.moveTo(-arm, -arm);
    cross.lineTo(arm, arm);
    cross.moveTo(arm, -arm);
    cross.lineTo(-arm, arm);
    cross.strokePath();
    bandage.setVisible(false);
    cross.setVisible(false);
    return { bandage, cross };
  }

  /**
   * @param {Phaser.GameObjects.Graphics} rim
   * @param {number} size
   * @param {number} color
   */
  _strokeRim(rim, size, color) {
    const half = size / 2;
    const radius = layoutPx(6);
    rim.lineStyle(layoutPx(2), color, 1);
    rim.strokeRoundedRect(-half, -half, size, size, radius);
  }

  /** @param {number} index */
  _tap(index) {
    const views = this._views?.() || [];
    const view = views[index];
    const slot = this._slots[index];
    if (!view?.tappable || !slot) return;
    this._punch(slot.root);
    const result = this._onSummon?.(index);
    if (result?.reason === 'no-target') this.showToast('沒有目標');
  }

  /** @param {Phaser.GameObjects.Container} root */
  _punch(root) {
    if (!root?.setScale) return;
    root.setScale(1);
    const tween = this.scene.tweens?.add?.({
      targets: root,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => root.setScale(1),
    });
    if (!tween) root.setScale(1);
  }

  /**
   * @param {PortraitSlot} slot
   * @param {PortraitView|undefined} view
   */
  _sync(slot, view) {
    if (!view) return;
    const tappable = !!view.tappable;
    const enabled = !!slot.hit.input?.enabled;
    if (tappable && !enabled) slot.hit.setInteractive({ useHandCursor: true });
    else if (!tappable && enabled) slot.hit.disableInteractive();
    if (view.grey) slot.portrait.setTint?.(0x8d8d8d);
    else slot.portrait.clearTint?.();
    // Skill CD dims. Revive stays readable under the grey tint, X, and bandage.
    const headAlpha = view.phase === 'skill' ? 0.38 : 1;
    slot.portrait.setAlpha?.(headAlpha);
    slot.bg.setFillStyle?.(0x0c1218, view.dim ? 0.55 : 0.92);
    slot.badge.setText(view.badge || '');
    slot.badge.setVisible(!!view.badge);
    const down = !!view.grey;
    slot.down.bandage.setVisible(down);
    slot.down.cross.setVisible(down);
    const ratio = Number.isFinite(view.bar) ? view.bar : 0;
    slot.barFg.setScale(Math.max(0.02, ratio), 1);
    const fill = view.phase === 'revive' ? 0xcfd8dc : view.phase === 'field' ? 0xffd54f : view.color;
    slot.barFg.setFillStyle?.(fill);
    let rimAlpha = 0.25;
    if (view.phase === 'ready') rimAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this._pulse / 260));
    else if (view.phase === 'field') rimAlpha = 0.95;
    slot.rim.setAlpha(rimAlpha);
  }
}

/** @param {number} color */
function cssColor(color) {
  const hex = (color >>> 0).toString(16).padStart(6, '0').slice(-6);
  return `#${hex}`;
}

/**
 * @typedef {object} PortraitView
 * @property {string} id
 * @property {string} [element]
 * @property {string} [elementZh]
 * @property {number} color
 * @property {'ready'|'field'|'skill'|'revive'} phase
 * @property {boolean} tappable
 * @property {boolean} dim
 * @property {boolean} grey
 * @property {string} badge
 * @property {number} bar
 * @property {string} portraitKey
 */

/**
 * @typedef {object} PortraitSlot
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {Phaser.GameObjects.Container} root
 * @property {Phaser.GameObjects.Rectangle} hit
 * @property {Phaser.GameObjects.GameObject} bg
 * @property {Phaser.GameObjects.GameObject} portrait
 * @property {Phaser.GameObjects.Text} label
 * @property {Phaser.GameObjects.Rectangle} barFg
 * @property {Phaser.GameObjects.Text} badge
 * @property {{ bandage: Phaser.GameObjects.Rectangle, cross: Phaser.GameObjects.Graphics }} down
 * @property {Phaser.GameObjects.Graphics} rim
 * @property {number} color
 */
