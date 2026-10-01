# Zombie assets (PixelLab)

Phaser load keys match filenames (without extension). All strips face **west** (toward the left / right-side barricade). Canvas **64×64** (player stays 92 — keep separate).

Suggested sprite origin for Gameplay: `(0.5, 1.0)` (foot pivot). Do not change combat numbers or hit-juice here — assets + manifest only.

| Key | File | Frames | Size |
|-----|------|--------|------|
| `zombie-walker-walk` | zombie-walker-walk.png | 6 | 64×64 (strip 384×64) |
| `zombie-walker-attack` | zombie-walker-attack.png | 4 | 64×64 (strip 256×64) |
| `zombie-walker-stumble` | zombie-walker-stumble.png | 4 | 64×64 (strip 256×64) |
| `zombie-runner-walk` | zombie-runner-walk.png | 6 | 64×64 (strip 384×64) |
| `zombie-runner-attack` | zombie-runner-attack.png | 4 | 64×64 (strip 256×64) |
| `zombie-runner-stumble` | zombie-runner-stumble.png | 4 | 64×64 (strip 256×64) |
| `zombie-tank-walk` | zombie-tank-walk.png | 6 | 64×64 (strip 384×64) |
| `zombie-tank-attack` | zombie-tank-attack.png | 4 | 64×64 (strip 256×64) |
| `zombie-tank-stumble` | zombie-tank-stumble.png | 4 | 64×64 (strip 256×64) |

```js
this.load.spritesheet('zombie-walker-walk', 'assets/zombies/zombie-walker-walk.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('zombie-walker-attack', 'assets/zombies/zombie-walker-attack.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('zombie-walker-stumble', 'assets/zombies/zombie-walker-stumble.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('zombie-runner-walk', 'assets/zombies/zombie-runner-walk.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('zombie-runner-attack', 'assets/zombies/zombie-runner-attack.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('zombie-runner-stumble', 'assets/zombies/zombie-runner-stumble.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('zombie-tank-walk', 'assets/zombies/zombie-tank-walk.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('zombie-tank-attack', 'assets/zombies/zombie-tank-attack.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('zombie-tank-stumble', 'assets/zombies/zombie-tank-stumble.png', { frameWidth: 64, frameHeight: 64 });
```

PixelLab character ids:

- Walker (Normal): `b6cf36f8-37d4-4842-9821-1a7c3c336f86`
- Runner (Fast): `1ccce243-780c-42c4-8f9f-b7747a5d65be`
- Tank (Brute): `780e61c8-ec07-41c8-b2f5-40f5399cdbe0`

Pack notes: characters generated at 92×92; v3 attack/stumble canvases grew (100–128). All frames center-cropped to 64×64. Walker walk used `scary-walk` (8f) subsampled to 6f.
