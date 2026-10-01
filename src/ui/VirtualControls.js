import { GAME_WIDTH, GAME_HEIGHT } from '../data/waves.js';
import { HUD_DEPTH } from '../systems/DepthView.js';

/**
 * Screen-space touch controls for StageScene.
 *
 * Joystick (bottom-left) reports the same axes as WASD / arrows:
 * vertical moves the defender, horizontal is only a facing/strafe axis
 * (DefenderGroup still clamps X to the barricade lane).
 * SWAP (bottom-right) toggles handgun/shotgun once per tap, like SPACE.
 *
 * Both sit above the HUD (`setScrollFactor(0)`) and ignore camera X scroll.
 * They are not full-screen hit targets, so the rest of the stage still receives clicks.
 */

/** Thumb target diameter (canvas px). Kept inside the 64–96px band. */
export const CONTROL_DIAMETER = 96;
/** Minimum inset from the canvas edge before safe-area insets. */
export const CONTROL_EDGE_PAD = 36;
const JOY_RADIUS = CONTROL_DIAMETER / 2;
const THUMB_RADIUS = 28;
const BTN_RADIUS = CONTROL_DIAMETER / 2;
/** Stick travel inside this fraction of the radius does not move. */
const DEADZONE = 0.18;
const IDLE_ALPHA = 0.45;
const ACTIVE_ALPHA = 0.92;
/** Above HUD / barricade bar, below the win/lose overlay (HUD_DEPTH + 100). */
const CONTROL_DEPTH = HUD_DEPTH + 20;

/**
 * Map a stick offset into axes in [-1, 1] and a clamped thumb offset.
 * Full deflection matches a held W/S or A/D (±1). Up is negative Y.
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} [radius]
 * @param {number} [deadzone]
 * @returns {{ dx: number, dy: number, thumbX: number, thumbY: number }}
 */
export function stickAxes(offsetX, offsetY, radius = JOY_RADIUS, deadzone = DEADZONE) {
  const len = Math.hypot(offsetX, offsetY);
  if (!(radius > 0) || len === 0) {
    return { dx: 0, dy: 0, thumbX: 0, thumbY: 0 };
  }
  const clamped = Math.min(len, radius);
  const thumbX = (offsetX / len) * clamped;
  const thumbY = (offsetY / len) * clamped;
  const mag = clamped / radius;
  if (mag <= deadzone) {
    return { dx: 0, dy: 0, thumbX, thumbY };
  }
  const span = 1 - deadzone;
  const scaled = span <= 0 ? 1 : (mag - deadzone) / span;
  const inv = scaled / clamped;
  return {
    dx: clampAxis(thumbX * inv),
    dy: clampAxis(thumbY * inv),
    thumbX,
    thumbY,
  };
}

function clampAxis(v) {
  return Math.max(-1, Math.min(1, v));
}

/** @param {number} x @param {number} y @param {number} cx @param {number} cy @param {number} r */
export function pointInCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * CSS safe-area insets converted into game pixels, with a minimum edge pad.
 * @param {Phaser.Scene} scene
 * @returns {{ left: number, right: number, bottom: number }}
 */
function edgeInsets(scene) {
  let cssLeft = 0;
  let cssRight = 0;
  let cssBottom = 0;
  if (typeof document !== 'undefined') {
    const probe = document.createElement('div');
    probe.style.cssText = [
      'position:fixed',
      'visibility:hidden',
      'pointer-events:none',
      'padding-left:env(safe-area-inset-left)',
      'padding-right:env(safe-area-inset-right)',
      'padding-bottom:env(safe-area-inset-bottom)',
    ].join(';');
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    cssLeft = parseFloat(cs.paddingLeft) || 0;
    cssRight = parseFloat(cs.paddingRight) || 0;
    cssBottom = parseFloat(cs.paddingBottom) || 0;
    probe.remove();
  }

  const gameW = scene.scale?.width || GAME_WIDTH;
  const gameH = scene.scale?.height || GAME_HEIGHT;
  const displayW = scene.scale?.displaySize?.width || gameW;
  const displayH = scene.scale?.displaySize?.height || gameH;
  const sx = displayW > 0 ? gameW / displayW : 1;
  const sy = displayH > 0 ? gameH / displayH : 1;
  return {
    left: Math.max(CONTROL_EDGE_PAD, cssLeft * sx),
    right: Math.max(CONTROL_EDGE_PAD, cssRight * sx),
    bottom: Math.max(CONTROL_EDGE_PAD, cssBottom * sy),
  };
}

