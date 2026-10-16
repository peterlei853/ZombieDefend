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
 * v0.35.2: key 1 no longer plays `fx-hit-water-burst`. Key 1 (ranged) and
 * key 4 (melee) share a 40ms hitstop, a 40ms white flash, 8–12 sparks,
 * and a 2px X knockback.
 * v0.35.3: key 4 stops spawning `fx-slash-overhead` and does not rotate
 * `fx-slash` as a stand-in. Hitstop, flash, sparks, and knockback stay.
 * `FEEL_MELEE_SLASH` is null until `fx-slash-ninja` / `fx-slash-diagonal`.
 * v0.35.4: key 4 plays `fx-slash-ninja` at the body center, rotation 0,
 * and `sfx-slash-ninja` via `playFeelMeleeSlash`. Hitstop, flash, sparks,
 * and 2px knockback stay. Keys 5–9 preview catalog FX only
 * (`fx-slash-enemy-red`, `fx-slash-ally-white`, `fx-slash-dot`,
 * `fx-hit-fire`, `fx-hit-water`, 4×24 @ 8 fps, drawn left → right). No damage. Key 7 plays the
 * cataloged `sfx-slash-dot` default. The other four previews stay silent.
 *
 *   https://peterlei853.github.io/ZombieDefend/?enemy=office-worker-v2&feel=1
 */
import { createHash } from 'node:crypto';
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
  ENEMY_SKILL_STRIPS,
  enemySfxClips,
  enemySfxKey,
  enemySfxUrl,
  enemySkillStrips,
  feelAttackHitFrame,
  feelHitDamage,
} from '../src/data/enemyShowcase.js';
import {
  FEEL_HIT_FLASH_MS,
  FEEL_HIT_KNOCK_PX,
  FEEL_HIT_PARTICLE_MAX,
  FEEL_HIT_PARTICLE_MIN,
  FEEL_HIT_SHAKE_MS,
  FEEL_MELEE_SECTOR,
  FEEL_MELEE_SLASH,
  FEEL_MELEE_SLASH_SFX,
  FEEL_WAVE_DEMOS,
  feelImpactDirX,
  feelKnockOffset,
  feelMeleeSlashPose,
  feelParticleCount,
  feelUnitDisplayHeight,
  feelWaveScale,
  planFeelParticles,
  playFeelImpact,
  playFeelWaveFx,
} from '../src/systems/feelImpact.js';
import { AUDIO_VOLUME, GAME_AUDIO } from '../src/systems/SoundManager.js';
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

