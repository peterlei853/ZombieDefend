/**
 * v0.36.28 Stage playback for the credit-burn SFX already on PR #154.
 * Run: node tools/check-v03628.mjs
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION, GAME_CONFIG } from '../src/data/GameConfig.js';
import { stageBalanceRows } from '../src/data/stageBalance.js';
import { s4VocalKey, s4VocalSlug } from '../src/data/vocalSfx.js';
import { BARRICADE_MAX_HP as WALL, WAVE_DEFS } from '../src/data/waves.js';
import {
  GAME_AUDIO,
  bossSkillKey,
  priorityWeaponKey,
  weaponShotKey,
} from '../src/systems/SoundManager.js';

let failed = 0;
function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const soundSrc = read('../src/systems/SoundManager.js');
const weaponSrc = read('../src/systems/WeaponSystem.js');
const petSrc = read('../src/systems/PetCombat.js');
const zombieSrc = read('../src/entities/Zombie.js');
const ambienceSrc = read('../src/systems/vocalAmbience.js');
const fenceSrc = read('../src/entities/Barricade.js');
const stageSrc = read('../src/scenes/StageScene.js');
const shopSrc = read('../src/scenes/ShopScene.js');
const damageSrc = read('../src/ui/damageText.js');
const keys = new Set(GAME_AUDIO.map((row) => row.key));

assert(pkg.version === '0.36.28' && APP_VERSION === '0.36.28', 'version is 0.36.28');
assert(html.includes('ZombieDefend v0.36.28'), 'document title is v0.36.28');
assert(WALL === 720, 'barricade max HP stays 720');
assert(GAME_CONFIG.PLAYER.ATTACK === 10, 'opening attack stays 10');
assert(WAVE_DEFS.map((def) => def.total).join() === '5,6,10,48', 'legacy wave totals stay');
const s1 = stageBalanceRows(1);
assert(s1.reduce((sum, row) => sum + row.count, 0) === 16, 'stage 1 spawn count stays 16');
assert(s1[2].count === 3 && s1[3].count === 4, 'stage 1 waves 3–4 stay eased');

const moments = ['shot', 'charge', 'hit', 'aoe', 'aoe-explode'];
const slugs = { sling: 'sling', bubble: 'bubble', lightning: 'rail', frost: 'freeze', flame: 'flame' };
for (const [id, slug] of Object.entries(slugs)) {
  for (const moment of moments) {
    const key = `sfx-weapon-${slug}-${moment}`;
    assert(keys.has(key), `${key} is catalogued`);
    assert(priorityWeaponKey(id, moment) === key, `${id} ${moment} → ${key}`);
  }
}
assert(priorityWeaponKey('water', 'shot') === null, 'water stays off the priority map');
assert(weaponShotKey({ id: 'sling' }) === 'sfx-weapon-sling-shot', 'sling shot replaces shoot-sling');
assert(weaponShotKey({ id: 'lightning' }) === 'sfx-weapon-rail-shot', 'lightning shot is the rail clip');
assert(weaponShotKey({ id: 'frost' }) === 'sfx-weapon-freeze-shot', 'frost shot is the freeze clip');
assert(weaponShotKey({ id: 'water' }) !== 'sfx-weapon-water-shot', 'water shot is not a priority key');
assert(keys.has('sfx-pet-dragon-attack'), 'dragon attack clip is catalogued');

assert(bossSkillKey('lava-balon') === 'sfx-boss-balun-skill', 'lava-balon uses the balun sting');
assert(bossSkillKey('balun') === 'sfx-boss-balun-skill', 'balun sting');
assert(bossSkillKey('steel-balam') === 'sfx-boss-balam-skill', 'steel-balam sting');
assert(bossSkillKey('balam') === 'sfx-boss-balam-skill', 'balam sting');
assert(bossSkillKey('office-worker-v2') === null, 'profession skins have no boss sting');

assert(s4VocalSlug('delivery') === null, 'bare delivery stays the profession vocal');
assert(s4VocalSlug('s4-delivery') === 'delivery', 's4-delivery is the S4 slug');
assert(s4VocalSlug('zombie-s4-construction') === 'construction', 'zombie-s4-construction slug');
assert(s4VocalSlug('schoolgirl') === 'schoolgirl', 'bare schoolgirl is an S4 slug');
assert(s4VocalKey('s4-delivery', 'death') === 'sfx-zombie-s4-delivery-death', 'S4 delivery death key');
assert(s4VocalKey('delivery', 'death') === null, 'profession delivery has no S4 death key');
for (const slug of ['construction', 'schoolgirl', 'delivery', 'salaryman']) {
  for (const kind of ['growl', 'hit', 'hurt', 'death']) {
    assert(keys.has(`sfx-zombie-s4-${slug}-${kind}`), `sfx-zombie-s4-${slug}-${kind} is catalogued`);
  }
}

for (const key of [
  'sfx-ui-click', 'sfx-ui-shop', 'sfx-ui-dmg', 'sfx-ui-heal', 'sfx-ui-wave', 'sfx-ui-settings',
  'sfx-coin-pickup', 'sfx-fence-crack', 'sfx-fence-break',
  'sfx-item-heal', 'sfx-item-ammo', 'sfx-item-speed', 'sfx-item-shield', 'sfx-item-magnet', 'sfx-item-bomb',
]) {
  assert(keys.has(key), `${key} stays in GAME_AUDIO`);
}

assert(soundSrc.includes("this._cue('sfx-coin-pickup'"), 'coin pickup uses the new clip');
assert(soundSrc.includes("this._cue('sfx-ui-click', 0.34)"), 'UI click uses the new clip');
assert(soundSrc.includes('playDragonAttack') && soundSrc.includes('playS4Vocal'), 'dragon and S4 helpers exist');
assert(soundSrc.includes('playUiShop') && soundSrc.includes('playUiDmg') && soundSrc.includes('playUiHeal') && soundSrc.includes('playUiWave'), 'UI helpers exist');
assert(soundSrc.includes('playFenceCrack') && soundSrc.includes('playFenceBreak'), 'fence helpers exist');
assert(soundSrc.includes("cue.startsWith('skill')") && soundSrc.includes('_playBossSkillSting'), 'boss skill sting rides the feel cue');
assert(!soundSrc.includes('playItemPickup') && !soundSrc.includes('playUiSettings'), 'settings and item drops stay unwired');

assert(weaponSrc.includes('playPriorityAoeExplode') && weaponSrc.includes('syncPriorityCharge'), 'weapon area and charge call sites');
assert(weaponSrc.includes("playWeaponShot?.({ id: 'flame' }"), 'flame shot plays when the cone is born');
assert(weaponSrc.includes("playPriorityHit?.('sling')") && weaponSrc.includes("playPriorityAoe?.('lightning')"), 'sling hit and rail chain call sites');
assert(petSrc.includes('playDragonAttack') && petSrc.includes("actor.role?.id !== 'dragon'"), 'dragon swing replaces the generic pet attack');
assert(!petSrc.includes('pet-dragon-baby-attack'), 'no dragon attack strip from another branch');
assert(petSrc.includes('playUiHeal'), 'recalled pet heal plays the heal cue');
assert(zombieSrc.includes("playS4Vocal?.(this.skin?.id, 'death')") && zombieSrc.includes("playS4Vocal?.(this.skin?.id, 'hit')") && zombieSrc.includes("playS4Vocal?.(this.skin?.id, 'hurt')"), 'S4 hit hurt death call sites');
assert(ambienceSrc.includes("playS4Vocal?.(skinId, 'growl')"), 'S4 growl call site');
assert(fenceSrc.includes('playFenceCrack') && fenceSrc.includes('playFenceBreak'), 'fence crack and break call sites');
assert(stageSrc.includes('playUiWave'), 'wave banner plays the wave cue');
assert(shopSrc.includes('playUiShop'), 'shop open plays the shop cue');
assert(damageSrc.includes('playUiDmg'), 'a new damage floater plays the dmg cue');

if (failed) {
  console.error(`${failed} v0.36.28 check(s) failed`);
  process.exit(1);
}
console.log('v0.36.28 checks passed');
