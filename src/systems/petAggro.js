/**
 * Zombies prefer a living summoned pet they can reach without crossing
 * the barricade. The fence halt itself stays in Barricade / Zombie.
 */

/**
 * Living field pet closest to `origin`, or null.
 * @param {{ x?: number, y?: number }|null|undefined} origin
 * @param {Array<{ x: number, y: number, hp?: number, alive?: boolean }>|null|undefined} pets
 */
export function nearestFieldPet(origin, pets) {
  const ox = origin?.x;
  const oy = origin?.y;
  if (!Number.isFinite(ox) || !Number.isFinite(oy)) return null;
  let best = null;
  let bestD = Infinity;
  const list = Array.isArray(pets) ? pets : [];
  for (const pet of list) {
    if (!pet || pet.alive === false || !(pet.hp > 0)) continue;
    if (!Number.isFinite(pet.x) || !Number.isFinite(pet.y)) continue;
    const dist = Math.hypot(pet.x - ox, pet.y - oy);
    if (dist < bestD) {
      bestD = dist;
      best = pet;
    }
  }
  return best;
}

/**
 * True when the pet stands on the march side of the barricade halt,
 * close enough that a zombie stopped on the posts could still bite it.
 * Pets further into the safe zone are not a chase target; the zombie
 * keeps the existing barricade march.
 * @param {{ x?: number, hp?: number, alive?: boolean }|null|undefined} pet
 * @param {number} haltX
 * @param {number} biteReach
 */
export function petReachableBeforeFence(pet, haltX, biteReach) {
  if (!pet || pet.alive === false || !(pet.hp > 0)) return false;
  if (!Number.isFinite(pet.x) || !Number.isFinite(haltX)) return false;
  const reach = Number.isFinite(biteReach) ? biteReach : 0;
  return pet.x <= haltX + reach;
}
