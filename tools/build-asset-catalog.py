#!/usr/bin/env python3
"""Regenerate the ZombieDefend asset-library catalog.

Reads every per-group  assets/library/**/manifest.json  and writes:
  assets/library/asset-index.json   machine-readable index of every loadable asset
  assets/library/CATALOG.md         human catalog (renders on GitHub)
  assets/library/catalog.html       standalone visual catalog (index JSON embedded inline)

Usage (run from anywhere; paths are resolved from this file's location):
  python3 tools/build-asset-catalog.py              # validate + write the three files
  python3 tools/build-asset-catalog.py --check      # validate only; exit 1 if outputs are stale or invalid
  python3 tools/build-asset-catalog.py --previews   # also (re)build missing previews/<cat>/<group>/preview.gif (needs Pillow)
  python3 tools/build-asset-catalog.py --previews --force-previews   # rebuild every generated preview GIF

Only the Python standard library is needed, except --previews (pip install pillow).
"""
import argparse, json, math, os, re, struct, sys
from collections import Counter, OrderedDict

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
LIB_REL = 'assets/library'
LIB = os.path.join(ROOT, LIB_REL)
INDEX_REL = f'{LIB_REL}/asset-index.json'
CATALOG_MD_REL = f'{LIB_REL}/CATALOG.md'
CATALOG_HTML_REL = f'{LIB_REL}/catalog.html'
PAGES_URL = 'https://peterlei853.github.io/ZombieDefend/assets/library/catalog.html'

CATEGORY_ORDER = ['hero', 'zombies', 'bosses', 'fx', 'pickups', 'backgrounds', 'concepts']
CATEGORY_TITLES = {'hero': 'Hero', 'zombies': 'Zombies', 'bosses': 'Bosses', 'fx': 'Shared FX',
                   'pickups': 'Pickups', 'backgrounds': 'Backgrounds', 'concepts': 'Concepts'}
VALID_TYPES = {'spritesheet', 'image', 'fx', 'icon', 'background', 'concept'}
MAX_PREVIEW_BYTES = 1_500_000
MAX_PREVIEW_SIDE = 1600

# Keys already used by the game outside assets/library (checked 2026-10-07 on main:
# assets/zombies/manifest.json, assets/player/manifest.json, src/assets/*.js).
# Any assets/*/manifest.json outside the library is also scanned at build time.
RESERVED_KEYS = set(
    [f'zombie-{v}-{a}' for v in ('walker', 'runner', 'tank') for a in ('walk', 'attack', 'stumble', 'death')]
    + ['player-idle', 'player-walk-west', 'player-walk-east', 'player-walk-north', 'player-walk-south',
       'player-walk-up', 'player-walk-down', 'player-handgun-shoot', 'player-shotgun-recoil',
       'player-handgun-aim', 'player-shotgun-hold', 'player-shotgun-fire-recoil', 'handgun', 'shotgun',
       'smoke-stage']
    + [f'player-{w}-walk-{d}' for w in ('handgun-aim', 'shotgun-hold') for d in ('west', 'east', 'north', 'south')])

ASSET_FIELDS = ['key', 'category', 'group', 'path', 'type', 'frameWidth', 'frameHeight', 'frames', 'frameRate',
                'loop', 'loopFrom', 'loopTo', 'origin', 'facing', 'anchors', 'timing', 'fx', 'skill',
                'preview', 'description', 'note', 'tags', 'extra']

STATUS_WORDS = {'freeze': 'freeze', 'burn': 'burn', 'shock': 'shock', 'spark': 'shock', 'wet': 'wet',
                'dizzy': 'stun', 'paralyze': 'shock', 'trap': 'trap', 'terrified': 'fear'}
ACTION_WORDS = ['walk', 'run', 'idle', 'attack', 'bite', 'hurt', 'die', 'death', 'defeat', 'spawn', 'enrage',
                'fire', 'ready', 'victory', 'break', 'split', 'splatter', 'explode', 'blast', 'tumble', 'panic',
                'fall', 'muzzle', 'impact', 'projectile', 'proj', 'beam', 'stream', 'cone', 'pop', 'smoke', 'loot']
WEAPONS = ['water', 'bubble', 'lightning', 'frost', 'flame', 'sling']

# --------------------------------------------------------------------------- helpers

def image_size(path):
    """(width, height) of a PNG or GIF using only the standard library."""
    with open(path, 'rb') as f:
        head = f.read(32)
    if head[:8] == b'\x89PNG\r\n\x1a\n':
        return struct.unpack('>II', head[16:24])
    if head[:6] in (b'GIF87a', b'GIF89a'):
        return struct.unpack('<HH', head[6:10])
    if head[:2] == b'\xff\xd8':
        with open(path, 'rb') as f:
            data = f.read()
        i = 2
        while i < len(data):
            if data[i] != 0xFF: i += 1; continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack('>HH', data[i + 5:i + 9]); return w, h
            i += 2 + struct.unpack('>H', data[i + 2:i + 4])[0]
    raise ValueError(f'unsupported image: {path}')


def abspath(rel):
    return os.path.join(ROOT, rel)


def find_manifests():
    out = []
    for dirpath, dirnames, filenames in os.walk(LIB):
        dirnames[:] = sorted(d for d in dirnames if d != 'previews')
        if 'manifest.json' in filenames:
            out.append(os.path.relpath(os.path.join(dirpath, 'manifest.json'), ROOT).replace(os.sep, '/'))
    return out


def common_prefix(keys):
    if len(keys) < 2:
        return ''
    p = os.path.commonprefix(keys)
    return p[:p.rfind('-') + 1] if '-' in p else ''


