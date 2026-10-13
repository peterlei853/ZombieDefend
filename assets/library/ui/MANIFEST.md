# ZombieDefend UI Kit — MANIFEST

**Style target:** chibi dark-outline pixel · night campus · stone / parchment · cyan-blue glow accents · orange corner gems  
**Style refs:** `_ref-title-screen.png` (Zombie vs My Buddy title), existing `existing-pet-hud/`  
**For:** Game Engine group — wire HUD / menus / toasts. **Do not invent game code here.**  
**Suggested library prefix:** `ui-*` under `assets/library/ui/` (catalog regen on PR).

---

## Suggested keys, sizes, origins

### Fonts (`fonts/`)
| Key | File | Size | Notes |
|-----|------|------|-------|
| `ui-font-hud-bold` | `ui-font-hud-bold.ttf` + `ui-font-hud-bold-atlas.png` | glyph 16px; atlas 128×160 | PixelLab `create_font` Bold. Raw atlas = **black silhouettes** (tint in engine). |
| `ui-font-hud-bold-gold` | `ui-font-hud-bold-atlas-gold.png` | 128×160 | Post-tint cream-gold fill (no outline). |
| `ui-font-hud-bold-outlined` | `ui-font-hud-bold-atlas-outlined.png` | 128×160 | **Prefer for HUD** — gold fill + navy outline. |
| `ui-font-hud-tiny` | `ui-font-hud-tiny.ttf` + `ui-font-hud-tiny-atlas.png` | glyph 8px; atlas 64×80 | Black silhouettes. |
| `ui-font-hud-tiny-cream` | `ui-font-hud-tiny-atlas-cream.png` | 64×80 | Cream tint for small labels. |

Glyph order (atlas row-major, 10×8, **no space glyph**):  
`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,!?:;'"-+()0123456789/%*=_$`

**CJK:** PixelLab `create_font` is Latin-only. Chinese prompts (血量 / 波次 / 準備 / 遊戲結束…) need a separate bitmap sheet or engine fallback (system font / custom CJK atlas). Latin labels covered: HP, WAVE, READY, GAME OVER, PAUSE, SCORE, SELECT, NEW GAME, etc.

### Bars (`bars/`)
| Key | File | Size | Origin | Notes |
|-----|------|------|--------|-------|
| `ui-hp-bar-player` | `ui-hp-bar-player.png` | 248×36 | (0.5, 0.5) | Stone frame, parchment inner rim, cyan accents, orange end gems, empty navy trough. Overlay fill in code. |
| `ui-hp-bar-barricade` | `ui-hp-bar-barricade.png` | 251×45 | (0.5, 0.5) | Wood-brown + stone, cyan micro-glow, orange gems. |
| `ui-hp-bar-enemy` | `ui-hp-bar-enemy.png` | 96×32 | (0.5, 0.5) | Compact enemy / world HP frame. |
| `ui-hp-trough` | `ui-hp-trough.png` | 128×16 | (0, 0.5) | Procedural empty trough (stretch). |
| `ui-hp-fill-full` | `ui-hp-fill-full.png` | 120×10 | (0, 0.5) | Red fill strip (procedural). |
| `ui-hp-fill-mid` | `ui-hp-fill-mid.png` | 120×10 | (0, 0.5) | Yellow fill. |
| `ui-hp-fill-low` / `ui-hp-fill-ok` | matching | 120×10 | (0, 0.5) | Low red / green OK. |
| `ui-barricade-fill-*` | `ui-barricade-fill-{ok,mid,low}.png` | 120×10 | (0, 0.5) | Barricade green→yellow→red. |

### Panels / toasts
| Key | File | Size | Origin | Notes |
|-----|------|------|--------|-------|
| `ui-dialog-panel` | `panels/ui-dialog-panel.png` | 512×288 | (0.5, 0.5) | Stone window + parchment inset; empty for tip/confirm text. |
| `ui-toast-panel` | `toasts/ui-toast-panel.png` | 512×192 | (0.5, 0.5) | Wide tip / toast banner; cyan rune pillars. |

### Buttons
| Key | File | Size | Origin | Notes |
|-----|------|------|--------|-------|
| `ui-btn-parchment` | `buttons/ui-btn-parchment.png` | 73×33 | (0.5, 0.5) | Single empty parchment button (label via font). |
| `ui-btn-piece-1` | `buttons/ui-btn-piece-1.png` | 116×56 | (0.5, 0.5) | Smaller frame piece from strip gen. |
| `ui-btn-piece-2` | `buttons/ui-btn-piece-2.png` | 234×148 | (0.5, 0.5) | Larger panel piece (9-slice candidate). |

