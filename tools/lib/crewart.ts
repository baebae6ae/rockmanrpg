/**
 * 《균열 회수반》 도트 화풍 — 프리뷰(crew-preview.ts)와 스프라이트 생성기
 * (gen-placeholder.ts)가 같이 쓰는 공용 모듈.
 *
 * 두 곳에 같은 그림을 두 번 짜 놓으면 반드시 갈라진다. 프리뷰에서 얼굴을
 * 고쳤는데 시트는 옛날 얼굴로 뽑히는 식이다. 그래서 파츠·명암·색을 전부
 * 여기 한 곳에 두고, 양쪽은 포즈만 다르게 넣어 쓴다.
 *
 * 핵심 두 가지:
 *
 *   1. 색을 직접 찍지 않는다. 재질 번호를 버퍼에 깔아 두고 나중에 한꺼번에
 *      음영을 계산한다. 이래야 파츠를 새로 붙여도 톤이 안 깨진다.
 *   2. 명암은 실루엣 '전체'를 보고 정한다. 파츠마다 제 가장자리만 보면
 *      작은 사각형마다 하이라이트가 생겨 몸이 잘게 부서진다.
 */

// ---------------------------------------------------------------- 좌표계
/** 스프라이트 한 칸. x 중앙 = 32, y 바닥 = 63 */
export const CELL = 64;
const OX = 32;
const OY = 63;

/**
 * 재질 — 같은 재질끼리 같은 램프를 쓴다.
 *   suit  본체            trim   부츠·장갑·벨트 (본체에서 어둡게 파생)
 *   metal 장비            accent 밝은 테두리
 *   glow  발광체          hair   머리카락
 *   skin  살              skinS  살 그늘        skinH 살 하이라이트
 *   eye   속눈썹·동공      iris   홍채           white 흰자·눈빛
 *   suitB/trimB/metalB    반대편 팔다리 — 한 단 죽여서 뒤로 보낸다
 *
 * 얼굴 쪽 재질은 자동 음영을 끈다. 이목구비가 한두 픽셀이라 톤 램프를
 * 태우면 눈·코·입이 서로 뭉개져 표정이 사라진다.
 */
export const enum M {
  none = 0, suit = 1, trim = 2, metal = 3, accent = 4, glow = 5,
  skin = 6, skinS = 7, skinH = 8,
  eye = 9, iris = 10, white = 11, hair = 12,
  suitB = 13, trimB = 14, metalB = 15,
}

/** 앞쪽 재질 → 반대편(뒤쪽) 재질 */
const BACK_OF: Partial<Record<M, M>> = {
  [M.suit]: M.suitB, [M.trim]: M.trimB,
  [M.metal]: M.metalB, [M.accent]: M.trimB,
};

// ---------------------------------------------------------------- 색
export type RGB = [number, number, number];
export const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
];
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** 어두운 쪽은 검정이 아니라 차가운 남색으로 민다 — 검정으로 내리면 도트가 죽는다 */
const COOL: RGB = [22, 26, 44];
/** 밝은 쪽은 순백이 아니라 따뜻한 빛으로 민다 — 흰색으로 올리면 색이 빠진다 */
const LIGHT: RGB = [255, 246, 222];
/** 바닥에서 튀어오르는 반사광. 하늘빛이라 차갑다 */
const BOUNCE: RGB = [84, 118, 172];
/** 눈은 2px 밖에 안 돼서 음영을 먹이면 뭉개진다. 고정색으로 박는다 */
const EYE: RGB = [26, 22, 40];
const EYE_LIT: RGB = [246, 248, 255];
/** 살 그늘은 남색이 아니라 붉게 죽는다 — 차갑게 내리면 얼굴만 시체색이 된다 */
const SKIN_SHADE: RGB = [104, 52, 60];

/** 살 3단 — 그늘 / 기본 / 광대·콧대 하이라이트 */
function skinTones(base: string): [RGB, RGB, RGB] {
  const b = hex(base);
  return [mix(b, SKIN_SHADE, 0.5), b, mix(b, LIGHT, 0.3)];
}

/**
 * 7단 램프 + 윤곽선 두 단(빛 쪽 / 그늘 쪽) + 반사광.
 *
 * 5단으로는 부족했다. 형태광과 파츠 경계를 겹쳐 쓰려면 가운데가 넉넉해야
 * 하는데, 5단이면 둘 중 하나만 세게 먹여도 곧바로 끝에 붙어 계단이 진다.
 */
