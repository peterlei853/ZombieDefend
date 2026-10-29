/**
 * Sandbox pet try-out stays off stage combat.
 * The hub links to /sandbox/pet.html. Stage still refuses the new strips.
 * Summon and recall preview clips play here only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { stageLibraryFilter } from '../src/assets/petLineup.js';
import { AUDIO_VOLUME, GAME_AUDIO, SoundManager, preloadGameAudio } from '../src/systems/SoundManager.js';

const hub = readFileSync(new URL('../sandbox/index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('../sandbox/pet.html', import.meta.url), 'utf8');
const demo = readFileSync(new URL('../src/sandbox/petTryout.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const combat = readFileSync(new URL('../src/systems/PetCombat.js', import.meta.url), 'utf8');
const waves = readFileSync(new URL('../src/systems/WaveManager.js', import.meta.url), 'utf8');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(hub.includes('href="pet.html"'), 'sandbox hub links to pet.html');
assert(hub.includes('/sandbox/pet.html'), 'sandbox hub names the Pages path');
assert(hub.includes('1 send/recall'), 'sandbox hub names the send key');
assert(page.includes('<base href="../">'), 'pet page resolves catalog paths from the repo root');
assert(page.includes('src="src/sandbox/petTryout.js"'), 'pet page boots the try-out module');
assert(page.includes('data-act="send"') && page.includes('data-act="attack"'), 'pet page has send and attack buttons');
assert(page.includes('data-act="skill"') && page.includes('data-act="evolve"'), 'pet page has skill and evolve buttons');
assert(page.includes('data-pet="dragon"') && page.includes('data-pet="lion"'), 'pet page lists the four pets');
assert(demo.includes('appearance') && demo.includes('sleep-start'), 'try-out plays send-out and sleep');
assert(demo.includes('matchIdle'), 'send-out appearance uses the idle body scale');
assert(demo.includes('paintedBottom'), 'padded appearance and skill-aoe anchor on painted feet');
assert(demo.includes('groundRingScale'), 'skill-aoe scale tracks the pet body');
assert(!demo.includes('360 /'), 'skill-aoe is not a 360px world sheet');
assert(/setDepth\(11\)/.test(demo) && /setAlpha\(0\.72\)/.test(demo), 'evolve pillar sits behind the body');
assert(demo.includes("tryoutStrip(this.petId, this.form, 'claw')"), 'try-out keeps the claw fallback');
assert(demo.includes("tryoutStrip(this.petId, this.form, 'attack')"), 'try-out prefers the attack strip');
assert(demo.includes('playPetMeleeHit') && demo.includes('playPetKnockback'), 'try-out plays melee and knockback cues');
assert(demo.includes('petSkillKey') && demo.includes('petSkillSpec'), 'try-out uses the skill manifest');
assert(demo.includes('evolve-from-baby') && demo.includes('playPetEvolve'), 'try-out plays the evolve strip and sting');
assert(demo.includes('sandboxPetFilter'), 'try-out loads its own pet filter');
assert(!stage.includes('petTryout') && !stage.includes('sandboxPetFilter'), 'stage scene does not start the try-out');
assert(!main.includes('petTryout') && !main.includes('PetTryout'), 'main game does not register the try-out');

for (const key of [
  'pet-dragon-baby-appearance',
  'pet-dragon-baby-claw',
  'pet-dragon-baby-skill-aoe',
  'pet-dragon-young-evolve-from-baby',
  'pet-phoenix-young-appearance',
]) {
  assert(stageLibraryFilter({ category: 'pets', key }) === false, `${key} stays out of stage load`);
}
assert(stageLibraryFilter({ category: 'pets', key: 'pet-dragon-baby-idle' }) === true, 'baby idle still loads on stage');
assert(stageLibraryFilter({ category: 'pets', key: 'pet-dragon-baby-skill' }) === true, 'baby skill still loads on stage');

for (const key of ['pet-summon', 'pet-recall', 'skill-telegraph']) {
  assert(demo.includes(`this.load.audio('${key}', 'assets/audio/${key}.mp3')`), `try-out preloads ${key}`);
  assert(existsSync(new URL(`../assets/audio/${key}.mp3`, import.meta.url)), `${key}.mp3 is in assets/audio`);
  const row = GAME_AUDIO.find((clip) => clip.key === key);
  assert(row?.url === `assets/audio/${key}.mp3`, `${key} is registered in GAME_AUDIO`);
}
const sendBody = demo.slice(demo.indexOf('send() {'), demo.indexOf('recall() {'));
assert(/if \(this\.out\) \{\s*this\.recall\(\);\s*return;\s*\}/.test(sendBody), 'send recalls before the summon cue');
assert(sendBody.includes('this.audio?.playPetSummon()'), 'send plays pet-summon after the pet goes out');
const recallBody = demo.slice(demo.indexOf('recall() {'), demo.indexOf('attack() {'));
assert(recallBody.includes('this.audio?.playPetRecall()'), 'recall plays pet-recall');
assert(!recallBody.includes('playPetSummon'), 'recall does not play summon');
const skillBody = demo.slice(demo.indexOf('skill() {'), demo.indexOf('evolve() {'));
assert(skillBody.includes('this.audio?.playSkillTelegraph()'), 'skill cast starts skill-telegraph');

assert(combat.includes('playPetSummon'), 'stage summon hook stays the existing call');
assert(!combat.includes('playPetRecall'), 'stage combat does not play pet-recall');
assert(!stage.includes('playPetRecall') && !stage.includes('pet-summon') && !stage.includes('pet-recall'), 'stage scene does not play the preview cues');
assert(!waves.includes('playPetSummon') && !waves.includes('playPetRecall') && !waves.includes('playSkillTelegraph'), 'waves do not play the preview cues');

const queued = [];
preloadGameAudio({
  load: { audio(key, url) { queued.push({ key, url }); } },
  cache: { audio: { exists: () => false } },
});
assert(!queued.some((row) => row.key === 'pet-summon' || row.key === 'pet-recall'), 'stage preload skips summon and recall');
assert(queued.some((row) => row.key === 'skill-telegraph' && row.url === 'assets/audio/skill-telegraph.mp3'), 'skill-telegraph stays on the stage preload');
assert(queued.some((row) => row.key === 'pet-melee-hit'), 'existing pet melee cue still preloads');

function mockAudioScene(keys) {
  const cache = new Set(keys);
  const added = [];
  return {
    added,
    sound: {
      mute: false,
      locked: false,
      add(key, cfg) {
        const node = { key, volume: cfg.volume, loop: cfg.loop, play() {}, once() {} };
        added.push(node);
        return node;
      },
    },
    cache: { audio: { exists: (key) => cache.has(key) } },
    time: { now: 0 },
  };
}

const preview = mockAudioScene(['pet-summon', 'pet-recall', 'skill-telegraph']);
const previewAudio = new SoundManager(preview);
previewAudio.playPetSummon();
previewAudio.playPetRecall();
previewAudio.playSkillTelegraph();
assert(preview.added.map((node) => node.key).join(',') === 'pet-summon,pet-recall,skill-telegraph', 'cached preview cues play');
assert(preview.added[0].volume === AUDIO_VOLUME.ui && preview.added[1].volume === AUDIO_VOLUME.ui, 'summon and recall use the ui volume');
assert(preview.added[2].volume === AUDIO_VOLUME.telegraph, 'skill telegraph uses the telegraph volume');
assert(AUDIO_VOLUME.ui === 0.4 && AUDIO_VOLUME.telegraph === 0.25, 'ui and telegraph volumes stay put');

const silent = mockAudioScene(['pet-melee-hit', 'skill-telegraph']);
const stageAudio = new SoundManager(silent);
stageAudio.playPetSummon();
stageAudio.playPetRecall();
assert(silent.added.length === 0, 'uncached summon and recall stay silent');

console.log('pet try-out: sandbox page only, stage filter unchanged');
