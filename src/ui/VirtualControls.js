import { GAME_WIDTH, GAME_HEIGHT } from '../data/waves.js';
import { HUD_DEPTH } from '../systems/DepthView.js';
import { FONT_INK, INK_TINT, UI, addKitText } from './uiKit.js';

/**
 * Screen-space touch controls for StageScene.
 *
 * Joystick (bottom-left) reports the same axes as WASD / arrows:
 * vertical moves the defender, horizontal is only a facing/strafe axis
 * (DefenderGroup still clamps X to the barricade lane).
 * When the kit textures are cached, the stick is `ui-joystick-base` with
 * `ui-joystick-knob`, swapping to `ui-joystick-knob-pressed` while active.
 * SWAP (bottom-right) shoots while held, the same as SPACE.
 *
 * Both sit above the HUD (`setScrollFactor(0)`) and ignore camera X scroll.
 * They are not full-screen hit targets, so the rest of the stage still receives clicks.
 * While a zombie overlaps a control and the player is not holding it, the
 * control fades so the bottom lane is not covered.
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
/** Native kit sizes. The knob center stays inside the 80×80 base. */
const KIT_JOY_BASE = 80;
const KIT_JOY_KNOB = 40;
const KIT_KNOB_TRAVEL = (KIT_JOY_BASE - KIT_JOY_KNOB) / 2;
const IDLE_ALPHA = 0.45;
/** While a zombie body covers a control, drop it so the lane stays readable. */
const COMBAT_ALPHA = 0.08;
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
    /** True while a zombie body overlaps that control. Idle alpha drops. */
    this._joyFade = false;
    /** Parchment kit stick. Flat circles remain when those textures are missing. */
    this._kitJoy = false;
    this._swapFade = false;
    /** Top of the control row in screen px. */
    this.layoutTop = GAME_HEIGHT - CONTROL_EDGE_PAD - CONTROL_DIAMETER;

    this._joyPointerId = null;
    this._weaponPointerId = null;
    /** True from SWAP pointerdown until that finger lifts. */
    this.weaponHeld = false;
    /** True after pointerdown until the stage consumes it, even if the finger already lifted. */
    this._weaponPulse = false;
    /** Press started on SWAP and has not yet lifted. */
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

  /**
   * True once when SWAP was pressed since the last read, including a
   * click or tap that ended before this frame's poll.
   * @returns {boolean}
   */
  consumeShotPulse() {
    const pulsed = this._weaponPulse === true;
    this._weaponPulse = false;
    return pulsed;
  }

  /** Analog axes in [-1, 1]. Zero when the stick is idle or inside the deadzone. */
  getAxes() {
    return { dx: this.dx, dy: this.dy };
  }

  /**
   * Fade whichever idle control a bottom-lane body covers.
   * A finger that is already down keeps the active alpha.
   * @param {boolean} joyOccluded
   * @param {boolean} swapOccluded
   */
  setCombatFade(joyOccluded, swapOccluded) {
    const joy = !!joyOccluded;
    const swap = !!swapOccluded;
    if (joy === this._joyFade && swap === this._swapFade) return;
    this._joyFade = joy;
    this._swapFade = swap;
    if (this._joyPointerId == null) this._setJoyActive(false);
    if (this._weaponPointerId == null) this._setButtonPressed(false);
  }

  /**
   * True when an upright body (feet at `feetY`, top at `topY`) overlaps
   * the named control. `which` is `joy` or `swap`.
   * @param {'joy'|'swap'} which
   * @param {number} x screen x
   * @param {number} feetY
   * @param {number} halfW
   * @param {number} topY
   */
  bodyCoversControl(which, x, feetY, halfW, topY) {
    if (this._destroyed) return false;
    if (which === 'joy') {
      return this._rectHitsCircle(x, topY, feetY, halfW, this.joyCX, this.joyCY, JOY_RADIUS);
    }
    if (this._kitButton && this.button?.getBounds) {
      const b = this.button.getBounds();
      return this._rectHitsRect(x, topY, feetY, halfW, b.left, b.top, b.right, b.bottom);
    }
    return this._rectHitsCircle(x, topY, feetY, halfW, this.btnCX, this.btnCY, BTN_RADIUS);
  }

  /**
   * @param {number} x
   * @param {number} top
   * @param {number} bottom
   * @param {number} halfW
   * @param {number} left
   * @param {number} boxTop
   * @param {number} right
   * @param {number} boxBottom
   */
  _rectHitsRect(x, top, bottom, halfW, left, boxTop, right, boxBottom) {
    if (![x, top, bottom, halfW, left, boxTop, right, boxBottom].every(Number.isFinite)) return false;
    const l = x - halfW;
    const r = x + halfW;
    const t = Math.min(top, bottom);
    const b = Math.max(top, bottom);
    return r >= left && l <= right && b >= boxTop && t <= boxBottom;
  }

  _hitButton(x, y) {
    if (this._kitButton && this.button?.getBounds) {
      const b = this.button.getBounds();
      return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    }
    return pointInCircle(x, y, this.btnCX, this.btnCY, BTN_RADIUS);
  }

  /**
   * @param {number} x
   * @param {number} top
   * @param {number} bottom
   * @param {number} halfW
   * @param {number} cx
   * @param {number} cy
   * @param {number} r
   */
  _rectHitsCircle(x, top, bottom, halfW, cx, cy, r) {
    if (![x, top, bottom, halfW, cx, cy, r].every(Number.isFinite)) return false;
    const nx = Math.max(x - halfW, Math.min(cx, x + halfW));
    const ny = Math.max(Math.min(top, bottom), Math.min(Math.max(top, bottom), cy));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy <= r * r;
  }

  _joyRestAlpha() {
    if (this._joyFade) return COMBAT_ALPHA;
    return this._kitJoy ? 0.94 : IDLE_ALPHA;
  }

  _swapRestAlpha() {
    if (this._swapFade) return COMBAT_ALPHA;
    return this._kitButton ? 0.94 : IDLE_ALPHA;
  }

  _createObjects() {
    const scene = this.scene;
    const depth = CONTROL_DEPTH;

    this._kitJoy = !!(
      scene.textures?.exists?.(UI.joystickBase) &&
      scene.textures?.exists?.(UI.joystickKnob) &&
      scene.textures?.exists?.(UI.joystickKnobPressed)
    );
    if (this._kitJoy) {
      this.base = scene.add
        .image(0, 0, UI.joystickBase)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(depth);
      this.thumb = scene.add
        .image(0, 0, UI.joystickKnob)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(depth + 2);
    } else {
      this.base = scene.add
        .circle(0, 0, JOY_RADIUS, 0x0d1520, 0.72)
        .setStrokeStyle(3, 0xc5d0dc, 0.9)
        .setScrollFactor(0)
        .setDepth(depth);
      this.thumb = scene.add
        .circle(0, 0, THUMB_RADIUS, 0xe8eef5, 0.95)
        .setScrollFactor(0)
        .setDepth(depth + 2);
    }

    this.ticks = scene.add.graphics().setScrollFactor(0).setDepth(depth + 1);
    if (this._kitJoy) this.ticks.setVisible(false);

    this._kitButton = !!scene.textures?.exists?.(UI.button);
    if (this._kitButton) {
      this.button = scene.add
        .image(0, 0, UI.button)
        .setOrigin(0.5)
        .setScale(2)
        .setScrollFactor(0)
        .setDepth(depth);
    } else {
      this.button = scene.add
        .circle(0, 0, BTN_RADIUS, 0x1b2836, 0.82)
        .setStrokeStyle(3, 0x90caf9, 0.95)
        .setScrollFactor(0)
        .setDepth(depth);
    }

    this.buttonLabel = addKitText(scene, 0, 0, 'SWAP', {
      font: FONT_INK,
      size: 16,
      tint: INK_TINT,
      color: '#e8eef5',
      depth: depth + 2,
      scrollFactor: 0,
    });

    this._setIdleAlpha();
  }

  _layout() {
    if (this._destroyed) return;
    const insets = edgeInsets(this.scene);
    const viewW = this.scene.scale?.width || GAME_WIDTH;
    const viewH = this.scene.scale?.height || GAME_HEIGHT;
    this.joyCX = insets.left + JOY_RADIUS;
    this.joyCY = viewH - insets.bottom - JOY_RADIUS;
    if (this._kitButton) {
      const halfW = this.button.displayWidth / 2;
      const halfH = this.button.displayHeight / 2;
      this.btnCX = viewW - insets.right - halfW;
      this.btnCY = viewH - insets.bottom - halfH;
    } else {
      this.btnCX = viewW - insets.right - BTN_RADIUS;
      this.btnCY = viewH - insets.bottom - BTN_RADIUS;
    }
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
    if (this._kitJoy) {
      this.ticks?.clear();
      return;
    }
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
    // Banner dismiss and ground clicks must not start a stick or a move.
    if (this.scene?.movementLocked?.()) return;
    const x = pointer.x;
    const y = pointer.y;
    if (this._weaponPointerId == null && this._hitButton(x, y)) {
      this._weaponPointerId = pointer.id;
      this._weaponArmed = true;
      this.weaponHeld = true;
      this._weaponPulse = true;
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
    if (this.scene?.movementLocked?.()) {
      if (this._joyPointerId != null) this._resetStick();
      this._weaponPointerId = null;
      this._weaponArmed = false;
      this.weaponHeld = false;
      this._setButtonPressed(false);
      return;
    }
    if (pointer.id === this._joyPointerId) {
      this._applyStick(pointer);
      return;
    }
    if (pointer.id !== this._weaponPointerId) return;
    const inside = this._hitButton(pointer.x, pointer.y);
    this._weaponArmed = inside;
    this._setButtonPressed(inside);
  }

  /**
   * SWAP stays down until the finger lifts, including a slide off the
   * button, so a charge is not cancelled by a small drift. `onWeapon`
   * still fires only for a release that ends on the button.
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
      this._hitButton(pointer.x, pointer.y);
    this._weaponPointerId = null;
    this._weaponArmed = false;
    this.weaponHeld = false;
    this._setButtonPressed(false);
    if (stillOnButton) this.onWeapon?.();
  }

  _applyStick(pointer) {
    const axes = stickAxes(pointer.x - this.joyCX, pointer.y - this.joyCY);
    this.dx = axes.dx;
    this.dy = axes.dy;
    // Kit knob slides inside the stone ring. Axes still use the full hit radius.
    const travel = this._kitJoy ? KIT_KNOB_TRAVEL / JOY_RADIUS : 1;
    this.thumb.setPosition(
      this.joyCX + axes.thumbX * travel,
      this.joyCY + axes.thumbY * travel
    );
  }

  _resetStick() {
    this.dx = 0;
    this.dy = 0;
    this.thumb.setPosition(this.joyCX, this.joyCY);
    this._setJoyActive(false);
  }

  _setIdleAlpha() {
    this._setJoyActive(false);
    this._setButtonPressed(false);
  }

  _setJoyActive(active) {
    const a = active ? ACTIVE_ALPHA : this._joyRestAlpha();
    this.base.setAlpha(a);
    this.ticks.setAlpha(this._kitJoy ? 0 : a);
    if (this._kitJoy) {
      const key = active ? UI.joystickKnobPressed : UI.joystickKnob;
      if (this.thumb.texture?.key !== key && this.scene.textures?.exists?.(key)) {
        this.thumb.setTexture(key);
      }
    }
    this.thumb.setAlpha(active ? 1 : a);
  }

  _setButtonPressed(pressed) {
    if (this._kitButton) {
      if (pressed) this.button.setTint(0xffe3a4);
      else this.button.clearTint();
    } else {
      this.button.setFillStyle(pressed ? 0x1565c0 : 0x1b2836, pressed ? 0.95 : 0.82);
    }
    const a = pressed ? 1 : this._swapRestAlpha();
    this.button.setAlpha(a);
    this.buttonLabel.setAlpha(a);
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
