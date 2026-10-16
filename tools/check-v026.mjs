/**
 * v0.26 contract checks (no Phaser, no browser).
 * Run: node tools/check-v026.mjs
 *
 * EXP is separate from gold. Evolution never writes a save.
 * Skills are 12/8/4s. Zombies only peel toward a nearby pet.
 */
import { readFileSync } from 'node:fs';
import { GAME_CONFIG, APP_VERSION } from '../src/data/GameConfig.js';
import { getGoldByHP } from '../src/data/economy.js';
import { layoutPx } from '../src/systems/DepthView.js';
import { expFromZombieHp, MAGNET_R } from '../src/systems/ExpOrbManager.js';
import { PetEvolve, STAGE_EXP_CAP, T2_COST, T3_COST } from '../src/systems/PetEvolve.js';
import { debugExpEnabled, expToNextTier, grantDebugExp } from '../src/debugExp.js';
import { NEAR_R, pickPetTarget } from '../src/systems/ZombieAggro.js';
import { ULT_KEYS, ULT_MS } from '../src/systems/UltCutscene.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

assert(APP_VERSION === '0.35.7', `APP_VERSION ${APP_VERSION}`);
assert(GAME_CONFIG.PETS.HP === 192, 'pet HP stays 192');
assert(getGoldByHP(40) === 10 && getGoldByHP(120) === 15 && getGoldByHP(300) === 50, 'gold-by-HP table is unchanged');

assert(expFromZombieHp(40) === 10, 'wave 1 exp is floor(40/4)');
assert(expFromZombieHp(19) === 10, 'exp minimum is 10');
assert(expFromZombieHp(70) === 17, 'wave 2 exp');
assert(expFromZombieHp(100) === 25, 'exp for 100 HP');
assert(expFromZombieHp(105) === 26, 'wave 3 exp');
assert(expFromZombieHp(0) === 10 && expFromZombieHp(-4) === 10, 'invalid hp still drops the floor');
assert(MAGNET_R >= 1200, 'orbs magnet across the march, not only melee');
const earlyExp = 5 * expFromZombieHp(40);
assert(earlyExp >= 40, `wave 1 yield can fill tier 2 (${earlyExp})`);
assert(T2_COST === 40 && T3_COST === 80 && STAGE_EXP_CAP === 120, 'tier costs 40 then 80');

const evolveSrc = readFileSync(new URL('../src/systems/PetEvolve.js', import.meta.url), 'utf8');
const shopSrc = readFileSync(new URL('../src/scenes/ShopScene.js', import.meta.url), 'utf8');
const combatSrc = readFileSync(new URL('../src/systems/PetCombat.js', import.meta.url), 'utf8');
const orbSrc = readFileSync(new URL('../src/systems/ExpOrbManager.js', import.meta.url), 'utf8');
const ultSrc = readFileSync(new URL('../src/systems/UltCutscene.js', import.meta.url), 'utf8');
const aggroSrc = readFileSync(new URL('../src/systems/ZombieAggro.js', import.meta.url), 'utf8');
const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const debugExpSrc = readFileSync(new URL('../src/debugExp.js', import.meta.url), 'utf8');
for (const [name, text] of [
  ['PetEvolve', evolveSrc],
  ['ShopScene', shopSrc],
  ['ExpOrbManager', orbSrc],
  ['debugExp', debugExpSrc],
]) {
  assert(!/localStorage\.(get|set|remove|clear|key)/.test(text), `${name} does not read or write localStorage`);
}

const ev = new PetEvolve({ events: { emit() {} }, audio: { playPetEvolve() {} } });
assert(ev.getTier('phoenix') === 1 && ev.canUseUlt('phoenix') === false, 'starts at tier 1');
assert(ev.requestDrop(50) === 50, 'drops are open before 2/3');
ev.notifyStageProgress(0.7);
const remain = Math.max(0, STAGE_EXP_CAP - 50);
assert(ev.requestDrop(9999) === remain, `late budget clamps to ${remain}`);
assert(ev.addExp('phoenix', 39).tier === 1, '39 EXP stays tier 1');
assert(ev.addExp('phoenix', 1).tier === 2, '40 EXP reaches tier 2');
assert(ev.addExp('phoenix', 80).tier === 3 && ev.canUseUlt('phoenix'), '120 EXP reaches tier 3');
assert(ev.expRatio('phoenix') === 1, 'tier 3 exp bar is full');
ev.resetStage();
assert(ev.getExp('phoenix') === 0 && ev.getTier('lion') === 1, 'resetStage clears EXP');

const cds = GAME_CONFIG.PETS.ORB_CD_MS;
for (const id of ['phoenix', 'panda', 'lion', 'dragon']) {
  assert(cds[id].join() === '12000,8000,4000', `${id} cooldowns are 12/8/4`);
}
assert(GAME_CONFIG.PETS.MELEE.DAMAGE === 8, 'melee damage');
assert(GAME_CONFIG.PETS.KNOCKBACK_PX >= 4 && GAME_CONFIG.PETS.KNOCKBACK_PX <= 8 && GAME_CONFIG.PETS.KNOCKBACK_MS === 150, 'v0.29 knockback is a 4–8px shove');
assert(GAME_CONFIG.PETS.TELEGRAPH_MS >= 220, 'telegraph stays opaque for at least 220ms');
assert(
  GAME_CONFIG.PETS.HITSTOP_HIT_MS >= 30 && GAME_CONFIG.PETS.HITSTOP_HIT_MS <= 50
    && GAME_CONFIG.PETS.HITSTOP_S2_MS >= 30 && GAME_CONFIG.PETS.HITSTOP_S2_MS <= 50
    && GAME_CONFIG.PETS.HITSTOP_S3_MS >= 30 && GAME_CONFIG.PETS.HITSTOP_S3_MS <= 50,
  'pet hitstop is 30–50ms'
);
assert(ULT_MS >= 800 && ULT_MS <= 1200, 'ult freeze is 0.8–1.2s');
assert(ULT_KEYS.phoenix === 'vfx-ult-phoenix' && ULT_KEYS.dragon === 'vfx-ult-dragon', 'ult texture keys');

