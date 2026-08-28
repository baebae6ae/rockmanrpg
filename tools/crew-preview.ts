/**
 * 《균열 회수반》 아홉 대원 — 채색 프리뷰.
 *
 * 실루엣 검증(tools/crew-silhouette.ts)을 통과한 아홉에 파츠와 명암을 얹는다.
 * 아직 gen-placeholder.ts 와 연결되어 있지 않다 — 화풍이 확정되면
 * 여기 파츠·램프를 그쪽 생성기로 옮기고 애니메이션 프레임을 붙인다.
 *
 * 명암은 손으로 칠하지 않는다. 재질 버퍼를 만들어 두고 가장자리를 읽어서
 * 자동으로 배정한다. 이 방식이라야 파츠를 새로 추가해도 톤이 안 깨진다.
 *
 * 실행: npx tsx tools/crew-preview.ts out.png     (SC=배율 CO=열수)
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const CELL = 64;
const SCALE = Number(process.env.SC ?? 6);
const COLS = Number(process.env.CO ?? 3);

/**
 * 재질 — 같은 재질끼리 같은 램프를 쓴다.
 *   suit  본체 색        trim  부츠·장갑·벨트 (본체에서 어둡게 파생)
 *   metal 장비           accent 밝은 테두리 (강조색을 음영 먹여 쓴다)
 *   glow  발광체         hair  머리카락
 *   skin  살             skinS 살 그늘      skinH 살 하이라이트
 *   eye   속눈썹·동공     iris  홍채        white 흰자·눈빛
 *
 * 얼굴 쪽 재질은 전부 자동 음영을 끄고 고정색으로 박는다. 이목구비가
 * 한두 픽셀이라 톤 램프를 태우면 눈·코·입이 서로 뭉개져 사라진다.
 */
const enum M {
  none = 0, suit = 1, trim = 2, metal = 3, accent = 4, glow = 5,
  skin = 6, skinS = 7, skinH = 8,
  eye = 9, iris = 10, white = 11, hair = 12,
}

// ---------------------------------------------------------------- 색
type RGB = [number, number, number];
const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const WHITE: RGB = [255, 255, 255];
/** 밝은 쪽은 순백이 아니라 따뜻한 빛으로 민다 — 흰색으로 올리면 색이 빠진다 */
const LIGHT: RGB = [255, 246, 222];
/** 어두운 쪽은 검정이 아니라 차가운 남색으로 민다 — 검정으로 내리면 도트가 죽는다 */
const COOL: RGB = [22, 26, 44];
/** 눈은 2px 밖에 안 돼서 음영을 먹이면 뭉개진다. 고정색으로 박는다 */
const EYE: RGB = [26, 22, 40];
const EYE_LIT: RGB = [246, 248, 255];
/**
 * 살 그늘은 남색이 아니라 붉게 죽는다. 다른 재질처럼 COOL 로 내리면
 * 얼굴만 시체색이 되어 혼자 튄다.
 */
const SKIN_SHADE: RGB = [104, 52, 60];
/** 살 3단 — 그늘 / 기본 / 광대·콧대 하이라이트 */
function skinTones(base: string): [RGB, RGB, RGB] {
  const b = hex(base);
  return [mix(b, SKIN_SHADE, 0.5), b, mix(b, WHITE, 0.3)];
}

/** 바닥에서 튀어오르는 반사광. 하늘빛이라 차갑다 */
const BOUNCE: RGB = [84, 118, 172];

/**
 * 7단 램프 + 윤곽선 두 단(빛 쪽 / 그늘 쪽) + 반사광.
 *
 * 5단으로는 부족했다. 형태광과 파츠 경계를 겹쳐 쓰려면 가운데가 넉넉해야
 * 하는데, 5단이면 둘 중 하나만 세게 먹여도 곧바로 끝(0 또는 4)에 붙어서
 * 계단이 뭉텅뭉텅 진다.
 */
interface Ramp { t: RGB[]; edgeLit: RGB; edgeDark: RGB; bounce: RGB }
function ramp(base: string | RGB): Ramp {
  const b = typeof base === 'string' ? hex(base) : base;
  return {
    t: [
      mix(b, COOL, 0.62),
      mix(b, COOL, 0.44),
      mix(b, COOL, 0.23),
      b,
      mix(b, LIGHT, 0.15),
      mix(b, LIGHT, 0.32),
      mix(b, LIGHT, 0.55),
    ],
    edgeLit: mix(b, COOL, 0.70),
    edgeDark: mix(b, COOL, 0.88),
    bounce: mix(mix(b, COOL, 0.44), BOUNCE, 0.34),
  };
}

