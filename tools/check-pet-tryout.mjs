/**
 * Sandbox pet try-out stays off stage combat.
 * The hub links to /sandbox/pet.html. Stage still refuses the new strips.
 */
import { readFileSync } from 'node:fs';
import { stageLibraryFilter } from '../src/assets/petLineup.js';

const hub = readFileSync(new URL('../sandbox/index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('../sandbox/pet.html', import.meta.url), 'utf8');
const demo = readFileSync(new URL('../src/sandbox/petTryout.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

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
assert(demo.includes("tryoutStrip(this.petId, this.form, 'claw')"), 'try-out plays the claw strip');
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

console.log('pet try-out: sandbox page only, stage filter unchanged');