const near = { x: 200, y: 300, hp: 10, alive: true, id: 'near' };
assert(pickPetTarget({ x: 200 + layoutPx(40), y: 300 }, [near]) === near, 'nearby pet is a bite target');
assert(pickPetTarget({ x: 200 + layoutPx(NEAR_R + 20), y: 300 }, [near]) === null, 'far pet is ignored');
assert(aggroSrc.includes('nearestFieldPet'), 'aggro still uses the nearest living pet');
assert(stageSrc.includes('pickPetTarget'), 'stage asks ZombieAggro');
assert(!combatSrc.includes('.shake(') && !ultSrc.includes('.shake('), 'no camera shake');
assert(combatSrc.includes('playPetMeleeHit') && combatSrc.includes('playPetKnockback'), 'melee and knockback SFX');
assert(combatSrc.includes('playSkillTelegraph'), 'telegraph SFX');
assert(combatSrc.includes('vfx-telegraph-ring') && combatSrc.includes('vfx-telegraph-half-left'), 'telegraph keys');
assert(combatSrc.includes('vfx-telegraph-ring-128'), 'S2 telegraph key');
assert(
  combatSrc.includes('attackElapsed >= GAME_CONFIG.PETS.TELEGRAPH_MS'),
  'skill damage waits until the ground telegraph has played'
);
assert(combatSrc.includes('mark.age'), 'telegraph opacity follows mark.age, not a short tween');
assert(combatSrc.includes('skills advance during a bite'), 'a bite does not freeze the tell');
assert(combatSrc.includes('TELEGRAPH_GROUND_Y'), 'ring is squashed onto the lane');
assert(combatSrc.includes('forceUlt'), 'debug ult can start the letterbox immediately');
assert(debugExpEnabled('?debugExp=1') === true, 'debugExp flag');
assert(debugExpEnabled('?debugBgm=1') === false, 'debug BGM does not grant EXP');
assert(debugExpEnabled('?petHurt=1') === false, 'pet hurt does not grant EXP');
assert(debugExpEnabled('?petLowHp=1') === false, 'pet low HP does not grant EXP');
assert(debugExpEnabled('?debugPetSkill=1') === false, 'pet skill debug does not grant EXP');
assert(debugExpEnabled('') === false, 'debug EXP is off by default');
assert(expToNextTier(0) === 40 && expToNextTier(39) === 1, 'first grant reaches tier 2');
assert(expToNextTier(40) === 80 && expToNextTier(119) === 1, 'second grant reaches tier 3');
assert(expToNextTier(120) === 0, 'tier 3 does not keep granting');
const debugEv = new PetEvolve({ events: { emit() {} }, audio: { playPetEvolve() {} } });
assert(grantDebugExp(debugEv, ['phoenix']) === true, 'debug grant applies');
assert(debugEv.getTier('phoenix') === 2 && debugEv.getExp('phoenix') === 40, 'one press is tier 2');
assert(debugEv.getTier('lion') === 1, 'a named field pet does not evolve the bench');
assert(grantDebugExp(debugEv, ['phoenix']) === true, 'second press applies');
assert(debugEv.getTier('phoenix') === 3 && debugEv.canUseUlt('phoenix'), 'two presses reach the ult');
assert(grantDebugExp(debugEv, ['phoenix']) === false, 'third press is a no-op');
assert(stageSrc.includes('KeyCodes.E') && stageSrc.includes('debugExpEnabled'), 'E is wired behind the flag');
assert(stageSrc.includes('KeyCodes.U') && stageSrc.includes('forceUlt'), 'U plays the ult behind the same flag');
assert(stageSrc.includes('KeyCodes.H') && stageSrc.includes('petHurt'), 'H / petHurt still wired');
assert(stageSrc.includes('KeyCodes.L') && stageSrc.includes('petLowHp'), 'L / petLowHp is wired');
assert(stageSrc.includes('KeyCodes.V') && stageSrc.includes('debugBgmEnabled'), 'V / debugBgm still wired');
assert(combatSrc.includes('vfx-aoe-fire') && combatSrc.includes('vfx-aoe-poison'), 'residue keys');
assert(combatSrc.includes('vfx-evolve-stars-'), 'evolve star marker');
assert(ultSrc.includes('playUlt'), 'ult SFX helper');
assert(orbSrc.includes('playExpOrbDrop') && orbSrc.includes('playExpOrbPickup'), 'exp orb SFX');
assert(evolveSrc.includes('playPetEvolve'), 'evolve SFX');
assert(shopSrc.includes('buyWeapon') && shopSrc.includes('upgradeWeapon') && shopSrc.includes('continue('), 'shop stub methods');
assert(combatSrc.includes('setTintFill'), 'pet hurt still uses a solid fill');
assert(combatSrc.includes('knockback: false'), 'zone ticks do not shove');

if (failed) {
  console.error(`${failed} v0.26 check(s) failed`);
  process.exit(1);
}
console.log('v0.26 checks passed');
