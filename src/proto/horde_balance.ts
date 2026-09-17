/**
 * 호드 모드의 밸런스 데이터 — 잡몹 종류, 속성 상성, 웨이브 배분, 보스
 * 목록, 저주 단계. 전부 순수 데이터/함수이고 렌더링·입력 같은 엔진
 * 상태를 전혀 참조하지 않는다.
 *
 * horde.ts 는 6,700줄 넘는 하나의 클로저(runHordeProto)라 그 안에 있던
 * 것들은 전부 pixi.js 렌더러·입력과 뒤섞여 있다. 이 표들은 예외적으로
 * 그런 의존이 전혀 없어서 그대로 떼어 낼 수 있었다 — validate-data.ts
 * 같은 검증 스크립트가 이 파일 하나만 보면 되게 하는 것도 목적이다.
 */

type FoeKind = 'crawler' | 'walker' | 'hopper' | 'biter' | 'sniper_drone';

interface KindDef {
  hp: number;
  speed: number;
  r: number;
  touch: number;
  xp: number;
  scale: number;
  elem: Element;
}

/**
 * 잡몹 행동. 전부 똑같이 쫓아오기만 하면 200마리가 한 덩어리로 움직여서
 * 볼 게 없다. 붙는 놈·튀는 놈·파고드는 놈·쏘는 놈으로 갈라 놓으면
 * 같은 수라도 화면이 훨씬 살아난다.
 */
type Behavior = 'chase' | 'hop' | 'charge' | 'shooter';

const BEHAVIOR: Record<FoeKind, Behavior> = {
  crawler: 'chase',
  walker: 'chase',
  hopper: 'hop',
  biter: 'charge',
  sniper_drone: 'shooter',
};

const KINDS: Record<FoeKind, KindDef> = {
  crawler: { hp: 6, speed: 34, r: 9, touch: 7, xp: 1, scale: 0.9, elem: 'aqua' },
  walker: { hp: 10, speed: 44, r: 10, touch: 9, xp: 1, scale: 1, elem: 'elec' },
  hopper: { hp: 5, speed: 62, r: 8, touch: 7, xp: 1, scale: 0.85, elem: 'ice' },
  biter: { hp: 14, speed: 78, r: 10, touch: 9, xp: 2, scale: 1, elem: 'fire' },
  sniper_drone: { hp: 8, speed: 50, r: 9, touch: 8, xp: 2, scale: 0.9, elem: 'elec' },
};

const KIND_LIST = Object.keys(KINDS) as FoeKind[];

/**
 * 속성 — 록맨에서 보스 순서가 의미 있는 이유가 이것이다.
 *
 * 지금까지 무기는 전부 "그냥 딜"이라 뭘 뽑든 비슷했다. 속성을 넣으면
 * 수집이 "더 센 것"에서 **"맞는 걸 골라 쓰는 것"**으로 바뀐다.
 * 상성은 한 바퀴 도는 고리로 잡았다 — 외우기 쉬워야 쓸 수 있다.
 *
 *   전기 → 물 → 불 → 얼음 → 전기   (각각 다음 것에 강하다)
 *   무속성은 상성이 없고 아무에게도 안 밀린다.
 */
type Element = 'none' | 'elec' | 'aqua' | 'fire' | 'ice';

const BEATS: Record<Element, Element> = {
  elec: 'aqua', aqua: 'fire', fire: 'ice', ice: 'elec', none: 'none',
};

const ELEM_COLOR: Record<Element, number> = {
  none: 0xcfe0ff, elec: 0xffe86b, aqua: 0x6ec8ff, fire: 0xff7b3c, ice: 0xa8e8ff,
};

const ELEM_NAME: Record<Element, string> = {
  none: '무', elec: '전기', aqua: '수', fire: '화', ice: '빙',
};

/**
 * 위 ELEM_NAME 은 보스 이름표처럼 자리가 빠듯한 곳에 쓰는 약칭이라
 * '수·화·빙' 한 글자와 '전기' 두 글자가 섞여 있다. 그대로 문장에 넣으면
 * "화 무리 접근" 처럼 읽히므로, 문장에 들어갈 자리에는 이쪽을 쓴다.
 */
