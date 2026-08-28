/**
 * 《균열 회수반》 아홉 대원 — 파츠·머리·장비 정의.
 *
 * 몸은 관절로 짜여 있다. 프리뷰는 서 있는 한 자세만 쓰지만 생성기는
 * 같은 파츠로 달리기·점프·베기를 뽑아야 하기 때문이다. 서 있는 자세가
 * 프리뷰와 같아 보이도록 기준 좌표를 맞춰 뒀다.
 *
 * 머리와 몸통만 절대 좌표(서 있는 자세 기준)로 짜고, 자세가 바뀌면
 * 원점을 옮겨서 그린다. 팔다리는 관절 좌표를 직접 받는다.
 */
import { F, M, bevel, type CrewPal } from './crewart.js';

/** 서 있는 자세의 골반 높이. 머리·몸통 절대 좌표가 전부 이 값 기준이다 */
export const HIP0 = 16;

export type ArmPose =
  | 'down' | 'forward' | 'back' | 'up' | 'guard' | 'aim' | 'swing_hi' | 'swing_lo';

/** 어깨에서 손까지의 상대 위치 */
const HAND: Record<ArmPose, [number, number]> = {
  down: [1, -8],
  forward: [9, -2],
  back: [-6, -6],
  up: [2, 8],
  guard: [5, -3],
  aim: [9, 1],
  swing_hi: [8, 5],
  swing_lo: [9, -8],
};

/**
 * 자세는 팔을 '앞/뒤'가 아니라 '무기 팔/빈 팔'로 지정한다.
 *
 * 앞뒤로 지정하면 거울·도끼처럼 왼손잡이인 대원의 무기가 달리기 프레임마다
 * 얼굴 앞을 가로지른다. 팔이 흔들리면 거기 붙은 무기도 같이 흔들리기
 * 때문이다. 무기 팔은 대체로 고정하고 빈 팔만 흔드는 게 맞다.
 */
export interface Pose {
  hipY?: number;
  /** 상체 좌우 기울기 */
  lean?: number;
  /** 앞발 / 뒷발 [x, y] — y 0 이 지면 */
  footF?: [number, number];
  footB?: [number, number];
  armWeapon?: ArmPose;
  armFree?: ArmPose;
  /** 머리 상하 미세 조정 */
  headY?: number;
  /** 무기를 그릴지. 사망·피격에서는 뺀다 */
  weapon?: boolean;
}

/** 포즈에서 계산된 관절 좌표. 장비는 이 손 좌표에 붙는다 */
export interface Rig {
  s: number;
  hipY: number;
  lean: number;
  headY: number;
  shF: [number, number]; shB: [number, number];
  handF: [number, number]; handB: [number, number];
  /** 무기 손 / 빈 손 — 위 둘 중 하나를 가리킨다 */
  handW: [number, number]; handO: [number, number];
}

export function rigOf(pose: Pose, s: number, weaponHand: 'F' | 'B' = 'F'): Rig {
  const hipY = pose.hipY ?? HIP0;
  const lean = pose.lean ?? 0;
  const shY = hipY + 8;
  const shF: [number, number] = [lean + 7 + s, shY];
  const shB: [number, number] = [lean - 7 - s, shY];
  const wF = weaponHand === 'F';
  const pF = HAND[(wF ? pose.armWeapon : pose.armFree) ?? 'down'];
  const pB = HAND[(wF ? pose.armFree : pose.armWeapon) ?? 'down'];
  // 뒤쪽 팔은 좌우가 뒤집힌다 — 어깨 기준 앞으로 뻗는 방향이 반대다
  const handF: [number, number] = [shF[0] + pF[0], shF[1] + pF[1]];
  const handB: [number, number] = [shB[0] - pB[0], shB[1] + pB[1]];
  return {
    s, hipY, lean, headY: pose.headY ?? 0, shF, shB, handF, handB,
    handW: wF ? handF : handB,
    handO: wF ? handB : handF,
  };
}

// ---------------------------------------------------------------- 팔다리
/**
 * 다리 — 부츠가 커야 록맨 계열 실루엣이 선다. 밑창은 밖으로 벌린다.
 * 직육면체는 부츠로 안 읽힌다.
 */
