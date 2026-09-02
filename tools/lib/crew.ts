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

/** 서 있는 자세의 골반 높이. 머리·몸통 절대 좌표가 전부 이 값 기준이다 */
export const HIP0 = 16;

export type ArmPose =
  | 'down' | 'rest' | 'forward' | 'back' | 'up' | 'guard' | 'aim' | 'swing_hi' | 'swing_lo';

/** 어깨에서 손까지의 상대 위치 */
const HAND: Record<ArmPose, [number, number]> = {
  down: [1, -8],
  // 힘을 뺀 팔. 몸에서 조금 떨어져 더 아래로 늘어진다. 서 있는 자세에서
  // 두 팔이 똑같이 'down' 이면 좌우가 완벽히 대칭이라 사람이 아니라
  // 인형으로 보인다 — 빈 팔의 기본값을 이걸로 둔 이유다.
  rest: [3, -10],
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
  const shY = hipY + 8;
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
  // --- 실루엣: 골반 → 잘록한 허리 → 넓은 가슴. 위아래 폭이 같으면 통이다
  f.taper(0, 12, 17, 11 + 2 * s, 9 + s, M.cloth);
  f.taper(0, 17, 25, 9 + s, 12 + 2 * s, M.cloth);
  f.blob(0, 25, 6 + s, 2, M.cloth);

  // --- 어깨. 몸에서 흘러내리는 둥근 것. 오른쪽을 한 칸 낮춰 힘을 뺀다
  f.blob(-7 - s, 25, 3 + s, 3, M.cloth);
  f.blob(7 + s, 24, 3 + s, 3, M.cloth);
  f.set(-7 - s, 23, M.clothS);                    // 겨드랑이 접힘
  f.set(7 + s, 22, M.clothS);
  // 견갑 — 어깨 위에 얹힌 금속판. 몸통과 같은 색 천만으로는 팔이
  // 어디서 시작하는지 안 보인다. 록맨류는 이 자리가 늘 딱딱하다
  f.blob(-7 - s, 26, 3 + s, 2, M.joint);
  f.blob(7 + s, 25, 3 + s, 2, M.joint);
  f.set(-8 - s, 27, M.spec);                      // 빛 쪽 견갑 하이라이트

  // --- 옷깃 → 앞섶 → 허리띠.
  //
  // 여기가 이 몸통의 전부다. 예전엔 실루엣만 잡고 안쪽을 비워 뒀는데,
  // 그러면 아무리 명암을 잘 먹여도 '색칠한 덩어리'지 '옷 입은 사람'이
  // 아니다. 옷깃이 벌어져 있고 앞섶이 내려가고 허리가 묶여 있어야
  // 비로소 입은 것으로 읽힌다.
  f.rect(-4, 25, 3, 1, M.clothH);                 // 벌어진 옷깃
  f.rect(2, 25, 3, 1, M.clothH);
  f.set(-2, 24, M.clothH); f.set(2, 24, M.clothH);
  f.set(-1, 23, M.clothS); f.set(1, 23, M.clothS); // 깃 끝이 만나는 자리
  f.line(0, 22, 0, 18, 1, M.clothS);              // 앞섶 한 줄

  f.rect(-5 - s, 16, 11 + 2 * s, 2, M.clothS);    // 허리띠
  f.rect(-5 - s, 17, 11 + 2 * s, 1, M.clothH);    // 띠 윗면
  f.rect(-1, 16, 3, 2, M.accent);                 // 버클
  f.soft(3 + s, 12, 4, 4, 1, M.clothS);           // 허리에 매단 주머니
  f.rect(3 + s, 14, 4, 1, M.clothH);
  f.set(4 + s, 15, M.accent);

  // 허리 주름 두 줄 — 천은 접힌다. 이게 없으면 아래위가 한 판이다
  f.rect(-5 - s, 19, 2, 1, M.clothS);
  f.rect(4 + s, 18, 2, 1, M.clothS);

  // --- 가슴에 붙은 단단한 것 하나. 이게 있어야 나머지가 천으로 읽힌다.
  //     가운데에 큰 판을 붙이면 그게 곧 로봇 흉갑이라, 한쪽으로 치우친
  //     작은 패널로 줄였다. 좌우가 어긋나 있는 게 사람이다.
  f.soft(-6 - s, 19, 5 + s, 4, 1, M.joint);
  f.rect(-6 - s, 22, 5 + s, 1, M.accent);
  f.set(-6 - s, 22, M.spec);                      // 가슴판 모서리 하이라이트
  // 코어 보석 — 사각 점 하나가 아니라 둥근 보석. 구석에 밝은 점을
  // 하나 곁들이면 그냥 빛나는 게 아니라 반짝이는 것으로 보인다
  f.blob(-5 - s, 20, 1, 1, M.glow);
  f.set(-5 - s, 21, M.spec);

  // 목 — 두 줄은 보여야 한다. 목이 안 보이면 머리가 어깨에 얹힌
  // 것으로 읽히고, 그게 인형처럼 보이는 큰 원인이었다
  f.rect(-2, 26, 4, 4, M.skin);
  f.rect(-2, 29, 4, 1, M.skinS);                  // 턱 밑 그늘
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
export const HAIRLINE = 39;

export function face(f: F, brow: BrowShape = 'calm'): void {
  // 둥근 달걀형 머리 — 예전보다 한 단 작다. 아래로 갈수록 좁아진다
  f.blob(0, 37, 5, 6, M.skin);
  f.taper(0, 29, 31, 4, 9, M.skin);
  f.set(-4, 30, M.skinS); f.set(4, 30, M.skinS);   // 턱선
  // 볼의 입체는 이제 formTone 자동 음영이 낸다. 예전엔 여기에 각진
  // 사각 블록으로 그늘·하이라이트를 얹었는데, 그러데이션 위에 각진
  // 블록이 얹히니 음영이 아니라 얼룩처럼 보였다 — 자동 음영과 손으로
  // 얹는 블록은 같이 쓰면 안 된다.
  // 이마 하이라이트 — 팔다리가 갑옷판으로 반짝이는 옆에서 얼굴만
  // 납작하면 붕 뜬다. 광원 쪽에 한 점.
  f.set(-2, 38, M.spec);

  // --- 눈. 왼쪽 x -4..-2, 오른쪽 x 2..4, 세로 y33..35
  //
  // 예전엔 눈 하나가 4×4 흰자 상자였다. 머리가 작아진 지금 그 비율을
  // 그대로 쓰면 흰자가 얼굴의 절반을 차지해 더 심하게 부릅뜬다.
  // 그래서 흰자 상자를 없애고 홍채색 덩이 하나 + 눈빛 한 점으로
  // 바꿨다 — 어두운 건 윗속눈썹 한 줄과 눈꼬리 한 점뿐이다.
  for (const ex of [-4, 2] as const) {
    const tail = ex < 0 ? ex : ex + 2;             // 바깥쪽 눈꼬리
    f.rect(ex, 33, 3, 3, M.iris);                  // 홍채가 눈 전체를 채운다
    f.set(ex, 33, M.skin); f.set(ex + 2, 33, M.skin);   // 아래 모서리를 깎아 둥글게
    f.rect(ex, 35, 3, 1, M.eye);                   // 윗속눈썹
    f.set(tail, 34, M.eye);                        // 눈꼬리
    f.set(ex + 1, 34, M.white);                    // 눈빛 — 이 한 점이 생기를 만든다
  }

  drawBrow(f, brow);

  // 볼 홍조 — 눈보다 한 단 바깥, 한 단 아래. 눈에 붙이면 눈 테두리로
  // 먹히고, 머리가 작아진 만큼 자리도 좁아져 한 칸짜리로 줄였다.
  f.set(-5, 32, M.blush);
  f.set(4, 32, M.blush);

  // 입 — 세 점짜리 웃음. 코는 안 찍는다 — 이 좁은 턱에 코까지 넣으면
  // 입과 붙어 얼룩이 된다.
  f.set(0, 30, M.mouth);
  f.set(-1, 31, M.mouth);
  f.set(1, 31, M.mouth);
}

/**
 * 얼굴 — 고개를 돌린 버전. 시험 삼아 못 하나에만 쓴다.
 *
 * 1차 시도는 기존 정면 얼굴을 그대로 두고 눈 하나만 가늘게 접었다 —
 * 대칭으로 설계된 그림 위에 비대칭을 얹은 꼴이라 눈이 찌그러지거나
 * 감긴 것처럼 보였다("망쳐놨다"는 말을 들었다).
 *
 * 2차 시도는 두개골은 새로 그렸지만 먼 쪽 눈을 '더 작은 눈'으로
 * 다시 그렸다 — 이게 여전히 문제였다. 이 해상도에서 눈은 원래
 * 3×3인데 그걸 2×2로 줄이면 홍채·눈꺼풀·눈빛이 들어갈 자리가
 * 없어서 뭉치고, 뭉친 덩어리는 결국 '둘 중 하나가 이상한 눈'으로
 * 읽힌다. 작게 그리는 방식 자체가 이 해상도에서는 성립하지 않는다.
 *
 * 3차: 먼 쪽 눈을 아예 그리지 않는다. 사람이 고개를 돌리면 먼 쪽
 * 눈은 코에 가려 실제로 거의 안 보인다 — 저해상도 초상화들이 3/4
 * 각도에서 흔히 쓰는 생략이다. 가까운 쪽 눈은 정면 얼굴의 검증된
 * 눈을 그대로 쓰고(재활용이 아니라 '안 바꿔도 되는 걸 안 바꾼 것'),
 * 먼 쪽은 눈 대신 눈두덩 그늘 한 칸만 남긴다 — 이러면 '작은 눈'과
 * '감은 눈'을 구분해야 하는 문제 자체가 사라진다.
 */
export function faceTurned(f: F, brow: BrowShape = 'calm'): void {
  const cx = 1;                                     // 두개골 중심 — 가까운 쪽(+x)으로 한 칸
  f.blob(cx, 37, 4, 6, M.skin);
  f.taper(cx, 29, 31, 4, 8, M.skin);
  f.set(-2, 30, M.skinS); f.set(4, 30, M.skinS);     // 턱선 — 양쪽 폭이 다르다
  f.set(5, 33, M.skin);                              // 코 능선 — 가까운 쪽 옆얼굴이 한 칸 튀어나온다
  f.set(5, 32, M.skinS);                             // 콧대 그늘
  f.set(-2, 38, M.spec);

  // --- 눈. 가까운 쪽(오른쪽, ex=2)만 그린다 — 정면 얼굴과 완전히
  // 같은 눈이다. 검증된 걸 또 건드릴 이유가 없다.
  {
    const ex = 2;
    f.rect(ex, 33, 3, 3, M.iris);
    f.set(ex, 33, M.skin); f.set(ex + 2, 33, M.skin);
    f.rect(ex, 35, 3, 1, M.eye);
    f.set(ex + 2, 34, M.eye);
    f.set(ex + 1, 34, M.white);
  }
  // 먼 쪽(왼쪽)엔 눈을 아예 안 찍는다 — 자동 형태광이 두개골 왼쪽을
  // 이미 그늘로 계산해 준다. 여기 손으로 그늘 점 하나를 더 얹었더니
  // 넓은 살빛 한복판에 뜬 얼룩이 됐다(실제로 그랬다) — 진짜 경계에
  // 붙지 않은 skinS 점은 그늘이 아니라 때로 보인다는 걸 다시 확인했다.

  browMark(f, 2, 1, brow);                            // 눈썹도 가까운 쪽만

  f.set(4, 32, M.blush);                              // 먼 쪽 볼은 좁아서 홍조 자리가 없다

  // 입 — 코 능선과 같은 쪽으로 한 칸 밀고, 먼 쪽은 짧게 접는다
  f.set(2, 30, M.mouth);
  f.set(1, 31, M.mouth);
  f.set(3, 31, M.mouth);
}

/** 눈썹 모양 — 성격을 한 획으로 정한다 */
export type BrowShape = 'calm' | 'soft' | 'bold' | 'worried' | 'sly';

/**
 * 눈썹 한 짝. drawBrow() 가 좌우 두 번 부르고, faceTurned() 는 가까운
 * 쪽 한 번만 부른다 — 먼 쪽은 눈 자체를 안 그리므로 눈썹만 남으면
 * 흉터처럼 뜬다.
 */
function browMark(f: F, ex: number, dir: 1 | -1, shape: BrowShape): void {
  // 기준선은 y37 이다. 눈(y33~35)과 두 줄 띄워 뒀다 — 붙이면 헤드밴드·
  // 고글 같은 이마 장식이 내려올 때 눈썹과 뭉개진다(실제로 그랬다).
  const inner = dir > 0 ? ex : ex + 2;
  const outer = dir > 0 ? ex + 2 : ex;
  switch (shape) {
    case 'soft':      // 바깥이 처진다 — 순하고 다정해 보인다
      f.rect(ex, 37, 3, 1, M.brow);
      f.set(outer, 36, M.brow);
      break;
    case 'bold':      // 굵고 눈에 가깝다 — 우직함
      f.rect(ex, 36, 3, 2, M.brow);
      break;
    case 'worried':   // 안쪽이 처지고 바깥이 올라간다 — 걱정이 많다
      f.rect(ex, 37, 3, 1, M.brow);
      f.set(inner, 36, M.brow);
      break;
    case 'sly':       // 한쪽만 치켜올린다 — 장난기
      f.rect(ex, 37, 3, 1, M.brow);
      if (dir > 0) f.set(ex + 1, 36, M.brow);
      break;
    default:          // calm
      f.rect(ex, 37, 3, 1, M.brow);
      break;
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
  f.blob(0, HAIRLINE + 4, 7 + puff, 4, M.hair);          // 정수리
  f.blob(0, HAIRLINE + 5, 6 + puff, 3, M.hair);
  f.blob(0, HAIRLINE + 6, 5, 2, M.hairS);                // 결 그늘
  // 옆머리는 얼굴 바깥으로만 흐른다 — 볼을 덮으면 얼굴이 좁아진다
  f.rect(-8 - puff, HAIRLINE - sideLen, 2, sideLen + 2, M.hair);
  f.rect(6 + puff, HAIRLINE - sideLen, 2, sideLen + 2, M.hair);
  f.set(-8 - puff, HAIRLINE - sideLen - 1, M.hairS);
  f.set(7 + puff, HAIRLINE - sideLen - 1, M.hairS);
  // 머리 윗면에 또렷한 결 하이라이트 한 점 — 애니메 머리카락 특유의
  // 그 반짝임이다. 부드러운 그러데이션만으로는 절대 안 나온다.
  f.set(-2, HAIRLINE + 7, M.spec);
}

/** 이마로 내려온 앞머리 — 헤어라인 아래로 한 칸만. 더 내리면 눈을 덮는다 */
function bangs(f: F, ...cols: number[]): void {
  for (const x of cols) {
    f.rect(x, HAIRLINE, 1, 2, M.hair);
    f.set(x, HAIRLINE - 1, M.hairS);   // 이마에 드리운 끝 한 칸
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
  f.blob(0, 26, 5, 1, mat);
  f.rect(-4, 27, 9, 1, lit);
  f.set(-5, 25, mat); f.set(5, 25, mat);
}

export const HEADS: Record<string, Head> = {
  // 못 — 맏이. 짧게 친 머리에 작업 밴드 하나. 눈썹이 굵고 곧다
  '못': (f) => {
    faceTurned(f, 'bold');
    hairCap(f, 0, 4);
    bangs(f, -4, -1, 3);
    f.rect(-8, HAIRLINE + 1, 17, 2, M.accent);      // 이마 밴드
    f.rect(-8, HAIRLINE + 1, 17, 1, M.metal);
    f.blob(-9, HAIRLINE + 2, 1, 2, M.accent);       // 옆으로 삐져나온 매듭
    collar(f, M.cloth, M.clothS);
  },

  // 종 — 제일 시끄러운 무기를 든다. 귀를 덮는 폭신한 것
  '종': (f) => {
    face(f, 'calm');
    hairCap(f, 0, 3);
    bangs(f, -3, 1);
    for (const x of [-9, 8] as const) {             // 이어머프 — 둥글고 두껍게
      f.blob(x, 36, 3, 4, M.cloth);
      f.blob(x, 36, 2, 3, M.clothS);
      f.set(x, 37, M.accent);
    }
    f.rect(-9, HAIRLINE + 5, 18, 1, M.cloth);       // 머리 위를 지나는 띠
    collar(f, M.cloth, M.clothS);
  },

  // 불씨 — 불을 다룬다. 헝클어진 머리, 고글은 목에 걸쳐 둔다
  '불씨': (f) => {
    face(f, 'sly');
    hairCap(f, 1, 4);
    bangs(f, -5, -3, 0, 2, 4);
    f.set(-8, HAIRLINE + 5, M.hair);                // 삐친 머리
    f.set(8, HAIRLINE + 6, M.hair);
    f.set(9, HAIRLINE + 4, M.hair);
    // 목에 걸친 고글 — 얼굴을 안 가리면서 직업은 그대로 읽힌다
    collar(f, M.clothS, M.metal);
    f.blob(-3, 26, 2, 1, M.glow);
    f.blob(3, 26, 2, 1, M.glow);
    f.rect(-1, 26, 3, 1, M.metal);
  },

  // 거울 — 단정하다. 턱선까지 오는 단발에 챙 짧은 캡
  '거울': (f) => {
    face(f, 'calm');
    f.blob(0, HAIRLINE + 3, 7, 4, M.hair);
    f.rect(-8, 32, 2, 9, M.hair);                   // 턱선까지 내려오는 옆머리
    f.rect(6, 32, 2, 9, M.hair);
    f.set(-8, 31, M.hairS); f.set(7, 31, M.hairS);
    bangs(f, -4, -1, 2);
    f.blob(0, HAIRLINE + 5, 7, 3, M.cloth);         // 캡
    f.rect(-9, HAIRLINE + 2, 19, 1, M.metal);       // 짧은 챙
    f.rect(-9, HAIRLINE + 3, 19, 1, M.accent);
    collar(f, M.cloth, M.clothS);
  },

  // 바늘 — 저격수. 후드를 젖혀 목에 걸치고 앞머리 한 갈래가 길다
  '바늘': (f) => {
    face(f, 'worried');
    hairCap(f, 0, 5);
    bangs(f, -4, -2, 2);
    f.rect(5, 34, 1, 6, M.hair);                    // 길게 내린 한 갈래
    f.set(5, 33, M.hairS);
    // 뒤로 젖힌 후드가 어깨에 얹혀 있다
    f.blob(-5, 27, 5, 2, M.cloth);
    f.blob(5, 27, 5, 2, M.cloth);
    f.rect(-9, 28, 19, 1, M.clothS);
    f.blob(-8, 25, 3, 3, M.cloth);                  // 등 뒤로 늘어진 자락
  },

  // 반딧불 — 부스스한 곱슬에 더듬이 핀 두 개
  '반딧불': (f) => {
    face(f, 'soft');
    hairCap(f, 1, 4);
    bangs(f, -5, -3, 0, 3);
    for (const x of [-8, 7] as const) {             // 곱슬 — 옆으로 부푼다
      f.blob(x, HAIRLINE + 3, 2, 3, M.hair);
      f.set(x + (x < 0 ? -1 : 1), HAIRLINE + 4, M.hair);
    }
    for (const x of [-3, 3] as const) {             // 더듬이
      f.rect(x, HAIRLINE + 8, 1, 3, M.metal);
      f.blob(x, HAIRLINE + 12, 1, 1, M.glow);
    }
    collar(f, M.cloth, M.clothS);
  },

  // 도끼 — 덥수룩하다. 머리띠로 겨우 눌러 놨다
  '도끼': (f) => {
    face(f, 'bold');
    f.blob(0, HAIRLINE + 5, 8, 6, M.hair);          // 크게 부푼 머리
    f.rect(-10, HAIRLINE - 4, 2, 7, M.hair);
    f.rect(8, HAIRLINE - 4, 2, 7, M.hair);
    f.blob(0, HAIRLINE + 8, 6, 2, M.hairS);
    bangs(f, -5, -3, 0, 2, 4);
    f.set(-9, HAIRLINE + 6, M.hair); f.set(9, HAIRLINE + 5, M.hair);
    f.rect(-9, HAIRLINE + 1, 19, 2, M.accent);      // 머리띠
    f.rect(-9, HAIRLINE + 1, 19, 1, M.clothS);
    f.rect(-12, HAIRLINE, 3, 2, M.accent);          // 뒤로 흐르는 자락
    f.rect(-13, HAIRLINE - 1, 2, 1, M.clothS);
  },

  // 작살 — 물에서 일한다. 젖어서 넘긴 머리, 물안경은 목에
  '작살': (f) => {
    face(f, 'calm');
    f.blob(0, HAIRLINE + 3, 7, 4, M.hair);
    f.blob(1, HAIRLINE + 5, 6, 3, M.hairS);         // 뒤로 넘긴 결
    f.rect(-8, HAIRLINE - 3, 2, 5, M.hair);
    f.rect(6, HAIRLINE - 3, 2, 5, M.hair);
    f.rect(-3, HAIRLINE, 7, 1, M.hairS);            // 이마가 드러난다
    f.set(-6, HAIRLINE + 5, M.hairS); f.set(5, HAIRLINE + 6, M.hairS);
    collar(f, M.clothS, M.metal);                   // 목에 건 물안경
    f.blob(-3, 26, 2, 1, M.glow);
    f.blob(3, 26, 2, 1, M.glow);
  },

  // 사슬 — 긴 머리를 하나로 묶고 목도리를 둘렀다
  '사슬': (f) => {
    face(f, 'sly');
    f.blob(0, HAIRLINE + 3, 7, 4, M.hair);
    bangs(f, -4, -2, 1, 3);
    f.rect(-9, 33, 2, 8, M.hair);
    f.rect(7, 33, 2, 8, M.hair);
    // 뒤로 묶어 늘어뜨린 머리 — 흔들릴 것 같은 게 있어야 살아 보인다
    f.blob(-9, HAIRLINE + 1, 2, 2, M.accent);       // 묶은 자리
    f.taper(-11, 30, HAIRLINE, 4, 2, M.hair);
    f.blob(-12, 29, 2, 2, M.hairS);
    // 목도리 — 한쪽 끝이 길게 날린다
    f.blob(0, 27, 7, 2, M.cloth);
    f.rect(-6, 28, 13, 1, M.clothS);
    f.taper(10, 20, 27, 3, 4, M.cloth);
    f.rect(9, 20, 3, 1, M.clothS);
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
