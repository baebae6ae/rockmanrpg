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
import { F, M, type CrewPal } from './crewart.js';

/**
 * 서 있는 자세의 골반 높이. 머리·몸통 절대 좌표가 전부 이 값 기준이다.
 *
 * 16 에서 21 로 올렸다 — 다리를 5px 늘린 것이다. 예전 비례를 실제로
 * 재 보니 2.6등신(전체 49px 중 머리가 19px)이었다. 기준 화풍인 록맨 X4
 * 의 X 는 4.1등신(45px 중 머리 11px)이다. 머리만 치비 비율인데 몸은
 * 갑옷판·관절까지 넣은 사실적 비율로 그려져 있어서, 둘이 안 맞는
 * 그 어긋남이 "기괴하다"의 정체였다.
 *
 * 그래서 머리 12px + 몸 36px = 48px(4.0등신)로 다시 잡는다. 머리를
 * 줄이는 것만으로는 키가 43px 로 쪼그라들어 이번엔 난쟁이가 되므로,
 * 다리(HIP0)와 몸통을 같이 늘려 몸 쪽에서 6px 을 채운다.
 */
export const HIP0 = 21;

export type ArmPose =
  | 'down' | 'rest' | 'forward' | 'back' | 'up' | 'guard' | 'aim' | 'strike'
  | 'runF' | 'runN' | 'runB';

/** 어깨에서 손까지의 상대 위치 */
const HAND: Record<ArmPose, [number, number]> = {
  down: [1, -8],
  // 힘을 뺀 팔. 몸에서 조금 떨어져 더 아래로 늘어진다. 서 있는 자세에서
  // 두 팔이 똑같이 'down' 이면 좌우가 완벽히 대칭이라 사람이 아니라
  // 인형으로 보인다 — 빈 팔의 기본값을 이걸로 둔 이유다.
  rest: [3, -10],
  // forward/back 은 공격 동작처럼 팔을 크게 뻗는 '한 번짜리' 큰 동작
  // 전용이다. 달리기처럼 매 프레임 번갈아 스치는 반복 동작에 이 폭을
  // 쓰면 좌우 진폭이 15px 나 되어(어깨 폭이 16~18px 뿐인데) 팔이
  // 몸통 폭만큼 휘두르는 것처럼 보인다 — 그래서 runF/runN/runB 를 따로 뒀다.
  forward: [9, -2],
  back: [-6, -6],
  up: [2, 8],
  guard: [5, -3],
  aim: [9, 1],
  // 실제로 후려치는 타격 프레임 전용. 가로 폭을 키우고(11) 세로(-5)를
  // 낮춰서 어깨보다 아래로 내려찍게 한다.
  //
  // 처음엔 16까지 키우고 빈 팔에도 똑같이 먹였더니, 무기와 상관없는
  // 반대편 빈손까지 몸 폭만큼 쫙 뻗어서 다 같이 T자로 뻗는 꼴이
  // 됐다 — 총 든 캐릭터도, 손과 무관하게 어깨에 무기가 얹힌 반딧불
  // 같은 캐릭터도 전부 "빈손 두 짝을 벌리는" 그림으로 보여서 오히려
  // 더 어색했다. 지금은 무기 팔에만 쓰고 빈 팔은 'guard'로 몸에 붙여
  // 둔다 — 실제로 휘두르는 건 무기 팔 하나뿐이어야 자연스럽다.
  strike: [11, -5],
  // 달리기 전용 — 세 칸 다 높이를 맞춰서 손이 위아래로 출렁이지
  // 않고 앞뒤로만 좁게 스치게 한다. 폭은 8px(runB~runF)로, 어깨 폭
  // 16~18px 의 절반 이하다.
  //
  // 1차: runF 를 guard 와 똑같은 [5,-3] 으로 잘못 써서, 실제로는
  // 뒤→중립→중립→중립(8프레임 중 1프레임만 튀고 나머지 3프레임이
  // 완전히 같은 자세)이 구워졌다. 52ms 짜리 빠른 루프에서 이건 매끄러운
  // 스침이 아니라 주기적으로 한 번씩 튀는 경련으로 보였다.
  //
  // 2차: 세 칸을 다른 값으로 채우긴 했는데 높이를 -5 로 맞췄다.
  // 어깨~골반 낙차가 10 이니 -5 는 딱 그 절반 — 가슴 높이다. "위아래로
  // 안 흔들리게" 하려다가 애초에 너무 높은 자리에서 통일해 버린
  // 것이다. 팔을 붙이는 실제 위치를 마커로 찍어서 확인했다. 뛸 때
  // 자연스럽게 스치는 팔은 가슴이 아니라 골반·허벅지 옆에서 움직여야
  // 한다 — 'rest'(-10)·'down'(-8) 과 같은 높이로 내린다.
  runB: [-2, -10],
  runN: [2, -10],
  runF: [6, -10],
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
  /** 차지 이펙트 세기 0~1 — 무기 손 주위에 고리로 뜬다 */
  charge?: number;
  /** 참격 궤적 */
  slash?: 'high' | 'low';
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
  /** 무기 손이 붙은 어깨 — 무기가 어깨→손 방향을 그대로 이어 뻗어야
   * (칼날이 손잡이보다 앞서야) 할 때 이 방향 벡터를 구하는 기준점 */
  shW: [number, number];
}

