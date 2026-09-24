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
import itertools
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
    # axe    공격 5 — 도끼를 들어 올린 뒤 준비 자세로 한 칸 되돌아갔다가
    #        내리찍는 원본 순서라 휘두르는 흐름이 끊겼다
    'axe': {'attack': [5]},
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


def register(f: np.ndarray, ref: np.ndarray) -> int:
    """원본 해상도에서 f 를 ref 에 겹칠 가로 이동량 — 발끝을 맞춘 채
    머리·가슴(위쪽 55%) 실루엣이 가장 많이 겹치는 자리. 무게중심 같은
    요약값은 AI 가 칸마다 디테일을 조금씩 다르게 그린 만큼 같이 흔들려서,
    실루엣 전체를 맞대어 본다."""
    H = max(f.shape[0], ref.shape[0])
    def top(img):
        a = np.zeros((H, img.shape[1]), bool)
        a[H - img.shape[0]:] = img[:, :, 3] > 0
        return a[: int(H * 0.55)]
    a, b = top(f), top(ref)
    wa, wb = a.shape[1], b.shape[1]
    best, best_s = -1.0, 0
    for s in range(-wa + 8, wb - 8):
        x0, x1 = max(0, s), min(wb, s + wa)
        if x1 - x0 < 8:
            continue
        pa = a[:, x0 - s:x1 - s]
        pb = b[:, x0:x1]
        inter = (pa & pb).sum()
        union = a.sum() + b.sum() - inter
        iou = inter / max(1, union)
        if iou > best:
            best, best_s = iou, s
    return best_s


def on_grid(frames: list[np.ndarray], shifts: list[int], anchor: float, k: float):
    """원본 프레임을 한 캔버스 위 같은 자리(발끝 바닥, 정렬 이동 반영)에
    놓고 같은 격자로 줄인다. 칸마다 따로 잘라 줄이면 잘린 시작점마다 축소
    격자가 어긋나서, 똑같은 그림도 픽셀 색이 전부 조금씩 달라져 가만히
    서 있는 캐릭터가 반짝거린다."""
    left = [s for s in shifts]
    x_min = min(min(left), 0)
    x_max = max(max(l + f.shape[1] for l, f in zip(left, frames)), 0)
    half = int(np.ceil(max(anchor - x_min, x_max - anchor))) + 4
    RW = half * 2
    RH = max(f.shape[0] for f in frames) + 4
    out = []
    for f, l in zip(frames, left):
        c = np.zeros((RH, RW, 4), np.uint8)
        x = int(round(half - anchor + l))
        c[RH - f.shape[0]:, x:x + f.shape[1]] = f
        out.append(downscale(c, k))
    return out


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


def frame_change(a: np.ndarray, b: np.ndarray) -> float:
    """두 칸 사이에 실루엣이나 색이 달라진 픽셀 비율"""
    oa, ob = a[:, :, 3] > 0, b[:, :, 3] > 0
    d = (oa != ob) | ((oa & ob) & (np.abs(a[:, :, :3].astype(int) - b[:, :, :3].astype(int)).sum(2) > 60))
    return d.sum() / max(1, (oa | ob).sum())


def central_index(fs: list[np.ndarray]) -> int:
    """다른 칸들과 가장 덜 다른 칸 — 그 동작의 대표 그림"""
    n = len(fs)
    if n == 1:
        return 0
    sc = [np.mean([frame_change(fs[i], fs[j]) for j in range(n) if j != i]) for i in range(n)]
    return int(np.argmin(sc))


