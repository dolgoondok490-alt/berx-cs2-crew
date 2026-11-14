#!/usr/bin/env python3
"""
BERX SKIN INVENTORY — item catalog builder.

Sources (pinned, re-run to update):
  1) WeaponPaints build-472 (commit 3b2eb5f9): website/data/{skins,gloves,agents}_en.json
     -> exact weapon_defindex / paint / knife names / agent models the plugin understands.
  2) ByMykel/CSGO-API (commit 4827888): public/api/en/{skins,agents}.json
     -> rarity, float range, StatTrak availability, category, Steam CDN image.
Every WeaponPaints item must match a ByMykel entry by (defindex, paint) / model, otherwise the build fails.

usage: build-skins-catalog.py <weaponpaints-repo> <csgo-api-repo> <out.json>
"""
import json, sys, os

WP, API, OUT = sys.argv[1:4]
CDN = 'https://community.akamai.steamstatic.com/economy/image/'
SNIPERS = {'weapon_awp', 'weapon_ssg08', 'weapon_scar20', 'weapon_g3sg1'}
CAT = {'Pistols': 'pistols', 'Rifles': 'rifles', 'SMGs': 'smgs', 'Heavy': 'heavy', 'Knives': 'knives', 'Gloves': 'gloves', 'Equipment': 'heavy'}

def load(p): return json.load(open(p, encoding='utf-8'))
wp_skins = load(os.path.join(WP, 'website/data/skins_en.json'))
wp_gloves = load(os.path.join(WP, 'website/data/gloves_en.json'))
wp_agents = load(os.path.join(WP, 'website/data/agents_en.json'))
api_skins = load(os.path.join(API, 'public/api/en/skins.json'))
api_agents = load(os.path.join(API, 'public/api/en/agents.json'))

by_key = {}
for s in api_skins:
    w = s.get('weapon') or {}
    if s.get('paint_index') is not None and w.get('weapon_id') is not None:
        by_key[(int(w['weapon_id']), str(s['paint_index']))] = s
weapon_names = {int((s.get('weapon') or {}).get('weapon_id', -1)): s['weapon']['name'] for s in api_skins if s.get('weapon')}
weapon_cat = {int((s.get('weapon') or {}).get('weapon_id', -1)): s['category']['name'] for s in api_skins if s.get('weapon') and s.get('category')}

def img(u):
    u = u or ''
    return u[len(CDN):] if u.startswith(CDN) else u

def skin_name(full):
    return full.split('|', 1)[1].strip() if '|' in full else full.replace('★', '').strip()

items, weapons, missing = [], {}, []
for s in wp_skins:
    d, p, w = int(s['weapon_defindex']), str(s['paint']), s['weapon_name']
    cat = CAT.get(weapon_cat.get(d, ''), None)
    if cat is None: missing.append(('category', w)); continue
    if w in SNIPERS: cat = 'snipers'
    wn = weapon_names.get(d, w)
    weapons[d] = {'d': d, 'w': w, 'wn': wn, 'c': cat}
    if p == '0':
        if cat == 'knives':   # vanilla knife model
            items.append({'id': f'{d}-0', 'k': 'knife', 'd': d, 'w': w, 'wn': wn, 'p': 0, 'n': 'Vanilla', 'c': cat,
                          'r': 'Covert', 'rc': '#eb4b4b', 'i': s.get('image', ''), 'f': [0, 1], 'st': 1})
        continue
    a = by_key.get((d, p))
    if not a: missing.append(('skin', d, p, s['paint_name'])); continue
    items.append({'id': f'{d}-{p}', 'k': 'knife' if cat == 'knives' else 'weapon', 'd': d, 'w': w, 'wn': wn, 'p': int(p),
                  'n': skin_name(a['name']), 'c': cat, 'r': a['rarity']['name'], 'rc': a['rarity']['color'], 'i': img(a.get('image')),
                  'f': [a.get('min_float') if a.get('min_float') is not None else 0, a.get('max_float') if a.get('max_float') is not None else 1],
                  'st': 1 if a.get('stattrak') else 0})

for g in wp_gloves:
    d, p = int(g['weapon_defindex']), str(g['paint'])
    if p == '0': continue
    a = by_key.get((d, p))
    if not a: missing.append(('glove', d, p)); continue
    weapons[d] = {'d': d, 'w': a['weapon']['id'], 'wn': a['weapon']['name'], 'c': 'gloves'}
    items.append({'id': f'{d}-{p}', 'k': 'gloves', 'd': d, 'w': a['weapon']['id'], 'wn': a['weapon']['name'], 'p': int(p), 'n': skin_name(a['name']),
                  'c': 'gloves', 'r': a['rarity']['name'], 'rc': a['rarity']['color'], 'i': img(a.get('image')),
                  'f': [a.get('min_float') or 0, a.get('max_float') if a.get('max_float') is not None else 1], 'st': 0})

ag = {x['model_player'].replace('agents/models/', '').replace('.vmdl', ''): x for x in api_agents if x.get('model_player')}
for a in wp_agents:
    m = a['model']
    if m in ('null', '', None): continue
    x = ag.get(m)
    if not x: missing.append(('agent', m)); continue
    items.append({'id': 'a-' + m, 'k': 'agent', 'm': m, 't': int(a['team']), 'n': x['name'].split('|')[0].strip(),
                  'wn': (x['name'].split('|')[1].strip() if '|' in x['name'] else ('CT' if a['team'] == 3 else 'T')),
                  'c': 'agents', 'r': x['rarity']['name'], 'rc': x['rarity']['color'], 'i': img(x.get('image'))})

if missing:
    print('UNMATCHED:', missing[:20], file=sys.stderr); sys.exit(1)

RARITY = ['Consumer Grade', 'Industrial Grade', 'Mil-Spec Grade', 'Restricted', 'Classified', 'Covert', 'Contraband',
          'Distinguished', 'Exceptional', 'Superior', 'Master', 'Extraordinary']
out = {
    'meta': {'source': 'WeaponPaints build-472 (3b2eb5f9) + ByMykel/CSGO-API (4827888)', 'plugin': 'build-472', 'cdn': CDN,
             'categories': ['pistols', 'rifles', 'smgs', 'heavy', 'snipers', 'knives', 'gloves', 'agents'],
             'rarityOrder': RARITY, 'seedMax': 1000},
    'weapons': sorted(weapons.values(), key=lambda x: (x['c'], x['wn'])),
    'items': items,
}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print('items', len(items), Counter(i['c'] for i in items), 'weapons', len(weapons), 'bytes', os.path.getsize(OUT))
