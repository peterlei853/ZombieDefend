# READY_CLEAN — credit-burn batch SFX

**Status: PASS (43/43)**  
**Source:** `/workspace/sfx-credit-burn-batch.tar.gz`  
**Flow:** `Zas8sd19kFGbAKW9Us9B` · loudnorm −18 LUFS / TP −2  
**QC time:** 2026-10-22 ~12:11 Asia/Shanghai  
**Decision:** Catalog onto OPEN [#154](https://github.com/peterlei853/ZombieDefend/pull/154) branch `asset/sfx-credit-burn-priority` (prefer reply) OR NEW PR off main. Do **not** stack on #152 / #153.

## Expected keys (43)

- weapon aoe+hit ×5 = 10
- boss balun/balam skill ×2
- S4×4×4 growl/hit/hurt/death = 16
- UI ×6
- pickups/fence = 9 (coin + 6 items + fence crack/break)


## Per-file QC (loudnorm top-level MP3s)

| Key | Duration | Size | Hash8 | Verdict |
|-----|----------|------|-------|---------|
| sfx-boss-balam-skill | 1.632000s | 26900 | f0b74549 | **PASS** |
| sfx-boss-balun-skill | 1.632000s | 23084 | 1bf7bcbe | **PASS** |
| sfx-coin-pickup | 0.552000s | 11228 | 38f8f9af | **PASS** |
| sfx-fence-break | 1.152000s | 23108 | 794bc061 | **PASS** |
| sfx-fence-crack | 0.840000s | 18716 | 8b6273df | **PASS** |
| sfx-item-ammo | 0.672000s | 13292 | ead5eead | **PASS** |
| sfx-item-bomb | 0.720000s | 14996 | 9be8dc95 | **PASS** |
| sfx-item-heal | 0.672000s | 14108 | aa96edcd | **PASS** |
| sfx-item-magnet | 0.672000s | 10364 | 1e2d2513 | **PASS** |
| sfx-item-shield | 0.720000s | 12908 | 2eb2755c | **PASS** |
| sfx-item-speed | 0.672000s | 12092 | 4457b936 | **PASS** |
| sfx-ui-click | 0.504000s | 8780 | 40aab793 | **PASS** |
| sfx-ui-dmg | 0.504000s | 10508 | 53ab7206 | **PASS** |
| sfx-ui-heal | 0.504000s | 12620 | 091323c4 | **PASS** |
| sfx-ui-settings | 0.504000s | 14156 | d6ef80b7 | **PASS** |
| sfx-ui-shop | 0.504000s | 12140 | 572e23be | **PASS** |
| sfx-ui-wave | 0.504000s | 10892 | 432b1834 | **PASS** |
| sfx-weapon-bubble-aoe | 1.032000s | 20348 | ff4ef16a | **PASS** |
| sfx-weapon-bubble-hit | 0.552000s | 12092 | 630442ad | **PASS** |
| sfx-weapon-flame-aoe | 1.032000s | 17612 | 5e739ba6 | **PASS** |
| sfx-weapon-flame-hit | 0.552000s | 10748 | c3bfbd1a | **PASS** |
| sfx-weapon-freeze-aoe | 1.032000s | 27980 | 7fb7e21e | **PASS** |
| sfx-weapon-freeze-hit | 0.552000s | 11516 | 05ca94f6 | **PASS** |
| sfx-weapon-rail-aoe | 1.032000s | 24812 | 84c20f27 | **PASS** |
| sfx-weapon-rail-hit | 0.552000s | 12284 | 85c6ea3b | **PASS** |
| sfx-weapon-sling-aoe | 1.032000s | 15596 | e95358d4 | **PASS** |
| sfx-weapon-sling-hit | 0.552000s | 10940 | d3ddcf8c | **PASS** |
| sfx-zombie-s4-construction-death | 1.224000s | 21212 | 1071232e | **PASS** |
| sfx-zombie-s4-construction-growl | 2.160000s | 38828 | 4c00859f | **PASS** |
| sfx-zombie-s4-construction-hit | 0.552000s | 10412 | 499b6a24 | **PASS** |
| sfx-zombie-s4-construction-hurt | 0.720000s | 14012 | 80c10821 | **PASS** |
| sfx-zombie-s4-delivery-death | 1.224000s | 22652 | b9aa161a | **PASS** |
| sfx-zombie-s4-delivery-growl | 2.160000s | 42428 | 9ec05576 | **PASS** |
| sfx-zombie-s4-delivery-hit | 0.552000s | 9020 | de91a949 | **PASS** |
| sfx-zombie-s4-delivery-hurt | 0.720000s | 12908 | 3d6600a6 | **PASS** |
| sfx-zombie-s4-salaryman-death | 1.224000s | 20396 | 05274cc7 | **PASS** |
| sfx-zombie-s4-salaryman-growl | 2.160000s | 39740 | 199a1e7c | **PASS** |
| sfx-zombie-s4-salaryman-hit | 0.552000s | 10508 | 37dc1416 | **PASS** |
| sfx-zombie-s4-salaryman-hurt | 0.720000s | 12524 | ffd8e3c7 | **PASS** |
| sfx-zombie-s4-schoolgirl-death | 1.224000s | 21116 | 0e357313 | **PASS** |
| sfx-zombie-s4-schoolgirl-growl | 2.160000s | 38972 | 7ffcf9ee | **PASS** |
| sfx-zombie-s4-schoolgirl-hit | 0.552000s | 10076 | 33c1e9d3 | **PASS** |
| sfx-zombie-s4-schoolgirl-hurt | 0.720000s | 12092 | c61e91d5 | **PASS** |

## Checks

- Non-empty: all 43 ≥ ~8 KB (min 8780 B)
- Audible length: 0.504–2.160s (within 0.05–5.0s band)
- Keys match expected set exactly; missing=0 extra=0
- All 43 MD5 distinct: 43 unique
- `raw/` kept for provenance; catalog uses loudnorm top-level files

## Catalog plan

- Path: `assets/audio/<key>.mp3` + register in `GAME_AUDIO` (`src/systems/SoundManager.js`) — same as #154
- Catalog only — no combat / Pages wire
- Prefer **reply onto #154** agent (branch `asset/sfx-credit-burn-priority`, tip `06cc66b`) to append these 43 keys; else NEW PR off main
- Do **NOT** stack on #152 / #153
- QC sheet: `assets/audio/_qc/READY_CLEAN-sfx-credit-burn-batch.md`

## Demo

**HOLD Pages** — demo first; do not ask Architect for Pages merge.