// ---------------------------------------------------------------- 버퍼
class F {
  m = new Uint8Array(CELL * CELL);
  /** x: 중앙 기준, y: 발바닥 기준(위가 양수) */
  set(x: number, y: number, mat: M): void {
    const cx = 32 + Math.round(x);
    const cy = 63 - Math.round(y);
    if (cx < 0 || cx >= CELL || cy < 0 || cy >= CELL) return;
    this.m[cy * CELL + cx] = mat;
  }
  rect(x: number, y: number, w: number, h: number, mat: M): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, mat);
  }
  disc(cx: number, cy: number, r: number, mat: M): void {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) this.set(cx + x, cy + y, mat);
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
 * 보인다. 꼭짓점 두 개만 지워도 판이 둥글게 다듬어진 것으로 읽힌다.
 */
function bevel(f: F, x: number, y: number, w: number, h: number): void {
  f.set(x, y + h - 1, M.none);
  f.set(x + w - 1, y + h - 1, M.none);
}

// ---------------------------------------------------------------- 공용 몸
/**
 * 아홉이 공유하는 사람 몸. 여기가 갈리면 한 팀으로 안 보인다.
 * 개성은 전부 장비(build)가 낸다.
 *
 * 판을 나누는 선(무릎·팔꿈치·벨트·가슴판)이 있어야 한 덩어리가 아니라
 * 조립된 장구로 읽힌다. 다만 가로선만 늘어놓으면 40px 에서는 갑옷이 아니라
 * 줄무늬 옷으로 보인다 — 세로 솔기를 섞어야 판이 판으로 읽힌다.
 *
 * s 는 체격이다(-1 마른 / 0 보통 / +1 두꺼운). 아홉이 전부 같은 굵기면
 * 색만 다른 같은 사람이 아홉 있는 것이지 팀이 아니다. 다만 골격 자체는
 * 안 건드린다 — 관절 위치가 갈리면 애니메이션을 아홉 벌 만들어야 한다.
 */
function body(f: F, s: number): void {
  // 부츠 — 발이 커야 록맨 계열 실루엣이 선다
  f.rect(-7 - s, 0, 6 + s, 5, M.trim);
  f.rect(1, 0, 6 + s, 5, M.trim);
  f.rect(-7 - s, 4, 6 + s, 1, M.accent);
  f.rect(1, 4, 6 + s, 1, M.accent);
  f.rect(-7 - s, 1, 6 + s, 1, M.metal);  // 발목 링
  f.rect(1, 1, 6 + s, 1, M.metal);
  f.rect(-8 - s, 0, 1, 2, M.trim);       // 밑창이 밖으로 벌어진다 —
  f.rect(7 + s, 0, 1, 2, M.trim);        // 직육면체는 부츠로 안 읽힌다

  f.rect(-5 - s, 5, 4 + s, 5, M.suit);   // 정강이
  f.rect(1, 5, 4 + s, 5, M.suit);
  f.rect(-6 - s, 9, 5 + s, 3, M.metal);  // 무릎 판
  f.rect(1, 9, 5 + s, 3, M.metal);
  f.set(-6 - s, 9, M.none); f.set(5 + s, 9, M.none);
  f.rect(-5 - s, 12, 4 + s, 4, M.suit);  // 허벅지
  f.rect(1, 12, 4 + s, 4, M.suit);
  f.rect(-5 - s, 12, 1, 4, M.trim);      // 바깥쪽 솔기
  f.rect(4 + s, 12, 1, 4, M.trim);
  f.rect(-5 - s, 15, 4 + s, 1, M.trim);
  f.rect(1, 15, 4 + s, 1, M.trim);

  f.rect(-4 - s, 15, 8 + 2 * s, 4, M.suit);  // 허리
  f.rect(-5 - s, 13, 10 + 2 * s, 2, M.trim); // 벨트
  f.rect(-1, 13, 2, 2, M.accent);            // 버클

  f.rect(-6 - s, 18, 12 + 2 * s, 8, M.suit); // 가슴
  f.rect(-5 - s, 18, 10 + 2 * s, 1, M.trim); // 복부 구분선
  f.rect(-4 - s, 20, 8 + 2 * s, 4, M.metal); // 가슴판
  f.rect(-4 - s, 20, 1, 4, M.trim);          // 가슴판 옆선 — 가로줄만
  f.rect(3 + s, 20, 1, 4, M.trim);           // 있으면 몸이 줄무늬가 된다
  f.rect(-4 - s, 23, 8 + 2 * s, 1, M.accent);
  f.rect(-2, 21, 4, 2, M.glow);              // 코어

  f.rect(-10 - s, 16, 4, 8, M.suit);         // 팔
  f.rect(6 + s, 16, 4, 8, M.suit);
  f.rect(-10 - s, 19, 4, 1, M.trim);         // 팔꿈치
  f.rect(6 + s, 19, 4, 1, M.trim);
  f.rect(-11 - s, 14, 5, 4, M.trim);         // 장갑
  f.rect(6 + s, 14, 5, 4, M.trim);
  f.rect(-11 - s, 16, 1, 2, M.suit);         // 엄지
  f.rect(10 + s, 16, 1, 2, M.suit);

  f.rect(-10 - s, 23, 6 + s, 5, M.metal);    // 어깨 패드
  f.rect(4, 23, 6 + s, 5, M.metal);
  f.rect(-10 - s, 27, 6 + s, 1, M.accent);
  f.rect(4, 27, 6 + s, 1, M.accent);
  f.rect(-9 - s, 24, 1, 1, M.accent);        // 리벳
  f.rect(8 + s, 24, 1, 1, M.accent);
  f.set(-10 - s, 27, M.none); f.set(9 + s, 27, M.none);

  f.rect(-2, 26, 4, 2, M.trim);              // 목
  // 머리는 대원마다 다르다 — HEADS 가 따로 그린다
}

