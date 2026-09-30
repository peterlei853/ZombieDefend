/** localStorage MockDB — accounts + progress. Architect-owned. */
const DB_KEY = 'zombieDefend.db.v1';

function readDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { accounts: {} };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { accounts: {} };
  } catch {
    return { accounts: {} };
  }
}

function writeDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export const Validators = {
  username(v) {
    if (typeof v !== 'string' || !v) return 'UserName required';
    if (/\s/.test(v)) return 'No spaces';
    if (!/^[A-Za-z]+$/.test(v)) return 'Letters only';
    if (v.length > 8) return 'Max 8 letters';
    return null;
  },
  passcode(v) {
    if (typeof v !== 'string' || !v) return 'PassCode required';
    if (/\s/.test(v)) return 'No spaces';
    if (!/^\d+$/.test(v)) return 'Digits only';
    return null;
  },
};

export const MockDB = {
  exists(username) {
    return Boolean(readDb().accounts[username]);
  },

  register(username, passcode) {
    const uErr = Validators.username(username);
    if (uErr) return { ok: false, error: uErr };
    const pErr = Validators.passcode(passcode);
    if (pErr) return { ok: false, error: pErr };
    const db = readDb();
    if (db.accounts[username]) return { ok: false, error: 'Account already exists' };
    db.accounts[username] = {
      passcode,
      characterId: null,
      stage: 1,
      gold: 0,
      shopItems: [],
      updatedAt: Date.now(),
    };
    writeDb(db);
    return { ok: true, save: { ...db.accounts[username], username } };
  },

  login(username, passcode) {
    const db = readDb();
    const acc = db.accounts[username];
    if (!acc || acc.passcode !== passcode) {
      return { ok: false, error: 'UserName or PassCode mismatch' };
    }
    return { ok: true, save: { ...acc, username } };
  },

  /** Create new-game save after CharSelect (Stage = 1). */
  finalizeNewGame(username, characterId) {
    const db = readDb();
    const acc = db.accounts[username];
    if (!acc) return { ok: false, error: 'Account missing' };
    acc.characterId = characterId;
    acc.stage = 1;
    acc.gold = 0;
    acc.shopItems = [];
    acc.updatedAt = Date.now();
    writeDb(db);
    return { ok: true, save: { ...acc, username } };
  },

  /** Auto-save on entering Shop (and anytime progress changes). */
  saveProgress(username, patch) {
    const db = readDb();
    const acc = db.accounts[username];
    if (!acc) return { ok: false, error: 'Account missing' };
    Object.assign(acc, patch, { updatedAt: Date.now() });
    writeDb(db);
    return { ok: true, save: { ...acc, username } };
  },

  get(username) {
    const acc = readDb().accounts[username];
    return acc ? { ...acc, username } : null;
  },
};

/** Appearance-only v0 roster — stats later if Peter locks them. */
export const CHARACTERS = [
  { id: 'scout', label: 'Scout', color: 0x4fc3f7 },
  { id: 'soldier', label: 'Soldier', color: 0x81c784 },
  { id: 'heavy', label: 'Heavy', color: 0xffb74d },
];