export function leg(f: F, s: number, hipX: number, hipY: number, foot: [number, number]): void {
  const [fx, fy] = foot;
  const kx = (hipX + fx) / 2;
  const ky = (hipY + fy) / 2 + 1;
  // line() 은 반폭을 내림해서 쓴다 — 4 와 5 가 같은 굵기가 되므로
  // 체격은 2씩 벌려야 실제로 굵어진다
  f.line(hipX, hipY, kx, ky, 4 + 2 * s, M.suit);  // 허벅지
  f.line(kx, ky, fx, fy + 4, 4 + 2 * s, M.suit);  // 정강이
  f.rect(kx - 2 - s, ky - 1, 5 + s, 3, M.metal);  // 무릎 판
  bevel(f, kx - 2 - s, ky - 1, 5 + s, 3);
  f.rect(fx - 3 - s, fy, 6 + 2 * s, 5, M.trim);       // 부츠
  f.rect(fx - 3 - s, fy + 4, 6 + 2 * s, 1, M.accent);
  f.rect(fx - 3 - s, fy + 1, 6 + 2 * s, 1, M.metal); // 발목 링
  f.rect(fx - 4 - s, fy, 1, 2, M.trim);              // 벌어진 밑창
  f.rect(fx + 3 + s, fy, 1, 2, M.trim);
}

export function arm(f: F, sx: number, sy: number, hx: number, hy: number): void {
  const ex = (sx + hx) / 2;
  const ey = (sy + hy) / 2;
  f.line(sx, sy, ex, ey, 4, M.suit);
  f.line(ex, ey, hx, hy, 4, M.suit);
  f.rect(ex - 2, ey, 4, 1, M.trim);               // 팔꿈치
  f.rect(hx - 2, hy - 2, 5, 4, M.trim);           // 장갑
  f.rect(hx - 2, hy, 1, 2, M.suit);               // 엄지
}

// ---------------------------------------------------------------- 몸통
/**
 * 몸통. 아홉이 공유한다 — 여기가 갈리면 한 팀으로 안 보인다.
 * 개성은 전부 머리와 장비가 낸다.
 *
 * 판을 나누는 선이 있어야 한 덩어리가 아니라 조립된 장구로 읽힌다.
 * 다만 가로선만 늘어놓으면 40px 에서는 갑옷이 아니라 줄무늬 옷이 된다 —
 * 세로 솔기를 섞어야 판이 판으로 읽힌다.
 *
 * s 는 체격이다(-1 마른 / 0 보통 / +1 두꺼운). 아홉이 전부 같은 굵기면
 * 색만 다른 같은 사람이 아홉 있는 것이지 팀이 아니다. 다만 골격 자체는
 * 안 건드린다 — 관절 위치가 갈리면 애니메이션을 아홉 벌 만들어야 한다.
 */
export function torso(f: F, s: number): void {
  f.rect(-4 - s, 15, 8 + 2 * s, 4, M.suit);   // 허리
  f.rect(-5 - s, 13, 10 + 2 * s, 2, M.trim);  // 벨트
  f.rect(-1, 13, 2, 2, M.accent);             // 버클

  f.rect(-6 - s, 18, 12 + 2 * s, 8, M.suit);  // 가슴
  f.rect(-5 - s, 18, 10 + 2 * s, 1, M.trim);  // 복부 구분선
  f.rect(-4 - s, 20, 8 + 2 * s, 4, M.metal);  // 가슴판
  f.rect(-4 - s, 20, 1, 4, M.trim);           // 가슴판 옆선
  f.rect(3 + s, 20, 1, 4, M.trim);
  f.rect(-4 - s, 23, 8 + 2 * s, 1, M.accent);
  f.rect(-2, 21, 4, 2, M.glow);               // 코어

  f.rect(-10 - s, 23, 6 + s, 5, M.metal);     // 어깨 패드
  f.rect(4, 23, 6 + s, 5, M.metal);
  f.rect(-10 - s, 27, 6 + s, 1, M.accent);
  f.rect(4, 27, 6 + s, 1, M.accent);
  f.rect(-9 - s, 24, 1, 1, M.accent);         // 리벳
  f.rect(8 + s, 24, 1, 1, M.accent);
  f.set(-10 - s, 27, M.none); f.set(9 + s, 27, M.none);

  f.rect(-2, 26, 4, 2, M.trim);               // 목
}

