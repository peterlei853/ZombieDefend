/**
 * Opening PetSelect roster. Four catalog pets, pick one.
 * Ids match PET_LINEUP. Heads and baby idles already exist.
 * No new art is named here.
 *
 * PIXELLAB_HOOK: each card draws the catalog head already in pets/pet-ui-hud.
 *   ui-pet-phoenix-head, ui-pet-panda-head, ui-pet-lion-head, ui-pet-dragon-head.
 * The Stage combat sprite for the pick is that pet's baby idle:
 *   pet-phoenix-baby-idle, pet-panda-baby-idle, pet-lion-baby-idle, pet-dragon-baby-idle.
 */
export const PET_SELECT_ROSTER = [
  {
    id: 'phoenix',
    label: 'BLUE PHOENIX',
    labelZh: '藍羽',
    headKey: 'ui-pet-phoenix-head',
    spriteKey: 'pet-phoenix-baby-idle',
    swatch: 0x4fc3f7,
  },
  {
    id: 'panda',
    label: 'BLACK PANDA',
    labelZh: '墨墨',
    headKey: 'ui-pet-panda-head',
    spriteKey: 'pet-panda-baby-idle',
    swatch: 0x2b2b2b,
  },
  {
    id: 'lion',
    label: 'YELLOW LION',
    labelZh: '雷歐',
    headKey: 'ui-pet-lion-head',
    spriteKey: 'pet-lion-baby-idle',
    swatch: 0xffee58,
  },
  {
    id: 'dragon',
    label: 'GREEN DRAGON',
    labelZh: '翠火',
    headKey: 'ui-pet-dragon-head',
    spriteKey: 'pet-dragon-baby-idle',
    swatch: 0x66bb6a,
  },
];

/** @param {unknown} id */
export function isOpeningPetId(id) {
  return typeof id === 'string' && PET_SELECT_ROSTER.some((pet) => pet.id === id);
}

/** @param {unknown} id */
export function petSelectById(id) {
  if (!isOpeningPetId(id)) return null;
  return PET_SELECT_ROSTER.find((pet) => pet.id === id) ?? null;
}

/** Baby idle catalog key for Stage combat sprites. @param {unknown} id */
export function spriteKeyForPet(id) {
  return petSelectById(id)?.spriteKey ?? null;
}