/**
 * 얼굴 — 록맨류의 핵심은 "헬멧이 얼굴을 감싸되 가리지 않는다"는 것이다.
 * 바이저로 덮어버리면 로봇이 되고, 눈이 보이면 사람이 된다.
 *
 * 눈을 두 점 찍는 걸로는 얼굴이 안 된다. 이목구비가 얼굴로 읽히려면
 * 아래 다섯 개가 다 있어야 한다 — 하나만 빠져도 가면처럼 보인다.
 *
 *   1. 턱으로 좁아지는 윤곽   네모난 살덩이는 사람 머리가 아니다
 *   2. 눈썹뼈 그늘            표정은 눈이 아니라 눈 '위'에서 나온다
 *   3. 속눈썹(윗선)           없으면 눈이 아니라 뚫린 구멍이다
 *   4. 흰자 + 홍채            검은 점 하나로는 시선이 안 생긴다
 *   5. 콧대 + 입              얼굴 가운데가 비면 눈만 붙인 판이 된다
 *
 * 좌표: 얼굴은 x -4..4, y 28..34 를 쓴다. 헬멧은 이 상자를 안 넘는다.
 */
function face(f: F): void {
  // 1. 윤곽 — 위는 넓고 턱으로 갈수록 좁아진다
  f.rect(-4, 30, 9, 5, M.skin);
  f.rect(-3, 29, 7, 1, M.skin);
  f.rect(-2, 28, 5, 1, M.skin);

  // 2. 눈썹뼈 — 눈 위에 그늘이 앉아야 눈이 안으로 들어간다.
  //    검게 칠하면 눈썹이 되어 화난 얼굴이 되므로 살 그늘로 둔다
  f.rect(-4, 33, 3, 1, M.skinS);
  f.rect(2, 33, 3, 1, M.skinS);

  // 3. 속눈썹 — 눈의 윗선
  f.rect(-4, 32, 3, 1, M.eye);
  f.rect(2, 32, 3, 1, M.eye);

  // 4. 눈 — 흰자 / 홍채 / 바깥 눈꼬리.
  //    흰자는 양쪽 다 광원 쪽(왼쪽)에 둔다. 좌우 대칭으로 찍으면
  //    두 눈이 서로 다른 데를 보는 사시가 된다
  f.set(-4, 31, M.white); f.set(-3, 31, M.iris); f.set(-2, 31, M.eye);
  f.set(2, 31, M.white); f.set(3, 31, M.iris); f.set(4, 31, M.eye);

  // 5. 콧대 — 능선은 1px 이어야 한다. 두 칸을 밝히면 코가 아니라
  //    얼굴 한가운데를 지나는 흰 줄이 된다
  f.rect(-1, 30, 1, 3, M.skinH);
  f.set(0, 30, M.skinS);           // 콧방울 그늘

  // 볼 그늘 — 옆면이 돌아 들어가는 자리
  f.set(-4, 30, M.skinS); f.set(4, 30, M.skinS);

  // 입 — 다문 선 두 칸. 세 칸을 넘기면 벌린 입이 된다
  f.rect(-1, 29, 2, 1, M.skinS);

  // 턱은 밝게 남긴다. 여기까지 그늘로 덮으면 아래턱이 시커메져서
  // 수염이나 마스크처럼 읽힌다 — 어두운 건 밑에 붙은 목이면 충분하다
  f.rect(-1, 28, 2, 1, M.skinH);
}

