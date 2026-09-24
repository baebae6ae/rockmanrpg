#!/usr/bin/env python3
"""아홉 대원 스프라이트를 원본(assets/raw) 시트에서 다시 뽑는다.

처음 추출은 줄마다 같은 간격으로 잘랐는데, AI 로 만든 원본 시트는 프레임
간격이 일정하지 않아서 칸마다 캐릭터가 좌우로 밀렸다(걷기에서 머리가
12px 가까이 흔들렸다). 여기서는:

  1. 캐릭터 덩어리를 2D 로 검출해 가장 가까운 줄 이름표에 배정한다 —
     줄 간격이 좁아 위아래 줄이 겹치는 시트도 섞이지 않는다.
  2. 무기가 아니라 머리·가슴 중심을 기준으로 정렬한다 — 팔을 뻗어도
     몸통이 밀리지 않는다.
  3. 고해상도 원본을 캐릭터마다 다른 비율로 줄여 아홉 명의 키를 같게
     맞춘다. 완성된 도트를 늘리는 게 아니라 원본에서 줄이므로 안 뭉개진다.
  4. 캐릭터 하나에 팔레트 하나 — 프레임마다 명암이 흔들리지 않는다.
  5. 발 뒤 먼지 구름, 몸에서 떨어진 이펙트 조각을 지운다.

    python3 tools/reextract_crew.py            # 아홉 명 전부
    python3 tools/reextract_crew.py nail bell  # 일부만
"""
from __future__ import annotations

import glob
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TARGET_H = 54   # 대기 자세 기준 키(px)
BASE_REV = '5404b73'
CANVAS_H = 68
MAX_SHEET_W = 2048

# 원본 파일(촬영 시각으로 구분) → 대원, 그리고 이름표 순서대로의 줄 이름.
# title: 맨 위 첫 이름표가 줄이 아니라 캐릭터 이름 제목인 시트
CREW = {
    'nail':    ('12_08_50', True,  ['idle', 'walk', 'jump', 'fall', 'dash', 'attack', 'hurt']),
    'bell':    ('12_21_52', False, ['idle', 'walk', 'jump', 'fall', 'dash', 'attack', 'hurt']),
    'ember':   ('12_25_01', False, ['idle', 'walk', 'jump', 'fall', 'dash', 'attack', 'hurt']),
    'chain':   ('11_18_14', False, ['idle', 'walk', 'run', 'jump', 'fall', 'dash', 'attack', 'attack2', 'hurt']),
    'firefly': ('12_04_37', False, ['idle', 'walk', 'run', 'jump', 'fall', 'dash', 'attack', 'attack2', 'attack3', 'hurt']),
    'axe':     ('12_11_24', False, ['idle', 'walk', 'run', 'jump', 'fall', 'dash', 'attack', 'attack2', 'attack3', 'hurt']),
    'needle':  ('12_12_53', False, ['idle', 'walk', 'jump', 'fall', 'dash', 'attack', 'attack2', 'hurt']),
    'mirror':  ('12_13_13', False, ['idle', 'walk', 'jump', 'fall', 'dash', 'attack', 'hurt']),
    'harpoon': ('12_13_52', False, ['idle', 'walk', 'run', 'jump', 'fall', 'dash', 'attack', 'attack2', 'attack3', 'hurt']),
}
# 원본 한 줄에 몇 프레임인지 이름표에 적혀 있는 시트 — 프레임끼리 붙어서
# 덩어리 검출로는 갈라지지 않을 때 이 수만큼 쪼갠다
EXPECT = {'needle': 8}
# 원본 그림 자체가 문제라 사람이 보고 뺀 프레임 (정리를 거친 뒤의 순번).
#   chain  공격 6 · 피격 3,5,6 — 사슬 이펙트만 그려진 칸
#   needle 걷기 0~2 — 여덟 칸 중 앞 세 칸만 창을 들고 있어 루프마다 창이
#          생겼다 사라진다. 창 없는 다섯 칸으로 통일한다.
#          공격 3,6,8,10 — 초승달 검기 칸
DROP = {
    'chain': {'attack': [6], 'hurt': [3, 5, 6]},
    'needle': {'walk': [0, 1, 2], 'attack': [3, 6, 8, 10]},
}


def raw_path(key: str) -> str:
    for f in glob.glob(str(ROOT / 'assets/raw/ChatGPT*.png')):
        if f[-12:-4] == key:
            return f
    raise SystemExit(f'원본 시트를 못 찾았다: {key}')


