/**
 * v0.36.27 gameplay slice.
 * Run: node tools/check-v03627.mjs
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION, BARRICADE_MAX_HP, GAME_CONFIG } from '../src/data/GameConfig.js';
import { applyPlayerCrit } from '../src/data/playerCombat.js';
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
import { separateFootprints, smallHurtLocksMove } from '../src/systems/footprints.js';
import { Zombie } from '../src/entities/Zombie.js';

let failed = 0;
function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert(pkg.version === '0.36.27' && APP_VERSION === '0.36.27', 'version is 0.36.27');
assert(WALL === 720 && BARRICADE_MAX_HP === 720, 'barricade max HP stays 720');
assert(GAME_CONFIG.PLAYER.ATTACK === 10, 'opening attack is 10');
assert(GAME_CONFIG.PLAYER.CRIT_CHANCE === 0.05, 'crit chance is 5%');
assert(GAME_CONFIG.PLAYER.CRIT_DAMAGE === 0.8, 'crit damage bonus is 80%');
assert(applyPlayerCrit(10, () => 0.9).amount === 10 && applyPlayerCrit(10, () => 0.9).crit === false, 'a miss stays 10');
assert(applyPlayerCrit(10, () => 0).amount === 18 && applyPlayerCrit(10, () => 0).crit === true, 'a crit 10 lands as 18');
assert(WAVE_DEFS.map((def) => def.total).join() === '5,6,10,48', 'legacy wave totals stay');
assert(waveDefsForStage(4)[3].total === 48 && waveDefsForStage(5)[0].archetypes[0].hp === 40, 'stage 4+ keeps WAVE_DEFS');
assert(PLAYABLE_STAGE_CAP === 3, 'the clear loop is three stages');
assert(rosterForStage(3).includes('nurse') && !rosterForStage(4).includes('chef'), 'nurse joins stage 3 only');

const totals = { 1: 22, 2: 24, 3: 28 };
for (const stage of [1, 2, 3]) {
  const rows = stageBalanceRows(stage);
  const count = rows.reduce((sum, row) => sum + row.count, 0);
  assert(count === totals[stage], `stage ${stage} count ${count}`);
  assert(EARLY_STAGE_WAVES[stage].every((def) => def.archetypes[0].gold > 0), `stage ${stage} has gold`);
  assert(rows[0].hp < rows[3].hp && rows[0].dps < rows[3].dps, `stage ${stage} rises`);
}
assert(stageBalanceRows(1)[0].hp < stageBalanceRows(2)[0].hp, 'stage 2 opens harder than stage 1');
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

const small = { skin: { ruleAnims: {} }, _hurtMs: 200, _rootMs: 0, _slowMs: 0 };
small._slowFactor = Zombie.prototype._slowFactor;
assert(smallHurtLocksMove(small) && small._slowFactor() === 0, '84px hurt cannot march');
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

const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const defenderSrc = readFileSync(new URL('../src/entities/Defender.js', import.meta.url), 'utf8');
const buttonSrc = readFileSync(new URL('../src/ui/PetDeployButton.js', import.meta.url), 'utf8');
const combatSrc = readFileSync(new URL('../src/systems/PetCombat.js', import.meta.url), 'utf8');
assert(stageSrc.includes('PetDeployButton') && stageSrc.includes('getSelectedPetSpriteKey'), 'stage deploys the saved sprite');
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
