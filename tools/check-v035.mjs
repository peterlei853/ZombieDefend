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
 * cataloged `sfx-slash-dot` default. Keys 5, 6, 8, and 9 play booth preview
 * cues (`sfx-slash-enemy`, `sfx-slash-ally`, `sfx-hit-fire`, `sfx-hit-water`).
 * Combat does not.
 * v0.35.6: key 1 drops the ranged spark cone. Keys 5–9 stay on the chest.
 * Ally-white and the DoT use NORMAL blend. Nurse and lava-balon contact
 * is one frame earlier. Peter’s hub stays `/sandbox/`.
 * Key 5's `fx-slash-enemy-red` is the chest-centered 4×72 strip
 * (288×72, atlas pivot 0.5/0.5). Keys 1 and 6–9 stay put.
 * v0.35.7: key 1 also skips the hurt sheet. Frame 0 of that sheet bakes
 * a yellow crescent on the right of the body, which still showed after
 * the rectangle cone was removed. Hitstop, white flash, and 2px knock
 * stay. Key 4 still sprays sparks and still plays the hurt sheet.
 * v0.35.9: feel booth unchanged. Stage 1 waves 1–3 contact DPS is 3/5/8.
 * Wave totals, HP, barricade, gold, and loudness stay put.
 * v0.36.2: attack strips play in place (no barricade X lunge). Key 2 hurt
 * and the live wall beat landed on the midpoint frame of each attack strip
 * (8 frames → Phaser frame 5). DPS, gold, barricade HP, and the camera stay put.
 * v0.36.3: that beat moves to about 80% of the strip (8 frames → Phaser
 * frame 7, texture cell 6, midpoint ~81%). Bare and short strips use the
 * same fraction. slime-mini still reacts at once. No body X lunge.
 * v0.36.5: brute key 3 plays zombie-brute-skill_ground_smash. Shock FX
 * on catalog frame 8 (Phaser index 9) at the feet. Hit on catalog frame
 * 13 (Phaser index 14). Live radius is 320 canvas px. Brute stays
 * planted on hurt (`noHurtKnockback`). Attack frame 7 stays.
 *
 *   https://peterlei853.github.io/ZombieDefend/?enemy=office-worker-v2&feel=1
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  attackContactFrame,
  enemySfxClips,
  enemySfxKey,
  enemySfxUrl,
  enemySkillStrips,
  feelAttackHitFrame,
  feelHitDamage,
  lateAttackFrame,
} from '../src/data/enemyShowcase.js';
import {
  BRUTE_GROUND_SMASH_COOLDOWN,
  BRUTE_GROUND_SMASH_DAMAGE,
  BRUTE_GROUND_SMASH_RADIUS,
  BRUTE_SKILL_ANIM,
  BRUTE_SKILL_FX,
  BRUTE_SKILL_FX_CELL,
  BRUTE_SKILL_HIT_CELL,
  bruteSkillPhaserIndex,
  pointInBruteSmash,
} from '../src/data/bruteSkill.js';
import { Zombie } from '../src/entities/Zombie.js';
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
  FEEL_WAVE_DEPTH_BIAS,
  feelImpactDirX,
  feelKnockOffset,
  feelMeleeSlashPose,
  feelParticleCount,
  feelUnitDisplayHeight,
  feelWaveBlendName,
  feelWaveScale,
  planFeelParticles,
  playFeelImpact,
  playFeelWaveFx,
} from '../src/systems/feelImpact.js';
import { AUDIO_VOLUME, GAME_AUDIO, preloadGameAudio } from '../src/systems/SoundManager.js';
import { stageLibraryCategories } from '../src/assets/libraryAssets.js';
import { ZOMBIE_BOSS_SKINS, ZOMBIE_LIBRARY_SKINS, skipsHurtKnockback } from '../src/assets/zombieSprites.js';
import { LAYOUT_SCALE, SCALE_NEAR, layoutPx } from '../src/systems/DepthView.js';
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

assert(pkg.version === '0.36.5' && APP_VERSION === '0.36.5', 'package and APP_VERSION are 0.36.5');
assert(html.includes('v0.36.5'), 'document title is v0.36.5');
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
for (const clip of enemySfxClips()) {
  const row = GAME_AUDIO.find((item) => item.key === clip.key);
  assert(row?.url === `assets/audio/${clip.key}.mp3`, `${clip.key} is cataloged in GAME_AUDIO`);
  assert(existsSync(new URL(`../assets/audio/${clip.key}.mp3`, import.meta.url)), `${clip.key} catalog file`);
  assert(clip.url.startsWith('assets/sfx/enemies/'), `${clip.key} playback path stays assets/sfx/enemies`);
}
assert(GAME_AUDIO.filter((clip) => clip.key.startsWith('sfx-enemy-')).length === 72, 'catalog adds the 72 showcase keys once');
const catalogQueued = [];
preloadGameAudio({
  load: { audio(key, url) { catalogQueued.push({ key, url }); } },
  cache: { audio: { exists: () => false } },
});
for (const clip of enemySfxClips()) {
  const hits = catalogQueued.filter((row) => row.key === clip.key);
  assert(hits.length === 1 && hits[0].url === clip.url, `${clip.key} preloads the live showcase URL once`);
}
assert(catalogQueued.find((row) => row.key === 'bgm-stage')?.url === 'assets/audio/bgm-stage.mp3', 'live stage bed url is unchanged');
assert(
  catalogQueued.some((row) => row.key === 'bgm-stage-chiptune-G' && row.url === 'assets/audio/bgm-stage-chiptune-G.mp3'),
  'stage chiptune candidate preloads beside the live bed'
);
assert(
  catalogQueued.some((row) => row.key === 'bgm-boss-chiptune-H' && row.url === 'assets/audio/bgm-boss-chiptune-H.mp3'),
  'boss chiptune candidate preloads beside the live beds'
);
assert(!stageSrc.includes('bgm-stage-chiptune-G') && !stageSrc.includes('bgm-boss-chiptune-H'), 'stage does not start the chiptune candidates');
assert(
  !soundSrc.includes("startBgm('bgm-stage-chiptune-G'") && !soundSrc.includes("startBgm('bgm-boss-chiptune-H'"),
  'SoundManager does not start the chiptune candidates'
);

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