assert(pkg.version === '0.35.4' && APP_VERSION === '0.35.4', 'package and APP_VERSION are 0.35.4');
assert(html.includes('v0.35.4'), 'document title is v0.35.4');
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
assert(hitFn.includes('_feelStrike(false)'), 'key 1 is the ranged strike');
assert(hitFn.includes('_feelStrike(true)'), 'key 4 is the melee strike');
assert(hitFn.includes('playFeelImpact'), 'strikes share the impact helper');
assert(hitFn.includes('flashMs: FEEL_HIT_FLASH_MS'), 'feel flash is the 40ms override');
assert(!hitFn.includes('fx-hit-water-burst') && !hitFn.includes('_playFeelHitBurst'), 'key 1 does not play the water burst');
assert(!stageSrc.includes('fx-hit-water-burst') && !stageSrc.includes('FEEL_HIT_BURST'), 'stage does not reference the water burst');
assert(stageSrc.includes('KeyCodes.FOUR'), 'key 4 is installed');
assert(stageSrc.includes('4 MELEE'), 'melee chip is installed');
assert(FEEL_HIT_FLASH_MS === 40 && FEEL_HIT_SHAKE_MS === 40, 'hitstop and flash are 40ms');
assert(FEEL_HIT_KNOCK_PX === 2, 'knockback is 2px');
assert(FEEL_HIT_PARTICLE_MIN === 8 && FEEL_HIT_PARTICLE_MAX === 12, 'spark count is 8–12');
assert(feelParticleCount(0) === 8 && feelParticleCount(0.999) === 12, 'spark roll stays inside 8–12');
assert(feelImpactDirX(800, 400) === -1, 'a shot from the east travels west');
assert(feelImpactDirX(400, 800) === 1, 'a shot from the west travels east');
assert(feelKnockOffset(-1).x === -2 && feelKnockOffset(-1).y === 0, 'west shot shoves 2px on X');
assert(feelKnockOffset(1).x === 2 && feelKnockOffset(1).y === 0, 'east shot shoves 2px on X');
const rangedDots = planFeelParticles({ melee: false, dirX: -1, x: 100, y: 200, rand: () => 0 });
assert(rangedDots.length === 8 && rangedDots.every((dot) => dot.dx < 0), 'ranged sparks follow the bullet west');
const meleeDots = planFeelParticles({ melee: true, dirX: -1, x: 100, y: 200, half: 20, rand: () => 0.5 });
assert(meleeDots.length >= 8 && meleeDots.length <= 12, 'melee spark count is in range');
assert(meleeDots.every((dot) => dot.dy > 0), 'melee sparks travel downward across the body');
assert(FEEL_MELEE_SECTOR === 'body', 'melee sparks use a body-centered fan');
assert(FEEL_MELEE_SLASH === 'fx-slash-ninja', 'melee slash hook is fx-slash-ninja');
assert(FEEL_MELEE_SLASH_SFX === 'sfx-slash-ninja', 'slash sfx hook is sfx-slash-ninja');
assert(existsSync(new URL('../assets/library/characters/hero/girl/fx/fx-slash-ninja.png', import.meta.url)), 'fx-slash-ninja sheet is the cataloged strip');
assert(existsSync(new URL('../assets/audio/sfx-slash-ninja.mp3', import.meta.url)), 'sfx-slash-ninja clip is in assets/audio');
assert(!existsSync(new URL('../assets/sfx/sfx-slash-ninja.mp3', import.meta.url)), 'assets/sfx slash clip was not invented');
const pose = feelMeleeSlashPose();
assert(pose?.key === 'fx-slash-ninja' && pose.rotation === 0, 'ninja pose is the unrotated diagonal');
assert(feelMeleeSlashPose(() => true)?.key === 'fx-slash-ninja' && feelMeleeSlashPose(() => true).rotation === 0, 'a loaded overhead sheet is not a stand-in');
const feelSrc = readFileSync(new URL('../src/systems/feelImpact.js', import.meta.url), 'utf8');
assert(feelSrc.includes("FEEL_MELEE_SLASH = 'fx-slash-ninja'"), 'the slash hook is the ninja constant');
assert(feelSrc.includes("FEEL_MELEE_SLASH_SFX = 'sfx-slash-ninja'"), 'the slash cue is the ninja constant');
assert(feelSrc.includes('playFeelMeleeSlash'), 'key 4 asks SoundManager for the slash cue');
assert(soundSrc.includes("{ key: 'sfx-slash-ninja', url: 'assets/audio/sfx-slash-ninja.mp3' }"), 'slash cue is preloaded from assets/audio');
assert(soundSrc.includes("this._cue('sfx-slash-ninja', AUDIO_VOLUME.melee, AUDIO_COOLDOWN_MS.hit)"), 'slash cue uses melee volume and the hit cooldown');
assert(!feelSrc.includes('FEEL_SLASH_SIDE_ROTATION'), 'fx-slash is not rotated into a melee pose');
assert(!feelSrc.includes('crownY') && !feelSrc.includes('_crownY'), 'melee no longer anchors on the crown');
assert(feelSrc.includes('BlendModes?.ADD') && feelSrc.includes('setBlendMode'), 'ninja slash uses ADD blend');
const spawnFn = feelSrc.slice(feelSrc.indexOf('function spawnFeelSlash'), feelSrc.indexOf('function feelBodyY'));
assert(!spawnFn.includes('fx-slash-overhead') && !spawnFn.includes("'fx-slash'"), 'spawn does not name the cancelled strips');
assert(spawnFn.includes('feelBodyY') && spawnFn.includes('pose.rotation'), 'spawn uses the body anchor and the unrotated pose');
const anchorFn = feelSrc.slice(feelSrc.indexOf('function feelBodyY'));
assert(anchorFn.includes('bodyCenterY') && anchorFn.includes('body?.y'), 'anchor prefers bodyCenterY, else the body sprite');
const spawned = [];
const sparkDots = [];
const slashCues = [];
let sparks = 0;
const booth = {
  textures: { exists: (key) => key === 'fx-slash-overhead' || key === 'fx-slash' || key === 'fx-slash-ninja' },
  anims: { exists: () => false },
  add: {
    rectangle(x, y) {
      sparks += 1;
      sparkDots.push({ x, y });
      return { setDepth() {}, active: true, destroy() {} };
    },
    sprite(x, y, key) {
      const row = { key, x, y, blend: null, rotation: null };
      spawned.push(row);
      return {
        setOrigin() {},
        setScale() {},
        setDepth() {},
        setBlendMode(mode) { row.blend = mode; },
        setRotation(rotation) { row.rotation = rotation; },
        once() {},
        active: true,
      };
    },
  },
  tweens: { add() {} },
  time: { delayedCall() {} },
  audio: { playFeelMeleeSlash() { slashCues.push('sfx-slash-ninja'); } },
};
const body = { active: true, x: 400, y: 240, depth: 3, scaleX: 1, anims: { timeScale: 1 } };
const zombie = { body, displayHalf: 20, _crownY: () => 180, _syncBars() {} };
assert(playFeelImpact(booth, zombie, { melee: true, dirX: -1 }) === true, 'key 4 still plays the hit reaction');
assert(spawned.length === 1 && spawned[0].key === 'fx-slash-ninja', 'key 4 spawns fx-slash-ninja');
assert(spawned[0].x === 398 && spawned[0].y === 240, 'missing bodyCenterY falls back to the knocked body');
assert(spawned[0].rotation == null, 'rotation 0 does not turn the strip');
assert(spawned.every((row) => row.key !== 'fx-slash-overhead' && row.key !== 'fx-slash'), 'cancelled strips are not spawned');
assert(sparks >= 8 && sparks <= 12, 'key 4 still sprays 8–12 sparks');
assert(sparkDots.every((dot) => dot.y > 180), 'melee sparks are not sprayed from the crown');
assert(slashCues.length === 1, 'key 4 plays sfx-slash-ninja');
const centered = { active: true, x: 400, y: 240, depth: 3, scaleX: 1, anims: { timeScale: 1 } };
const chest = { body: centered, displayHalf: 20, bodyCenterY: 210, _crownY: () => 180, _syncBars() {} };
assert(playFeelImpact(booth, chest, { melee: true, dirX: -1 }) === true, 'key 4 still hits when the chest is known');
assert(spawned.at(-1).key === 'fx-slash-ninja' && spawned.at(-1).y === 210 && spawned.at(-1).x === 398, 'slash prefers bodyCenterY');
assert(spawned.at(-1).y !== 180, 'slash does not use the crown');
assert(slashCues.length === 2, 'a second melee plays the slash cue again');
const rangedSpawned = spawned.length;
const rangedBody = { active: true, x: 400, y: 240, depth: 3, scaleX: 1, anims: { timeScale: 1 } };
const ranged = playFeelImpact(booth, { body: rangedBody, displayHalf: 20, bodyCenterY: 210, _syncBars() {} }, { melee: false, dirX: -1 });
assert(ranged === true && spawned.length === rangedSpawned, 'key 1 still spawns no slash strip');
assert(slashCues.length === 2, 'key 1 does not play the slash cue');
assert(zombieSrc.includes('flashMs'), 'feel hits can flash for 40ms without moving JUICE.HIT_FLASH_MS');