def loop_text(a):
    n = a.get('frames') or 1
    if n <= 1:
        return 'static'
    if a.get('loopFrom') is not None:
        lf, lt = a['loopFrom'], a['loopTo']
        end = f', end {lt + 1}-{n - 1} once' if lt + 1 <= n - 1 else ''
        start = f'start 0-{lf - 1} once, ' if lf > 0 else ''
        return f'{start}loop {lf}-{lt}{end}'
    return 'loop' if a.get('loop') else 'once'


def auto_tags(a, action, group_meta):
    tags = [a['category'], a['group'], a['type']]
    k = a['key']
    for w in ACTION_WORDS:
        if re.search(rf'(^|[-_]){w}', action):
            tags.append('projectile' if w == 'proj' else w)
    for w, t in STATUS_WORDS.items():
        if w in action:
            tags.append('status'); tags.append(t)
    if a['category'] == 'hero':
        for w in WEAPONS:
            if f'-{w}-' in f'-{action}-' or k.startswith(f'fx-{w}-') or k == f'icon-{w}':
                tags.append(w)
    n = a.get('frames') or 1
    if n > 1:
        tags.append('sustained' if a.get('loopFrom') is not None else ('loop' if a.get('loop') else 'once'))
    if a.get('skill') or a.get('fx'):
        tags.append('skill')
    if a.get('anchors', {}) and isinstance(a.get('anchors'), dict) and a['anchors'].get('attach'):
        tags.append('attached-fx')
    note = (a.get('note') or '').lower()
    if 'tile' in note or 'seamless' in note:
        tags.append('tileable')
    if 'overlay' in note:
        tags.append('overlay')
    if isinstance(a.get('anchors'), dict) and a['anchors'].get('blendMode') == 'ADD':
        tags.append('additive')
    tags += a.get('tags', [])
    seen, out = set(), []
    for t in tags:
        if t and t not in seen:
            seen.add(t); out.append(t)
    return out


def auto_description(a, action, gm):
    if a.get('description'):
        return a['description']
    n = a.get('frames') or 1
    size = f"{a['frameWidth']}x{a['frameHeight']}"
    if a['type'] in ('icon', 'image'):
        base = f"{gm['title']}: {action or a['key']} ({size} image)."
    else:
        fps = a.get('frameRate')
        base = f"{gm['title']}: {action or a['key']} — {n} frames {size} @ {fps} fps, {loop_text(a)}."
    if a.get('skill'):
        base += f" Skill: {a['skill']}."
    return base

# --------------------------------------------------------------------------- load + validate

class Problems:
    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, msg): self.errors.append(msg)
    def warn(self, msg): self.warnings.append(msg)


def scan_existing_repo_keys():
    """Keys from assets/*/manifest.json files that are not part of the library."""
    keys = set()
    adir = os.path.join(ROOT, 'assets')
    if not os.path.isdir(adir):
        return keys
    for name in os.listdir(adir):
        p = os.path.join(adir, name, 'manifest.json')
        if name == 'library' or not os.path.isfile(p):
            continue
        try:
            m = json.load(open(p, encoding='utf-8'))
        except Exception:
            continue
        for sect in ('phaser_keys', 'keys'):
            if isinstance(m.get(sect), dict):
                keys.update(m[sect].keys())
    return keys