### Icons (`icons/`)
| Key | File | Size | Origin |
|-----|------|------|--------|
| `ui-icon-hp-heart` | `ui-icon-hp-heart.png` | 32×32 | (0.5, 0.5) |
| `ui-icon-wave-warn` | `ui-icon-wave-warn.png` | 32×32 | (0.5, 0.5) |
| `ui-icon-heal` | `ui-icon-heal.png` | 32×32 | (0.5, 0.5) |
| `ui-icon-damage` | `ui-icon-damage.png` | 32×32 | (0.5, 0.5) |
| `ui-icon-pause` | `ui-icon-pause.png` | 32×32 | (0.5, 0.5) |
| `ui-icon-ready` | `ui-icon-ready.png` | 32×32 | (0.5, 0.5) |
| `ui-icon-gameover` | `ui-icon-gameover.png` | 32×32 | (0.5, 0.5) |
| `ui-icon-select-x` | `ui-icon-select-x.png` | 16×16 | (0.5, 0.5) |

### Existing pet HUD (copied for reference — already on main)
`existing-pet-hud/` — keys `ui-pet-*-head` 48×48, `ui-pet-*-bar` 64×32 origin (0, 0.5), `ui-pet-orb-*-{dark|lit|flash}` 16×16. Keep as-is; do not restyle unless Peter asks.

### Raw / style refs (not for runtime)
`_raw/` failed or uncropped gens · `_style-refs/` generation refs · `_ref-title-screen.png`

---

## Inventory of existing UI in repo (before this kit)

| Path | What |
|------|------|
| `assets/library/pets/ui/` | Only shipped pixel UI group (`ui-pet-*`) |
| `assets/library/characters/hero/girl/icons/` | Weapon icons 32×32 (`icon-water/sling/bubble/lightning/flame/frost`) |
| `assets/library/previews/pets/pet-hud/` | Preview sheets |
| `assets/audio/ui-click.mp3` | Click SFX only |
| **No** `assets/library/ui/` fonts, HP frames, toast panels, or menu buttons on main | Gap this kit fills |

Runtime (code, not assets): `StageScene` flat HUD bar + Phaser `Text`; `Barricade`/`Zombie` Graphics HP rectangles; `damageText.js` Phaser Text; `VirtualControls` / `formHelpers` filled rect buttons.

---

## Style mismatches found (tell Peter)

1. **Top HUD strip (StageScene)** — solid `0x0a1018` rectangle + default Phaser Text. Flat UI, not stone/parchment/cyan-rune pixel. **Replace with this kit’s toast/dialog language + bitmap fonts.**
2. **Barricade / zombie HP** — procedural green/yellow/red `Rectangle`s. Clash with chibi dark-outline pixel. **Use `ui-hp-bar-*` + fill strips.**
3. **Floating damage numbers** — neon CSS hex Text (`#00ffff`, `#ffaa00`…). Not pixel font. **Use `ui-font-hud-*` (or tint black atlas).**
4. **VirtualControls + formHelpers + Stage restart buttons** — Material-ish flat fills (`0x1565c0`, `0x455a64`). Different era/style from title stone UI. **Swap to `ui-btn-parchment` / pieces.**
5. **Pet HUD vs title UI** — Pet bars are minimal dark-navy chibi (good for combat HUD) but **lack** stone gems / cyan runes / parchment of the title & this kit. Intentional hierarchy OK; if Peter wants one look everywhere, restyle pet bars to match stone kit or soften new kit toward pet-HUD minimalism.
6. **Weapon icons** — 32×32 element icons; generally pixel + dark outline, but warmer/brighter and less “stone frame” than new HUD icons. Mild mismatch only.
7. **Fonts**: raw atlases black-on-transparent (engine-tintable). Prefer `*-outlined` / `*-gold` / `*-cream` PNGs for immediate use. **No Chinese glyphs** from PixelLab font tool.
8. **Failed gen note:** first barricade `create_ui_asset` with title style-ref **leaked title-menu content** (stored in `_raw/`). Clean `ui-hp-bar-barricade.png` is v2 without style image.

---

## Handoff checklist for Game Engine

- [ ] Load kit PNGs / TTF; nearest-neighbor scale  
- [ ] Wire player + barricade + enemy bars (frame + width-scaled fill)  
- [ ] Swap stage HUD labels to bitmap / TTF; keep Chinese via fallback until CJK sheet exists  
- [ ] Toast/dialog for wave / tip / game over using panels + icons  
- [ ] Menu buttons: parchment + font labels (NEW GAME / OLD GAME / SCOREBOARD)  
- [ ] Leave `// PIXELLAB_HOOK` if any; catalog PR via PixelLab Asset Pipeline when shipping to `assets/library/ui/`