// ---------------------------------------------------------------- 얼굴
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
export function face(f: F): void {
  // 1. 윤곽 — 위는 넓고 턱으로 갈수록 좁아진다
  f.rect(-4, 30, 9, 5, M.skin);
  f.rect(-3, 29, 7, 1, M.skin);
  f.rect(-2, 28, 5, 1, M.skin);

  // 2. 눈썹뼈 — 눈 위에 그늘이 앉아야 눈이 안으로 들어간다.
  //    검게 칠하면 눈썹이 되어 늘 화난 얼굴이 되므로 살 그늘로 둔다
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

  f.set(-4, 30, M.skinS); f.set(4, 30, M.skinS);  // 볼 그늘

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
 */
export type Head = (f: F) => void;

export const HEADS: Record<string, Head> = {
  // 못 — 정면으로 얻어맞는 자리다. 두꺼운 통짜 헬멧에 볼가리개와 턱끈까지
  '못': (f) => {
    face(f);
    f.rect(-6, 35, 13, 5, M.suit);
    f.rect(-6, 39, 13, 1, M.metal);
    f.rect(-2, 40, 5, 2, M.metal);   // 볏
    f.rect(-6, 35, 13, 1, M.accent); // 이마 띠
    bevel(f, -6, 35, 13, 5);
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
    // 어깨 폭까지 넓히면 마스크가 아니라 목깃으로 읽힌다. 얼굴보다 한 칸씩만
    // 넓게 두고, 대신 광대 위로 끈을 올려 '묶어 쓴 것'으로 만든다.
    f.rect(-5, 28, 11, 3, M.metal);
    f.rect(-5, 30, 11, 1, M.trim);   // 마스크 윗단이 눈 밑에 드리운 그늘
    f.rect(-5, 28, 11, 1, M.accent);
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
    bevel(f, -5, 35, 11, 4);
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

// ---------------------------------------------------------------- 대원
/**
 * 장비. 무기를 고정 좌표에 그리면 팔이 움직이는 순간 손에서 떨어져
 * 공중에 뜬다. 그래서 전부 rig 의 손 좌표에서 뻗어 나가게 짠다.
 */
export type Build = (f: F, r: Rig) => void;

export interface Crew extends CrewPal {
  id: string;
  name: string;
  /** 체격 — -1 마른 / 0 보통 / +1 두꺼운 */
  bulk: -1 | 0 | 1;
  /** 무기를 든 손 — F 앞(오른쪽) / B 뒤(왼쪽) */
  hand: 'F' | 'B';
  build: Build;
}

export const CREW: Crew[] = [
  {
    id: 'nail', name: '못',
    suit: '#3f4756', metal: '#aab4c2', glow: '#ff9a4c', skin: '#e0a882',
    iris: '#c9743c', hair: '#2e2a30', bulk: 1,
    hand: 'F',
    build: (f, r) => {
      const [hx, hy] = r.handW;
      f.rect(hx - 2, hy - 3, 6, 6, M.trim);            // 손에 쥔 뭉치
      f.line(hx + 2, hy + 1, hx + 13, hy + 7, 7, M.metal);
      f.line(hx + 2, hy + 3, hx + 12, hy + 9, 2, M.trim);
      f.rect(hx + 11, hy + 6, 3, 3, M.accent);         // 총구
    },
  },
  {
    id: 'bell', name: '종',
    suit: '#6b5a34', metal: '#c9a04a', glow: '#ffe08a', skin: '#c98c62',
    iris: '#e0b45a', hair: '#4a3824', bulk: 1,
    hand: 'F',
    build: (f, r) => {
      // 등에 매달면 무슨 모양이든 망토로 읽힌다 — 손에 들려 낮게 내린다.
      // 위가 통이고 아래만 벌어져야 종이 된다.
      const [hx, hy] = r.handW;
      const bx = hx + 9;
      const by = hy - 3;
      f.line(hx, hy - 1, bx, by, 2, M.trim);           // 손에서 내려간 줄
      for (let i = 0; i < 9; i++) {
        const w = i < 5 ? 5 : Math.min(9, 5 + (i - 4) * 2);
        f.rect(bx - Math.floor(w / 2), by - 1 - i, w, 1, M.metal);
      }
      f.rect(bx - 5, by - 11, 11, 3, M.metal);
      f.rect(bx - 5, by - 9, 11, 1, M.accent);
      f.rect(bx - 5, by - 11, 11, 1, M.trim);
      f.rect(bx - 1, by - 13, 2, 2, M.trim);
    },
  },
  {
    id: 'ember', name: '불씨',
    suit: '#7a3f2e', metal: '#7d858f', glow: '#ff6a2c', skin: '#f0c6a0',
    iris: '#ff8a44', hair: '#3a241c', bulk: 0,
    hand: 'F',
    build: (f, r) => {
      const bx = r.lean - 14;                          // 등에 진 연료통
      const by = r.hipY - 1;
      f.rect(bx - 3, by, 5, 17, M.metal);
      f.rect(bx - 3, by + 17, 5, 2, M.trim);
      f.rect(bx - 3, by + 12, 5, 1, M.accent);
      f.rect(bx + 3, by + 2, 5, 14, M.metal);
      f.rect(bx + 3, by + 16, 5, 2, M.trim);
      f.rect(bx + 3, by + 11, 5, 1, M.accent);
      f.line(bx, by + 17, bx + 6, by + 16, 2, M.trim);
      const [hx, hy] = r.handW;
      f.rect(hx + 1, hy - 2, 11, 4, M.metal);          // 손에서 뻗은 노즐
      f.rect(hx + 1, hy - 2, 11, 1, M.trim);
      f.rect(hx + 12, hy - 1, 2, 2, M.glow);
    },
  },
  {
    id: 'mirror', name: '거울',
    suit: '#49505e', metal: '#b6c2d2', glow: '#eaf6ff', skin: '#e8b48c',
    iris: '#9fd8ff', hair: '#6e7280', bulk: 0,
    hand: 'B',
    build: (f, r) => {
      const [hx, hy] = r.handW;
      f.line(hx, hy, hx - 5, hy + 5, 3, M.metal);      // 왼손에서 올린 자루
      f.disc(hx - 5, hy + 6, 8, M.metal);
      f.disc(hx - 5, hy + 6, 6, M.accent);
      f.disc(hx - 5, hy + 6, 4, M.glow);
      f.disc(hx - 5, hy + 6, 2, M.metal);
    },
  },
  {
    id: 'needle', name: '바늘',
    suit: '#25514e', metal: '#8fa8a4', glow: '#5ce0d0', skin: '#a8734c',
    iris: '#5ce0d0', hair: '#1e3a36', bulk: -1,
    hand: 'F',
    build: (f, r) => {
      const [hx, hy] = r.handW;
      f.rect(hx - 2, hy - 1, 24, 2, M.metal);          // 아주 긴 총열
      f.rect(hx - 4, hy - 3, 6, 6, M.trim);
      f.rect(hx - 4, hy + 1, 6, 1, M.accent);
      f.rect(hx + 20, hy - 1, 2, 2, M.glow);
    },
  },
  {
    id: 'firefly', name: '반딧불',
    suit: '#5b6a2e', metal: '#a3b268', glow: '#c8ff5c', skin: '#f0c6a0',
    iris: '#c2e85a', hair: '#40401f', bulk: -1,
    hand: 'F',
    build: (f, r) => {
      // 유도탄 발사대는 어깨에 얹혀 있다 — 손과 무관하게 몸통을 따라간다
      const x = r.lean;
      const y = r.hipY + 7;
      f.rect(x - 15, y, 7, 8, M.metal);
      f.rect(x + 8, y, 7, 8, M.metal);
      f.rect(x - 15, y + 9, 7, 2, M.trim);
      f.rect(x + 8, y + 9, 7, 2, M.trim);
      f.rect(x - 14, y + 2, 2, 2, M.glow);
      f.rect(x - 14, y + 5, 2, 2, M.glow);
      f.rect(x + 12, y + 2, 2, 2, M.glow);
      f.rect(x + 12, y + 5, 2, 2, M.glow);
      f.rect(x - 15, y + 7, 7, 1, M.accent);
      f.rect(x + 8, y + 7, 7, 1, M.accent);
    },
  },
  {
    id: 'axe', name: '도끼',
    suit: '#6b4326', metal: '#b3bcc7', glow: '#ff7a5a', skin: '#c98c62',
    iris: '#e8664a', hair: '#8a4526', bulk: 1,
    hand: 'B',
    build: (f, r) => {
      const [hx, hy] = r.handW;
      f.line(hx + 1, hy - 7, hx - 3, hy + 14, 3, M.trim);  // 손을 관통하는 자루
      f.crescent(hx - 3, hy + 14, 9, 4, -1, M.metal);
      f.crescent(hx - 3, hy + 14, 6, 4, -1, M.accent);
    },
  },
  {
    id: 'harpoon', name: '작살',
    suit: '#2f3f6b', metal: '#93a6c8', glow: '#7cc4ff', skin: '#e0a882',
    iris: '#7cc4ff', hair: '#22385c', bulk: 0,
    hand: 'F',
    build: (f, r) => {
      const [hx, hy] = r.handW;                        // 손을 지나가는 자루
      f.rect(hx - 1, hy - 13, 3, 42, M.metal);
      f.rect(hx - 1, hy + 4, 3, 2, M.accent);
      f.rect(hx - 2, hy + 29, 5, 5, M.metal);
      f.rect(hx - 4, hy + 26, 2, 5, M.metal);          // 미늘
      f.rect(hx + 3, hy + 26, 2, 5, M.metal);
      f.rect(hx - 1, hy + 31, 3, 3, M.glow);
    },
  },
  {
    id: 'chain', name: '사슬',
    suit: '#3a3446', metal: '#b3a6ce', glow: '#c79bee', skin: '#a8734c',
    iris: '#c79bee', hair: '#2a2438', bulk: -1,
    hand: 'F',
    build: (f, r) => {
      const [bx, by] = r.handO;
      f.disc(bx - 2, by, 5, M.metal);                  // 왼손에 쥔 추
      f.disc(bx - 2, by, 2, M.trim);
      f.disc(bx - 4, by - 5, 4, M.metal);
      f.rect(bx, by - 3, 6, 6, M.trim);                // 늘어진 사슬
      const [hx, hy] = r.handW;
      f.line(hx, hy, hx + 7, hy + 7, 3, M.trim);
      f.crescent(hx + 7, hy + 7, 6, 3, 1, M.metal);
      f.crescent(hx + 7, hy + 7, 6, 5, 1, M.glow);
    },
  },
];

// ---------------------------------------------------------------- 한 프레임
/**
 * 겹침 순서가 전부다. 뒤쪽 팔다리 → 몸통 → 머리 → 앞쪽 팔다리 → 무기.
 * 순서를 틀리면 팔이 가슴을 뚫고 나오거나 무기가 얼굴을 덮는다.
 */
export function drawCrew(f: F, c: Crew, pose: Pose = {}): void {
  const s = c.bulk;
  const r = rigOf(pose, s, c.hand);
  const hipY = r.hipY;
  // 두 다리 사이에 x -1..0 두 칸을 비워 둔다. 여기가 붙으면 다리 둘이
  // 아니라 통짜 기둥 하나로 보인다.
  const footF = pose.footF ?? [4, 0];
  const footB = pose.footB ?? [-4, 0];

  // 고관절은 몸 중앙이 아니라 좌우로 벌어져 있다. 가운데 한 점에서
  // 두 다리를 뻗으면 서 있는 자세에서 허벅지가 안쪽으로 모여 붙는다.
  f.backside(true);
  leg(f, s, r.lean - 4 - s, hipY, footB);
  arm(f, r.shB[0], r.shB[1], r.handB[0], r.handB[1]);
  f.backside(false);

  f.origin(r.lean, hipY - HIP0);
  torso(f, s);
  f.origin(r.lean, hipY - HIP0 + r.headY);
  HEADS[c.name](f);
  f.origin(0, 0);

  leg(f, s, r.lean + 3 + s, hipY, footF);
  arm(f, r.shF[0], r.shF[1], r.handF[0], r.handF[1]);

  if (pose.weapon !== false) c.build(f, r);
}
