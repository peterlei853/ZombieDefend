/**
 * Pure checks for the v0.27 hero gun deploy state machine.
 * No Phaser. Run: node tools/check-hero-deploy.mjs
 */
import {
  BACK_Y,
  DEPLOY_HOLD_MS,
  DEPLOY_MS,
  FRONT_ARC,
  OWNED_WEAPON_ORDER,
  WEAPON_TRAITS,
  createDeployMachine,
  deployOffset,
  easeOutCubic,
  forwardVelocity,
  frontArcFor,
  grantStageWeapons,
  orderWeapons,
  splitVelocities,
  stepDeploy,
  unarmedAnimKeys,
} from '../src/assets/heroDeploy.js';

let failed = 0;
function check(name, ok) {
  if (!ok) {
    failed += 1;
    console.error('FAIL', name);
  }
}

check('shop order is six', OWNED_WEAPON_ORDER.join(',') === 'water,sling,bubble,lightning,frost,flame');
check('stage 1 grants all six', grantStageWeapons(1, []).join(',') === OWNED_WEAPON_ORDER.join(','));
check('stage 2 keeps owned order', orderWeapons(['flame', 'water']).join(',') === 'water,flame');
check('stage 2 drops unknown', grantStageWeapons(2, ['nope', 'sling']).join(',') === 'sling');

for (let n = 1; n <= 6; n++) {
  check(`arc ${n}`, frontArcFor(n).length === n && FRONT_ARC[n].length === n && BACK_Y[n].length === n);
  check(`arc ${n} west`, frontArcFor(n).every((p) => p.x < 0));
}

const hidden = deployOffset(0, 6, 0);
check('deploy t0 hidden', hidden.alpha === 0);
const full = deployOffset(0, 6, 1);
check('deploy t1 front', full.alpha === 1 && full.x === FRONT_ARC[6][0].x && full.y === FRONT_ARC[6][0].y);
check('ease ends', easeOutCubic(0) === 0 && easeOutCubic(1) === 1);

let state = createDeployMachine();
state = stepDeploy(state, true, 500);
check('move hides fire', state.phase === 'move' && state.canFire === false);
state = stepDeploy(state, false, DEPLOY_HOLD_MS - 1);
check('short stop does not deploy', state.phase === 'hold' && state.canFire === false);
state = stepDeploy(state, false, 1);
check('hold then deploy', state.phase === 'deploy' && state.canFire === false);
state = stepDeploy(state, false, DEPLOY_MS);
check('deploy then fire', state.phase === 'fire' && state.canFire === true && state.t === 1);
state = stepDeploy(state, true, 16);
check('move cancels fire', state.phase === 'move' && state.canFire === false);

const west = forwardVelocity(100);
check('forward ray is west', west.vx === -100 && west.vy === 0);
const kids = splitVelocities(-10, 0);
check(
  'bubble splits two ways',
  kids.length === 2 &&
    Math.abs(kids[0].vy + kids[1].vy) < 1e-9 &&
    kids[0].vy !== 0 &&
    kids.every((k) => k.vx < 0)
);

check('water slow aoe', WEAPON_TRAITS.water.speed === 0.5 && WEAPON_TRAITS.water.projectile === 'fx-water-proj');
check('sling knockback', WEAPON_TRAITS.sling.knockbackBodies === 2 && WEAPON_TRAITS.sling.projectile === 'fx-sling-pellet');
check('bubble parent', WEAPON_TRAITS.bubble.projectile === 'fx-bubble-proj-l' && WEAPON_TRAITS.bubble.speed === 0.35);
check('lightning chain 3', WEAPON_TRAITS.lightning.chainJumps === 2 && WEAPON_TRAITS.lightning.speed === 2);
check('frost pellet', WEAPON_TRAITS.frost.projectile === 'fx-frost-pellet' && WEAPON_TRAITS.frost.status === 'fx-frost-freeze');
check('flame cone', WEAPON_TRAITS.flame.continuous === true && WEAPON_TRAITS.flame.cone === 'fx-flame-cone');

const moveKeys = unarmedAnimKeys(1, 0);
check('south prefers run then walk', moveKeys[0] === 'player-girl-run-south' && moveKeys[1] === 'player-girl-walk-south');
check('idle when stopped keys', unarmedAnimKeys(0, 0)[0] === 'player-girl-idle');

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('hero deploy checks ok');
