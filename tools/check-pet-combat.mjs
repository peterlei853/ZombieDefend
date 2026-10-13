/**
 * Pet bar summon checks (no Phaser, no browser).
 * Run: node tools/check-pet-combat.mjs
 *
 * Bars summon and recall. No deploy cooldown, no on-field limit.
 * Recalled pets regen. Death greys the bar for REVIVE_CD_MS.
 * Unlocked orbs fill, flash, then auto-cast. Form 1 uses baby FX.
 * Forms 2 and 3 are locked in play and covered with placeholder circles.
 */
import { readFileSync } from 'node:fs';
import { GAME_CONFIG, APP_VERSION } from '../src/data/GameConfig.js';
import { WAVE_DEFS, BARRICADE_MAX_HP, GAME_WIDTH, GAME_HEIGHT } from '../src/data/waves.js';
import { PET_LINEUP, PET_STAGE_KEYS, petLineupSlots, petSleepDepth, stageLibraryFilter } from '../src/assets/petLineup.js';
import { barricadeXAtY, cameraScrollX, depthFromY, grassYMax, grassYMin, layoutPx } from '../src/systems/DepthView.js';
import { nearestFieldPet, petReachableBeforeFence } from '../src/systems/petAggro.js';
import {
  PET_AUDIO_KEYS,
  PetCombat,
  floatHeroRect,
  floatLabelBox,
  placeFloatLabel,
  closestThreatWhere,
  inForwardBox,
  inLeftCone,
  leftBoltVelocity,
  nearestBarricadeThreat,
} from '../src/systems/PetCombat.js';
import { Zombie } from '../src/entities/Zombie.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert(pkg.version === '0.26.0', `package.json version ${pkg.version}`);
assert(APP_VERSION === '0.26.0', `APP_VERSION ${APP_VERSION}`);
assert(pkg.version === APP_VERSION, 'package version matches APP_VERSION');