export function rigOf(pose: Pose, s: number, weaponHand: 'F' | 'B' = 'F'): Rig {
  const hipY = pose.hipY ?? HIP0;
  const lean = pose.lean ?? 0;
  // 어깨 높이. 몸통이 길어진 만큼(+2) 팔이 붙는 자리도 같이 올라간다 —
  // 여기만 그대로 두면 팔이 가슴 한복판에서 자라난다.
  const shY = hipY + 10;
  const shF: [number, number] = [lean + 7 + s, shY];
  const shB: [number, number] = [lean - 7 - s, shY];
  const wF = weaponHand === 'F';
  const pWeapon = HAND[pose.armWeapon ?? 'down'];
  const pFree = HAND[pose.armFree ?? 'rest'];

  // 빈 손은 좌우가 뒤집힌다 — 자기 쪽 어깨를 기준으로 바깥으로 벌어지는
  // 방향이라, 몸 반대편(뒤)에 있으면 앞손과 부호가 반대여야 자연스럽게
  // 제자리(자기 옆구리)에 붙는다.
  //
  // 무기 손은 뒤집으면 안 된다. forward/back/aim 은 "무기를 앞으로
  // 뻗는다/뒤로 젖힌다"는 절대 방향이라 — 무기가 뒷손(hand:'B')에 있는
  // 캐릭터(도끼·거울)도 그대로 더해야 실제로 앞으로 휘두른다. 뒤집으면
  // 무기 손은 몸 뒤로 더 파묻히고, 대신 앞의 빈손이 뻗어 나가서
  // "반대손으로 공격하는" 그림이 나온다 — 실제로 이 버그였다.
  const handWeapon: [number, number] = wF
    ? [shF[0] + pWeapon[0], shF[1] + pWeapon[1]]
    : [shB[0] + pWeapon[0], shB[1] + pWeapon[1]];
  const handFree: [number, number] = wF
    ? [shB[0] - pFree[0], shB[1] + pFree[1]]
    : [shF[0] + pFree[0], shF[1] + pFree[1]];

  const handF = wF ? handWeapon : handFree;
  const handB = wF ? handFree : handWeapon;
  return {
    s, hipY, lean, headY: pose.headY ?? 0, shF, shB, handF, handB,
    handW: handWeapon,
    handO: handFree,
    shW: wF ? shF : shB,
  };
}

// ---------------------------------------------------------------- 팔다리
/**
 * 다리 — 굵기가 변하는 부드러운 기둥.
 *
 * 예전엔 굵기가 일정한 line() 두 개였다. 그러면 아무리 색을 잘 칠해도
 * 통나무 두 개를 붙여 놓은 것으로 보인다. 허벅지는 굵고 발목으로
 * 갈수록 가늘어져야 다리로 읽힌다.
 */
export function leg(f: F, s: number, hipX: number, hipY: number, foot: [number, number]): void {
  const [fx, fy] = foot;
  const kx = Math.round((hipX + fx) / 2);
  const ky = Math.round((hipY + fy) / 2) + 1;

  f.taper(hipX, ky, hipY, 5 + s, 6 + s, M.cloth);        // 허벅지 갑옷판 — 위가 굵다
  f.taper(kx, fy + 3, ky, 4 + s, 5 + s, M.cloth);        // 종아리 갑옷판 — 발목이 가늘다
  // 무릎 — 관절 구체. 각지면 꺾인 막대고, 천 크레이즈 하나로는 부품이
  // 아니라 얼룩이다. 록맨류는 이 자리가 늘 은색 공이다.
  f.blob(kx, ky, 2 + s, 2, M.joint);
  f.set(kx - 1, ky + 1, M.spec);                         // 무릎 하이라이트
  // 다리 앞면에 빛 한 줄. 이게 없으면 굵기를 아무리 바꿔도 납작한
  // 색 기둥으로 보인다
  f.line(hipX - 2, hipY - 1, kx - 2, ky + 1, 1, M.clothH);

  // 부츠 — 둥근 앞코. 발등은 갑옷판, 앞코·굽만 금속
  f.blob(fx, fy + 2, 3 + s, 3, M.joint);
  f.blob(fx + 1, fy + 1, 3 + s, 2, M.cloth);             // 발등 갑옷판
  f.rect(fx - 2 - s, fy + 3, 3, 1, M.clothH);            // 발등 윗면
  f.rect(fx - 3 - s, fy, 6 + 2 * s, 1, M.trim);          // 밑창
  f.rect(fx - 2 - s, fy + 4, 5 + 2 * s, 1, M.accent);    // 발등 띠
  f.set(fx + 1, fy + 2, M.spec);                          // 앞코 하이라이트
}

/**
 * 팔 — 어깨에서 손목으로 갈수록 가늘어지고, 끝은 둥근 손.
 * 관절마다 각지면 마네킹이 된다.
 */
export function arm(f: F, sx: number, sy: number, hx: number, hy: number): void {
  const ex = Math.round((sx + hx) / 2);
  const ey = Math.round((sy + hy) / 2);
  const dir = sx < 0 ? -1 : 1;                    // 몸 어느 쪽에 붙은 팔인가
  f.capsule(sx, sy, ex, ey, 2, M.cloth);          // 위팔 갑옷판
  // 팔꿈치 — 무릎과 같은 관절 구체. 천 주름 하나로는 부품이 아니다
  f.blob(ex, ey, 2, 2, M.joint);
  f.set(ex - dir, ey + 1, M.spec);
  f.capsule(ex, ey, hx, hy, 2, M.cloth);          // 아래팔 갑옷판
  // 팔과 몸통이 같은 판이라 그냥 두면 실루엣이 한 덩어리로 뭉친다.
  // 안쪽 모서리에 그늘 한 줄을 넣어야 팔이 몸에서 떨어져 보인다.
  f.line(sx - dir * 2, sy, ex - dir * 2, ey, 1, M.clothS);
  // 손 — 맨살이 아니라 건틀릿. 얼굴은 사람이어도 팔다리는 갑옷이다
  f.blob(hx, hy, 2, 2, M.joint);
  f.set(hx - dir, hy - 1, M.jointB);              // 손등 쪽 그늘
  f.set(hx + dir, hy + 1, M.spec);                // 손등 하이라이트
  f.blob(hx, hy + 2, 2, 1, M.accent);             // 손목 밴드
}