const enemiesRoot = fileURLToPath(new URL('../assets/library/enemies', import.meta.url));

function framesForAnimKey(key) {
  const stack = [enemiesRoot];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        stack.push(path);
        continue;
      }
      if (name !== 'manifest.json') continue;
      const data = JSON.parse(readFileSync(path, 'utf8'));
      const row = (data.assets || []).find((asset) => asset.key === key);
      if (row) return row.frames;
    }
  }
  return null;
}

for (const id of IDS) {
  const skin = ZOMBIE_LIBRARY_SKINS[id] || ZOMBIE_BOSS_SKINS[id];
  const attack = skin?.actions?.attack;
  if (!attack) {
    assert(feelAttackHitFrame(id) == null, `${id} without an attack strip has no hit frame`);
    assert(!(id in ENEMY_ATTACK_HIT_FRAME), `${id} is not in the hit-frame table`);
    assert(attackContactFrame(id, 0) == null, `${id} has no live contact frame`);
  } else {
    const frames = framesForAnimKey(attack);
    const strike = lateAttackFrame(frames);
    assert(frames === 8, `${id} attack strip is 8 frames`);
    assert(strike === 7, `${id} ~80% of an 8-frame strip is Phaser frame 7`);
    assert(feelAttackHitFrame(id) === strike, `${id} attack hit frame is the late strike ${strike}`);
    assert(ENEMY_ATTACK_HIT_FRAME[id] === strike, `${id} table matches the ~80% strike`);
    assert(attackContactFrame(id, frames) === strike, `${id} live contact uses the ~80% strike`);
  }
}
assert(Object.keys(ENEMY_ATTACK_HIT_FRAME).length === IDS.length - 1, 'every attack id except slime-mini has a hit frame');
assert(feelAttackHitFrame('office-worker-v2') === 7, 'office-worker-v2 strike is Phaser attack frame 7');
assert(lateAttackFrame(8) === 7, '8 frames strike on the frame whose midpoint is ~81%');
assert(((7 - 0.5) / 8) > 0.8 && ((7 - 1) / 8) < 0.8, 'frame 7 starts before 80% and its midpoint is after');
assert(framesForAnimKey('zombie-nurse-attach') === 8, 'nurse attach is 8 frames, so live frame 7 is the late strike');
assert(attackContactFrame('riot-bare', framesForAnimKey('zombie-riot-bare-attack')) === 7, 'bare riot contact is ~80% of the strip');
assert(attackContactFrame('trashcan-bare', framesForAnimKey('zombie-trashcan-bare-attack')) === 7, 'bare trashcan contact is ~80% of the strip');
assert(lateAttackFrame(4) === 4 && lateAttackFrame(1) === 1 && lateAttackFrame(6) === 5, 'shorter strips contact near 80% and never past the end');
assert(attackContactFrame(null, 4) === 4, 'a legacy 4-frame sheet contacts on Phaser frame 4');

