# Player Girl — front-float combat (v0.23 art, wired in v0.27)

Girl faces **WEST** (left). Category `hero`, group `girl`. Keys live in [`manifest.json`](manifest.json).

Origin: `(0.5, 0.8261)` on the 92×92 sprite (feet at y = 76).
Weapon sprite origin: `(0.5, 0.5)` on front 56×56 / back 32×32 frames.

World position:

```
weapon.x = girl.x + offset.x
weapon.y = girl.y + offset.y + bobY
```

`bobY` comes from the 8-frame bob strip (already baked ±3px front / ±2px back). Do not add a second bob on top.

Overview sheet: [`previews/hero/girl/front-float-deploy-sheet.png`](../../../previews/hero/girl/front-float-deploy-sheet.png).

## State machine

| State | Girl anim | Weapons | Fire |
|-------|-----------|---------|------|
| **MOVE** (walk/run) | walk / run-north / run-south | **hidden** (alpha 0 or destroy) | no |
| **STOP** (just stopped) | play `player-girl-deploy` once | lerp hidden/back → front over deploy | no until lerp done |
| **IDLE FIRE** | `player-girl-idle` (unarmed) loop | front-float bob strips | yes, from each muzzle |
| **MOVE again** | walk/run | hide immediately (or 2–3f snap-back) | no |

## Front arc offsets (px relative to girl origin)

Negative X = in front (west). Vertical arc, no glow rings.

```
n=1: [ {x:-36, y:-8} ]
n=2: [ {x:-36, y:-22}, {x:-34, y:8} ]
n=3: [ {x:-38, y:-30}, {x:-36, y:-8}, {x:-38, y:16} ]
n=4: [ {x:-40, y:-36}, {x:-36, y:-16}, {x:-36, y:4}, {x:-40, y:24} ]
n=5: [ {x:-42, y:-40}, {x:-38, y:-22}, {x:-36, y:-6}, {x:-38, y:10}, {x:-42, y:28} ]
n=6: [ {x:-44, y:-42}, {x:-38, y:-26}, {x:-36, y:-10}, {x:-36, y:6}, {x:-38, y:22}, {x:-44, y:36} ]
```

Stack order (top→bottom / z back→front):
`frost, lightning, water, sling, bubble, flame` — or owned order; draw **weapons AFTER girl** so they sit in front.

Suggested owned-order display (shop order):
`water, sling, bubble, lightning, frost, flame`.

## Back stack offsets (optional — default MOVE hides weapons)

Match the existing back-weapon attach (weapons BEFORE girl so the backpack occludes):

```
baseOffset: { x: +10, y: -6 }   // behind pack (east of origin when facing west)
verticalStep: 20
yOffsetsByCount:
  1: [0]
  2: [-10, 10]
  3: [-20, 0, 20]
  4: [-30, -10, 10, 30]
  5: [-40, -20, 0, 20, 40]
  6: [-50, -30, -10, 10, 30, 50]
```

Keys: `player-girl-back-<weapon>` (32×32, 8f bob).

**Confirmed design preference:** on MOVE, weapons are **hidden** (not back-stack). Back strips are provided for optional fallback / inventory preview.

All six back bobs are in this library: sling, bubble, and frost under `back/`, and water, lightning, and flame under `strips/`.

## Deploy lerp timeline

`player-girl-deploy`: 8 frames, 92×92, ~12 fps, one-shot (`loop: false`). Path: `strips/player-girl-deploy.png`.

| Frame | t (0→1) | Weapon blend |
|-------|---------|--------------|
| 0 | 0.00 | hidden (or back pose) |
| 1 | 0.12 | start emerging |
| 2 | 0.28 | 25% toward front |
| 3 | 0.45 | 45% |
| 4 | 0.62 | 65% |
| 5 | 0.78 | 82% |
| 6–7 | 1.00 | full front arc; enable fire after frame 7 |

Lerp each weapon:

```
pos = mix(startPos, frontOffset[i], easeOutCubic(t))
alpha = t
```

`startPos` = offscreen behind pack `{x:12, y: backY[i]}` or simply `{x:0,y:0}` with alpha 0.

## Catalog keys

### Front float

| key | file | size | frames | fps | loop |
|-----|------|------|--------|-----|------|
| player-girl-front-water | `front/player-girl-front-water.png` | 56×56 | 8 | 8 | yes |
| player-girl-front-sling | `front/player-girl-front-sling.png` | 56×56 | 8 | 8 | yes |
| player-girl-front-bubble | `front/player-girl-front-bubble.png` | 56×56 | 8 | 8 | yes |
| player-girl-front-lightning | `front/player-girl-front-lightning.png` | 56×56 | 8 | 8 | yes |
| player-girl-front-frost | `front/player-girl-front-frost.png` | 56×56 | 8 | 8 | yes |
| player-girl-front-flame | `front/player-girl-front-flame.png` | 56×56 | 8 | 8 | yes |

### Back float

| key | file | size | frames | fps | loop |
|-----|------|------|--------|-----|------|
| player-girl-back-sling | `back/player-girl-back-sling.png` | 32×32 | 8 | 8 | yes |
| player-girl-back-bubble | `back/player-girl-back-bubble.png` | 32×32 | 8 | 8 | yes |
| player-girl-back-frost | `back/player-girl-back-frost.png` | 32×32 | 8 | 8 | yes |
| player-girl-back-water | `strips/player-girl-back-water.png` | 32×32 | 8 | 8 | yes |
| player-girl-back-lightning | `strips/player-girl-back-lightning.png` | 32×32 | 8 | 8 | yes |
| player-girl-back-flame | `strips/player-girl-back-flame.png` | 32×32 | 8 | 8 | yes |

### Deploy

| key | file | size | frames | fps | loop |
|-----|------|------|--------|-----|------|
| player-girl-deploy | `strips/player-girl-deploy.png` | 92×92 | 8 | 12 | **no** (one-shot) |

No separate `*-still.png` frames shipped with this drop. Crop one cell from the strip if a static texture is needed.

## Muzzle hint

Approximate muzzle = weapon center + `{x: -contentW*0.35, y: 0}` (west tip).