interface Ramp { t: RGB[]; edgeLit: RGB; edgeDark: RGB; bounce: RGB }
function ramp(base: string | RGB): Ramp {
  const b = typeof base === 'string' ? hex(base) : base;
  return {
    t: [
      mix(b, COOL, 0.62), mix(b, COOL, 0.44), mix(b, COOL, 0.23), b,
      mix(b, LIGHT, 0.15), mix(b, LIGHT, 0.32), mix(b, LIGHT, 0.55),
    ],
    edgeLit: mix(b, COOL, 0.70),
    edgeDark: mix(b, COOL, 0.88),
    bounce: mix(mix(b, COOL, 0.44), BOUNCE, 0.34),
  };
}

// ---------------------------------------------------------------- 버퍼
/**
 * 재질 버퍼. 좌표는 x 중앙 기준, y 발바닥 기준(위가 양수)이다.
 *
 * origin() 으로 원점을 옮길 수 있다. 얼굴·머리 파츠는 서 있는 자세의
 * 절대 좌표로 짜여 있는데, 애니메이션에서 머리가 오르내릴 때마다 그걸
 * 전부 다시 계산할 수는 없다. 원점만 옮기면 같은 코드가 그대로 쓰인다.
 */
export class F {
  m = new Uint8Array(CELL * CELL);
  private dx = 0;
  private dy = 0;
  /** 이 뒤로 찍는 것은 전부 반대편(뒤쪽) 재질로 바뀐다 */
  private back = false;

  origin(dx: number, dy: number): void { this.dx = dx; this.dy = dy; }
  backside(on: boolean): void { this.back = on; }

  set(x: number, y: number, mat: M): void {
    const cx = OX + Math.round(x + this.dx);
    const cy = OY - Math.round(y + this.dy);
    if (cx < 0 || cx >= CELL || cy < 0 || cy >= CELL) return;
    this.m[cy * CELL + cx] = this.back ? (BACK_OF[mat] ?? mat) : mat;
  }
  rect(x: number, y: number, w: number, h: number, mat: M): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, mat);
  }
  disc(cx: number, cy: number, r: number, mat: M): void {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) this.set(cx + x, cy + y, mat);
    }
  }
  crescent(cx: number, cy: number, r: number, inner: number, side: -1 | 1, mat: M): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (side < 0 && x > 0) continue;
        if (side > 0 && x < 0) continue;
        const d2 = x * x + y * y;
        if (d2 <= r * r && d2 >= inner * inner) this.set(cx + x, cy + y, mat);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, mat: M): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const h = Math.floor(w / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (let ox = -h; ox <= h; ox++) for (let oy = -h; oy <= h; oy++) this.set(x + ox, y + oy, mat);
    }
  }
}

/**
 * 윗모서리 깎기 — 사각형을 그대로 두면 갑옷이 아니라 쌓아 올린 블록으로
 * 보인다. 꼭짓점 두 개만 지워도 판이 다듬어진 것으로 읽힌다.
 */
export function bevel(f: F, x: number, y: number, w: number, h: number): void {
  f.set(x, y + h - 1, M.none);
  f.set(x + w - 1, y + h - 1, M.none);
}

// ---------------------------------------------------------------- 명암
const at = (m: Uint8Array, x: number, y: number): number =>
  x < 0 || x >= CELL || y < 0 || y >= CELL ? 0 : m[y * CELL + x];

/**
 * 형태광 — 실루엣 '전체'를 하나의 덩어리로 보고 빛을 먼저 깐다.
 *
 * 파츠 가장자리만 보고 톤을 정하면 작은 사각형마다 제 하이라이트가 생겨
 * 몸이 잘게 부서진다. 조각조각은 입체인데 전체는 평평한, 종이를 오려
 * 붙인 것 같은 그림이 나오는 게 그 때문이다.
 *
 * 광원 쪽(왼쪽 위)과 그늘 쪽(오른쪽 아래)으로 각각 몇 칸 만에 실루엣을
 * 벗어나는지 재서 그 차이를 밝기로 쓴다. 가까운 쪽이 이긴다.
 */
const FORM_R = 6;
function formTone(m: Uint8Array, cx: number, cy: number): number {
  let lit = FORM_R + 1;
  let sh = FORM_R + 1;
  for (let i = 1; i <= FORM_R; i++) if (!at(m, cx - i, cy - i)) { lit = i; break; }
  for (let i = 1; i <= FORM_R; i++) if (!at(m, cx + i, cy + i)) { sh = i; break; }
  return Math.max(-2, Math.min(2, Math.round((sh - lit) / 2)));
}

/**
 * 파츠 경계 — 형태광 위에 얹는 잔 디테일. 여기서 세게 주면 다시 부서지니
 * 한 단씩만 움직인다.
 */
function partTone(m: Uint8Array, cx: number, cy: number): number {
  const mat = at(m, cx, cy);
  const up = at(m, cx, cy - 1);
  let d = 0;
  if (!up) d += 1;                 // 실루엣 윗면 — 빛을 정면으로 받는다
  else if (up !== mat) d -= 1;     // 다른 파츠가 위에 얹혔다 — 접촉 그림자
  if (!at(m, cx, cy + 1)) d -= 1;  // 실루엣 밑면
  if (!at(m, cx - 1, cy)) d += 1;  // 광원 쪽 옆면
  return Math.max(-1, Math.min(1, d));
}