# ------------------------------------------------------------ 기본 도구

def runs(v, thr, gap=0):
    out: list[tuple[int, int]] = []
    s = None
    for i, x in enumerate(v):
        if x > thr:
            if s is None:
                s = out.pop()[0] if out and i - out[-1][1] <= gap else i
        elif s is not None:
            out.append((s, i))
            s = None
    if s is not None:
        out.append((s, len(v)))
    return out


def components(mask: np.ndarray):
    """8방향 연결 성분. (라벨 배열, 성분별 크기) — 0번은 배경"""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    sizes = [0]
    n = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        stack = [(y0, x0)]
        c = 0
        while stack:
            y, x = stack.pop()
            c += 1
            for dy in (-1, 0, 1):
                yy = y + dy
                if yy < 0 or yy >= h:
                    continue
                for dx in (-1, 0, 1):
                    xx = x + dx
                    if 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n
                        stack.append((yy, xx))
        sizes.append(c)
    return lab, sizes


def dilate(m: np.ndarray, r: int) -> np.ndarray:
    out = m.copy()
    for _ in range(r):
        o = out.copy()
        o[1:] |= out[:-1]; o[:-1] |= out[1:]
        o[:, 1:] |= out[:, :-1]; o[:, :-1] |= out[:, 1:]
        out = o
    return out


# ------------------------------------------------------------ 원본에서 프레임 찾기

def label_boxes(A: np.ndarray):
    """왼쪽 끝 이름표 상자들 — (위, 아래, 오른쪽 끝)"""
    out = []
    for a, b in runs(A[:, 0:40].sum(axis=1), 5):
        if b - a <= 12:
            continue
        cols = runs(A[a:b, 0:300].sum(axis=0), 0, gap=3)
        out.append((a, b, cols[0][1]))
    return out


