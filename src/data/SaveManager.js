/**
 * Account progress for the opening pet.
 *
 * localStorage key: `zombieDefend.save.v1` (SAVE_STORAGE_KEY).
 * One profile per user id. The gold field stays `gold` and this module
 * does not spend, grant, or rewrite it. There is no barricade HP key.
 * The only field this module writes is `selectedPetId`.
 *
 * Gameplay reads the pick with `save.selectedPetId`, `getSelectedPetId()`,
 * or `readSelectedPetId(registry)`. The baby idle strip is
 * `getSelectedPetSpriteKey()`.
 */
import { MockDB } from './MockDB.js';
import { isOpeningPetId, petSelectById, spriteKeyForPet } from './petSelectRoster.js';

/** localStorage document. Reported to Gameplay as the SaveManager key. */
export const SAVE_STORAGE_KEY = 'zombieDefend.save.v1';

/**
 * @param {Storage|null|undefined} storage
 */
function memoryStorage(storage) {
  const bag = new Map();
  return {
    getItem(key) {
      return bag.has(key) ? bag.get(key) : null;
    },
    setItem(key, value) {
      bag.set(key, String(value));
    },
  };
}

/**
 * @param {Storage|null|undefined} storage
 */
function resolveStorage(storage) {
  if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
    return storage;
  }
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch (_) {
    /* private mode or a non-browser test */
  }
  return memoryStorage();
}

function emptyProfile() {
  return {
    characterId: 'default',
    stage: 1,
    gold: 0,
    shopItems: [],
    selectedPetId: null,
    updatedAt: 0,
  };
}

/**
 * @param {unknown} raw
 */
function normalizeProfile(raw) {
  const base = emptyProfile();
  if (!raw || typeof raw !== 'object') return base;
  const row = /** @type {Record<string, unknown>} */ (raw);
  if (typeof row.characterId === 'string' && row.characterId) base.characterId = row.characterId;
  const stage = Number(row.stage);
  if (Number.isFinite(stage) && stage >= 1) base.stage = Math.floor(stage);
  const gold = Number(row.gold);
  if (Number.isFinite(gold) && gold >= 0) base.gold = gold;
  if (Array.isArray(row.shopItems)) {
    base.shopItems = row.shopItems.filter((item) => typeof item === 'string');
  }
  base.selectedPetId = isOpeningPetId(row.selectedPetId) ? row.selectedPetId : null;
  const updated = Number(row.updatedAt);
  if (Number.isFinite(updated)) base.updatedAt = updated;
  return base;
}

export class SaveManager {
  /**
   * @param {Storage|null} [storage]
   */
  constructor(storage) {
    this._storage = resolveStorage(storage);
    /** @type {string|null} */
    this._userId = null;
  }

  /** Active profile user, or null before bind. */
  get userId() {
    return this._userId;
  }

  /**
   * Chosen opening pet, or null when the player has not picked.
   * @returns {string|null}
   */
  get selectedPetId() {
    return this.getSelectedPetId();
  }

  /**
   * Attach the account. Copies an existing MockDB row into a new profile
   * once. A later bind does not rewrite `gold`.
   * @param {string} userId
   */
  bind(userId) {
    const id = typeof userId === 'string' && userId ? userId : 'playtest-user';
    this._userId = id;
    const doc = this._read();
    doc.activeUserId = id;
    if (!doc.profiles[id]) {
      const seeded = emptyProfile();
      const account = this._account(id);
      if (account) {
        seeded.characterId = account.characterId || seeded.characterId;
        seeded.stage = account.stage || seeded.stage;
        if (Number.isFinite(account.gold)) seeded.gold = account.gold;
        if (Array.isArray(account.shopItems)) seeded.shopItems = account.shopItems.slice();
        if (isOpeningPetId(account.selectedPetId)) seeded.selectedPetId = account.selectedPetId;
      }
      seeded.updatedAt = Date.now();
      doc.profiles[id] = seeded;
      this._write(doc);
    } else if (!doc.profiles[id].selectedPetId) {
      const account = this._account(id);
      if (isOpeningPetId(account?.selectedPetId)) {
        doc.profiles[id].selectedPetId = account.selectedPetId;
        this._write(doc);
      }
    }
    return this;
  }