// ---------------------------------------------------------------- 몸통
/**
 * 몸통. 아홉이 공유한다 — 여기가 갈리면 한 팀으로 안 보인다.
 * 개성은 전부 머리와 장비가 낸다.
 *
 * 전면 재설계의 핵심이 여기다. 예전 몸통은 사각형 위에 사각형을 얹고
 * 가로선을 그은 갑옷판 덩어리였다. 그래서 아홉 다 로봇으로 보였다.
 *
 *   - 허리를 잘록하게. 위아래 폭이 같으면 사람이 아니라 상자다
 *   - 어깨를 둥글게 깎아 몸에서 흘러내리게. 네모 블록을 옆에 붙이면
 *     견장이 아니라 짐칸이 된다
 *   - 몸의 대부분을 천(M.cloth)으로. 금속은 가슴판 하나로 줄인다 —
 *     단단한 게 하나 있어야 나머지가 무르게 보인다
 *   - 좌우를 1px 어긋나게. 완벽한 대칭은 살아 있는 것으로 안 보인다
 *
 * s 는 체격이다(-1 마른 / 0 보통 / +1 두꺼운). 골격 자체는 안 건드린다 —
 * 관절 위치가 갈리면 애니메이션을 아홉 벌 만들어야 한다.
 */
export function torso(f: F, s: number): void {
  // --- 실루엣: 골반 → 잘록한 허리 → 넓은 가슴.
  f.taper(0, 17, 23, 11 + 2 * s, 9 + s, M.suit);
  f.taper(0, 23, 31, 9 + s, 12 + 2 * s, M.suit);
  f.blob(0, 31, 6 + s, 2, M.suit);

  // --- 어깨 파츠. 시안의 실루엣을 가르는 제일 큰 요소다 — 예전의
  //     "몸에서 흘러내리는 둥근 천"이 아니라, 몸통보다 확실히 넓게
  //     얹힌 큰 장갑 덩어리여야 한다. 본색 위에 금색 띠 한 줄.
  for (const d of [-1, 1] as const) {
    const sx = d * (8 + s);
    f.blob(sx, 32, 5 + s, 4, M.suit);                // 파츠 본체 — 크게
    f.blob(sx, 33, 4 + s, 2, M.suit);
    f.rect(sx - 4 - s, 29, 9 + 2 * s, 1, M.trim);    // 아래 그늘
    f.rect(sx - 3 - s, 34, 7 + 2 * s, 1, M.accent);  // 위를 지나는 금색 띠
    f.set(sx - 2, 35, M.spec);
  }

  // --- 가슴 장갑. 회색 판을 통째로 얹었더니 몸통이 끊겨 보였다 —
  //     본색 위에 금색 트림으로 형태를 내고, 금속은 테두리 한 줄만.
  f.soft(-5 - s, 24, 11 + 2 * s, 7, 2, M.suit);
  f.rect(-5 - s, 30, 11 + 2 * s, 1, M.accent);     // 쇄골 라인
  f.line(-4, 29, -4, 25, 1, M.trim);               // 흉갑 좌우 홈
  f.line(4, 29, 4, 25, 1, M.trim);
  f.rect(-3, 24, 7, 1, M.metal);                   // 명치 금속 테
  f.set(-5 - s, 30, M.spec);

  // 코어 — 가슴 한복판의 빛나는 보석. 시안 아홉이 전부 갖고 있다.
  // 크게 그리면 흰 턱받이로 보인다 — 두 칸이면 충분하다
  f.blob(0, 27, 1, 1, M.glow);
  f.set(0, 28, M.spec);
  f.crescent(0, 27, 3, 2, -1, M.metal);            // 코어를 감싼 테
  f.crescent(0, 27, 3, 2, 1, M.metal);

  // --- 허리 — 장갑판 사이 관절부. 얇고 어둡게 해서 흉갑과 골반을 끊는다
  f.rect(-4 - s, 22, 9 + 2 * s, 2, M.joint);
  f.rect(-4 - s, 23, 9 + 2 * s, 1, M.jointB);

  // --- 골반 장갑 — 앞으로 내려온 판 두 장
  for (const d of [-1, 1] as const) {
    f.soft(d * 3 - 2, 17, 5, 5, 1, M.suit);
    f.rect(d * 3 - 2, 17, 5, 1, M.accent);
  }

  // 목 — 두 줄. 큰 머리 밑에 긴 목이 붙으면 머리가 어깨에서 떠 보인다
  f.rect(-2, 34, 4, 2, M.skin);
  f.rect(-2, 35, 4, 1, M.skinS);
}

// ---------------------------------------------------------------- 얼굴
/**
 * 얼굴 — 정이 붙느냐 마느냐가 거의 전부 여기서 갈린다.
 *
 * 예전 얼굴은 헬멧 사이에 낀 7×5 짜리 살색 조각이었다. 눈이 3×2 라
 * 표정을 지을 여지 자체가 없었고, 그래서 아홉 다 "헬멧 쓴 무언가"로
 * 보였다. 사람으로 보이려면 얼굴이 크고, 그 안에서 눈이 크고, 눈
 * 안에서 흰자가 커야 한다.
 *
 * 세로 예산을 먼저 정하고 그 안에서만 그린다. 이걸 안 정해 두면
 * 머리카락이 눈까지 내려와 얼굴이 눌린다(실제로 한 번 그랬다).
 *
 *   y39    헤어라인 — 머리카락은 여기 위로만
 *   y37-38 이마
 *   y37    눈썹
 *   y35-36 눈썹과 눈 사이 한 줄 여유
 *   y33-35 눈 석 줄
 *   y30-31 턱·입
 *
 * 예전엔 머리가 몸통·다리를 합친 것만큼 컸다(2.5등신) — 거기에 얼굴
 * 4×4 눈을 흰자 위주로 그려 넣었더니 부릅뜬 눈에 프랑켄슈타인 비례가
 * 겹쳐 무섭다는 소리를 들었다. 머리를 30% 줄이고(3등신에 가깝게),
 * 눈도 그만큼 줄여 홍채가 눈 대부분을 채우는 쪽으로 바꿨다 — 흰자가
 * 넓으면 순해 보일 거라 생각했는데, 이 크기에서는 흰자 테두리 쪽이
 * 오히려 흰자위를 드러내고 노려보는 인상을 만든다.
 */
