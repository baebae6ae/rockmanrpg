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

export const CELL = 64;
const OX = 32;
const OY = 63;

export const enum M {
  none = 0, suit = 1, trim = 2, metal = 3, accent = 4, glow = 5,
  skin = 6, skinS = 7, skinH = 8,
  eye = 9, iris = 10, white = 11, hair = 12,
  suitB = 13, trimB = 14, metalB = 15,
  cloth = 16, clothS = 17, clothB = 18,
  hairS = 19, brow = 20, blush = 21, mouth = 22, clothH = 23,
  spec = 24, joint = 25, jointB = 26,
}

const BACK_OF: Partial<Record<M, M>> = {
  [M.suit]: M.suitB, [M.trim]: M.trimB,
  [M.metal]: M.metalB, [M.accent]: M.trimB,
  [M.cloth]: M.clothB, [M.clothS]: M.clothB, [M.clothH]: M.clothB,
  [M.joint]: M.jointB,
};

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

export type RGB = [number, number, number];
export const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
];
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** 색상 대비를 올리되 명도는 최대한 보존한다. */
export const saturate = (c: RGB, amt: number): RGB => {
  const y = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return [
    Math.max(0, Math.min(255, Math.round(y + (c[0] - y) * (1 + amt)))),
    Math.max(0, Math.min(255, Math.round(y + (c[1] - y) * (1 + amt)))),
    Math.max(0, Math.min(255, Math.round(y + (c[2] - y) * (1 + amt)))),
  ];
};

// 검정 대신 청색이 섞인 구조 그림자. 배경과 캐릭터가 같은 검정으로 붙지 않는다.
const COOL: RGB = [10, 18, 34];
// 순백 대신 차가운 청백. 하이라이트가 누렇게 떠 보이는 것을 막는다.
const LIGHT: RGB = [232, 247, 255];
const BOUNCE: RGB = [66, 124, 182];
const EYE: RGB = [12, 16, 28];
const EYE_LIT: RGB = [244, 251, 255];
const SKIN_SHADE: RGB = [104, 52, 60];

function skinTones(base: string): [RGB, RGB, RGB] {
  const b = hex(base);
  return [mix(b, SKIN_SHADE, 0.5), b, mix(b, LIGHT, 0.3)];
}

interface Ramp { t: RGB[]; edgeLit: RGB; edgeDark: RGB; bounce: RGB }

function softRamp(base: string | RGB): Ramp {
  const b = typeof base === 'string' ? hex(base) : base;
  return {
    t: [
      mix(b, COOL, 0.52), mix(b, COOL, 0.36), mix(b, COOL, 0.17), b,
      mix(b, LIGHT, 0.10), mix(b, LIGHT, 0.22), mix(b, LIGHT, 0.38),
    ],
    edgeLit: mix(b, COOL, 0.62),
    edgeDark: mix(b, COOL, 0.88),
    bounce: mix(mix(b, COOL, 0.34), BOUNCE, 0.30),
  };
}

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

function ramp(base: string | RGB): Ramp {
  const b = typeof base === 'string' ? hex(base) : base;
  return {
    t: [
      mix(b, COOL, 0.68), mix(b, COOL, 0.48), mix(b, COOL, 0.24), b,
      mix(b, LIGHT, 0.16), mix(b, LIGHT, 0.34), mix(b, LIGHT, 0.56),
    ],
    edgeLit: mix(b, COOL, 0.70),
    edgeDark: mix(b, COOL, 0.90),
    bounce: mix(mix(b, COOL, 0.44), BOUNCE, 0.34),
  };
}

/**
 * 갑옷판(suit/trim) 전용 — 캐릭터 속성색(glow)을 밝은 쪽 가장자리에
 * 섞어서 "에너지 림라이트"를 준다. 지금까지는 명암 전체가 COOL(청색)
 * 한 방향으로만 갈려서, 캐릭터마다 색은 달라도 입체감의 성격은 하나로
 * 똑같았다 — 참고 시안들은 캐릭터 속성색이 갑옷 테두리에 은은히
 * 번져 있어서 그게 개성으로 읽힌다. 밝은 가장자리 색 하나(edgeLit)와
 * 가장 밝은 하이라이트 계단(t[6])만 속성색 쪽으로 밀어서, 베이스
 * 색과 어두운 쪽은 그대로 두고 "빛나는 쪽"만 캐릭터 색을 낸다.
 */
