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
- **Weapon:** SPACE toggles handgun / shotgun.
- **Phone:** joystick bottom-left (same axes), **SWAP** bottom-right (same as SPACE). Desktop keyboard still works.

### Try it on a phone

1. Open the demo URL, or run `npm start` and visit `http://<this-machine>:5173` from the phone (same network).
2. Use landscape. Start Stage 1.
3. Drag the bottom-left stick up and down to change lanes. Tap **SWAP** to switch weapons. Keyboard on a desktop should still move and switch weapons.

Auth (New/Old Game + CharSelect) is next; this deploy is the combat vertical slice.