export const HAIRLINE = 42;

export function face(f: F, brow: BrowShape = 'calm'): void {
  // 두개골 하나. 예전엔 blob(머리통) + taper(턱)를 겹쳐 놨는데, 그
  // 둘의 폭이 안 맞아서 얼굴 아래 절반이 폭 18px 짜리 수직 벽이 됐다
  // — 턱으로 좁아지질 않으니 얼굴이 각지고 뭉개져 보였다. 타원 하나로
  // 그리면 위는 넓고 아래로 갈수록 좁아지는 게 수식에서 저절로 나온다.
  //   y36 폭5(턱) → y37 폭9 → y38 폭11 → y39~41 폭13(광대·관자놀이)
  // 폭을 줄마다 직접 지정한다. blob 하나로 그리면 타원 수식이 같은 폭을
  // 두세 줄씩 뱉어서(9,9 / 11,11,11) 얼굴 옆이 수직 벽이 되고, 턱에서는
  // 5→9 로 한 번에 두 칸씩 튀어 각진 모서리가 생겼다. 여섯 줄뿐이라
  // 수식에 맡기는 것보다 한 줄씩 정하는 편이 정확하다.
  //   11 관자놀이 / 11 광대 / 9 눈높이 / 9 / 7 볼 / 5 턱
  f.rect(-5, 40, 11, 2, M.skin);
  f.rect(-4, 38, 9, 2, M.skin);
  f.rect(-3, 37, 7, 1, M.skin);
  f.rect(-2, 36, 5, 1, M.skin);
  f.blob(0, 43, 5, 2, M.skin);                     // 머리통 위 — 머리카락이 덮는다
  // 볼의 입체는 이제 formTone 자동 음영이 낸다. 예전엔 여기에 각진
  // 사각 블록으로 그늘·하이라이트를 얹었는데, 그러데이션 위에 각진
  // 블록이 얹히니 음영이 아니라 얼룩처럼 보였다 — 자동 음영과 손으로
  // 얹는 블록은 같이 쓰면 안 된다.
  // --- 눈. 흰자 + 검은자, 두 색뿐이다.
  //
  // 실제 X4 스프라이트의 눈 색을 뽑아 보면 순백(240,240,240) 과 거의
  // 검정(32,40,72) 두 칸이 전부다. 홍채색 같은 건 아예 없다. 눈이
  // 커 보이는 건 크기 때문이 아니라 이 두 색의 대비 때문이다.
  //
  // 앞서 안쪽 한 칸만 홍채색으로 찍어 봤다가 두 가지를 한꺼번에
  // 틀렸다. 홍채색은 살빛과 명도가 비슷해서 인게임 크기로 줄이면
  // 눈이 아예 사라졌고, 밝은 칸이 좌우 눈의 서로 반대쪽(둘 다 안쪽)에
  // 놓여 눈동자가 바깥으로 벌어진 사시로 보였다.
  //
  // 그래서 흰자를 두 눈 모두 '같은 쪽'에 둔다 — 그래야 두 눈이 같은
  // 방향을 본다. 몸이 기우는 쪽(+x)으로 시선이 가도록 흰자를 왼쪽,
  // 검은자를 오른쪽에 놓았다. 세로 두 줄인 건 순전히 인게임 크기에서
  // 살아남기 위해서다 — 한 줄이면 축소했을 때 뭉개져 없어진다.
  for (const ex of [-3, 2] as const) {
    f.rect(ex, 38, 1, 2, M.white);               // 흰자
    f.rect(ex + 1, 38, 1, 2, M.eye);             // 검은자
  }

  drawBrow(f, brow);

  // 입 — 한 점. 이 크기에서는 이것도 있는 편이 낫다(턱이 비면 가면이
  // 된다). 홍조는 뺐다 — 이 얼굴에 더 얹을 자리가 없다.
  f.set(0, 36, M.mouth);
}

/** 눈썹 모양 — 성격을 한 획으로 정한다 */
export type BrowShape = 'calm' | 'soft' | 'bold' | 'worried' | 'sly';

/**
 * 눈썹 한 짝. drawBrow() 가 좌우 두 번 부르고, 얼굴 파츠들이 가까운
 * 쪽 한 번만 부른다 — 먼 쪽은 눈 자체를 안 그리므로 눈썹만 남으면
 * 흉터처럼 뜬다.
 */
function browMark(f: F, ex: number, dir: 1 | -1, shape: BrowShape): void {
  // 눈썹은 점 하나다. 예전엔 3~4px 짜리 막대였는데, 눈 바로 위에 그만한
  // 어두운 덩이가 붙으면 눈썹이 아니라 눈의 일부로 뭉쳐 읽힌다. 성격
  // 차이는 이 한 점을 어디에 찍느냐로만 낸다 — 눈이 두 칸뿐인 얼굴에
  // 눈썹이 그보다 클 이유가 없다.
  const inner = dir > 0 ? ex : ex + 1;
  const outer = dir > 0 ? ex + 1 : ex;
  switch (shape) {
    case 'bold':    f.rect(ex, 40, 2, 1, M.brow); break;   // 둘 다 — 굵다
    case 'soft':    f.set(outer, 40, M.brow); break;       // 바깥만 — 처진 눈썹
    case 'worried': f.set(inner, 40, M.brow); break;       // 안쪽만 — 걱정
    case 'sly':     if (dir > 0) f.rect(ex, 40, 2, 1, M.brow); break;  // 한쪽만
    default:        f.set(inner, 40, M.brow); break;       // calm
  }
}

function drawBrow(f: F, shape: BrowShape): void {
  browMark(f, -4, -1, shape);
  browMark(f, 2, 1, shape);
}