const ELEM_WORD: Record<Element, string> = {
  none: '무속성', elec: '전기', aqua: '물', fire: '불', ice: '얼음',
};

/** 상성 배율 — 3배는 눈에 확 띄어야 "골라 쓴다"는 판단이 생긴다 */
const WEAK_MULT = 3;
const RESIST_MULT = 0.55;

function elemMult(atk: Element, def: Element): number {
  if (atk === 'none' || def === 'none') return 1;
  if (BEATS[atk] === def) return WEAK_MULT;
  if (BEATS[def] === atk) return RESIST_MULT;
  return 1;
}

/**
 * 스폰 비율. 균등하게 뽑으면 사격형이 다섯 중 하나가 되는데, 화면에 100
 * 마리가 있으면 그중 20마리가 계속 쏴대서 피할 수가 없다. 쏘는 놈은
 * 어쩌다 하나 섞여야 위협으로 읽히지, 흔하면 그냥 환경 피해가 된다.
 */
const SPAWN_WEIGHT: Record<FoeKind, number> = {
  crawler: 30,
  walker: 25,
  hopper: 22,
  biter: 16,
  sniper_drone: 7,
};
const SPAWN_TOTAL = KIND_LIST.reduce((a, k) => a + SPAWN_WEIGHT[k], 0);

/**
 * 잡몹 체력 배율의 상한. 대략 120초쯤에 닿고, 그 뒤로는 체력이 아니라
 * 머릿수만으로 압박한다 — 원래 이 파일이 "난이도는 체력이 아니라
 * 머릿수가 끌고 간다" 고 적어 둔 방침 그대로다.
 */
const GROW_CAP = 18;

/**
 * 구간(웨이브)마다 한 속성이 화면을 지배한다.
 *
 * 예전엔 이 비율이 처음부터 끝까지 고정이었다 — 1초째 화면도 60초째
 * 화면도 물 30 · 전기 32 · 얼음 22 · 불 16 이 똑같이 섞여 있었다.
 * 그러면 상성 3배가 통계적으로 그냥 상수로 평균나 버려서, 속성이
 * "고르는 것"이 아니라 내가 손댈 수 없는 데미지 편차로만 작동한다.
 * 가위바위보가 성립하려면 상대가 뭘 낼지 알 수 있어야 한다.
 *
 * 구간마다 한 속성으로 몰아주면 비로소 "읽고 대비한다"가 생긴다.
 * 잡몹 종류가 속성에 묶여 있어서(얼음=호퍼, 불=바이터 …) 구간이 바뀌면
 * 색만이 아니라 움직임까지 통째로 바뀌는 것이 덤으로 따라온다.
 */
const WAVE_DOMINANT = 0.58;
/**
 * 쏘는 놈은 구간과 무관하게 희소하게 유지한다 — 위 SPAWN_WEIGHT 주석과
 * 같은 이유다. 전기 구간이라고 드론까지 같이 불려 놓으면 화면 전체가
 * 피할 수 없는 탄막이 된다.
 */
const SNIPER_SHARE = SPAWN_WEIGHT.sniper_drone / SPAWN_TOTAL;

/** 속성당 한 번만 계산하면 되는 값이다 — 스폰은 초당 수십 번 돈다 */
const WAVE_WEIGHT_CACHE = new Map<Element, Record<FoeKind, number>>();

function waveWeights(dom: Element): Record<FoeKind, number> {
  const hit = WAVE_WEIGHT_CACHE.get(dom);
  if (hit) return hit;

  const out = {} as Record<FoeKind, number>;
  const lead = KIND_LIST.filter((k) => k !== 'sniper_drone' && KINDS[k].elem === dom);
  if (!lead.length) {
    // 해당 속성의 잡몹이 없다(무속성 구간 등) — 원래 비율 그대로 간다
    for (const k of KIND_LIST) out[k] = SPAWN_WEIGHT[k] / SPAWN_TOTAL;
    WAVE_WEIGHT_CACHE.set(dom, out);
    return out;
  }

  const rest = KIND_LIST.filter((k) => k !== 'sniper_drone' && !lead.includes(k));
  const room = 1 - SNIPER_SHARE;
  const leadSum = lead.reduce((a, k) => a + SPAWN_WEIGHT[k], 0);
  const restSum = rest.reduce((a, k) => a + SPAWN_WEIGHT[k], 0);

  out.sniper_drone = SNIPER_SHARE;
  for (const k of lead) out[k] = room * WAVE_DOMINANT * (SPAWN_WEIGHT[k] / leadSum);
  for (const k of rest) {
    out[k] = restSum ? room * (1 - WAVE_DOMINANT) * (SPAWN_WEIGHT[k] / restSum) : 0;
  }
  WAVE_WEIGHT_CACHE.set(dom, out);
  return out;
}