// ---------------------------------------------------------------- 팔레트
export interface CrewPal {
  suit: string; metal: string; glow: string;
  /**
   * 아래 셋은 얼굴이 있는 대상에만 쓴다. 균열에서 나온 개체는 사람이
   * 아니라서 살도 눈동자도 머리카락도 없다 — 그쪽은 비워 둔다.
   */
  skin?: string;
  iris?: string;
  hair?: string;
}

/**
 * 재질 버퍼를 RGBA 로 굽는다. alpha 는 사망 연출의 페이드아웃에 쓴다.
 */
export function paint(f: F, c: CrewPal, alpha = 255): Uint8Array {
  const m = f.m;
  const out = new Uint8Array(CELL * CELL * 4);
  const suit = hex(c.suit);
  const sk = skinTones(c.skin ?? '#e0a882');
  const iris = hex(c.iris ?? c.glow);
  const trim = mix(suit, COOL, 0.42);
  const R: Partial<Record<M, Ramp>> = {
    [M.suit]: ramp(suit),
    [M.trim]: ramp(trim),
    [M.metal]: ramp(c.metal),
    [M.accent]: ramp(c.glow),
    [M.glow]: ramp(c.glow),
    [M.skin]: ramp(sk[1]),
    [M.skinS]: ramp(sk[0]),
    [M.skinH]: ramp(sk[2]),
    [M.eye]: ramp(EYE),
    [M.iris]: ramp(iris),
    [M.white]: ramp(EYE_LIT),
    [M.hair]: ramp(c.hair ?? c.suit),
    // 반대편 팔다리 — 색을 따로 주는 게 아니라 같은 색을 한 단 죽인다.
    // 다른 색을 쓰면 다른 재질로 보이고, 안 죽이면 앞뒤가 안 갈린다.
    [M.suitB]: ramp(mix(suit, COOL, 0.24)),
    [M.trimB]: ramp(mix(trim, COOL, 0.24)),
    [M.metalB]: ramp(mix(hex(c.metal), COOL, 0.24)),
  };

  const put = (x: number, y: number, col: RGB): void => {
    if (x < 0 || x >= CELL || y < 0 || y >= CELL) return;
    const i = (y * CELL + x) * 4;
    out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; out[i + 3] = alpha;
  };

  // 윤곽선 — 이웃 재질에서 색을 가져온다. 전부 같은 검정으로 두르면
  // 오려 붙인 스티커처럼 보인다. 빛 쪽 외곽은 조금 덜 어둡게 둔다.
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      if (m[y * CELL + x]) continue;
      const n = at(m, x, y + 1) || at(m, x + 1, y) || at(m, x, y - 1) || at(m, x - 1, y);
      if (!n) continue;
      const r = R[n as M];
      if (!r) continue;
      const lit = !at(m, x, y - 1) && !at(m, x - 1, y);
      put(x, y, lit ? r.edgeLit : r.edgeDark);
    }
  }

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const mat = m[y * CELL + x] as M;
      if (!mat) continue;
      const r = R[mat];
      if (!r) continue;
      // 발광체와 얼굴은 자동 음영을 안 먹인다 — 위 M 주석 참고
      if (mat === M.glow) { put(x, y, r.t[5]); continue; }
      if (mat === M.eye) { put(x, y, EYE); continue; }
      if (mat === M.white) { put(x, y, EYE_LIT); continue; }
      if (mat === M.iris) { put(x, y, iris); continue; }
      if (mat === M.skin) { put(x, y, sk[1]); continue; }
      if (mat === M.skinS) { put(x, y, sk[0]); continue; }
      if (mat === M.skinH) { put(x, y, sk[2]); continue; }

      const form = formTone(m, x, y);
      // 반사광 — 그늘 쪽 아랫면까지 완전히 죽이면 바닥에서 오려낸 것처럼
      // 보인다. 하늘빛이 튀어오른 한 줄을 넣어 아래쪽을 띄운다.
      if (form <= -1 && !at(m, x, y + 1) && at(m, x, y - 1)) { put(x, y, r.bounce); continue; }
      // 형태광과 파츠 디테일을 그냥 더하면 겹치는 자리가 하얗게 날아간다.
      // 위로는 두 단까지만 — 제일 밝은 칸은 발광체 몫으로 남겨 둔다.
      const d = Math.max(-3, Math.min(2, form + partTone(m, x, y)));
      put(x, y, r.t[Math.max(0, Math.min(6, 3 + d))]);
    }
  }
  return out;
}
