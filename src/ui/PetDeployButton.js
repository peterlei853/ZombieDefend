import { PET_ELEMENT_TINT, PET_LINEUP } from '../assets/petLineup.js';
import { GAME_WIDTH } from '../data/waves.js';
import { HUD_DEPTH, layoutPx } from '../systems/DepthView.js';
import { GO_BACK_HUD_HOOK } from './goBackHudHook.js';

/**
 * Top-right deploy control for the one selected pet.
 * GO! sends it. Back! recalls it. Same hit target either way.
 *
 * PIXELLAB_HOOK: ui-float-go / ui-float-back are the button face.
 * A rectangle stands in only when those textures are not loaded.
 */
export class PetDeployButton {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ petId: string, views: () => { id: string, phase?: string, tappable?: boolean, hp?: number }[], onToggle: () => void }} opts
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.petId = opts.petId;
    this._views = opts.views;
    this._onToggle = opts.onToggle;
    this._deployed = false;
    this._goKey = GO_BACK_HUD_HOOK.go;
    this._backKey = GO_BACK_HUD_HOOK.back;
    const role = PET_LINEUP.find((pet) => pet.id === this.petId) || PET_LINEUP[0];
    this._color = PET_ELEMENT_TINT[role.element] ?? 0xfff3c4;
    this._labelName = role.id;

    const goFrame = this._frameSize(this._goKey);
    const w = goFrame?.w || layoutPx(80);
    const h = goFrame?.h || layoutPx(32);
    const x = GAME_WIDTH - layoutPx(16) - w / 2;
    const y = layoutPx(18) + h / 2;
    const depth = HUD_DEPTH + 16;
    this._w = w;
    this._h = h;
    this._x = x;
    this._y = y;

    this.root = scene.add.container(x, y).setScrollFactor(0).setDepth(depth);
    const faceKey = scene.textures?.exists?.(this._goKey) ? this._goKey : null;
    this.face = faceKey ? scene.add.image(0, 0, faceKey).setOrigin(0.5) : null;
    this.bg = scene.add.rectangle(0, 0, w, h, 0x102028, 0.94);
    this.bg.setStrokeStyle(layoutPx(2), this._color, 1);
    this.title = scene.add.text(0, -layoutPx(8), this._labelName, {
      fontFamily: 'sans-serif',
      fontSize: `${Math.max(10, layoutPx(9))}px`,
      color: '#f6e7c2',
    }).setOrigin(0.5, 0.5);
    this.verb = scene.add.text(0, layoutPx(8), 'GO!', {
      fontFamily: 'sans-serif',
      fontSize: `${Math.max(13, layoutPx(13))}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);
    if (this.face) {
      this.bg.setVisible(false);
      this.title.setVisible(false);
      this.verb.setVisible(false);
      this.root.add(this.face);
    } else {
      this.root.add([this.bg, this.title, this.verb]);
    }

    this.hit = scene.add
      .rectangle(x, y, w, h, 0xffffff, 0.001)
      .setScrollFactor(0)
      .setDepth(depth + 2)
      .setName('pet-deploy')
      .setInteractive({ useHandCursor: true });
    this.hit.on('pointerup', () => this._tap());
  }

  /**
   * @param {number} [_deltaMs]
   */
  update(_deltaMs) {
    const views = this._views?.() || [];
    const view = views.find((row) => row.id === this.petId) || null;
    const deployed = view?.phase === 'field';
    const tappable = !view || view.tappable !== false;
    this._deployed = deployed;
    const verb = deployed ? 'Back!' : 'GO!';
    const key = deployed ? this._backKey : this._goKey;
    if (this.face && this.scene.textures?.exists?.(key) && this.face.texture?.key !== key) {
      this.face.setTexture(key);
      this._fitHit(key);
    }
    if (this.verb.text !== verb) this.verb.setText(verb);
    const alpha = tappable ? 1 : 0.45;
    this.face?.setAlpha?.(alpha);
    this.bg.setStrokeStyle(layoutPx(2), this._color, tappable ? 1 : 0.35);
    this.verb.setAlpha(alpha);
    const enabled = !!this.hit.input?.enabled;
    if (tappable && !enabled) this.hit.setInteractive({ useHandCursor: true });
    else if (!tappable && enabled) this.hit.disableInteractive();
  }

  destroy() {
    this.hit?.destroy?.();
    this.root?.destroy?.();
    this.hit = null;
    this.root = null;
    this.face = null;
  }

  _tap() {
    this._onToggle?.();
  }

  /**
   * @param {string} key
   * @returns {{ w: number, h: number }|null}
   */
  _frameSize(key) {
    if (!this.scene.textures?.exists?.(key)) return null;
    const frame = this.scene.textures.get(key).get();
    const w = frame?.realWidth || frame?.width;
    const h = frame?.realHeight || frame?.height;
    if (!w || !h) return null;
    return { w, h };
  }

  /**
   * Back! is wider than GO!. Keep the right edge parked in the corner.
   * @param {string} key
   */
  _fitHit(key) {
    const size = this._frameSize(key);
    if (!size || !this.hit) return;
    const right = this._x + this._w / 2;
    this._w = size.w;
    this._h = size.h;
    this._x = right - size.w / 2;
    this.hit.setPosition(this._x, this._y);
    this.hit.setSize(size.w, size.h);
    this.root.setPosition(this._x, this._y);
  }
}
