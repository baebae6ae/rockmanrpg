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

/** 5단 램프 + 윤곽선 두 단(빛 쪽 / 그늘 쪽) */
interface Ramp { t: RGB[]; edgeLit: RGB; edgeDark: RGB }
function ramp(base: string | RGB): Ramp {
  const b = typeof base === 'string' ? hex(base) : base;
  return {
    t: [
      mix(b, COOL, 0.58),
      mix(b, COOL, 0.30),
      b,
      mix(b, WHITE, 0.24),
      mix(b, WHITE, 0.52),
    ],
    edgeLit: mix(b, COOL, 0.70),
    edgeDark: mix(b, COOL, 0.88),
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

// ---------------------------------------------------------------- 공용 몸
/**
 * 아홉이 공유하는 사람 몸. 여기가 갈리면 한 팀으로 안 보인다.
 * 개성은 전부 장비(build)가 낸다.
 *
 * 판을 나누는 선(무릎·팔꿈치·벨트·가슴판)이 있어야 한 덩어리가 아니라
 * 조립된 장구로 읽힌다. 다만 1px 선을 남발하면 40px 에서는 노이즈가 된다.
 */
function body(f: F): void {
  // 부츠 — 발이 커야 록맨 계열 실루엣이 선다
  f.rect(-7, 0, 6, 5, M.trim);
  f.rect(1, 0, 6, 5, M.trim);
  f.rect(-7, 4, 6, 1, M.accent);
  f.rect(1, 4, 6, 1, M.accent);
  f.rect(-7, 1, 6, 1, M.metal);  // 발목 링
  f.rect(1, 1, 6, 1, M.metal);

  f.rect(-5, 5, 4, 5, M.suit);   // 정강이
  f.rect(1, 5, 4, 5, M.suit);
  f.rect(-6, 9, 5, 3, M.metal);  // 무릎 판
  f.rect(1, 9, 5, 3, M.metal);
  f.rect(-6, 11, 5, 1, M.accent);
  f.rect(1, 11, 5, 1, M.accent);
  f.rect(-5, 12, 4, 4, M.suit);  // 허벅지
  f.rect(1, 12, 4, 4, M.suit);
  f.rect(-5, 15, 4, 1, M.trim);
  f.rect(1, 15, 4, 1, M.trim);

  f.rect(-4, 15, 8, 4, M.suit);  // 허리
  f.rect(-5, 13, 10, 2, M.trim); // 벨트
  f.rect(-1, 13, 2, 2, M.accent);

  f.rect(-6, 18, 12, 8, M.suit); // 가슴
  f.rect(-5, 18, 10, 1, M.trim); // 복부 구분선
  f.rect(-4, 20, 8, 4, M.metal); // 가슴판
  f.rect(-4, 23, 8, 1, M.accent);
  f.rect(-2, 21, 4, 2, M.glow);  // 코어

  f.rect(-10, 16, 4, 8, M.suit); // 팔
  f.rect(6, 16, 4, 8, M.suit);
  f.rect(-10, 19, 4, 1, M.trim); // 팔꿈치
  f.rect(6, 19, 4, 1, M.trim);
  f.rect(-10, 21, 4, 1, M.accent); // 팔뚝 보호대
  f.rect(6, 21, 4, 1, M.accent);
  f.rect(-11, 14, 5, 4, M.trim); // 장갑
  f.rect(6, 14, 5, 4, M.trim);
  f.rect(-11, 17, 5, 1, M.accent);
  f.rect(6, 17, 5, 1, M.accent);

  f.rect(-10, 23, 6, 5, M.metal); // 어깨 패드
  f.rect(4, 23, 6, 5, M.metal);
  f.rect(-10, 27, 6, 1, M.accent);
  f.rect(4, 27, 6, 1, M.accent);
  f.rect(-9, 24, 1, 1, M.accent); // 리벳
  f.rect(8, 24, 1, 1, M.accent);

  f.rect(-2, 26, 4, 2, M.trim);   // 목
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
    f.rect(-6, 28, 13, 3, M.metal);  // 코 아래를 덮는 마스크
    f.rect(-6, 30, 13, 1, M.trim);   // 마스크 윗단이 눈 밑에 드리운 그늘
    f.rect(-6, 28, 13, 1, M.accent); // 아랫단
    f.rect(-2, 29, 5, 1, M.trim);    // 배기 그릴
    f.set(-1, 29, M.metal); f.set(1, 29, M.metal);
    f.rect(7, 28, 3, 4, M.metal);    // 옆으로 나온 필터통
    f.rect(7, 30, 3, 1, M.accent);
    f.rect(7, 31, 3, 1, M.trim);
    f.rect(-7, 31, 2, 4, M.metal);   // 마스크 고정대
    f.rect(5, 31, 2, 4, M.metal);
    f.rect(-5, 35, 11, 4, M.suit);
    f.rect(-5, 38, 11, 1, M.metal);
    f.rect(-5, 35, 11, 1, M.accent);
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
    f.line(-5, 36, -12, 32, 3, M.suit);
    f.rect(-6, 34, 12, 1, M.trim);   // 이마에 드리운 그늘
    f.rect(-7, 31, 2, 4, M.suit);
    f.rect(5, 31, 2, 4, M.suit);
  },
};

type Build = (f: F) => void;
interface Crew {
  name: string; suit: string; metal: string; glow: string;
  /** 살색 — 여기서 그늘·하이라이트를 파생한다 */
  skin: string;
  /** 홍채 — 아홉을 가르는 제일 싼 수단이다. 눈 색이 다르면 남으로 보인다 */
  iris: string;
  /** 머리카락 — 헬멧 밖으로 나오는 대원만 실제로 보인다 */
  hair: string;
  build: Build;
}

/** 앞쪽 = 오른쪽(+x), 등 = 왼쪽(-x). 장비는 머리 상자를 침범하지 않는다. */
const CREW: Crew[] = [
  {
    name: '못', suit: '#3f4756', metal: '#aab4c2', glow: '#ff9a4c', skin: '#e0a882',
    iris: '#c9743c', hair: '#2e2a30',
    build: (f) => {
      f.line(9, 23, 20, 29, 7, M.metal);
      f.line(9, 25, 19, 31, 2, M.trim);
      f.rect(7, 20, 6, 7, M.trim);
      f.rect(18, 27, 3, 3, M.accent);
    },
  },
  {
    name: '종', suit: '#6b5a34', metal: '#c9a04a', glow: '#ffe08a', skin: '#c98c62',
    iris: '#e0b45a', hair: '#4a3824',
    build: (f) => {
      // 등에 매달면 무슨 모양이든 망토로 읽힌다 — 손에 들려 낮게 내린다.
      // 위가 통이고 아래만 벌어져야 종이 된다.
      const bx = 15;
      f.rect(bx - 1, 13, 2, 5, M.trim);
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
    build: (f) => {
      f.rect(-17, 15, 5, 17, M.metal);
      f.rect(-17, 32, 5, 2, M.trim);
      f.rect(-17, 27, 5, 1, M.accent);
      f.rect(-11, 17, 5, 14, M.metal);
      f.rect(-11, 31, 5, 2, M.trim);
      f.rect(-11, 26, 5, 1, M.accent);
      f.line(-14, 32, -8, 31, 2, M.trim);
      f.rect(7, 21, 11, 4, M.metal);
      f.rect(7, 21, 11, 1, M.trim);
      f.rect(17, 22, 2, 2, M.glow);
    },
  },
  {
    name: '거울', suit: '#49505e', metal: '#d8dfe8', glow: '#eaf6ff', skin: '#e8b48c',
    iris: '#9fd8ff', hair: '#6e7280',
    build: (f) => {
      f.disc(-14, 22, 8, M.metal);
      f.disc(-14, 22, 6, M.accent);
      f.disc(-14, 22, 4, M.glow);
      f.disc(-14, 22, 2, M.metal);
    },
  },
  {
    name: '바늘', suit: '#25514e', metal: '#8fa8a4', glow: '#5ce0d0', skin: '#a8734c',
    iris: '#5ce0d0', hair: '#1e3a36',
    build: (f) => {
      f.rect(5, 21, 25, 2, M.metal);       // 아주 긴 총열
      f.rect(3, 19, 6, 6, M.trim);
      f.rect(3, 23, 6, 1, M.accent);
      f.rect(28, 21, 2, 2, M.glow);
    },
  },
  {
    name: '반딧불', suit: '#5b6a2e', metal: '#a3b268', glow: '#c8ff5c', skin: '#f0c6a0',
    iris: '#c2e85a', hair: '#40401f',
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
    build: (f) => {
      f.line(-11, 31, -5, 13, 3, M.trim);
      f.crescent(-11, 31, 9, 4, -1, M.metal);
      f.crescent(-11, 31, 6, 4, -1, M.accent);
    },
  },
  {
    name: '작살', suit: '#2f3f6b', metal: '#93a6c8', glow: '#7cc4ff', skin: '#e0a882',
    iris: '#7cc4ff', hair: '#22385c',
    build: (f) => {
      f.rect(11, 3, 3, 42, M.metal);
      f.rect(11, 20, 3, 2, M.accent);
      f.rect(10, 45, 5, 5, M.metal);
      f.rect(8, 42, 2, 5, M.metal);
      f.rect(15, 42, 2, 5, M.metal);
      f.rect(11, 47, 3, 3, M.glow);
    },
  },
  {
    name: '사슬', suit: '#3a3446', metal: '#b3a6ce', glow: '#c79bee', skin: '#a8734c',
    iris: '#c79bee', hair: '#2a2438',
    build: (f) => {
      f.disc(-11, 16, 5, M.metal);
      f.disc(-11, 16, 2, M.trim);
      f.disc(-13, 11, 4, M.metal);
      f.rect(-9, 13, 6, 6, M.trim);
      f.line(9, 17, 15, 23, 3, M.trim);
      f.crescent(15, 23, 6, 3, 1, M.metal);
      f.crescent(15, 23, 6, 5, 1, M.glow);
    },
  },
];

// ---------------------------------------------------------------- 명암
const at = (m: Uint8Array, x: number, y: number): number =>
  x < 0 || x >= CELL || y < 0 || y >= CELL ? 0 : m[y * CELL + x];

/**
 * 가장자리를 읽어서 톤을 정한다. 빛은 왼쪽 위에서 온다.
 *   위가 비었으면       밝게
 *   위·좌상 둘 다 비면  림라이트
 *   아래가 비었으면     그림자
 * 빛 쪽/그늘 쪽으로 한 칸씩 더 번지게 해야 통이 납작한 판이 아니라
 * 원통으로 읽힌다.
 */
function toneOf(m: Uint8Array, cx: number, cy: number): number {
  const up = at(m, cx, cy - 1);
  const down = at(m, cx, cy + 1);
  const upLeft = at(m, cx - 1, cy - 1);
  const left = at(m, cx - 1, cy);

  if (!up && !upLeft) return 4;
  if (!up) return 3;
  if (!left) return 3;
  if (!down) return 0;
  if (!at(m, cx + 1, cy)) return 1;
  if (!at(m, cx - 2, cy)) return 3;
  if (!at(m, cx + 2, cy)) return 1;
  return 2;
}

// ---------------------------------------------------------------- 출력
const rows = Math.ceil(CREW.length / COLS);
const W = COLS * CELL * SCALE;
const H = rows * CELL * SCALE;
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) {
  png.data[i * 4] = 0x14; png.data[i * 4 + 1] = 0x16; png.data[i * 4 + 2] = 0x1b; png.data[i * 4 + 3] = 255;
}

CREW.forEach((c, idx) => {
  const f = new F();
  body(f);
  HEADS[c.name](f);
  c.build(f);
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
    for (let sy = 0; sy < SCALE; sy++) {
      for (let sx = 0; sx < SCALE; sx++) {
        const i = ((oy + y * SCALE + sy) * W + (ox + x * SCALE + sx)) * 4;
        png.data[i] = col[0]; png.data[i + 1] = col[1]; png.data[i + 2] = col[2];
      }
    }
  };

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
      if (mat === M.glow) { put(x, y, R[mat].t[4]); continue; }
      if (mat === M.eye) { put(x, y, EYE); continue; }
      if (mat === M.white) { put(x, y, EYE_LIT); continue; }
      if (mat === M.iris) { put(x, y, iris); continue; }
      if (mat === M.skin) { put(x, y, sk[1]); continue; }
      if (mat === M.skinS) { put(x, y, sk[0]); continue; }
      if (mat === M.skinH) { put(x, y, sk[2]); continue; }
      let tone = toneOf(m, x, y);
      // 접촉 그림자 — 다른 파츠가 위에 얹혀 있으면 한 단 어둡게.
      // 이 한 줄이 있어야 파츠가 겹쳐 놓인 것으로 보인다.
      const above = at(m, x, y - 1);
      if (above && above !== mat) tone = Math.max(0, tone - 1);
      put(x, y, R[mat].t[tone]);
    }
  }
});

const out = process.argv[2] ?? 'crew.png';
writeFileSync(out, PNG.sync.write(png));
console.log('순서:', CREW.map((c, i) => `${i + 1}.${c.name}`).join('  '));
console.log('→', out);