function pickKind(dom: Element): FoeKind {
  const wt = waveWeights(dom);
  let r = Math.random();
  for (const k of KIND_LIST) {
    r -= wt[k];
    if (r <= 0) return k;
  }
  return KIND_LIST[0];
}

/** 구간에 쓰는 속성 — 무속성은 상성이 없어서 구간으로 쓸 값어치가 없다 */
const WAVE_POOL: Element[] = ['elec', 'aqua', 'fire', 'ice'];

/** 직전 구간과 같은 속성이 연달아 나오면 구간을 나눈 의미가 없다 */
function rollWaveElem(avoid: Element): Element {
  const pool = WAVE_POOL.filter((e) => e !== avoid);
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 보스 — 전부 telegraph/attack 태그를 가진 시트다.
 *
 * 예전엔 여덟이 전부 같은 패턴(다가와서 예고하고 사방으로 뿌리기)이라
 * 스프라이트만 다른 같은 적이었다. 록맨에서 보스는 각자 외우는 패턴이
 * 있고, **이기면 그놈의 무기를 준다.** 그게 시리즈의 정체성이라 여기에
 * 그대로 옮겼다 — 이제 보스는 "체력 많은 적"이 아니라 "그 무기를 주는 놈"이다.
 */
type BossPattern =
  | 'slam'      // 내리찍고 충격파 고리
  | 'blink'     // 사라졌다 옆에 나타나 덮친다
  | 'boomer'    // 순간이동 + 돌아오는 부메랑
  | 'charge'    // 예고 후 직선 돌진
  | 'guard'     // 방패를 세우고 유도탄
  | 'dasher'    // 짧은 돌진을 연달아
  | 'sniper'    // 거리를 두고 조준선을 그은 뒤 저격
  | 'barrier';  // 주위를 도는 구슬을 쏘아 보낸다

interface BossDef {
  id: string;
  pattern: BossPattern;
  color: number;
  elem: Element;
  /** 잡으면 주는 무기 id (LEGENDS 안에 있다) */
  drop: string;
}

/**
 * 여덟 보스. 속성은 넷을 둘씩 고르게 나눠 가진다.
 *
 * 예전엔 톱니(saw_fang)와 칼바람(edge_gale)이 무속성이었다. 그런데
 * elemMult 는 한쪽이라도 무속성이면 무조건 1배라, 이 둘이 나오는
 * 스테이지에서는 상성이 통째로 꺼져 있었다 — 여덟 중 둘, 그러니까
 * 네 판에 한 판은 약점도 저항도 없는 맹탕이었다는 뜻이다.
 * 톱니는 도는 전기톱으로, 칼바람은 살을 에는 찬 바람으로 잡았다.
 */
const BOSS_DEFS: BossDef[] = [
  { id: 'bolt_hand', pattern: 'slam', color: 0xffe86b, elem: 'elec', drop: 'bolt_chain' },
  { id: 'water_shade', pattern: 'blink', color: 0x8ef0a0, elem: 'aqua', drop: 'shade_veil' },
  { id: 'saw_fang', pattern: 'boomer', color: 0xc98cff, elem: 'elec', drop: 'saw_return' },
  { id: 'forge_core', pattern: 'charge', color: 0xff9a4c, elem: 'fire', drop: 'forge_ram' },
  { id: 'shell_wall', pattern: 'guard', color: 0x6ec8ff, elem: 'aqua', drop: 'shell_guard' },
  { id: 'edge_gale', pattern: 'dasher', color: 0xff5c9c, elem: 'ice', drop: 'edge_cut' },
  { id: 'frost_eye', pattern: 'sniper', color: 0xdcf4ff, elem: 'ice', drop: 'frost_lance' },
  { id: 'flame_ring', pattern: 'barrier', color: 0xff5c5c, elem: 'fire', drop: 'flame_orbit' },
];

/**
 * 스테이지 배경 — 고른 보스의 속성에 맞춰 한 번 정해진다.
 * 테마가 4개뿐이라 냉각 구획을 수·빙 둘이 나눠 쓴다.
 */
const THEME_FOR_ELEM: Record<Element, number> = { elec: 0, aqua: 1, ice: 1, fire: 2, none: 3 };

/**
 * 저주 — 시간이 지나야만 세지는 지금의 곡선은 플레이어가 손댈 여지가
 * 없다. 처음부터 더 어렵게 시작하고 싶어도 방법이 없고, 반대로 느긋하게
 * 하고 싶어도 시간이 지나면 무조건 세진다. 스테이지를 고를 때 미리
 * "이번 판은 이만큼 세게, 대신 이만큼 더 번다" 를 직접 정하게 한다 —
 * 세 단계 다 강제는 아니고, 0단계(없음)가 지금까지의 기본값 그대로다.
 */
interface CurseTier {
  name: string;
  desc: string;
  mobHp: number;
  spawnRate: number;
  bossHp: number;
  playerHp: number;
  reward: number;
}
const CURSE_TIERS: CurseTier[] = [
  { name: '저주 없음', desc: '기본 난이도', mobHp: 1, spawnRate: 1, bossHp: 1, playerHp: 1, reward: 1 },
  {
    name: '저주 I · 균열 진동', desc: '적 체력 +15% · 스폰 +10% — 보상 ×1.2',
    mobHp: 1.15, spawnRate: 1.1, bossHp: 1.1, playerHp: 1, reward: 1.2,
  },
  {
    name: '저주 II · 균열 폭주', desc: '적 체력 +35% · 스폰 +25% · 보스 체력 +20% — 보상 ×1.45',
    mobHp: 1.35, spawnRate: 1.25, bossHp: 1.2, playerHp: 1, reward: 1.45,
  },
  {
    name: '저주 III · 균열 붕괴', desc: '적 체력 +60% · 스폰 +45% · 보스 체력 +40% · 최대체력 -15% — 보상 ×1.8',
    mobHp: 1.6, spawnRate: 1.45, bossHp: 1.4, playerHp: 0.85, reward: 1.8,
  },
  /**
   * 4단계는 아무나 못 고른다 — 여덟 스테이지를 전부 깨고 무기고를 다
   * 채운 뒤에만 열린다(horde.ts 의 allClear 판정). 파밍이 끝난 다음에도
   * 목표가 하나 남아 있어야 "다 모았으니 이제 뭐 하지" 가 안 생긴다.
   */
  {
    name: '저주 IV · 균열 그 자체', desc: '적 체력 +90% · 스폰 +70% · 보스 체력 +65% · 최대체력 -25% — 보상 ×2.4',
    mobHp: 1.9, spawnRate: 1.7, bossHp: 1.65, playerHp: 0.75, reward: 2.4,
  },
];
const CURSE_COLOR = [0x8a97c4, 0xffe86b, 0xff9a4c, 0xff5c5c, 0xd88cff];
/** 스테이지 선택 화면 힌트 줄은 폭이 270px 뿐이라 desc 전문은 못 들어간다 */
const CURSE_SHORT = ['없음', 'I', 'II', 'III', 'IV'];

export type { FoeKind, KindDef, Behavior, Element, BossPattern, BossDef, CurseTier };
export {
  BEHAVIOR, KINDS, KIND_LIST,
  BEATS, ELEM_COLOR, ELEM_NAME, ELEM_WORD, WEAK_MULT, RESIST_MULT, elemMult,
  SPAWN_WEIGHT, SPAWN_TOTAL, GROW_CAP,
  WAVE_DOMINANT, SNIPER_SHARE, WAVE_WEIGHT_CACHE, waveWeights, pickKind, WAVE_POOL, rollWaveElem,
  BOSS_DEFS, THEME_FOR_ELEM,
  CURSE_TIERS, CURSE_COLOR, CURSE_SHORT,
};
