import { GAME_CONFIG } from '../data/GameConfig.js';
import { grassYMax, grassYMin, layoutPx } from './DepthView.js';

/**
 * Occupied footprints for zombies and pets.
 *
 * Phaser is started without Arcade physics (see src/main.js). Bodies are
 * moved by the march and the pet stepper, then this pass pushes overlaps
 * apart. Enabling Arcade now would fight that stepper and the barricade
 * halt, so the separator stays a post-step push. Barricade HP is not read.
 *
 * Sprites are feet-origin. A circle at the soles ignores the body above
 * them, so a pet can stand on a zombie's chest. Boxes use the full display
 * height. A pet is dropped below the head and torso (the upper 64% of the
 * zombie) instead of sharing that column. Same-kind pairs separate on the
 * full box. A hurt-locked body reports shift() === false and stays planted;
 * the other body takes the full push.
 */

/**
 * Share of the zombie sprite, measured from the crown, that pets must not
 * cover. 0.72 leaves the transparent foot padding plus the legs, and keeps
 * the stand inside the melee lane. A circle at the soles was letting the
 * pet sit on the chest.
 */
export const TORSO_FROM_TOP = 0.72;

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

/** Furthest a pet's feet may sit below a zombie's feet and still melee. */
export function meleeLaneCap() {
  return layoutPx(GAME_CONFIG.PETS.MELEE.Y_HALF) - layoutPx(2);
}

/**
 * How far below a zombie's feet a pet's feet must sit so the pet sprite
 * stays under the head and torso. `maxDrop` caps the lane so melee still
 * reaches (canvas px). Defaults to the melee lane. The uncapped drop is
 * returned when maxDrop is 0.
 * @param {number} petHeight
 * @param {number} zombieHeight
 * @param {number} [maxDrop]
 */
export function petLaneDrop(petHeight, zombieHeight, maxDrop = meleeLaneCap()) {
  const petH = Math.max(layoutPx(28), Number(petHeight) || 0);
  const zH = Math.max(layoutPx(48), Number(zombieHeight) || 0);
  const hipsFromFeet = zH * (1 - TORSO_FROM_TOP);
  const drop = Math.max(layoutPx(18), petH - hipsFromFeet + layoutPx(8));
  if (Number(maxDrop) > 0) return Math.min(maxDrop, drop);
  return drop;
}

/**
 * @param {{ footprintWidth?: () => number, footprintHeight?: () => number, displayWidth?: number, displayHeight?: number }} body
 */
function spriteSpan(body) {
  const wRaw = typeof body.footprintWidth === 'function' ? body.footprintWidth() : body.displayWidth;
  const hRaw = typeof body.footprintHeight === 'function' ? body.footprintHeight() : body.displayHeight;
  const w = Number(wRaw);
  const width = w > 8 ? w : layoutPx(28);
  let height = Number(hRaw);
  if (!(height > 8)) height = width;
  return { w: width, h: height };
}

/**
 * Feet-origin display box.
 * @param {{ x: number, y: number }} body
 */
function spriteBox(body) {
  const { w, h } = spriteSpan(body);
  return {
    l: body.x - w / 2,
    r: body.x + w / 2,
    t: body.y - h,
    b: body.y,
    w,
    h,
  };
}

/**
 * Head and torso: the upper TORSO_FROM_TOP of the sprite, plus a pad.
 * Legs below that line may share a column with a pet.
 * @param {{ x: number, y: number }} zombie
 * @param {number} pad
 */
function upperBody(zombie, pad) {
  const box = spriteBox(zombie);
  const torsoH = box.h * TORSO_FROM_TOP;
  return {
    l: box.l - pad,
    r: box.r + pad,
    t: box.t - pad,
    b: box.t + torsoH + pad,
  };
}

/**
 * @param {{ x: number, y: number, shift: (dx: number, dy: number) => boolean|void }} body
 * @param {number} dx
 * @param {number} dy
 */
