#!/usr/bin/env python3
"""
art/sheet/concept-sheet.webp（アセット一覧の1枚絵）から各素材を切り出し、WebP化して src/assets/img/ に出力する。
  python3 scripts/build-assets.py        (要 Pillow / numpy / scipy: pip install pillow numpy scipy)

- キャラ・敵: 透過情報から連結成分で抽出（隣の絵に食い込まない）。足元を画像下端に揃え、2倍に拡大して保存
- アイコン: 格子状に並ぶ枠を切り出し、角丸マスクを適用
- 背景: 小さなサムネイルを16:9に切り出して拡大し、軽いぼかし+粒状ノイズで拡大の粗さを目立たなくする
- 宝箱/焚き火: パネルの暗い背景を色キーで透過
- 出力サイズは src/assets/img/manifest.json に記録。確認用の一覧は art/preview.png
元画像の解像度が低いため、高解像度の素材が用意できたらこのスクリプトを置き換える（キー名は assetMap.ts と対応）。
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, 'art', 'sheet', 'concept-sheet.webp')
OUT = os.path.join(ROOT, 'src', 'assets', 'img')
sheet = Image.open(SHEET).convert('RGBA')
A = np.array(sheet)
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith('.webp'):
        os.remove(os.path.join(OUT, f))

manifest = {}
preview = []  # (key, image)


def save(key, im, quality=90):
    path = os.path.join(OUT, key + '.webp')
    im.save(path, 'WEBP', quality=quality, alpha_quality=95, method=6)
    manifest[key] = {'w': im.width, 'h': im.height}
    preview.append((key, im))


# ------------------------------------------------------------ キャラ・敵（連結成分）
Y0, Y1 = 45, 221
band = A[Y0:Y1, :, 3] > 40
lab, n = ndi.label(band, structure=np.ones((3, 3)))
comps = []
for i, sl in enumerate(ndi.find_objects(lab), 1):
    area = int((lab[sl] == i).sum())
    if area >= 250:
        comps.append({'id': i, 'x0': sl[1].start, 'x1': sl[1].stop, 'y0': sl[0].start + Y0, 'y1': sl[0].stop + Y0, 'area': area})
comps.sort(key=lambda c: c['x0'])


def sprite_from_mask(mask_full, pad=2, scale=2):
    ys, xs = np.where(mask_full)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = A.copy()
    rgba[..., 3] = np.where(mask_full, A[..., 3], 0)
    im = Image.fromarray(rgba).crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))
    im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    return im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))


def comp_mask(c):
    m = np.zeros(A.shape[:2], bool)
    m[Y0:Y1] = lab == c['id']
    return m


# 期待する並び: knight_idle, [knight_attack+knight_hit(連結)], knight_down, mage_idle, mage_attack, mage_hit, mage_down,
#               slime, bat, skeleton, golem, dragon  (= 12成分)
assert len(comps) == 12, f'スプライト成分数が想定と違います: {len(comps)}'
names = ['knight_idle', None, 'knight_down', 'mage_idle', 'mage_attack', 'mage_hit', 'mage_down',
         'slime', 'bat', 'skeleton', 'golem', 'dragon']
for c, name in zip(comps, names):
    if name is None:
        # 連結した攻撃/被弾ポーズを、列のアルファ量が最小の位置で左右に分割
        m = comp_mask(c)
        cols = m.sum(axis=0)
        lo, hi = 170, 200
        split = lo + int(np.argmin(cols[lo:hi]))
        left, right = m.copy(), m.copy()
        left[:, split:] = False
        right[:, :split] = False
        save('char_knight_attack', sprite_from_mask(left))
        save('char_knight_hit', sprite_from_mask(right))
        continue
    role, _, pose = name.partition('_')
    if role in ('knight', 'mage'):
        key = f"char_{'elementalist' if role == 'mage' else 'knight'}_{pose}"
    else:
        key = f'enemy_{name}'
    save(key, sprite_from_mask(comp_mask(c)))


# ------------------------------------------------------------ アイコン（格子）
def icon(box, size, radius=7):
    x, y, w, h = box
    im = sheet.crop((x, y, x + w, y + h)).convert('RGBA')
    im = im.resize((size, size), Image.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=max(2, int(radius * size / 48)), fill=255)
    im.putalpha(mask)
    return im


def icon_narrow(box, size, radius=7):
    """元画像で幅が細い列(スキルの右端)を、ぼかし背景に重ねて正方形のアイコンにする"""
    x, y, w, h = box
    tile = sheet.crop((x, y, x + w, y + h)).convert('RGBA')
    bg = tile.resize((size, size), Image.BICUBIC).filter(ImageFilter.GaussianBlur(size * 0.18))
    fg = tile.resize((round(w * size / h), size), Image.LANCZOS)
    bg.paste(fg, ((size - fg.width) // 2, 0), fg)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=max(2, int(radius * size / 48)), fill=255)
    bg.putalpha(mask)
    return bg


EQ_X, EQ_Y, EQ_W, EQ_H = [21, 75, 130, 185, 239], [528, 586, 644], 47, 50
SK_X = [315, 369, 424, 478, 528]
GRID_EQ = lambda r, c: (EQ_X[c], EQ_Y[r], EQ_W, EQ_H)
GRID_SK = lambda r, c: (SK_X[c], EQ_Y[r], EQ_W, EQ_H)

# 装備: 部位×レア度（common=左端の灰, rare=紫, legendary=金）と竜のツメ
for r, slot in enumerate(['weapon', 'armor', 'accessory']):
    for col, rarity in [(0, 'common'), (2, 'rare'), (4, 'legendary')]:
        save(f'icon_equip_{slot}_{rarity}', icon(GRID_EQ(r, col), 128))
save('icon_equip_dragon_claw', icon(GRID_EQ(0, 3), 128))

# スキル（スキルID → 格子の位置。足りない分は同系統を流用）
SKILL_CELL = {
    'slash': (1, 1), 'shield_bash': (2, 0), 'provoke': (1, 3), 'guardian': (1, 0),
    'firebolt': (0, 1), 'ice_lance': (0, 4), 'thunder': (1, 2), 'heal': (2, 3),
    'cleave': (2, 4), 'sword_guard': (0, 0), 'dragon_slash': (0, 3), 'holy_strike': (2, 1),
    'blizzard': (0, 2), 'inferno': (0, 1), 'meteor': (0, 1), 'thunderstorm': (1, 4),
}
for sid, (r, c) in SKILL_CELL.items():
    if c == 4:  # 右端の列は元画像で幅が細い(約31px)
        save(f'icon_skill_{sid}', icon_narrow((SK_X[4], EQ_Y[r], 31, EQ_H), 96))
    else:
        save(f'icon_skill_{sid}', icon(GRID_SK(r, c), 96))

# 属性 / 状態 / ノード
for key, cx, cy in [('fire', 604, 550), ('ice', 652, 550), ('thunder', 693, 550), ('none', 733, 550)]:
    save(f'icon_element_{key}', icon((cx - 20, cy - 20, 40, 40), 48))
ST = [('intent_attack', 793, 546), ('intent_attack_all', 842, 546), ('guard', 892, 546), ('shield_gauge', 941, 546),
      ('break', 793, 606), ('gold', 842, 606), ('heal', 892, 606), ('potion', 941, 606)]
for key, cx, cy in ST:
    save(f'icon_status_{key}', icon((cx - 21, cy - 21, 42, 42), 64))
NODES = [('battle', 990, 533, 47, 49), ('chest', 1056, 533, 49, 49), ('rest', 1124, 533, 48, 49),
         ('shop', 992, 617, 50, 50), ('boss', 1065, 616, 54, 55), ('visited', 991, 697, 31, 25), ('current', 1092, 697, 23, 25)]
for key, x, y, w, h in NODES:
    size = 192 if key == 'boss' else 96
    save(f'icon_node_{key}', icon((x, y, w, h), size, radius=9))


# ------------------------------------------------------------ 背景（サムネイル→16:9→拡大）
def background(box, yoff, key, blur=1.6):
    x, y, w, h = box
    x, y, w, h = x + 5, y + 4, w - 10, h - 8  # サムネイルの枠線が写り込まないよう内側へ
    ch = round(w * 9 / 16)
    crop = sheet.crop((x, y + yoff, x + w, y + yoff + ch)).convert('RGB')
    big = crop.resize((1280, 720), Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur))
    arr = np.array(big).astype(np.int16)
    rng = np.random.default_rng(7)
    arr += rng.integers(-5, 6, size=arr.shape[:2] + (1,))  # 粒状ノイズで拡大の面の粗さをごまかす
    save(key, Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)), quality=82)


background((16, 264, 214, 181), 50, 'bg_battle_dungeon')   # 夜の遺跡
background((237, 264, 212, 181), 50, 'bg_battle_boss')      # 火山
background((456, 264, 212, 181), 40, 'bg_battle_crypt')     # 城内
background((677, 264, 203, 181), 30, 'bg_map')              # 世界地図
background((891, 264, 202, 181), 30, 'bg_base')             # 都市
background((1103, 264, 208, 181), 0, 'bg_title')            # キーアート（ロゴより上の部分）


# ------------------------------------------------------------ 小物: 色キーで透過
def key_out(im, bg=(14, 30, 50), lo=26, hi=70):
    a = np.array(im.convert('RGB')).astype(float)
    d = np.sqrt(((a - np.array(bg)) ** 2).sum(axis=2))
    alpha = np.clip((d - lo) / (hi - lo), 0, 1)
    out = np.dstack([a, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def prop(box, key, scale=3):
    x, y, w, h = box
    im = key_out(sheet.crop((x, y, x + w, y + h)))
    bbox = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    save(key, im.filter(ImageFilter.UnsharpMask(radius=1.5, percent=50, threshold=3)))


prop((936, 798, 54, 50), 'prop_chest_closed')
prop((990, 794, 58, 54), 'prop_chest_open')
prop((1054, 798, 37, 48), 'prop_campfire_1')
prop((1091, 798, 32, 46), 'prop_campfire_2')
prop((1125, 794, 44, 52), 'prop_campfire_3')


# ------------------------------------------------------------ カットイン絵（縁をぼかして馴染ませる）
def bust(box, key, max_side=800):
    x, y, w, h = box
    im = sheet.crop((x, y, x + w, y + h)).convert('RGBA')
    im = im.resize((round(w * 4), round(h * 4)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=2))
    yy, xx = np.mgrid[0:im.height, 0:im.width]
    fx = np.minimum(xx, im.width - 1 - xx) / (im.width * 0.22)
    fy = np.minimum(yy, im.height - 1 - yy) / (im.height * 0.16)
    a = np.clip(np.minimum(fx, fy), 0, 1)
    a = np.where(yy > im.height * 0.84, 1.0, a) if False else a
    im.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    save(key, im)


bust((522, 771, 164, 184), 'cutin_elementalist_bust')

json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)

# 確認用プレビュー（市松模様の上に並べる）
cell = 150
cols = 14
rows = (len(preview) + cols - 1) // cols
P = Image.new('RGB', (cols * cell, rows * (cell + 14)), (24, 24, 28))
d = ImageDraw.Draw(P)
for i, (k, im) in enumerate(preview):
    t = im.copy()
    t.thumbnail((cell - 6, cell - 6))
    chk = Image.new('RGB', t.size, (70, 72, 84))
    cd = ImageDraw.Draw(chk)
    for yy in range(0, t.height, 10):
        for xx in range(0, t.width, 10):
            if (xx // 10 + yy // 10) % 2:
                cd.rectangle([xx, yy, xx + 9, yy + 9], fill=(104, 106, 120))
    chk.paste(t, (0, 0), t.convert('RGBA'))
    x, y = (i % cols) * cell + 3, (i // cols) * (cell + 14) + 3
    P.paste(chk, (x, y))
    d.text((x, y + cell - 2), k.replace('icon_', '')[:22], fill=(255, 255, 0))
P.save(os.path.join(ROOT, 'art', 'preview.png'))
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.webp'))
print(f'{len(manifest)} files -> src/assets/img  total {tot / 1048576:.2f} MB')
