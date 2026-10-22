/**
 * v0.29 pet hit-feel checks (no Phaser, no browser).
 * Run: node tools/check-v029.mjs
 *
 * Player Tester checklist:
 * 1. Attack readability — skill tell stays opaque ≥220ms; a hit hitches
 *    30–50ms and shoves the zombie 4–8px; melee draws a one-frame fan
 *    (PETS.MELEE.FAN can turn it off).
 * 2. Hurt feel — white → red → hurt strip stays; 120–180ms invuln after
 *    a bite; under 30% HP the pet bar pulses and Recall! floats once.
 * 3. Role / aggro — T1 leans at the healthy crowd, T2 at a wounded
 *    finisher, T3 at the breach. Pets sit 10–20% off the hero's west
 *    ray unless the wall is under pressure, then they taunt the posts.
 * 4. Ult — basics and small skills pause through the letterbox and for
 *    ~0.3s after it ends.
 * 5. DPS budget — PETS.SURROUND_DPS_RATIO (default 0.50, band 0.40–0.60)
 *    is the whole pet team's share of HERO_REFERENCE_DPS while surrounded.
 *
 * v0.29.1 Player Tester: hard-refresh, `?petLowHp=1` or press L with a
 * pet on field → bar pulses + one Recall!. `?petHurt=1` / H stays visual.
 */
import { readFileSync } from 'node:fs';
import { APP_VERSION, GAME_CONFIG, HERO_REFERENCE_DPS, petHurtDebugRequested, petLowHpDebugRequested, petSurroundHitScale } from '../src/data/GameConfig.js';
import { BARRICADE_MAX_HP } from '../src/data/waves.js';
import { getGoldByHP } from '../src/data/economy.js';
import { barricadeXAtY, layoutPx, grassYMax, grassYMin } from '../src/systems/DepthView.js';
import { petLaneDrop } from '../src/systems/footprints.js';
import { barricadePressureHigh, pickPetCombatTarget } from '../src/systems/petTarget.js';
import { PetCombat } from '../src/systems/PetCombat.js';
import { ULT_MS } from '../src/systems/UltCutscene.js';

let failed = 0;

function assert(cond, message) {
  if (cond) return;
  failed += 1;
  console.error(`FAIL: ${message}`);
}

const pets = GAME_CONFIG.PETS;
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const combatSrc = readFileSync(new URL('../src/systems/PetCombat.js', import.meta.url), 'utf8');
const soundSrc = readFileSync(new URL('../src/systems/SoundManager.js', import.meta.url), 'utf8');
const hudSrc = readFileSync(new URL('../src/ui/PetPortraitHud.js', import.meta.url), 'utf8');
const stageSrc = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const titleSrc = readFileSync(new URL('../src/scenes/TitleScene.js', import.meta.url), 'utf8');

assert(pkg.version === '0.36.28' && APP_VERSION === '0.36.28', 'package and APP_VERSION are v0.36.28');
assert(html.includes('v0.36.28'), 'document title is v0.36.28');
assert(pets.HP === 192 && BARRICADE_MAX_HP === 720, 'pet HP and barricade HP stay put');
assert(getGoldByHP(40) === 10 && getGoldByHP(120) === 15, 'gold-by-HP stays put');

assert(pets.TELEGRAPH_MS >= 220, `telegraph hold is at least 220ms (${pets.TELEGRAPH_MS})`);
assert(combatSrc.includes('discFill: 0.92'), 'skill tell disc stays opaque');
const shove = layoutPx(pets.KNOCKBACK_PX);
assert(shove >= 4 && shove <= 8, `on-zombie shove is 4–8 canvas px (${shove})`);
assert(pets.HITSTOP_HIT_MS >= 30 && pets.HITSTOP_HIT_MS <= 50, 'hit-stop is 30–50ms');
assert(pets.MELEE.FAN === true && pets.MELEE.FAN_MS > 0 && pets.MELEE.FAN_MS <= 32, 'melee fan is one frame');
assert(combatSrc.includes('MELEE.FAN === false'), 'melee fan has a kill switch');