/**
 * 머리 — 아홉을 가르는 제일 중요한 파츠.
 *
 * 예전엔 전원이 얼굴을 반쯤 덮는 통짜 헬멧을 썼다. 그게 아홉을 다
 * "장비를 쓴 무언가"로 만든 제일 큰 원인이었다 — 사람은 얼굴로
 * 기억되는데 그 얼굴이 절반이 가려져 있었으니 정이 붙을 데가 없다.
 *
 * 이번엔 규칙을 뒤집었다.
 *   - 얼굴을 가리는 장비는 전부 목으로 내린다(고글·마스크·후드).
 *     쓰고 있으면 직업은 설명되는데 사람은 안 보인다. 목에 걸쳐 두면
 *     둘 다 된다.
 *   - 머리는 딱딱한 판이 아니라 머리카락이 기본이다. 결이 흐르고
 *     끝이 삐치는 게 부드러움을 만든다.
 *   - 각자 눈썹 모양이 다르다. 성격은 눈이 아니라 눈썹에서 읽힌다.
 */
export type Head = (f: F) => void;

/**
 * 머리카락 한 덩이 — 둥근 두개골을 덮고 옆으로 흘러내린다.
 * 사각형으로 얹으면 가발이 되고, 두개골 곡선을 따라야 머리가 된다.
 */
function hairCap(f: F, puff = 0, sideLen = 5): void {
  // 두 덩이 다 밑면이 정확히 헤어라인이다. 한 칸이라도 더 내려오면
  // 눈썹을 덮어 표정이 사라진다 — 실제로 한 번 그랬다.
  // 머리 덩이가 두개골보다 크면 얼굴이 눌린 것처럼 보인다. 머리통
  // 위쪽을 덮는 '모자' 정도로만 얹는다.
  f.blob(0, HAIRLINE + 2, 6 + puff, 2, M.hair);          // 정수리
  f.blob(0, HAIRLINE + 3, 5 + puff, 1, M.hair);
  f.blob(0, HAIRLINE + 3, 4, 1, M.hairS);                // 결 그늘
  // 옆머리 — 예전엔 rect() 두 개였다. 직사각형이라 머리 옆이 폭이
  // 똑같은 수직 벽이 됐고, 그 벽이 두개골의 둥근 곡선을 덮어서
  // 얼굴형이 각져 보이는 제일 큰 원인이었다. 아래로 갈수록 좁아지는
  // taper 로 바꿔 두개골 곡선을 따라 흘러내리게 한다.
  f.taper(-7 - puff, HAIRLINE - sideLen, HAIRLINE + 2, 1, 3, M.hair);
  f.taper(6 + puff, HAIRLINE - sideLen, HAIRLINE + 2, 1, 3, M.hair);
  f.set(-7 - puff, HAIRLINE - sideLen, M.hairS);
  f.set(6 + puff, HAIRLINE - sideLen, M.hairS);
  // 머리 윗면에 또렷한 결 하이라이트 한 점 — 애니메 머리카락 특유의
  // 그 반짝임이다. 부드러운 그러데이션만으로는 절대 안 나온다.
  f.set(-2, HAIRLINE + 3, M.spec);
}

/** 이마로 내려온 앞머리 — 헤어라인 아래로 한 칸만. 더 내리면 눈을 덮는다 */
function bangs(f: F, ...cols: number[]): void {
  for (const x of cols) {
    f.rect(x, HAIRLINE, 1, 2, M.hair);
  }
}

/**
 * 목에 걸친 물건 — 고글·마스크·후드가 다 이 자리로 내려온다.
 *
 * 높이가 까다롭다. 턱 밑(y28~29)까지 올리면 아홉 명 전원이 턱수염을
 * 기른 것처럼 보이고, 쇄골까지(y23~24) 내리면 이번엔 가슴판을 덮어
 * 가슴이 통째로 사라진다 — 둘 다 겪었다. y25~27, 목 밑동만이 맞다.
 */
function collar(f: F, mat: M, lit: M): void {
  f.blob(0, 32, 5, 1, mat);
  f.rect(-4, 33, 9, 1, lit);
  f.set(-5, 31, mat); f.set(5, 31, mat);
}

// ---------------------------------------------------------------- 헬멧
/**
 * 장갑 헬멧 — 아홉이 공유하는 새 실루엣.
 *
 * 예전엔 머리카락 + 모자/머리띠였다. 그래서 아홉 다 "옷 입은 사람"으로
 * 보였고, 지향하는 화풍(록맨 X 계열 장갑 대원)과는 아예 다른 물건이
 * 됐다. 컨셉 시안(docs/concept/)의 아홉을 뜯어보면 공통 언어가 셋이다:
 *
 *   1. 두개골을 덮는 돔 — 이마 위로 한 겹 더 얹혀 있고 앞은 열려서
 *      얼굴이 보인다. 헬멧이 얼굴을 먹으면 정이 안 붙는다
 *   2. 관자놀이 양옆의 원형 귀 파츠 — 이 동그라미 둘이 실루엣의 핵심이다.
 *      이게 없으면 그냥 두건 쓴 사람이다
 *   3. 눈 바로 위를 가로지르는 바이저 테두리(금색 트림) — 얼굴과 헬멧의
 *      경계를 여기서 딱 끊어 준다
 *
 * 개성은 crest(정수리 장식)가 낸다 — 핀·뿔·안테나·불꽃.
 */