function rampRim(base: string | RGB, glow: RGB, amt: number): Ramp {
  const r = ramp(base);
  return {
    ...r,
    edgeLit: mix(r.edgeLit, glow, amt),
    t: [r.t[0], r.t[1], r.t[2], r.t[3], r.t[4], mix(r.t[5], glow, amt * 0.5), mix(r.t[6], glow, amt * 0.7)],
  };
}

export class F {
  m = new Uint8Array(CELL * CELL);
  private dx = 0;
  private dy = 0;
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
  blob(cx: number, cy: number, rx: number, ry: number, mat: M): void {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const nx = x / (rx + 0.5);
        const ny = y / (ry + 0.5);
        if (nx * nx + ny * ny <= 1) this.set(cx + x, cy + y, mat);
      }
    }
  }
  capsule(x0: number, y0: number, x1: number, y1: number, r: number, mat: M): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.blob(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), r, r, mat);
    }
  }
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

export function bevel(f: F, x: number, y: number, w: number, h: number): void {
  f.set(x, y + h - 1, M.none);
  f.set(x + w - 1, y + h - 1, M.none);
}

const at = (m: Uint8Array, x: number, y: number): number =>
  x < 0 || x >= CELL || y < 0 || y >= CELL ? 0 : m[y * CELL + x];

const FORM_R = 6;
function formTone(m: Uint8Array, cx: number, cy: number): number {
  let lit = FORM_R + 1;
  let sh = FORM_R + 1;
  for (let i = 1; i <= FORM_R; i++) if (!at(m, cx - i, cy - i)) { lit = i; break; }
  for (let i = 1; i <= FORM_R; i++) if (!at(m, cx + i, cy + i)) { sh = i; break; }
  return Math.max(-2, Math.min(2, Math.round((sh - lit) / 2)));
}

function partTone(m: Uint8Array, cx: number, cy: number): number {
  const mat = at(m, cx, cy);
  const up = at(m, cx, cy - 1);
  let d = 0;
  if (!up) d += 1;
  else if (up !== mat) d -= 1;
  if (!at(m, cx, cy + 1)) d -= 1;
  if (!at(m, cx - 1, cy)) d += 1;
  return Math.max(-1, Math.min(1, d));
}

export interface CrewPal {
  suit: string; metal: string; glow: string;
  /** 갑옷 트림(테두리) 색. 시안 아홉은 속성색과 별개로 전원 금색
   * 트림을 두르고 있다 — 이걸 glow 와 같이 쓰면 속성색이 몸 전체
   * 테두리로 번져서 아홉이 다 제 속성색 옷을 입은 꼴이 된다. */
  gold?: string;
  skin?: string; iris?: string; hair?: string;
}

