/**
 * Gold reward from a zombie based on its *initial* max HP.
 *
 * Table:
 *   HP < 100            → 10
 *   100 ≤ HP < 150      → 15
 *   150 ≤ HP < 200      → 20
 *   200 ≤ HP < 250      → 25
 *   250 ≤ HP < 300      → 30
 *   HP ≥ 300            → 50
 */
export function getGoldByHP(hp) {
  if (hp < 100) return 10;
  if (hp < 150) return 15;
  if (hp < 200) return 20;
  if (hp < 250) return 25;
  if (hp < 300) return 30;
  return 50;
}