function helmet(f: F): void {
  // 돔은 캐릭터 본색(M.suit)이다. 금속색으로 칠했더니 아홉 다 회색
  // 머리가 됐다 — 시안에서 헬멧은 그 대원의 색 그 자체고, 금속은
  // 테두리와 귀 파츠 가장자리에만 얇게 들어간다.
  f.blob(0, HAIRLINE + 3, 7, 2, M.suit);
  f.blob(0, HAIRLINE + 1, 7, 2, M.suit);
  // 관자놀이를 감싸고 내려오는 측면 — 아래로 갈수록 좁아져 광대에서 끝난다
  f.taper(-7, HAIRLINE - 3, HAIRLINE + 2, 2, 3, M.suit);
  f.taper(6, HAIRLINE - 3, HAIRLINE + 2, 2, 3, M.suit);
  f.set(-7, HAIRLINE - 2, M.trim);            // 측면 그늘 한 줄
  f.set(6, HAIRLINE - 2, M.trim);
  // 바이저 테두리 — 눈 바로 위. 금색 한 줄이 헬멧을 헬멧으로 만든다
  f.rect(-6, HAIRLINE + 1, 13, 1, M.metal);
  f.rect(-6, HAIRLINE, 13, 1, M.accent);
  // 귀 파츠 — 원형 장갑 디스크. 테두리는 금속, 가운데는 속성색으로 빛난다
  for (const x of [-8, 7] as const) {
    f.blob(x, 39, 2, 2, M.metal);
    f.set(x, 39, M.glow);
    f.set(x, 40, M.spec);
  }
  f.set(-2, HAIRLINE + 4, M.spec);            // 정수리 하이라이트
}

/** 정수리 장식 — 캐릭터를 구분하는 유일한 머리 요소 */
const crest = {
  /** 위로 곧게 선 핀 하나 — 기본형 */
  fin(f: F): void {
    f.taper(0, HAIRLINE + 5, HAIRLINE + 9, 4, 2, M.suit);
    f.rect(-1, HAIRLINE + 9, 2, 1, M.accent);
    f.set(-1, HAIRLINE + 7, M.spec);
  },
  /** 뒤로 젖혀 흐르는 긴 핀 — 날렵한 유형 */
  swept(f: F): void {
    f.line(0, HAIRLINE + 5, -7, HAIRLINE + 9, 3, M.suit);
    f.line(-3, HAIRLINE + 7, -8, HAIRLINE + 10, 1, M.accent);
    f.set(-3, HAIRLINE + 7, M.spec);
  },
  /** 좌우로 뻗은 뿔 두 개 — 완력형 */
  horns(f: F): void {
    for (const d of [-1, 1] as const) {
      f.line(d * 3, HAIRLINE + 4, d * 8, HAIRLINE + 9, 3, M.suit);
      f.blob(d * 8, HAIRLINE + 9, 1, 1, M.accent);
      f.set(d * 5, HAIRLINE + 6, M.spec);
    }
  },
  /** 가는 안테나 두 개 — 지원형 */
  antenna(f: F): void {
    for (const d of [-1, 1] as const) {
      f.line(d * 2, HAIRLINE + 4, d * 4, HAIRLINE + 10, 1, M.metal);
      f.blob(d * 4, HAIRLINE + 10, 1, 1, M.glow);
    }
  },
  /** 타오르는 깃털 — 화염 유형 */
  flame(f: F): void {
    f.taper(0, HAIRLINE + 4, HAIRLINE + 9, 5, 1, M.accent);
    f.taper(0, HAIRLINE + 5, HAIRLINE + 8, 3, 1, M.glow);
    f.set(2, HAIRLINE + 7, M.glow);
    f.set(-2, HAIRLINE + 6, M.accent);
  },
  /** 각진 결정 — 빛 유형 */
  crystal(f: F): void {
    f.taper(0, HAIRLINE + 4, HAIRLINE + 8, 6, 1, M.metal);
    f.taper(0, HAIRLINE + 5, HAIRLINE + 7, 3, 1, M.glow);
    f.set(-3, HAIRLINE + 5, M.spec);
  },
};

export const HEADS: Record<string, Head> = {
  // 못 — 맏이, 파워 타입. 정면으로 곧게 선 핀 하나. 제일 기본형이라
  // 나머지 여덟이 여기서 얼마나 벗어났는지를 재는 기준이 된다
  '못': (f) => {
    face(f, 'bold');
    helmet(f);
    crest.fin(f);
    f.rect(-3, HAIRLINE + 2, 7, 1, M.accent);   // 이마판 한 줄 더 — 두껍게
    collar(f, M.metal, M.accent);
  },

  // 종 — 공명 서포터. 귀 파츠를 한 겹 키우고 안테나를 세운다
  '종': (f) => {
    face(f, 'calm');
    helmet(f);
    crest.antenna(f);
    for (const x of [-8, 7] as const) {         // 귀 파츠 바깥에 공명 링 하나
      f.crescent(x, 39, 3, 2, x < 0 ? -1 : 1, M.accent);
    }
    collar(f, M.metal, M.accent);
  },

  // 불씨 — 화염 어썰트. 정수리에서 타오르는 깃털
  '불씨': (f) => {
    face(f, 'sly');
    helmet(f);
    crest.flame(f);
    f.set(-6, HAIRLINE + 2, M.glow);            // 관자놀이에 남은 불티
    f.set(6, HAIRLINE + 3, M.accent);
    collar(f, M.metal, M.accent);
  },

  // 거울 — 반사 디펜더. 각진 결정 크레스트에 바이저가 한 겹 더 있다
  '거울': (f) => {
    face(f, 'calm');
    helmet(f);
    crest.crystal(f);
    f.rect(-6, HAIRLINE - 1, 13, 1, M.metal);   // 눈 위로 내려온 바이저 챙
    f.set(-5, HAIRLINE - 1, M.spec);
    collar(f, M.metal, M.accent);
  },

  // 바늘 — 스나이퍼. 뒤로 길게 젖혀 흐르는 핀
  '바늘': (f) => {
    face(f, 'worried');
    helmet(f);
    crest.swept(f);
    f.set(7, 41, M.glow);                       // 조준용 광학 한 점
    collar(f, M.metal, M.accent);
  },

  // 반딧불 — 기동 서포터. 끝이 빛나는 더듬이 둘
  '반딧불': (f) => {
    face(f, 'soft');
    helmet(f);
    crest.antenna(f);
    f.set(-4, HAIRLINE + 3, M.glow);            // 헬멧 위 발광점 둘
    f.set(4, HAIRLINE + 3, M.glow);
    collar(f, M.metal, M.accent);
  },

  // 도끼 — 브루트. 좌우로 뻗은 뿔. 헬멧도 한 겹 두껍다
  '도끼': (f) => {
    face(f, 'bold');
    helmet(f);
    crest.horns(f);
    f.blob(0, HAIRLINE + 4, 7, 1, M.metal);     // 정수리를 한 겹 더 덮는다
    f.rect(-4, HAIRLINE + 2, 9, 1, M.accent);
    collar(f, M.metal, M.accent);
  },

  // 작살 — 랜서. 물에서 일한다. 젖은 듯 매끈한 헬멧에 짧은 핀
  '작살': (f) => {
    face(f, 'calm');
    helmet(f);
    crest.swept(f);
    f.rect(-2, HAIRLINE + 3, 5, 1, M.accent);   // 정수리를 지나는 유선 홈
    collar(f, M.metal, M.accent);
  },

  // 사슬 — 구속 컨트롤러. 암흑 속성. 크레스트도 낮게 깔린다
  '사슬': (f) => {
    face(f, 'sly');
    helmet(f);
    crest.swept(f);
    f.blob(-7, HAIRLINE + 1, 2, 2, M.accent);   // 뒤통수에 걸린 구속 고리
    f.set(-8, HAIRLINE, M.glow);
    collar(f, M.metal, M.accent);
  },
};

