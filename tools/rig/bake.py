"""뼈대 렌더(8배)를 게임 도트 시트로 굽는다.

  python3 tools/rig/bake.py <render.mjs 출력 폴더> <캐릭터 id> [출력 루트]

- 8×8 블록마다 '가장 많이 칠해진 색' 하나만 고른다. 평균을 내면 경계마다
  섞인 색이 생겨 흐려지는데, 최빈색은 팔레트 색만 남아 도트처럼 또렷하다.
- 외곽선은 그림이 아니라 여기서 긋는다: 실루엣 바깥 한 줄 + 겹친 파츠
  사이(뒤에 있는 쪽 픽셀에) 한 줄. 같은 덩어리(그룹) 안에는 긋지 않는다.
- 출력은 기존 대원 시트와 같은 형식(PNG + JSON, 칸 번호별 총구 위치).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

LINE = (11, 16, 48)
MAX_SHEET_W = 2048
ORDER = ['idle', 'walk', 'dash', 'attack_main', 'run_attack', 'hurt', 'down']


def block_mode(hi: np.ndarray, S: int, opaque: np.ndarray) -> np.ndarray:
    """hi (H*S, W*S) 정수 배열을 블록 최빈값으로 줄인다 — opaque 칸만, 0 은 제외"""
    H, W = opaque.shape
    blk = hi.reshape(H, S, W, S).transpose(0, 2, 1, 3).reshape(H, W, S * S)
    out = np.zeros((H, W), np.int64)
    for y, x in zip(*np.nonzero(opaque)):
        v = blk[y, x]
        v = v[v != 0]
        if v.size:
            u, c = np.unique(v, return_counts=True)
            out[y, x] = u[np.argmax(c)]
    return out


def bake_frame(color_png: Path, ids_png: Path, S: int) -> np.ndarray:
    col = np.array(Image.open(color_png).convert('RGBA')).astype(np.int64)
    ids = np.array(Image.open(ids_png).convert('RGBA')).astype(np.int64)
    Hh, Wh = col.shape[:2]
    H, W = Hh // S, Wh // S
    a = col[:, :, 3] > 127
    cover = a.reshape(H, S, W, S).mean(axis=(1, 3))
    opaque = cover >= 0.5
    packed = np.where(a, (col[:, :, 0] << 16) | (col[:, :, 1] << 8) | col[:, :, 2] | (1 << 24), 0)
    cmode = block_mode(packed, S, opaque)
    pid = np.where(ids[:, :, 3] > 127, (ids[:, :, 0] << 8) | ids[:, :, 1], 0)
    imode = block_mode(pid, S, opaque)
    z, grp = imode >> 8, imode & 255

    out = np.zeros((H, W, 4), np.uint8)
    out[opaque, 0] = (cmode[opaque] >> 16) & 255
    out[opaque, 1] = (cmode[opaque] >> 8) & 255
    out[opaque, 2] = cmode[opaque] & 255
    out[opaque, 3] = 255

    line = np.zeros((H, W), bool)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nb_op = np.roll(opaque, (dy, dx), axis=(0, 1))
        nb_z = np.roll(z, (dy, dx), axis=(0, 1))
        nb_g = np.roll(grp, (dy, dx), axis=(0, 1))
        # 실루엣 바깥 한 줄
        line |= ~opaque & nb_op
        # 앞 파츠와 맞닿은 뒤 파츠 픽셀
        line |= opaque & nb_op & (nb_g != grp) & (nb_z > z)
    out[line, :3] = LINE
    out[line, 3] = 255
    return out


def main(src: str, cid: str, root: str = 'assets/rig'):
    src = Path(src)
    man = json.loads((src / 'frames.json').read_text())
    S = man['scale']
    cells, tags, muzzle, i = [], {}, [], 0
    CW, CH = man['canvas']['w'], man['canvas']['h']
    for name in ORDER:
        a = man['anims'][name]
        tags[name] = (i, i + len(a['frames']) - 1, a['ms'], a['loop'])
        for f in a['frames']:
            cells.append(bake_frame(src / f"{f['base']}_color.png", src / f"{f['base']}_ids.png", S))
            mx, my = f['muzzle']
            muzzle.append([int(round(mx)), int(round(-my)) + 1])
            i += 1
    # 가로는 가운데(발) 기준 좌우 대칭으로 필요한 만큼만
    half = 0
    for c in cells:
        xs = np.nonzero((c[:, :, 3] > 0).any(axis=0))[0]
        half = max(half, CW / 2 - xs.min(), xs.max() + 1 - CW / 2)
    half = int(np.ceil(half))
    top = min(int(np.nonzero((c[:, :, 3] > 0).any(axis=1))[0].min()) for c in cells)
    x0 = CW // 2 - half
    cells = [c[top:, x0:x0 + 2 * half] for c in cells]
    cw, ch = 2 * half, CH - top
    cols = min(len(cells), MAX_SHEET_W // cw)
    nrows = -(-len(cells) // cols)
    sheet = np.zeros((nrows * ch, cols * cw, 4), np.uint8)
    for j, c in enumerate(cells):
        r, q = divmod(j, cols)
        sheet[r * ch:(r + 1) * ch, q * cw:(q + 1) * cw] = c
    t = lambda a, b, ms, loop: {'from': a, 'to': b, 'duration': ms, 'loop': loop}
    meta = {
        'canvas': {'w': cw, 'h': ch},
        'columns': cols,
        'muzzle': muzzle,
        'walk_neutral': 0,
        'tags': {
            'idle': t(*tags['idle']),
            'walk': t(*tags['walk']),
            'run': t(*tags['walk']),
            'dash': t(*tags['dash']),
            'attack_main': t(*tags['attack_main']),
            'run_attack': t(*tags['run_attack']),
            'jump_rise': t(tags['idle'][0], tags['idle'][0], 200, False),
            'jump_fall': t(tags['idle'][0], tags['idle'][0], 200, False),
            'hurt': t(*tags['hurt']),
            'death': t(*tags['down']),
        },
    }
    d = Path(root) / 'characters' / cid
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, 'RGBA').save(d / f'{cid}.png', optimize=True)
    (d / f'{cid}.json').write_text(json.dumps(meta, indent=2) + '\n')
    print(cid, f'{cw}x{ch}', len(cells), 'cells →', d)


if __name__ == '__main__':
    main(*sys.argv[1:])
