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
- **Pets:** four portraits sit top-right (phoenix fire, panda ice, lion electric, dragon poison). Tap a bright portrait to summon that baby behind you. It walks to the nearest threat and casts. No enemies → 「沒有目標」 and the skill cooldown is not spent. On-field pets show 「出戰中」. Timeout starts the skill cooldown; death greys the portrait and starts the revive cooldown.
- **Phone:** joystick bottom-left (same axes), **SWAP** bottom-right (same as SPACE). Desktop keyboard still works.

### Try it on a phone

1. Open the demo URL, or run `npm start` and visit `http://<this-machine>:5173` from the phone (same network).
2. Use landscape. Start Stage 1.
3. Drag the bottom-left stick up and down to change lanes. Tap **SWAP** to switch weapons. Keyboard on a desktop should still move and switch weapons.

Auth (New/Old Game + CharSelect) is next; this deploy is the combat vertical slice.

## Asset library

Categorized art (hero girl, 12 zombie groups, 2 bosses, FX, pickups, barricade posts, campus backgrounds, and concepts) lives in `assets/library/`. **v0.20.1** loads the hero, the 12 zombie groups, shared FX, the campus background, `barricade-post`, the four baby pets (phoenix, panda, lion, dragon), and their `ui-pet-*-head` portraits into Stage 1. Pets stay off the field until a portrait summon; idle, move, skill, and hurt strips play only while that pet is out. Portrait bright, dim, and grey states are tint and alpha on those head icons. Bosses have no wave spawn yet. Legacy `assets/zombies/` and `assets/player/` remain as fallbacks.

- Conventions and Phaser loading: [assets/library/README.md](assets/library/README.md)
- Grouped list with thumbnails: [assets/library/CATALOG.md](assets/library/CATALOG.md)
- Visual catalog: https://peterlei853.github.io/ZombieDefend/assets/library/catalog.html

Every asset update must regenerate the catalog with `python3 tools/build-asset-catalog.py` in the same PR. `python3 tools/build-asset-catalog.py --check` fails if `asset-index.json`, `CATALOG.md`, or the inline data in `catalog.html` is stale.