// ---------------------------------------------------------------- 대원
/**
 * 장비. 무기를 고정 좌표에 그리면 팔이 움직이는 순간 손에서 떨어져
 * 공중에 뜬다. 그래서 전부 rig 의 손 좌표에서 뻗어 나가게 짠다.
 */
export type Build = (f: F, r: Rig, pose: Pose) => void;

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
    suit: '#2a4c96', metal: '#b9c6d8', glow: '#7fd4ff', gold: '#e8b94a', skin: '#e0a882',
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
    suit: '#0f7fa2', metal: '#b9c6d8', glow: '#8ef0ff', gold: '#e8b94a', skin: '#c98c62',
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
    suit: '#c02418', metal: '#cbb69a', glow: '#ff8a3c', gold: '#e8b94a', skin: '#f0c6a0',
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
    suit: '#48607f', metal: '#dfe8f2', glow: '#eaf6ff', gold: '#e8b94a', skin: '#e8b48c',
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
    suit: '#4a3a86', metal: '#a8b0c8', glow: '#b98cff', gold: '#e8b94a', skin: '#a8734c',
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
    suit: '#0f8a78', metal: '#b6c8a8', glow: '#c8ff5c', gold: '#e8b94a', skin: '#f0c6a0',
    iris: '#c2e85a', hair: '#40401f', bulk: -1,
    hand: 'F',
    build: (f, r) => {
      // 유도탄 포드는 어깨에 얹혀 있다 — 손과 무관하게 몸통을 따라간다.
      //
      // 원래는 네모 상자 두 개였는데, 사람을 아무리 부드럽게 그려 놔도
      // 등에 상자를 지우는 순간 다시 로봇이 된다. 이름값대로 반딧불이
      // 접은 날개처럼, 위가 둥글고 아래로 좁아지는 꼬투리로 다시 잡았다.
      const x = r.lean;
      const y = r.hipY + 7;
      for (const s of [-1, 1] as const) {
        const cx = x + s * 11;
        f.taper(cx, y, y + 5, 3, 9, M.metal);      // 아래로 좁아지는 꼬리
        f.blob(cx, y + 5, 4, 4, M.metal);          // 위쪽 둥근 몸통
        f.blob(cx, y + 8, 3, 1, M.trim);           // 윗면
        f.rect(cx - 3, y + 6, 7, 1, M.accent);     // 결 한 줄
        f.blob(cx - s * 3, y + 4, 1, 3, M.trim);   // 바깥쪽 그늘
        for (const dy of [2, 4, 6]) f.set(cx + s, y + dy, M.glow);
      }
    },
  },
  {
    id: 'axe', name: '도끼',
    suit: '#8f3418', metal: '#c7b49a', glow: '#ff7a3c', gold: '#e8b94a', skin: '#c98c62',
    iris: '#e8664a', hair: '#8a4526', bulk: 1,
    hand: 'B',
    build: (f, r, pose) => {
      const [hx, hy] = r.handW;
      // 공격 동작(back/aim/strike/forward) 중에는 어깨→손 방향을 그대로
      // 이어서 날을 손 앞쪽에 둔다 — 손잡이를 고정된 모양으로 그리면
      // 팔이 어느 쪽으로 뻗든 날은 항상 같은 자리에 남아서, 실제로
      // 휘두르는 쪽이 손잡이 끝이지 날이 아니게 된다. 팔이 휘둘러지는
      // 만큼 날도 같이 돌아야 날 쪽으로 후려치는 그림이 나온다.
      //
      // 대기·달리기(armWeapon:'down')처럼 팔이 그냥 옆에 늘어진
      // 자세에서까지 이 방향을 그대로 따르면, 손이 아래로 늘어진
      // 방향 그대로 날도 다리 옆까지 축 처져서 어깨에 멘 도끼가 아니라
      // 흘러내린 도끼처럼 보인다 — 그런 자세에서는 원래의 고정된
      // "어깨에 멘" 모양을 그대로 쓴다.
      const swinging =
        pose.armWeapon === 'back' || pose.armWeapon === 'aim' ||
        pose.armWeapon === 'strike' || pose.armWeapon === 'forward';
      if (swinging) {
        const [sx, sy] = r.shW;
        const dx = hx - sx, dy = hy - sy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const grip = 6;   // 손 뒤로 남는 자루 끝(손잡이를 쥔 느낌)
        const reach = 16; // 손에서 날까지 거리
        const side: -1 | 1 = ux >= 0 ? 1 : -1;
        f.line(hx - ux * grip, hy - uy * grip, hx + ux * reach, hy + uy * reach, 3, M.trim);
        f.crescent(hx + ux * reach, hy + uy * reach, 9, 4, side, M.metal);
        f.crescent(hx + ux * reach, hy + uy * reach, 6, 4, side, M.accent);
        return;
      }
      const tipX = hx - 3;
      f.line(hx + 1, hy - 7, tipX, hy + 14, 3, M.trim);  // 어깨에 멘 자루
      f.crescent(tipX, hy + 14, 9, 4, -1, M.metal);
      f.crescent(tipX, hy + 14, 6, 4, -1, M.accent);
    },
  },
  {
    id: 'harpoon', name: '작살',
    suit: '#2f6a76', metal: '#b3c6cc', glow: '#7cd8ff', gold: '#e8b94a', skin: '#e0a882',
    iris: '#7cc4ff', hair: '#22385c', bulk: 0,
    hand: 'F',
    build: (f, r) => {
      // 자루를 손 바로 위에 세우면 머리를 관통한다. 바깥으로 두 칸 밀고
      // 위쪽을 줄여 머리 옆을 지나가게 한다.
      const [hx, hy] = r.handW;
      const sx = hx + 3;
      f.rect(sx - 1, hy - 13, 3, 40, M.metal);
      f.rect(sx - 1, hy + 4, 3, 2, M.accent);
      f.rect(sx - 2, hy + 27, 5, 5, M.metal);
      f.rect(sx - 4, hy + 24, 2, 5, M.metal);          // 미늘
      f.rect(sx + 3, hy + 24, 2, 5, M.metal);
      f.rect(sx - 1, hy + 29, 3, 3, M.glow);
    },
  },
  {
    id: 'chain', name: '사슬',
    suit: '#3f2f66', metal: '#a99cc4', glow: '#c79bee', gold: '#e8b94a', skin: '#a8734c',
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
 * 겹침 순서가 전부다. 뒤쪽 다리+빈 팔 → 몸통 → 머리 → 앞쪽 다리+무기 팔 →
 * 무기. 순서를 틀리면 팔이 가슴을 뚫고 나오거나 무기가 얼굴을 덮는다.
 *
 * 팔은 다리와 달리 "몸 앞/뒤 어느 쪽 어깨냐"가 아니라 "무기를 쥔
 * 팔이냐"로 앞/뒤 그리기 순서를 정한다. 예전엔 물리적으로 뒤쪽
 * 어깨(shB)를 항상 뒤 레이어에 그렸는데, 무기가 뒷손인 캐릭터(도끼·
 * 거울)는 그 팔이 몸통에 항상 가려져서 화면에 아예 안 보였다 —
 * 그 위에 무기(도끼날 등)만 항상 맨 위에 그려지니, 보이는 건 무기를
 * 쥔 적 없는 앞의 빈 팔이 뻗는 동작뿐이고 무기는 아무 팔에도 안 붙은
 * 채 허공에서 움직이는 것처럼 보였다 — "반대손으로 공격한다"는 게
 * 실은 이 레이어 문제였다. 무기 팔을 항상 몸통 위(보이는 레이어)에
 * 그려서, 실제로 쥐고 휘두르는 팔이 눈에 보이게 한다.
 */
export function drawCrew(f: F, c: Crew, pose: Pose = {}): void {
  const s = c.bulk;
  const r = rigOf(pose, s, c.hand);
  const hipY = r.hipY;
  // 두 다리 사이에 x -1..0 두 칸을 비워 둔다. 여기가 붙으면 다리 둘이
  // 아니라 통짜 기둥 하나로 보인다.
  // 발을 더 벌린다. 붙여 놓으면 부츠 두 짝이 한 덩어리로 뭉쳐
  // 다리가 아니라 치마처럼 보인다.
  // 좌우 폭도 한 칸 어긋나 있다. 두 발을 정확히 같은 거리에 두면
  // 차렷 자세가 되고, 그것만으로 사람이 아니라 인형이 된다.
  const footF = pose.footF ?? [5, 0];
  const footB = pose.footB ?? [-6, 0];

  const wF = c.hand === 'F';
  const shWeapon = wF ? r.shF : r.shB;
  const shFree = wF ? r.shB : r.shF;

  // 고관절은 몸 중앙이 아니라 좌우로 벌어져 있다. 가운데 한 점에서
  // 두 다리를 뻗으면 서 있는 자세에서 허벅지가 안쪽으로 모여 붙는다.
  f.backside(true);
  leg(f, s, r.lean - 4 - s, hipY, footB);
  arm(f, shFree[0], shFree[1], r.handO[0], r.handO[1]);
  f.backside(false);

  f.origin(r.lean, hipY - HIP0);
  torso(f, s);
  f.origin(r.lean, hipY - HIP0 + r.headY);
  HEADS[c.name](f);
  f.origin(0, 0);

  leg(f, s, r.lean + 3 + s, hipY, footF);
  arm(f, shWeapon[0], shWeapon[1], r.handW[0], r.handW[1]);

  if (pose.weapon !== false) c.build(f, r, pose);

  // 이펙트는 무기 손을 기준으로 뜬다. 화면 중앙에 고정하면 팔을 어디로
  // 뻗든 같은 자리에서 빛나서 몸과 따로 논다.
  const [wx, wy] = r.handW;
  if (pose.slash) {
    const cy = wy + (pose.slash === 'high' ? 4 : -4);
    for (let i = 0; i < 20; i++) {
      const a = (-0.8 + (i / 19) * 1.6) * (pose.slash === 'high' ? 1 : -1);
      const rr = 12;
      f.set(wx + Math.cos(a) * rr, cy + Math.sin(a) * rr, M.accent);
      f.set(wx + Math.cos(a) * (rr - 1), cy + Math.sin(a) * (rr - 1), M.glow);
    }
  }
  if (pose.charge) {
    const rr = 3 + pose.charge * 4;
    const steps = Math.max(10, Math.round(rr * 7));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      f.set(wx + 3 + Math.cos(a) * rr, wy + Math.sin(a) * rr, M.glow);
      f.set(wx + 3 + Math.cos(a) * rr * 0.55, wy + Math.sin(a) * rr * 0.55, M.accent);
    }
  }
}
