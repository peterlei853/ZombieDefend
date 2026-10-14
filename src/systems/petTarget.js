import { GAME_CONFIG } from '../data/GameConfig.js';
import { barricadeXAtY, grassYMax, grassYMin, layoutPx } from './DepthView.js';

/**
 * Pet target pick for v0.29.
 * Pressure sends every pet to the zombies nearest the fence.
 * Otherwise each pet prefers a lane 10–20% off the hero's west shot ray,
 * then a tier bias: T1 the healthier crowd, T2 a wounded finisher, T3 the breach.
 * Gold, shop, and the barricade halt do not read this.
 */

/** @param {{ x?: number, y?: number }} zombie */
export function threatGap(zombie) {
  return barricadeXAtY(zombie.y) - zombie.x;
}

/**
 * @param {Array<{ alive?: boolean, body?: object, x?: number, y?: number }>|null|undefined} zombies
 */
function living(zombies) {
  const list = Array.isArray(zombies) ? zombies : [];
  const out = [];
  for (const z of list) {
    if (!z?.alive || !z.body) continue;
    if (!Number.isFinite(z.x) || !Number.isFinite(z.y)) continue;
    out.push(z);
  }
  return out;
}

/**
 * True when enough living zombies are already on the posts.
 * @param {Array<{ alive?: boolean, body?: object, x: number, y: number }>|null|undefined} zombies
 */
export function barricadePressureHigh(zombies) {
  const pets = GAME_CONFIG.PETS;
  const gapLimit = layoutPx(pets.PRESSURE_GAP);
  let n = 0;
  for (const z of living(zombies)) {
    if (threatGap(z) <= gapLimit) n += 1;
  }
  return n >= pets.PRESSURE_COUNT;
}

/**
 * @param {Array<{ alive?: boolean, body?: object, x: number, y: number }>} list
 * @param {Set<object>|null} claimed
 */
function nearestWall(list, claimed) {
  const sorted = list.slice().sort((a, b) => threatGap(a) - threatGap(b));
  if (claimed && claimed.size) {
    const free = sorted.find((z) => !claimed.has(z));
    if (free) return free;
  }
  return sorted[0] || null;
}

/**
 * @param {{ x: number, y: number, hp?: number, maxHp?: number }} zombie
 * @param {{ heroY: number, prefer: number, span: number, tier: number }} ctx
 */
function scoreThreat(zombie, ctx) {
  const pets = GAME_CONFIG.PETS;
  const dy = Math.abs(zombie.y - ctx.heroY) / ctx.span;
  let score = 0;
  if (dy >= pets.RAY_OFFSET_MIN && dy <= pets.RAY_OFFSET_MAX) score += 120;
  else if (dy < pets.RAY_OFFSET_MIN) score -= 50;
  else score += 30;
  score -= (Math.abs(zombie.y - ctx.prefer) / ctx.span) * 40;
  const hpRatio = zombie.maxHp > 0 ? Math.max(0, (zombie.hp ?? zombie.maxHp) / zombie.maxHp) : 1;
  const gap = threatGap(zombie);
  if (ctx.tier >= 3) score += 80 - gap / layoutPx(12);
  else if (ctx.tier === 2) score += (1 - hpRatio) * 55;
  else score += hpRatio * 35;
  score += Math.max(0, 16 - gap / layoutPx(40));
  return score;
}

/**
 * @param {Array<{ alive?: boolean, body?: object, x: number, y: number, hp?: number, maxHp?: number }>|null|undefined} zombies
 * @param {{ heroY?: number|null, tier?: number, slot?: number, claimed?: Set<object>|null, pressure?: boolean|null }} [opts]
 */
export function pickPetCombatTarget(zombies, opts = {}) {
  const list = living(zombies);
  if (!list.length) return null;
  const claimed = opts.claimed instanceof Set ? opts.claimed : null;
  const pressure = opts.pressure == null ? barricadePressureHigh(list) : !!opts.pressure;
  const heroY = opts.heroY;
  if (pressure || !Number.isFinite(heroY)) return nearestWall(list, claimed);
  const span = Math.max(1, grassYMax() - grassYMin());
  const sign = (Math.abs(opts.slot | 0) % 2 === 0) ? -1 : 1;
  const prefer = heroY + sign * span * GAME_CONFIG.PETS.RAY_OFFSET;
  const tier = Number.isFinite(opts.tier) ? opts.tier : 1;
  let best = null;
  let bestScore = -Infinity;
  for (const z of list) {
    if (claimed?.has(z)) continue;
    const score = scoreThreat(z, { heroY, prefer, span, tier });
    if (score > bestScore) {
      bestScore = score;
      best = z;
    }
  }
  return best || nearestWall(list, null);
}
