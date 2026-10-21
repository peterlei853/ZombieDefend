/**
 * Opening PetSelect + SaveManager (no Phaser, no browser).
 * Run: node tools/check-pet-select.mjs
 *
 * Four catalog pets, one pick, persisted as selectedPetId.
 * Gold stays on the `gold` key. No barricade field is added.
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/data/GameConfig.js';
import { BARRICADE_MAX_HP } from '../src/data/waves.js';
import { getGoldByHP } from '../src/data/economy.js';
import { CHARACTERS, MockDB } from '../src/data/MockDB.js';
import {
  PET_SELECT_ROSTER,
  isOpeningPetId,
  spriteKeyForPet,
} from '../src/data/petSelectRoster.js';
import {
  SAVE_STORAGE_KEY,
  SaveManager,
  readSelectedPetId,
  readSelectedPetSpriteKey,
} from '../src/data/SaveManager.js';
import { GO_BACK_HUD_HOOK } from '../src/ui/goBackHudHook.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert(pkg.version === '0.36.27' && APP_VERSION === '0.36.27', 'package and APP_VERSION are 0.36.27');
assert(html.includes('v0.36.27'), 'document title is v0.36.27');
assert(BARRICADE_MAX_HP === 720, 'barricade max HP stays 720');
assert(getGoldByHP(40) === 10 && getGoldByHP(120) === 15 && getGoldByHP(300) === 50, 'gold-by-HP stays put');

const ids = PET_SELECT_ROSTER.map((pet) => pet.id);
assert(ids.join(',') === 'phoenix,panda,lion,dragon', 'roster order is phoenix, panda, lion, dragon');
assert(PET_SELECT_ROSTER.map((pet) => pet.headKey).join(',') === [
  'ui-pet-phoenix-head',
  'ui-pet-panda-head',
  'ui-pet-lion-head',
  'ui-pet-dragon-head',
].join(','), 'cards use the four catalog heads');
assert(spriteKeyForPet('phoenix') === 'pet-phoenix-baby-idle', 'phoenix maps to baby idle');
assert(spriteKeyForPet('panda') === 'pet-panda-baby-idle', 'panda maps to baby idle');
assert(spriteKeyForPet('lion') === 'pet-lion-baby-idle', 'lion maps to baby idle');
assert(spriteKeyForPet('dragon') === 'pet-dragon-baby-idle', 'dragon maps to baby idle');
assert(spriteKeyForPet('scout') === null && !isOpeningPetId('soldier'), 'avatar ids are not pets');

const avatarIds = new Set(CHARACTERS.map((row) => row.id));
for (const id of ids) assert(!avatarIds.has(id), `${id} is not a CharSelect avatar`);

assert(SAVE_STORAGE_KEY === 'zombieDefend.save.v1', 'SaveManager key is zombieDefend.save.v1');
assert(GO_BACK_HUD_HOOK.go === 'ui-float-go' && GO_BACK_HUD_HOOK.back === 'ui-float-back', 'GO/Back hook names catalog art');
assert(GO_BACK_HUD_HOOK.goSm === 'ui-float-go-sm' && GO_BACK_HUD_HOOK.backHd === 'ui-float-back-hd', 'GO/Back variants stay named');

function memoryStorage() {
  const bag = new Map();
  return {
    getItem: (key) => (bag.has(key) ? bag.get(key) : null),
    setItem: (key, value) => bag.set(key, String(value)),
  };
}

const storage = memoryStorage();
const save = new SaveManager(storage);
save.bind('playtest-user');
assert(save.getSelectedPetId() === null, 'a new profile has no pet');
assert(save.setSelectedPetId('heavy').ok === false, 'avatar id is rejected');
assert(save.getGold() === 0, 'rejecting a pet does not mint gold');

const seeded = JSON.parse(storage.getItem(SAVE_STORAGE_KEY));
seeded.profiles['playtest-user'].gold = 40;
storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(seeded));

const again = new SaveManager(storage);
again.bind('playtest-user');
const picked = again.setSelectedPetId('lion');
assert(picked.ok === true && picked.selectedPetId === 'lion', 'lion pick persists');
assert(picked.spriteKey === 'pet-lion-baby-idle', 'lion pick reports the baby idle');
assert(again.selectedPetId === 'lion', 'selectedPetId getter matches');
assert(again.getGold() === 40, 'setSelectedPetId leaves gold at 40');

const doc = JSON.parse(storage.getItem(SAVE_STORAGE_KEY));
const profile = doc.profiles['playtest-user'];
assert(profile.gold === 40, 'stored gold key is unchanged');
assert(profile.selectedPetId === 'lion', 'stored selectedPetId is lion');
assert(!Object.prototype.hasOwnProperty.call(profile, 'barricadeHp'), 'no barricadeHp key');
assert(!Object.prototype.hasOwnProperty.call(profile, 'barricade'), 'no barricade key');

const reloaded = new SaveManager(storage);
reloaded.bind('playtest-user');
assert(reloaded.getSelectedPetId() === 'lion', 'reload restores selectedPetId');
assert(reloaded.getSelectedPetSpriteKey() === 'pet-lion-baby-idle', 'reload restores the baby idle');
assert(reloaded.getGold() === 40, 'reload restores gold without rewriting it');

const registry = new Map([
  ['saveManager', reloaded],
  ['selectedPetId', null],
]);
const reader = { get: (key) => registry.get(key) };
assert(readSelectedPetId(reader) === 'lion', 'registry reader falls back to SaveManager');
registry.set('selectedPetId', 'dragon');
assert(readSelectedPetId(reader) === 'dragon', 'registry selectedPetId wins when it is a roster id');
assert(readSelectedPetSpriteKey(reader) === 'pet-dragon-baby-idle', 'sprite reader follows the registry id');

const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const titleSrc = readFileSync(new URL('../src/scenes/TitleScene.js', import.meta.url), 'utf8');
const bootSrc = readFileSync(new URL('../src/scenes/BootScene.js', import.meta.url), 'utf8');
const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const shopSrc = readFileSync(new URL('../src/scenes/ShopScene.js', import.meta.url), 'utf8');
const petSrc = readFileSync(new URL('../src/scenes/PetSelectScene.js', import.meta.url), 'utf8');
const saveSrc = readFileSync(new URL('../src/data/SaveManager.js', import.meta.url), 'utf8');
const combatSrc = readFileSync(new URL('../src/systems/PetCombat.js', import.meta.url), 'utf8');
assert(mainSrc.includes('PetSelectScene'), 'main registers PetSelect');
assert(titleSrc.includes('PetSelectScene'), 'title opens PetSelect');
assert(titleSrc.includes('startStage(stage)'), 'title still names each stage');
assert(bootSrc.includes('saveManager'), 'boot installs SaveManager');
assert(bootSrc.includes('goBackHudHook'), 'boot reserves the GO/Back hook');
assert(stageSrc.includes('selectedPetId'), 'stage keeps selectedPetId for Gameplay');
assert(shopSrc.includes('selectedPetId'), 'shop forwards selectedPetId');
assert(petSrc.includes('PET_SELECT_ROSTER'), 'scene renders the roster');
assert(petSrc.includes('PIXELLAB_HOOK'), 'card art hook stays in the scene');
assert(saveSrc.includes('selectedPetId') && !saveSrc.includes('spendGold'), 'SaveManager does not spend gold');
assert(!combatSrc.includes('selectedPetId'), 'pet combat is unchanged');
assert(stageSrc.includes('maxHp: BARRICADE_MAX_HP'), 'stage still uses the barricade constant');

const mock = readFileSync(new URL('../src/data/MockDB.js', import.meta.url), 'utf8');
assert(mock.includes('selectedPetId'), 'account row can store selectedPetId');
assert(!mock.includes("id: 'phoenix'"), 'CharSelect roster has no pet id');

if (typeof localStorage === 'undefined') {
  globalThis.localStorage = memoryStorage();
}
const registered = MockDB.register('Ada', '42');
assert(registered.ok === true && registered.save.selectedPetId === null, 'new account starts without a pet');
assert(registered.save.gold === 0, 'new account gold stays 0');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('pet select checks passed');