const hitFn = stageSrc.slice(stageSrc.indexOf('\n  _feelHit() {'), stageSrc.indexOf('\n  _feelHurt() {'));
assert(hitFn.includes('_feelStrike(false)'), 'key 1 is the ranged strike');
assert(hitFn.includes('_feelStrike(true)'), 'key 4 is the melee strike');
assert(hitFn.includes('playFeelImpact'), 'strikes share the impact helper');
assert(hitFn.includes('flashMs: FEEL_HIT_FLASH_MS'), 'feel flash is the 40ms override');
assert(hitFn.includes('hurtStrip: melee === true'), 'only melee opts into the hurt sheet');
assert(!hitFn.includes('_playHurtStrip'), 'the strike does not play the hurt sheet itself');
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
assert(rangedDots.length === 0, 'key 1 plans no yellow spark cone');
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
assert(feelSrc.includes("applyFeelBlend(sprite, 'ADD')") && feelSrc.includes('setBlendMode'), 'ninja slash uses ADD blend');
assert(feelSrc.includes('feelWaveBlendName'), 'wave previews pick a blend by sheet');
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
        destroy() { this.active = false; },
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
const sparksBeforeRanged = sparks;
const rangedBody = { active: true, x: 400, y: 240, depth: 3, scaleX: 1, anims: { timeScale: 1 } };
const ranged = playFeelImpact(booth, { body: rangedBody, displayHalf: 20, bodyCenterY: 210, _syncBars() {} }, { melee: false, dirX: -1 });
assert(ranged === true && spawned.length === rangedSpawned, 'key 1 still spawns no slash strip');
assert(sparks === sparksBeforeRanged, 'key 1 does not spray the yellow spark cone');
assert(slashCues.length === 2, 'key 1 does not play the slash cue');
assert(zombieSrc.includes('flashMs'), 'feel hits can flash for 40ms without moving JUICE.HIT_FLASH_MS');
const damageFn = zombieSrc.slice(zombieSrc.indexOf('takeDamage(amount'), zombieSrc.indexOf('\n  playShowcaseStrip'));
assert(damageFn.includes('hit.hurtStrip === true'), 'the hurt sheet plays only when melee opts in');
assert(!damageFn.includes('if (scripted) this._playHurtStrip()'), 'ranged feel does not always play the hurt sheet');

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
const RED_SHA256 = '126d927bdd7a8005f27ca9e7bdb3e78799794a0101639faff65f4545c1c56089';
const meleeManifest = JSON.parse(readFileSync(new URL('../assets/library/fx/melee/manifest.json', import.meta.url), 'utf8'));
const redRow = meleeManifest.assets.find((asset) => asset.key === 'fx-slash-enemy-red');
assert(redRow?.frames === 4 && redRow.frameWidth === 72 && redRow.frameHeight === 72 && redRow.frameRate === 30 && redRow.loop === false, 'fx-slash-enemy-red is 4×72 @ 30 fps, once');
assert(redRow.grid == null && redRow.origin?.[0] === 0.5 && redRow.origin?.[1] === 0.5, 'fx-slash-enemy-red is a centered horizontal strip');
assert(redRow.extra?.sheet?.layout === 'horizontal' && redRow.extra?.pixellabAnchor?.x === 0.5 && redRow.extra?.pixellabAnchor?.y === 0.5, 'enemy red pivot stays 0.5/0.5');
const redPng = readFileSync(new URL('../assets/library/fx/melee/fx-slash-enemy-red.png', import.meta.url));
assert(redPng.readUInt32BE(16) === 288 && redPng.readUInt32BE(20) === 72, 'fx-slash-enemy-red sheet is 288×72');
assert(createHash('sha256').update(redPng).digest('hex') === RED_SHA256, 'fx-slash-enemy-red is the chest-centered remake');
const redAtlas = JSON.parse(readFileSync(new URL('../assets/library/fx/melee/fx-slash-enemy-red.json', import.meta.url), 'utf8'));
assert(redAtlas.meta?.image === 'fx-slash-enemy-red.png' && redAtlas.meta?.size?.w === 288 && redAtlas.meta?.size?.h === 72, 'enemy red atlas matches the strip');
assert(Array.isArray(redAtlas.frames) && redAtlas.frames.length === 4 && redAtlas.frames.every((frame) => frame.pivot?.x === 0.5 && frame.pivot?.y === 0.5 && frame.frame?.w === 72 && frame.frame?.h === 72), 'enemy red atlas pivot is 0.5/0.5 on every frame');
const allyRow = meleeManifest.assets.find((asset) => asset.key === 'fx-slash-ally-white');
const allyPng = readFileSync(new URL('../assets/library/fx/melee/fx-slash-ally-white.png', import.meta.url));
assert(allyRow?.frames === 5 && allyRow.grid?.[0] === 3 && allyRow.grid?.[1] === 2, 'ally white stays the 5-frame 3×2 grid');
assert(allyPng.readUInt32BE(16) === 213 && allyPng.readUInt32BE(20) === 140, 'ally white sheet stays 213×140');
const dotRow = meleeManifest.assets.find((asset) => asset.key === 'fx-slash-dot');
const dotPng = readFileSync(new URL('../assets/library/fx/melee/fx-slash-dot.png', import.meta.url));
assert(dotRow?.frames === 4 && dotRow.frameRate === 20 && dotRow.grid?.[0] === 2 && dotRow.grid?.[1] === 2, 'dot slash stays the 4-frame 2×2 grid');
assert(dotPng.readUInt32BE(16) === 60 && dotPng.readUInt32BE(20) === 60, 'dot sheet stays 60×60');
const redIndexed = bulletIndex.assets.find((asset) => asset.key === 'fx-slash-enemy-red');
assert(redIndexed?.frames === 4 && redIndexed.frameWidth === 72 && redIndexed.frameHeight === 72 && redIndexed.grid == null && redIndexed.origin?.[0] === 0.5 && redIndexed.origin?.[1] === 0.5, 'catalog index loads the chest-centered enemy red strip');
assert(!weaponSrc.includes("'fx-slash-enemy-red'") && !weaponSrc.includes('"fx-slash-enemy-red"'), 'live combat does not spawn the enemy red slash');
assert(GAME_AUDIO.some((clip) => clip.key === 'sfx-slash-dot' && clip.url === 'assets/audio/sfx-slash-dot.mp3'), 'sfx-slash-dot stays the cataloged default');
assert(existsSync(new URL('../assets/audio/sfx-slash-dot.mp3', import.meta.url)), 'sfx-slash-dot default is the audio-pack file');
const dotFn = soundSrc.slice(soundSrc.indexOf('playFeelDotTick()'), soundSrc.indexOf('playFeelEnemySlash()'));
assert(dotFn.includes("this._cue('sfx-slash-dot', 0.28)"), 'dot tick plays the default under the melee volume');
assert(!dotFn.includes('sfx-slash-dot-a') && !dotFn.includes('sfx-slash-dot-b'), 'the booth tick uses the default take');
assert(!dotFn.includes('AUDIO_COOLDOWN_MS'), 'the booth tick stays on the default take without a new cooldown');
assert(feelSrc.includes('playFeelDotTick'), 'the dot preview asks SoundManager for the cataloged tick');
const BOOTH_CUES = [
  ['playFeelEnemySlash()', 'sfx-slash-enemy', '0.3'],
  ['playFeelAllySlash()', 'sfx-slash-ally', '0.3'],
  ['playFeelFireHit()', 'sfx-hit-fire', '0.28'],
  ['playFeelWaterHit()', 'sfx-hit-water', '0.28'],
];
for (const [fn, cue, volume] of BOOTH_CUES) {
  assert(GAME_AUDIO.some((clip) => clip.key === cue && clip.url === `assets/audio/${cue}.mp3`), `${cue} is cataloged in GAME_AUDIO`);
  assert(existsSync(new URL(`../assets/audio/${cue}.mp3`, import.meta.url)), `${cue} file is in assets/audio`);
  const start = soundSrc.indexOf(fn);
  const body = soundSrc.slice(start, soundSrc.indexOf('\n  }', start));
  assert(start > soundSrc.indexOf('playFeelDotTick()') && body.includes(`this._cue('${cue}', ${volume}, AUDIO_COOLDOWN_MS.hit)`), `${fn} cues ${cue} at ${volume} on the hit cooldown`);
  assert(feelSrc.includes(fn.slice(0, -2)), `the ${cue} preview asks SoundManager for ${fn}`);
}
assert(!weaponSrc.includes('playFeelEnemySlash') && !weaponSrc.includes('playFeelAllySlash'), 'live combat does not play the booth slashes');
assert(!weaponSrc.includes('playFeelFireHit') && !weaponSrc.includes('playFeelWaterHit'), 'live combat does not play the booth hits');
assert(!weaponSrc.includes('sfx-slash-enemy') && !weaponSrc.includes('sfx-slash-ally'), 'live combat does not name the booth slash cues');
assert(!weaponSrc.includes('sfx-hit-fire') && !weaponSrc.includes('sfx-hit-water'), 'live combat does not name the booth hit cues');
assert(!feelSrc.includes('The other four previews stay silent'), 'wave previews are no longer documented as silent');
assert(!stageSrc.includes('Keys 5, 6, 8, and 9 stay silent'), 'stage comments no longer call keys 5, 6, 8, and 9 silent');
assert(stageSrc.includes('sfx-slash-enemy') && stageSrc.includes('sfx-slash-ally'), 'stage comments name the slash previews');
assert(stageSrc.includes('sfx-hit-fire') && stageSrc.includes('sfx-hit-water'), 'stage comments name the hit previews');
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
      const row = { key, x, y, scale: null, blend: null, depth: null };
      waveSpawned.push(row);
      return {
        setOrigin() {},
        setScale(scale) { row.scale = scale; },
        setDepth(depth) { row.depth = depth; },
        setAlpha() {},
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
    playFeelEnemySlash() { waveAudio.push('sfx-slash-enemy'); },
    playFeelAllySlash() { waveAudio.push('sfx-slash-ally'); },
    playFeelFireHit() { waveAudio.push('sfx-hit-fire'); },
    playFeelWaterHit() { waveAudio.push('sfx-hit-water'); },
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
globalThis.Phaser = { BlendModes: { ADD: 'ADD', NORMAL: 'NORMAL' } };
const waveShown = FEEL_WAVE_DEMOS.map((row) => playFeelWaveFx(waveBooth, waveZombie, row.id));
if (prevPhaser === undefined) delete globalThis.Phaser;
else globalThis.Phaser = prevPhaser;
assert(waveShown.every(Boolean) && waveSpawned.map((row) => row.key).join() === WAVE_KEYS.join(), 'keys 5–9 spawn the five sheets');
assert(waveSpawned.every((row) => row.x === 400 && row.y === 210), 'wave previews sit on the body center');
assert(waveBody.x === 400 && waveBody.y === 240, 'wave previews do not move the body');
assert(waveSpawned.map((row) => row.scale).join() === '1,1,0.5,1,1', '128px unit scales slash 1, dot 0.5, hits 1');
assert(waveSpawned.map((row) => row.blend).join() === 'ADD,NORMAL,NORMAL,ADD,ADD', 'white previews use NORMAL; red, fire, and water stay ADD');
assert(waveSpawned.every((row) => row.depth === 3 + FEEL_WAVE_DEPTH_BIAS), 'wave previews draw above the body');
assert(feelWaveBlendName('ally-white') === 'NORMAL' && feelWaveBlendName('dot') === 'NORMAL', 'thin white names NORMAL');
assert(feelWaveBlendName('enemy-red') === 'ADD' && feelWaveBlendName('fire') === 'ADD', 'colored hits stay ADD');
assert(waveAudio.join() === 'sfx-slash-enemy,sfx-slash-ally,sfx-slash-dot,sfx-hit-fire,sfx-hit-water', 'keys 5–9 play their booth preview cues');
const shortBody = { active: true, x: 400, y: 240, depth: 3, displayHeight: 64, scaleX: 1 };
assert(playFeelWaveFx(waveBooth, { body: shortBody }, 'enemy-red')?.active !== false, 'a short unit still previews');
assert(waveSpawned.at(-1).scale === 0.5 && waveSpawned.at(-1).key === 'fx-slash-enemy-red', 'a 64px unit scales the slash to 0.5');
assert(playFeelWaveFx(waveBooth, { body: shortBody }, 'dot'), 'a short unit previews the dot');
assert(waveSpawned.at(-1).scale === 0.25, 'a 64px unit scales the dot to 0.25');
assert(waveAudio.filter((cue) => cue === 'sfx-slash-dot').length === 2, 'a second dot preview plays the tick again');
assert(playFeelWaveFx(waveBooth, { body: shortBody }, 'fire'), 'a short unit previews fire at scale 1');
assert(waveSpawned.at(-1).scale === 1 && waveSpawned.at(-1).key === 'fx-hit-fire', 'fire stays scale 1');
assert(waveAudio.filter((cue) => cue === 'sfx-slash-enemy').length === 2, 'a second enemy-red preview plays the slash again');
assert(waveAudio.filter((cue) => cue === 'sfx-hit-fire').length === 2, 'a second fire preview plays the hit again');
assert(waveAudio.filter((cue) => cue === 'sfx-slash-ally').length === 1 && waveAudio.filter((cue) => cue === 'sfx-hit-water').length === 1, 'ally and water play once with the first pass');
assert(!waveAudio.includes('slash') && !waveAudio.includes('enemy'), 'wave previews do not play the ninja slash or enemy showcase cues');
assert(playFeelWaveFx(waveBooth, waveZombie, 'missing') == null, 'an unknown demo id spawns nothing');
const quietBooth = { ...waveBooth, textures: { exists: () => false } };
assert(playFeelWaveFx(quietBooth, waveZombie, 'water') == null, 'a missing water sheet spawns nothing');
assert(waveAudio.filter((cue) => cue === 'sfx-hit-water').length === 1, 'a missing water sheet does not play the hit');

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
const contactFn = zombieSrc.slice(
  zombieSrc.indexOf('_armAttackContact(attackKey, hitFrame, onContact)'),
  zombieSrc.indexOf('_playHurtStrip')
);
assert(!contactFn.includes('delayedCall'), 'attack contact is not a delayed timer');
assert(!zombieSrc.includes('BARRICADE_LUNGE'), 'zombies do not read a lunge distance');
const configSrc = readFileSync(new URL('../src/data/GameConfig.js', import.meta.url), 'utf8');
assert(!configSrc.includes('BARRICADE_LUNGE'), 'lunge juice constants are gone');
const showcaseFn = zombieSrc.slice(
  zombieSrc.indexOf('playShowcaseAttack(hitFrame, onContact)'),
  zombieSrc.indexOf('/** Drop a pending key-2 contact')
);
assert(!showcaseFn.includes('tweens') && !showcaseFn.includes('body.x'), 'feel-booth attack does not move the body');
const punchFn = zombieSrc.slice(zombieSrc.indexOf('_playAttackPunch()'), zombieSrc.indexOf('_armBarricadeBeat(attackKey)'));
assert(!punchFn.includes('tweens.add') && !punchFn.includes('BARRICADE_LUNGE'), 'live attack does not tween forward');
assert(punchFn.includes('this.body.x = homeX'), 'live attack plants the feet on the halt');
const marchFn = zombieSrc.slice(
  zombieSrc.indexOf('update(deltaSec, contactX, pet = null)'),
  zombieSrc.indexOf('_petToChase(pet, contactX)')
);
assert(!marchFn.includes('_attackBeat = true'), 'the march does not mark the bite on the windup frame');
const chaseFn = zombieSrc.slice(
  zombieSrc.indexOf('_chasePet(deltaSec, pet, contactX)'),
  zombieSrc.indexOf('petContactDamage(deltaSec)')
);
assert(!chaseFn.includes('_attackBeat = true'), 'a pet bite does not mark the wall beat on the windup frame');
assert(zombieSrc.includes('attackContactFrame'), 'live contact uses the shared strike helper');
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
assert(WAVE_DEFS.slice(0, 3).map((def) => def.archetypes[0].dps).join() === '3,5,8', 'waves 1–3 contact DPS stays 3/5/8');
assert(AUDIO_VOLUME.bgm === 0.28, 'BGM volume stays 0.28');
assert(AUDIO_VOLUME.hit === 0.3 && AUDIO_VOLUME.hurt === 0.3 && AUDIO_VOLUME.death === 0.3, 'hit hurt death volumes stay put');
assert(AUDIO_VOLUME.fire === 0.35 && AUDIO_VOLUME.ult === 0.4 && AUDIO_VOLUME.melee === 0.35, 'fire ult melee volumes stay put');
assert(!stageSrc.includes('camera.shake') && !stageSrc.includes('.shake('), 'the camera does not shake');
assert(!stageSrc.includes('localStorage.setItem'), 'stage does not write a save');

function fakeAttackBody(x = 120) {
  return {
    x,
    y: 40,
    active: true,
    _ons: [],
    anims: { currentAnim: null, currentFrame: null, isPlaying: false },
    on(ev, fn) { this._ons.push({ ev, fn }); },
    off(_ev, fn) { this._ons = this._ons.filter((row) => row.fn !== fn); },
    play(key) {
      this.anims.currentAnim = { key };
      this.anims.currentFrame = { index: 0 };
      this.anims.isPlaying = true;
    },
  };
}

function attackHost(partial = {}) {
  const host = {
    alive: true,
    atBarricade: true,
    petBiteTarget: null,
    _isSprite: true,
    _attackBeat: false,
    _attackContactToken: 0,
    _attackContactHandler: null,
    _haltX: 120,
    skin: { id: 'trashcan' },
    scene: {
      tweens: {
        added: 0,
        killTweensOf() {},
        add() { this.added += 1; },
      },
      anims: {
        exists: () => true,
        get: () => ({ frames: new Array(8) }),
      },
    },
    body: fakeAttackBody(),
    _animKey(action) {
      if (action === 'attach') return null;
      if (action === 'attack') return 'zombie-trashcan-attack';
      return null;
    },
    _animReady(key) { return !!key; },
    _stopWalkAnim() {},
    _syncBars() {},
    ...partial,
  };
  host._clearAttackContact = Zombie.prototype._clearAttackContact;
  host._armAttackContact = Zombie.prototype._armAttackContact;
  host._armBarricadeBeat = Zombie.prototype._armBarricadeBeat;
  host._playAttackPunch = Zombie.prototype._playAttackPunch;
  host.playShowcaseAttack = Zombie.prototype.playShowcaseAttack;
  if (!host.playShowcaseStrip) host.playShowcaseStrip = () => true;
  return host;
}

const wall = attackHost();
wall._playAttackPunch();
assert(wall.body.x === 120 && wall.scene.tweens.added === 0, 'live punch stays on the halt and adds no tween');
assert(wall._attackBeat === false, 'trashcan wall flash waits for the contact frame');
const liveHandler = wall.body._ons.find((row) => row.ev === 'animationupdate')?.fn;
assert(typeof liveHandler === 'function', 'live punch listens for the attack frame');
liveHandler({ key: 'zombie-trashcan-attack' }, { index: 5 });
assert(wall._attackBeat === false, 'Phaser frame 5 is the old midpoint and does not beat');
liveHandler({ key: 'zombie-trashcan-attack' }, { index: 6 });
assert(wall._attackBeat === false, 'Phaser frame 6 is still before the late strike');
liveHandler({ key: 'zombie-trashcan-attack' }, { index: 7 });
assert(wall._attackBeat === true, 'Phaser frame 7 marks the barricade beat');
assert(wall.body._ons.length === 0, 'the contact listener drops after the hit');

const feelHost = attackHost({
  atBarricade: false,
  skin: { id: 'chef' },
  _animKey: () => 'zombie-chef-attack',
});
let hurt = false;
assert(feelHost.playShowcaseAttack(feelAttackHitFrame('chef'), () => { hurt = true; }) === true, 'key 2 plays the chef attack');
assert(feelHost.body.x === 120 && feelHost.scene.tweens.added === 0, 'key 2 does not jolt X');
assert(hurt === false, 'chef hurt waits for the late strike');
const feelHandler = feelHost.body._ons.find((row) => row.ev === 'animationupdate')?.fn;
feelHandler({ key: 'zombie-chef-attack' }, { index: 5 });
assert(hurt === false, 'chef frame 5 does not flinch the hero');
feelHandler({ key: 'zombie-chef-attack' }, { index: 6 });
assert(hurt === false, 'chef frame 6 does not flinch the hero');
feelHandler({ key: 'zombie-chef-attack' }, { index: 7 });
assert(hurt === true, 'chef frame 7 flinches the hero');

const nurse = attackHost({
  skin: { id: 'nurse' },
  _animKey(action) {
    if (action === 'attach') return 'zombie-nurse-attach';
    if (action === 'attack') return 'zombie-nurse-attack';
    return null;
  },
});
nurse._playAttackPunch();
assert(nurse.body.anims.currentAnim.key === 'zombie-nurse-attach', 'nurse bite plays attach in place');
assert(nurse.body.x === 120 && nurse._attackBeat === false, 'nurse wall flash waits on attach');
nurse.body._ons[0].fn({ key: 'zombie-nurse-attach' }, { index: 6 });
assert(nurse._attackBeat === false, 'nurse frame 6 is still before the attach strike');
nurse.body._ons[0].fn({ key: 'zombie-nurse-attach' }, { index: 7 });
assert(nurse._attackBeat === true, 'nurse contact is frame 7 of the 8-frame attach strip');

const plain = attackHost({ _isSprite: false, _animReady: () => false, skin: null });
plain._playAttackPunch();
assert(plain._attackBeat === true && plain.body.x === 120, 'a placeholder with no strip marks the beat without moving');

const petBite = attackHost({ atBarricade: false, petBiteTarget: { x: 1 } });
petBite._playAttackPunch();
assert(petBite._attackBeat === false && petBite.body._ons.length === 0, 'a pet bite does not arm a wall flash');

const cut = attackHost();
cut._playAttackPunch();
const late = cut.body._ons[0].fn;
cut._clearAttackContact();
late({ key: 'zombie-trashcan-attack' }, { index: 7 });
assert(cut._attackBeat === false, 'knockback clears a bite that has not reached the strike');

assert(enemySkillStrips('brute').length === 1, 'brute key 3 has one skill strip');
assert(enemySkillStrips('brute')[0].anim === BRUTE_SKILL_ANIM, 'brute key 3 plays the ground smash');
assert(
  !enemySkillStrips('brute').some((row) => /hurt_heavy|part_break|blasted_back|defeated/.test(row.anim)),
  'brute key 3 does not cycle the old stand-in strips',
);
assert(framesForAnimKey(BRUTE_SKILL_ANIM) === 17, 'ground smash is 17 frames');
assert(BRUTE_SKILL_FX_CELL === 8 && bruteSkillPhaserIndex(BRUTE_SKILL_FX_CELL) === 9, 'shock is catalog frame 8 / Phaser index 9');
assert(BRUTE_SKILL_HIT_CELL === 13 && bruteSkillPhaserIndex(BRUTE_SKILL_HIT_CELL) === 14, 'hit is catalog frame 13 / Phaser index 14');
assert(bruteSkillPhaserIndex(BRUTE_SKILL_HIT_CELL) === lateAttackFrame(17), 'smash hit uses the same ~80% rule as attack strips');
assert(ENEMY_ATTACK_HIT_FRAME.brute === 7, 'brute attack hit stays Phaser frame 7');
assert(BRUTE_GROUND_SMASH_DAMAGE === 36, 'smash burst is 36 HP and is not a wave-table edit');
assert(BRUTE_GROUND_SMASH_COOLDOWN === 5, 'live smash cooldown is 5s');
const meleeTouchCeiling = (96 * SCALE_NEAR * LAYOUT_SCALE) / 2;
assert(meleeTouchCeiling < 88, 'near-lane brute half-width stays under 88px');
assert(BRUTE_GROUND_SMASH_RADIUS > meleeTouchCeiling * 3, 'smash radius is wider than a melee touch');
const postW = 28 * LAYOUT_SCALE * (0.85 + 0.2 * SCALE_NEAR);
const boothWall = meleeTouchCeiling + layoutPx(72);
const boothHero = boothWall + postW + layoutPx(32);
assert(pointInBruteSmash(0, 0, boothWall, 0), 'booth hold reaches the posts');
assert(pointInBruteSmash(0, 0, boothHero, 0), 'booth hold reaches the hero');
assert(!pointInBruteSmash(0, 0, BRUTE_GROUND_SMASH_RADIUS + 1, 0), 'just outside the radius misses');
const smashPng = readFileSync(new URL('../assets/library/enemies/zombies/brute/strips/zombie-brute-skill_ground_smash.png', import.meta.url));
assert(smashPng.readUInt32BE(16) === 2244 && smashPng.readUInt32BE(20) === 132, 'smash strip stays 17×132');
const shockPng = readFileSync(new URL('../assets/library/fx/brute-skill/fx-brute-skill-shock.png', import.meta.url));
assert(shockPng.readUInt32BE(16) === 464 && shockPng.readUInt32BE(20) === 231, 'shock sheet stays the 4×3 grid');
const smashRow = JSON.parse(readFileSync(new URL('../assets/library/enemies/zombies/brute/manifest.json', import.meta.url), 'utf8'))
  .assets.find((asset) => asset.key === BRUTE_SKILL_ANIM);
assert(smashRow?.timing?.impactFrame === 8 && smashRow?.timing?.gameplayHitFrame === 13, 'manifest timing stays frame 8 and frame 13');
assert(smashRow?.fx?.[0] === BRUTE_SKILL_FX, 'smash strip names the shock FX');
assert(ZOMBIE_LIBRARY_SKINS.brute.actions.skill === BRUTE_SKILL_ANIM, 'brute skin plays the catalog smash');
assert(ZOMBIE_LIBRARY_SKINS.brute.noHurtKnockback === true, 'brute catalog sets noHurtKnockback');
for (const [id, def] of Object.entries(ZOMBIE_LIBRARY_SKINS)) {
  if (id === 'brute') continue;
  assert(def.noHurtKnockback !== true, `${id} still takes hurt knockback`);
}
for (const [id, def] of Object.entries(ZOMBIE_BOSS_SKINS)) {
  assert(def.noHurtKnockback !== true, `${id} still takes hurt knockback`);
}
assert(skipsHurtKnockback({ skin: ZOMBIE_LIBRARY_SKINS.brute }) === true, 'catalog brute skips the hurt shove');
assert(skipsHurtKnockback({ skin: ZOMBIE_LIBRARY_SKINS.nurse }) === false, 'catalog nurse still knocks back');
assert(skipsHurtKnockback({ noHurtKnockback: true }) === true, 'the instance flag skips the hurt shove');

/**
 * The hitstop kicks the body, then the last timer puts it back on the
 * post-knock home. Brute never takes the 2px shove, so that home is the
 * start X.
 * @param {typeof booth} scene
 * @param {object} target
 * @param {{ melee?: boolean, dirX?: number }} opts
 */
function playSettled(scene, target, opts) {
  /** @type {Function[]} */
  const later = [];
  const clocked = {
    ...scene,
    time: { delayedCall(_ms, fn) { later.push(fn); } },
  };
  const played = playFeelImpact(clocked, target, opts);
  for (const fn of later) fn();
  return played;
}
const plantedBody = { active: true, x: 400, y: 240, depth: 3, scaleX: 1, anims: { timeScale: 1 } };
const sparksBeforePlant = sparks;
const spawnedBeforePlant = spawned.length;
assert(
  playSettled(booth, { body: plantedBody, displayHalf: 20, bodyCenterY: 210, noHurtKnockback: true, _syncBars() {} }, { melee: false, dirX: -1 }) === true,
  'brute key 1 still plays the hit',
);
assert(plantedBody.x === 400 && plantedBody.y === 240, 'brute key 1 stays planted');
assert(spawned.length === spawnedBeforePlant && sparks === sparksBeforePlant, 'brute key 1 still spawns no slash and no sparks');
const plantedMelee = { active: true, x: 400, y: 240, depth: 3, scaleX: 1, anims: { timeScale: 1 } };
const meleeBeforePlant = spawned.length;
assert(
  playSettled(
    booth,
    { body: plantedMelee, displayHalf: 20, bodyCenterY: 210, skin: ZOMBIE_LIBRARY_SKINS.brute, _syncBars() {} },
    { melee: true, dirX: -1 },
  ) === true,
  'brute key 4 still plays the hit',
);
assert(plantedMelee.x === 400 && plantedMelee.y === 240, 'brute key 4 stays planted');
assert(spawned.at(-1).key === 'fx-slash-ninja' && spawned.at(-1).x === 400, 'brute slash stays on the planted body');

function knockStub(flag) {
  const z = Object.create(Zombie.prototype);
  z.alive = true;
  z.noHurtKnockback = flag;
  z.body = { x: 200, y: 100, setDepth() {} };
  z.knockbackMult = 1;
  z.laneY = 100;
  z.atBarricade = false;
  z.scene = { tweens: { killTweensOf() {} } };
  z._syncBars = () => {};
  z._applyDepth = () => {};
  return z;
}
const bruteStage = knockStub(true);
bruteStage.applyKnockback(12);
assert(bruteStage.body.x === 200 && bruteStage.body.y === 100, 'stage hurt knockback skips brute');
const nurseStage = knockStub(false);
nurseStage.skin = ZOMBIE_LIBRARY_SKINS.nurse;
nurseStage.applyKnockback(12);
assert(nurseStage.body.x === 188 && nurseStage.body.y === 100, 'stage hurt knockback still shoves other enemies');
const petFn = zombieSrc.slice(zombieSrc.indexOf('beginPetSlide(pixels'), zombieSrc.indexOf('\n  update('));
assert(!petFn.includes('skipsHurtKnockback') && !petFn.includes('noHurtKnockback'), 'pet slide is not gated by the brute flag');
assert(feelSrc.includes('skipsHurtKnockback'), 'feel booth reads the hurt-knockback flag');
assert(zombieSrc.includes('if (skipsHurtKnockback(this)) return;'), 'stage applyKnockback reads the hurt-knockback flag');

const shockFn = stageSrc.slice(stageSrc.indexOf('_spawnBruteSkillShock(z)'), stageSrc.indexOf('_resolveBruteSkillHit(z, opts'));
assert(shockFn.includes(BRUTE_SKILL_FX) && shockFn.includes('z.body.y'), 'shock FX anchors on the feet');
assert(!shockFn.includes('bodyCenterY'), 'shock FX does not use the chest');
const smashHitFn = stageSrc.slice(stageSrc.indexOf('_resolveBruteSkillHit(z, opts'), stageSrc.indexOf('_playSkillFx(z, animKey)'));
assert(smashHitFn.includes('pointInBruteSmash') && smashHitFn.includes('applyDamage(BRUTE_GROUND_SMASH_DAMAGE)'), 'stage burst uses the radius and the constant');
assert(smashHitFn.includes("_playHeroFeel('hurt')"), 'the hit frame flinches the hero');
assert(smashHitFn.includes('opts.feel !== true'), 'feel booth does not drain barricade HP');
assert(stageSrc.includes('playBruteGroundSmash') && stageSrc.includes("'3 ground smash'"), 'key 3 hint is the ground smash');
assert(stageSrc.includes('this.defenders?.player'), 'stage passes the hero into the live cast');
assert(!stageSrc.includes('camera.shake') && !stageSrc.includes('.shake('), 'the camera still does not shake');

function smashHost() {
  const host = attackHost({
    atBarricade: false,
    skin: { id: 'brute', actions: { skill: BRUTE_SKILL_ANIM } },
    _smashToken: 0,
    _animMarkToken: 0,
    _animMarkHandler: null,
    _showcaseToken: 0,
    _smashing: false,
    _smashCd: 0,
    scene: {
      tweens: { added: 0, killTweensOf() {}, add() { this.added += 1; } },
      anims: {
        exists: () => true,
        get: () => ({ frames: new Array(17), repeat: 0, frameRate: 10 }),
      },
      time: { delayedCall() {} },
    },
    _animKey(action) {
      if (action === 'skill') return BRUTE_SKILL_ANIM;
      if (action === 'attack') return 'zombie-brute-attack';
      return null;
    },
  });
  host.playShowcaseStrip = Zombie.prototype.playShowcaseStrip;
  host._clearAnimMarks = Zombie.prototype._clearAnimMarks;
  host._watchAnimFrames = Zombie.prototype._watchAnimFrames;
  host.playBruteGroundSmash = Zombie.prototype.playBruteGroundSmash;
  return host;
}
const smash = smashHost();
let shockFrames = 0;
let hitFrames = 0;
assert(
  smash.playBruteGroundSmash({
    onShock: () => { shockFrames += 1; },
    onHit: () => { hitFrames += 1; },
  }) === true,
  'key 3 starts the ground smash strip',
);
assert(smash.body.anims.currentAnim.key === BRUTE_SKILL_ANIM, 'the playing strip is the ground smash');
assert(smash.body.x === 120, 'the smash does not step the body');
const smashHandler = smash.body._ons.find((row) => row.ev === 'animationupdate')?.fn;
assert(typeof smashHandler === 'function', 'smash listens for the shown frame');
smashHandler({ key: BRUTE_SKILL_ANIM }, { index: 8 });
assert(shockFrames === 0 && hitFrames === 0, 'Phaser index 8 is still the windup');
smashHandler({ key: BRUTE_SKILL_ANIM }, { index: 9 });
smashHandler({ key: BRUTE_SKILL_ANIM }, { index: 9 });
assert(shockFrames === 1 && hitFrames === 0, 'shock FX fires once on Phaser index 9');
smashHandler({ key: BRUTE_SKILL_ANIM }, { index: 13 });
assert(hitFrames === 0, 'Phaser index 13 is the cell before the hit');
smashHandler({ key: BRUTE_SKILL_ANIM }, { index: 14 });
assert(hitFrames === 1 && shockFrames === 1, 'damage fires once on Phaser index 14');
const attackOnly = smashHost();
assert(attackOnly.playShowcaseAttack(7, () => {}) === true, 'brute attack strip is still the bite');
assert(attackOnly.body.anims.currentAnim.key === 'zombie-brute-attack', 'normal attack does not play the smash');

if (failed) {
  console.error(`${failed} v0.35 check(s) failed`);
  process.exit(1);
}
console.log('v0.35 checks ok');