assert(pets.HURT_INVULN_MS >= 120 && pets.HURT_INVULN_MS <= 180, 'hurt invuln is 120–180ms');
assert(
  pets.HURT_MS === pets.HURT_FLASH_MS + pets.HURT_TINT_MS + pets.HURT_STRIP_MS,
  'white → red → strip timings stay'
);
assert(pets.LOW_HP_RATIO === 0.3, 'low HP bar starts under 30%');
assert(hudSrc.includes('view.lowHp'), 'portrait bar pulses from the low-HP flag');
assert(pets.ULT_RESUME_MS >= 250 && pets.ULT_RESUME_MS <= 350, 'skills resume ~0.3s after the letterbox');

assert(pets.RAY_OFFSET >= 0.1 && pets.RAY_OFFSET <= 0.2, 'aim offset is 10–20% of the lane');
assert(pets.SURROUND_DPS_RATIO >= 0.4 && pets.SURROUND_DPS_RATIO <= 0.6, 'surrounded pet DPS ratio is 40–60%');
assert(HERO_REFERENCE_DPS > 100 && HERO_REFERENCE_DPS < 220, `hero reference DPS is documented (${HERO_REFERENCE_DPS})`);
const scale = petSurroundHitScale();
const cycleSec = (pets.MELEE.WINDUP_MS + pets.MELEE.RECOVER_MS + pets.MELEE.GAP_MS) / 1000;
const packDps = 4 * (pets.MELEE.DAMAGE / cycleSec) * pets.SURROUND_HITS * scale;
const share = packDps / HERO_REFERENCE_DPS;
assert(Math.abs(share - pets.SURROUND_DPS_RATIO) < 0.02, `surrounded pack DPS share is the ratio (${share})`);

assert(combatSrc.includes('playPetMeleeHit') && combatSrc.includes('playPetKnockback') && combatSrc.includes('playSkillTelegraph'), 'hit cues call SoundManager');
assert(soundSrc.includes("playPetMeleeHit") && soundSrc.includes("'pet-melee-hit'"), 'melee hit key is pet-melee-hit');
assert(soundSrc.includes("'pet-knockback'") && soundSrc.includes("'skill-telegraph'"), 'knockback and telegraph keys');
assert(
  soundSrc.includes("key: 'pet-melee-hit'") && soundSrc.includes("key: 'pet-knockback'") && soundSrc.includes("key: 'skill-telegraph'"),
  'the three cue keys are in the audio catalog'
);
assert(!combatSrc.includes('.shake('), 'pet combat does not shake the camera');

const span = grassYMax() - grassYMin();
const heroY = (grassYMin() + grassYMax()) / 2;
const body = () => ({});
const onRay = { id: 'gun', alive: true, body: body(), x: 400, y: heroY, hp: 80, maxHp: 80 };
const offsetY = heroY + span * pets.RAY_OFFSET;
const offset = { id: 'side', alive: true, body: body(), x: 420, y: offsetY, hp: 80, maxHp: 80 };
const picked = pickPetCombatTarget([onRay, offset], { heroY, tier: 1, slot: 1, pressure: false });
assert(picked === offset, 'pet prefers the lane 15% off the hero ray');
const only = pickPetCombatTarget([onRay], { heroY, tier: 1, slot: 0, pressure: false });
assert(only === onRay, 'a lone zombie on the ray is still fought');