/**
 * 머리 — 아홉을 가르는 제일 중요한 파츠.
 *
 * 각자 하는 일에서 머리 모양이 나오게 잡았다. 불을 지르는 놈은 방독면을
 * 쓰고, 제일 시끄러운 무기를 든 놈은 귀를 막고, 저격수는 한쪽 눈을
 * 조준경으로 덮는다 — 설정이 생김새를 설명해야 기억에 남는다.
 *
 * 전부 face() 를 먼저 깔고 그 위에 헬멧을 두른다.
 * 얼굴 자리(x -3..3, y 29..34)를 비워두는 게 규칙이다.
 */
type Head = (f: F) => void;

const HEADS: Record<string, Head> = {
  // 못 — 정면으로 얻어맞는 자리다. 두꺼운 통짜 헬멧에 볼가리개와 턱끈까지
  '못': (f) => {
    face(f);
    f.rect(-6, 35, 13, 5, M.suit);
    f.rect(-6, 39, 13, 1, M.metal);
    bevel(f, -6, 35, 13, 5);
    f.rect(-2, 40, 5, 2, M.metal);   // 볏
    f.rect(-6, 35, 13, 1, M.accent); // 이마 띠
    f.rect(-7, 30, 3, 5, M.metal);   // 볼가리개
    f.rect(5, 30, 3, 5, M.metal);
    f.rect(-7, 32, 3, 1, M.accent);
    f.rect(5, 32, 3, 1, M.accent);
    f.rect(-7, 28, 2, 2, M.trim);    // 턱끈
    f.rect(6, 28, 2, 2, M.trim);
  },
  // 종 — 자기 무기가 제일 시끄럽다. 귀를 크게 덮는다
  '종': (f) => {
    face(f);
    f.rect(-5, 35, 11, 4, M.suit);
    f.rect(-5, 38, 11, 1, M.metal);
    f.rect(-5, 35, 11, 1, M.accent);
    bevel(f, -5, 35, 11, 4);
    f.rect(-9, 29, 4, 7, M.metal);   // 귀덮개
    f.rect(6, 29, 4, 7, M.metal);
    f.rect(-9, 32, 4, 1, M.accent);
    f.rect(6, 32, 4, 1, M.accent);
    f.rect(-8, 30, 2, 1, M.glow);    // 통신 램프
  },
  // 불씨 — 불을 지르는 놈이라 방독면. 입은 가리고 눈은 내놓는다
  '불씨': (f) => {
    face(f);
    // 마스크는 얼굴보다 넓게 튀어나와야 '쓴 것'으로 보인다. 얼굴 폭에
    // 딱 맞추면 그냥 살색 위에 얹은 띠로 읽힌다
    // 어깨 폭까지 넓히면 마스크가 아니라 목깃으로 읽힌다. 얼굴보다 한 칸씩만
    // 넓게 두고, 대신 광대 위로 끈을 올려 '묶어 쓴 것'으로 만든다.
    f.rect(-5, 28, 11, 3, M.metal);  // 코 아래를 덮는 마스크
    f.rect(-5, 30, 11, 1, M.trim);   // 마스크 윗단이 눈 밑에 드리운 그늘
    f.rect(-5, 28, 11, 1, M.accent); // 아랫단
    f.rect(-2, 29, 5, 1, M.trim);    // 배기 그릴
    f.set(-1, 29, M.metal); f.set(1, 29, M.metal);
    f.rect(-6, 30, 1, 5, M.trim);    // 광대를 타고 올라간 끈
    f.rect(5, 30, 1, 5, M.trim);
    f.rect(6, 28, 3, 4, M.metal);    // 옆으로 나온 필터통
    f.rect(6, 30, 3, 1, M.accent);
    f.rect(-5, 35, 11, 4, M.suit);
    f.rect(-5, 38, 11, 1, M.metal);
    f.rect(-5, 35, 11, 1, M.accent);
    bevel(f, -5, 35, 11, 4);
  },
  // 거울 — 제 빛에 눈이 상한다. 챙을 길게 빼서 그늘을 만든다
  '거울': (f) => {
    face(f);
    f.rect(-5, 35, 11, 3, M.suit);
    f.rect(-8, 37, 16, 2, M.metal);  // 긴 챙
    f.rect(-8, 37, 16, 1, M.accent);
    f.rect(-4, 34, 9, 1, M.skinS);   // 챙이 이마에 드리운 그늘
    f.rect(-5, 34, 2, 1, M.hair);    // 챙 밑으로 빠져나온 앞머리
    f.rect(4, 34, 2, 1, M.hair);
    f.rect(-7, 30, 2, 5, M.metal);
    f.rect(5, 30, 2, 5, M.metal);
  },
  // 바늘 — 후드. 조준경이 한쪽 눈을 덮는다
  '바늘': (f) => {
    face(f);
    // 후드는 위로 뻗는 뿔이 아니라 뒤로 흘러내리는 천이다 — 정수리를
    // 덮고 어깨 뒤로 늘어뜨린다. 위로 세우면 새 부리처럼 보인다.
    f.rect(-6, 35, 13, 5, M.suit);
    f.rect(-7, 36, 1, 3, M.trim);
    f.rect(-10, 30, 3, 8, M.suit);   // 어깨 뒤로 흘러내린 자락
    f.rect(-10, 30, 3, 1, M.trim);
    f.rect(-7, 31, 2, 4, M.suit);    // 볼을 감싸는 천
    f.rect(5, 31, 2, 4, M.suit);
    f.rect(-6, 34, 13, 1, M.trim);   // 후드가 이마에 드리운 그늘
    f.rect(1, 30, 5, 4, M.metal);    // 조준경 — 오른눈만 덮는다
    f.rect(2, 31, 3, 2, M.glow);
  },
  // 반딧불 — 유도탄을 부리려면 안테나가 있어야 한다
  '반딧불': (f) => {
    face(f);
    f.rect(-5, 35, 11, 4, M.suit);
    f.rect(-5, 38, 11, 1, M.metal);
    f.rect(-5, 35, 11, 1, M.accent);
    f.rect(-3, 39, 1, 4, M.metal);   // 안테나
    f.rect(3, 39, 1, 4, M.metal);
    f.rect(-3, 43, 1, 1, M.glow);
    f.rect(3, 43, 1, 1, M.glow);
    f.rect(-5, 34, 2, 1, M.hair);    // 헬멧 밖으로 삐져나온 앞머리
    f.rect(4, 34, 2, 1, M.hair);
    f.rect(-7, 30, 2, 5, M.metal);
    f.rect(5, 30, 2, 5, M.metal);
  },
  // 도끼 — 혼자 헬멧을 안 쓴다. 맨머리에 머리띠 하나
  '도끼': (f) => {
    face(f);
    f.rect(-5, 36, 11, 3, M.hair);   // 정수리
    f.rect(-6, 31, 1, 6, M.hair);    // 옆머리
    f.rect(5, 31, 1, 6, M.hair);
    f.rect(-5, 35, 11, 1, M.accent); // 머리띠
    f.rect(-8, 35, 3, 2, M.accent);  // 뒤로 흐르는 자락
    f.rect(-4, 34, 2, 1, M.hair);    // 띠 밑으로 내려온 앞머리
    f.rect(3, 34, 2, 1, M.hair);
  },
  // 작살 — 위로 솟은 얇은 볏 + 볼가리개
  '작살': (f) => {
    face(f);
    f.rect(-5, 35, 11, 3, M.suit);
    f.rect(-5, 37, 11, 1, M.metal);
    bevel(f, -5, 35, 11, 3);
    f.rect(-1, 38, 2, 5, M.metal);   // 볏
    f.rect(-1, 43, 2, 1, M.glow);
    f.rect(-5, 35, 11, 1, M.accent);
    f.rect(-7, 29, 2, 6, M.metal);
    f.rect(5, 29, 2, 6, M.metal);
    f.rect(-7, 33, 2, 1, M.glow);    // 귀 옆 산소 램프
    f.rect(5, 33, 2, 1, M.glow);
  },
  // 사슬 — 아래 얼굴을 천으로 가리고 눈만 내놓는다
  '사슬': (f) => {
    face(f);
    f.rect(-5, 28, 11, 3, M.trim);   // 입을 가린 천
    f.rect(-5, 30, 11, 1, M.suit);   // 천의 윗단
    f.rect(-6, 35, 12, 3, M.suit);
    bevel(f, -6, 35, 12, 3);
    f.line(-5, 36, -12, 32, 3, M.suit);
    f.rect(-6, 34, 12, 1, M.trim);   // 이마에 드리운 그늘
    f.rect(-7, 31, 2, 4, M.suit);
    f.rect(5, 31, 2, 4, M.suit);
  },
};

