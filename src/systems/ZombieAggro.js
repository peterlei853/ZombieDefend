import { layoutPx } from './DepthView.js';
import { nearestFieldPet } from './petAggro.js';

/**
 * Field px. Zombies only peel off the barricade march for an on-field pet
 * inside this band (72–96). Farther pets are ignored.
 */
export const NEAR_R = 84;

/**
 * Living on-field pet within NEAR_R, or null so the zombie keeps marching.
 * Bite DPS stays on the existing overlap check inside Zombie.
 * @param {{ x?: number, y?: number, body?: { x?: number, y?: number } }|null|undefined} zombie
 * @param {Array<{ x: number, y: number, hp?: number, alive?: boolean }>|null|undefined} fieldPets
 */
export function pickPetTarget(zombie, fieldPets) {
  const pet = nearestFieldPet(zombie, fieldPets);
  if (!pet || !zombie) return null;
  const zx = Number.isFinite(zombie.x) ? zombie.x : zombie.body?.x;
  const zy = Number.isFinite(zombie.y) ? zombie.y : zombie.body?.y;
  if (!Number.isFinite(zx) || !Number.isFinite(zy)) return null;
  if (!Number.isFinite(pet.x) || !Number.isFinite(pet.y)) return null;
  const dist = Math.hypot(pet.x - zx, pet.y - zy);
  if (dist > layoutPx(NEAR_R)) return null;
  return pet;
}