function nudge(body, dx, dy) {
  return body.shift(dx, dy) !== false;
}

/**
 * @param {{ x: number, y: number, shift: (dx: number, dy: number) => boolean|void }} a
 * @param {{ x: number, y: number, shift: (dx: number, dy: number) => boolean|void }} b
 */
function pushAabb(a, b) {
  const pad = layoutPx(4);
  const A = spriteBox(a);
  const B = spriteBox(b);
  const overlapX = Math.min(A.r, B.r) - Math.max(A.l, B.l) + pad;
  const overlapY = Math.min(A.b, B.b) - Math.max(A.t, B.t) + pad;
  if (overlapX <= 0 || overlapY <= 0) return;
  if (overlapX <= overlapY) {
    const dir = b.x >= a.x ? 1 : -1;
    const half = overlapX / 2;
    const movedA = nudge(a, -dir * half, 0);
    const movedB = nudge(b, dir * half, 0);
    if (movedA && !movedB) nudge(a, -dir * half, 0);
    else if (movedB && !movedA) nudge(b, dir * half, 0);
    return;
  }
  const dir = b.y >= a.y ? 1 : -1;
  const half = overlapY / 2;
  const movedA = nudge(a, 0, -dir * half);
  const movedB = nudge(b, 0, dir * half);
  if (movedA && !movedB) nudge(a, 0, -dir * half);
  else if (movedB && !movedA) nudge(b, 0, dir * half);
}

/**
 * Drop the pet below the zombie's head and torso when the two are on the
 * same lane. A pet crossing the field toward its stand is left alone, so
 * a far torso cannot pin it to the grass edge. If the grass refuses the
 * drop, slide out on the shorter side instead of throwing the pet across
 * the whole sprite.
 * @param {{ x: number, y: number, kind?: string, shift: (dx: number, dy: number) => boolean|void }} pet
 * @param {{ x: number, y: number, shift: (dx: number, dy: number) => boolean|void }} zombie
 */
function pushPetOffTorso(pet, zombie) {
  if (Math.abs(pet.y - zombie.y) > layoutPx(40)) return;
  // No extra pad here. The stand already sits layoutPx(8) below the torso,
  // and a pad on this test was shoving the pet sideways out of melee.
  const petBox = spriteBox(pet);
  const upper = upperBody(zombie, 0);
  const overlapX = Math.min(petBox.r, upper.r) - Math.max(petBox.l, upper.l);
  const overlapY = Math.min(petBox.b, upper.b) - Math.max(petBox.t, upper.t);
  if (overlapX <= 0 || overlapY <= 0) return;
  const room = zombie.y + meleeLaneCap() - pet.y;
  const drop = Math.min(upper.b - petBox.t, room);
  if (drop > 0.5 && nudge(pet, 0, drop)) return;
  // Feet are already on the melee lane. A sideways slide parks the body
  // past MELEE.RANGE, so the basic swing never starts and the attack
  // strip stays on idle. The stand may share the legs.
  if (!(room > 0.5)) return;
  const exitRight = upper.r - petBox.l;
  const exitLeft = petBox.r - upper.l;
  if (exitLeft <= exitRight) {
    if (exitLeft > 0.5 && !nudge(pet, -exitLeft, 0)) nudge(zombie, exitLeft, 0);
    return;
  }
  if (exitRight > 0.5 && !nudge(pet, exitRight, 0)) nudge(zombie, -exitRight, 0);
}

/**
 * @param {{ x: number, y: number, kind?: string, shift: (dx: number, dy: number) => void }} a
 * @param {{ x: number, y: number, kind?: string, shift: (dx: number, dy: number) => void }} b
 */
function pushApart(a, b) {
  const aPet = a.kind === 'pet';
  const bPet = b.kind === 'pet';
  if (aPet !== bPet) {
    pushPetOffTorso(aPet ? a : b, aPet ? b : a);
    return;
  }
  pushAabb(a, b);
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
