#!/usr/bin/env python3
"""BERX SKIN INVENTORY — default weapon images + category silhouette icons.

Source: Nereziel/cs2-WeaponPaints website/img/skins (Valve default weapon renders), pinned commit below.
No AI-generated imagery: defaults are the original renders resized to WebP; category icons are the
alpha-channel silhouettes of those same renders.

  git clone https://github.com/Nereziel/cs2-WeaponPaints wp && git -C wp checkout 3b2eb5f96db976ff2b1def91debbc2f399859867
  python3 tools/build-weapon-assets.py wp/website/img/skins

Output: assets/weapons/<weapon_name>.webp (320x240), assets/weapons/{gloves,agent}.webp (muted silhouettes),
        assets/weapons/icons/<category>.png (white mask, 64px high)
"""
import json, os, sys
from PIL import Image

PIN = '3b2eb5f96db976ff2b1def91debbc2f399859867'
SRC = sys.argv[1] if len(sys.argv) > 1 else 'wp/website/img/skins'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'weapons')
os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
cat = json.load(open(os.path.join(ROOT, 'assets', 'data', 'skins-catalog.json')))

def rgba(path):
    im = Image.open(path)
    return im.convert('RGBA')

def to_webp(src, dst, size=(320, 240)):
    im = rgba(src)
    im.thumbnail(size, Image.LANCZOS)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.paste(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
    canvas.save(dst, 'WEBP', quality=82, method=6)

def silhouette(src, color, size=None, height=None):
    im = rgba(src)
    a = im.getchannel('A').point(lambda v: 255 if v > 24 else 0)
    box = a.getbbox(); a = a.crop(box)
    sil = Image.new('RGBA', a.size, color); sil.putalpha(a)
    if height:
        w = max(1, round(a.width * height / a.height)); sil = sil.resize((w, height), Image.LANCZOS)
    if size:
        sil.thumbnail(size, Image.LANCZOS)
        canvas = Image.new('RGBA', size, (0, 0, 0, 0)); canvas.paste(sil, ((size[0] - sil.width) // 2, (size[1] - sil.height) // 2)); sil = canvas
    return sil

made, missing = [], []
names = [w['w'] for w in cat['weapons'] if w['c'] != 'gloves'] + ['weapon_knife']
for n in names:
    src = os.path.join(SRC, n + '.png')
    if not os.path.exists(src): missing.append(n); continue
    to_webp(src, os.path.join(OUT, n + '.webp')); made.append(n)
# Gloves / Agent: default render-ийн silhouette (сонголтгүй үед "muted" дүрс)
silhouette(os.path.join(SRC, 'sporty_gloves-10018.png'), (120, 124, 132, 255), size=(320, 240)).save(os.path.join(OUT, 'gloves.webp'), 'WEBP', quality=85, method=6)
silhouette(os.path.join(SRC, 'agent-4613.png'), (120, 124, 132, 255), size=(320, 240)).save(os.path.join(OUT, 'agent.webp'), 'WEBP', quality=85, method=6)
ICONS = { 'rifles': 'weapon_ak47.png', 'snipers': 'weapon_awp.png', 'pistols': 'weapon_deagle.png', 'smgs': 'weapon_p90.png',
          'heavy': 'weapon_nova.png', 'knives': 'weapon_knife_karambit.png', 'gloves': 'sporty_gloves-10018.png', 'agents': 'agent-4613.png' }
for k, f in ICONS.items():
    silhouette(os.path.join(SRC, f), (255, 255, 255, 255), height=64).save(os.path.join(OUT, 'icons', k + '.png'), optimize=True)
print(f'{len(made)} default images, missing: {missing}, icons: {len(ICONS)} (WeaponPaints {PIN[:7]})')
if missing: sys.exit(1)
