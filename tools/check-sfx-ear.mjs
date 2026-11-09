/**
 * Pets / UI / juice / leftovers ear pack.
 * Version stays 0.36.30. Run: node tools/check-sfx-ear.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/data/GameConfig.js';
import { GAME_AUDIO, petRoleCueKey } from '../src/systems/SoundManager.js';

let failed = 0;
function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const soundSrc = read('../src/systems/SoundManager.js');
const petSrc = read('../src/systems/PetCombat.js');
const zombieSrc = read('../src/entities/Zombie.js');
const weaponSrc = read('../src/systems/WeaponSystem.js');
const stageSrc = read('../src/scenes/StageScene.js');
const damageSrc = read('../src/ui/damageText.js');
const toastSrc = read('../src/ui/NarrationToast.js');
const pkg = JSON.parse(read('../package.json'));
const keys = new Set(GAME_AUDIO.map((row) => row.key));

const NEW_KEYS = [
  'sfx-pet-lion-attack',
  'sfx-pet-panda-attack',
  'sfx-pet-phoenix-attack',
  'sfx-pet-dragon-hurt',
  'sfx-pet-lion-hurt',
  'sfx-pet-panda-hurt',
  'sfx-pet-phoenix-hurt',
  'sfx-pet-dragon-skill',
  'sfx-pet-lion-skill',
  'sfx-pet-panda-skill',
  'sfx-pet-phoenix-skill',
  'pet-death',
  'pet-revive',
  'sfx-ui-crit',
  'sfx-ui-pause',
  'sfx-ui-stage-clear',
  'sfx-ui-stage-fail',
  'sfx-ui-tip',
  'sfx-ui-gold',
  'sfx-ui-auth',
  'sfx-hit-electric',
  'sfx-zombie-chef-die2',
  'sfx-zombie-office-hit02',
];
const REPLACED = [
  'sfx-slash-enemy',
  'sfx-slash-ally',
  'sfx-slash-dot',
  'sfx-hit-fire',
  'sfx-hit-water',
  'shoot-handgun',
  'shoot-shotgun',
  'weapon-swap',
  'hit-impact',
  'barricade-hit',
  'skill-telegraph',
];

assert(pkg.version === '0.36.30' && APP_VERSION === '0.36.30', 'visible version stays 0.36.30');
assert(NEW_KEYS.length + REPLACED.length === 34, 'ear pack is 34 clips');

for (const key of NEW_KEYS.concat(REPLACED)) {
  assert(keys.has(key), `${key} is in GAME_AUDIO`);
  const row = GAME_AUDIO.find((clip) => clip.key === key);
  assert(row?.url === `assets/audio/${key}.mp3`, `${key} url is assets/audio/${key}.mp3`);
  const file = new URL(`../assets/audio/${key}.mp3`, import.meta.url);
  assert(existsSync(file), `${key}.mp3 is in assets/audio`);
  const size = readFileSync(file).length;
  assert(size > 4000, `${key} is a non-empty mp3 (${size})`);
}

for (const role of ['lion', 'panda', 'phoenix']) {
  assert(petRoleCueKey(role, 'attack') === `sfx-pet-${role}-attack`, `${role} attack key`);
}
assert(petRoleCueKey('dragon', 'attack') === 'sfx-pet-dragon-attack', 'dragon attack stays the existing key');
for (const role of ['dragon', 'lion', 'panda', 'phoenix']) {
  assert(petRoleCueKey(role, 'hurt') === `sfx-pet-${role}-hurt`, `${role} hurt key`);
  assert(petRoleCueKey(role, 'skill') === `sfx-pet-${role}-skill`, `${role} skill key`);
}
assert(petRoleCueKey('slime', 'attack') === null, 'unknown roles stay silent');

assert(petSrc.includes('playDragonAttack') && petSrc.includes("actor.role?.id !== 'dragon'"), 'dragon swing still skips the generic attack');
assert(petSrc.includes('playPetAttack'), 'lion panda phoenix swing uses the role attack');
assert(petSrc.includes('playPetHurt'), 'flinch plays the role hurt');
assert(petSrc.includes('playPetSkill'), 'skill release plays the role skill');
assert(petSrc.includes('playPetDeath') && petSrc.includes('playPetReviveReady'), 'death and revive hooks stay');
assert(soundSrc.includes("this._cueOptional('pet-death'"), 'death clip is the registered pet-death key');
assert(soundSrc.includes("this._cueOptional('pet-revive', 0.32)"), 'revive stays under the ui row');
assert(soundSrc.includes('playUiCrit') && damageSrc.includes('playUiCrit'), 'crit floater plays sfx-ui-crit');
assert(stageSrc.includes('playUiStageClear') && stageSrc.includes('playUiStageFail'), 'clear and fail panels play their stings');
assert(stageSrc.includes('playUiGold'), 'gold grant plays sfx-ui-gold');
assert(toastSrc.includes('playUiTip') && toastSrc.includes("item.id !== 'clear'"), 'tips play, the clear card does not double them');
assert(weaponSrc.includes("playElementHit?.('electric')"), 'lightning body hit plays the electric spark');
assert(!weaponSrc.includes('playFeelFireHit') && !weaponSrc.includes('playFeelWaterHit'), 'fire and water stay on the feel booth');
assert(!weaponSrc.includes('sfx-slash-enemy') && !weaponSrc.includes('sfx-slash-ally'), 'booth slashes stay out of live combat');
assert(zombieSrc.includes('playChefDie2') && zombieSrc.includes('playOfficeHit02'), 'chef die2 and office hit02 call sites');
assert(zombieSrc.includes("deathKey === 'zombie-chef-die2'"), 'chef die2 replaces the profession cry only for that strip');
assert(!soundSrc.includes('playUiSettings') && !stageSrc.includes('playUiPause') && !stageSrc.includes('sfx-ui-auth'), 'pause and auth stay catalog-only');

if (failed) {
  console.error(`${failed} sfx ear check(s) failed`);
  process.exit(1);
}
console.log('sfx ear checks passed');
