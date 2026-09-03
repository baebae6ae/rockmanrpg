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
  | 'down' | 'rest' | 'forward' | 'back' | 'up' | 'guard' | 'aim' | 'runF' | 'runB';

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
  // 몸통 폭만큼 휘두르는 것처럼 보인다 — 그래서 runF/runB 를 따로 뒀다.
  forward: [9, -2],
  back: [-6, -6],
  up: [2, 8],
  guard: [5, -3],
  aim: [9, 1],
  // 달리기 전용 반동 폭. 어깨 폭(16~18px)의 절반 이하로 좁혀서, 다리가
  // 크게 나가는 동안 반대쪽 팔이 그만큼 튀지 않고 살짝만 스치게 한다.
  runF: [5, -3],
  runB: [-2, -6],
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
  const pF = HAND[(wF ? pose.armWeapon ?? 'down' : pose.armFree ?? 'rest')];
  const pB = HAND[(wF ? pose.armFree ?? 'rest' : pose.armWeapon ?? 'down')];
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
  // --- 실루엣: 골반 → 잘록한 허리 → 넓은 가슴. 위아래 폭이 같으면 통이다.
  //
  // 4등신으로 다시 잡으면서 몸통이 위로 6px 자랐다(어깨 y25→y31).
  // 늘린 몫은 전부 허리~가슴 구간에 넣었다 — 골반을 늘리면 다리가
  // 짧아 보이고, 가슴만 늘리면 목이 짧은 씨름 선수가 된다.
  f.taper(0, 17, 23, 11 + 2 * s, 9 + s, M.cloth);
  f.taper(0, 23, 31, 9 + s, 12 + 2 * s, M.cloth);
  f.blob(0, 31, 6 + s, 2, M.cloth);

  // --- 어깨. 몸에서 흘러내리는 둥근 것. 오른쪽을 한 칸 낮춰 힘을 뺀다
  f.blob(-7 - s, 31, 3 + s, 3, M.cloth);
  f.blob(7 + s, 30, 3 + s, 3, M.cloth);
  f.set(-7 - s, 29, M.clothS);                    // 겨드랑이 접힘
  f.set(7 + s, 28, M.clothS);
  // 견갑 — 어깨 위에 얹힌 금속판. 몸통과 같은 색 천만으로는 팔이
  // 어디서 시작하는지 안 보인다. 록맨류는 이 자리가 늘 딱딱하다
  f.blob(-7 - s, 32, 3 + s, 2, M.joint);
  f.blob(7 + s, 31, 3 + s, 2, M.joint);
  f.set(-8 - s, 33, M.spec);                      // 빛 쪽 견갑 하이라이트

  // --- 옷깃 → 앞섶 → 허리띠.
  //
  // 여기가 이 몸통의 전부다. 예전엔 실루엣만 잡고 안쪽을 비워 뒀는데,
  // 그러면 아무리 명암을 잘 먹여도 '색칠한 덩어리'지 '옷 입은 사람'이
  // 아니다. 옷깃이 벌어져 있고 앞섶이 내려가고 허리가 묶여 있어야
  // 비로소 입은 것으로 읽힌다.
  f.rect(-4, 31, 3, 1, M.clothH);                 // 벌어진 옷깃
  f.rect(2, 31, 3, 1, M.clothH);
  f.set(-2, 30, M.clothH); f.set(2, 30, M.clothH);
  f.set(-1, 29, M.clothS); f.set(1, 29, M.clothS); // 깃 끝이 만나는 자리
  f.line(0, 28, 0, 24, 1, M.clothS);              // 앞섶 한 줄

  f.rect(-5 - s, 22, 11 + 2 * s, 2, M.clothS);    // 허리띠
  f.rect(-5 - s, 23, 11 + 2 * s, 1, M.clothH);    // 띠 윗면
  f.rect(-1, 22, 3, 2, M.accent);                 // 버클
  f.soft(3 + s, 18, 4, 4, 1, M.clothS);           // 허리에 매단 주머니
  f.rect(3 + s, 20, 4, 1, M.clothH);
  f.set(4 + s, 21, M.accent);

  // 허리 주름 두 줄 — 천은 접힌다. 이게 없으면 아래위가 한 판이다
  f.rect(-5 - s, 25, 2, 1, M.clothS);
  f.rect(4 + s, 24, 2, 1, M.clothS);

  // --- 가슴에 붙은 단단한 것 하나. 이게 있어야 나머지가 천으로 읽힌다.
  //     가운데에 큰 판을 붙이면 그게 곧 로봇 흉갑이라, 한쪽으로 치우친
  //     작은 패널로 줄였다. 좌우가 어긋나 있는 게 사람이다.
  f.soft(-6 - s, 25, 5 + s, 4, 1, M.joint);
  f.rect(-6 - s, 28, 5 + s, 1, M.accent);
  f.set(-6 - s, 28, M.spec);                      // 가슴판 모서리 하이라이트
  // 코어 보석 — 사각 점 하나가 아니라 둥근 보석. 구석에 밝은 점을
  // 하나 곁들이면 그냥 빛나는 게 아니라 반짝이는 것으로 보인다
  f.blob(-5 - s, 26, 1, 1, M.glow);
  f.set(-5 - s, 27, M.spec);

  // 목 — 두 줄이면 충분하다. 예전엔 네 줄이었는데, 큰 머리 밑에 긴
  // 목이 붙으니 머리가 어깨에서 떠 보였다. X4 의 X 도 목은 두 줄이다.
  f.rect(-2, 34, 4, 2, M.skin);
  f.rect(-2, 35, 4, 1, M.skinS);                  // 턱 밑 그늘
  // 머리는 대원마다 다르다 — HEADS 가 따로 그린다
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