def shift_img(img: np.ndarray, dx: int, dy: int) -> np.ndarray:
    out = np.zeros_like(img)
    h, w = img.shape[:2]
    ys0, ys1 = max(0, dy), min(h, h + dy)
    xs0, xs1 = max(0, dx), min(w, w + dx)
    out[ys0:ys1, xs0:xs1] = img[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    return out


def stable_upper(fs: list[np.ndarray], frac: float = 0.55) -> list[np.ndarray]:
    """걷기 — 허리 위(머리·몸통·팔)는 대표 걷기 그림 하나로 고정하고, 다리만
    각 칸의 원본을 쓴다.

    원본 걷기는 다리뿐 아니라 얼굴·투구·갑옷 디테일까지 칸마다 다시 그려져
    있어서, 걷기 시작하면 상체가 부글거렸다. 상체는 걸어도 모양이 안 바뀌어야
    하는 부분이라 대표 그림을 칸마다 맞대어(몸이 오르내리는 만큼 위치만 따라)
    덮는다. 머리만 따로 덮어 보니 경계선이 눈을 가로질러 얼굴에 줄이 생겨서,
    이음새를 모양이 단순한 허리에 둔다."""
    rep = fs[central_index(fs)]
    ys = np.nonzero((rep[:, :, 3] > 0).any(axis=1))[0]
    cut = int(ys.min() + (ys.max() - ys.min() + 1) * frac)
    patch = rep.copy()
    patch[cut:] = 0
    pa0 = patch[:, :, 3] > 0
    out = []
    for f in fs:
        fa = f[:, :, 3] > 0
        near = dilate(fa, 3)
        best, arg = -1.0, (0, 0)
        # 좌우는 이미 원본 해상도에서 맞춰 뒀다 — 여기서 또 좌우로 따라가면
        # AI 가 칸마다 조금씩 다르게 그린 만큼 고정한 상체가 좌우로 떨린다.
        # 몸이 오르내리는 위아래만 따라간다.
        for dy in range(-4, 5):
            for dx in (0,):
                sp = shift_img(pa0[:, :, None].astype(np.uint8), dx, dy)[:, :, 0] > 0
                iou = (sp & fa).sum() / max(1, (sp | (fa & dilate(sp, 3))).sum())
                if iou > best:
                    best, arg = iou, (dx, dy)
        p = shift_img(patch, *arg)
        pa = p[:, :, 3] > 0
        py, px = np.nonzero(pa)
        g = f.copy()
        # 허리 위는 좌우 끝까지 전부 대표 그림으로 — 대표 상체 틀만 비우면
        # 원본에서 더 뒤로 뻗은 팔이 틀 밖에 조각으로 남았다(작살).
        # 이음새 두 줄은 다리와 이어지게 원본을 남긴다
        box = np.zeros(pa.shape, bool)
        box[py.min():py.max() - 1, :] = True
        g[box & ~pa] = 0
        g[pa] = p[pa]
        out.append(drop_fragments(g, 0.08))
    return out


def walk_keys(fs: list[np.ndarray], k: int = 4) -> list[np.ndarray]:
    """걷기에서 다리 자세가 서로 가장 크게 다른 k 칸만 순서대로 고른다.

    원본 걷기 8~11칸은 이웃 칸끼리 발이 거의 안 움직이고 다리 디테일만
    다시 그려져 있어서, 그대로 돌리면 다리가 걷는 게 아니라 꿈틀거렸다
    (상체만 고정했을 때 '반으로 잘려 아래만 우글거린다'). 도트 게임의
    정석처럼 디딤·모음·반대 디딤·모음 네 자세만 남기면 다리 그림이 바뀔
    때마다 실제로 발이 움직인다."""
    n = len(fs)
    if n <= k:
        return fs

    def lower(f):
        a = f[:, :, 3] > 0
        ys = np.nonzero(a.any(axis=1))[0]
        m = np.zeros_like(a)
        cut = int(ys.max() - (ys.max() - ys.min()) * 0.42)
        m[cut:] = a[cut:]
        return m
    L = [lower(f) for f in fs]
    tops = [int(np.nonzero((f[:, :, 3] > 0).any(axis=1))[0].min()) for f in fs]
    dist = lambda a, b: 1 - (a & b).sum() / max(1, (a | b).sum())
    best, pick = None, None
    for comb in itertools.combinations(range(n), k):
        sc = sum(dist(L[comb[i]], L[comb[(i + 1) % k]]) for i in range(k))
        # 한 구간에 몰려 뽑히면 걸음이 절뚝인다 — 고르게 퍼진 쪽을 조금 더 친다
        gaps = [(comb[(i + 1) % k] - comb[i]) % n for i in range(k)]
        sc -= 0.03 * float(np.std(gaps))
        # 몸이 오르내리는 폭은 2px 안쪽이어야 걷는 것으로 보인다 — 원본에는
        # 한 칸만 몸이 4~5px 떠 있는 칸이 섞여 있어 그대로 고르면 걷다가 튄다
        bob = max(tops[i] for i in comb) - min(tops[i] for i in comb)
        sc -= 0.25 * max(0, bob - 2)
        if best is None or sc > best:
            best, pick = sc, comb
    return [fs[i] for i in pick]


def hold_redraws(fs: list[np.ndarray], thr: float = 0.8) -> list[np.ndarray]:
    """실루엣이 거의 같은 연속 칸(움직임 없이 다시 그리기만 한 칸)은 앞 칸을
    그대로 유지한다 — 자세가 실제로 바뀔 때만 그림이 바뀌게. 무기는 실루엣에서
    차지하는 몫이 작아 이보다 낮추면 도끼를 드는 칸까지 합쳐진다."""
    out = [fs[0]]
    for f in fs[1:]:
        a, b = out[-1][:, :, 3] > 0, f[:, :, 3] > 0
        iou = (a & b).sum() / max(1, (a | b).sum())
        out.append(out[-1] if iou >= thr else f)
    return out


def breathing_idle(fs: list[np.ndarray]) -> list[np.ndarray]:
    """대기 동작 = 대표 한 장 + 가슴 위를 1px 들어 올린 한 장.

    원본 대기 줄은 실제로는 거의 안 움직이고, AI 가 칸마다 도끼날 크기·
    투구 음영·눈 모양을 조금씩 다르게 다시 그린 것뿐이다. 그걸 그대로
    돌리면 가만히 서 있는 캐릭터가 부글부글 끓는다(한 칸 넘어갈 때마다
    픽셀의 60~80% 가 바뀌었다). 다른 칸들과 가장 덜 다른 칸을 대표로
    골라 그 그림만 쓰고, 움직임은 도트 게임 대기 동작의 정석대로 가슴
    위 1px 들썩임으로 준다."""
    base = fs[central_index(fs)]
    ys = np.nonzero((base[:, :, 3] > 0).any(axis=1))[0]
    top, bot = ys.min(), ys.max()
    cut = int(bot - (bot - top) * 0.45)
    up = base.copy()
    up[top - 1:cut - 1] = base[top:cut]
    up[cut - 1:cut] = base[cut - 1:cut]
    return [base, up]


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


# 무기가 외곽선 없이 밝게 빛나게 그려진 대원 — 외곽선 기준 이펙트 제거가
# 공격 칸의 무기를 검기로 오인해 통째로 지운다(도끼날이 사라져 자루만
# 휘둘렀다). 대시는 다른 대원처럼 속도선을 지워야 하므로 공격에만 적용한다
WEAPON_GLOWS = {'axe'}

# 원본 삽화가 같은 청록 갑옷이라 게임에서 거의 같은 캐릭터로 보이던 둘 중
# 작살의 갑옷 대역만 파란 쪽으로 민다 (3eddecf 와 같은 조정 — 피부·금장식·
# 윤곽선은 그대로라 디자인은 안 바뀐다)
RECOLOR = {'harpoon': (115, 205, 40)}


def muzzle_of(cell: np.ndarray) -> list[int]:
    """한 칸에서 총구(탄이 나올 자리) — 가슴~무릎 높이 띠에서 바라보는
    방향(오른쪽)으로 가장 멀리 뻗은 점. 칸 가운데(=발 기준점)에서의
    [앞쪽 거리, 발에서의 높이]. 총·버스터 계열은 사격 중에도 대기/걷기
    그림을 그대로 쓰므로 그 칸마다의 총 끝이 곧 총구다."""
    ch, cw = cell.shape[:2]
    ys, xs = np.nonzero(cell[:, :, 3] > 0)
    h = ch - ys
    band = (h >= 12) & (h <= 42)
    if not band.any():
        return [9, 30]
    xm = xs[band].max()
    yy = ys[band][xs[band] >= xm - 1].mean()
    return [int(round(xm + 0.5 - cw / 2)), int(round(ch - yy))]


def place(f: np.ndarray, cw: int, ch: int) -> np.ndarray:
    """정렬된 캔버스에서 고정 기준점(ANCHOR)을 가운데로 cw×ch 를 잘라낸다.
    칸마다 기준점을 다시 계산하지 않는다 — 그 계산이 1px 씩 흔들려서
    몸 전체가 좌우로 떨렸다."""
    h, w = f.shape[:2]
    out = np.zeros((ch, cw, 4), np.uint8)
    x0 = int(round(ANCHOR - cw / 2))
    sx0, sx1 = max(0, x0), min(w, x0 + cw)
    sy0 = max(0, h - ch)
    out[ch - (h - sy0):, sx0 - x0:sx1 - x0] = f[sy0:, sx0:sx1]
    return out


ANCHOR = 0.0


# ------------------------------------------------------------ 한 명 처리

def build(cid: str):
    key, title, rows = CREW[cid]
    rgba = np.array(Image.open(raw_path(key)).convert('RGBA'))
    raw = find_frames(rgba, title, rows, EXPECT.get(cid))
    idle_h = float(np.median([f.shape[0] for f in raw['idle']]))
    k = TARGET_H / idle_h
    # 모든 동작을 대기 첫 칸에 맞대어 정렬하고, 한 격자에서 줄인다.
    # 쓰러지는 피격 칸은 실루엣이 딴판이라 맞대기가 안 먹어서 무게중심으로 둔다
    ref = raw['idle'][0]
    ref_ax = anchor_x(ref)
    names = [n for n in raw if raw[n]]
    flat, shifts, owner = [], [], []
    for n in names:
        for f in raw[n]:
            flat.append(f)
            shifts.append(register(f, ref) if n != 'hurt' else int(round(ref_ax - anchor_x(f))))
            owner.append(n)
    grid = on_grid(flat, shifts, ref_ax, k)
    fr = {n: [] for n in names}
    for n, g in zip(owner, grid):
        fr[n].append(drop_fragments(strip_dust(drop_fragments(g))))
    GW = grid[0].shape[1]
    global ANCHOR
    ANCHOR = GW / 2
    idle_w = float(np.median([trim(f).shape[1] for f in fr['idle']]))
    # 캐릭터가 아니라 이펙트 조각(검기·잔상)만 잡힌 것은 버린다 — 대기 자세
    # 색과 거의 안 겹치거나 키가 턱없이 작은 것
    ref = np.concatenate([f[f[:, :, 3] > 0][:, :3] for f in fr['idle']]).astype(int)
    ref_q = set(map(tuple, (ref // 24).tolist()))

    def is_body(f):
        px = f[f[:, :, 3] > 0][:, :3].astype(int) // 24
        share = np.mean([tuple(p) in ref_q for p in px.tolist()])
        return share > 0.55 and trim(f).shape[0] > TARGET_H * 0.4
    fr = {n: [f for f in fs if is_body(f)] for n, fs in fr.items()}

    idle_px = float(np.median([(f[:, :, 3] > 0).sum() for f in fr['idle']]))

    def pick(name, max_lost, need):
        """이펙트를 지우고, 이펙트가 대부분이던(=캐릭터가 아닌) 프레임은 뺀다"""
        res = []
        for i, f in enumerate(fr.get(name, [])):
            if cid in WEAPON_GLOWS and name == 'attack':
                # 무기 자체가 외곽선 없이 빛나는 대원 — 이펙트로 오인해 지우면
                # 무기가 사라진다. 이펙트 칸 판별은 캐릭터 판정(is_body)에 맡긴다
                g, lost = f, 0.0
            else:
                g, lost = strip_fx(f)
            g = drop_fragments(g, 0.08)
            n = (g[:, :, 3] > 0).sum()
            res.append((i, g if n else f, lost if n > idle_px * 0.4 else 1.0))
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
    out['idle'] = breathing_idle(out['idle'])
    out['walk'] = stable_upper(walk_keys(out['walk']))
    # 대시는 짧게 스치는 한 자세라, 다시 그린 칸들을 돌릴 이유가 없다
    out['dash'] = [out['dash'][central_index(out['dash'])]]
    out['attack'] = hold_redraws(out['attack'])
    return out, k, idle_w


def write(cid: str, fr: dict[str, list[np.ndarray]], prev_meta: dict):
    order = ['idle', 'walk', 'dash', 'attack', 'hurt']
    half = 0
    for n in order:
        for f in fr[n]:
            xs = np.nonzero((f[:, :, 3] > 0).any(axis=0))[0]
            half = max(half, ANCHOR - xs.min() + 1, xs.max() + 1 - ANCHOR + 1)
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
    atk_total = (prev['attack_main']['to'] - prev['attack_main']['from'] + 1) * prev['attack_main']['duration']
    na = tags['attack'][1] - tags['attack'][0] + 1
    # 한 바퀴 걸리는 시간은 예전과 같게 — 프레임이 늘었다고 걸음이 느려지면
    # 이동 속도와 발이 안 맞아 미끄러져 보인다
    # 걷기는 다리 자세 네 칸만 쓰므로 예전 한 바퀴 시간을 네 칸으로 나누면
    # 칸당 190ms 까지 늘어 걸음이 끊겨 보였다 — 4칸 걷기의 흔한 속도(초당
    # 8칸)로 아홉 명 모두 같게 둔다
    walk_ms = 125
    atk_ms = max(45, round(atk_total / na))
    t = lambda a, b, ms, loop: {'from': a, 'to': b, 'duration': ms, 'loop': loop}
    meta = {
        'canvas': {'w': cw, 'h': CANVAS_H},
        'columns': cols,
        # 칸 번호마다의 총구 위치 [앞쪽 거리, 발에서의 높이] — horde.ts 가
        # 쏘는 순간 보이는 칸의 값을 쓴다
        'muzzle': [muzzle_of(c) for c in cells],
        'tags': {
            # 대표 한 장과 숨 들이쉰 한 장을 느긋하게 번갈아 — 0.9초에 한 번
            'idle': t(*tags['idle'], 450, True),
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