const WAVE_KEYS = [
  'fx-slash-enemy-red',
  'fx-slash-ally-white',
  'fx-slash-dot',
  'fx-hit-fire',
  'fx-hit-water',
];
assert(FEEL_WAVE_DEMOS.map((row) => row.key).join() === WAVE_KEYS.join(), 'keys 5–9 preview the five catalog sheets');
assert(FEEL_WAVE_DEMOS.map((row) => row.id).join() === 'enemy-red,ally-white,dot,fire,water', 'wave demo ids stay in booth order');
assert(feelWaveScale('slash', 128) === 1 && feelWaveScale('dot', 128) === 0.5 && feelWaveScale('bullet', 128) === 1, '128px unit: slash 1, dot 0.5, bullet 1');
assert(feelWaveScale('slash', 64) === 0.5 && feelWaveScale('dot', 64) === 0.25 && feelWaveScale('bullet', 64) === 1, '64px unit: slash 0.5, dot 0.25, bullet stays 1');
assert(feelWaveScale('slash', 0) === 1 && feelWaveScale('dot', 0) === 0.5, 'unknown height falls back to a full slash and a half-size dot');
assert(feelUnitDisplayHeight({ body: { displayHeight: 96 } }) === 96, 'display height is the slash measure');
assert(feelUnitDisplayHeight({ body: { frame: { height: 84 }, scaleY: 1 } }) === 84, 'frame height times scale is the fallback');
for (const key of WAVE_KEYS) {
  const folder = key.startsWith('fx-hit-') ? 'bullet-hit' : 'melee';
  assert(existsSync(new URL(`../assets/library/fx/${folder}/${key}.png`, import.meta.url)), `${key} sheet is cataloged`);
}
assert(!existsSync(new URL('../assets/library/fx/bullet-hit/fx-hit-fire-bullet24.png', import.meta.url)), 'a separate fire upscale file is not cataloged');
assert(!existsSync(new URL('../assets/library/fx/bullet-hit/fx-hit-water-bullet24.png', import.meta.url)), 'a separate water upscale file is not cataloged');
const HIT_SHEETS = {
  'fx-hit-fire': {
    sha256: 'ea386cee539fda562b43c4d7a75532ec5280ca2b0fff09cd6f175609f594d6ea',
    feelKey: '8',
  },
  'fx-hit-water': {
    sha256: 'bf8b737766980bdc75cfc898bcf0a20d945d148933d93a68711b97f8a2876cd9',
    feelKey: '9',
  },
};
const bulletManifest = JSON.parse(readFileSync(new URL('../assets/library/fx/bullet-hit/manifest.json', import.meta.url), 'utf8'));
const bulletIndex = JSON.parse(readFileSync(new URL('../assets/library/asset-index.json', import.meta.url), 'utf8'));
for (const [key, spec] of Object.entries(HIT_SHEETS)) {
  const buf = readFileSync(new URL(`../assets/library/fx/bullet-hit/${key}.png`, import.meta.url));
  assert(buf.readUInt32BE(16) === 96 && buf.readUInt32BE(20) === 24, `${key} sheet is 96×24`);
  assert(createHash('sha256').update(buf).digest('hex') === spec.sha256, `${key} is the approved left-to-right sheet`);
  const row = bulletManifest.assets.find((asset) => asset.key === key);
  assert(row?.frames === 4 && row.frameWidth === 24 && row.frameHeight === 24 && row.frameRate === 8 && row.loop === false, `${key} is 4×24 @ 8 fps, once`);
  assert(row.extra?.gameplayNotes?.combatWired === false && row.extra?.gameplayNotes?.direction === 'left-to-right' && row.extra?.gameplayNotes?.feelKey === spec.feelKey && row.extra?.gameplayNotes?.scale === 1, `${key} stays a scale-1 feel preview`);
  const indexed = bulletIndex.assets.find((asset) => asset.key === key);
  assert(indexed?.frames === 4 && indexed.frameWidth === 24 && indexed.frameHeight === 24 && indexed.frameRate === 8, `${key} catalog index matches the sheet`);
}
const waveFxFn = feelSrc.slice(feelSrc.indexOf('export function playFeelWaveFx'));
assert(!waveFxFn.includes('flipX') && !waveFxFn.includes('setFlipX'), 'keys 8 and 9 play the bullet sheets as drawn');
const weaponSrc = readFileSync(new URL('../src/systems/WeaponSystem.js', import.meta.url), 'utf8');
assert(!weaponSrc.includes("'fx-hit-fire'") && !weaponSrc.includes("'fx-hit-water'"), 'live combat does not spawn the bullet-hit sheets');
assert(!weaponSrc.includes('"fx-hit-fire"') && !weaponSrc.includes('"fx-hit-water"'), 'live combat does not quote the bullet-hit keys');
assert(GAME_AUDIO.some((clip) => clip.key === 'sfx-slash-dot' && clip.url === 'assets/audio/sfx-slash-dot.mp3'), 'sfx-slash-dot stays the cataloged default');
assert(existsSync(new URL('../assets/audio/sfx-slash-dot.mp3', import.meta.url)), 'sfx-slash-dot default is the audio-pack file');
const dotFn = soundSrc.slice(soundSrc.indexOf('playFeelDotTick()'), soundSrc.indexOf('playZombieHurt()'));
assert(dotFn.includes("this._cue('sfx-slash-dot', 0.28)"), 'dot tick plays the default under the melee volume');
assert(!dotFn.includes('sfx-slash-dot-a') && !dotFn.includes('sfx-slash-dot-b'), 'the booth tick uses the default take');
assert(feelSrc.includes('playFeelDotTick'), 'the dot preview asks SoundManager for the cataloged tick');
assert(stageSrc.includes('5 RED') && stageSrc.includes('9 WATER'), 'feel booth chips list the five previews');
assert(stageSrc.includes('wave:fire') && stageSrc.includes('wave:water'), 'keys 8 and 9 are the bullet hits');
const waveFn = stageSrc.slice(stageSrc.indexOf('\n  _feelWave(id) {'), stageSrc.indexOf('\n  _playHeroFeel(kind) {'));
assert(waveFn.includes('playFeelWaveFx') && !waveFn.includes('takeDamage'), 'keys 5–9 spawn a preview and do not deal damage');
assert(!waveFn.includes('playFeelMeleeSlash') && !waveFn.includes('playEnemyCue'), 'wave previews do not play slash or enemy cues');
const waveSpawned = [];
const waveAudio = [];
const waveBooth = {
  textures: { exists: (key) => WAVE_KEYS.includes(key) },
  anims: { exists: () => false },
  add: {
    sprite(x, y, key) {
      const row = { key, x, y, scale: null, blend: null };
      waveSpawned.push(row);
      return {
        setOrigin() {},
        setScale(scale) { row.scale = scale; },
        setDepth() {},
        setBlendMode(mode) { row.blend = mode; },
        once() {},
        active: true,
      };
    },
  },
  time: { delayedCall() {} },
  audio: {
    playFeelMeleeSlash() { waveAudio.push('slash'); },
    playFeelDotTick() { waveAudio.push('sfx-slash-dot'); },
    playEnemyCue() { waveAudio.push('enemy'); },
  },
};
const waveBody = {
  active: true,
  x: 400,
  y: 240,
  depth: 3,
  displayHeight: 128,
  scaleX: 1,
  anims: { timeScale: 1 },
};
const waveZombie = { body: waveBody, bodyCenterY: 210, _syncBars() {} };
const prevPhaser = globalThis.Phaser;
globalThis.Phaser = { BlendModes: { ADD: 'ADD' } };
const waveShown = FEEL_WAVE_DEMOS.map((row) => playFeelWaveFx(waveBooth, waveZombie, row.id));
if (prevPhaser === undefined) delete globalThis.Phaser;
else globalThis.Phaser = prevPhaser;
assert(waveShown.every(Boolean) && waveSpawned.map((row) => row.key).join() === WAVE_KEYS.join(), 'keys 5–9 spawn the five sheets');
assert(waveSpawned.every((row) => row.x === 400 && row.y === 210), 'wave previews sit on the body center');
assert(waveBody.x === 400 && waveBody.y === 240, 'wave previews do not move the body');
assert(waveSpawned.map((row) => row.scale).join() === '1,1,0.5,1,1', '128px unit scales slash 1, dot 0.5, hits 1');
assert(waveSpawned.every((row) => row.blend === 'ADD'), 'wave previews use ADD blend');
assert(waveAudio.join() === 'sfx-slash-dot', 'only the dot preview plays sfx-slash-dot');
const shortBody = { active: true, x: 400, y: 240, depth: 3, displayHeight: 64, scaleX: 1 };
assert(playFeelWaveFx(waveBooth, { body: shortBody }, 'enemy-red')?.active !== false, 'a short unit still previews');
assert(waveSpawned.at(-1).scale === 0.5 && waveSpawned.at(-1).key === 'fx-slash-enemy-red', 'a 64px unit scales the slash to 0.5');
assert(playFeelWaveFx(waveBooth, { body: shortBody }, 'dot'), 'a short unit previews the dot');
assert(waveSpawned.at(-1).scale === 0.25, 'a 64px unit scales the dot to 0.25');
assert(waveAudio.filter((cue) => cue === 'sfx-slash-dot').length === 2, 'a second dot preview plays the tick again');
assert(playFeelWaveFx(waveBooth, { body: shortBody }, 'fire'), 'a short unit previews fire at scale 1');
assert(waveSpawned.at(-1).scale === 1 && waveSpawned.at(-1).key === 'fx-hit-fire', 'fire stays scale 1');
assert(waveAudio.filter((cue) => cue === 'sfx-slash-dot').length === 2 && !waveAudio.includes('slash'), 'fire and the slashes stay silent');
assert(playFeelWaveFx(waveBooth, waveZombie, 'missing') == null, 'an unknown demo id spawns nothing');
const quietBooth = { ...waveBooth, textures: { exists: () => false } };
assert(playFeelWaveFx(quietBooth, waveZombie, 'water') == null, 'a missing water sheet spawns nothing');

const hurtFn = stageSrc.slice(stageSrc.indexOf('\n  _feelHurt() {'), stageSrc.indexOf('\n  _onFeelAttackHit() {'));
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