def load_library(problems):
    groups, assets = [], []
    reserved = RESERVED_KEYS | scan_existing_repo_keys()
    seen = {}
    for mrel in find_manifests():
        try:
            m = json.load(open(abspath(mrel), encoding='utf-8'))
        except Exception as e:
            problems.err(f'{mrel}: cannot parse JSON ({e})'); continue
        cat, slug = m.get('category'), m.get('group')
        if cat not in CATEGORY_ORDER:
            problems.err(f'{mrel}: unknown category {cat!r}')
        defaults = m.get('defaults', {})
        prev = m.get('preview', {}) or {}
        thumb = prev.get('thumb')
        gm = OrderedDict(id=f'{cat}/{slug}', category=cat, group=slug, title=m.get('title', slug),
                         titleZh=m.get('titleZh'), description=m.get('description', ''), manifest=mrel,
                         dir=os.path.dirname(mrel), thumb=thumb, sheets=prev.get('sheets', []),
                         extras=prev.get('extras', []), animate=prev.get('animate', []),
                         conventions=m.get('conventions'), source=m.get('source'))
        keys = [x['key'] for x in m.get('assets', [])]
        prefix = common_prefix(keys)
        gm['keyPrefix'] = prefix
        for p in [thumb] + gm['sheets'] + gm['extras']:
            if not p:
                continue
            if not os.path.isfile(abspath(p)):
                if p == thumb and gm['animate']:
                    problems.warn(f'{mrel}: preview {p} missing (run with --previews)')
                else:
                    problems.err(f'{mrel}: preview {p} missing')
                continue
            sz = os.path.getsize(abspath(p))
            w, h = image_size(abspath(p))
            if sz > MAX_PREVIEW_BYTES:
                problems.err(f'{p}: preview is {sz} bytes (> {MAX_PREVIEW_BYTES})')
            if max(w, h) > MAX_PREVIEW_SIDE:
                problems.err(f'{p}: preview is {w}x{h} (> {MAX_PREVIEW_SIDE}px)')
        g_assets = []
        for raw in m.get('assets', []):
            a = OrderedDict()
            merged = dict(defaults); merged.update(raw)
            merged['category'], merged['group'] = cat, slug
            k = merged.get('key')
            if not k:
                problems.err(f'{mrel}: asset without key'); continue
            if k in seen:
                problems.err(f'duplicate key {k!r} in {mrel} and {seen[k]}')
            seen[k] = mrel
            if k in reserved:
                problems.err(f'key {k!r} ({mrel}) clashes with an existing repo key; rename/prefix it')
            path = merged.get('path', '')
            if not path.startswith(LIB_REL + '/'):
                problems.err(f'{k}: path {path!r} must be repo-root relative under {LIB_REL}/')
            if re.search(r'_old\.|/work/|/gen/|/raw/|-debug\.png$', path):
                problems.err(f'{k}: path {path!r} looks like a work/old file')
            t = merged.get('type', 'spritesheet')
            merged['type'] = t
            if t not in VALID_TYPES:
                problems.err(f'{k}: invalid type {t!r}')
            if not os.path.isfile(abspath(path)):
                problems.err(f'{k}: file missing {path}')
            else:
                w, h = image_size(abspath(path))
                fw, fh = merged.get('frameWidth'), merged.get('frameHeight')
                n = merged.get('frames') or 1
                grid = merged.get('grid')  # optional [cols, rows]
                if fw is None or fh is None:
                    merged['frameWidth'], merged['frameHeight'] = fw, fh = (w, h) if n == 1 else (w // n, h)
                cols, rows = grid if grid else (n, 1)
                if (w, h) != (fw * cols, fh * rows):
                    problems.err(f'{k}: {path} is {w}x{h}, expected {fw * cols}x{fh * rows} ({cols}x{rows} of {fw}x{fh})')
                if grid and cols * rows < n:
                    problems.err(f'{k}: grid {grid} smaller than frames {n}')
            merged.setdefault('frames', 1)
            if merged['frames'] > 1:
                merged.setdefault('loop', False)
                if merged.get('frameRate') is None:
                    problems.err(f'{k}: animated asset without frameRate')
            else:
                merged.setdefault('loop', False)
            lf, lt = merged.get('loopFrom'), merged.get('loopTo')
            if (lf is None) != (lt is None) or (lf is not None and not (0 <= lf <= lt < merged['frames'])):
                problems.err(f'{k}: bad loopFrom/loopTo {lf}/{lt} for {merged["frames"]} frames')
            for fk in merged.get('fx', []) or []:
                pass  # resolved after all manifests are loaded
            action = k[len(prefix):] if prefix and k.startswith(prefix) else k
            merged['tags'] = auto_tags(merged, action, gm)
            merged['description'] = auto_description(merged, action, gm)
            merged['preview'] = thumb
            for f in ASSET_FIELDS:
                a[f] = merged.get(f)
            if merged.get('grid'):
                a['grid'] = merged['grid']
            a['action'] = action
            g_assets.append(a)
        gm['count'] = len(g_assets)
        gm['keys'] = [a['key'] for a in g_assets]
        sizes = sorted({(a['frameWidth'], a['frameHeight']) for a in g_assets if a['frameWidth']})
        gm['frameSizes'] = [f'{w}x{h}' for w, h in sizes]
        fr = [a['frames'] for a in g_assets]
        fps = [a['frameRate'] for a in g_assets if a.get('frameRate')]
        gm['framesRange'] = [min(fr), max(fr)] if fr else None
        gm['fpsRange'] = [min(fps), max(fps)] if fps else None
        gm['types'] = sorted({a['type'] for a in g_assets})
        gm['mainKey'] = (gm['animate'] or gm['keys'] or [None])[0]
        groups.append(gm)
        assets.extend(g_assets)
    all_keys = {a['key'] for a in assets}
    for a in assets:
        for fk in a.get('fx') or []:
            if fk not in all_keys:
                problems.err(f"{a['key']}: linked fx {fk!r} not found")
        att = (a.get('anchors') or {}).get('attach') if isinstance(a.get('anchors'), dict) else None
        if att and att.get('animation') not in all_keys:
            problems.err(f"{a['key']}: attach.animation {att.get('animation')!r} not found")
    for g in groups:
        for k in g['animate']:
            if k not in all_keys:
                problems.err(f"{g['manifest']}: preview.animate key {k!r} not found")
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    groups.sort(key=lambda g: (order.get(g['category'], 99), g['dir']))
    gorder = {g['id']: i for i, g in enumerate(groups)}
    assets.sort(key=lambda a: gorder[f"{a['category']}/{a['group']}"])
    return groups, assets

# --------------------------------------------------------------------------- previews (optional, Pillow)

def build_previews(groups, assets, force=False):
    try:
        from PIL import Image
    except ImportError:
        sys.exit('--previews needs Pillow: pip install pillow')
    by_key = {a['key']: a for a in assets}
    made = []
    for g in groups:
        if not g['animate']:
            continue
        out_rel = f"{LIB_REL}/previews/{g['category']}/{g['group']}/preview.gif"
        if g['thumb'] and g['thumb'] != out_rel:
            continue  # manifest points at a hand-made thumb
        out = abspath(out_rel)
        if os.path.exists(out) and not force:
            continue
        sel = [by_key[k] for k in g['animate'] if k in by_key]
        cw = max(a['frameWidth'] for a in sel); ch = max(a['frameHeight'] for a in sel)
        scale = min(4, max(1, math.ceil(128 / max(cw, ch))))
        cols = max(1, min(len(sel), 1024 // (cw * scale + 8)))
        rows = math.ceil(len(sel) / cols)
        pad = 8
        W = cols * (cw * scale + pad) + pad; H = rows * (ch * scale + pad) + pad
        strips = [(a, Image.open(abspath(a['path'])).convert('RGBA')) for a in sel]
        ticks, tick_fps = 36, 12
        frames = []
        for t in range(ticks):
            canvas = Image.new('RGBA', (W, H), (27, 31, 39, 255))
            for i, (a, im) in enumerate(strips):
                n, fps = a['frames'], a.get('frameRate') or 8
                step = int(t * fps / tick_fps)
                if a.get('loop'):
                    idx = step % n
                elif a.get('loopFrom') is not None:
                    seq = list(range(a['loopFrom'])) + list(range(a['loopFrom'], a['loopTo'] + 1)) * 3 + list(range(a['loopTo'] + 1, n))
                    idx = seq[min(step, len(seq) - 1)]
                else:
                    idx = min(step, n - 1)
                fw, fh = a['frameWidth'], a['frameHeight']
                fr = im.crop((idx * fw, 0, idx * fw + fw, fh)).resize((fw * scale, fh * scale), Image.NEAREST)
                c, r = i % cols, i // cols
                x = pad + c * (cw * scale + pad) + (cw * scale - fw * scale) // 2
                y = pad + r * (ch * scale + pad) + (ch * scale - fh * scale)  # bottom-aligned
                canvas.alpha_composite(fr, (x, y))
            frames.append(canvas.convert('RGB'))
        # one shared palette keeps the GIF small and flicker-free
        sheet = Image.new('RGB', (W, H * len(frames)))
        for i, f in enumerate(frames):
            sheet.paste(f, (0, i * H))
        pal = sheet.quantize(colors=255, method=Image.MEDIANCUT)
        pframes = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
        os.makedirs(os.path.dirname(out), exist_ok=True)
        pframes[0].save(out, save_all=True, append_images=pframes[1:], duration=int(1000 / tick_fps), loop=0, optimize=True, disposal=1)
        g['thumb'] = out_rel
        made.append((out_rel, os.path.getsize(out)))
    return made

# --------------------------------------------------------------------------- outputs

def build_index(groups, assets):
    counts = OrderedDict()
    for c in CATEGORY_ORDER:
        ca = [a for a in assets if a['category'] == c]
        if ca:
            counts[c] = OrderedDict(groups=len([g for g in groups if g['category'] == c]), assets=len(ca))
    by_type = Counter(a['type'] for a in assets)
    idx = OrderedDict()
    idx['schema'] = 'zombiedefend-asset-index/1'
    idx['generatedBy'] = 'tools/build-asset-catalog.py'
    idx['libraryRoot'] = LIB_REL + '/'
    idx['catalogUrl'] = PAGES_URL
    idx['pathsRelativeTo'] = 'repo root (the folder that contains index.html)'
    idx['conventions'] = OrderedDict([
        ('strips', 'horizontal; frame i at x = i*frameWidth, y = 0 (unless "grid" is given)'),
        ('origin', 'Phaser setOrigin(x, y) fractions of one frame'),
        ('zombies', '64x64 (brute 96x96, slime split / sprinter blasted_back+tumble 96x64), origin (0.5, 1.0) feet, facing east'),
        ('bosses', '128x128, origin (0.5, 1.0), facing east; skill FX attach offsets are px from the boss origin, y up negative'),
        ('hero', '92x92, origin (0.5, 76/92 = 0.8261) feet at y=76, facing west unless key ends in -walk-east/-north/-south'),
        ('fx', 'origin per key; hero FX point west, boss FX east'),
        ('loop', 'loop=true: whole strip repeats. loopFrom/loopTo (inclusive, 0-based): play [0,loopFrom) once, repeat [loopFrom..loopTo] while sustained, then (loopTo..end] once'),
        ('backgrounds', '1280x720, origin (0,0), top-left at world (832, 0) = fixed camera scrollX; depths far 3, fire 3.5, ground 4, mid 5, lamp 6'),
        ('concepts', 'concept art only; not game-ready'),
    ])
    idx['counts'] = OrderedDict(total=len(assets), byCategory=counts, byType=OrderedDict(sorted(by_type.items())))
    idx['groups'] = [OrderedDict((k, g[k]) for k in ('id', 'category', 'group', 'title', 'titleZh', 'description', 'manifest',
                                                     'dir', 'thumb', 'sheets', 'extras', 'keyPrefix', 'mainKey', 'count',
                                                     'frameSizes', 'framesRange', 'fpsRange', 'types', 'keys')) for g in groups]
    idx['assets'] = assets
    return idx


def md_escape(s):
    return str(s).replace('|', '\\|').replace('\n', ' ')


def rel_from_lib(p):
    return p[len(LIB_REL) + 1:] if p and p.startswith(LIB_REL + '/') else os.path.relpath(abspath(p), LIB).replace(os.sep, '/')


def build_catalog_md(groups, assets, index):
    L = []
    L.append('# ZombieDefend Asset Catalog')
    L.append('')
    L.append('> **Generated file — do not edit by hand.** Regenerate with `python3 tools/build-asset-catalog.py` '
             '(see [README.md](README.md#how-to-update)).')
    L.append(f'> Visual catalog: [catalog.html]({PAGES_URL}) · machine index: [asset-index.json](asset-index.json)')
    L.append('')
    L.append('| Category | Groups | Assets |')
    L.append('|---|---:|---:|')
    for c, v in index['counts']['byCategory'].items():
        L.append(f"| [{CATEGORY_TITLES[c]}](#{c}) | {v['groups']} | {v['assets']} |")
    L.append(f"| **Total** | **{len(groups)}** | **{len(assets)}** |")
    L.append('')
    by_group = {}
    for a in assets:
        by_group.setdefault(f"{a['category']}/{a['group']}", []).append(a)
    for c in CATEGORY_ORDER:
        cg = [g for g in groups if g['category'] == c]
        if not cg:
            continue
        L.append(f'<a id="{c}"></a>')
        L.append(f'## {CATEGORY_TITLES[c]}')
        L.append('')
        for g in cg:
            title = g['title'] + (f" ({g['titleZh']})" if g.get('titleZh') else '')
            L.append(f"### {title}")
            L.append('')
            if g['thumb']:
                L.append(f'<img src="{rel_from_lib(g["thumb"])}" alt="{g["group"]} preview" height="{180 if c in ("backgrounds", "concepts") else 140}">')
                L.append('')
            L.append(g['description'])
            L.append('')
            meta = [f"group `{g['group']}`", f"{g['count']} assets", 'frame ' + ', '.join(g['frameSizes'])]
            if g['keyPrefix']:
                meta.append(f"key prefix `{g['keyPrefix']}`")
            meta.append(f"manifest [{rel_from_lib(g['manifest'])}]({rel_from_lib(g['manifest'])})")
            L.append('- ' + ' · '.join(meta))
            links = [f'[{os.path.basename(p)}]({rel_from_lib(p)})' for p in g['sheets'] + g['extras']]
            if links:
                L.append('- previews: ' + ', '.join(links))
            L.append('')
            rows = by_group.get(g['id'], [])
            if c in ('backgrounds', 'concepts') or all(a['type'] in ('icon', 'image') for a in rows):
                L.append('| Key | File | Size | Type | Notes |')
                L.append('|---|---|---|---|---|')
                for a in rows:
                    note = a.get('note') or (a['description'] if c != 'concepts' else a['description'].split(':')[0])
                    if a['frames'] > 1:
                        note = f"{a['frames']}f @ {a['frameRate']}fps {loop_text(a)}. " + (note or '')
                    L.append(f"| `{a['key']}` | [{os.path.basename(a['path'])}]({rel_from_lib(a['path'])}) | "
                             f"{a['frameWidth']}x{a['frameHeight']} | {a['type']} | {md_escape(note or '')} |")
            else:
                L.append('| Key | Frames | Size | FPS | Playback | Origin | Notes |')
                L.append('|---|---:|---|---:|---|---|---|')
                for a in rows:
                    o = a.get('origin')
                    origin = f'({o[0]}, {o[1]})' if o else '–'
                    extra = []
                    if a.get('facing') and a['facing'] != g.get('_facing'):
                        pass
                    if a.get('fx'):
                        extra.append('fx: ' + ', '.join(f'`{x}`' for x in a['fx']))
                    anc = a.get('anchors') or {}
                    if isinstance(anc, dict) and anc.get('attach'):
                        at = anc['attach']
                        extra.append(f"attach to `{at.get('animation')}` frame {at.get('startOnCharacterFrame')} offset {at.get('offsetFromCharacterOrigin')}")
                    if isinstance(anc, dict) and anc.get('impactPoint'):
                        extra.append(f"impactPoint {anc['impactPoint']}")
                    if isinstance(anc, dict) and anc.get('mouthAnchors'):
                        extra.append('mouthAnchors per frame')
                    if isinstance(anc, dict) and anc.get('spawnOffsetsX'):
                        extra.append(f"spawnOffsetsX {anc['spawnOffsetsX']}")
                    if a.get('note'):
                        extra.append(a['note'])
                    facing = a.get('facing')
                    if c == 'hero' and facing and facing != 'west':
                        extra.insert(0, f'faces {facing}')
                    L.append(f"| `{a['key']}` | {a['frames']} | {a['frameWidth']}x{a['frameHeight']} | {a.get('frameRate') or '–'} | "
                             f"{loop_text(a)} | {origin} | {md_escape(' · '.join(extra))} |")
            L.append('')
    return '\n'.join(L).rstrip() + '\n'


HTML_TEMPLATE = r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZombieDefend · Asset Library Catalog</title>
<!-- GENERATED by tools/build-asset-catalog.py — do not edit by hand; edit the template in the script. -->
<style>
:root{--bg:#0f1218;--panel:#171b23;--panel2:#1e2430;--line:#2a3140;--text:#e6ebf2;--muted:#8d99ab;--accent:#7bd88f;--accent2:#ffb454;--danger:#ff6b6b;--chip:#232a37}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif}
a{color:var(--accent)}
header{position:sticky;top:0;z-index:5;background:rgba(15,18,24,.94);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:14px 20px}
.top{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
h1{font-size:20px;margin:0;letter-spacing:.3px}
h1 span{color:var(--accent)}
.stats{color:var(--muted);font-size:13px}
.controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center}
.filters{display:flex;flex-wrap:wrap;gap:6px}
.filters button,.btn{background:var(--chip);color:var(--text);border:1px solid var(--line);border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;font-size:13px}
.filters button:hover,.btn:hover{border-color:var(--accent)}
.filters button.on{background:var(--accent);color:#0b0f14;border-color:var(--accent);font-weight:600}
.filters button .n{opacity:.7;font-size:11px;margin-left:4px}
#q{flex:1;min-width:220px;max-width:420px;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px 11px;font:inherit}
#q:focus{outline:none;border-color:var(--accent)}
main{padding:20px;max-width:1500px;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;transition:transform .12s,border-color .12s}
.card:hover{transform:translateY(-2px);border-color:var(--accent)}
.thumb{height:170px;display:flex;align-items:center;justify-content:center;background:#1b1f27 repeating-conic-gradient(#1e232c 0 25%,#1b1f27 0 50%) 0 0/16px 16px;border-bottom:1px solid var(--line)}
.thumb img{max-width:100%;max-height:100%;image-rendering:pixelated;object-fit:contain}
.body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
.title{font-weight:650;font-size:15px}
.zh{color:var(--muted);font-weight:400;font-size:13px;margin-left:4px}
.badges{display:flex;gap:5px;flex-wrap:wrap}
.badge{font-size:11px;padding:1px 7px;border-radius:999px;background:var(--chip);color:var(--muted);border:1px solid var(--line)}
.badge.cat{color:var(--accent2);border-color:#4a3b22}
.keyrow{display:flex;gap:6px;align-items:center;margin-top:auto}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.keyrow code{background:#0c0f14;border:1px solid var(--line);border-radius:6px;padding:3px 7px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.copy{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;white-space:nowrap}
.copy:hover{border-color:var(--accent)}
.copy.ok{background:var(--accent);color:#0b0f14}
.meta{color:var(--muted);font-size:12px}
.match{color:var(--accent2);font-size:12px}
.empty{color:var(--muted);text-align:center;padding:60px 0}
dialog{width:min(1200px,96vw);max-height:92vh;padding:0;border:1px solid var(--line);border-radius:14px;background:var(--panel);color:var(--text)}
dialog::backdrop{background:rgba(0,0,0,.65)}
.dhead{position:sticky;top:0;background:var(--panel);border-bottom:1px solid var(--line);padding:14px 18px;display:flex;gap:12px;align-items:flex-start;justify-content:space-between;z-index:2}
.dhead h2{margin:0;font-size:18px}
.dhead p{margin:4px 0 0;color:var(--muted);max-width:900px}
.dbody{padding:14px 18px 20px}
.links{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.links a{font-size:12px;background:var(--chip);border:1px solid var(--line);border-radius:6px;padding:2px 8px;text-decoration:none}
.keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:10px}
.k{display:flex;gap:10px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:8px}
.k.hit{border-color:var(--accent2)}
.stage{flex:0 0 136px;height:136px;display:flex;align-items:flex-end;justify-content:center;background:#1b1f27 repeating-conic-gradient(#1e232c 0 25%,#1b1f27 0 50%) 0 0/12px 12px;border-radius:8px;overflow:hidden;padding-bottom:4px}
.stage.center{align-items:center;padding:0}
.spr{image-rendering:pixelated;background-repeat:no-repeat}
.stage img{max-width:136px;max-height:136px;image-rendering:pixelated}
.kinfo{min-width:0;display:flex;flex-direction:column;gap:4px;flex:1}
.kinfo .kk{display:flex;gap:6px;align-items:flex-start}
.kinfo .kk code{word-break:break-all;flex:1;color:var(--accent)}
.kinfo .note{color:var(--muted);font-size:12px;max-height:5.6em;overflow:auto}
.close{background:none;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:4px 10px;cursor:pointer;font-size:16px}
footer{color:var(--muted);text-align:center;font-size:12px;padding:20px}
</style>
</head>
<body>
<header>
  <div class="top">
    <h1>ZombieDefend <span>Asset Library</span></h1>
    <div class="stats" id="stats">loading…</div>
  </div>
  <div class="controls">
    <div class="filters" id="filters"></div>
    <input id="q" type="search" placeholder="Search keys, names, tags… (e.g. hurt_freeze, boss fx, sling)" autocomplete="off">
  </div>
</header>
<main>
  <div class="grid" id="grid"></div>
  <div class="empty" id="empty" hidden>No assets match.</div>
</main>
<dialog id="dlg">
  <div class="dhead"><div><h2 id="dtitle"></h2><p id="ddesc"></p></div><button class="close" id="dclose" aria-label="Close">✕</button></div>
  <div class="dbody"><div class="links" id="dlinks"></div><div class="keys" id="dkeys"></div></div>
</dialog>
<footer id="foot">Generated by <code>tools/build-asset-catalog.py</code> from the per-group <code>manifest.json</code> files.</footer>
<script type="application/json" id="asset-index-inline">__INLINE_INDEX__</script>
<script>
(() => {
  'use strict';
  const LIB = 'assets/library/';
  const CAT_TITLES = __CAT_TITLES__;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url = (p) => !p ? '' : (p.startsWith(LIB) ? p.slice(LIB.length) : '../../' + p);
  let INDEX = null, source = '';
  let cat = 'all', query = '';

  function loadInline() {
    return JSON.parse(document.getElementById('asset-index-inline').textContent);
  }
  async function loadIndex() {
    try {
      if (location.protocol === 'file:') throw new Error('file');
      const r = await fetch('asset-index.json', {cache: 'no-cache'});
      if (!r.ok) throw new Error(r.status);
      source = 'asset-index.json';
      return await r.json();
    } catch (e) {
      source = 'inline copy';
      return loadInline();
    }
  }

  function copyText(text, btn) {
    const done = () => { if (!btn) return; const t = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('ok'); setTimeout(() => { btn.textContent = t; btn.classList.remove('ok'); }, 900); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => fallback());
    } else fallback();
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove();
    }
  }

  const assetsByGroup = new Map();
  function haystack(a) { return (a.key + ' ' + (a.tags || []).join(' ') + ' ' + (a.description || '') + ' ' + (a.note || '')).toLowerCase(); }
  function groupHay(g) { return (g.title + ' ' + (g.titleZh || '') + ' ' + g.group + ' ' + g.category + ' ' + g.description).toLowerCase(); }
  function terms() { return query.toLowerCase().split(/\s+/).filter(Boolean); }
  function matchesAll(text, ts) { return ts.every((t) => text.includes(t)); }
  function matchingKeys(g) {
    const ts = terms(); const list = assetsByGroup.get(g.id) || [];
    if (!ts.length) return list;
    const gh = groupHay(g);
    return list.filter((a) => matchesAll(gh + ' ' + haystack(a), ts));
  }

  function rangeText(r, unit) { if (!r) return ''; return (r[0] === r[1] ? r[0] : r[0] + '–' + r[1]) + unit; }

  function renderFilters() {
    const counts = {};
    INDEX.assets.forEach((a) => counts[a.category] = (counts[a.category] || 0) + 1);
    const cats = ['all', ...Object.keys(CAT_TITLES).filter((c) => counts[c])];
    $('#filters').innerHTML = cats.map((c) => `<button data-cat="${c}" class="${c === cat ? 'on' : ''}">${c === 'all' ? 'All' : CAT_TITLES[c]}<span class="n">${c === 'all' ? INDEX.assets.length : counts[c]}</span></button>`).join('');
    $('#filters').querySelectorAll('button').forEach((b) => b.onclick = () => { cat = b.dataset.cat; renderFilters(); renderGrid(); });
  }

  function renderGrid() {
    const ts = terms();
    const html = [];
    let shown = 0;
    for (const g of INDEX.groups) {
      if (cat !== 'all' && g.category !== cat) continue;
      const hits = matchingKeys(g);
      if (ts.length && !hits.length) continue;
      shown++;
      const mainKey = ts.length ? hits[0].key : g.mainKey;
      html.push(`<article class="card" data-id="${esc(g.id)}" tabindex="0">
        <div class="thumb">${g.thumb ? `<img loading="lazy" src="${esc(url(g.thumb))}" alt="${esc(g.title)}">` : ''}</div>
        <div class="body">
          <div class="title">${esc(g.title)}${g.titleZh ? `<span class="zh">${esc(g.titleZh)}</span>` : ''}</div>
          <div class="badges"><span class="badge cat">${esc(CAT_TITLES[g.category] || g.category)}</span>${g.types.map((t) => `<span class="badge">${esc(t)}</span>`).join('')}<span class="badge">${g.count} keys</span></div>
          <div class="meta">${esc(g.frameSizes.slice(0, 3).join(', '))}${g.frameSizes.length > 3 ? '…' : ''} · ${rangeText(g.framesRange, ' frames')}${g.fpsRange ? ' · ' + rangeText(g.fpsRange, ' fps') : ''}</div>
          ${ts.length ? `<div class="match">${hits.length} matching key${hits.length > 1 ? 's' : ''}</div>` : ''}
          <div class="keyrow"><code title="${esc(mainKey)}">${esc(mainKey)}</code><button class="copy" data-key="${esc(mainKey)}">Copy key</button></div>
        </div></article>`);
    }
    $('#grid').innerHTML = html.join('');
    $('#empty').hidden = shown > 0;
    $('#grid').querySelectorAll('.card').forEach((el) => {
      el.onclick = (e) => { if (e.target.closest('.copy')) return; openGroup(el.dataset.id); };
      el.onkeydown = (e) => { if (e.key === 'Enter') openGroup(el.dataset.id); };
    });
    $('#grid').querySelectorAll('.copy').forEach((b) => b.onclick = (e) => { e.stopPropagation(); copyText(b.dataset.key, b); });
  }

  // ---- sprite player: honours loop / once (hold last frame) / loopFrom-loopTo sustained loops
  let active = [];
  function sequenceFor(a) {
    const n = a.frames || 1, seq = [];
    if (a.loop) { for (let i = 0; i < n; i++) seq.push(i); return seq; }
    if (a.loopFrom != null) {
      for (let i = 0; i < a.loopFrom; i++) seq.push(i);
      for (let r = 0; r < 3; r++) for (let i = a.loopFrom; i <= a.loopTo; i++) seq.push(i);
      for (let i = a.loopTo + 1; i < n; i++) seq.push(i);
    } else for (let i = 0; i < n; i++) seq.push(i);
    const hold = Math.max(2, Math.round((a.frameRate || 8) * 0.7));
    for (let i = 0; i < hold; i++) seq.push(seq[seq.length - 1]);
    return seq;
  }
  function tick(now) {
    for (const s of active) {
      const i = s.seq[Math.floor(now / 1000 * s.fps) % s.seq.length];
      if (i !== s.last) { s.el.style.backgroundPosition = `${-i * s.w}px 0px`; s.last = i; }
    }
    requestAnimationFrame(tick);
  }

  function spriteHTML(a) {
    const isImg = (a.frames || 1) <= 1 || a.type === 'background' || a.type === 'concept';
    if (isImg) return `<div class="stage center"><img loading="lazy" src="${esc(url(a.path))}" alt="${esc(a.key)}"></div>`;
    const box = 128, m = Math.max(a.frameWidth, a.frameHeight);
    let s = box / m; s = s >= 1 ? Math.min(4, Math.floor(s)) : s;
    const w = a.frameWidth * s, h = a.frameHeight * s;
    return `<div class="stage"><div class="spr" data-key="${esc(a.key)}" style="width:${w}px;height:${h}px;background-image:url('${esc(url(a.path))}');background-size:${w * a.frames}px ${h}px"></div></div>`;
  }
  function fmtOrigin(o) { return o ? `(${o.join(', ')})` : '–'; }
  function playback(a) {
    const n = a.frames || 1;
    if (n <= 1) return 'static image';
    if (a.loopFrom != null) return `start 0–${a.loopFrom - 1} · loop ${a.loopFrom}–${a.loopTo}` + (a.loopTo + 1 < n ? ` · end ${a.loopTo + 1}–${n - 1}` : '');
    return a.loop ? 'loop' : 'once (hold last)';
  }

  function openGroup(id) {
    const g = INDEX.groups.find((x) => x.id === id);
    if (!g) return;
    const ts = terms();
    const hitSet = new Set(ts.length ? matchingKeys(g).map((a) => a.key) : []);
    $('#dtitle').innerHTML = `${esc(g.title)}${g.titleZh ? ` <span class="zh">${esc(g.titleZh)}</span>` : ''}`;
    $('#ddesc').textContent = g.description;
    const links = [`<a href="${esc(url(g.manifest))}" target="_blank">manifest.json</a>`,
      ...g.sheets.concat(g.extras).map((p) => `<a href="${esc(url(p))}" target="_blank">${esc(p.split('/').pop())}</a>`),
      `<a href="#" id="copyall">Copy all ${g.count} keys</a>`];
    $('#dlinks').innerHTML = links.join('');
    const list = assetsByGroup.get(g.id) || [];
    $('#dkeys').innerHTML = list.map((a) => {
      const anc = a.anchors && typeof a.anchors === 'object' ? a.anchors : null;
      const bits = [];
      if (a.facing) bits.push('facing ' + a.facing);
      if (a.fx) bits.push('fx: ' + a.fx.join(', '));
      if (anc && anc.attach) bits.push(`attach → ${anc.attach.animation} @f${anc.attach.startOnCharacterFrame} offset [${anc.attach.offsetFromCharacterOrigin}]`);
      if (anc && anc.impactPoint) bits.push('impactPoint [' + anc.impactPoint + ']');
      if (anc && anc.mouthAnchors) bits.push('mouthAnchors per frame');
      if (anc && anc.depth != null) bits.push('depth ' + anc.depth);
      if (anc && anc.blendMode) bits.push('blend ' + anc.blendMode);
      const note = a.note || a.description || '';
      return `<div class="k${hitSet.has(a.key) ? ' hit' : ''}">${spriteHTML(a)}
        <div class="kinfo"><div class="kk"><code title="${esc(a.key)}">${esc(a.key)}</code><button class="copy" data-key="${esc(a.key)}">Copy</button></div>
        <div class="meta mono">${a.frameWidth}×${a.frameHeight} · ${a.frames}f${a.frameRate ? ' · ' + a.frameRate + 'fps' : ''} · origin ${esc(fmtOrigin(a.origin))}</div>
        <div class="meta">${esc(playback(a))}${bits.length ? ' · ' + esc(bits.join(' · ')) : ''}</div>
        <div class="note">${esc(note)}</div>
        <div class="meta mono" title="${esc(a.path)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.path)}</div></div></div>`;
    }).join('');
    $('#dkeys').querySelectorAll('.copy').forEach((b) => b.onclick = () => copyText(b.dataset.key, b));
    $('#copyall').onclick = (e) => { e.preventDefault(); copyText(g.keys.join('\n'), e.target); };
    const byKey = new Map(list.map((a) => [a.key, a]));
    active = [...$('#dkeys').querySelectorAll('.spr')].map((el) => {
      const a = byKey.get(el.dataset.key);
      return { el, seq: sequenceFor(a), fps: a.frameRate || 8, w: parseFloat(el.style.width), last: -1 };
    });
    history.replaceState(null, '', '#group=' + encodeURIComponent(g.id));
    const dlg = $('#dlg');
    if (!dlg.open) dlg.showModal();
    const firstHit = $('#dkeys .k.hit'); if (firstHit) firstHit.scrollIntoView({block: 'nearest'});
  }

  $('#dclose').onclick = () => $('#dlg').close();
  $('#dlg').addEventListener('close', () => { active = []; history.replaceState(null, '', location.pathname + location.search); });
  $('#dlg').addEventListener('click', (e) => { if (e.target === $('#dlg')) $('#dlg').close(); });
  let qTimer = 0;
  $('#q').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { query = e.target.value.trim(); renderGrid(); }, 80); });

  loadIndex().then((idx) => {
    INDEX = idx;
    for (const a of INDEX.assets) {
      const id = a.category + '/' + a.group;
      if (!assetsByGroup.has(id)) assetsByGroup.set(id, []);
      assetsByGroup.get(id).push(a);
    }
    const c = INDEX.counts;
    $('#stats').textContent = `${c.total} assets · ${INDEX.groups.length} groups · data: ${source}`;
    renderFilters(); renderGrid();
    requestAnimationFrame(tick);
    const m = location.hash.match(/group=([^&]+)/);
    if (m) openGroup(decodeURIComponent(m[1]));
  });
})();
</script>
</body>
</html>
'''


def build_catalog_html(index):
    inline = json.dumps(index, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    html = HTML_TEMPLATE.replace('__INLINE_INDEX__', inline)
    html = html.replace('__CAT_TITLES__', json.dumps(CATEGORY_TITLES))
    return html

# --------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true', help='validate only; exit 1 if generated files are stale or invalid')
    ap.add_argument('--previews', action='store_true', help='build missing preview.gif files (needs Pillow)')
    ap.add_argument('--force-previews', action='store_true', help='with --previews: rebuild all generated preview GIFs')
    args = ap.parse_args()

    problems = Problems()
    groups, assets = load_library(problems)
    if args.previews and not args.check:
        made = build_previews(groups, assets, force=args.force_previews)
        for p, sz in made:
            print(f'  preview {p} ({sz // 1024} KB)')
        problems = Problems()
        groups, assets = load_library(problems)  # re-validate with the new previews

    index = build_index(groups, assets)
    outputs = {
        INDEX_REL: json.dumps(index, ensure_ascii=False, indent=2) + '\n',
        CATALOG_MD_REL: build_catalog_md(groups, assets, index),
        CATALOG_HTML_REL: build_catalog_html(index),
    }
    for w in problems.warnings:
        print('WARN ', w)
    for e in problems.errors:
        print('ERROR', e)
    print(f"{len(assets)} assets in {len(groups)} groups: " +
          ', '.join(f"{c} {v['assets']}" for c, v in index['counts']['byCategory'].items()))
    if args.check:
        stale = [rel for rel, text in outputs.items()
                 if not os.path.isfile(abspath(rel)) or open(abspath(rel), encoding='utf-8').read() != text]
        for rel in stale:
            print('STALE', rel)
        sys.exit(1 if problems.errors or stale else 0)
    if problems.errors:
        sys.exit(f'{len(problems.errors)} error(s); outputs not written')
    for rel, text in outputs.items():
        with open(abspath(rel), 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        print(f'  wrote {rel} ({len(text.encode()) // 1024} KB)')


if __name__ == '__main__':
    main()
