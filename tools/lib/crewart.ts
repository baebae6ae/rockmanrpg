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
  // 천 계열 — 금속과 같은 램프를 쓰면 옷이 번들거려서 갑옷으로 보인다.
  // 명암 폭이 좁고 하이라이트가 약한 별도 램프를 쓴다.
  cloth = 16, clothS = 17, clothB = 18,
  /** 머리카락 그늘 */
  hairS = 19,
  /** 눈썹 — 표정의 8할이 여기서 나온다 */
  brow = 20,
  /** 볼 홍조 */
  blush = 21,
  /** 입 — 살결 그늘로 그리면 얼룩으로 보인다 */
  mouth = 22,
  /** 천의 밝은 면 — 어깨 윗면·옷깃처럼 빛을 정면으로 받는 자리 */
  clothH = 23,
  /**
   * 또렷한 하이라이트 점 — 헬멧 능선·어깨 끝·부츠 코처럼 볼록한 자리에
   * 딱 한둘만 찍는다. formTone 그러데이션은 부드러운 대신 화면이
   * 밋밋해진다 — 록맨 X·제로 스프라이트가 또렷해 보이는 건 여기저기
   * 그러데이션 대신 볼록한 곳마다 새하얀 점 하나가 딱 박혀 있어서다.
   * 자동 음영을 끄고 고정 밝기로 찍는다.
   */
  spec = 24,
  /**
   * 관절용 강철 — 무릎·팔꿈치·손·견갑처럼 몸에 붙은 금속 전용. 대원마다
   * 다른 c.metal 은 그 대원의 무기(종의 놋쇠 종, 거울의 은색 손잡이 같은)
   * 색으로 남겨 두고, 몸에 박힌 관절만 옷과 확실히 다른 중성 강철색을
   * 쓴다 — 예전엔 관절이 옷을 그대로 밝힌 색이라 '같은 페인트의 밝은
   * 칸'으로만 보였다. 록맨류가 갑옷과 관절이 다른 재질로 읽히는 건
   * 색상 자체가 다르기 때문이지, 명암만 다르기 때문이 아니다.
   */
  joint = 25,
  jointB = 26,
}

/** 앞쪽 재질 → 반대편(뒤쪽) 재질 */
const BACK_OF: Partial<Record<M, M>> = {
  [M.suit]: M.suitB, [M.trim]: M.trimB,
  [M.metal]: M.metalB, [M.accent]: M.trimB,
  [M.cloth]: M.clothB, [M.clothS]: M.clothB, [M.clothH]: M.clothB,
  [M.joint]: M.jointB,
};

/**
 * 부품 그룹 — 다른 그룹끼리 맞닿으면 이음매에 선을 넣는다(아래
 * seamDarken 참고). 같은 그룹 안에서는 안 넣는다 — 몸통 안의 그늘·
 * 하이라이트 단끼리 전부 선이 생기면 다시 부서져 보인다.
 *
 * 록맨 X·제로가 또렷해 보이는 건 그러데이션이 아니라 부품마다(헬멧·
 * 얼굴·어깨·팔) 진한 선으로 나뉘어 있어서다. 얼굴 세부(눈·눈썹·입)와
 * 하이라이트 점은 이미 1~2px 짜리라 선을 더 넣으면 뭉개지므로 뺀다.
 */
