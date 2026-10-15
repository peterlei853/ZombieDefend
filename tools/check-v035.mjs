/**
 * v0.35 solo enemy feel booth.
 * Run: node tools/check-v035.mjs
 *
 * `?enemy=<id>` spawns only that catalog enemy and skips the wave queue.
 * `?feel=1` arms 1/2/3/R only when that id is known. Without `?enemy=`,
 * feel is a no-op and the stage still runs the v0.34.1 wave path.
 * Gold, barricade HP, wave totals, and the loudness table stay put.
 *
 * v0.35.1: key 2 starts `player-girl-hurt` and `sfx-enemy-<id>-hurt`
 * on the attack strip's hit frame (`animationupdate`), not on a timer.
 * Key 1 plays `fx-hit-water-burst` on the enemy body with the hit cue.
 *
 *   https://peterlei853.github.io/ZombieDefend/?enemy=office-worker-v2&feel=1
 */
import { existsSync, readFileSync } from 'node:fs';
import {
  APP_VERSION,
  DEMO_ENEMY_IDS,
  demoEnemyId,
  enemyFeelEnabled,
} from '../src/data/GameConfig.js';
import {
  ENEMY_ATTACK_HIT_FRAME,
  ENEMY_SFX_FILES,
  FEEL_HIT_BURST,
  ENEMY_SKILL_STRIPS,
  enemySfxClips,
  enemySfxKey,
  enemySfxUrl,
  enemySkillStrips,
  feelAttackHitFrame,
  feelHitDamage,
} from '../src/data/enemyShowcase.js';
import { AUDIO_VOLUME } from '../src/systems/SoundManager.js';
import { stageLibraryCategories } from '../src/assets/libraryAssets.js';
import { ZOMBIE_BOSS_SKINS, ZOMBIE_LIBRARY_SKINS } from '../src/assets/zombieSprites.js';
import { BARRICADE_MAX_HP, WAVE_DEFS } from '../src/data/waves.js';
import { getGoldByHP } from '../src/data/economy.js';

const IDS = [
  'office-worker-v2',
  'delivery',
  'chef',
  'nurse',
  'brute',
  'riot',
  'trashcan',
  'sprinter',
  'slime',
  'slime-mini',
  'exploder',
  'cyborg',
  'clown',
  'lava-balon',
  'steel-balam',
];

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const titleSrc = readFileSync(new URL('../src/scenes/TitleScene.js', import.meta.url), 'utf8');
const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const soundSrc = readFileSync(new URL('../src/systems/SoundManager.js', import.meta.url), 'utf8');
const zombieSrc = readFileSync(new URL('../src/entities/Zombie.js', import.meta.url), 'utf8');

assert(pkg.version === '0.35.1' && APP_VERSION === '0.35.1', 'package and APP_VERSION are 0.35.1');
assert(html.includes('v0.35.1'), 'document title is v0.35.1');
assert(IDS.join() === DEMO_ENEMY_IDS.join(), 'showcase ids match the catalog list');

for (const id of IDS) {
  assert(demoEnemyId(`?enemy=${id}`) === id, `?enemy=${id}`);
  assert(demoEnemyId(`?enemy=${id.toUpperCase()}`) === id, `uppercase ${id}`);
  assert(demoEnemyId(`?enemy=${id}&feel=1`) === id, `${id} keeps feel=1`);
  assert(enemyFeelEnabled(`?enemy=${id}&feel=1`) === true, `feel arms ${id}`);
  assert(enemyFeelEnabled(`?enemy=${id}`) === false, `enemy alone does not arm keys (${id})`);
  assert(ENEMY_SFX_FILES[id]?.includes('hit'), `${id} packs hit`);
  assert(ENEMY_SFX_FILES[id]?.includes('hurt'), `${id} packs hurt`);
  assert(ENEMY_SFX_FILES[id]?.includes('die'), `${id} packs die`);
  for (const cue of ['hit', 'hurt', 'die']) {
    const url = enemySfxUrl(id, cue);
    assert(enemySfxKey(id, cue) === `sfx-enemy-${id}-${cue}`, `${id} ${cue} key`);
    assert(existsSync(new URL(`../${url}`, import.meta.url)), `${url} exists`);
  }
  for (const row of enemySkillStrips(id)) {
    assert(ENEMY_SFX_FILES[id].includes(row.cue), `${id} skill cue ${row.cue} is packed`);
    assert(existsSync(new URL(`../${enemySfxUrl(id, row.cue)}`, import.meta.url)), `${id} ${row.cue} file`);
  }
}

assert(demoEnemyId('') === null, 'missing query is ignored');
assert(demoEnemyId('?feel=1') === null, 'feel alone is not an enemy');
assert(demoEnemyId('?enemy=') === null, 'empty enemy is ignored');
assert(demoEnemyId('?enemy=handgun') === null, 'unknown id is ignored');
assert(demoEnemyId('?enemy=Office-Worker-V2 ') === 'office-worker-v2', 'trim and lowercase');
assert(enemyFeelEnabled('') === false, 'feel is off with no query');
assert(enemyFeelEnabled('?feel=1') === false, 'feel without enemy is a no-op');
assert(enemyFeelEnabled('?enemy=nope&feel=1') === false, 'feel with an unknown id is a no-op');
assert(enemyFeelEnabled('?enemy=office-worker-v2&feel=0') === false, 'feel=0 stays off');

