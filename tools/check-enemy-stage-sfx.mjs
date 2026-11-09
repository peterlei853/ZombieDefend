/**
 * Stage per-enemy react / skill cues, including brute ground smash.
 * Run: node tools/check-enemy-stage-sfx.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { ENEMY_SFX_FILES, ENEMY_SKILL_STRIPS, enemySfxClips } from '../src/data/enemyShowcase.js';
import { rosterForStage } from '../src/data/stageRoster.js';
import { Zombie } from '../src/entities/Zombie.js';
import {
  STAGE_SKILL_CAST_IDS,
  STAGE_SKILL_GAP_MS,
  playLivingEnemyCue,
  stageSkillCast,
  tickStageSkill,
} from '../src/systems/enemyStageSfx.js';
import { GAME_AUDIO, SoundManager } from '../src/systems/SoundManager.js';

let failed = 0;
function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const smashKey = 'sfx-enemy-brute-skill-ground_smash';
const audioFile = new URL(`../assets/audio/${smashKey}.mp3`, import.meta.url);
const liveFile = new URL('../assets/sfx/enemies/brute/skill-ground_smash.mp3', import.meta.url);
assert(existsSync(audioFile), 'brute ground smash is in assets/audio');
assert(existsSync(liveFile), 'brute ground smash live copy is in assets/sfx/enemies');
assert(
  readFileSync(audioFile).equals(readFileSync(liveFile)),
  'audio catalog and live showcase copy are the same bytes',
);
assert(ENEMY_SKILL_STRIPS.brute[0]?.cue === 'skill-ground_smash', 'brute skill strip cue is non-empty');
assert(ENEMY_SKILL_STRIPS.brute[0]?.anim === 'zombie-brute-skill_ground_smash', 'brute skill strip is the ground smash');
assert(ENEMY_SFX_FILES.brute.at(-1) === 'skill-ground_smash', 'brute pack appends skill-ground_smash');
const audioRow = GAME_AUDIO.find((clip) => clip.key === smashKey);
assert(audioRow?.url === `assets/audio/${smashKey}.mp3`, 'GAME_AUDIO lists the brute smash next to its file');
assert(
  enemySfxClips().some((clip) => clip.key === smashKey && clip.url === 'assets/sfx/enemies/brute/skill-ground_smash.mp3'),
  'showcase preload keeps the live smash URL',
);
assert(rosterForStage(5).join() === 'brute', 'stage 5 roster stays brute');
assert(STAGE_SKILL_CAST_IDS.join() === 'lava-balon,steel-balam', 'stage skill casts are Balun and Balam');

function heardScene() {
  const heard = [];
  const scene = {
    time: { now: 0 },
    cache: { audio: { exists: () => true } },
    sound: {
      mute: false,
      locked: false,
      add(key) {
        heard.push(key);
        return { play() {}, once() {}, destroy() {} };
      },
    },
  };
  return { heard, audio: new SoundManager(scene), scene };
}

{
  const { heard, audio } = heardScene();
  assert(audio.playEnemyCue('nope', 'hit') === false, 'unknown id has no catalog cue');
  assert(audio.playEnemyCue('s4-construction', 'hit') === false, 'S4 ids are not showcase cues');
  assert(audio.playEnemyCue('brute', 'skill-ground_smash') === true, 'brute smash key is catalogued');
  assert(heard.includes(smashKey), 'brute smash plays its own key');
  assert(!heard.includes('sfx-boss-balam-skill') && !heard.includes('sfx-boss-balun-skill'), 'brute smash does not play a boss sting');
}

{
  const { heard, audio } = heardScene();
  assert(audio.playEnemyCue('lava-balon', 'skill-lava_slam') === true, 'lava slam key is catalogued');
  assert(heard.includes('sfx-boss-balun-skill'), 'Balun skill still plays the balun sting');
  assert(heard.includes('sfx-enemy-lava-balon-skill-lava_slam'), 'Balun slam plays the per-skill cue');
  assert(audio.playEnemyCue('steel-balam', 'enrage') === true, 'Balam enrage key is catalogued');
  assert(heard.includes('sfx-enemy-steel-balam-enrage'), 'Balam enrage plays its cue');
}

function reactor(id, demo = null) {
  const rig = heardScene();
  const z = Object.create(Zombie.prototype);
  z.alive = true;
  z.hp = 40;
  z.maxHp = 40;
  z.skin = id ? { id } : null;
  z.scene = { demoEnemyId: demo, audio: rig.audio };
  z._syncBars = () => {};
  z._beginDeath = () => {};
  z._playHitFlash = () => {};
  z._playHurtStrip = () => {};
  z._beginHurtSlow = () => {};
  return { z, heard: rig.heard, audio: rig.audio };
}

{
  const { z, heard } = reactor('office-worker-v2');
  assert(z.takeDamage(100) === true, 'office kill lands');
  assert(heard.includes('sfx-enemy-office-worker-v2-die'), 'stage office death plays the catalog die');
  assert(heard.some((key) => /^sfx-office-death-[ab]$/.test(key)), 'stage office death keeps profession death a/b');
  assert(!heard.includes('zombie-death'), 'catalog die does not also play the shared death bed');
}

{
  const { z, heard } = reactor('office-worker-v2', 'office-worker-v2');
  z.takeDamage(100);
  assert(heard.includes('sfx-enemy-office-worker-v2-die'), 'feel booth office death stays the catalog die');
  assert(!heard.some((key) => /^sfx-office-death-[ab]$/.test(key)), 'feel booth does not add a profession death');
  assert(!heard.includes('zombie-death'), 'feel booth death does not fall back to the shared bed');
}

{
  const { z, heard } = reactor('brute');
  z.takeDamage(5);
  assert(heard.includes('sfx-enemy-brute-hit'), 'stage brute hit plays the catalog hit');
  assert(!heard.includes('zombie-hurt'), 'catalog hit replaces the shared hurt bed');
  z.hp = 5;
  z.alive = true;
  z.takeDamage(5);
  assert(heard.includes('sfx-enemy-brute-die'), 'stage brute death plays the catalog die');
  assert(!heard.includes('zombie-death'), 'brute death does not play the shared death bed');
  assert(!heard.some((key) => key.startsWith('sfx-office-death-')), 'brute has no profession death');
}

{
  const { z, heard } = reactor('s4-construction');
  z.takeDamage(5);
  assert(heard.includes('sfx-zombie-s4-construction-hit'), 'S4 hit vocal stays');
  assert(heard.includes('sfx-zombie-s4-construction-hurt'), 'S4 hurt vocal stays');
  assert(!heard.includes('zombie-hurt'), 'S4 hit does not add the shared hurt bed');
  z.hp = 5;
  z.alive = true;
  z.takeDamage(20);
  assert(heard.includes('sfx-zombie-s4-construction-death'), 'S4 death vocal stays');
  assert(!heard.includes('zombie-death'), 'S4 death does not add the shared death bed');
}

{
  const { z, heard } = reactor(null);
  z.takeDamage(5);
  assert(heard.includes('zombie-hurt'), 'a body with no catalog id keeps the shared hurt bed');
  z.takeDamage(50);
  assert(heard.includes('zombie-death'), 'a body with no catalog id keeps the shared death bed');
}

{
  const cues = [];
  let cursor = 0;
  let due = null;
  let gate = 0;
  let now = 0;
  const arm = stageSkillCast('lava-balon', cursor, now, due, gate, 0);
  assert(arm?.wait === true && arm.row == null, 'Balun arms before the first skill');
  cursor = arm.cursor;
  due = arm.due;
  now = due;
  for (let n = 0; n < 5; n += 1) {
    const step = stageSkillCast('lava-balon', cursor, now, due, gate, 0);
    assert(step?.row?.cue, `Balun skill ${n} has a cue`);
    cues.push(step.row.cue);
    cursor = step.cursor;
    due = step.due;
    gate = step.soundGate;
    now = due;
  }
  assert(
    cues.join() === 'skill-lava_slam,skill-volcanic_breath,skill-meteor_storm,enrage,skill-lava_slam',
    `Balun cycles per-skill cues (${cues.join()})`,
  );
  const blocked = stageSkillCast('steel-balam', 0, 1000, 1000, 1900, 1);
  assert(
    blocked?.wait === true && blocked.row == null && blocked.due === 1000 + STAGE_SKILL_GAP_MS + 350,
    'a second boss waits a full gap instead of chaining',
  );
  const steel = stageSkillCast('steel-balam', 0, 5000, 5000, 0, 0);
  assert(steel?.row?.cue === 'skill-ground_smash', 'Balam opens on its ground smash cue');
  assert(stageSkillCast('brute', 0, 99999, 0, 0, 1) == null, 'brute smash is not a stage boss cast');
  assert(stageSkillCast('office-worker-v2', 0, 99999, 0, 0, 1) == null, 'professions do not gain a skill cast');
}

{
  const heard = [];
  const audio = {
    playEnemyCue(id, cue) {
      heard.push(`${id}:${cue}`);
      return true;
    },
  };
  const z = {
    alive: true,
    id: 1,
    skin: { id: 'lava-balon' },
    holdSkillStrip() {},
    playShowcaseStrip(key) {
      heard.push(`strip:${key}`);
      return true;
    },
  };
  let state = tickStageSkill(null, z, 0, audio);
  state = tickStageSkill(state, z, 2749, audio);
  assert(heard.length === 0, 'Balun does not cast before the arm time');
  state = tickStageSkill(state, z, 2750, audio);
  assert(heard.includes('strip:zombie-boss-lava-lava_slam'), 'stage plays the Balun slam strip');
  assert(heard.includes('lava-balon:skill-lava_slam'), 'stage plays the Balun slam cue');
  const bite = { alive: true, skin: { id: 'nurse' } };
  assert(playLivingEnemyCue(audio, bite, 'hurt') === true, 'a living bite calls playEnemyCue');
  assert(heard.includes('nurse:hurt'), 'attack contact can use the catalog hurt cue');
  const quiet = { alive: true, skin: { id: 's4-schoolgirl' } };
  const miss = {
    playEnemyCue(id, cue) {
      heard.push(`${id}:${cue}`);
      return false;
    },
  };
  assert(playLivingEnemyCue(miss, quiet, 'hurt') === false, 'a missing hurt cue does not pretend it played');
  assert(state.soundGate > 2750, 'a played skill holds the voice gate');
}

const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const zombieSrc = readFileSync(new URL('../src/entities/Zombie.js', import.meta.url), 'utf8');
const soundSrc = readFileSync(new URL('../src/systems/SoundManager.js', import.meta.url), 'utf8');
assert(stageSrc.includes('_playStageEnemyCue'), 'stage routes living cues through one helper');
assert(stageSrc.includes("_playStageEnemyCue(z, 'hurt')"), 'attack contact calls playEnemyCue for hurt');
assert(stageSrc.includes('playBarricadeHit'), 'the wall hit stays beside the enemy hurt cue');
assert(stageSrc.includes('playEnemyCue?.(this.demoEnemyId, row.cue)'), 'feel booth skill cues stay on the strip');
assert(stageSrc.includes("playEnemyCue?.(this.demoEnemyId, 'hurt')"), 'feel booth hurt cue stays on the contact frame');
assert(zombieSrc.includes('playEnemyCue'), 'zombie hits and deaths call playEnemyCue');
assert(zombieSrc.includes('playZombieHurt'), 'shared hurt bed stays the fallback');
assert(zombieSrc.includes('playZombieDeath'), 'shared death bed stays the fallback');
assert(zombieSrc.includes("playS4Vocal?.(this.skin?.id, 'death')"), 'S4 death call site stays');
assert(zombieSrc.includes("playS4Vocal?.(this.skin?.id, 'hit')"), 'S4 hit call site stays');
assert(zombieSrc.includes("playS4Vocal?.(this.skin?.id, 'hurt')"), 'S4 hurt call site stays');
assert(zombieSrc.includes('playProfessionDeath?.(this.skin?.id)'), 'profession death call site stays');
assert(soundSrc.includes("cue.startsWith('skill')") && soundSrc.includes('_playBossSkillSting'), 'boss skill sting still rides skill cues');
assert(soundSrc.includes('!AUDIO_KEYS.has(key)') && soundSrc.includes('return false'), 'a missing catalog key returns false');

if (failed) {
  console.error(`${failed} enemy stage sfx check(s) failed`);
  process.exit(1);
}
console.log('enemy stage sfx checks passed');