const healthy = { id: 'healthy', alive: true, body: body(), x: 430, y: offsetY, hp: 100, maxHp: 100 };
const wounded = { id: 'wounded', alive: true, body: body(), x: 432, y: offsetY + 2, hp: 20, maxHp: 100 };
assert(pickPetCombatTarget([healthy, wounded], { heroY, tier: 1, slot: 1, pressure: false }) === healthy, 'T1 crowd-control prefers the healthy body');
assert(pickPetCombatTarget([healthy, wounded], { heroY, tier: 2, slot: 1, pressure: false }) === wounded, 'T2 finisher prefers the wounded body');
const breach = { id: 'breach', alive: true, body: body(), x: 700, y: offsetY, hp: 80, maxHp: 80 };
const deep = { id: 'deep', alive: true, body: body(), x: 200, y: offsetY, hp: 80, maxHp: 80 };
assert(pickPetCombatTarget([deep, breach], { heroY, tier: 3, slot: 1, pressure: false }) === breach, 'T3 ultimate focus prefers the breach');

const wallY = heroY;
const wallX = barricadeXAtY(wallY);
const near = (id, gap) => ({ id, alive: true, body: body(), x: wallX - gap, y: wallY, hp: 40, maxHp: 40 });
const packed = [near('a', layoutPx(10)), near('b', layoutPx(20)), near('c', layoutPx(30))];
const far = { id: 'far', alive: true, body: body(), x: 200, y: offsetY, hp: 40, maxHp: 40 };
assert(barricadePressureHigh([...packed, far]), 'three zombies on the posts is high pressure');
assert(!barricadePressureHigh([packed[0], far]), 'one zombie on the posts is not high pressure');
const taunt = pickPetCombatTarget([...packed, far], { heroY, tier: 1, slot: 1 });
assert(taunt === packed[0], 'high pressure taunts the zombie nearest the wall');

const { mockScene, lane } = makeHarness();
const audio = {
  melee: 0,
  knock: 0,
  tell: 0,
  playPetMeleeHit() { this.melee += 1; },
  playPetKnockback() { this.knock += 1; },
  playSkillTelegraph() { this.tell += 1; },
  playHitImpact() {},
  playPetSummon() {},
  playPetDeath() {},
  playPetReviveReady() {},
};
const scene = mockScene(audio);
const combat = new PetCombat(scene);
const player = { x: lane.fenceX + layoutPx(28), y: lane.laneY };
const zombie = {
  id: 7,
  alive: true,
  body: {},
  x: lane.foeX,
  y: lane.laneY,
  maxHp: 80,
  hp: 80,
  visualTop: lane.laneY - 48,
  bodyCenterY: lane.laneY - 24,
  goldValue: 10,
  slides: 0,
  beginPetSlide(px) { this.slides += 1; this.slidePx = px; },
  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  },
};
assert(combat.summon(0, player, [zombie]).ok, 'melee harness summons');
const bodySprite = scene._sprites.find((sprite) => sprite.textureKey === 'pet-phoenix-baby-idle');
const stand = layoutPx(pets.MELEE.RANGE * 0.7);
bodySprite.x = zombie.x + stand;
bodySprite.y = zombie.y + petLaneDrop(layoutPx(36), layoutPx(52));
combat.update(400, [zombie], player);
assert(combat.fxLog.includes('melee-fan'), 'melee impact draws the fan');
assert(audio.melee === 1, 'melee hit plays pet-melee-hit');
assert(zombie.slides >= 1 && zombie.slidePx >= 4 && zombie.slidePx <= 8, `knockback impulse is 4–8px (${zombie.slidePx})`);
assert(audio.knock >= 1, 'knockback plays pet-knockback');
combat.update(pets.MELEE.FAN_MS + 5, [zombie], player);
assert(scene._fans.every((fan) => fan.active === false), 'the fan lasts one frame');

