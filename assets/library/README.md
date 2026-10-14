# ZombieDefend Asset Library (`assets/library/`)

A categorized, game-ready sprite library for ZombieDefend (Phaser 3): the hero, 15 zombie groups, 2 bosses with skill FX, shared FX (including the v0.26 overnight VFX pack), pickups, environment props (barricade and the v0.31 water mount), the campus battle background, and chibi concept art.

**Start here:**

- **[`asset-index.json`](asset-index.json)**: one machine-readable index of every loadable asset. Load it from code or read it as an AI agent.
- **[`CATALOG.md`](CATALOG.md)**: a human catalog with thumbnails and a frame table per group. It renders on GitHub.
- **[`catalog.html`](catalog.html)**: a visual catalog with animated previews, a category filter, search, and copy-key buttons. Online: <https://peterlei853.github.io/ZombieDefend/assets/library/catalog.html> (needs GitHub Pages enabled for the repo). It also works when you open it directly from disk (`file://`), because the index is embedded inline as a fallback.
- **`*/manifest.json`**: one manifest per asset group. **These are the source of truth.** The three files above are generated from them by `tools/build-asset-catalog.py`.

The library is self-contained and additive. It does **not** replace the existing `assets/zombies/` (walker/runner/tank) or `assets/player/` (handgun/shotgun) sheets, and none of its keys clash with them. The game code only loads what you tell it to load (see [Loading in Phaser 3](#loading-in-phaser-3)).

---

## Folder structure

```
assets/library/
├── README.md                 ← this file (hand-written)
├── asset-index.json          ← GENERATED
├── CATALOG.md                ← GENERATED
├── catalog.html              ← GENERATED (inline index included)
├── characters/hero/girl/     manifest.json + strips/ + front/ + back/   (player-girl-*)
│   ├── fx/                   manifest.json + fx-*.png  (weapon FX)
│   └── icons/                manifest.json + icon-*.png
├── enemies/
│   ├── zombies/<slug>/       manifest.json + strips/   (zombie-<slug>-*)
│   │     office-worker-v2, delivery, chef, nurse,
│   │     trashcan, trashcan-bare, brute, cyborg, slime, slime-mini,
│   │     riot, riot-bare, exploder, sprinter, clown
│   └── bosses/<slug>/        manifest.json + strips/   (zombie-boss-<lava|steel>-*)
│       └── fx/               manifest.json + skill FX  (zombie-boss-<lava|steel>-fx-*)
│         lava-balon (Balon, the Molten Giant), steel-balam (Balam, the Cyber-Steel Behemoth)
├── fx/                       exploder blast at fx/manifest.json (zombie-exploder-blast)
│   └── v026/                 v0.26 overnight pack + INVENTORY.md
│       ├── exp-orb/          exp-orb (32×32 pickup)
│       ├── evolve-stars/     vfx-evolve-star + T1/T2/T3 head markers
│       ├── telegraph/        ring 64/128 + half-left wash
│       ├── aoe/              fire / ice / poison / lightning residue
│       └── ults/             phoenix / panda / lion / dragon keyframes
├── pickups/                  manifest.json + coin / gems / loot pile (zombie-clown-*)
├── environment/barricade/    manifest.json + barricade-post(-damaged).png
├── environment/props/        empty steel cradles: water cyan, sling amber, bubble magenta, lightning yellow, frost ice, flame orange
├── backgrounds/campus/       manifest.json, variant-A/B/C.png, layers/, layers-night/, anim/
├── ui/                          manifest.json + fonts/ bars/ panels/ toasts/ buttons/ icons/ controls/ title/ floats/ (ui-*)
├── concepts/zombie-chibi-drafts/  manifest.json, 20 concept PNGs, contact-sheet.png, index.md
└── previews/<category>/<group>/   preview.gif (card thumbnail) + sheets (≤1600 px, ≤1.5 MB each)
```

`previews/` is for documentation only. The game never loads it.

## Naming convention (keys)

Each texture key equals its file name without `.png`, except `vfx-telegraph-ring` (file `vfx-telegraph-ring-64.png`). Phaser texture keys and animation keys use the same string.

| Category | Key pattern | Examples |
|---|---|---|
| Zombies | `zombie-<slug>-<action>` | `zombie-office-worker-v2-walk`, `zombie-trashcan-bare-die1`, `zombie-slime-mini-run` |
| Bosses | `zombie-boss-<lava\|steel>-<action>` | `zombie-boss-lava-volcanic_breath` |
| Boss FX | `zombie-boss-<lava\|steel>-fx-<name>` | `zombie-boss-steel-fx-acid` |
| Hero | `player-girl-<action>` / `player-girl-<weapon>-<action>` | `player-girl-water-fire`, `player-girl-sling-walk-north` |
| Hero FX | `fx-<weapon>-<name>` | `fx-frost-beam`, `fx-sling-dizzy` |
| Icons | `icon-<weapon>` | `icon-flame` |
| Shared FX | original key kept | `zombie-exploder-blast` |
| v0.26 VFX | `exp-orb`, `vfx-evolve-star(s-*)`, `vfx-telegraph-*`, `vfx-aoe-*`, `vfx-ult-*` | `vfx-telegraph-ring` file is `vfx-telegraph-ring-64.png` |
| Pickups | original key kept | `zombie-clown-coin`, `zombie-clown-gem-red`, `zombie-clown-loot-pile` |
| Environment | `barricade-post`, `prop-{water,sling,bubble,lightning,frost,flame}-mount*` | 32×64 posts, origin (0.5, 1.0); mounts 64×64, origin (0.5, 0.9375). Accents: cyan, amber, magenta, yellow, ice, orange |
| Backgrounds | `bg-campus-<a\|b\|c>`, `bg-campus[-night]-<far\|ground\|mid\|full\|full-bleed>`, `bg-campus-fire`, `bg-campus-lamp` | `bg-campus-night-mid` |
| Concepts | `concept-chibi-<NN>-<slug>` | `concept-chibi-12-jiangshi` |
| UI | `ui-*` | `ui-hp-bar-player`, `ui-font-hud-bold-atlas-outlined`, `ui-toast-panel` |

The office worker lives in `office-worker-v2/` with keys `zombie-office-worker-v2-*` (84×84). The earlier 64×64 `zombie-office-*` group (`office-worker/`) was deprecated after v0.28 Accept and removed from the catalog. Delivery, chef, and nurse use `zombie-delivery-*`, `zombie-chef-*`, and `zombie-nurse-*` (nurse also has `zombie-nurse-attach`). The armored and bare phases are separate groups: `zombie-trashcan-*` → `zombie-trashcan-bare-*`, and `zombie-riot-*` → `zombie-riot-bare-*`. Within a key, the action uses `_` for compound words (`hurt_freeze`, `idle_itch`) and `-` between naming segments. Status reactions are always named `hurt_freeze`, `hurt_burn` and `hurt_shock`, plus per-monster extras (`hurt_spark`, `hurt_jiggle`, `hurt_terrified`, `hurt_loot`).

## Pets

Category `pets/` holds four chibi companions (phoenix / panda / lion / dragon), each with baby / young / ancient forms:

- `pets/<pet>/<form>/strips/pet-<pet>-<form>-{idle,move,skill,hurt}.png`
- `pets/<pet>/fx/fx-pet-<pet>-*.png` (standalone skill FX + evolve)

Keys: `pet-<pet>-<form>-<action>`, `fx-pet-<pet>-<name>`. Canvas baby 48 / young 64 / ancient 96 (phoenix+dragon ancient 128). Origin `(0.5, 1)`. Facing west. Skill = cast strip + FX; see group manifest `castFrame` / `spawnOffset`.

## v0.26 overnight VFX

Shared FX under `fx/v026/` (category `fx`, five groups). Notes live in [`fx/v026/INVENTORY.md`](fx/v026/INVENTORY.md). `*-miss` and `*-raw` files are not cataloged. Pickup, rings, and stars are transparent.

- Ult frames (`vfx-ult-phoenix`, `vfx-ult-panda`, `vfx-ult-lion`, `vfx-ult-dragon`) are single keyframes used as a cinematic overlay. The engine letterboxes and fades each one over 0.8–1.2s. Canvas 384×216, origin (0.5, 0.5). An opaque letterbox background is OK.
- `vfx-aoe-lightning` is procedural (96×96 scorch and arcs).
- `vfx-aoe-ice` is flagged for a possible shatter retouch later. It may read as an orb or crystal blob rather than a shatter puddle.
- Stars `vfx-evolve-stars-1` / `-2` / `-3` are pet head markers (T1 / T2 / T3). Origin is the feet / bottom, (0.5, 1). The single `vfx-evolve-star` is 32×32 with origin (0.5, 0.5).
- `vfx-telegraph-ring` is the 64×64 S1 ring. Its file is `vfx-telegraph-ring-64.png`. `vfx-telegraph-ring-128` is the S2 nearest upscale. `vfx-telegraph-half-left` is a procedural 192×108 half-screen wash with origin (0, 0.5).

## Water v0.31

New water-gun art sits beside the existing hero water FX. Legacy `fx-water-impact`, `fx-water-wet`, `fx-water-proj`, `fx-water-muzzle`, and `fx-water-stream` stay.

Merged v0.31 still times the HP drop to `fx-water-impact` (6×64 @ 12 fps, once; damage at the midpoint) and lays `fx-water-wet` on the floor. For a clearer splash on that same path, prefer:

- `fx-water-splash-big` — 8×64 @ 12 fps, once, origin (0.5, 0.5). Play the splash, then apply damage. Supersedes `fx-water-impact` for v0.31 water hit timing. The untinted master `fx-hit-water-shared.png` is the same image and is not a separate key.
- `fx-water-wet-ground` — 6×64 @ 8 fps, loop, origin (0.5, 0.75) at puddle pixel (32, 48). Supersedes `fx-water-wet` on that path.

Profession body-hit overlays (same splash, light tint, origin center, once @ 12 fps): `fx-hit-water-office-v2` (gray), `fx-hit-water-delivery` (yellow), `fx-hit-water-chef` (white), `fx-hit-water-nurse` (pink). The merged hook looks up `fx-hit-<skinId>` (`fx-hit-office-worker-v2`, `fx-hit-delivery`, `fx-hit-chef`, `fx-hit-nurse`) and skips the puff when that texture is missing. These water keys are the catalog names; pointing the hook at them is a later code change.

`prop-water-mount` (`environment/props/`) is the empty steel/gunmetal Y-fork with bright cyan cradle tips, 64×64, facing west-ish. It replaces the wooden cradle, which disappeared against the wooden barricade (0 cyan pixels). This primary has about 20 cyan pixels and no brown. Origin is the feet at (32, 60) ≈ (0.5, 0.94), stored as (0.5, 0.9375). Attach `player-girl-front-water-still` at cradle pixel (32, 12), 48px above the feet (`anchors.offsetFromOrigin` `[0, -48]`, y negative = up). The gun is not baked into the mount.

`prop-water-mount-hi-vis` is the same empty Y-fork with more cyan (about 67 pixels) on the cradle and bands. v0.31.2 draws the six fence slots from this sheet because the primary still reads faint on the barricade, and falls back to `prop-water-mount` when the hi-vis texture is missing. The cradle is drawn at 0.85 of the post height and lifted 4 source pixels so the fork stays inside the stake. `prop-water-mount-front-alt` is the dual-post steel post with a cyan U-cradle, also empty, and still marks the slot she is stopped behind. The gun still is `player-girl-front-water-still`. When neither mount sheet is loaded, that still is the placeholder.

`player-girl-tower-fire` is the preferred 92×92 west operator still under `characters/hero/girl/strips/`: wide braced stance, both fists forward on invisible handles. Girl only — no mount, no gun. Origin is the shared hero foot line (0.5, 0.8261); shoes end near y=78. `player-girl-command` is the backup overwrite of the old one-finger point, same braced family (`command-v2`), same origin (shoes near y=77). `player-girl-tower-fire-strip` is an optional 4×92 micro hold/bob at 8 fps; the still stays the attack texture. QA that strip before wiring it as a loop. Rejected baked-mount state `bb2ec441` is not in the catalog. v0.31.2 holds `player-girl-tower-fire` while she fires from a mount. The still has no anim, so the hero swaps to that texture; `player-girl-command` is the backup. The micro-bob strip stays unwired.

## Sling v0.32

Empty steel cradles in the same family as the water mounts, with amber accents instead of cyan. No gun and no girl are baked in. `player-girl-tower-fire` and `player-girl-command` are reused unchanged. The gun float is the existing `player-girl-front-sling-still`.

- `prop-sling-mount` — primary Y-fork, 64×64, origin (0.5, 0.9375) feet at (32, 60). Cradle pixel (32, 12), 48px above the feet. About 32 amber pixels.
- `prop-sling-mount-hi-vis` — same silhouette, higher amber contrast (about 135 amber pixels, no water cyan). The six fence slots draw this sheet first, then `prop-sling-mount`, because the plain fork can wash out on the barricade. If neither sling sheet is loaded, the slot uses `prop-water-mount-hi-vis`.
- `prop-sling-mount-front-alt` — front dual-post. Gameplay puts this on the slot she is stopped behind.

Profession body-hit overlays are stone, pebble, and dust, not a water splash. 8×64, once, 18 fps, origin (0.5, 0.5): `fx-hit-sling-office-v2` (gray), `fx-hit-sling-delivery` (yellow), `fx-hit-sling-chef` (white), `fx-hit-sling-nurse` (pink). The untinted master `fx-hit-sling-shared.png` is not a separate key. `fx-sling-knockback` stays.

**v0.32.1 visibility remake.** Tester Conditional Fail: the pellet was nearly invisible on asphalt (mean luminance ~13) and the hit was hard to read on the body. `fx-sling-pellet` is now a bright amber stone with a navy outline (mean luminance ~91, max ~253), still 4×16, loop, origin center. `fx-sling-impact` is a brighter 6×48 burst, same timing. The four `fx-hit-sling-*` strips are a 2-PixelLab contrast remake (white/amber lift, deeper navy outline) on the same 512×64 layout. Mounts, `player-girl-tower-fire`, and `player-girl-command` are unchanged.

`?weapon=sling` holds `player-girl-tower-fire` while she fires from a mount and aims at the nearest living zombie. Contact plays `fx-sling-impact` (else `fx-sling-pellet`) at the body center, sorted just above the zombie’s feet sprite and scaled 1.75× the field taper so the burst reads on the body. HP and the two-body knockback wait for the middle of that sheet, and the 8-frame profession overlay plays on that same beat at the same depth and scale. Other skins look up `fx-hit-sling-<skinId>` and fall back to the impact or pellet sheet. The projectile stays the bright amber pellet sheet with no runtime tint. Gold amounts, saves, and barricade contact math stay as they are.

## Mounts v0.33

Four more empty steel cradles, same 64×64 layout as water and sling. No gun and no girl are baked in. Origin is the feet at (32, 60) ≈ (0.5, 0.9375). The gun float attaches at cradle pixel (32, 12), 48px above the feet. `player-girl-tower-fire` and `player-girl-command` are reused and were not changed.

Accent map for all six turrets: water cyan, sling amber, bubble magenta, lightning electric yellow, frost ice blue, flame fire orange.

| Weapon | Primary | Hi-vis | Front alt | Float |
|---|---|---|---|---|
| Bubble | `prop-bubble-mount` | `prop-bubble-mount-hi-vis` | `prop-bubble-mount-front-alt` | `player-girl-front-bubble-still` |
| Lightning | `prop-lightning-mount` | `prop-lightning-mount-hi-vis` | `prop-lightning-mount-front-alt` | `player-girl-front-lightning-still` |
| Frost | `prop-frost-mount` | `prop-frost-mount-hi-vis` | `prop-frost-mount-front-alt` | `player-girl-front-frost-still` |
| Flame | `prop-flame-mount` | `prop-flame-mount-hi-vis` | `prop-flame-mount-front-alt` | `player-girl-front-flame-still` |

The primary is the side Y-fork. Hi-vis is the higher-contrast swap if the primary washes out on the barricade. The front dual-post is secondary. This catalog does not change gold, saves, or barricade physics.

## Composite fence (v0.33)

The default stage draws six cradles on the same fence geometry as the water mounts (scale 0.85, 4px lift). Top to bottom they are water, sling, bubble, lightning, frost, flame. The gun is not baked into the cradle.

- Water: `prop-water-mount-hi-vis` (then `prop-water-mount`) and `player-girl-front-water-still`. The slot she is stopped behind uses `prop-water-mount-front-alt`.
- Sling: `prop-sling-mount-hi-vis` (then `prop-sling-mount`, then the water hi-vis cradle) and `player-girl-front-sling-still`. Active slot uses `prop-sling-mount-front-alt`.
- Bubble, lightning, frost, flame: idle `prop-<id>-mount-hi-vis` (then `prop-<id>-mount`). The slot she is stopped behind uses `prop-<id>-mount-front-alt`. The float is `player-girl-front-<id>-still`, then `icon-<id>`. These four do not borrow the sling cradle.

`?weapon=water` and `?weapon=sling` keep the single-gun rows. Gold, saves, and barricade contact math stay as they are.

## Front-float combat (v0.27)

Owned guns are separate sprites in front of the unarmed girl (`player-girl-idle` / walk). `player-girl-deploy` is a one-shot hand-sweep. Front bobs are `player-girl-front-{water,sling,bubble,lightning,frost,flame}` (56×56, origin 0.5, 0.5). Each bob has a static sibling `player-girl-front-*-still` (56×56 image, origin 0.5, 0.5, facing west). Back bobs (`player-girl-back-*`, 32×32) are an optional MOVE fallback; gameplay hides guns while walking. Layout notes: [`characters/hero/girl/README.md`](characters/hero/girl/README.md). Up/down dash uses `player-girl-run-north` and `player-girl-run-south` (92×92 × 8 frames, 12 fps, loop). Walk strips stay for slower move.

## UI kit

`ui/` is the title and stage chrome (v0.22): the title splash, empty HP frames, fill strips, dialog and toast panels, parchment buttons, icons, Latin bitmap font atlases, pet float callouts, and the v0.22 Accept style fixes. HP frames stay empty; the game crops a fill strip into each trough. Prefer `ui-font-hud-bold-atlas-outlined`, `ui-font-hud-bold-atlas-gold`, and `ui-font-hud-tiny-atlas-cream`. TitleScene draws `ui-title-bg-clean` (688×384, no baked menu or v0.21 footer); `ui-title-bg-clean-hd` is the 1280×720 fallback. `bg-title-zombie-vs-buddy` still aliases the older `ui-title-bg` and is used only when the clean splash is missing. The atlases are Latin-only (8×10, no space glyph). Chinese stays on the system font. v0.26.1 redraws digit cells 0–9 on the five HUD atlases so 0, 1, and 6 stay distinct; letters, punctuation, the 8×10 grid, and the texture keys are unchanged, and the TTF companions were not regenerated. Pet HUD keys (`ui-pet-*`) stay in `pets/ui/` and are not part of this kit.

**v0.22 Accept style fixes.** Bar frames, the joystick, and the title splash use origin **(0.5, 0.5)**. Enemy fill strips use **(0, 0.5)**, the same left-grow as `ui-hp-fill-*`.

- Enemy HP: `ui-hp-bar-enemy` is the native **118×24** stone frame (parchment rim, cyan end glow, orange gems). `ui-hp-bar-enemy-96` is the **96×32** legacy slot. Compact fills `ui-hp-enemy-fill-ok`, `ui-hp-enemy-fill-mid`, and `ui-hp-enemy-fill-low` are **72×8**.
- Joystick (`controls/`): parchment/stone kit, not flat circles. `ui-joystick-base` **80×80**, `ui-joystick-base-96` **96×96**, `ui-joystick-knob` and `ui-joystick-knob-pressed` **40×40**. Place the knob inside the base and swap to `-pressed` while the stick is active.
- Clean title (`title/`, beside `ui-title-bg`): `ui-title-bg-clean` **688×384** and `ui-title-bg-clean-hd` **1280×720**. No baked v0.21 footer and no NEW / LOAD / SCOREBOARD buttons. TitleScene draws that splash and keeps START on its own parchment button.

## Canvas, origin and facing conventions

All strips are **horizontal**: frame *i* is at `x = i * frameWidth`, `y = 0`. Every PNG is exactly `frameWidth*frames × frameHeight`, and the build script checks this. The `origin` value is the Phaser `setOrigin(x, y)`.

| Category | Frame | Origin | Facing |
|---|---|---|---|
| Zombies | **64×64**. Exceptions: brute **96×96**, profession groups `office-worker-v2` / `delivery` / `chef` / `nurse` **84×84**, `zombie-slime-split` 96×64, `zombie-sprinter-blasted_back` / `-tumble` 96×64 | **(0.5, 1.0)**: feet / ground point | **east** (walking right, toward the barricade) |
| Bosses | **128×128** | **(0.5, 1.0)** | **east** |
| Boss FX | per key (256×128, 256×96, 160×160, …) | **per key**, from the index (e.g. breath/acid `(0, 0.5)` = the mouth, slam/smash `(0.5, 1)` = the impact point) | east |
| Hero | **92×92** | **(0.5, 76/92 ≈ 0.8261)**: feet at y = 76. `player-girl-command` uses the same foot line (shoes end at y=77) | **west** (toward the zombies), except keys ending in `-walk-east`, `-walk-north`, `-walk-south`, `-run-north`, or `-run-south` |
| Hero FX | per key | per key (muzzles `(1, 0.5)` = nozzle; status overlays `(0.5, 1)` = the zombie's feet) | west (beams and cones extend to the left) |
| Shared FX | 160×160 blast | (0.5, 0.5) | – |
| v0.26 VFX | per key: orb/star 32×32, star rows 12×12 / 25×12 / 38×12, rings 64×64 and 128×128, half wash 192×108, residue 96×96, ults 384×216 | centre (0.5, 0.5), except star markers (0.5, 1.0) and half-left wash (0, 0.5) | – |
| Pickups | coin/gems 16×16, pile 64×32 | coin/gems (0.5, 0.5); pile (0.5, 1.0) | – |
| Backgrounds | 1280×720 (bleed 1360×768) | (0, 0) | – |

- Wider 96×64 canvases, and the 84×84 profession strips, keep the same ground-point semantics: the canvas bottom-centre is the zombie's position.
- To mirror a sprite, use `setFlipX(true)` **and** mirror the origin's x (`1 - ox`) for asymmetric origins (FX). Also negate the x of any attach offset.
- Note on the legacy sheets: `assets/zombies/manifest.json` labels the walker/runner/tank strips "west". The library zombies are authored facing **east** (they move from the left spawn toward the barricade on the right). Check this in game and flip the legacy sheets if they disagree.
- Render with `pixelArt: true` (already set in `main.js`), or set the NEAREST filter per texture as in the loader below.

## Playback: loop, once, and sustained (start/loop/end)

- `loop: true` plays the whole strip on repeat (`repeat: -1`).
- `loop: false` plays once and holds the last frame (deaths, breaks, hurts).
- `loopFrom` / `loopTo` (inclusive, 0-based) mark a **sustained** strip. These always have `loop: false`:
  1. **start**: play frames `0 … loopFrom-1` once.
  2. **loop**: repeat `loopFrom … loopTo` for as long as the action lasts (the fire button is held, the boss is breathing, …).
  3. **end**: play `loopTo+1 … frames-1` once, then return to idle.

  Sustained strips:

  - Hero: `player-girl-{water,bubble,frost,flame}-fire` (9 frames, loop 3-6).
  - Lava boss: `zombie-boss-lava-volcanic_breath` (loop 5-10) and its FX `zombie-boss-lava-fx-breath` (loop 4-9).
  - Steel boss: `zombie-boss-steel-bio_acid_spit` (loop 7-10) with `zombie-boss-steel-fx-acid` (loop 2-5), and `zombie-boss-steel-steel_whirlwind` (loop 3-8).
  - Sprinter: `zombie-sprinter-comedic_ko` (loop 4-7 with no end section: it stays dizzy).

  The loader below creates `<key>` (the whole strip, once), `<key>:start`, `<key>:loop` and `<key>:end`. The original range fields (`startRange` / `loopRange` / `endRange`) are kept in `timing`.

## Boss skill FX: attaching to character frames

Boss FX are separate strips. They are spawned at a point relative to the boss origin (bottom-centre) when the boss reaches a given character frame. Offsets are in **px in the unscaled 128×128 frame, with y up negative**. Multiply them by the boss's display scale, and negate x when the boss is flipped. The index stores this data:

| Skill (character key) | FX | When / where |
|---|---|---|
| `zombie-boss-lava-lava_slam` | `…-lava-fx-slam` (origin 0.5,1) | `anchors.attach`: start on character frame **7**, offset **(+44, 0)**. Good moment for screen shake (FX frames 0-3). |
| `zombie-boss-lava-volcanic_breath` | `…-lava-fx-breath` (origin 0,0.5 = mouth) | Attach from character frame **4** at (+56, −80). `anchors.attach.perCharacterFrameMouth` gives the mouth position for frames 4-11, so move the FX each frame. Loop the FX's 4-9 while the boss loops 5-10, then play the FX end (10-13). |
| `zombie-boss-lava-meteor_storm` | `…-lava-fx-meteor`, `…-lava-fx-meteor-impact` | During `timing.castFrames` [2, 9], spawn many meteors. Move each along `anchors.travelDirection` at about `suggestedSpeedPxPerFrame`, then spawn an impact where it meets the ground. |
| `zombie-boss-steel-ground_smash` | `…-steel-fx-smash` (origin 0.5,1) | `timing.impactFrame` **5**, at `anchors.impactPoint` **(+49, 0)**. |
| `zombie-boss-steel-bio_acid_spit` | `…-steel-fx-acid` (origin 0,0.5), `…-steel-fx-acid-pool` | `anchors.mouthAnchors[frame]`: [44, −67] from `mouthOpenFrame` 5. Start the FX with character frames 4-5, loop it while the boss loops, and leave the pool on the ground. |
| `zombie-boss-steel-steel_whirlwind` | `…-fx-whirlwind` (draw **over** the boss) + `…-fx-whirlwind-back` (draw **under** it) | Both use the boss origin and play while the boss loops 3-8. |

Linked FX keys are listed on each skill in the index (`fx: [...]`). Other in-strip hooks are in `note`:

- `zombie-slime-split`: `anchors.spawnOffsetsX` [−28, 28] for the two `zombie-slime-mini-*`.
- `zombie-clown-hurt_loot` / `loot_explode`: when to spawn pickups.
- `player-girl-sling-fire`: spawn the pellet on frame 6.
- `player-girl-lightning-fire`: spawn the bolt on frame 4.
- `zombie-exploder-explode`: spawn the shared `zombie-exploder-blast` FX at the body.

## Backgrounds (campus)

- **Game camera**: the canvas is 1280×720 and the world is 2112×720. The camera scrolls on x only and **sits at `scrollX = 832`** (`WORLD_SHIFT_X` in `DepthView.js`). Place every background image with its **top-left at world (832, 0)** so it fills the view 1:1. Place `bg-full-bleed` (1360×768) at (832 − 40, −24), so camera shake (up to ±38 px) never shows an edge.
- **Variants:**
  - `bg-campus-a`: road at dusk. This is the best variant.
  - `bg-campus-b`: school yard at dusk.
  - `bg-campus-c`: night version of A.
  - These three are flattened images with fire frame 0 baked in, so the fire sprite is optional.
- **Layers** for variant A are `bg-campus-*`. For C (night), use `bg-campus-night-*`. Each layer's depth is in `anchors.depth` in the index.

  | Layer | Depth | Notes |
  |---|---|---|
  | `bg-campus[-night]-far` | **3** | opaque sky / skyline / buildings |
  | `bg-campus-fire` | **3.5** | at bg px (0, 16), origin (0, 0), 10 fps loop |
  | `bg-campus[-night]-ground` | **4** | transparent above y = 148 |
  | `bg-campus[-night]-mid` | **5** | fence, gate, lamps, vehicles |
  | `bg-campus-lamp` | **6** | `blendMode: ADD`; per-variant positions in `anchors.positions` (A: [1090, 92]; B: [1090, 98]; C: [294, 92], [834, 92], [1090, 92]) |

- Depths 3-6 sit above the old procedural bands (0-2) and below every actor (`depthFromY` is ≥ about 1700). Background positions in the index are background px. Add 832 for world x.
- Other playfield facts the art was built for:
  - Horizon at y = 147.
  - Walk band at y 160-704.
  - Nine lane centres at y 190-674.
  - The HUD covers y 0-51.
  - The barricade runs from screen (858, 147) to (1280, 720).

## Loading in Phaser 3

Drop this in, for example as `src/assets/libraryAssets.js`. It reads `asset-index.json` at boot, queues every texture, and creates every animation automatically.

```js
// src/assets/libraryAssets.js — data-driven loader for assets/library/asset-index.json
export const LIBRARY_INDEX_KEY = 'asset-library-index';
const GAME_CATEGORIES = ['hero', 'pets', 'zombies', 'bosses', 'fx', 'pickups', 'backgrounds']; // 'concepts' is reference art only

/** Call in preload(). `filter(asset)` can restrict what is loaded (e.g. only the current wave's groups). */
export function preloadLibrary(scene, { categories = GAME_CATEGORIES, filter = null } = {}) {
  scene.load.json(LIBRARY_INDEX_KEY, 'assets/library/asset-index.json');
  scene.load.once(`filecomplete-json-${LIBRARY_INDEX_KEY}`, (_key, _type, index) => {
    for (const a of index.assets) {
      if (!categories.includes(a.category) || (filter && !filter(a))) continue;
      if (scene.textures.exists(a.key)) continue;
      if (a.frames > 1 || a.type === 'spritesheet' || a.type === 'fx') {
        scene.load.spritesheet(a.key, a.path, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
      } else {
        scene.load.image(a.key, a.path); // icons, backgrounds, concepts
      }
    }
  });
}

/** Call in create(). Creates `<key>` (+ `<key>:start|:loop|:end` for sustained strips). Idempotent. */
export function createLibraryAnims(scene) {
  const index = scene.cache.json.get(LIBRARY_INDEX_KEY);
  if (!index) return null;
  for (const a of index.assets) {
    if (!scene.textures.exists(a.key)) continue;
    scene.textures.get(a.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    if (!(a.frames > 1)) continue;
    const make = (key, start, end, repeat) => {
      if (end < start || scene.anims.exists(key)) return;
      scene.anims.create({
        key, repeat, frameRate: a.frameRate || 10,
        frames: scene.anims.generateFrameNumbers(a.key, { start, end }),
      });
    };
    make(a.key, 0, a.frames - 1, a.loop ? -1 : 0);
    if (a.loopFrom != null) {
      make(`${a.key}:start`, 0, a.loopFrom - 1, 0);
      make(`${a.key}:loop`, a.loopFrom, a.loopTo, -1);
      make(`${a.key}:end`, a.loopTo + 1, a.frames - 1, 0);
    }
  }
  return index;
}

/** Look up one asset's metadata (origin, anchors, …). */
export function libraryAsset(scene, key) {
  const index = scene.cache.json.get(LIBRARY_INDEX_KEY);
  return index?.assets.find((a) => a.key === key) ?? null;
}

/** Add a sprite with the asset's origin applied. */
export function addLibrarySprite(scene, x, y, key) {
  const a = libraryAsset(scene, key);
  const s = scene.add.sprite(x, y, key);
  if (a?.origin) s.setOrigin(a.origin[0], a.origin[1]);
  return s;
}

/** Sustained actions (hero water/bubble/frost/flame fire, boss breath/acid/whirlwind). */
export function playSustained(sprite, key) {
  const start = `${key}:start`;
  if (sprite.scene.anims.exists(start)) {
    sprite.play(start);
    sprite.once(`animationcomplete-${start}`, () => sprite.play(`${key}:loop`));
  } else {
    sprite.play(`${key}:loop`);
  }
}
export function stopSustained(sprite, key, onDone) {
  sprite.off(`animationcomplete-${key}:start`);
  const end = `${key}:end`;
  if (sprite.scene.anims.exists(end)) {
    sprite.play(end);
    if (onDone) sprite.once(`animationcomplete-${end}`, onDone);
  } else onDone?.();
}

/** Spawn boss skill FX on the right character frame (attach / impactPoint / mouthAnchors).
 *  onSpawn(fxSprite, fxAsset) lets the game keep a handle (e.g. to call stopSustained on the breath/acid stream). */
export function bindBossSkillFx(scene, boss, onSpawn = null) {
  const index = scene.cache.json.get(LIBRARY_INDEX_KEY);
  const byKey = new Map(index.assets.map((a) => [a.key, a]));
  boss.on('animationupdate', (anim, frame) => {
    const skill = byKey.get(anim.key.split(':')[0]);
    if (!skill?.fx) return;
    const f = Number(frame.textureFrame);
    for (const fxKey of skill.fx) {
      const fx = byKey.get(fxKey);
      const att = fx?.anchors?.attach;
      const startFrame = att?.startOnCharacterFrame ?? skill.timing?.impactFrame ?? skill.timing?.mouthOpenFrame;
      if (!fx || f !== startFrame) continue; // meteors / whirlwind / acid pool need skill-specific logic
      const [ox, oy] = att?.offsetFromCharacterOrigin ?? skill.anchors?.impactPoint ?? skill.anchors?.mouthAnchors?.[f] ?? [0, 0];
      const dir = boss.flipX ? -1 : 1;
      const [fx0, fy0] = fx.origin ?? [0.5, 0.5];
      const s = scene.add.sprite(boss.x + dir * ox * Math.abs(boss.scaleX), boss.y + oy * Math.abs(boss.scaleY), fx.key)
        .setOrigin(boss.flipX ? 1 - fx0 : fx0, fy0)
        .setScale(Math.abs(boss.scaleX), Math.abs(boss.scaleY)).setFlipX(boss.flipX)
        .setDepth(boss.depth + 1);
      if (fx.loopFrom != null) {
        playSustained(s, fx.key);                 // caller ends it: stopSustained(s, fx.key, () => s.destroy())
      } else {
        s.play(fx.key);
        if (!fx.loop) s.once(`animationcomplete-${fx.key}`, () => s.destroy());
      }
      onSpawn?.(s, fx);
    }
  });
}
```

Usage in `BootScene` / `StageScene`:

```js
import { preloadLibrary, createLibraryAnims, addLibrarySprite, playSustained, stopSustained } from '../assets/libraryAssets.js';
import { WORLD_SHIFT_X } from '../systems/DepthView.js';

preload() { preloadLibrary(this); }
create() {
  createLibraryAnims(this);
  // zombie: feet on the lane, facing east
  addLibrarySprite(this, WORLD_SHIFT_X + 200, 432, 'zombie-office-worker-v2-walk').play('zombie-office-worker-v2-walk');
  // hero: sustained flamethrower while the button is held
  const hero = addLibrarySprite(this, WORLD_SHIFT_X + 1119, 432, 'player-girl-flame-idle');
  playSustained(hero, 'player-girl-flame-fire');        // on press
  stopSustained(hero, 'player-girl-flame-fire', () => hero.play('player-girl-flame-idle')); // on release
  // background (variant A, layered)
  const x0 = WORLD_SHIFT_X; // 832
  this.add.image(x0, 0, 'bg-campus-far').setOrigin(0, 0).setDepth(3);
  this.add.sprite(x0 + 0, 16, 'bg-campus-fire').setOrigin(0, 0).setDepth(3.5).play('bg-campus-fire');
  this.add.image(x0, 0, 'bg-campus-ground').setOrigin(0, 0).setDepth(4);
  this.add.image(x0, 0, 'bg-campus-mid').setOrigin(0, 0).setDepth(5);
  this.add.sprite(x0 + 1090, 92, 'bg-campus-lamp').setDepth(6).setBlendMode(Phaser.BlendModes.ADD).play('bg-campus-lamp');
}
```

Loading everything costs about 290 textures. For production, pass a `filter`, for example `(a) => a.group === 'office-worker-v2' || a.category === 'hero'`, to load only what a stage needs.

## Index format (`asset-index.json`)

- Top-level fields: `schema`, `libraryRoot`, `conventions`, `counts`, `groups[]` and `assets[]`.
- Each asset has these fields:
  - `key`, `category`, `group`, `path` (repo-root relative), `type` (`spritesheet` | `fx` | `icon` | `background` | `image` | `concept`)
  - `frameWidth`, `frameHeight`, `frames`, `frameRate`, `loop`, `loopFrom`, `loopTo`
  - `origin`, `facing`
  - `anchors`: attach / mouth / impact / spawn / position / depth data
  - `timing`: impact / cast frames, original start/loop/end ranges
  - `fx`: linked FX keys
  - `skill`, `preview` (the group thumbnail), `description`, `note`, `tags`, `extra`, `action`
- Fields that don't apply are `null`.

## Per-group `manifest.json` (source of truth)

```jsonc
{
  "schema": "zombiedefend-asset-group/1",
  "category": "zombies",              // hero | zombies | bosses | fx | pickups | backgrounds | concepts
  "group": "office-worker-v2",       // unique slug
  "title": "Office Worker Zombie v2", "titleZh": "上班族丧尸",
  "description": "…",
  "source": { "pixellabCharacterId": "…", "sourceFolder": "…" },
  "defaults": { "type": "spritesheet", "origin": [0.5, 1.0], "facing": "east", "frameWidth": 84, "frameHeight": 84 },
  "preview": {
    "animate": ["zombie-office-worker-v2-walk", "…"],   // keys composed into previews/<cat>/<group>/preview.gif by --previews
    "thumb": "assets/library/previews/zombies/office-worker-v2/preview.gif",
    "sheets": ["…png"], "extras": ["…gif"]
  },
  "assets": [
    { "key": "zombie-office-worker-v2-walk", "path": "assets/library/enemies/zombies/office-worker-v2/strips/zombie-office-worker-v2-walk.png",
      "frameWidth": 84, "frameHeight": 84, "frames": 8, "frameRate": 8, "loop": true }
  ]
}
```

Each asset inherits `defaults`. Optional per-asset fields are `loopFrom`/`loopTo`, `origin`, `facing`, `anchors`, `timing`, `fx`, `skill`, `note`, `description`, `tags`, and `grid: [cols, rows]` for non-strip sheets.

## How to update

**Whenever you add, remove, rename or change any asset under `assets/library/`, regenerate the catalog.** `asset-index.json`, `CATALOG.md` and the inline data in `catalog.html` are generated and must never be edited by hand.

1. Put the PNG(s) in the right group folder. No `*_old` or work files.
2. Add or update the entry in that group's `manifest.json`. For a new group, create a new folder with its own `manifest.json`, using the schema above.
3. From the repo root, run:

   ```bash
   python3 tools/build-asset-catalog.py
   ```

   For a new group, or after changing the animations listed in `preview.animate`, also rebuild its card GIF (this needs Pillow: `pip install pillow`):

   ```bash
   python3 tools/build-asset-catalog.py --previews            # only missing preview.gif files
   python3 tools/build-asset-catalog.py --previews --force-previews   # rebuild all generated GIFs
   ```

4. Commit the PNGs, the manifest and the three regenerated files together.

To check that the catalog is up to date (e.g. in CI or a pre-commit hook), run the command below. It exits with 1 if any path is missing, any PNG size doesn't match `frameWidth*frames × frameHeight`, keys are duplicated or clash with the legacy repo keys, a preview is over 1.5 MB or 1600 px, or the generated files are stale.

```bash
python3 tools/build-asset-catalog.py --check
```

## Provenance

The art was made with PixelLab plus procedural FX and hand fixes, through polish passes in Oct 2026. Only final deliverables are included: no `*_old` files, `work/`, `gen/`, `raw/` or debug files. `source.pixellabCharacterId` in each manifest identifies the PixelLab character for future animations.