  /**
   * @returns {string|null}
   */
  getSelectedPetId() {
    const profile = this._profile();
    return profile?.selectedPetId ?? null;
  }

  /**
   * Baby idle catalog key for the chosen pet, or null.
   * @returns {string|null}
   */
  getSelectedPetSpriteKey() {
    return spriteKeyForPet(this.getSelectedPetId());
  }

  /**
   * Roster row Gameplay can read (id, head, baby idle). Null if unset.
   */
  getSelectedPet() {
    return petSelectById(this.getSelectedPetId());
  }

  /**
   * Persist one opening pet. Rejects any other id.
   * Does not write `gold` or add a barricade field.
   * @param {unknown} petId
   * @returns {{ ok: boolean, reason?: string, selectedPetId: string|null, spriteKey: string|null }}
   */
  setSelectedPetId(petId) {
    if (!isOpeningPetId(petId)) {
      return {
        ok: false,
        reason: 'pet',
        selectedPetId: this.getSelectedPetId(),
        spriteKey: this.getSelectedPetSpriteKey(),
      };
    }
    if (!this._userId) this.bind('playtest-user');
    const doc = this._read();
    const id = this._userId;
    const profile = doc.profiles[id] || emptyProfile();
    const gold = profile.gold;
    profile.selectedPetId = petId;
    profile.updatedAt = Date.now();
    profile.gold = gold;
    doc.profiles[id] = profile;
    doc.activeUserId = id;
    this._write(doc);
    this._mirrorAccount(id, petId);
    return {
      ok: true,
      selectedPetId: petId,
      spriteKey: spriteKeyForPet(petId),
    };
  }

  /**
   * Read-only. Pet select does not spend or grant gold.
   * @returns {number}
   */
  getGold() {
    const gold = this._profile()?.gold;
    return Number.isFinite(gold) ? gold : 0;
  }

  _profile() {
    if (!this._userId) return null;
    const doc = this._read();
    return doc.profiles[this._userId] || null;
  }

  _read() {
    try {
      const raw = this._storage.getItem(SAVE_STORAGE_KEY);
      if (!raw) return { activeUserId: null, profiles: {} };
      const parsed = JSON.parse(raw);
      const profiles = {};
      const source = parsed?.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {};
      for (const [userId, row] of Object.entries(source)) {
        profiles[userId] = normalizeProfile(row);
      }
      const active = typeof parsed?.activeUserId === 'string' ? parsed.activeUserId : null;
      return { activeUserId: active, profiles };
    } catch (_) {
      return { activeUserId: null, profiles: {} };
    }
  }

  /**
   * @param {{ activeUserId: string|null, profiles: Record<string, ReturnType<typeof emptyProfile>> }} doc
   */
  _write(doc) {
    this._storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(doc));
  }

  /**
   * @param {string} userId
   */
  _account(userId) {
    try {
      return MockDB.get(userId);
    } catch (_) {
      return null;
    }
  }

  /**
   * @param {string} userId
   * @param {string} petId
   */
  _mirrorAccount(userId, petId) {
    try {
      if (!MockDB.exists(userId)) return;
      MockDB.saveProgress(userId, { selectedPetId: petId });
    } catch (_) {
      /* account db is optional for the playtest user */
    }
  }
}

/**
 * @param {{ get?: (key: string) => unknown }|null|undefined} registry
 * @returns {string|null}
 */
export function readSelectedPetId(registry) {
  if (!registry || typeof registry.get !== 'function') return null;
  const direct = registry.get('selectedPetId');
  if (isOpeningPetId(direct)) return direct;
  const save = registry.get('saveManager');
  const fromSave = save && typeof save.getSelectedPetId === 'function' ? save.getSelectedPetId() : null;
  return isOpeningPetId(fromSave) ? fromSave : null;
}

/**
 * @param {{ get?: (key: string) => unknown }|null|undefined} registry
 * @returns {string|null}
 */
export function readSelectedPetSpriteKey(registry) {
  return spriteKeyForPet(readSelectedPetId(registry));
}