const enum Fam { skin = 1, hair = 2, plate = 4, metal = 5, accent = 6, glow = 7 }
const FAMILY: Partial<Record<M, Fam>> = {
  [M.skin]: Fam.skin, [M.skinS]: Fam.skin, [M.skinH]: Fam.skin,
  [M.hair]: Fam.hair, [M.hairS]: Fam.hair,
  [M.suit]: Fam.plate, [M.trim]: Fam.plate, [M.suitB]: Fam.plate, [M.trimB]: Fam.plate,
  [M.cloth]: Fam.plate, [M.clothS]: Fam.plate, [M.clothB]: Fam.plate, [M.clothH]: Fam.plate,
  [M.metal]: Fam.metal, [M.metalB]: Fam.metal,
  [M.joint]: Fam.metal, [M.jointB]: Fam.metal,
  [M.accent]: Fam.accent,
  [M.glow]: Fam.glow,
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

/**
 * 채도를 밀어 올린다. 작업복이라고 무채색으로 가둬 뒀더니 록맨류
 * 스프라이트 옆에 놓으면 색이 죽어 보였다 — 채도가 아니라 명도 대비만
 * 조절하면 칙칙함은 그대로 남는다. 밝기(대략적인 luma)는 지키고
 * 거기서 벌어지는 만큼만 민다.
 */
export const saturate = (c: RGB, amt: number): RGB => {
  const y = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return [
    Math.max(0, Math.min(255, Math.round(y + (c[0] - y) * (1 + amt)))),
    Math.max(0, Math.min(255, Math.round(y + (c[1] - y) * (1 + amt)))),
    Math.max(0, Math.min(255, Math.round(y + (c[2] - y) * (1 + amt)))),
  ];
};

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

/**
 * 천·살결처럼 무른 것을 위한 램프.
 *
 * 예전엔 폭을 절반으로 좁혀서 '반사'가 아니라 '머금는' 느낌을 냈는데,
 * 그러다 보니 명암이 밋밋해서 록맨 X·제로 스프라이트 옆에 두면 색이
 * 죽어 보였다. 폭은 그대로 좁게 두되(주름마다 번쩍이면 갑옷이 되는
 * 건 여전히 맞다) 양 끝을 눌러 대비를 올렸다 — 부드럽게 머금으면서도
 * 또렷하게 갈린다.
 */
function softRamp(base: string | RGB): Ramp {
  const b = typeof base === 'string' ? hex(base) : base;
  return {
    t: [
      mix(b, COOL, 0.52), mix(b, COOL, 0.36), mix(b, COOL, 0.17), b,
      mix(b, LIGHT, 0.12), mix(b, LIGHT, 0.26), mix(b, LIGHT, 0.42),
    ],
    edgeLit: mix(b, COOL, 0.62),
    edgeDark: mix(b, COOL, 0.88),
    bounce: mix(mix(b, COOL, 0.34), BOUNCE, 0.30),
  };
}

/**
 * 살을 위한 램프 — formTone 자동 음영을 얼굴에 켜면서 놓친 게 있었다.
 * 그늘을 아무 생각 없이 ramp() 에 넣었더니 COOL(남색)로 68% 까지
 * 죽는 금속용 어두운 끝이 그대로 얼굴에 들어갔다. 위 skinTones() 주석에
 * 이미 적어 뒀던 원칙 — "살 그늘은 남색이 아니라 붉게 죽는다. 차갑게
 * 내리면 얼굴만 시체색이 된다" — 을 램프에서는 안 지킨 것이다. 그 결과가
 * "얼룩 같다"는 소리였다. 그늘을 SKIN_SHADE(붉은 갈색) 쪽으로, 폭도
 * 얼굴 크기에 맞게 훨씬 좁게 잡는다.
 */
function skinRamp(base: RGB): Ramp {
  return {
    t: [
      mix(base, SKIN_SHADE, 0.5), mix(base, SKIN_SHADE, 0.34), mix(base, SKIN_SHADE, 0.16), base,
      mix(base, LIGHT, 0.10), mix(base, LIGHT, 0.20), mix(base, LIGHT, 0.32),
    ],
    edgeLit: mix(base, SKIN_SHADE, 0.22),
    edgeDark: mix(base, SKIN_SHADE, 0.58),
    bounce: mix(base, BOUNCE, 0.14),
  };
}

/**
 * 금속·홍채처럼 단단한 것을 위한 램프. 대비를 한 단 더 올렸다 —
 * 어중간한 명암은 부드러워 보이는 게 아니라 색이 탁해 보인다.
 */
function ramp(base: string | RGB): Ramp {
  const b = typeof base === 'string' ? hex(base) : base;
  return {
    t: [
      mix(b, COOL, 0.68), mix(b, COOL, 0.48), mix(b, COOL, 0.24), b,
      mix(b, LIGHT, 0.18), mix(b, LIGHT, 0.38), mix(b, LIGHT, 0.62),
    ],
    edgeLit: mix(b, COOL, 0.70),
    edgeDark: mix(b, COOL, 0.90),
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
  /**
   * 타원 — 둥근 것 전부의 바탕이다.
   *
   * 이 게임의 대원들이 로봇처럼 보였던 제일 큰 이유가 몸이 전부 rect()
   * 였기 때문이다. 사각형만 쌓으면 아무리 색을 잘 칠해도 조립품으로
   * 읽힌다. 머리·어깨·몸통·손발을 전부 이걸로 잡는다.
   */
  blob(cx: number, cy: number, rx: number, ry: number, mat: M): void {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const nx = x / (rx + 0.5);
        const ny = y / (ry + 0.5);
        if (nx * nx + ny * ny <= 1) this.set(cx + x, cy + y, mat);
      }
    }
  }

  /** 끝이 둥근 굵은 선 — 팔다리용. line() 은 끝이 각져서 관절이 뭉툭해진다 */
  capsule(x0: number, y0: number, x1: number, y1: number, r: number, mat: M): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.blob(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), r, r, mat);
    }
  }

  /**
   * 모서리를 깎은 사각형. cut 만큼 네 귀퉁이를 대각선으로 잘라낸다.
   * 완전한 원이 어울리지 않는 자리(가슴판·가방)를 부드럽게 만든다.
   */
  soft(x: number, y: number, w: number, h: number, cut: number, mat: M): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const ex = Math.min(dx, w - 1 - dx);
        const ey = Math.min(dy, h - 1 - dy);
        if (ex + ey < cut) continue;
        this.set(x + dx, y + dy, mat);
      }
    }
  }

  /**
   * 위아래 폭이 다른 기둥 — 허리가 잘록한 몸통, 아래로 갈수록 가늘어지는
   * 다리처럼 '변하는 굵기'를 만든다. 같은 폭 사각형은 통나무로 보인다.
   */
  taper(cx: number, y0: number, y1: number, w0: number, w1: number, mat: M): void {
    const h = y1 - y0;
    for (let i = 0; i <= h; i++) {
      const t = h === 0 ? 0 : i / h;
      const half = (w0 + (w1 - w0) * t) / 2;
      const l = Math.round(cx - half);
      const r = Math.round(cx + half);
      for (let x = l; x <= r; x++) this.set(x, y0 + i, mat);
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
  // 작업복이라고 무채색으로 죽여 뒀더니 칙칙해 보였다 — 명도는 그대로
  // 두고 채도만 밀어 올린다.
  const suit = saturate(hex(c.suit), 0.28);
  const hair = saturate(hex(c.hair ?? c.suit), 0.2);
  const sk = skinTones(c.skin ?? '#e0a882').map((t) => saturate(t, 0.1)) as [RGB, RGB, RGB];
  const iris = saturate(hex(c.iris ?? c.glow), 0.2);
  const trim = mix(suit, COOL, 0.42);
  // 관절 강철 — 대원 옷 색과 무관한 고정 중성색. 아주 살짝만 그 대원의
  // 발광색을 머금여 아홉 명이 전부 똑같은 회색 관절을 달지 않게 한다.
  const STEEL: RGB = [150, 156, 166];
  const joint = mix(STEEL, hex(c.glow), 0.12);
  const R: Partial<Record<M, Ramp>> = {
    [M.suit]: ramp(suit),
    [M.trim]: ramp(trim),
    [M.metal]: ramp(saturate(hex(c.metal), 0.16)),
    [M.joint]: ramp(joint),
    [M.jointB]: ramp(mix(joint, COOL, 0.24)),
    [M.accent]: ramp(c.glow),
    [M.glow]: ramp(c.glow),
    [M.skin]: skinRamp(sk[1]),
    [M.skinS]: ramp(sk[0]),
    [M.skinH]: ramp(sk[2]),
    [M.eye]: ramp(EYE),
    [M.iris]: ramp(iris),
    [M.white]: ramp(EYE_LIT),
    // 머리카락도 이제 또렷한 램프로 — 애니메 머리 특유의 반짝임은
    // 무른 램프로는 안 나온다.
    [M.hair]: ramp(hair),
    // 반대편 팔다리 — 색을 따로 주는 게 아니라 같은 색을 한 단 죽인다.
    // 다른 색을 쓰면 다른 재질로 보이고, 안 죽이면 앞뒤가 안 갈린다.
    [M.suitB]: ramp(mix(suit, COOL, 0.24)),
    [M.trimB]: ramp(mix(trim, COOL, 0.24)),
    [M.metalB]: ramp(mix(saturate(hex(c.metal), 0.16), COOL, 0.24)),
    // 팔다리·몸통은 이제 갑옷판이다 — 부드러운 램프를 쓰면 록맨류
    // 옆에서 색이 죽어 보인다. 얼굴 쪽(눈썹·볼·입)만 softRamp 로 남긴다.
    [M.cloth]: ramp(suit),
    [M.clothS]: ramp(trim),
    [M.clothB]: ramp(mix(suit, COOL, 0.24)),
    [M.hairS]: ramp(mix(hair, COOL, 0.34)),
    [M.brow]: softRamp(mix(hair, COOL, 0.2)),
    [M.blush]: softRamp(mix(sk[1], [232, 118, 116], 0.44)),
    [M.mouth]: softRamp(mix(sk[0], [122, 60, 62], 0.5)),
    [M.clothH]: ramp(mix(suit, [255, 238, 214], 0.3)),
    [M.spec]: ramp(LIGHT),
  };
  // 하이라이트 점 — 살짝 따뜻하게, 완전한 흰색은 색이 빠져 보인다
  const SPEC: RGB = mix(LIGHT, hex(c.glow), 0.12);

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
      // 발광체·이목구비는 자동 음영을 안 먹인다 — 위 M 주석 참고.
      // 살(M.skin) 자체는 뺐다 — 이마·볼처럼 넓은 면이라 형태광을
      // 태워도 안 뭉개지는데, 계속 납작한 색으로 두면 팔다리는
      // 갑옷판으로 입체가 살아나는 옆에서 얼굴만 스티커처럼 붕 뜬다.
      if (mat === M.glow) { put(x, y, r.t[5]); continue; }
      if (mat === M.spec) { put(x, y, SPEC); continue; }
      if (mat === M.eye) { put(x, y, EYE); continue; }
      if (mat === M.white) { put(x, y, EYE_LIT); continue; }
      if (mat === M.iris) { put(x, y, iris); continue; }
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

  // 이음매 선 — 그룹이 다른 부품이 맞닿는 자리(아래·오른쪽 이웃)를
  // 한 번 더 죽인다. 위·왼쪽은 그대로 둬서 선이 한쪽에만 생기게 한다 —
  // 양쪽 다 죽이면 2px 짜리 두꺼운 선이 되어 이 해상도에서는 뭉갠다.
  const seamDarken = (x: number, y: number): void => {
    const i = (y * CELL + x) * 4;
    if (!out[i + 3]) return;
    const d = mix([out[i], out[i + 1], out[i + 2]], COOL, 0.4);
    out[i] = d[0]; out[i + 1] = d[1]; out[i + 2] = d[2];
  };
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const mat = m[y * CELL + x] as M;
      const fam = FAMILY[mat];
      if (!fam) continue;
      const famR = FAMILY[at(m, x + 1, y) as M];
      if (famR && famR !== fam) seamDarken(x + 1, y);
      const famD = FAMILY[at(m, x, y + 1) as M];
      if (famD && famD !== fam) seamDarken(x, y + 1);
    }
  }
  return out;
}
