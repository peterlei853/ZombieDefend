# Player assets (PixelLab)

Phaser load keys match filenames (without extension) unless noted.

| Key | File | Frames | Size |
|-----|------|--------|------|
| `player-idle` | player-idle.png | 4 | 92×92 (west / in-game facing) |
| `player-walk-west` | player-walk-west.png | 6 | 92×92 |
| `player-walk-east` | player-walk-east.png | 6 | 92×92 |
| `player-walk-north` | player-walk-north.png | 6 | 92×92 |
| `player-walk-south` | player-walk-south.png | 6 | 92×92 |
| `player-handgun-shoot` | player-handgun-shoot.png | 4 | 92×92 west |
| `player-shotgun-recoil` | player-shotgun-recoil.png | 6 | 92×92 west |
| `player-handgun-aim` | player-handgun-aim.png | 4 | 92×92 west (aim idle) |
| `player-shotgun-hold` | player-shotgun-hold.png | 4 | 92×92 west (two-hand hold) |
| `player-handgun-aim-walk-west` | player-handgun-aim-walk-west.png | 6 | 92×92 |
| `player-handgun-aim-walk-east` | player-handgun-aim-walk-east.png | 6 | 92×92 |
| `player-handgun-aim-walk-north` | player-handgun-aim-walk-north.png | 6 | 92×92 |
| `player-handgun-aim-walk-south` | player-handgun-aim-walk-south.png | 6 | 92×92 |
| `player-shotgun-hold-walk-west` | player-shotgun-hold-walk-west.png | 6 | 92×92 |
| `player-shotgun-hold-walk-east` | player-shotgun-hold-walk-east.png | 6 | 92×92 |
| `player-shotgun-hold-walk-north` | player-shotgun-hold-walk-north.png | 6 | 92×92 |
| `player-shotgun-hold-walk-south` | player-shotgun-hold-walk-south.png | 6 | 92×92 |
| `player-shotgun-fire-recoil` | player-shotgun-fire-recoil.png | 6 | 92×92 west (muzzle + lean-back + casing) |
| `handgun` | handgun.png | — | 48×32 |
| `shotgun` | shotgun.png | — | 64×32 |

```js
this.load.spritesheet('player-idle', 'assets/player/player-idle.png', { frameWidth: 92, frameHeight: 92 });
this.load.spritesheet('player-shotgun-recoil', 'assets/player/player-shotgun-recoil.png', { frameWidth: 92, frameHeight: 92 });
this.load.spritesheet('player-handgun-aim', 'assets/player/player-handgun-aim.png', { frameWidth: 92, frameHeight: 92 });
this.load.spritesheet('player-shotgun-hold', 'assets/player/player-shotgun-hold.png', { frameWidth: 92, frameHeight: 92 });
this.load.spritesheet('player-handgun-aim-walk-west', 'assets/player/player-handgun-aim-walk-west.png', { frameWidth: 92, frameHeight: 92 });
this.load.spritesheet('player-shotgun-hold-walk-west', 'assets/player/player-shotgun-hold-walk-west.png', { frameWidth: 92, frameHeight: 92 });
this.load.spritesheet('player-shotgun-fire-recoil', 'assets/player/player-shotgun-fire-recoil.png', { frameWidth: 92, frameHeight: 92 });
this.load.image('handgun', 'assets/player/handgun.png');
this.load.image('shotgun', 'assets/player/shotgun.png');
```

In-game origin stays `(0.5, 76/92)`. Frame size locked at **92×92** (not 64).

PixelLab character id: `dd594149-c9d9-468f-9f8c-d4f596675aa7`
