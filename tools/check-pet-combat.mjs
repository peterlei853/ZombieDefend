/**
 * Baby-pet summon checks (no Phaser, no browser).
 * Run: node tools/check-pet-combat.mjs
 *
 * Portraits own summon. Pets start off the field. Timeout starts skill CD
 * only. Death starts revive CD only. A tap with no enemies does not spend CD.
 */
import { existsSync, readFileSync } from 'node:fs';
import { GAME_CONFIG, APP_VERSION } from '../src/data/GameConfig.js';
import { PET_LINEUP, PET_STAGE_KEYS, stageLibraryFilter } from '../src/assets/petLineup.js';
import { barricadeXAtY, layoutPx } from '../src/systems/DepthView.js';
import { nearestFieldPet, petReachableBeforeFence } from '../src/systems/petAggro.js';
import {
  PetCombat,
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
assert(pkg.version === '0.20.1', `package.json version ${pkg.version}`);
assert(APP_VERSION === '0.20.1', `APP_VERSION ${APP_VERSION}`);
assert(pkg.version === APP_VERSION, 'package version matches APP_VERSION');

const boot = readFileSync(new URL('../src/scenes/BootScene.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/scenes/StageScene.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const defender = readFileSync(new URL('../src/entities/Defender.js', import.meta.url), 'utf8');
const hud = readFileSync(new URL('../src/ui/PetPortraitHud.js', import.meta.url), 'utf8');
const combatSrc = readFileSync(new URL('../src/systems/PetCombat.js', import.meta.url), 'utf8');
assert(boot.includes('APP_VERSION'), 'title uses APP_VERSION');
assert(!boot.includes('v0.19'), 'boot title is not 0.19');
assert(stage.includes('APP_VERSION'), 'HUD uses APP_VERSION');
assert(html.includes('v0.20.1'), 'document title is v0.20.1');
assert(!defender.includes('_createLineupPet'), 'fence lineup is not spawned');
assert(!defender.includes('petLineupSlots'), 'defender does not place fence slots');
assert(defender.includes('summonPet'), 'defender summons from portraits');
assert(stage.includes('nearestFieldPet'), 'stage routes aggro to field pets');
assert(stage.includes('petContactDamage'), 'pet bites are separate from barricade DPS');
assert(hud.includes('出戰中'), 'field badge is 出戰中');
assert(hud.includes('沒有目標'), 'empty tap toasts 沒有目標');
assert(combatSrc.includes('playPetSummon'), 'summon SFX hook');
assert(combatSrc.includes('playPetDeath'), 'death SFX hook');
assert(combatSrc.includes('playPetReviveReady'), 'revive-ready SFX hook');

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
assert(PET_STAGE_KEYS.has('pet-panda-baby-move'), 'panda move loads');
assert(PET_STAGE_KEYS.has('fx-pet-phoenix-spark-feather'), 'phoenix bolt loads');
assert(PET_STAGE_KEYS.has('fx-pet-panda-roll-impact'), 'panda impact loads');
assert(PET_STAGE_KEYS.has('fx-pet-lion-pounce-slash'), 'lion slash loads');
assert(!PET_STAGE_KEYS.has('fx-pet-lion-roar-wave'), 'baby lion does not load roar');
assert(PET_STAGE_KEYS.has('fx-pet-dragon-smoke-breath'), 'dragon breath loads');
assert(!PET_STAGE_KEYS.has('fx-pet-dragon-fireball'), 'baby dragon does not load fireball');
assert(!PET_STAGE_KEYS.has('pet-phoenix-young-skill'), 'young form stays unloaded');
assert(stageLibraryFilter({ category: 'hero', key: 'player-girl' }), 'hero still loads');
assert(stageLibraryFilter({ category: 'hero', key: 'icon-flame', type: 'icon' }), 'hero icons still load');
assert(!stageLibraryFilter({ category: 'pets', key: 'pet-lion-ancient-idle' }), 'ancient filtered');

const HEAD_KEYS = [
  'ui-pet-phoenix-head',
  'ui-pet-panda-head',
  'ui-pet-lion-head',
  'ui-pet-dragon-head',
];
assert(PET_LINEUP.map((pet) => pet.portrait).join() === HEAD_KEYS.join(), 'portrait keys are formal heads');
for (const key of HEAD_KEYS) {
  assert(PET_STAGE_KEYS.has(key), `${key} is queued with the stage`);
  assert(!key.includes('baby-idle'), `${key} is not an idle strip`);
}
const index = JSON.parse(readFileSync(new URL('../assets/library/asset-index.json', import.meta.url), 'utf8'));
const headManifest = JSON.parse(
  readFileSync(new URL('../assets/library/pets/ui/manifest.json', import.meta.url), 'utf8')
);
for (const key of HEAD_KEYS) {
  const asset = index.assets.find((entry) => entry.key === key);
  assert(asset?.type === 'icon' && asset.category === 'pets', `${key} is a pets icon in the catalog`);
  assert(asset.frames === 1 && asset.frameWidth === 48 && asset.frameHeight === 48, `${key} is 48×48`);
  assert(headManifest.assets.some((entry) => entry.key === key && entry.path === asset.path), `${key} manifest path matches catalog`);
  assert(existsSync(new URL(`../${asset.path}`, import.meta.url)), `${key} png exists`);
  assert(stageLibraryFilter(asset), `${key} passes the stage filter`);
}

const summon = GAME_CONFIG.PETS.SUMMON;
assert(summon.phoenix.skillCdMs === 8000 && summon.phoenix.fieldMs === 12000 && summon.phoenix.reviveCdMs === 20000, 'phoenix 8/12/20');
assert(summon.panda.skillCdMs === 10000 && summon.panda.fieldMs === 14000 && summon.panda.reviveCdMs === 22000, 'panda 10/14/22');
assert(summon.lion.skillCdMs === 7000 && summon.lion.fieldMs === 10000 && summon.lion.reviveCdMs === 18000, 'lion 7/10/18');
assert(summon.dragon.skillCdMs === 12000 && summon.dragon.fieldMs === 16000 && summon.dragon.reviveCdMs === 25000, 'dragon 12/16/25');
assert(GAME_CONFIG.PETS.HP > 0, 'pets have HP');

const petsCfg = GAME_CONFIG.PETS;
assert(petsCfg.COOLDOWN_MIN_MS >= 1000 && petsCfg.COOLDOWN_MAX_MS <= 1500, 'in-field cadence is 1.0–1.5s');
assert(petsCfg.PHOENIX.DAMAGE < 30 && petsCfg.PANDA.DAMAGE < 30, 'pet hits stay under a handgun shot');
assert(petsCfg.PANDA.RANGE >= 80, 'panda reach covers a zombie at the posts');
assert(petsCfg.DRAGON.BURN > 0 && petsCfg.DRAGON.BURN_MS > 0, 'dragon burn is configured');

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
assert(views0.length === 4, 'four portrait slots');
assert(views0.map((view) => view.portraitKey).join() === HEAD_KEYS.join(), 'views use ui-pet-*-head');
assert(views0.every((view) => !view.portraitKey.includes('baby-idle') && view.crop == null), 'portraits are not idle-frame crops');
assert(!hud.includes('setCrop'), 'HUD does not crop an idle frame');
assert(!hud.includes('setFrame'), 'HUD does not pin idle frame 0');
assert(hud.includes('setTint'), 'grey state is a code tint');
assert(hud.includes('setAlpha'), 'dim state is code alpha');
assert(views0.every((view) => view.phase === 'ready' && view.tappable && view.bar === 1), 'starts ready, off the field');
assert(combat.fieldPets().length === 0, 'nothing is summoned at stage start');

const laneY = 432;
const fenceX = barricadeXAtY(laneY);
const player = { x: fenceX + layoutPx(28), y: laneY };
const foeX = fenceX - layoutPx(110);
const empty = combat.summon(0, player, []);
assert(empty.ok === false && empty.reason === 'no-target', 'no enemies does not summon');
assert(combat.portraitViews()[0].tappable, 'no-target tap stays ready');
assert(combat.portraitViews()[0].phase === 'ready', 'no-target does not start skill CD');
assert(audio.summon === 0, 'rejected tap plays no summon hook');

const zombie = mockZombie(foeX, laneY);
const first = combat.summon(0, player, [zombie]);
assert(first.ok && first.id === 'phoenix', 'phoenix summons');
assert(audio.summon === 1, 'summon hook');
assert(combat.fieldPets().length === 1, 'one pet on the field');
assert(combat.portraitViews()[0].badge === '出戰中', 'field portrait says 出戰中');
assert(combat.portraitViews()[0].tappable === false, 'field portrait is not tappable');
const again = combat.summon(0, player, [zombie]);
assert(again.ok === false && again.reason === 'field', 'no double summon');
assert(combat.fieldPets().length === 1, 'still one phoenix');

const spawned = combat.fieldPets()[0];
const behind = spawned.x > player.x;
assert(behind, `pet pops behind the player (${spawned.x} > ${player.x})`);

for (let t = 0; t < 2500; t += 50) {
  combat.update(50, [zombie], player);
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
assert(zombie.hp < zombie.maxHp, `phoenix cast landed (hp ${zombie.hp})`);
assert(scene._sprites.some((sprite) => sprite._played.some((key) => key === 'pet-phoenix-baby-skill')), 'phoenix skill strip played');
assert(combat.portraitViews()[0].phase === 'field', 'still out before the field limit');

combat.update(summon.phoenix.fieldMs, [zombie], player);
const afterTimeout = combat.portraitViews()[0];
assert(afterTimeout.phase === 'skill', 'timeout recalls into skill CD');
assert(afterTimeout.tappable === false && afterTimeout.dim, 'skill CD is dim and not tappable');
assert(afterTimeout.grey === false, 'timeout is not a death portrait');
assert(combat.fieldPets().length === 0, 'timeout leaves the field');
const skillLeftRatio = afterTimeout.bar;
assert(skillLeftRatio === 0, `skill bar starts empty after recall (${skillLeftRatio})`);
assert(audio.death === 0, 'timeout does not play the death hook');

combat.update(4000, [], player);
const midCd = combat.portraitViews()[0];
assert(midCd.phase === 'skill', 'still cooling at 4s');
assert(Math.abs(midCd.bar - 0.5) < 0.02, `skill bar fills (${midCd.bar})`);
combat.update(4000, [], player);
assert(combat.portraitViews()[0].phase === 'ready' && combat.portraitViews()[0].tappable, 'skill CD ends on ready');

const revived = combat.summon(0, player, [zombie.alive ? zombie : mockZombie(foeX, laneY)]);
assert(revived.ok, 'can summon again after skill CD');
const target = combat.fieldPets()[0];
const killed = target.takeDamage(10000);
assert(killed, 'lethal damage downs the pet');
assert(audio.death === 1, 'death hook');
const down = combat.portraitViews()[0];
assert(down.phase === 'revive' && down.grey && down.dim, 'death greys the portrait');
assert(down.tappable === false, 'revive is not tappable');
assert(down.bar === 0, 'revive bar starts empty');
assert(combat.fieldPets().length === 0, 'death leaves the field');
const blocked = combat.summon(0, player, [mockZombie(foeX, laneY)]);
assert(blocked.reason === 'revive', 'cannot summon during revive');
combat.update(summon.phoenix.reviveCdMs, [], player);
assert(combat.portraitViews()[0].phase === 'ready', 'revive CD ends on ready');
assert(audio.revive === 1, 'revive-ready hook');
assert(audio.summon === 2, 'revive does not count as another summon');

const castScene = mockScene(audio);
const casts = new PetCombat(castScene);
const styles = ['pet-phoenix-baby-skill', 'pet-panda-baby-skill', 'pet-lion-baby-skill', 'pet-dragon-baby-skill'];
for (let i = 0; i < 4; i++) {
  const foe = mockZombie(foeX, laneY);
  assert(casts.summon(i, player, [foe]).ok, `summon ${PET_LINEUP[i].id}`);
  for (let t = 0; t < 2200; t += 50) {
    casts.update(50, [foe], player);
    advanceSkills(castScene);
  }
  const played = castScene._sprites.some((sprite) => sprite._played.includes(styles[i]));
  assert(played, `${PET_LINEUP[i].id} cast ${styles[i]}`);
  assert(foe.hp < foe.maxHp || foe.burn || foe.slow, `${PET_LINEUP[i].id} applied its attack`);
  casts.update(GAME_CONFIG.PETS.SUMMON[PET_LINEUP[i].id].fieldMs, [], player);
}
casts.destroy();
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

if (failed) {
  console.error(`${failed} pet combat check(s) failed`);
  process.exit(1);
}
console.log('pet combat checks passed');

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
  const text = () => {
    const node = {
      active: true,
      setText() { return node; },
      setAlpha() { return node; },
      setOrigin() { return node; },
      setDepth() { return node; },
      once() { return node; },
      destroy() { node.active = false; },
    };
    return node;
  };
  const scene = {
    _sprites: sprites,
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
      sprite(x, y) {
        return mockPetSprite(scene, x, y, sprites);
      },
      rectangle(x, y, w, h) {
        return mockRect(x, y, w, h);
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
    setOrigin() { return sprite; },
    setScale(sx, sy) {
      sprite.scaleX = sx;
      sprite.scaleY = sy ?? sx;
      return sprite;
    },
    setDepth() { return sprite; },
    setFlipX(value) { sprite._flipped = value; return sprite; },
    setFlipY() { return sprite; },
    setAlpha(value) { sprite.alpha = value; return sprite; },
    setRotation() { return sprite; },
    setData() { return sprite; },
    setTintFill() { return sprite; },
    clearTint() { return sprite; },
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