def find_frames(rgba: np.ndarray, title: bool, rows: list[str], expect: int | None):
    A = rgba[:, :, 3] > 200
    boxes = label_boxes(A)
    title_box = boxes[0] if title else None
    if title:
        boxes = boxes[1:]
    row_boxes = boxes[:len(rows)]
    effects_top = boxes[len(rows)][0] if len(boxes) > len(rows) else A.shape[0]
    label_right = max(b[2] for b in row_boxes) + 4
    centers = [(a + b) / 2 for a, b, _ in row_boxes]
    spacing = float(np.median(np.diff(centers)))

    M = A.copy()
    M[:, :label_right] = False
    M[effects_top - 4:] = False
    if title_box:
        # 캐릭터 이름 제목 상자 — 첫 대기 프레임에 글자 조각이 붙어 나왔다
        M[:title_box[1] + 3, :title_box[2] + 12] = False
    # 반 해상도에서 덩어리를 묶는다 — 머리카락 끝처럼 살짝 떨어진 조각도
    # 한 몸으로 붙게 조금 부풀려서 센다
    h2, w2 = M.shape[0] // 2, M.shape[1] // 2
    m2 = M[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).any(axis=(1, 3))
    lab2, sizes = components(dilate(m2, 1))
    comps = []
    for i in range(1, len(sizes)):
        ys, xs = np.nonzero(lab2 == i)
        if len(ys) < 40:
            continue
        comps.append({'id': i, 'x0': xs.min() * 2, 'x1': xs.max() * 2 + 2,
                      'y0': ys.min() * 2, 'y1': ys.max() * 2 + 2, 'n': len(ys)})
    heights = sorted(c['y1'] - c['y0'] for c in comps if c['n'] > 300)
    typical_h = heights[len(heights) // 2]
    by_row: dict[str, list[dict]] = {r: [] for r in rows}
    for c in comps:
        if c['y1'] - c['y0'] > typical_h * 1.8:
            continue  # 오른쪽 큰 초상화 같은 것
        cy = (c['y0'] + c['y1']) / 2
        d = [abs(cy - cc) for cc in centers]
        ri = int(np.argmin(d))
        if d[ri] > spacing * 0.75:
            continue
        by_row[rows[ri]].append(c)

    frames: dict[str, list[np.ndarray]] = {}
    lab_full = np.kron(lab2, np.ones((2, 2), np.int32))
    lab_full = np.pad(lab_full, ((0, M.shape[0] - lab_full.shape[0]), (0, M.shape[1] - lab_full.shape[1])))
    for r, cs in by_row.items():
        if not cs:
            continue
        big = [c for c in cs if c['n'] > max(c2['n'] for c2 in cs) * 0.15]
        small = [c for c in cs if c not in big]
        groups = [[c] for c in sorted(big, key=lambda c: c['x0'])]
        # 몸에서 떨어진 작은 조각은 가로로 겹치는 프레임에 붙인다
        for c in small:
            cx = (c['x0'] + c['x1']) / 2
            best = min(groups, key=lambda g: abs(cx - (min(k['x0'] for k in g) + max(k['x1'] for k in g)) / 2))
            gx0 = min(k['x0'] for k in best); gx1 = max(k['x1'] for k in best)
            if gx0 - 6 <= cx <= gx1 + 6:
                best.append(c)
        out = []
        for g in groups:
            ids = [c['id'] for c in g]
            x0 = min(c['x0'] for c in g); x1 = max(c['x1'] for c in g)
            y0 = min(c['y0'] for c in g); y1 = max(c['y1'] for c in g)
            sel = np.isin(lab_full[y0:y1, x0:x1], ids) & (rgba[y0:y1, x0:x1, 3] > 150)
            crop = rgba[y0:y1, x0:x1].copy()
            crop[:, :, 3] = np.where(sel, 255, 0)
            out.extend(split_merged(crop, expect, typical_h) if expect else [crop])
        frames[r] = [trim(f) for f in out if (f[:, :, 3] > 0).sum() > 200]
    return frames


def split_merged(crop: np.ndarray, expect: int | None, typical_h: int):
    """붙어 있는 여러 프레임을 한 덩어리로 잡았을 때 쪼갠다"""
    w = crop.shape[1]
    unit = typical_h * 0.95
    n = int(round(w / unit)) if w > unit * 1.55 else 1
    if n <= 1:
        return [crop]
    dens = (crop[:, :, 3] > 0).sum(axis=0).astype(float)
    cuts = []
    for k in range(1, n):
        c = int(w * k / n)
        lo, hi = max(1, c - int(unit * 0.3)), min(w - 1, c + int(unit * 0.3))
        cuts.append(lo + int(np.argmin(dens[lo:hi])))
    edges = [0] + cuts + [w]
    return [crop[:, edges[i]:edges[i + 1]] for i in range(n)]


def trim(f: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(f[:, :, 3] > 0)
    return f[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


# ------------------------------------------------------------ 정리

def downscale(img: np.ndarray, k: float) -> np.ndarray:
    h, w = img.shape[:2]
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    rgb = img[:, :, :3].astype(np.float32)
    a = img[:, :, 3:4].astype(np.float32) / 255
    pre = np.concatenate([rgb * a, a * 255], axis=2).clip(0, 255).astype(np.uint8)
    small = np.array(Image.fromarray(pre, 'RGBA').resize((nw, nh), Image.BOX)).astype(np.float32)
    al = small[:, :, 3:4] / 255
    rgb = np.where(al > 0, small[:, :, :3] / np.maximum(al, 1e-6), 0)
    return np.concatenate([rgb.clip(0, 255), np.where(al >= 0.5, 255, 0)], axis=2).astype(np.uint8)


def anchor_x(img: np.ndarray) -> float:
    """머리·가슴(위쪽 45%)의 가로 중심 — 무기나 다리가 뻗어도 덜 흔들린다"""
    ys, xs = np.nonzero(img[:, :, 3] > 0)
    top, bot = ys.min(), ys.max()
    sel = ys <= top + (bot - top) * 0.45
    return float(xs[sel].mean())


def drop_fragments(img: np.ndarray, keep_ratio=0.04) -> np.ndarray:
    lab, sizes = components(img[:, :, 3] > 0)
    if len(sizes) <= 2:
        return img
    main = int(np.argmax(sizes))
    out = img.copy()
    for i, sz in enumerate(sizes):
        if i and i != main and sz < sizes[main] * keep_ratio:
            out[lab == i] = 0
    return out


def strip_dust(img: np.ndarray) -> np.ndarray:
    """발 뒤 먼지 구름 — 몸에 붙어 있어 성분으로는 못 뗀다. 발밑 띠에서
    몸 중심 뒤쪽의 밝은 베이지 덩어리만 지운다."""
    h = img.shape[0]
    ax = anchor_x(img)
    rgb = img[:, :, :3].astype(int)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    cand = (img[:, :, 3] > 0) & (r > 140) & (r >= g - 8) & (g >= b - 8) & (r - b > 15) & (r - b < 140) \
        & (np.abs(r - g) < 60)
    cand[: max(0, h - 16)] = False
    lab, sizes = components(cand)
    out = img.copy()
    for i, sz in enumerate(sizes):
        if i and sz >= 6:
            xs = np.nonzero(lab == i)[1]
            if (xs < ax - 6).mean() > 0.6:
                out[lab == i] = 0
    return out


def flood_outside(block: np.ndarray) -> np.ndarray:
    """block 을 벽으로 보고 가장자리에서 닿는 칸"""
    h, w = block.shape
    out = np.zeros_like(block)
    stack = [(y, x) for y in range(h) for x in (0, w - 1) if not block[y, x]]
    stack += [(y, x) for x in range(w) for y in (0, h - 1) if not block[y, x]]
    for y, x in stack:
        out[y, x] = True
    while stack:
        y, x = stack.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and not block[yy, xx] and not out[yy, xx]:
                out[yy, xx] = True
                stack.append((yy, xx))
    return out


def strip_fx(img: np.ndarray, R: int = 3, dark_lum: float = 70):
    """그림에 붙어 나온 이펙트(대시 속도선·검기·총구 섬광)를 지운다.

    캐릭터와 이펙트가 같은 색을 쓰는 대원이 많아(파란 몸에 파란 검기)
    색으로는 못 가른다. 대신 캐릭터는 검은 외곽선과 어두운 음영이 촘촘히
    있고, 이펙트는 외곽선 없이 밝게 빛난다는 차이를 쓴다 — 어두운 픽셀
    근처(R칸)만 몸으로 보고, 그 안에 갇힌 밝은 부분은 되살린다.
    (지운 결과, 지워진 비율)"""
    a = img[:, :, 3] > 0
    rgb = img[:, :, :3].astype(float)
    lum = rgb[:, :, 0] * 0.3 + rgb[:, :, 1] * 0.59 + rgb[:, :, 2] * 0.11
    near = dilate(a & (lum < dark_lum), R) & a
    lab, sizes = components(near)
    if len(sizes) <= 1:
        return img, 1.0
    main = max(sizes[1:])
    keep = np.isin(lab, [i for i, sz in enumerate(sizes) if i and sz >= main * 0.05])
    keep |= a & ~flood_outside(keep)
    out = img.copy()
    out[~keep] = 0
    return out, 1 - keep.sum() / max(1, a.sum())


def lock_palette(frames: dict[str, list[np.ndarray]]):
    ref = np.concatenate([f[f[:, :, 3] > 0][:, :3] for f in frames['idle']], axis=0)
    pal = Image.fromarray(ref.reshape(1, -1, 3), 'RGB').quantize(colors=48, method=Image.MAXCOVERAGE)

    def lock(f):
        q = Image.fromarray(f[:, :, :3], 'RGB').quantize(palette=pal, dither=Image.NONE).convert('RGB')
        return np.dstack([np.array(q), f[:, :, 3]])
    return {n: [lock(f) for f in fs] for n, fs in frames.items()}


def drop_outliers(fs: list[np.ndarray], thr: float = 0.72, keep: int = 5) -> list[np.ndarray]:
    """반복 동작에서 앞뒤 칸 어느 쪽과도 실루엣이 안 겹치는 칸을 뺀다 —
    원본이 그 칸만 다른 그림으로 그려서 루프마다 한 번씩 튀어 보인다"""
    fs = list(fs)
    while len(fs) > keep:
        cw = max(f.shape[1] for f in fs) + 4
        m = [place(f, cw, CANVAS_H)[:, :, 3] > 0 for f in fs]
        iou = lambda a, b: (a & b).sum() / max(1, (a | b).sum())
        n = len(m)
        sc = [max(iou(m[i], m[i - 1]), iou(m[i], m[(i + 1) % n])) for i in range(n)]
        worst = int(np.argmin(sc))
        if sc[worst] >= thr:
            break
        fs.pop(worst)
    return fs


def hue_shift(img: np.ndarray, lo: float, hi: float, deg: float) -> np.ndarray:
    """색상환에서 [lo, hi]도 대역(채도가 있는 칸만)을 deg 만큼 민다"""
    rgb = img[:, :, :3].astype(float) / 255
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    d = mx - mn
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rm = nz & (mx == r); gm = nz & (mx == g) & ~rm; bm = nz & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h *= 60
    sat = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    sel = (img[:, :, 3] > 0) & (h >= lo) & (h <= hi) & (sat > 0.12)
    h2 = (h + deg) % 360 / 60
    c = d; x = c * (1 - np.abs(h2 % 2 - 1)); m = mn
    k = np.floor(h2).astype(int) % 6
    table = [(c, x, 0 * c), (x, c, 0 * c), (0 * c, c, x), (0 * c, x, c), (x, 0 * c, c), (c, 0 * c, x)]
    out = rgb.copy()
    for i, (R, G, B) in enumerate(table):
        mk = sel & (k == i)
        out[:, :, 0][mk] = (R + m)[mk]; out[:, :, 1][mk] = (G + m)[mk]; out[:, :, 2][mk] = (B + m)[mk]
    res = img.copy()
    res[:, :, :3] = (out * 255).round().clip(0, 255).astype(np.uint8)
    return res


# 원본 삽화가 같은 청록 갑옷이라 게임에서 거의 같은 캐릭터로 보이던 둘 중
# 작살의 갑옷 대역만 파란 쪽으로 민다 (3eddecf 와 같은 조정 — 피부·금장식·
# 윤곽선은 그대로라 디자인은 안 바뀐다)
RECOLOR = {'harpoon': (115, 205, 40)}


def place(f: np.ndarray, cw: int, ch: int) -> np.ndarray:
    canvas = np.zeros((ch, cw, 4), np.uint8)
    h, w = f.shape[:2]
    x = int(round(cw / 2 - anchor_x(f)))
    y = ch - h
    sx0, sx1 = max(0, -x), min(w, cw - x)
    sy0 = max(0, -y)
    canvas[y + sy0:, x + sx0:x + sx1] = f[sy0:, sx0:sx1]
    return canvas


# ------------------------------------------------------------ 한 명 처리

def build(cid: str):
    key, title, rows = CREW[cid]
    rgba = np.array(Image.open(raw_path(key)).convert('RGBA'))
    raw = find_frames(rgba, title, rows, EXPECT.get(cid))
    idle_h = float(np.median([f.shape[0] for f in raw['idle']]))
    k = TARGET_H / idle_h
    fr = {n: [drop_fragments(strip_dust(drop_fragments(downscale(f, k)))) for f in fs] for n, fs in raw.items()}
    fr = {n: [trim(f) for f in fs] for n, fs in fr.items()}
    idle_w = float(np.median([f.shape[1] for f in fr['idle']]))
    # 캐릭터가 아니라 이펙트 조각(검기·잔상)만 잡힌 것은 버린다 — 대기 자세
    # 색과 거의 안 겹치거나 키가 턱없이 작은 것
    ref = np.concatenate([f[f[:, :, 3] > 0][:, :3] for f in fr['idle']]).astype(int)
    ref_q = set(map(tuple, (ref // 24).tolist()))

    def is_body(f):
        px = f[f[:, :, 3] > 0][:, :3].astype(int) // 24
        share = np.mean([tuple(p) in ref_q for p in px.tolist()])
        return share > 0.55 and f.shape[0] > TARGET_H * 0.4
    fr = {n: [f for f in fs if is_body(f)] for n, fs in fr.items()}

    idle_px = float(np.median([(f[:, :, 3] > 0).sum() for f in fr['idle']]))

    def pick(name, max_lost, need):
        """이펙트를 지우고, 이펙트가 대부분이던(=캐릭터가 아닌) 프레임은 뺀다"""
        res = []
        for i, f in enumerate(fr.get(name, [])):
            g, lost = strip_fx(f)
            g = drop_fragments(g, 0.08)
            n = (g[:, :, 3] > 0).sum()
            res.append((i, trim(g) if n else f, lost if n > idle_px * 0.4 else 1.0))
        good = [(i, g) for i, g, lost in res if lost <= max_lost]
        if len(good) < need:
            good = sorted([(i, g) for i, g, lost in sorted(res, key=lambda t: t[2])[:need]])
        return [g for _, g in good]

    out = {
        'idle': fr['idle'],
        'walk': fr['walk'],
        'dash': pick('dash', 0.35, 1),
        'attack': pick('attack', 0.3, 3),
        'hurt': pick('hurt', 0.3, 1),
    }
    for tag, idx in DROP.get(cid, {}).items():
        out[tag] = [f for i, f in enumerate(out[tag]) if i not in idx]
    out['idle'] = drop_outliers(out['idle'])
    out['walk'] = drop_outliers(out['walk'])
    # 대시는 짧게 스치는 동작이라 가운데 몇 장만 돌린다
    d = out['dash']
    if len(d) > 3:
        mid = len(d) // 2
        out['dash'] = d[mid - 1:mid + 2]
    out = lock_palette(out)
    if cid in RECOLOR:
        lo, hi, deg = RECOLOR[cid]
        out = {n: [hue_shift(f, lo, hi, deg) for f in fs] for n, fs in out.items()}
    return out, k, idle_w


def write(cid: str, fr: dict[str, list[np.ndarray]], prev_meta: dict):
    order = ['idle', 'walk', 'dash', 'attack', 'hurt']
    half = 0
    for n in order:
        for f in fr[n]:
            ax = anchor_x(f)
            half = max(half, ax + 1, f.shape[1] - ax + 1)
    cw = int(np.ceil(half)) * 2
    cells, tags, i = [], {}, 0
    for n in order:
        tags[n] = (i, i + len(fr[n]) - 1)
        for f in fr[n]:
            cells.append(place(f, cw, CANVAS_H))
        i += len(fr[n])
    # 한 줄로 길게 붙이면 가로가 4000px 를 넘는 대원이 생긴다 — 휴대폰 GPU
    # 중에는 4096px 넘는 텍스처를 못 올리는 것이 있어서, 2048px 안에서
    # 줄을 바꿔 격자로 깐다 (로더가 columns 로 줄바꿈을 계산한다)
    cols = min(len(cells), MAX_SHEET_W // cw)
    nrows = -(-len(cells) // cols)
    sheet = np.zeros((nrows * CANVAS_H, cols * cw, 4), np.uint8)
    for j, c in enumerate(cells):
        r, q = divmod(j, cols)
        sheet[r * CANVAS_H:(r + 1) * CANVAS_H, q * cw:(q + 1) * cw] = c
    prev = prev_meta['tags']
    walk_total = (prev['walk']['to'] - prev['walk']['from'] + 1) * prev['walk']['duration']
    atk_total = (prev['attack_main']['to'] - prev['attack_main']['from'] + 1) * prev['attack_main']['duration']
    nw = tags['walk'][1] - tags['walk'][0] + 1
    na = tags['attack'][1] - tags['attack'][0] + 1
    # 한 바퀴 걸리는 시간은 예전과 같게 — 프레임이 늘었다고 걸음이 느려지면
    # 이동 속도와 발이 안 맞아 미끄러져 보인다
    walk_ms = max(45, round(walk_total / nw))
    atk_ms = max(45, round(atk_total / na))
    t = lambda a, b, ms, loop: {'from': a, 'to': b, 'duration': ms, 'loop': loop}
    meta = {
        'canvas': {'w': cw, 'h': CANVAS_H},
        'columns': cols,
        'tags': {
            'idle': t(*tags['idle'], 130, True),
            'walk': t(*tags['walk'], walk_ms, True),
            'dash': t(*tags['dash'], 70, True),
            'attack_main': t(*tags['attack'], atk_ms, False),
            'run': t(*tags['walk'], walk_ms, True),
            'jump_rise': t(0, 0, 200, False),
            'jump_fall': t(0, 0, 200, False),
            'hurt': t(*tags['hurt'], 80, False),
            'death': t(tags['hurt'][1], tags['hurt'][1], 200, False),
        },
    }
    d = ROOT / f'assets/sprites/characters/{cid}'
    Image.fromarray(sheet, 'RGBA').save(d / f'{cid}.png', optimize=True)
    (d / f'{cid}.json').write_text(json.dumps(meta, indent=2) + '\n')
    return meta


def main(ids: list[str]):
    for cid in ids:
        # 걸음·공격 한 바퀴 시간의 기준은 균등분할로 뽑았던 마지막 시트다 —
        # 다시 돌려도 새로 쓴 시트를 기준 삼아 조금씩 어긋나지 않게 고정한다
        prev = json.loads(subprocess.check_output(
            ['git', 'show', f'{BASE_REV}:assets/sprites/characters/{cid}/{cid}.json'], cwd=ROOT))
        fr, k, idle_w = build(cid)
        meta = write(cid, fr, prev)
        counts = {n: len(v) for n, v in fr.items()}
        print(f'{cid:8} 배율 {k:.3f}  캔버스 {meta["canvas"]["w"]}x{CANVAS_H}  {counts}')


if __name__ == '__main__':
    main(sys.argv[1:] or list(CREW))
