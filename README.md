# ZombieDefend

Phaser 3 horizontal tower-defense demo.

## Play

- **Demo (GitHub Pages):** https://peterlei853.github.io/ZombieDefend/
- Local: `npm start` then open http://localhost:5173

## Controls (demo slice)

- Boot → **Start Stage 1**
- Survive 90s waves; barricade HP → 0 is Game Over
- Clear the field after 90s → Shop → Next Stage
- **Move:** W / S or up / down arrows. A / D and left / right only change walk facing; the defender stays on the barricade lane.
- **Weapon:** SPACE cycles sling → bubble → lightning → flame → water → frost. Sling, lightning, and water use the handgun profile (one shot). Bubble, flame, and frost use the shotgun profile (pellet fan). Damage and fire rate stay on those two profiles.
- **Pets:** four 64×32 bars sit top-right (phoenix fire, panda ice, lion electric, dragon poison), each with three skill orbs. Tap a bar to summon that baby behind you; a GO! float sits beside them. Tap again to recall — Back! shows the same way, and the pet walks to an empty sleep spot behind the barricade, plays sleep-start once, then loops sleep. Tap again to wake them and walk back out (no teleport). There is no deploy cooldown and no on-field time limit. While out, the pet walks to the nearest fence threat and its unlocked orb fills, flashes, then auto-casts. Recalled pets regen HP. At 0 HP the bar greys for a revive cooldown.
- **Phone:** joystick bottom-left (same axes), **SWAP** bottom-right (same as SPACE). Desktop keyboard still works.

### Try it on a phone

1. Open the demo URL, or run `npm start` and visit `http://<this-machine>:5173` from the phone (same network).
2. Use landscape. Start Stage 1.
3. Drag the bottom-left stick up and down to change lanes. Tap **SWAP** to switch weapons. Keyboard on a desktop should still move and switch weapons.

Auth (New/Old Game + CharSelect) is next; this deploy is the combat vertical slice.

## Asset library

Categorized art (hero girl, 12 zombie groups, 2 bosses, FX, pickups, barricade posts, campus backgrounds, the UI kit, and concepts) lives in `assets/library/`. **v0.22.2** wires the cataloged UI kit into play: enemy bars use `ui-hp-bar-enemy` (118×24) with `ui-hp-enemy-fill-ok` / `ui-hp-enemy-fill-mid` / `ui-hp-enemy-fill-low` (green above 50%, yellow above 25%, red below); the stick uses `ui-joystick-base`, `ui-joystick-knob`, and `ui-joystick-knob-pressed`; the title uses `ui-title-bg-clean` (`ui-title-bg-clean-hd` if the native splash is missing) with START kept as its own parchment button. **v0.22.1c** keeps a pet hit visible: white fill 180ms, solid red fill 200ms, the hurt strip plays through once, and fractional bite DPS stacks into a −N. GO! / Back! stay on screen (clamped to the camera) for 700ms. The stage HUD `ENEMIES` line is the on-field count. **v0.22.1b** thins Stage 1 waves 1–3 (10/15/20 → 4/8/16; wave 4 stays 90) and doubles shared pet HP (96 → 192). **v0.22.1** shows `ui-float-go` / `ui-float-back` on summon and recall, and plays the baby sleep-start and sleep strips once a recalled pet reaches a bed behind the fence. **v0.22.0** loads the UI kit (`assets/library/ui/`: HP frames, parchment buttons, dialog and toast panels, icons, and the outlined / gold / cream HUD fonts) into the title screen and stage HUD. **v0.21.0** loads the hero, the 12 zombie groups, shared FX, the campus background, `barricade-post`, the four baby pets (phoenix, panda, lion, dragon), and the pet HUD bars, heads, and orbs into Stage 1. Bosses have no wave spawn yet. Legacy `assets/zombies/` and `assets/player/` remain as fallbacks.

- Conventions and Phaser loading: [assets/library/README.md](assets/library/README.md)
- Grouped list with thumbnails: [assets/library/CATALOG.md](assets/library/CATALOG.md)
- Visual catalog: https://peterlei853.github.io/ZombieDefend/assets/library/catalog.html

Every asset update must regenerate the catalog with `python3 tools/build-asset-catalog.py` in the same PR. `python3 tools/build-asset-catalog.py --check` fails if `asset-index.json`, `CATALOG.md`, or the inline data in `catalog.html` is stale.
