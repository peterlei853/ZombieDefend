/**
 * v0.36.27 vocal and pet-UI keys. Files live at assets/audio/<key>.mp3.
 * Sound Effect owns the binaries. This module is the hook map.
 *
 * Growl clips are about 2.2s. Death clips are about 1.15s.
 * Each living zombie growls about every 10s, picking a|b for its type.
 * Each kill picks death a|b for that type.
 *
 * Pet / UI (files may already be present; playback no-ops if a key is missing):
 *   sfx-pet-basic-attack  ~0.55s  pet normal attack
 *   sfx-ui-pet-go         ~0.38s  GO!  recalled → sent
 *   sfx-ui-pet-back       ~0.38s  Back! sent → recalled
 *
 * Profession vocals (office, chef, delivery, nurse):
 *   sfx-<slug>-growl-a / sfx-<slug>-growl-b
 *   sfx-<slug>-death-a / sfx-<slug>-death-b
 * Later professions append a slug here. They do not get a second catalog.
 */

/** How often one living zombie may growl. */
export const VOCAL_GROWL_INTERVAL_MS = 10000;

/** @type {Record<string, string>} catalog skin id → clip slug */
export const PROFESSION_VOCAL_SLUGS = {
  'office-worker-v2': 'office',
  office: 'office',
  chef: 'chef',
  delivery: 'delivery',
  nurse: 'nurse',
};

export const VOCAL_SLUGS = ['office', 'chef', 'delivery', 'nurse'];
export const VOCAL_KINDS = ['growl', 'death'];
export const VOCAL_VARIANTS = ['a', 'b'];

export const PET_UI_SFX = Object.freeze({
  basicAttack: 'sfx-pet-basic-attack',
  go: 'sfx-ui-pet-go',
  back: 'sfx-ui-pet-back',
});

/**
 * @param {string|null|undefined} skinId
 * @returns {string|null}
 */
export function professionVocalSlug(skinId) {
  if (!skinId) return null;
  return PROFESSION_VOCAL_SLUGS[skinId] || null;
}

/** S4 vocal slugs. Bare `delivery` stays the profession, not this set. */
export const S4_VOCAL_SLUGS = Object.freeze(['construction', 'schoolgirl', 'delivery', 'salaryman']);

/**
 * Skin id → S4 vocal slug. `s4-delivery` and `zombie-s4-delivery` match.
 * The live profession id `delivery` does not.
 * @param {string|null|undefined} skinId
 * @returns {string|null}
 */
export function s4VocalSlug(skinId) {
  if (!skinId || skinId === 'delivery') return null;
  if (S4_VOCAL_SLUGS.includes(skinId)) return skinId;
  for (const prefix of ['zombie-s4-', 's4-']) {
    if (!skinId.startsWith(prefix)) continue;
    const slug = skinId.slice(prefix.length);
    if (S4_VOCAL_SLUGS.includes(slug)) return slug;
  }
  return null;
}

/**
 * @param {string|null|undefined} skinId
 * @param {'growl'|'hit'|'hurt'|'death'} kind
 * @returns {string|null}
 */
export function s4VocalKey(skinId, kind) {
  const slug = s4VocalSlug(skinId);
  if (!slug) return null;
  if (kind !== 'growl' && kind !== 'hit' && kind !== 'hurt' && kind !== 'death') return null;
  return `sfx-zombie-s4-${slug}-${kind}`;
}

/**
 * @param {string} slug
 * @param {'growl'|'death'} kind
 * @param {'a'|'b'} variant
 */
export function vocalClipKey(slug, kind, variant) {
  return `sfx-${slug}-${kind}-${variant}`;
}

/** Every profession growl / death key, stable order. */
export function vocalClipKeys() {
  /** @type {string[]} */
  const keys = [];
  for (const slug of VOCAL_SLUGS) {
    for (const kind of VOCAL_KINDS) {
      for (const variant of VOCAL_VARIANTS) keys.push(vocalClipKey(slug, kind, variant));
    }
  }
  return keys;
}

/** Profession vocals plus the three pet/UI gap-fill keys. */
export function gameplaySfxClips() {
  const vocal = vocalClipKeys().map((key) => ({ key, url: `assets/audio/${key}.mp3` }));
  const ui = [PET_UI_SFX.basicAttack, PET_UI_SFX.go, PET_UI_SFX.back].map((key) => ({
    key,
    url: `assets/audio/${key}.mp3`,
  }));
  return vocal.concat(ui);
}

/**
 * @param {() => number} [rng]
 * @returns {'a'|'b'}
 */
export function pickVocalVariant(rng = Math.random) {
  return rng() < 0.5 ? 'a' : 'b';
}