/**
 * 장비. s(체격)를 받는 이유는 하나뿐이다 — 체격이 바뀌면 손 위치가
 * 같이 움직이는데, 무기를 고정 좌표에 그리면 손에서 떨어져 공중에 뜬다.
 *
 * 오른손: x 6+s .. 10+s, y 14..17   왼손: x -11-s .. -7-s, y 14..17
 */
type Build = (f: F, s: number) => void;
interface Crew {
  name: string; suit: string; metal: string; glow: string;
  /** 살색 — 여기서 그늘·하이라이트를 파생한다 */
  skin: string;
  /** 홍채 — 아홉을 가르는 제일 싼 수단이다. 눈 색이 다르면 남으로 보인다 */
  iris: string;
  /** 머리카락 — 헬멧 밖으로 나오는 대원만 실제로 보인다 */
  hair: string;
  /** 체격 — -1 마른 / 0 보통 / +1 두꺼운 */
  bulk: -1 | 0 | 1;
  build: Build;
}

/** 앞쪽 = 오른쪽(+x), 등 = 왼쪽(-x). 장비는 머리 상자를 침범하지 않는다. */
const CREW: Crew[] = [
  {
    name: '못', suit: '#3f4756', metal: '#aab4c2', glow: '#ff9a4c', skin: '#e0a882',
    iris: '#c9743c', hair: '#2e2a30',
    bulk: 1,
    build: (f, s) => {
      const hx = 8 + s;                              // 오른손
      f.rect(hx - 2, 13, 6, 6, M.trim);              // 손에 쥔 뭉치
      f.line(hx + 2, 17, hx + 13, 23, 7, M.metal);   // 위로 겨눈 캐논
      f.line(hx + 2, 19, hx + 12, 25, 2, M.trim);
      f.rect(hx + 11, 22, 3, 3, M.accent);           // 총구
    },
  },
  {
    name: '종', suit: '#6b5a34', metal: '#c9a04a', glow: '#ffe08a', skin: '#c98c62',
    iris: '#e0b45a', hair: '#4a3824',
    bulk: 1,
    build: (f, s) => {
      // 등에 매달면 무슨 모양이든 망토로 읽힌다 — 손에 들려 낮게 내린다.
      // 위가 통이고 아래만 벌어져야 종이 된다.
      const bx = 15;
      f.line(8 + s, 15, bx, 13, 2, M.trim);          // 오른손에서 내려간 줄
      for (let i = 0; i < 9; i++) {
        const w = i < 5 ? 5 : Math.min(9, 5 + (i - 4) * 2);
        f.rect(bx - Math.floor(w / 2), 12 - i, w, 1, M.metal);
      }
      f.rect(bx - 5, 2, 11, 3, M.metal);
      f.rect(bx - 5, 4, 11, 1, M.accent);
      f.rect(bx - 5, 2, 11, 1, M.trim);
      f.rect(bx - 1, 0, 2, 2, M.trim);
    },
  },
  {
    name: '불씨', suit: '#7a3f2e', metal: '#7d858f', glow: '#ff6a2c', skin: '#f0c6a0',
    iris: '#ff8a44', hair: '#3a241c',
    bulk: 0,
    build: (f, s) => {
      f.rect(-17, 15, 5, 17, M.metal);
      f.rect(-17, 32, 5, 2, M.trim);
      f.rect(-17, 27, 5, 1, M.accent);
      f.rect(-11, 17, 5, 14, M.metal);
      f.rect(-11, 31, 5, 2, M.trim);
      f.rect(-11, 26, 5, 1, M.accent);
      f.line(-14, 32, -8, 31, 2, M.trim);
      const hx = 6 + s;                              // 오른손
      f.rect(hx + 1, 14, 11, 4, M.metal);            // 손에서 뻗은 노즐
      f.rect(hx + 1, 14, 11, 1, M.trim);
      f.rect(hx + 12, 15, 2, 2, M.glow);
    },
  },
  {
    name: '거울', suit: '#49505e', metal: '#b6c2d2', glow: '#eaf6ff', skin: '#e8b48c',
    iris: '#9fd8ff', hair: '#6e7280',
    bulk: 0,
    build: (f, s) => {
      f.line(-9 - s, 16, -14, 21, 3, M.metal);       // 왼손에서 올린 자루
      f.disc(-14, 22, 8, M.metal);
      f.disc(-14, 22, 6, M.accent);
      f.disc(-14, 22, 4, M.glow);
      f.disc(-14, 22, 2, M.metal);
    },
  },
  {
    name: '바늘', suit: '#25514e', metal: '#8fa8a4', glow: '#5ce0d0', skin: '#a8734c',
    iris: '#5ce0d0', hair: '#1e3a36',
    bulk: -1,
    build: (f, s) => {
      const hx = 6 + s;                              // 오른손
      f.rect(hx, 15, 24, 2, M.metal);                // 아주 긴 총열
      f.rect(hx - 2, 13, 6, 6, M.trim);
      f.rect(hx - 2, 17, 6, 1, M.accent);
      f.rect(hx + 22, 15, 2, 2, M.glow);
    },
  },
  {
    name: '반딧불', suit: '#5b6a2e', metal: '#a3b268', glow: '#c8ff5c', skin: '#f0c6a0',
    iris: '#c2e85a', hair: '#40401f',
    bulk: -1,
    build: (f) => {
      f.rect(-15, 23, 7, 8, M.metal);
      f.rect(8, 23, 7, 8, M.metal);
      f.rect(-15, 32, 7, 2, M.trim);
      f.rect(8, 32, 7, 2, M.trim);
      f.rect(-14, 25, 2, 2, M.glow);
      f.rect(-14, 28, 2, 2, M.glow);
      f.rect(12, 25, 2, 2, M.glow);
      f.rect(12, 28, 2, 2, M.glow);
      f.rect(-15, 30, 7, 1, M.accent);
      f.rect(8, 30, 7, 1, M.accent);
    },
  },
  {
    name: '도끼', suit: '#6b4326', metal: '#b3bcc7', glow: '#ff7a5a', skin: '#c98c62',
    iris: '#e8664a', hair: '#8a4526',
    bulk: 1,
    build: (f, s) => {
      const hx = -9 - s;                             // 왼손
      f.line(hx + 1, 9, hx - 3, 30, 3, M.trim);      // 손을 관통하는 자루
      f.crescent(hx - 3, 30, 9, 4, -1, M.metal);
      f.crescent(hx - 3, 30, 6, 4, -1, M.accent);
    },
  },
  {
    name: '작살', suit: '#2f3f6b', metal: '#93a6c8', glow: '#7cc4ff', skin: '#e0a882',
    iris: '#7cc4ff', hair: '#22385c',
    bulk: 0,
    build: (f, s) => {
      const hx = 7 + s;                              // 오른손을 지나가는 자루
      f.rect(hx, 3, 3, 42, M.metal);
      f.rect(hx, 20, 3, 2, M.accent);
      f.rect(hx - 1, 45, 5, 5, M.metal);
      f.rect(hx - 3, 42, 2, 5, M.metal);             // 미늘
      f.rect(hx + 4, 42, 2, 5, M.metal);
      f.rect(hx, 47, 3, 3, M.glow);
    },
  },
  {
    name: '사슬', suit: '#3a3446', metal: '#b3a6ce', glow: '#c79bee', skin: '#a8734c',
    iris: '#c79bee', hair: '#2a2438',
    bulk: -1,
    build: (f, s) => {
      f.disc(-11 - s, 16, 5, M.metal);               // 왼손에 쥔 추
      f.disc(-11 - s, 16, 2, M.trim);
      f.disc(-13 - s, 11, 4, M.metal);
      f.rect(-9 - s, 13, 6, 6, M.trim);              // 늘어진 사슬
      const hx = 8 + s;                              // 오른손
      f.line(hx, 16, hx + 7, 23, 3, M.trim);
      f.crescent(hx + 7, 23, 6, 3, 1, M.metal);
      f.crescent(hx + 7, 23, 6, 5, 1, M.glow);
    },
  },
];

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