const boot = readFileSync(new URL('../src/scenes/BootScene.js', import.meta.url), 'utf8');
const title = readFileSync(new URL('../src/scenes/TitleScene.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const defender = readFileSync(new URL('../src/entities/Defender.js', import.meta.url), 'utf8');
const hud = readFileSync(new URL('../src/ui/PetPortraitHud.js', import.meta.url), 'utf8');
const combatSrc = readFileSync(new URL('../src/systems/PetCombat.js', import.meta.url), 'utf8');
assert(title.includes('APP_VERSION'), 'title uses APP_VERSION');
assert(!title.includes('v0.19'), 'title is not 0.19');
assert(boot.includes('TitleScene'), 'boot opens the title');
assert(stage.includes('APP_VERSION'), 'HUD uses APP_VERSION');
assert(html.includes('v0.26.0'), 'document title is v0.26.0');
assert(!defender.includes('_createLineupPet'), 'fence lineup is not spawned');
assert(!defender.includes('petLineupSlots'), 'defender does not place fence slots');
assert(defender.includes('summonPet'), 'defender summons from the bar');
assert(stage.includes('pickPetTarget'), 'stage routes aggro through the near-pet filter');
assert(stage.includes('petContactDamage'), 'pet bites are separate from barricade DPS');
assert(hud.includes('setOrigin(0, 0.5)'), 'bar origin is left-middle');
assert(hud.includes('.arc('), 'cooldown ring is a code arc');
assert(hud.includes('64') && hud.includes('32') && hud.includes('16'), 'bar is 64×32 and orbs are 16');
assert(!hud.includes('出戰中'), 'field badge is not the old 出戰中 label');
assert(!hud.includes('沒有目標'), 'summon does not toast 沒有目標');
assert(!combatSrc.includes('fieldLeft'), 'no on-field time limit');
assert(!combatSrc.includes("phase = 'skill'"), 'skill cooldown is not a summon gate');
assert(combatSrc.includes('playPetSummon'), 'summon SFX hook');
assert(combatSrc.includes('playPetDeath'), 'death SFX hook');
assert(combatSrc.includes('playPetReviveReady'), 'revive-ready SFX hook');
assert(combatSrc.includes('OFF_FIELD_REGEN_RATIO'), 'recall regen uses the config ratio');

for (const file of [
  '../src/systems/PetCombat.js',
  '../src/entities/Defender.js',
  '../src/systems/WeaponSystem.js',
  '../src/scenes/StageScene.js',
  '../src/ui/PetPortraitHud.js',
  '../src/entities/Zombie.js',
]) {
  const text = readFileSync(new URL(file, import.meta.url), 'utf8');
  assert(!text.includes('.shake('), `${file} must not call shake`);
}

assert(PET_LINEUP.map((pet) => pet.id).join() === 'phoenix,panda,lion,dragon', 'party order');
assert(PET_LINEUP.map((pet) => pet.element).join() === 'fire,ice,electric,poison', 'element map');
assert(PET_STAGE_KEYS.has('pet-phoenix-baby-skill'), 'phoenix skill loads');
assert(PET_STAGE_KEYS.has('pet-phoenix-baby-hurt'), 'phoenix hurt loads');
assert(PET_STAGE_KEYS.has('pet-phoenix-baby-sleep-start'), 'phoenix sleep-start loads');
assert(PET_STAGE_KEYS.has('pet-phoenix-baby-sleep'), 'phoenix sleep loop loads');
assert(PET_STAGE_KEYS.has('pet-panda-baby-sleep'), 'panda sleep loads');
assert(PET_STAGE_KEYS.has('pet-lion-baby-sleep-start'), 'lion sleep-start loads');
assert(PET_STAGE_KEYS.has('pet-dragon-baby-sleep'), 'dragon sleep loads');
assert(stageLibraryFilter({ category: 'pets', key: 'pet-lion-baby-sleep' }), 'baby sleep passes the stage filter');
assert(PET_STAGE_KEYS.has('pet-panda-baby-move'), 'panda move loads');
assert(PET_STAGE_KEYS.has('fx-pet-phoenix-spark-feather'), 'phoenix bolt loads');
assert(PET_STAGE_KEYS.has('fx-pet-panda-roll-impact'), 'panda impact loads');
assert(PET_STAGE_KEYS.has('fx-pet-lion-pounce-slash'), 'lion slash loads');
assert(!PET_STAGE_KEYS.has('fx-pet-lion-roar-wave'), 'baby lion does not load roar');
assert(PET_STAGE_KEYS.has('fx-pet-dragon-smoke-breath'), 'dragon breath loads');
assert(!PET_STAGE_KEYS.has('fx-pet-dragon-fireball'), 'baby dragon does not load fireball');
assert(!PET_STAGE_KEYS.has('pet-phoenix-young-skill'), 'young form stays unloaded');
assert(PET_STAGE_KEYS.has('ui-pet-phoenix-bar'), 'phoenix bar loads');
assert(PET_STAGE_KEYS.has('ui-pet-dragon-bar'), 'dragon bar loads');
assert(PET_STAGE_KEYS.has('ui-pet-phoenix-head'), 'phoenix head loads');
assert(PET_STAGE_KEYS.has('ui-pet-orb-phoenix-dark'), 'phoenix dark orb loads');
assert(PET_STAGE_KEYS.has('ui-pet-orb-phoenix-lit'), 'phoenix lit orb loads');
assert(PET_STAGE_KEYS.has('ui-pet-orb-phoenix-flash'), 'phoenix flash orb loads');
assert(PET_STAGE_KEYS.has('ui-pet-orb-lion-flash'), 'lion flash orb loads');
assert(PET_STAGE_KEYS.has('ui-pet-orb-dragon-dark'), 'dragon dark orb loads');
assert(stageLibraryFilter({ category: 'hero', key: 'player-girl' }), 'hero still loads');
assert(!stageLibraryFilter({ category: 'pets', key: 'pet-lion-ancient-idle' }), 'ancient filtered');

const petsCfg = GAME_CONFIG.PETS;
assert(petsCfg.REVIVE_CD_MS === 18000, 'revive cooldown is 18s');
assert(petsCfg.OFF_FIELD_REGEN_RATIO === 0.25, 'recall regen is 25% max HP per second');
assert(petsCfg.ORB_FLASH_MS === 1000, 'orb flash is 1s');
assert(petsCfg.UNLOCKED_ORBS === 1, 'only form 1 is unlocked');
assert(petsCfg.ORB_CD_MS.phoenix.join() === '12000,8000,4000', 'phoenix orbs 12/8/4');
assert(petsCfg.ORB_CD_MS.panda.join() === '12000,8000,4000', 'panda orbs 12/8/4');
assert(petsCfg.ORB_CD_MS.lion.join() === '12000,8000,4000', 'lion orbs 12/8/4');
assert(petsCfg.ORB_CD_MS.dragon.join() === '12000,8000,4000', 'dragon orbs 12/8/4');
assert(petsCfg.ORB_CD_MS.phoenix[0] > petsCfg.ORB_CD_MS.phoenix[1], 'S1 is longer than S2');
assert(petsCfg.ORB_CD_MS.phoenix[1] > petsCfg.ORB_CD_MS.phoenix[2], 'S2 is longer than S3');
assert(petsCfg.ORB_CD_MS.phoenix[0] * 1 === petsCfg.ORB_CD_MS.phoenix[2] * 3, 'S1:S3 cooldown ratio is 3:1');
assert(GAME_CONFIG.PETS.HP === 192, 'shared pet HP is 192');
assert(petsCfg.HURT_MS >= 400, 'hurt gate lasts at least the 4-frame strip');
assert(petsCfg.HURT_FLASH_MS >= 150 && petsCfg.HURT_FLASH_MS <= 200, `white flash is 150–200ms (${petsCfg.HURT_FLASH_MS})`);
assert(petsCfg.HURT_TINT_MS >= 150 && petsCfg.HURT_TINT_MS <= 200, `red fill is 150–200ms (${petsCfg.HURT_TINT_MS})`);
assert(petsCfg.HURT_TINT_COLOR === 0xff2a2a, 'red phase is a solid fill, not a light multiply');
assert(petsCfg.HURT_BAR_MS >= petsCfg.HURT_FLASH_MS, 'bar pop lasts through the white flash');
assert(WAVE_DEFS.map((wave) => wave.total).join() === '4,8,16,90', 'stage 1 early waves are thinned; wave 4 stays');
assert(WAVE_DEFS[0].archetypes[0].hp === 40 && WAVE_DEFS[1].archetypes[0].hp === 70, 'wave 1–2 HP rows are unchanged');
assert(WAVE_DEFS[2].archetypes[0].hp === 105, 'wave 3 HP is unchanged');
assert(WAVE_DEFS[3].archetypes.map((row) => row.hp).join() === '50,115,165', 'wave 4 HP mix is unchanged');
assert(BARRICADE_MAX_HP === 720, 'barricade HP is unchanged');
assert(petsCfg.PHOENIX.DAMAGE < 30 && petsCfg.PANDA.DAMAGE < 30, 'pet hits stay under a handgun shot');
assert(petsCfg.PANDA.RANGE >= 80, 'panda reach covers a zombie at the posts');
assert(petsCfg.DRAGON.BURN > 0 && petsCfg.DRAGON.BURN_MS > 0, 'dragon burn is configured');
assert(petsCfg.FLOAT_HOLD_MS >= 600 && petsCfg.FLOAT_HOLD_MS <= 800, 'GO!/Back! hold is 0.6–0.8s');
assert(petsCfg.FLOAT_FADE_MS > 0, 'float fades after the hold');
assert(petsCfg.FLOAT_OFFSET_X === 80 && petsCfg.FLOAT_OFFSET_Y === 68, 'GO!/Back! sits up-right of the pet');
assert(stage.includes('ENEMIES ${alive}'), 'HUD enemies is the on-field count');
assert(!stage.includes('ENEMIES ${remaining}'), 'HUD enemies does not print the stage budget');
assert(PET_AUDIO_KEYS.go === 'go-shout' && PET_AUDIO_KEYS.back === 'back-shout' && PET_AUDIO_KEYS.sleep === 'pet-sleep', 'cue names are reserved');
const soundSrc = readFileSync(new URL('../src/systems/SoundManager.js', import.meta.url), 'utf8');
assert(!soundSrc.includes('go-shout') && !soundSrc.includes('back-shout') && !soundSrc.includes('pet-sleep'), 'SFX is not wired');
assert(!combatSrc.includes("_cue('go-shout'") && !combatSrc.includes("_cueOptional('go-shout'"), 'go-shout is not cued');
assert(combatSrc.includes('ui-float-go') && combatSrc.includes('ui-float-back'), 'float sprites use the primary keys');
assert(!combatSrc.includes('ui-float-go-burst') || combatSrc.indexOf('ui-float-go-burst') > combatSrc.indexOf('ui-float-go'), 'non-burst float is preferred');

const yNear = 220;
const yFar = 520;
const fenceNear = barricadeXAtY(yNear);
const fenceFar = barricadeXAtY(yFar);
const farFromFence = { alive: true, body: {}, x: fenceNear - 110, y: yNear, id: 1 };
const closeToFence = { alive: true, body: {}, x: fenceFar - 36, y: yFar, id: 2 };
const threat = nearestBarricadeThreat([farFromFence, closeToFence]);
assert(threat === closeToFence, 'target is closest to the fence, not the pet');

const range = petsCfg.PANDA.RANGE * 1.6;
const yHalf = petsCfg.PANDA.Y_HALF * 1.6;
assert(inForwardBox(1000, 400, 900, 400, range, yHalf), 'box includes a zombie in front');
assert(!inForwardBox(1000, 400, 1040, 400, range, yHalf), 'box rejects a zombie behind the pet');
assert(!inForwardBox(1000, 400, 400, 400, range, yHalf), 'box rejects a zombie past short range');

const half = (petsCfg.LION.HALF_ANGLE_DEG * Math.PI) / 180;
assert(inLeftCone(500, 300, 400, 300, 160, half), 'cone includes straight left');
assert(!inLeftCone(500, 300, 500, 460, 200, half), 'cone rejects a target beside the pet');
assert(!inLeftCone(500, 300, 200, 300, 100, half), 'cone respects range');

const straight = leftBoltVelocity(800, 400, 500, 400, 340, (42 * Math.PI) / 180);
assert(straight.vx < 0, 'bolt travels left');
assert(Math.abs(straight.vy) < 1, 'same-lane bolt is straight');
const clamped = leftBoltVelocity(800, 400, 700, 20, 340, (42 * Math.PI) / 180);
assert(clamped.vx < 0, 'clamped bolt still travels left');
const clampedAim = Math.atan2(clamped.vy, clamped.vx);
const clampedOff = Math.atan2(Math.sin(clampedAim - Math.PI), Math.cos(clampedAim - Math.PI));
assert(Math.abs(clampedOff) <= (42 * Math.PI) / 180 + 0.02, 'aim stays inside the left cone');

const melee = closestThreatWhere([farFromFence, closeToFence], (z) =>
  inForwardBox(fenceFar + 20, yFar, z.x, z.y, range, yHalf)
);
assert(melee === closeToFence, 'in-range smack prefers the fence threat');

const nearPet = { x: 180, y: 120, hp: 10, alive: true, id: 'near' };
const farPet = { x: 40, y: 40, hp: 10, alive: true, id: 'far' };
const deadPet = { x: 190, y: 120, hp: 0, alive: false, id: 'dead' };
assert(nearestFieldPet({ x: 200, y: 120 }, [farPet, deadPet, nearPet]) === nearPet, 'aggro picks the nearest living pet');
assert(nearestFieldPet({ x: 200, y: 120 }, [deadPet]) === null, 'dead pets are not aggro targets');
assert(petReachableBeforeFence({ x: 420, hp: 4, alive: true }, 400, 30), 'pet in front of the halt is reachable');
assert(!petReachableBeforeFence({ x: 500, hp: 4, alive: true }, 400, 30), 'pet behind the fence is not a chase');

const audio = { summon: 0, death: 0, revive: 0, playPetSummon() { this.summon += 1; }, playPetDeath() { this.death += 1; }, playPetReviveReady() { this.revive += 1; }, playHitImpact() {} };
const scene = mockScene(audio);
const combat = new PetCombat(scene);
const views0 = combat.portraitViews();
assert(views0.length === 4, 'four bars');
assert(views0.map((view) => view.barKey).join() === 'ui-pet-phoenix-bar,ui-pet-panda-bar,ui-pet-lion-bar,ui-pet-dragon-bar', 'bar keys');
assert(views0[0].headKey === 'ui-pet-phoenix-head', 'phoenix head key is on the view');
assert(views0[0].orbs.map((orb) => orb.dark).join() === 'ui-pet-orb-phoenix-dark,ui-pet-orb-phoenix-dark,ui-pet-orb-phoenix-dark', 'three phoenix orbs');
assert(views0[0].orbs[0].lit === 'ui-pet-orb-phoenix-lit' && views0[0].orbs[0].flash === 'ui-pet-orb-phoenix-flash', 'phoenix lit and flash keys');
assert(views0.every((view) => view.orbs.length === 3), 'three orbs on every bar');
assert(views0.every((view) => view.orbs[0].unlocked && !view.orbs[1].unlocked && !view.orbs[2].unlocked), 'only orb 1 starts unlocked');
assert(views0.every((view) => view.orbs[1].state === 'locked' && view.orbs[2].state === 'locked'), 'orbs 2 and 3 are locked');
assert(views0.every((view) => view.phase === 'ready' && view.tappable && view.hp === 1), 'starts ready, full HP, off the field');
assert(combat.fieldPets().length === 0, 'nothing is summoned at stage start');

const laneY = 432;
const fenceX = barricadeXAtY(laneY);
const player = { x: fenceX + layoutPx(28), y: laneY };
const foeX = fenceX - layoutPx(110);
const empty = combat.summon(0, player, []);
assert(empty.ok && empty.id === 'phoenix', 'summon does not require a target');
assert(combat.portraitViews()[0].phase === 'field', 'empty field still deploys');
assert(audio.summon === 1, 'deploy plays the summon hook');
const recalledEmpty = combat.summon(0, player, []);
assert(recalledEmpty.reason === 'recall', 'second tap recalls');
assert(combat.fieldPets().length === 0, 'recall leaves the field');
assert(combat.portraitViews()[0].phase === 'ready' && combat.portraitViews()[0].tappable, 'recalled bar can summon again');
assert(audio.summon === 1, 'recall is not another summon');

const zombie = mockZombie(foeX, laneY);
const first = combat.summon(0, player, [zombie]);
assert(first.ok && first.id === 'phoenix', 'phoenix summons');
assert(audio.summon === 2, 'summon hook on the real deploy');
assert(combat.fieldPets().length === 1, 'one pet on the field');
assert(combat.portraitViews()[0].tappable === true, 'field bar stays tappable for recall');
assert(combat.portraitViews()[0].grey === false, 'a living pet is not grey');

const spawned = combat.fieldPets()[0];
const behind = spawned.x > player.x;
assert(behind, `pet pops behind the player (${spawned.x} > ${player.x})`);

const cd = petsCfg.ORB_CD_MS.phoenix[0];
const flash = petsCfg.ORB_FLASH_MS;
combat.update(cd / 2, [zombie], player);
const halfOrb = combat.portraitViews()[0].orbs[0];
assert(halfOrb.state === 'cd' && Math.abs(halfOrb.ratio - 0.5) < 0.02, `orb 1 ring is halfway (${halfOrb.ratio})`);
assert(combat.castLog.length === 0, 'halfway orb has not cast');
assert(combat.portraitViews()[0].phase === 'field', 'still out with no field limit');
combat.update(cd / 2, [zombie], player);
assert(combat.portraitViews()[0].orbs[0].state === 'flash', 'filled orb flashes');
assert(combat.castLog.length === 0, 'flash has not cast yet');
combat.update(flash, [zombie], player);
assert(scene._sprites.some((sprite) => sprite._played.includes('pet-phoenix-baby-skill')), 'phoenix skill strip played');
pump(combat, scene, 1600, zombie, player);
assert(combat.castLog.some((entry) => entry.id === 'phoenix' && entry.orb === 0), 'orb 1 auto-cast');
assert(zombie.hp < zombie.maxHp, `phoenix bolt landed (hp ${zombie.hp})`);
assert(scene._sprites.some((sprite) => sprite._played.includes('fx-pet-phoenix-spark-feather')), 'spark feather FX played');
assert(!combat.castLog.some((entry) => entry.orb > 0), 'locked orbs did not cast');
assert(combat.portraitViews()[0].phase === 'field', 'pet stays out after the cast');

const hurt = combat.fieldPets()[0];
const petBody = scene._sprites.find((sprite) => sprite.textureKey === 'pet-phoenix-baby-idle');
const hurtPlays = () => petBody._played.filter((key) => key === 'pet-phoenix-baby-hurt').length;
hurt.takeDamage(48);
assert(Math.abs(hurt.hp - (petsCfg.HP - 48)) < 0.01, 'damage sticks');
assert(hurtPlays() === 1, 'first hit plays the hurt strip once');
assert(combat.portraitViews()[0].hitSeq === 1, 'portrait hit pulse increments once');
assert(petBody._tintFill === 0xffffff, 'hit flash is white');
const recalled = combat.summon(0, player, [zombie]);
assert(recalled.reason === 'recall', 'tap while out recalls');
assert(combat.fieldPets().length === 0, 'recalled pet is off the field');
const recalledView = combat.portraitViews()[0];
assert(recalledView.phase === 'ready' && Math.abs(recalledView.hp - (petsCfg.HP - 48) / petsCfg.HP) < 0.02, 'recall keeps the current HP');
combat.update(1000, [], player);
const healed = combat.portraitViews()[0];
const expected = (petsCfg.HP - 48 + petsCfg.HP * petsCfg.OFF_FIELD_REGEN_RATIO) / petsCfg.HP;
assert(healed.phase === 'ready' && Math.abs(healed.hp - expected) < 0.02, `one second of regen (${healed.hp} vs ${expected})`);
const resummon = combat.summon(0, player, [zombie]);
assert(resummon.ok && resummon.reason === 'ok', 'resummon has no deploy cooldown');
assert(Math.abs(combat.fieldPets()[0].hp - expected * petsCfg.HP) < 1, 'resummon does not refill HP');
combat.update(1000, [zombie], player);
assert(Math.abs(combat.fieldPets()[0].hp - expected * petsCfg.HP) < 1, 'on-field pets do not regen');

const target = combat.fieldPets()[0];
const killed = target.takeDamage(10000);
assert(killed, 'lethal damage downs the pet');
assert(audio.death === 1, 'death hook');
const down = combat.portraitViews()[0];
assert(down.phase === 'revive' && down.grey, 'death greys the bar');
assert(down.tappable === false, 'revive is not tappable');
assert(down.hp === 0, 'dead bar is empty');
assert(combat.fieldPets().length === 0, 'death leaves the field');
const blocked = combat.summon(0, player, [mockZombie(foeX, laneY)]);
assert(blocked.reason === 'revive', 'cannot summon during revive');
combat.update(1000, [], player);
assert(combat.portraitViews()[0].phase === 'revive' && combat.portraitViews()[0].hp === 0, 'dead pets do not regen');
combat.update(petsCfg.REVIVE_CD_MS - 1000, [], player);
assert(combat.portraitViews()[0].phase === 'ready' && combat.portraitViews()[0].hp === 1, 'revive restores a full bar');
assert(audio.revive === 1, 'revive-ready hook');

const gateScene = mockScene(audio);
const gate = new PetCombat(gateScene);
assert(gate.summon(0, player, []).ok, 'flinch test summons');
const gatePet = gate.fieldPets()[0];
const gateBody = gateScene._sprites.find((sprite) => sprite.textureKey === 'pet-phoenix-baby-idle');
const gateHurts = () => gateBody._played.filter((key) => key === 'pet-phoenix-baby-hurt').length;
gatePet.takeDamage(10);
gatePet.takeDamage(10);
assert(gateHurts() === 1, 'a second hit inside the flinch does not restart the hurt strip');
assert(gate.portraitViews()[0].hitSeq === 1, 'portrait hit pulse stays gated for the flinch');
assert(Math.abs(gatePet.hp - (petsCfg.HP - 20)) < 0.01, 'gated feedback still applies HP');
assert(gateBody._tintFill === 0xffffff, 'the flinch opens on a white fill');
for (let i = 0; i < 8; i++) {
  gatePet.takeDamage(0.35);
  gate.update(16, [], player);
}
assert(gateHurts() === 1, 'per-frame bite DPS does not restart the hurt strip');
assert(gateBody._tintFill === 0xffffff, 'white fill is still up inside 150–200ms');
assert(gateScene._labels.some((label) => label.active && String(label.label).startsWith('-')), 'fractional bites stack into a visible -N');
gate.update(petsCfg.HURT_FLASH_MS, [], player);
assert(gateBody._tintFill === petsCfg.HURT_TINT_COLOR, 'white flash gives way to a solid red fill');
gate.update(petsCfg.HURT_TINT_MS + 40, [], player);
assert(gateBody._tintFill == null && gateBody._tint == null, 'red fill clears after its window');
gate.update(petsCfg.HURT_MS, [], player);
gatePet.takeDamage(5);
assert(gateHurts() === 2, 'a hit after the flinch plays the hurt strip again');
assert(gate.portraitViews()[0].hitSeq === 2, 'portrait hit pulse increments after the flinch');
gate.update(petsCfg.HURT_FLASH_MS, [], player);
assert(gateBody._tintFill === petsCfg.HURT_TINT_COLOR, 'the next flinch also reaches the red fill');
gate.destroy();

const castScene = mockScene(audio);
const casts = new PetCombat(castScene);
const styles = ['pet-phoenix-baby-skill', 'pet-panda-baby-skill', 'pet-lion-baby-skill', 'pet-dragon-baby-skill'];
const fxKeys = [
  'fx-pet-phoenix-spark-feather',
  'fx-pet-panda-roll-impact',
  'fx-pet-lion-pounce-slash',
  'fx-pet-dragon-smoke-breath',
];
for (let i = 0; i < 4; i++) {
  const foe = mockZombie(foeX, laneY);
  assert(casts.summon(i, player, [foe]).ok, `summon ${PET_LINEUP[i].id}`);
  const orbCd = petsCfg.ORB_CD_MS[PET_LINEUP[i].id][0];
  pump(casts, castScene, orbCd + flash + 1600, foe, player);
  const played = castScene._sprites.some((sprite) => sprite._played.includes(styles[i]));
  assert(played, `${PET_LINEUP[i].id} cast ${styles[i]}`);
  assert(castScene._sprites.some((sprite) => sprite._played.includes(fxKeys[i])), `${PET_LINEUP[i].id} used its baby FX`);
  assert(foe.hp < foe.maxHp || foe.burn || foe.slow, `${PET_LINEUP[i].id} applied its attack`);
  assert(casts.portraitViews()[i].phase === 'field', `${PET_LINEUP[i].id} does not time out`);
  casts.summon(i, player, [foe]);
}
casts.destroy();

const formTags = {
  phoenix: ['phoenix-nova', 'phoenix-dive'],
  panda: ['panda-freeze', 'panda-blizzard'],
  lion: ['lion-chain', 'lion-stomp'],
  dragon: ['dragon-cloud', 'dragon-rain'],
};
for (let i = 0; i < 4; i++) {
  const id = PET_LINEUP[i].id;
  const foe = mockZombie(foeX, laneY + i * 2);
  foe.maxHp = 400;
  foe.hp = 400;
  const formScene = mockScene(audio);
  const one = new PetCombat(formScene);
  one.setUnlockedOrbs(3);
  assert(one.summon(i, player, [foe]).ok, `form test summon ${id}`);
  assert(one.portraitViews()[i].orbs.every((orb) => orb.unlocked), `${id} orbs unlock together`);
  const longest = Math.max(...petsCfg.ORB_CD_MS[id]);
  pump(one, formScene, longest + flash + 2200, foe, player);
  const seen = new Set(one.castLog.filter((entry) => entry.id === id).map((entry) => entry.orb));
  assert(seen.has(0) && seen.has(1) && seen.has(2), `${id} cast orbs 1–3 (${[...seen].join(',')})`);
  for (const tag of formTags[id]) {
    assert(one.fxLog.includes(tag), `${id} spawned ${tag}`);
  }
  assert(formScene._circles.length > 0, `${id} placeholder circles`);
  if (id === 'phoenix' || id === 'dragon') assert(foe.burn, `${id} form applied burn`);
  if (id === 'panda') assert(foe.slow && foe.rootMs > 0, 'panda freeze roots and blizzard slows');
  if (id === 'lion') assert(foe.rootMs > 0, 'lion stomp roots');
  one.destroy();
}
combat.destroy();

const wallScene = mockZombieScene();
const marcher = new Zombie(wallScene, { x: 780, y: 400, hp: 40, speed: 40, dps: 12, variant: 'walker' });
const hidden = { x: 1400, y: 400, hp: 50, alive: true, radius: layoutPx(18), hurt: 0, takeDamage(n) { this.hurt += n; this.hp -= n; } };
for (let i = 0; i < 80; i++) {
  marcher.update(0.05, 900, hidden);
  const dmg = marcher.petContactDamage(0.05);
  if (dmg > 0) hidden.takeDamage(dmg);
}
assert(marcher.atBarricade, 'unreachable pet keeps the barricade march');
assert(hidden.hurt === 0, 'pet behind the fence takes no bite');
assert(marcher.contactDamage(0.05) > 0, 'barricade contact DPS still applies');

const chaseScene = mockZombieScene();
const chaser = new Zombie(chaseScene, { x: 200, y: 360, hp: 40, speed: 48, dps: 10, variant: 'walker' });
const bait = {
  x: 420,
  y: 460,
  hp: 80,
  alive: true,
  radius: layoutPx(18),
  hurt: 0,
  takeDamage(n) {
    this.hurt += n;
    this.hp -= n;
    if (this.hp <= 0) this.alive = false;
  },
};
const startY = chaser.y;
for (let i = 0; i < 120; i++) {
  chaser.update(0.05, 1100, bait);
  const dmg = chaser.petContactDamage(0.05);
  if (dmg > 0 && chaser.petBiteTarget) chaser.petBiteTarget.takeDamage(dmg);
}
assert(chaser.y !== startY, 'chaser leaves its lane toward the pet');
assert(!chaser.atBarricade, 'chaser does not lock onto the barricade');
assert(bait.hurt > 0, `pet HP was bitten (${bait.hurt})`);
assert(chaser.contactDamage(0.05) === 0, 'a pet bite does not also damage the barricade');

const rootScene = mockZombieScene();
const rooted = new Zombie(rootScene, { x: 200, y: 400, hp: 40, speed: 80, dps: 12, variant: 'walker' });
const rootX = rooted.body.x;
rooted.applyRoot(5000);
for (let i = 0; i < 30; i++) rooted.update(0.05, 1100, null);
assert(Math.abs(rooted.body.x - rootX) < 0.5, 'root stops the march');
assert(rooted.contactDamage(0.05) === 0, 'a rooted marcher is not at the barricade');
rooted.tickStatus(5000);
rooted.update(0.05, 1100, null);
assert(rooted.body.x > rootX, 'march resumes when the root ends');

const bedScene = mockScene(audio);
const beds = new PetCombat(bedScene);
for (let i = 0; i < 4; i++) {
  assert(beds.summon(i, player, []).ok, `bed summon ${PET_LINEUP[i].id}`);
  assert(beds.summon(i, player, []).reason === 'recall', `bed recall ${PET_LINEUP[i].id}`);
}
assert(beds.fieldPets().length === 0, 'recalled pets are off the field while they seek a bed');
assert(beds.floatLog.some((entry) => entry.key === 'ui-float-go'), 'summon uses ui-float-go');
assert(beds.floatLog.some((entry) => entry.key === 'ui-float-back'), 'recall uses ui-float-back');
assert(beds.floatLog.every((entry) => !String(entry.key).includes('burst')), 'burst floats stay unused when the primary exists');
assert(beds.cueLog.includes('go-shout') && beds.cueLog.includes('back-shout'), 'go and back cue names are noted');
pump(beds, bedScene, 2500, null, player);
const slots = petLineupSlots();
const spots = [0, 1, 2, 3].map((i) => beds.restSpot(i));
for (let i = 0; i < 4; i++) {
  const spot = spots[i];
  const id = PET_LINEUP[i].id;
  assert(spot && spot.rest === 'sleep', `${id} is asleep (${spot && spot.rest})`);
  assert(spot.slot === i, `${id} keeps its own bed`);
  assert(Math.abs(spot.x - slots[i].x) < 2 && Math.abs(spot.y - slots[i].y) < 2, `${id} reached the bed`);
  assert(spot.x > barricadeXAtY(spot.y), `${id} sleeps on the safe side of the fence`);
  assert(spot.depth === petSleepDepth(spot.y), `${id} depth is the sleep bias`);
  assert(spot.depth < depthFromY(spot.y, -2), `${id} draws behind the fence posts`);
  const body = bedScene._sprites.find((sprite) => sprite._played.includes(`pet-${id}-baby-sleep-start`));
  assert(body, `${id} played sleep-start`);
  const startAt = body._played.indexOf(`pet-${id}-baby-sleep-start`);
  const loopAt = body._played.indexOf(`pet-${id}-baby-sleep:loop`);
  assert(loopAt > startAt, `${id} loops sleep after sleep-start`);
}
for (let i = 0; i < spots.length; i++) {
  for (let j = i + 1; j < spots.length; j++) {
    const gap = Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y);
    assert(gap > layoutPx(40), `beds ${i} and ${j} do not overlap (${gap})`);
  }
}
assert(beds.cueLog.includes('pet-sleep'), 'pet-sleep cue name is noted when they lie down');
const home = beds.restSpot(0);
const woke = beds.summon(0, player, [zombie]);
assert(woke.reason === 'ok', 'resummon from sleep');
const stepped = beds.fieldPets()[0];
assert(Math.abs(stepped.x - home.x) < 1.5 && Math.abs(stepped.y - home.y) < 1.5, 'resummon does not teleport');
assert(beds.restSpot(0) === null, 'a woken pet is not still in the bed list');
const beforeThreat = Math.hypot(home.x - zombie.x, home.y - zombie.y);
pump(beds, bedScene, 900, zombie, player);
const walked = beds.fieldPets()[0];
const afterThreat = Math.hypot(walked.x - zombie.x, walked.y - zombie.y);
assert(afterThreat < beforeThreat - 40, `wakes, then walks out toward the threat (${beforeThreat} → ${afterThreat})`);
beds.destroy();

const fadeScene = mockScene(audio);
const fades = new PetCombat(fadeScene);
assert(fades.summon(0, player, []).ok, 'float summon');
const go = fadeScene._sprites.find((sprite) => sprite.textureKey === 'ui-float-go');
assert(go && go.active, 'GO! sprite is beside the pet');
assert(go.originX === 0.5 && go.originY === 1, 'GO! origin is bottom center');
assert(floatClearsHero(go, player), 'GO! does not cover the hero beside the pet');
assert(floatInsideView(go, fadeScene), 'GO! stays inside the camera');
const shoved = placeFloatLabel(
  3000,
  700,
  { left: 40, right: 40, up: 32, down: 0 },
  { left: 840, right: 2100, top: 8, bottom: 710 },
  null
);
assert(shoved.x + 40 <= 2100 && shoved.x - 40 >= 840, 'clamp pulls a past-the-edge label back inside');
const nearPlayer = { x: player.x, y: grassYMax() };
const nearScene = mockScene(audio);
const near = new PetCombat(nearScene);
assert(near.summon(0, nearPlayer, []).ok, 'near-lane float summon');
const nearGo = nearScene._sprites.find((sprite) => sprite.textureKey === 'ui-float-go');
assert(floatClearsHero(nearGo, nearPlayer), 'GO! clears the hero on the near lane');
assert(floatInsideView(nearGo, nearScene), 'near-lane GO! stays inside the camera');
near.destroy();
const edgeY = grassYMax();
const edgePlayer = { x: barricadeXAtY(edgeY) + layoutPx(32), y: edgeY };
const edgeScene = mockScene(audio);
const edge = new PetCombat(edgeScene);
assert(edge.summon(0, edgePlayer, []).ok, 'bottom-right summon');
const edgeGo = edgeScene._sprites.find((sprite) => sprite.textureKey === 'ui-float-go');
assert(floatInsideView(edgeGo, edgeScene), 'bottom-right GO! is clamped on screen');
assert(floatClearsHero(edgeGo, edgePlayer), 'bottom-right GO! does not sit on the hero back');
edge.summon(0, edgePlayer, []);
const edgeBack = edgeScene._sprites.find((sprite) => sprite.textureKey === 'ui-float-back');
assert(floatInsideView(edgeBack, edgeScene), 'bottom-right Back! is clamped on screen');
assert(floatClearsHero(edgeBack, edgePlayer), 'bottom-right Back! does not sit on the hero back');
edge.destroy();
fades.update(petsCfg.FLOAT_HOLD_MS - 40, [], player);
assert(go.active && go.alpha === 1, 'float holds through 0.6–0.8s');
fades.update(40 + petsCfg.FLOAT_FADE_MS + 30, [], player);
assert(go.active === false, 'float fades out after the hold');
fades.destroy();

if (failed) {
  console.error(`${failed} pet combat check(s) failed`);
  process.exit(1);
}
console.log('pet combat checks passed');

/** Label must miss the hero and stay inside the stage camera. */
function floatClearsHero(node, player) {
  const hero = floatHeroRect(player);
  const box = floatLabelBox(node);
  if (!node || !hero) return false;
  const label = { l: node.x - box.left, r: node.x + box.right, t: node.y - box.up, b: node.y + box.down };
  return label.r <= hero.l || label.l >= hero.r || label.b <= hero.t || label.t >= hero.b;
}

function floatInsideView(node, scene) {
  const box = floatLabelBox(node);
  const cam = scene.cameras.main;
  const margin = layoutPx(4);
  const left = cam.scrollX + margin;
  const right = cam.scrollX + cam.width - margin;
  const top = (cam.scrollY || 0) + margin;
  const bottom = (cam.scrollY || 0) + cam.height - margin;
  return (
    node.x - box.left >= left - 0.51 &&
    node.x + box.right <= right + 0.51 &&
    node.y - box.up >= top - 0.51 &&
    node.y + box.down <= bottom + 0.51
  );
}

function pump(combat, scene, ms, foe, player) {
  const step = 50;
  for (let t = 0; t < ms; t += step) {
    combat.update(step, foe ? [foe] : [], player);
    advanceSkills(scene);
  }
}

function advanceSkills(scene) {
  for (const sprite of scene._sprites) {
    if (sprite._anim.key.endsWith('-skill') && sprite._anim.playing) {
      sprite._anim.acc += 50;
      if (sprite._anim.acc >= 80) {
        sprite._anim.acc = 0;
        sprite._anim.frame += 1;
        if (sprite._anim.frame >= 8) sprite._anim.playing = false;
      }
    }
  }
}

function mockScene(audio) {
  const state = { now: 0 };
  const sprites = [];
  const circles = [];
  const labels = [];
  const text = (_x, _y, value) => {
    const node = {
      active: true,
      label: value,
      setText(next) { node.label = next; return node; },
      setAlpha() { return node; },
      setOrigin() { return node; },
      setDepth() { return node; },
      once() { return node; },
      destroy() { node.active = false; },
    };
    labels.push(node);
    return node;
  };
  const midY = (grassYMin() + grassYMax()) / 2;
  const scene = {
    _sprites: sprites,
    _circles: circles,
    _labels: labels,
    cameras: {
      main: {
        scrollX: cameraScrollX(barricadeXAtY(midY)),
        scrollY: 0,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
      },
    },
    audio,
    time: {
      get now() {
        state.now += 16;
        return state.now;
      },
      delayedCall() {},
    },
    tweens: {
      add() { return { stop() {} }; },
      killTweensOf() {},
    },
    anims: { exists: () => true },
    textures: { exists: () => true },
    events: { once() {} },
    add: {
      text,
      sprite(x, y, key) {
        const node = mockPetSprite(scene, x, y, sprites);
        node.textureKey = key;
        return node;
      },
      rectangle(x, y, w, h) {
        return mockRect(x, y, w, h);
      },
      circle(x, y, r, color) {
        const node = mockRect(x, y, r * 2, r * 2);
        node.radius = r;
        node.color = color;
        node.setData = () => node;
        circles.push(node);
        return node;
      },
    },
  };
  return scene;
}

function mockPetSprite(scene, x, y, sprites) {
  const anim = { key: '', playing: false, frame: 0, acc: 0 };
  const sprite = {
    x,
    y,
    scaleX: 1,
    scaleY: 1,
    alpha: 1,
    active: true,
    scene,
    _anim: anim,
    _played: [],
    _flipped: false,
    setOrigin(ox, oy) {
      sprite.originX = ox;
      sprite.originY = oy;
      return sprite;
    },
    setScale(sx, sy) {
      sprite.scaleX = sx;
      sprite.scaleY = sy ?? sx;
      return sprite;
    },
    setDepth(value) { sprite.depth = value; return sprite; },
    setFlipX(value) { sprite._flipped = value; return sprite; },
    setFlipY() { return sprite; },
    setAlpha(value) { sprite.alpha = value; return sprite; },
    setRotation() { return sprite; },
    setData() { return sprite; },
    setTintFill(color) {
      sprite._tintFill = color;
      sprite._tint = null;
      return sprite;
    },
    setTint(color) {
      sprite._tint = color;
      sprite._tintFill = null;
      return sprite;
    },
    clearTint() {
      sprite._tintFill = null;
      sprite._tint = null;
      return sprite;
    },
    once() { return sprite; },
    play(key) {
      const name = typeof key === 'string' ? key : key?.key;
      anim.key = name || '';
      anim.frame = 0;
      anim.acc = 0;
      anim.playing = true;
      sprite._played.push(anim.key);
      return sprite;
    },
    anims: {
      get currentAnim() { return { key: anim.key }; },
      get isPlaying() { return anim.playing; },
      get currentFrame() { return { index: anim.frame }; },
      getProgress() { return anim.frame / 8; },
    },
    destroy() { sprite.active = false; },
  };
  sprites.push(sprite);
  return sprite;
}

function mockRect(x, y, w, h) {
  const node = {
    x, y, width: w, height: h, active: true, scaleX: 1, scaleY: 1,
    setOrigin() { return node; },
    setScale(sx, sy) { node.scaleX = sx; node.scaleY = sy ?? sx; return node; },
    setDepth() { return node; },
    setStrokeStyle() { return node; },
    setFillStyle() { return node; },
    setSize(nw, nh) { node.width = nw; node.height = nh; return node; },
    setVisible() { return node; },
    setPosition(nx, ny) { node.x = nx; node.y = ny; return node; },
    destroy() { node.active = false; },
  };
  return node;
}

function mockZombie(x, y) {
  return {
    id: 7,
    alive: true,
    body: {},
    x,
    y,
    maxHp: 40,
    hp: 40,
    visualTop: y - 48,
    bodyCenterY: y - 24,
    goldValue: 10,
    getBounds() {
      return { left: this.x - 28, right: this.x + 28, top: this.y - 56, bottom: this.y };
    },
    takeDamage(amount) {
      this.hp -= amount;
      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        return true;
      }
      return false;
    },
    applySlow(mult, durationMs) {
      this.slow = { mult, durationMs };
    },
    applyBurn(damage, intervalMs, durationMs) {
      this.burn = { damage, intervalMs, durationMs };
    },
    applyRoot(durationMs) {
      this.rootMs = durationMs;
    },
  };
}

function mockZombieScene() {
  return {
    anims: { exists: () => false },
    textures: { exists: () => false },
    tweens: { add() { return { stop() {} }; }, killTweensOf() {} },
    time: { now: 0, delayedCall() {} },
    audio: { playZombieDeath() {}, playZombieHurt() {} },
    add: {
      rectangle(x, y, w, h) {
        return mockRect(x, y, w, h);
      },
    },
  };
}