export const HEADS: Record<string, Head> = {
  // 못 — 맏이. 짧게 친 머리에 작업 밴드 하나. 눈썹이 굵고 곧다
  '못': (f) => {
    face(f, 'bold');
    hairCap(f, 0, 4);
    bangs(f, -4, -1, 3);
    f.rect(-6, HAIRLINE, 13, 2, M.accent);      // 이마 밴드
    f.rect(-6, HAIRLINE, 13, 1, M.metal);
    f.blob(-7, HAIRLINE + 1, 1, 2, M.accent);       // 옆으로 삐져나온 매듭
    collar(f, M.cloth, M.clothS);
  },

  // 종 — 제일 시끄러운 무기를 든다. 귀를 덮는 폭신한 것
  '종': (f) => {
    face(f, 'calm');
    hairCap(f, 0, 3);
    bangs(f, -3, 1);
    for (const x of [-7, 6] as const) {             // 이어머프 — 둥글고 두껍게
      f.blob(x, 39, 2, 3, M.cloth);
      f.blob(x, 39, 1, 2, M.clothS);
      f.set(x, 40, M.accent);
    }
    f.rect(-6, HAIRLINE + 3, 13, 1, M.cloth);       // 머리 위를 지나는 띠
    collar(f, M.cloth, M.clothS);
  },

  // 불씨 — 불을 다룬다. 헝클어진 머리, 고글은 목에 걸쳐 둔다
  '불씨': (f) => {
    face(f, 'sly');
    hairCap(f, 1, 4);
    bangs(f, -5, -3, 0, 2, 4);
    f.set(-7, HAIRLINE + 3, M.hair);                // 삐친 머리
    f.set(7, HAIRLINE + 4, M.hair);
    f.set(8, HAIRLINE + 2, M.hair);
    // 목에 걸친 고글 — 얼굴을 안 가리면서 직업은 그대로 읽힌다
    collar(f, M.clothS, M.metal);
    f.blob(-3, 32, 2, 1, M.glow);
    f.blob(3, 32, 2, 1, M.glow);
    f.rect(-1, 32, 3, 1, M.metal);
  },

  // 거울 — 단정하다. 턱선까지 오는 단발에 챙 짧은 캡
  '거울': (f) => {
    face(f, 'calm');
    f.blob(0, HAIRLINE + 2, 6, 2, M.hair);
    f.rect(-7, 37, 2, 5, M.hair);                   // 턱선까지 내려오는 옆머리
    f.rect(5, 37, 2, 5, M.hair);
    f.set(-7, 36, M.hairS); f.set(6, 36, M.hairS);
    bangs(f, -4, -1, 2);
    f.blob(0, HAIRLINE + 3, 6, 2, M.cloth);         // 캡
    f.rect(-7, HAIRLINE + 1, 15, 1, M.metal);       // 짧은 챙
    f.rect(-7, HAIRLINE + 2, 15, 1, M.accent);
    collar(f, M.cloth, M.clothS);
  },

  // 바늘 — 저격수. 후드를 젖혀 목에 걸치고 앞머리 한 갈래가 길다
  '바늘': (f) => {
    face(f, 'worried');
    hairCap(f, 0, 5);
    bangs(f, -4, -2, 2);
    f.rect(5, 37, 1, 4, M.hair);                    // 길게 내린 한 갈래
    f.set(5, 36, M.hairS);
    // 뒤로 젖힌 후드가 어깨에 얹혀 있다
    f.blob(-5, 33, 5, 2, M.cloth);
    f.blob(5, 33, 5, 2, M.cloth);
    f.rect(-9, 34, 19, 1, M.clothS);
    f.blob(-8, 31, 3, 3, M.cloth);                  // 등 뒤로 늘어진 자락
  },

  // 반딧불 — 부스스한 곱슬에 더듬이 핀 두 개
  '반딧불': (f) => {
    face(f, 'soft');
    hairCap(f, 1, 4);
    bangs(f, -5, -3, 0, 3);
    for (const x of [-7, 6] as const) {             // 곱슬 — 옆으로 부푼다
      f.blob(x, HAIRLINE + 2, 2, 2, M.hair);
      f.set(x + (x < 0 ? -1 : 1), HAIRLINE + 3, M.hair);
    }
    for (const x of [-3, 3] as const) {             // 더듬이
      f.rect(x, HAIRLINE + 5, 1, 3, M.metal);
      f.blob(x, HAIRLINE + 9, 1, 1, M.glow);
    }
    collar(f, M.cloth, M.clothS);
  },

  // 도끼 — 덥수룩하다. 머리띠로 겨우 눌러 놨다
  '도끼': (f) => {
    face(f, 'bold');
    f.blob(0, HAIRLINE + 3, 7, 3, M.hair);          // 크게 부푼 머리
    f.rect(-8, HAIRLINE - 3, 2, 5, M.hair);
    f.rect(6, HAIRLINE - 3, 2, 5, M.hair);
    f.blob(0, HAIRLINE + 4, 5, 1, M.hairS);
    bangs(f, -5, -3, 0, 2, 4);
    f.set(-8, HAIRLINE + 4, M.hair); f.set(8, HAIRLINE + 3, M.hair);
    f.rect(-7, HAIRLINE, 15, 2, M.accent);      // 머리띠
    f.rect(-7, HAIRLINE, 15, 1, M.clothS);
    f.rect(-10, HAIRLINE - 1, 3, 2, M.accent);          // 뒤로 흐르는 자락
    f.rect(-11, HAIRLINE - 2, 2, 1, M.clothS);
  },

  // 작살 — 물에서 일한다. 젖어서 넘긴 머리, 물안경은 목에
  '작살': (f) => {
    face(f, 'calm');
    f.blob(0, HAIRLINE + 2, 6, 2, M.hair);
    f.blob(1, HAIRLINE + 3, 5, 1, M.hairS);         // 뒤로 넘긴 결
    f.rect(-7, HAIRLINE - 2, 2, 4, M.hair);
    f.rect(5, HAIRLINE - 2, 2, 4, M.hair);
    f.rect(-3, HAIRLINE, 6, 1, M.hairS);            // 이마가 드러난다
    f.set(-5, HAIRLINE + 3, M.hairS); f.set(4, HAIRLINE + 3, M.hairS);
    collar(f, M.clothS, M.metal);                   // 목에 건 물안경
    f.blob(-3, 32, 2, 1, M.glow);
    f.blob(3, 32, 2, 1, M.glow);
  },

  // 사슬 — 긴 머리를 하나로 묶고 목도리를 둘렀다
  '사슬': (f) => {
    face(f, 'sly');
    f.blob(0, HAIRLINE + 2, 6, 2, M.hair);
    bangs(f, -4, -2, 1, 3);
    f.rect(-7, 37, 2, 5, M.hair);
    f.rect(5, 37, 2, 5, M.hair);
    // 뒤로 묶어 늘어뜨린 머리 — 흔들릴 것 같은 게 있어야 살아 보인다
    f.blob(-7, HAIRLINE + 1, 2, 2, M.accent);       // 묶은 자리
    f.taper(-9, 34, HAIRLINE, 4, 2, M.hair);
    f.blob(-10, 33, 2, 2, M.hairS);
    // 목도리 — 한쪽 끝이 길게 날린다
    f.blob(0, 33, 7, 2, M.cloth);
    f.rect(-6, 34, 13, 1, M.clothS);
    f.taper(10, 26, 33, 3, 4, M.cloth);
    f.rect(9, 26, 3, 1, M.clothS);
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
    suit: '#525d70', metal: '#aab4c2', glow: '#ff9a4c', skin: '#e0a882',
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
    suit: '#5c6474', metal: '#b6c2d2', glow: '#eaf6ff', skin: '#e8b48c',
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
    suit: '#2f6360', metal: '#8fa8a4', glow: '#5ce0d0', skin: '#a8734c',
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
    suit: '#3b4f83', metal: '#93a6c8', glow: '#7cc4ff', skin: '#e0a882',
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
    suit: '#4d465f', metal: '#b3a6ce', glow: '#c79bee', skin: '#a8734c',
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
  // 발을 더 벌린다. 붙여 놓으면 부츠 두 짝이 한 덩어리로 뭉쳐
  // 다리가 아니라 치마처럼 보인다.
  // 좌우 폭도 한 칸 어긋나 있다. 두 발을 정확히 같은 거리에 두면
  // 차렷 자세가 되고, 그것만으로 사람이 아니라 인형이 된다.
  const footF = pose.footF ?? [5, 0];
  const footB = pose.footB ?? [-6, 0];

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