export function paint(f: F, c: CrewPal, alpha = 255): Uint8Array {
  const m = f.m;
  const out = new Uint8Array(CELL * CELL * 4);
  // 캐릭터끼리 색은 다르지만 명암 구조는 하나다. 채도를 살짝 밀어 올려
  // 어두운 스테이지에서도 팀 컬러가 묻히지 않게 한다.
  const suit = saturate(hex(c.suit), 0.34);
  const hair = saturate(hex(c.hair ?? c.suit), 0.24);
  const sk = skinTones(c.skin ?? '#e0a882').map((t) => saturate(t, 0.1)) as [RGB, RGB, RGB];
  const iris = saturate(hex(c.iris ?? c.glow), 0.24);
  const trim = mix(suit, COOL, 0.40);
  const STEEL: RGB = [146, 164, 184];
  const joint = mix(STEEL, hex(c.glow), 0.10);
  const glowRGB = hex(c.glow);
  const R: Partial<Record<M, Ramp>> = {
    [M.suit]: rampRim(suit, glowRGB, 0.4), [M.trim]: rampRim(trim, glowRGB, 0.4),
    [M.metal]: ramp(saturate(hex(c.metal), 0.18)),
    [M.joint]: ramp(joint), [M.jointB]: ramp(mix(joint, COOL, 0.24)),
    [M.accent]: ramp(c.gold ?? c.glow), [M.glow]: ramp(c.glow),
    [M.skin]: skinRamp(sk[1]), [M.skinS]: ramp(sk[0]), [M.skinH]: ramp(sk[2]),
    [M.eye]: ramp(EYE), [M.iris]: ramp(iris), [M.white]: ramp(EYE_LIT),
    [M.hair]: ramp(hair),
    [M.suitB]: ramp(mix(suit, COOL, 0.24)), [M.trimB]: ramp(mix(trim, COOL, 0.24)),
    [M.metalB]: ramp(mix(saturate(hex(c.metal), 0.18), COOL, 0.24)),
    [M.cloth]: ramp(suit), [M.clothS]: ramp(trim), [M.clothB]: ramp(mix(suit, COOL, 0.24)),
    [M.hairS]: ramp(mix(hair, COOL, 0.34)),
    [M.brow]: softRamp(mix(hair, COOL, 0.2)),
    [M.blush]: softRamp(mix(sk[1], [232, 118, 116], 0.44)),
    [M.mouth]: softRamp(mix(sk[0], [122, 60, 62], 0.5)),
    [M.clothH]: ramp(mix(suit, [220, 242, 252], 0.3)),
    [M.spec]: ramp(LIGHT),
  };
  const SPEC: RGB = mix(LIGHT, hex(c.glow), 0.12);

  const put = (x: number, y: number, col: RGB, a = alpha): void => {
    if (x < 0 || x >= CELL || y < 0 || y >= CELL) return;
    const i = (y * CELL + x) * 4;
    out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; out[i + 3] = a;
  };

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      if (m[y * CELL + x]) continue;
      const nD = at(m, x, y + 1), nR = at(m, x + 1, y), nU = at(m, x, y - 1), nL = at(m, x - 1, y);
      const n = nD || nR || nU || nL;
      if (!n) continue;
      const r = R[n as M];
      if (!r) continue;
      const lit = !nU && !nL;
      const touching = (nD ? 1 : 0) + (nR ? 1 : 0) + (nU ? 1 : 0) + (nL ? 1 : 0);
      const a = touching === 1 ? Math.round(alpha * 0.62) : alpha;
      put(x, y, lit ? r.edgeLit : r.edgeDark, a);
    }
  }

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const mat = m[y * CELL + x] as M;
      if (!mat) continue;
      const r = R[mat];
      if (!r) continue;
      if (mat === M.glow) { put(x, y, r.t[5]); continue; }
      if (mat === M.spec) { put(x, y, SPEC); continue; }
      if (mat === M.eye) { put(x, y, EYE); continue; }
      if (mat === M.white) { put(x, y, EYE_LIT); continue; }
      if (mat === M.iris) { put(x, y, iris); continue; }
      // 살은 음영을 안 먹인다. 얼굴이 4등신에 맞춰 폭 11px 로 작아지면서
      // 그러데이션 한 단이 얼굴의 3할을 차지하게 됐고, 그러니 입체가
      // 아니라 얼룩으로 보인다. 참조인 X4 도 이 크기의 얼굴엔 음영을
      // 넣지 않는다 — 살빛은 한 색, 입체는 실루엣과 머리카락 경계선이 낸다.
      if (mat === M.skin) { put(x, y, sk[1]); continue; }
      if (mat === M.skinS) { put(x, y, sk[0]); continue; }
      if (mat === M.skinH) { put(x, y, sk[2]); continue; }
      const form = formTone(m, x, y);
      if (form <= -1 && !at(m, x, y + 1) && at(m, x, y - 1)) { put(x, y, r.bounce); continue; }
      const d = Math.max(-3, Math.min(2, form + partTone(m, x, y)));
      put(x, y, r.t[Math.max(0, Math.min(6, 3 + d))]);
    }
  }

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
