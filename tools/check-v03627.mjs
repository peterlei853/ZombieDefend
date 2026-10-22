/**
 * v0.36.27 gameplay slice.
 * Run: node tools/check-v03627.mjs
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION, GAME_CONFIG } from '../src/data/GameConfig.js';
import { applyPlayerCrit, playerCombatHudLabel } from '../src/data/playerCombat.js';
import { EARLY_STAGE_WAVES, stageBalanceRows } from '../src/data/stageBalance.js';
import { PET_SELECT_ROSTER, spriteKeyForPet } from '../src/data/petSelectRoster.js';
import {
  SaveManager,
  readSelectedPetId,
  readSelectedPetSpriteKey,
} from '../src/data/SaveManager.js';
import { PLAYABLE_STAGE_CAP, rosterForStage } from '../src/data/stageRoster.js';
import { BARRICADE_MAX_HP as WALL, WAVE_DEFS, waveDefsForStage } from '../src/data/waves.js';
import {
  PET_UI_SFX,
  VOCAL_GROWL_INTERVAL_MS,
  vocalClipKey,
  vocalClipKeys,
} from '../src/data/vocalSfx.js';
import { TORSO_FROM_TOP, petLaneDrop, separateFootprints, smallHurtLocksMove } from '../src/systems/footprints.js';
import { layoutPx } from '../src/systems/DepthView.js';
import { VocalAmbience } from '../src/systems/vocalAmbience.js';
import { Zombie } from '../src/entities/Zombie.js';

let failed = 0;
function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert(pkg.version === '0.36.28' && APP_VERSION === '0.36.28', 'version is 0.36.28');
assert(WALL === 720, 'barricade max HP stays 720');
assert(GAME_CONFIG.PLAYER.ATTACK === 10, 'opening attack is 10');
assert(GAME_CONFIG.PLAYER.CRIT_CHANCE === 0.05, 'crit chance is 5%');
assert(GAME_CONFIG.PLAYER.CRIT_DAMAGE === 0.8, 'crit damage bonus is 80%');
assert(applyPlayerCrit(10, () => 0.9).amount === 10 && applyPlayerCrit(10, () => 0.9).crit === false, 'a miss stays 10');
assert(applyPlayerCrit(10, () => 0).amount === 18 && applyPlayerCrit(10, () => 0).crit === true, 'a crit 10 lands as 18');
assert(WAVE_DEFS.map((def) => def.total).join() === '5,6,10,48', 'legacy wave totals stay');
assert(waveDefsForStage(4)[3].total === 48 && waveDefsForStage(5)[0].archetypes[0].hp === 40, 'stage 4+ keeps WAVE_DEFS');
assert(PLAYABLE_STAGE_CAP === 3, 'the clear loop is three stages');
assert(rosterForStage(3).includes('nurse') && !rosterForStage(4).includes('chef'), 'nurse joins stage 3 only');

const totals = { 1: 16, 2: 24, 3: 28 };
for (const stage of [1, 2, 3]) {
  const rows = stageBalanceRows(stage);
  const count = rows.reduce((sum, row) => sum + row.count, 0);
  assert(count === totals[stage], `stage ${stage} count ${count}`);
  assert(EARLY_STAGE_WAVES[stage].every((def) => def.archetypes[0].gold > 0), `stage ${stage} has gold`);
  assert(rows[0].hp < rows[3].hp && rows[0].dps < rows[3].dps, `stage ${stage} rises`);
}
assert(stageBalanceRows(1)[0].hp < stageBalanceRows(2)[0].hp, 'stage 2 opens harder than stage 1');
const s1 = stageBalanceRows(1);
assert(s1[0].count === 4 && s1[0].hp === 24 && s1[0].dps === 2 && s1[0].gold === 8, 'stage 1 wave 1 stays the opener');
assert(s1[1].count === 5 && s1[1].hp === 36 && s1[1].dps === 3, 'stage 1 wave 2 stays');
assert(s1[2].count === 3 && s1[2].hp === 30 && s1[2].dps === 2 && s1[2].gold === 16, 'stage 1 wave 3 is eased');
assert(s1[3].count === 4 && s1[3].hp === 36 && s1[3].speed === 30 && s1[3].dps === 3 && s1[3].gold === 18, 'stage 1 wave 4 is eased');
assert(s1[3].window === '65–80s', 'stage 1 wave 4 finishes spawning before the clock');
assert(playerCombatHudLabel() === 'ATK 10  CRIT 5%  CRITDMG +80%', 'HUD shows the crit gate');
assert(stageBalanceRows(2)[3].hp < stageBalanceRows(3)[3].hp, 'stage 3 wave 4 is the heaviest early row');

assert(PET_SELECT_ROSTER.map((pet) => pet.id).join() === 'phoenix,panda,lion,dragon', 'opening pet ids');
assert(spriteKeyForPet('lion') === 'pet-lion-baby-idle', 'lion baby idle key');
const bag = new Map();
const save = new SaveManager({
  getItem: (key) => (bag.has(key) ? bag.get(key) : null),
  setItem: (key, value) => bag.set(key, String(value)),
});
save.bind('playtest-user');
assert(save.selectedPetId === null && save.getSelectedPetId() === null, 'unset pet stays null');
assert(save.setSelectedPetId('panda').ok === true, 'panda saves');
assert(save.getSelectedPetId() === 'panda' && save.selectedPetId === 'panda', 'selectedPetId getter matches');
assert(save.getSelectedPetSpriteKey() === 'pet-panda-baby-idle', 'sprite key comes from the save');
const registry = {
  values: {
    selectedPetId: 'dragon',
    selectedPetSpriteKey: 'pet-dragon-baby-idle',
    saveManager: save,
  },
  get(key) {
    return this.values[key];
  },
};
assert(readSelectedPetId(registry) === 'dragon', 'registry selectedPetId wins');
assert(readSelectedPetSpriteKey(registry) === 'pet-dragon-baby-idle', 'registry selectedPetSpriteKey');
registry.values.selectedPetId = null;
assert(readSelectedPetId(registry) === 'panda', 'saveManager.getSelectedPetId is the next read');

assert(vocalClipKeys().length === 16, 'sixteen vocal keys');
assert(vocalClipKey('office', 'growl', 'a') === 'sfx-office-growl-a', 'office growl a');
assert(vocalClipKey('nurse', 'death', 'b') === 'sfx-nurse-death-b', 'nurse death b');
assert(PET_UI_SFX.basicAttack === 'sfx-pet-basic-attack', 'pet attack key');
assert(PET_UI_SFX.go === 'sfx-ui-pet-go' && PET_UI_SFX.back === 'sfx-ui-pet-back', 'GO and Back keys');
assert(VOCAL_GROWL_INTERVAL_MS === 10000, 'growl every 10s');
const growls = [];
const ambience = new VocalAmbience();
const office = { alive: true, skin: { id: 'office-worker-v2' } };
const nurse = { alive: true, skin: { id: 'nurse' } };
const growlScene = { audio: { playProfessionGrowl(slug) { growls.push(slug); } } };
ambience.update(growlScene, [office, nurse], 0);
ambience.update(growlScene, [office, nurse], 9999);
assert(growls.length === 0, 'living zombies stay quiet for the first 10s');
for (let t = 10000; t <= 14000; t += 400) ambience.update(growlScene, [office, nurse], t);
assert(growls.includes('office') && growls.includes('nurse') && growls.length === 2, 'each living zombie growls once');
nurse.alive = false;
const before = growls.length;
for (let t = 20000; t <= 25000; t += 400) ambience.update(growlScene, [office, nurse], t);
assert(growls.length === before + 1 && growls[growls.length - 1] === 'office', 'a dead zombie stops growling');

const small = { skin: { ruleAnims: {} }, _hurtMs: 200, _rootMs: 0, _slowMs: 0 };
small._slowFactor = Zombie.prototype._slowFactor;
assert(smallHurtLocksMove(small) && small._slowFactor() === 0, '84px hurt cannot march');
const wideSheet = {
  skin: { ruleAnims: {} },
  body: { x: 10, y: 20, frame: { width: 420, height: 84 } },
  _hurtMs: 200,
  _feelHurtLatch: false,
  _rootMs: 0,
  _slowMs: 0,
  alive: true,
  _lastX: 10,
  _lastY: 20,
  laneY: 20,
};
wideSheet.hurtMarchLocked = Zombie.prototype.hurtMarchLocked;
wideSheet._slowFactor = Zombie.prototype._slowFactor;
wideSheet.shift = Zombie.prototype.shift;
assert(smallHurtLocksMove(wideSheet) && wideSheet._slowFactor() === 0, 'a wide hurt sheet still locks the 84px cell');
assert(wideSheet.shift(4, 2) === false && wideSheet.body.x === 10 && wideSheet.body.y === 20, 'hurt lock does not creep');
const big = {
  skin: null,
  body: { frame: { width: 128, height: 128 } },
  _hurtMs: 200,
  _rootMs: 0,
  _slowMs: 0,
};
big._slowFactor = Zombie.prototype._slowFactor;
assert(!smallHurtLocksMove(big) && big._slowFactor() === 0.5, 'a 128px cell still uses the half-speed hurt');

const left = { x: 0, y: 10, displayWidth: 40, shift(dx, dy) { this.x += dx; this.y += dy; } };
const right = { x: 1, y: 10, displayWidth: 40, shift(dx, dy) { this.x += dx; this.y += dy; } };
separateFootprints([left, right], { rounds: 4 });
assert(Math.hypot(right.x - left.x, right.y - left.y) >= 32, 'overlapping footprints separate');
const boxA = { x: 0, y: 0, displayWidth: 84, shift(dx, dy) { this.x += dx; this.y += dy; } };
const boxB = { x: 8, y: 0, displayWidth: 64, shift(dx, dy) { this.x += dx; this.y += dy; } };
separateFootprints([boxA, boxB], { rounds: 8 });
assert(Math.hypot(boxB.x - boxA.x, boxB.y - boxA.y) >= 74, 'a pet and a zombie box stay apart');

const chef = {
  x: 200,
  y: 400,
  displayWidth: 120,
  displayHeight: 126,
  shift(dx, dy) { this.x += dx; this.y += dy; return true; },
};
const phoenix = {
  kind: 'pet',
  x: 247,
  y: 400,
  displayWidth: 72,
  displayHeight: 72,
  shift(dx, dy) { this.x += dx; this.y += dy; return true; },
};
separateFootprints([chef, phoenix], { rounds: 4 });
const torsoBottom = (chef.y - chef.displayHeight) + chef.displayHeight * TORSO_FROM_TOP;
const petTop = phoenix.y - phoenix.displayHeight;
assert(petTop >= torsoBottom - 0.5, `pet sprite stays under the torso (${petTop} vs ${torsoBottom})`);
const farChef = {
  x: 200,
  y: 400,
  displayWidth: 120,
  displayHeight: 126,
  shift(dx, dy) { this.x += dx; this.y += dy; return true; },
};
const farPet = {
  kind: 'pet',
  x: 247,
  y: 620,
  displayWidth: 72,
  displayHeight: 72,
  shift(dx, dy) { this.x += dx; this.y += dy; return true; },
};
separateFootprints([farChef, farPet], { rounds: 4 });
assert(farPet.x === 247 && farPet.y === 620, 'a pet crossing another lane is not pinned to the grass');
const meleeCap = layoutPx(GAME_CONFIG.PETS.MELEE.Y_HALF) - layoutPx(2);
const drop = petLaneDrop(72, 126, meleeCap);
assert(drop <= meleeCap && drop >= layoutPx(18), 'lane drop stays inside the melee window');
assert(400 + drop - 72 >= 400 - 126 + 126 * TORSO_FROM_TOP - 0.5, 'aim drop clears the head and torso');

const biter = {
  alive: true,
  atBarricade: true,
  dps: 10,
  scene: { waveManager: { isTimeUp: () => false } },
};
biter.contactDamage = Zombie.prototype.contactDamage;
assert(biter.contactDamage(1) === 10, 'before 90s a barricade bite still chews');
biter.scene.waveManager.isTimeUp = () => true;
assert(biter.contactDamage(1) === 0, 'after 90s a barricade bite does not chew');

const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const defenderSrc = readFileSync(new URL('../src/entities/Defender.js', import.meta.url), 'utf8');
const buttonSrc = readFileSync(new URL('../src/ui/PetDeployButton.js', import.meta.url), 'utf8');
const combatSrc = readFileSync(new URL('../src/systems/PetCombat.js', import.meta.url), 'utf8');
assert(stageSrc.includes('PetDeployButton') && stageSrc.includes('getSelectedPetSpriteKey'), 'stage deploys the saved sprite');
assert(stageSrc.includes('playerCombatHudLabel'), 'stage HUD prints the crit gate');
assert(stageSrc.includes('selectedPetId') && stageSrc.includes('selectedPetSpriteKey'), 'stage keeps both registry fields');
assert(!stageSrc.includes("from '../data/selectedPet.js'"), 'stage does not keep a second pet reader');
assert(buttonSrc.includes('GO!') && buttonSrc.includes('Back!') && buttonSrc.includes('PIXELLAB_HOOK'), 'GO!/Back! button hook');
assert(buttonSrc.includes('ui-float-go') && buttonSrc.includes('ui-float-back'), 'button uses the float art');
assert(defenderSrc.includes('skillsEnabled: false'), 'live pets do not auto-cast');
assert(combatSrc.includes('playPetBasicAttack') && combatSrc.includes('playPetGo') && combatSrc.includes('playPetBack'), 'pet and UI sfx hooks');
assert(combatSrc.includes("takeDamage(amount, { kind: 'pet', crit })"), 'pet crit still uses the existing flag');
assert(!stageSrc.includes('.shake('), 'stage does not shake');

if (failed) {
  console.error(`${failed} v0.36.27 check(s) failed`);
  process.exit(1);
}
console.log('v0.36.27 checks passed');