assert(enemySkillStrips('office-worker-v2').length === 0, 'office-worker-v2 has no skill strips');
assert(enemySkillStrips('delivery').length === 0 && enemySkillStrips('chef').length === 0, 'delivery and chef have no skill strips');
assert(ENEMY_SKILL_STRIPS.nurse[0]?.cue === 'skill-attach', 'nurse skill is attach');
assert(enemySkillStrips('lava-balon').some((row) => row.cue === 'enrage'), 'lava enrage is in the skill cycle');
assert(enemySkillStrips('steel-balam').some((row) => row.cue === 'skill-ground_smash'), 'steel smash is in the skill cycle');
assert(enemySfxClips().some((clip) => clip.key === 'sfx-enemy-office-worker-v2-hit'), 'office hit clip is preloaded by key');
assert(enemySfxClips().length === 72, 'pack is 72 clips');

assert(feelHitDamage(40) === 14, 'three feel hits cross the wave-1 40 HP row');
assert(14 * 2 < 40 && 14 * 3 >= 40, 'the third feel hit is the one that kills');

assert(titleSrc.includes('demoEnemyId()'), 'title auto-starts for ?enemy=');
assert(stageSrc.includes('demoEnemyId()'), 'stage reads the enemy query itself');
assert(stageSrc.includes('enemyFeelEnabled()'), 'stage reads the feel query itself');
assert(stageSrc.includes('KeyCodes.ONE'), 'key 1 is installed');
assert(stageSrc.includes('KeyCodes.TWO'), 'key 2 is installed');
assert(stageSrc.includes('KeyCodes.THREE'), 'key 3 is installed');
assert(stageSrc.includes('KeyCodes.R'), 'R is installed');
assert(stageSrc.includes('1 HIT') && stageSrc.includes('2 HURT'), 'hit and hurt chips');
assert(stageSrc.includes('3 SKILL') && stageSrc.includes('R RESET'), 'skill and reset chips');
assert(stageSrc.includes('waveDefs: []'), 'solo arena does not queue the normal waves');
assert(stageSrc.includes('if (this.enemyFeel)'), 'feel mode holds the combat loop');
assert(stageSrc.includes('playEnemyCue'), 'stage plays the per-enemy cues');
assert(zombieSrc.includes('playEnemyCue'), 'zombie hits use the showcase cue when that enemy is selected');

const HIT_FRAMES = {
  'office-worker-v2': 4,
  delivery: 5,
  chef: 5,
  nurse: 6,
  brute: 4,
  riot: 4,
  trashcan: 3,
  sprinter: 4,
  slime: 4,
  exploder: 4,
  cyborg: 5,
  clown: 4,
  'lava-balon': 4,
  'steel-balam': 4,
};
for (const id of IDS) {
  const skin = ZOMBIE_LIBRARY_SKINS[id] || ZOMBIE_BOSS_SKINS[id];
  const attack = skin?.actions?.attack;
  if (!attack) {
    assert(feelAttackHitFrame(id) == null, `${id} without an attack strip has no hit frame`);
    assert(!(id in ENEMY_ATTACK_HIT_FRAME), `${id} is not in the hit-frame table`);
  } else {
    assert(feelAttackHitFrame(id) === HIT_FRAMES[id], `${id} attack hit frame is ${HIT_FRAMES[id]}`);
    assert(ENEMY_ATTACK_HIT_FRAME[id] === HIT_FRAMES[id], `${id} table matches feelAttackHitFrame`);
  }
}
assert(Object.keys(HIT_FRAMES).length === IDS.length - 1, 'every attack id except slime-mini has a hit frame');
assert(feelAttackHitFrame('office-worker-v2') === 4, 'office-worker-v2 strike is attack frame 4');

const hitFn = stageSrc.slice(stageSrc.indexOf('\n  _feelHit() {'), stageSrc.indexOf('\n  _feelHurt() {'));
assert(FEEL_HIT_BURST === 'fx-hit-water-burst', 'feel hit overlay is the cyan burst');
assert(hitFn.includes('_playFeelHitBurst'), 'key 1 plays the burst');
assert(!hitFn.includes('playLibraryFx'), 'key 1 delegates the overlay to the burst helper');
const burstFn = stageSrc.slice(stageSrc.indexOf('\n  _playFeelHitBurst(z) {'), stageSrc.indexOf('\n  _onFeelAttackHit() {'));
assert(burstFn.includes('playLibraryFx') && burstFn.includes('FEEL_HIT_BURST'), 'burst uses playLibraryFx');
assert(burstFn.includes('bodyCenterY'), 'burst is centered on the enemy body');
assert(hitFn.indexOf('_playFeelHitBurst') < hitFn.indexOf('takeDamage'), 'burst plays before the HP tick');
const burstPng = new URL('../assets/library/characters/hero/girl/fx/fx-hit-water-burst.png', import.meta.url);
assert(existsSync(burstPng), 'fx-hit-water-burst.png is in the catalog');
const index = JSON.parse(readFileSync(new URL('../assets/library/asset-index.json', import.meta.url), 'utf8'));
const burst = index.assets.find((asset) => asset.key === 'fx-hit-water-burst');
assert(burst?.category === 'hero' && burst?.frames === 8, 'burst is an 8-frame hero fx sheet');
assert(burst?.frameWidth === 64 && burst?.frameHeight === 64 && burst?.frameRate === 14, 'burst is 64×64 @ 14fps');
assert(burst?.origin?.[0] === 0.5 && burst?.origin?.[1] === 0.5 && burst?.loop === false, 'burst origin is center, once');

