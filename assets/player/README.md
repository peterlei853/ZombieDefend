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
| `handgun` | handgun.png | — | 48×32 |
| `shotgun` | shotgun.png | — | 64×32 |

```js
this.load.spritesheet('player-idle', 'assets/player/player-idle.png', { frameWidth: 92, frameHeight: 92 });
this.load.spritesheet('player-shotgun-recoil', 'assets/player/player-shotgun-recoil.png', { frameWidth: 92, frameHeight: 92 });
this.load.image('handgun', 'assets/player/handgun.png');
this.load.image('shotgun', 'assets/player/shotgun.png');
```

PixelLab character id: `dd594149-c9d9-468f-9f8c-d4f596675aa7`
