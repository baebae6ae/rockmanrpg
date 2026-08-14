#!/usr/bin/env python3
"""리핑 스프라이트 시트에서 프레임을 자동 검출해 정규화한다 (docs/DESIGN.md §5.1).

리핑 시트는 스프라이트가 불규칙하게 흩어져 있고 메타데이터가 없다. 이 도구가
개별 스프라이트의 경계를 찾아내고, 각각을 고정 캔버스에 발바닥 하단 중앙
기준으로 정렬해 균일 격자 시트로 만든다. 남는 일은 "프레임을 묶어 애니메이션
태그를 붙이는 것"뿐이다.

    python3 tools/detect_frames.py assets/raw/x.png --id x

산출물
    assets/sprites/characters/<id>/<id>.png    정규화된 균일 격자 시트
    assets/sprites/characters/<id>/<id>.json   태그 뼈대 (사람이 채운다)
    assets/sprites/characters/<id>/index.png   프레임 번호가 찍힌 확인용 이미지

검출이 어긋나면 --gap 과 --min-area 를 조절한다. 무기 이펙트가 캐릭터에
붙어 있으면 한 덩어리로 잡히는데, 그건 Aseprite 에서 손으로 고치는 편이 빠르다.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow 가 필요하다:  pip install pillow")


# ---------------------------------------------------------------- 마스크

def build_mask(img: Image.Image, bg: tuple[int, int, int] | None, tol: int) -> list[bool]:
    """스프라이트 픽셀 여부를 1차원 불리언 배열로 만든다."""
    w, h = img.size
    px = img.load()
    mask = [False] * (w * h)

    # 알파가 있으면 알파를, 없으면 배경색을 기준으로 삼는다.
    has_alpha = any(px[x, y][3] < 255 for x in range(0, w, 7) for y in range(0, h, 7))

    if bg is None and not has_alpha:
        # 배경색을 지정하지 않았으면 모서리 색을 배경으로 본다
        bg = px[0, 0][:3]

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if has_alpha and bg is None:
                mask[y * w + x] = a > 16
            else:
                assert bg is not None
                near = abs(r - bg[0]) <= tol and abs(g - bg[1]) <= tol and abs(b - bg[2]) <= tol
                mask[y * w + x] = a > 16 and not near
    return mask


# ---------------------------------------------------------------- 연결 성분

def apply_mask(img: Image.Image, mask: list[bool]) -> Image.Image:
    """배경으로 판정된 픽셀을 투명하게 만든다.

    이걸 하지 않으면 잘라낸 프레임 안에 배경색이 그대로 남는다.
    """
    w, h = img.size
    clean = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    src = img.load()
    dst = clean.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            if mask[row + x]:
                dst[x, y] = src[x, y]
    return clean


def find_components(mask: list[bool], w: int, h: int) -> list[tuple[int, int, int, int]]:
    """8방향 연결 성분의 경계 상자 목록 (x0, y0, x1, y1) — x1/y1 포함."""
    seen = bytearray(w * h)
    boxes: list[tuple[int, int, int, int]] = []
    neighbours = (-1, 0, 1)

    for start in range(w * h):
        if seen[start] or not mask[start]:
            continue

        seen[start] = 1
        queue = deque([start])
        sx = start % w
        sy = start // w
        x0 = x1 = sx
        y0 = y1 = sy

        while queue:
            i = queue.popleft()
            cx, cy = i % w, i // w
            if cx < x0:
                x0 = cx
            if cx > x1:
                x1 = cx
            if cy < y0:
                y0 = cy
            if cy > y1:
                y1 = cy

            for dy in neighbours:
                ny = cy + dy
                if ny < 0 or ny >= h:
                    continue
                for dx in neighbours:
                    nx = cx + dx
                    if nx < 0 or nx >= w:
                        continue
                    j = ny * w + nx
                    if not seen[j] and mask[j]:
                        seen[j] = 1
                        queue.append(j)

        boxes.append((x0, y0, x1, y1))
    return boxes


def merge_boxes(boxes: list[tuple[int, int, int, int]], gap: int) -> list[tuple[int, int, int, int]]:
    """gap 픽셀 이내로 붙어 있는 상자들을 하나로 합친다.

    한 스프라이트가 팔·무기처럼 떨어진 조각으로 나뉘어 검출되기 때문에 필요하다.
    """
    merged = list(boxes)
    changed = True
    while changed:
        changed = False
        out: list[tuple[int, int, int, int]] = []
        for box in merged:
            for i, other in enumerate(out):
                if (
                    box[0] - gap <= other[2]
                    and box[2] + gap >= other[0]
                    and box[1] - gap <= other[3]
                    and box[3] + gap >= other[1]
                ):
                    out[i] = (
                        min(box[0], other[0]),
                        min(box[1], other[1]),
                        max(box[2], other[2]),
                        max(box[3], other[3]),
                    )
                    changed = True
                    break
            else:
                out.append(box)
        merged = out
    return merged


def sort_reading_order(boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """행 단위로 묶어 왼쪽에서 오른쪽으로 정렬한다."""
    remaining = sorted(boxes, key=lambda b: (b[1], b[0]))
    ordered: list[tuple[int, int, int, int]] = []
    while remaining:
        first = remaining.pop(0)
        row = [first]
        mid = (first[1] + first[3]) / 2
        for box in list(remaining):
            if box[1] <= mid <= box[3]:
                row.append(box)
                remaining.remove(box)
        ordered.extend(sorted(row, key=lambda b: b[0]))
    return ordered


# ---------------------------------------------------------------- 출력

def normalize(
    img: Image.Image,
    boxes: list[tuple[int, int, int, int]],
    canvas: int,
    columns: int,
) -> Image.Image:
    """각 프레임을 고정 캔버스에 발바닥 하단 중앙 기준으로 배치한다 (§5.2)."""
    rows = (len(boxes) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * canvas, rows * canvas), (0, 0, 0, 0))

    for i, (x0, y0, x1, y1) in enumerate(boxes):
        crop = img.crop((x0, y0, x1 + 1, y1 + 1))
        cw, ch = crop.size
        if cw > canvas or ch > canvas:
            print(f"  ! 프레임 {i} 가 캔버스보다 크다 ({cw}×{ch}) — --canvas 를 키워라")

        ox = (i % columns) * canvas + (canvas - cw) // 2
        oy = (i // columns) * canvas + (canvas - 1 - ch)
        sheet.paste(crop, (ox, oy), crop)

    return sheet


def draw_index(sheet: Image.Image, canvas: int, columns: int, count: int) -> Image.Image:
    """프레임 번호를 찍은 확인용 이미지 — 태그를 묶을 때 쓴다."""
    preview = sheet.copy()
    draw = ImageDraw.Draw(preview)
    for i in range(count):
        x = (i % columns) * canvas
        y = (i // columns) * canvas
        draw.rectangle([x, y, x + canvas - 1, y + canvas - 1], outline=(90, 110, 168, 160))
        draw.text((x + 2, y + 2), str(i), fill=(255, 216, 92, 255))
    return preview


def main() -> None:
    ap = argparse.ArgumentParser(description="리핑 시트 프레임 자동 검출·정규화")
    ap.add_argument("input", type=Path, help="원본 리핑 시트 (PNG)")
    ap.add_argument("--id", required=True, help="캐릭터/적 id (소문자 스네이크케이스)")
    ap.add_argument("--kind", default="characters", choices=["characters", "enemies"])
    ap.add_argument("--out", type=Path, default=Path("assets/sprites"))
    ap.add_argument("--canvas", type=int, default=64, help="정규화 캔버스 크기 (기본 64)")
    ap.add_argument("--columns", type=int, default=8, help="격자 열 수 (기본 8)")
    ap.add_argument("--gap", type=int, default=3, help="이 픽셀 이내로 붙은 조각은 한 프레임으로 합친다")
    ap.add_argument("--min-area", type=int, default=24, help="이보다 작은 덩어리는 잡티로 본다")
    ap.add_argument("--bg", help="배경색 (예: ff00ff). 생략하면 알파 또는 모서리 색을 쓴다")
    ap.add_argument("--tol", type=int, default=12, help="배경색 허용 오차")
    args = ap.parse_args()

    if not args.input.exists():
        sys.exit(f"입력 파일이 없다: {args.input}")

    img = Image.open(args.input).convert("RGBA")
    w, h = img.size
    print(f"{args.input}  {w}×{h}")

    bg = None
    if args.bg:
        value = args.bg.lstrip("#")
        bg = (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))

    mask = build_mask(img, bg, args.tol)
    clean = apply_mask(img, mask)
    boxes = find_components(mask, w, h)
    print(f"  연결 성분 {len(boxes)}개")

    boxes = merge_boxes(boxes, args.gap)
    boxes = [b for b in boxes if (b[2] - b[0] + 1) * (b[3] - b[1] + 1) >= args.min_area]
    boxes = sort_reading_order(boxes)
    print(f"  병합·정리 후 프레임 {len(boxes)}개")

    if not boxes:
        sys.exit("프레임을 찾지 못했다. --bg 나 --tol 을 확인하라.")

    sheet = normalize(clean, boxes, args.canvas, args.columns)

    out_dir = args.out / args.kind / args.id
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet.save(out_dir / f"{args.id}.png")
    draw_index(sheet, args.canvas, args.columns, len(boxes)).save(out_dir / "index.png")

    # 태그 뼈대 — 프레임 번호를 보고 사람이 구간을 나눈다
    meta = {
        "canvas": {"w": args.canvas, "h": args.canvas},
        "columns": args.columns,
        "tags": {
            "idle": {"from": 0, "to": min(1, len(boxes) - 1), "duration": 160, "loop": True},
        },
        "_todo": (
            f"index.png 에서 프레임 번호를 보고 태그를 채워라. "
            f"총 {len(boxes)}프레임. 필수 태그는 docs/DESIGN.md §5.5 참고."
        ),
    }
    (out_dir / f"{args.id}.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"  → {out_dir}/{args.id}.png")
    print(f"  → {out_dir}/index.png  (프레임 번호 확인용)")
    print(f"  → {out_dir}/{args.id}.json  (태그를 채워라)")


if __name__ == "__main__":
    main()