const hurtFn = stageSrc.slice(stageSrc.indexOf('\n  _feelHurt() {'), stageSrc.indexOf('\n  _playFeelHitBurst(z) {'));
const onHitFn = stageSrc.slice(stageSrc.indexOf('\n  _onFeelAttackHit() {'), stageSrc.indexOf('\n  _feelSkill() {'));
assert(hurtFn.includes('feelAttackHitFrame'), 'key 2 reads the attack hit frame');
assert(hurtFn.includes('playShowcaseAttack'), 'key 2 plays the attack strip');
assert(!hurtFn.includes('_playHeroFeel'), 'key 2 does not start the hero hurt before contact');
assert(!hurtFn.includes('delayedCall'), 'key 2 does not delay the hurt on a timer');
assert(hurtFn.includes('_onFeelAttackHit'), 'key 2 hands contact to the hit callback');
assert(onHitFn.includes("_playHeroFeel('hurt')"), 'contact plays player-girl-hurt');
assert(onHitFn.includes('playEnemyCue') && onHitFn.includes("'hurt'"), 'hurt sfx shares the contact frame');
assert(stageSrc.includes('player-girl-hurt'), 'the hurt pose is player-girl-hurt');
assert(zombieSrc.includes("on('animationupdate'"), 'contact listens to the attack frame');
assert(zombieSrc.includes('animFrame.index'), 'contact reads the shown frame index');
assert(!zombieSrc.slice(zombieSrc.indexOf('_armAttackContact'), zombieSrc.indexOf('_playHurtStrip')).includes('delayedCall'), 'attack contact is not a delayed timer');
assert(zombieSrc.includes("playZombieHurt"), 'normal hits still use the shared hurt cue');
assert(soundSrc.includes('enemySfxClips()'), 'SoundManager preloads the enemy pack');
assert(soundSrc.includes('playEnemyCue'), 'SoundManager exposes playEnemyCue');

assert(stageLibraryCategories('').includes('bosses') === false, 'normal load skips boss sheets');
assert(stageLibraryCategories('?enemy=office-worker-v2').includes('bosses') === false, 'office demo skips boss sheets');
assert(stageLibraryCategories('?enemy=lava-balon').includes('bosses'), 'lava demo loads boss sheets');
assert(stageLibraryCategories('?enemy=steel-balam').includes('bosses'), 'steel demo loads boss sheets');
assert(ZOMBIE_BOSS_SKINS['lava-balon'].actions.hurt === 'zombie-boss-lava-hurt', 'lava hurt strip is wired');
assert(ZOMBIE_BOSS_SKINS['steel-balam'].actions.hurt === 'zombie-boss-steel-hurt', 'steel hurt strip is wired');
assert(ZOMBIE_LIBRARY_SKINS.trashcan.actions.hurt === 'zombie-trashcan-hurt_armor', 'trashcan hurt is the armor flinch');
assert(ZOMBIE_LIBRARY_SKINS.riot.actions.hurt === 'zombie-riot-hurt_armor', 'riot hurt is the armor flinch');
assert(ZOMBIE_LIBRARY_SKINS['slime-mini'].actions.attack === null, 'slime-mini has no attack strip');

assert(BARRICADE_MAX_HP === 720, 'barricade HP stays 720');
assert(getGoldByHP(40) === 10 && getGoldByHP(120) === 15 && getGoldByHP(300) === 50, 'gold-by-HP stays put');
assert(WAVE_DEFS.map((def) => def.total).join() === '5,6,10,48', 'wave totals stay put');
assert(AUDIO_VOLUME.bgm === 0.28, 'BGM volume stays 0.28');
assert(AUDIO_VOLUME.hit === 0.3 && AUDIO_VOLUME.hurt === 0.3 && AUDIO_VOLUME.death === 0.3, 'hit hurt death volumes stay put');
assert(AUDIO_VOLUME.fire === 0.35 && AUDIO_VOLUME.ult === 0.4 && AUDIO_VOLUME.melee === 0.35, 'fire ult melee volumes stay put');
assert(!stageSrc.includes('camera.shake') && !stageSrc.includes('.shake('), 'the camera does not shake');
assert(!stageSrc.includes('localStorage.setItem'), 'stage does not write a save');

if (failed) {
  console.error(`${failed} v0.35 check(s) failed`);
  process.exit(1);
}
console.log('v0.35 checks ok');
