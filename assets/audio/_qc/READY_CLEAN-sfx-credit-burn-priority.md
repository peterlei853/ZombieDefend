# READY_CLEAN — credit-burn priority SFX

**Status: PASS (16/16)**  
**Source:** `/workspace/sfx-credit-burn-priority.tar.gz`  
**Flow:** `bmHjwED3h0Uvkr9q9wyA` · loudnorm −18 LUFS / TP −2  
**QC time:** 2026-10-22 ~12:10 Asia/Shanghai  
**Decision:** Catalog-only NEW PR (do not stack on #152 / #153 while Tester gates)

## Expected keys

`sfx-weapon-{sling|bubble|rail|freeze|flame}-{shot|charge|aoe-explode}` + `sfx-pet-dragon-attack`

## Per-file QC (loudnorm top-level MP3s)

| Key | Duration | Size | Unique hash | Verdict |
|-----|----------|------|-------------|---------|
| sfx-weapon-sling-shot | 0.552s | 10556 | yes | **PASS** |
| sfx-weapon-sling-charge | 2.040s | 44348 | yes | **PASS** (charge ~2.0s API target) |
| sfx-weapon-sling-aoe-explode | 1.320s | 26396 | yes | **PASS** |
| sfx-weapon-bubble-shot | 0.552s | 11084 | yes | **PASS** |
| sfx-weapon-bubble-charge | 2.040s | 38636 | yes | **PASS** |
| sfx-weapon-bubble-aoe-explode | 1.320s | 29900 | yes | **PASS** |
| sfx-weapon-rail-shot | 0.552s | 12524 | yes | **PASS** |
| sfx-weapon-rail-charge | 2.040s | 43340 | yes | **PASS** |
| sfx-weapon-rail-aoe-explode | 1.320s | 24572 | yes | **PASS** |
| sfx-weapon-freeze-shot | 0.552s | 12428 | yes | **PASS** |
| sfx-weapon-freeze-charge | 2.040s | 51788 | yes | **PASS** |
| sfx-weapon-freeze-aoe-explode | 1.320s | 29708 | yes | **PASS** |
| sfx-weapon-flame-shot | 0.552s | 12812 | yes | **PASS** |
| sfx-weapon-flame-charge | 2.040s | 34292 | yes | **PASS** |
| sfx-weapon-flame-aoe-explode | 1.320s | 22796 | yes | **PASS** |
| sfx-pet-dragon-attack | 1.104s | 18188 | yes | **PASS** |

## Checks

- Non-empty: all 16 > 10 KB
- Audible length: shots ~0.55s, charges ~2.04s, aoe ~1.32s, dragon ~1.10s (within 0.2–2.1s reasonable band)
- Keys match expected set exactly; no extras / no missing
- All 16 MD5 distinct (not copy-paste duplicates)
- `raw/` kept for provenance; catalog uses loudnorm top-level files

## Catalog plan

- Path convention (repo existing): `assets/audio/<key>.mp3` + `GAME_AUDIO` in `SoundManager.js`
- Catalog only — no combat / Pages wire
- NEW PR off `main` (not #152 / #153)
- Visual pairing notes: weapon shot/charge/aoe ↔ matching M2 weapon FX; `sfx-pet-dragon-attack` ↔ dragon slam `d14e7c3e` (#152)

## Demo

**HOLD Pages** — demo first; do not ask Architect for Pages merge.
