import { grassYMax, grassYMin, layoutPx } from './DepthView.js';

/**
 * Occupied footprints for zombies and pets.
 *
 * Phaser is started without Arcade physics (see src/main.js). Bodies are
 * moved by the march and the pet stepper, then this pass pushes overlaps
 * apart. Enabling Arcade now would fight that stepper and the barricade
 * halt, so the separator stays a post-step push. Barricade HP is not read.
 *
 * Radius is half the display box plus a small pad, so pet and zombie
 * sprites do not sit inside each other. Spawn code also staggers X.
 * A hurt-locked body reports shift() === false and stays planted; the
 * other body takes the full push.
 */

/** Cell (or display, if the cell is unknown) under this box cannot march while hurt. */
export const HURT_LOCK_CELL = 100;

/**
 * Authored cell when the texture frame is loaded. Profession rule sheets
 * are 84×84. Brute's body cell is 96×96. Both are under 100, so both lock.
 * A 128px boss cell does not.
 * @param {{ body?: { frame?: { width?: number, realWidth?: number, height?: number, realHeight?: number }, displayWidth?: number, displayHeight?: number }, skin?: { id?: string, ruleAnims?: object|null } }|null|undefined} monster
 * @returns {{ w: number, h: number }|null}
 */
export function monsterCellSize(monster) {
  // Authored cell wins over the current frame. A hurt strip is 84×N
  // on the sheet; reading that sheet width would skip the lock and
  // leave the ×0.5 march, which still creeps during the flash.
  if (monster?.skin?.ruleAnims) return { w: 84, h: 84 };
  if (monster?.skin?.id === 'brute') return { w: 96, h: 96 };
  const frame = monster?.body?.frame;
  const fw = Number(frame?.realWidth || frame?.width);
  const fh = Number(frame?.realHeight || frame?.height);
  if (fw > 0 && fh > 0 && fw < 200 && fh < 200) return { w: fw, h: fh };
  const dw = Math.abs(Number(monster?.body?.displayWidth) || 0);
  const dh = Math.abs(Number(monster?.body?.displayHeight) || 0);
  if (dw > 0 && dh > 0) return { w: dw, h: dh };
  return null;
}

/**
 * True when this monster's cell (or display box) is under 100×100.
 * 84×84 profession zombies qualify. Hurt march then drops to 0.
 * @param {Parameters<typeof monsterCellSize>[0]} monster
 */
export function smallHurtLocksMove(monster) {
  const cell = monsterCellSize(monster);
  if (!cell) return false;
  return cell.w < HURT_LOCK_CELL && cell.h < HURT_LOCK_CELL;
}

/**
 * @param {number} displayWidth
 * @param {number} [fallback]
 */
export function footprintRadius(displayWidth, fallback = 0) {
  const w = Number(displayWidth);
  const pad = layoutPx(4);
  if (w > 8) return w * 0.5 + pad;
  const fb = Number(fallback);
  return Math.max(layoutPx(18), (fb > 0 ? fb : layoutPx(28)) * 0.5 + pad);
}

/**
 * @param {{ x: number, y: number, shift: (dx: number, dy: number) => void, displayWidth?: number, footprintWidth?: () => number, radius?: number }} a
 * @param {{ x: number, y: number, shift: (dx: number, dy: number) => void, displayWidth?: number, footprintWidth?: () => number, radius?: number }} b
 */
function pushApart(a, b) {
  const aw = typeof a.footprintWidth === 'function' ? a.footprintWidth() : a.displayWidth;
  const bw = typeof b.footprintWidth === 'function' ? b.footprintWidth() : b.displayWidth;
  const ra = Number.isFinite(a.radius) ? a.radius : footprintRadius(aw || 0);
  const rb = Number.isFinite(b.radius) ? b.radius : footprintRadius(bw || 0);
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const min = ra + rb;
  let dist = Math.hypot(dx, dy);
  if (dist >= min - 0.01) return;
  if (dist < 0.01) {
    dx = 1;
    dy = 0.25;
    dist = Math.hypot(dx, dy);
  }
  const push = (min - dist) / 2;
  const nx = dx / dist;
  const ny = dy / dist;
  const movedA = a.shift(-nx * push, -ny * push) !== false;
  const movedB = b.shift(nx * push, ny * push) !== false;
  if (movedA && !movedB) a.shift(-nx * push, -ny * push);
  else if (movedB && !movedA) b.shift(nx * push, ny * push);
}

/**
 * @param {Array<{ x: number, y: number, shift?: (dx: number, dy: number) => void }>|null|undefined} bodies
 * @param {{ rounds?: number, clamp?: (body: object) => void }} [opts]
 */
export function separateFootprints(bodies, opts = {}) {
  const items = (Array.isArray(bodies) ? bodies : []).filter(
    (body) => body && Number.isFinite(body.x) && Number.isFinite(body.y) && typeof body.shift === 'function'
  );
  const rounds = opts.rounds > 0 ? opts.rounds : 6;
  for (let n = 0; n < rounds; n += 1) {
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) pushApart(items[i], items[j]);
    }
  }
  if (typeof opts.clamp === 'function') {
    for (const body of items) opts.clamp(body);
  }
  return items.length;
}

/** Keep a pet sole on the grass after a push. */
export function clampPetFoot(y) {
  return Math.min(grassYMax(), Math.max(grassYMin(), y));
}