const pet = combat.fieldPets()[0];
const before = pet.hp;
pet.takeDamage(12);
pet.takeDamage(12);
assert(Math.abs(pet.hp - (before - 12)) < 0.01, 'second hit inside invuln does not spend HP');
combat.update(pets.HURT_INVULN_MS + 20, [zombie], player);
const mid = pet.hp;
pet.takeDamage(140);
assert(Math.abs(pet.hp - (mid - 140)) < 0.01, 'a hit after invuln spends HP');
assert(pet.hp / pets.HP < pets.LOW_HP_RATIO, 'the pet is under 30% HP');
combat.update(pets.HURT_INVULN_MS + 20, [zombie], player);
assert(combat.portraitViews()[0].lowHp === true, 'portrait view flags the low bar');
assert(combat.fxLog.includes('low-hp-recall'), 'low HP floats Recall! once');
const hints = combat.fxLog.filter((tag) => tag === 'low-hp-recall').length;
pet.takeDamage(4);
assert(combat.fxLog.filter((tag) => tag === 'low-hp-recall').length === hints, 'the recall hint does not repeat while still low');

combat.setUnlockedOrbs(3);
assert(combat.forceUlt('phoenix'), 'letterbox starts');
let holdSeen = 0;
for (let t = 0; t < ULT_MS; t += 50) combat.update(50, [zombie], player);
assert(combat.attackHoldMs === pets.ULT_RESUME_MS, `letterbox end arms the resume hold (${combat.attackHoldMs})`);
combat.update(100, [zombie], player);
holdSeen = combat.attackHoldMs;
assert(holdSeen > 0 && holdSeen < pets.ULT_RESUME_MS, 'hold ticks down after the letterbox');
assert(combat.ultPlaying === false, 'letterbox has ended');
const castsAtHold = combat.castLog.length;
combat.update(80, [zombie], player);
assert(combat.castLog.length === castsAtHold, 'small skills do not cast during the resume hold');
combat.update(pets.ULT_RESUME_MS, [zombie], player);
assert(combat.attackHoldMs === 0, 'resume hold ends');

combat.destroy();

const lowTarget = Math.max(1, Math.floor(pets.HP * 0.25));
const low = new PetCombat(scene);
assert(low.debugLowHp(player) === true, 'empty field still gets a low-HP body');
assert(low.fieldPets().length === 1, 'debug low HP summons one pet when the field is empty');
assert(low.fieldPets()[0].hp === lowTarget, `summoned pet sits at 25% of max (${low.fieldPets()[0].hp})`);
assert(low.fieldPets()[0].hp / pets.HP < pets.LOW_HP_RATIO, 'summoned pet is under the pulse line');
assert(low.portraitViews()[0].lowHp === true, 'portrait pulses from the debug drop');
assert(low.fxLog.filter((tag) => tag === 'low-hp-recall').length === 1, 'one Recall! on the first drop');
assert(low.debugLowHp(player) === true, 'a second L still applies');
assert(low.fxLog.filter((tag) => tag === 'low-hp-recall').length === 1, 'Recall! does not repeat while still low');
low.destroy();

const pair = new PetCombat(scene);
assert(pair.summon(0, player, []).ok && pair.summon(1, player, []).ok, 'two field pets for the low-HP debug');
assert(pair.debugLowHp(player) === true, 'debug low HP hits every field pet');
const dropped = pair.fieldPets();
assert(dropped.length === 2 && dropped.every((pet) => pet.hp === lowTarget && pet.hp / pets.HP < pets.LOW_HP_RATIO), 'each field pet is just under 30%');
assert(pair.portraitViews().filter((view) => view.lowHp).length === 2, 'both bars pulse');
assert(pair.fxLog.filter((tag) => tag === 'low-hp-recall').length === 2, 'one Recall! per field pet');
const held = pair.fieldPets()[0].hp;
assert(pair.debugHurtOnce(player) === true, 'H still plays the visual flinch');
assert(pair.fieldPets()[0].hp === held, 'H does not spend the HP the low-HP debug set');
pair.destroy();

