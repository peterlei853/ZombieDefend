# Overnight VFX pack (v0.26)

Date: 2026-10-13 HKT. Style: chibi dark-outline, cyan/gold accents, night campus.

Cataloged under `assets/library/fx/v026/` (category `fx`, beside the shared exploder blast). Pickup, rings, and stars are transparent. Ult keyframes are cinematic overlays (opaque letterbox background is OK).

`*-miss` and `*-raw` files are not cataloged.

## Keys

| Key | File | Size | Origin | Notes |
|-----|------|------|--------|-------|
| `exp-orb` | `exp-orb/exp-orb.png` | 32×32 | (0.5, 0.5) | Cyan crystal gem pickup. PixelLab `baf7309d-f094-495c-a07e-0601757daa51` |
| `vfx-evolve-star` | `evolve-stars/vfx-evolve-star.png` | 32×32 | (0.5, 0.5) | Single gold ★. PixelLab `b21200fe-0317-415d-b788-0f81d7edbfb1` |
| `vfx-evolve-stars-1` | `evolve-stars/vfx-evolve-stars-1.png` | 12×12 | (0.5, 1.0) | T1 pet head marker (composite) |
| `vfx-evolve-stars-2` | `evolve-stars/vfx-evolve-stars-2.png` | 25×12 | (0.5, 1.0) | T2 pet head marker |
| `vfx-evolve-stars-3` | `evolve-stars/vfx-evolve-stars-3.png` | 38×12 | (0.5, 1.0) | T3 pet head marker |
| `vfx-telegraph-ring` | `telegraph/vfx-telegraph-ring-64.png` | 64×64 | (0.5, 0.5) | S1 cast preview. PixelLab `df86326d-9714-44ad-8665-8e77d4bd0713` |
| `vfx-telegraph-ring-128` | `telegraph/vfx-telegraph-ring-128.png` | 128×128 | (0.5, 0.5) | S2 (nearest upscale of 64) |
| `vfx-telegraph-half-left` | `telegraph/vfx-telegraph-half-left.png` | 192×108 | (0, 0.5) | S3 half-screen wash (procedural) |
| `vfx-aoe-fire` | `aoe/vfx-aoe-fire.png` | 96×96 | (0.5, 0.5) | Fire residue / impact puff. PixelLab `c83e262c-01c1-4e8f-99f1-15e6518fc1ac` |
| `vfx-aoe-poison` | `aoe/vfx-aoe-poison.png` | 96×96 | (0.5, 0.5) | Poison fog residue. PixelLab `d97f1a91-f807-49c3-be41-b35b9e3b2786` |
| `vfx-aoe-ice` | `aoe/vfx-aoe-ice.png` | 96×96 | (0.5, 0.5) | Ice residue. Flagged for a possible shatter retouch. PixelLab `b88f1307-6076-4554-8586-3129607985e9` |
| `vfx-aoe-lightning` | `aoe/vfx-aoe-lightning.png` | 96×96 | (0.5, 0.5) | Procedural scorch and arcs |
| `vfx-ult-phoenix` | `ults/vfx-ult-phoenix.png` | 384×216 | (0.5, 0.5) | 烈陽瀑布 keyframe. PixelLab `fafad261-c0a0-43e2-a7c8-e66263abc1f1` |
| `vfx-ult-panda` | `ults/vfx-ult-panda.png` | 384×216 | (0.5, 0.5) | 雪域封城 keyframe. PixelLab `6e0b702d-0587-445a-8e63-4ae916764825` |
| `vfx-ult-lion` | `ults/vfx-ult-lion.png` | 384×216 | (0.5, 0.5) | 雷霆開路 keyframe. PixelLab `d5680cda-db22-40fa-8647-47cc1c2e041c` |
| `vfx-ult-dragon` | `ults/vfx-ult-dragon.png` | 384×216 | (0.5, 0.5) | 毒霧淹城 keyframe. PixelLab `7195a199-a975-4466-ab89-a11bb2c6582d` |

`vfx-telegraph-ring` keeps the 64px filename `vfx-telegraph-ring-64.png`. The texture key does not include `-64`.

## Style flags

- Ult frames are single keyframes (one still each), used as cinematic overlays. The engine can letterbox and fade them over 0.8–1.2s. Animated strips are still open if a multi-frame pass is wanted later.
- `vfx-aoe-lightning` is procedural (generated passes kept adding scenery and flame).
- `vfx-aoe-ice` may read more as an orb or crystal blob than a shatter puddle. Flagged for a possible shatter retouch.
- Stars `vfx-evolve-stars-1` / `-2` / `-3` are pet head markers (T1 / T2 / T3). Origin is the feet / bottom, `(0.5, 1)`. The single `vfx-evolve-star` stays centred.