// ---------------------------------------------------------------- 출력
const rows = Math.ceil(CREW.length / COLS);
const W = COLS * CELL * SCALE;
const H = rows * CELL * SCALE;
const png = new PNG({ width: W, height: H });
const BG: RGB = [0x18, 0x1c, 0x25];
const SHADOW: RGB = [0x0e, 0x10, 0x17];
for (let i = 0; i < W * H; i++) {
  png.data[i * 4] = BG[0]; png.data[i * 4 + 1] = BG[1]; png.data[i * 4 + 2] = BG[2]; png.data[i * 4 + 3] = 255;
}

CREW.forEach((c, idx) => {
  const f = new F();
  body(f, c.bulk);
  HEADS[c.name](f);
  c.build(f, c.bulk);
  const m = f.m;

  const suit = hex(c.suit);
  const sk = skinTones(c.skin);
  const iris = hex(c.iris);
  const R: Record<number, Ramp> = {
    [M.suit]: ramp(suit),
    [M.trim]: ramp(mix(suit, COOL, 0.42)),
    [M.metal]: ramp(c.metal),
    [M.accent]: ramp(c.glow),
    [M.glow]: ramp(c.glow),
    [M.skin]: ramp(c.skin),
    [M.skinS]: ramp(sk[0]),
    [M.skinH]: ramp(sk[2]),
    [M.eye]: ramp(EYE),
    [M.iris]: ramp(c.iris),
    [M.white]: ramp(EYE_LIT),
    [M.hair]: ramp(c.hair),
  };

  const ox = (idx % COLS) * CELL * SCALE;
  const oy = Math.floor(idx / COLS) * CELL * SCALE;
  const put = (x: number, y: number, col: RGB): void => {
    if (x < 0 || x >= CELL || y < 0 || y >= CELL) return;
    for (let sy = 0; sy < SCALE; sy++) {
      for (let sx = 0; sx < SCALE; sx++) {
        const i = ((oy + y * SCALE + sy) * W + (ox + x * SCALE + sx)) * 4;
        png.data[i] = col[0]; png.data[i + 1] = col[1]; png.data[i + 2] = col[2];
      }
    }
  };

  // 바닥 그림자 — 발밑에 이게 없으면 서 있는 게 아니라 떠 있는 것으로
  // 보인다. 캐릭터보다 먼저 깔아서 발이 그림자를 밟게 한다.
  for (let y = 61; y <= 63; y++) {
    for (let x = 20; x <= 44; x++) {
      const dx = (x - 32) / 12;
      const dy = (y - 63) / 2.2;
      if (dx * dx + dy * dy <= 1) put(x, y, SHADOW);
    }
  }

  // 윤곽선 — 이웃 재질에서 색을 가져온다. 전부 같은 검정으로 두르면
  // 오려 붙인 스티커처럼 보인다. 빛 쪽 외곽은 조금 덜 어둡게 둔다.
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      if (m[y * CELL + x]) continue;
      const n = at(m, x, y + 1) || at(m, x + 1, y) || at(m, x, y - 1) || at(m, x - 1, y);
      if (!n) continue;
      const lit = !at(m, x, y - 1) && !at(m, x - 1, y);
      put(x, y, lit ? R[n].edgeLit : R[n].edgeDark);
    }
  }

  // 본체
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const mat = m[y * CELL + x];
      if (!mat) continue;
      // 발광체와 얼굴은 자동 음영을 안 먹인다. 이목구비가 한두 픽셀이라
      // 톤 램프를 태우면 눈·코·입이 서로 뭉개져 표정이 사라진다.
      if (mat === M.glow) { put(x, y, R[mat].t[5]); continue; }
      if (mat === M.eye) { put(x, y, EYE); continue; }
      if (mat === M.white) { put(x, y, EYE_LIT); continue; }
      if (mat === M.iris) { put(x, y, iris); continue; }
      if (mat === M.skin) { put(x, y, sk[1]); continue; }
      if (mat === M.skinS) { put(x, y, sk[0]); continue; }
      if (mat === M.skinH) { put(x, y, sk[2]); continue; }
      const form = formTone(m, x, y);
      // 반사광 — 그늘 쪽 아랫면까지 완전히 죽이면 바닥에서 오려낸 것처럼
      // 보인다. 하늘빛이 튀어오른 한 줄을 넣어 아래쪽을 띄운다.
      if (form <= -1 && !at(m, x, y + 1) && at(m, x, y - 1)) {
        put(x, y, R[mat].bounce);
        continue;
      }
      // 형태광과 파츠 디테일을 그냥 더하면 둘이 겹칠 때 곧장 맨 위 칸까지
      // 올라가 하얗게 날아간다. 위로는 두 단까지만 허용한다 —
      // 제일 밝은 칸은 발광체 몫으로 남겨 둔다.
      const d = Math.max(-3, Math.min(2, form + partTone(m, x, y)));
      const tone = Math.max(0, Math.min(6, 3 + d));
      put(x, y, R[mat].t[tone]);
    }
  }
});

const out = process.argv[2] ?? 'crew.png';
writeFileSync(out, PNG.sync.write(png));
console.log('순서:', CREW.map((c, i) => `${i + 1}.${c.name}`).join('  '));
console.log('→', out);