assert(combatSrc.includes('debugLowHp') && combatSrc.includes('Math.floor(max * 0.25)'), 'debug low HP sets 25% and uses the recall latch');
assert(stageSrc.includes('KeyCodes.L') && stageSrc.includes('petLowHp') && stageSrc.includes('debugLowHp'), 'L and ?petLowHp=1 are wired');
assert(stageSrc.includes('KeyCodes.H') && stageSrc.includes('debugHurtOnce'), 'H stays the visual hurt path');
assert(titleSrc.includes('petLowHpDebugRequested'), 'title boots the stage for ?petLowHp=1');
const prevLocation = globalThis.location;
globalThis.location = { search: '?petLowHp=1' };
assert(petLowHpDebugRequested() === true && petHurtDebugRequested() === false, '?petLowHp=1 does not request the hurt strip');
globalThis.location = { search: '?petHurt=1' };
assert(petHurtDebugRequested() === true && petLowHpDebugRequested() === false, '?petHurt=1 stays visual-only');
globalThis.location = prevLocation;

if (failed) {
  console.error(`${failed} v0.29 check(s) failed`);
  process.exit(1);
}
console.log('v0.29 checks passed');

function makeHarness() {
  const laneY = 432;
  // barricadeXAtY is not required for the fan; the pet is placed by hand.
  const fenceX = 900;
  const sprites = [];
  const fans = [];
  const scene = {
    _sprites: sprites,
    _fans: fans,
    cameras: { main: { scrollX: 400, scrollY: 0, width: 1280, height: 720 } },
    time: { now: 0, delayedCall() {} },
    tweens: { add() { return { stop() {} }; }, killTweensOf() {} },
    anims: { exists: () => true },
    textures: { exists: () => true },
    events: { once() {}, emit() {} },
    add: {
      text(x, y, value) {
        const node = {
          x, y, active: true, label: value,
          setText(next) { node.label = next; return node; },
          setOrigin() { return node; },
          setDepth() { return node; },
          setAlpha() { return node; },
          once() { return node; },
          destroy() { node.active = false; },
        };
        return node;
      },
      sprite(x, y, key) {
        const anim = { key: '', playing: false, frame: 0 };
        const sprite = {
          x, y, scaleX: 1, scaleY: 1, alpha: 1, active: true, textureKey: key,
          _played: [],
          setOrigin() { return sprite; },
          setScale(sx, sy) { sprite.scaleX = sx; sprite.scaleY = sy ?? sx; return sprite; },
          setDepth() { return sprite; },
          setFlipX() { return sprite; },
          setFlipY() { return sprite; },
          setAlpha() { return sprite; },
          setRotation() { return sprite; },
          setData() { return sprite; },
          setTintFill() { return sprite; },
          clearTint() { return sprite; },
          once() { return sprite; },
          play(name) {
            anim.key = name;
            anim.playing = true;
            sprite._played.push(name);
            return sprite;
          },
          anims: {
            get currentAnim() { return { key: anim.key }; },
            get isPlaying() { return anim.playing; },
            get currentFrame() { return { index: anim.frame }; },
            getProgress() { return 0; },
          },
          destroy() { sprite.active = false; },
        };
        sprites.push(sprite);
        return sprite;
      },
      rectangle(x, y, w, h) {
        return {
          x, y, width: w, height: h, active: true,
          setOrigin() { return this; },
          setScale() { return this; },
          setDepth() { return this; },
          setFillStyle() { return this; },
          setStrokeStyle() { return this; },
          destroy() { this.active = false; },
        };
      },
      circle(x, y, r, color, alpha) {
        const node = {
          x, y, radius: r, color, alpha, active: true,
          setDepth() { return node; },
          setAlpha(value) { node.alpha = value; return node; },
          setData() { return node; },
          destroy() { node.active = false; },
        };
        fans.push(node);
        return node;
      },
    },
  };
  scene.audio = null;
  return {
    mockScene(audio) {
      scene.audio = audio;
      return scene;
    },
    lane: { laneY, fenceX, foeX: fenceX - layoutPx(110) },
  };
}