export class VirtualControls {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ onWeapon?: () => void, onLayout?: (topY: number) => void }} [opts]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.onWeapon = typeof opts.onWeapon === 'function' ? opts.onWeapon : null;
    this.onLayout = typeof opts.onLayout === 'function' ? opts.onLayout : null;
    this.dx = 0;
    this.dy = 0;
    /** Top of the control row in screen px (for the HUD hint). */
    this.layoutTop = GAME_HEIGHT - CONTROL_EDGE_PAD - CONTROL_DIAMETER;

    this._joyPointerId = null;
    this._weaponPointerId = null;
    /** Press started on SWAP and has not yet fired. */
    this._weaponArmed = false;
    this._destroyed = false;

    // Default touch pool is one finger. Stick + SWAP need two.
    const total = scene.input?.manager?.pointersTotal ?? 0;
    if (total < 3 && typeof scene.input?.addPointer === 'function') {
      scene.input.addPointer(3 - total);
    }

    this._createObjects();
    this._layout();
    this._bind();
  }

  /** Analog axes in [-1, 1]. Zero when the stick is idle or inside the deadzone. */
  getAxes() {
    return { dx: this.dx, dy: this.dy };
  }

  _createObjects() {
    const scene = this.scene;
    const depth = CONTROL_DEPTH;

    this.base = scene.add
      .circle(0, 0, JOY_RADIUS, 0x0d1520, 0.72)
      .setStrokeStyle(3, 0xc5d0dc, 0.9)
      .setScrollFactor(0)
      .setDepth(depth);

    this.ticks = scene.add.graphics().setScrollFactor(0).setDepth(depth + 1);

    this.thumb = scene.add
      .circle(0, 0, THUMB_RADIUS, 0xe8eef5, 0.95)
      .setScrollFactor(0)
      .setDepth(depth + 2);

    this.button = scene.add
      .circle(0, 0, BTN_RADIUS, 0x1b2836, 0.82)
      .setStrokeStyle(3, 0x90caf9, 0.95)
      .setScrollFactor(0)
      .setDepth(depth);

    this.buttonLabel = scene.add
      .text(0, 0, 'SWAP', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#e8eef5',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(depth + 2);

    this._setIdleAlpha();
  }

  _layout() {
    if (this._destroyed) return;
    const insets = edgeInsets(this.scene);
    const viewW = this.scene.scale?.width || GAME_WIDTH;
    const viewH = this.scene.scale?.height || GAME_HEIGHT;
    this.joyCX = insets.left + JOY_RADIUS;
    this.joyCY = viewH - insets.bottom - JOY_RADIUS;
    this.btnCX = viewW - insets.right - BTN_RADIUS;
    this.btnCY = viewH - insets.bottom - BTN_RADIUS;
    this.layoutTop = Math.min(this.joyCY - JOY_RADIUS, this.btnCY - BTN_RADIUS);

    this.base.setPosition(this.joyCX, this.joyCY);
    this.button.setPosition(this.btnCX, this.btnCY);
    this.buttonLabel.setPosition(this.btnCX, this.btnCY);
    this._drawTicks();
    if (this._joyPointerId == null) {
      this.thumb.setPosition(this.joyCX, this.joyCY);
    }
    this.onLayout?.(this.layoutTop);
  }

  _drawTicks() {
    const g = this.ticks;
    const cx = this.joyCX;
    const cy = this.joyCY;
    const inner = 16;
    const outer = JOY_RADIUS - 12;
    g.clear();
    g.lineStyle(3, 0x9fb0c0, 0.85);
    g.beginPath();
    g.moveTo(cx, cy - outer);
    g.lineTo(cx, cy - inner);
    g.moveTo(cx, cy + inner);
    g.lineTo(cx, cy + outer);
    g.moveTo(cx - outer, cy);
    g.lineTo(cx - inner, cy);
    g.moveTo(cx + inner, cy);
    g.lineTo(cx + outer, cy);
    g.strokePath();
  }

  _bind() {
    const input = this.scene.input;
    input.touch?.disableContextMenu?.();
    input.mouse?.disableContextMenu?.();
    this._onDown = (pointer) => this._pointerDown(pointer);
    this._onMove = (pointer) => this._pointerMove(pointer);
    this._onUp = (pointer) => this._pointerUp(pointer, true);
    this._onUpOutside = (pointer) => this._pointerUp(pointer, false);
    input.on('pointerdown', this._onDown);
    input.on('pointermove', this._onMove);
    input.on('pointerup', this._onUp);
    input.on('pointerupoutside', this._onUpOutside);

    this._onResize = () => this._layout();
    this.scene.scale?.on('resize', this._onResize);
    this.scene.events.once('shutdown', () => this.destroy());
  }

  _pointerDown(pointer) {
    if (this._destroyed || !pointer) return;
    const x = pointer.x;
    const y = pointer.y;
    if (this._weaponPointerId == null && pointInCircle(x, y, this.btnCX, this.btnCY, BTN_RADIUS)) {
      this._weaponPointerId = pointer.id;
      this._weaponArmed = true;
      this._setButtonPressed(true);
      return;
    }
    if (this._joyPointerId == null && pointInCircle(x, y, this.joyCX, this.joyCY, JOY_RADIUS)) {
      this._joyPointerId = pointer.id;
      this._setJoyActive(true);
      this._applyStick(pointer);
    }
  }

  _pointerMove(pointer) {
    if (this._destroyed || !pointer) return;
    if (pointer.id === this._joyPointerId) {
      this._applyStick(pointer);
      return;
    }
    if (pointer.id !== this._weaponPointerId) return;
    const inside = pointInCircle(pointer.x, pointer.y, this.btnCX, this.btnCY, BTN_RADIUS);
    this._weaponArmed = inside;
    this._setButtonPressed(inside);
  }

  /**
   * One SWAP per tap: armed on pointerdown, fired on pointerup while still
   * inside the button. Sliding off or releasing outside cancels.
   * @param {Phaser.Input.Pointer} pointer
   * @param {boolean} insideCanvas
   */
  _pointerUp(pointer, insideCanvas) {
    if (this._destroyed || !pointer) return;
    if (pointer.id === this._joyPointerId) {
      this._joyPointerId = null;
      this._resetStick();
    }
    if (pointer.id !== this._weaponPointerId) return;
    const stillOnButton =
      insideCanvas &&
      this._weaponArmed &&
      pointInCircle(pointer.x, pointer.y, this.btnCX, this.btnCY, BTN_RADIUS);
    this._weaponPointerId = null;
    this._weaponArmed = false;
    this._setButtonPressed(false);
    if (stillOnButton) this.onWeapon?.();
  }

  _applyStick(pointer) {
    const axes = stickAxes(pointer.x - this.joyCX, pointer.y - this.joyCY);
    this.dx = axes.dx;
    this.dy = axes.dy;
    this.thumb.setPosition(this.joyCX + axes.thumbX, this.joyCY + axes.thumbY);
  }

  _resetStick() {
    this.dx = 0;
    this.dy = 0;
    this.thumb.setPosition(this.joyCX, this.joyCY);
    this._setJoyActive(false);
  }

  _setIdleAlpha() {
    this.base.setAlpha(IDLE_ALPHA);
    this.ticks.setAlpha(IDLE_ALPHA);
    this.thumb.setAlpha(IDLE_ALPHA + 0.15);
    this.button.setAlpha(IDLE_ALPHA);
    this.buttonLabel.setAlpha(IDLE_ALPHA + 0.25);
  }

  _setJoyActive(active) {
    const a = active ? ACTIVE_ALPHA : IDLE_ALPHA;
    this.base.setAlpha(a);
    this.ticks.setAlpha(a);
    this.thumb.setAlpha(active ? 1 : IDLE_ALPHA + 0.15);
  }

  _setButtonPressed(pressed) {
    this.button.setFillStyle(pressed ? 0x1565c0 : 0x1b2836, pressed ? 0.95 : 0.82);
    const a = pressed ? 1 : IDLE_ALPHA;
    this.button.setAlpha(a);
    this.buttonLabel.setAlpha(pressed ? 1 : IDLE_ALPHA + 0.25);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    const input = this.scene?.input;
    if (input) {
      input.off('pointerdown', this._onDown);
      input.off('pointermove', this._onMove);
      input.off('pointerup', this._onUp);
      input.off('pointerupoutside', this._onUpOutside);
    }
    this.scene?.scale?.off('resize', this._onResize);
    this.base?.destroy();
    this.ticks?.destroy();
    this.thumb?.destroy();
    this.button?.destroy();
    this.buttonLabel?.destroy();
    this.dx = 0;
    this.dy = 0;
  }
}
