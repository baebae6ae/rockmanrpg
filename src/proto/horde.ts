/**
 * 기획 프로토타입 — 몰려오는 적을 자동사격으로 갈아버리는 생존 모드.
 * 본편과 완전히 분리돼 있고 ?horde 로만 들어간다.
 *
 * 검증하려는 것은 딱 하나다: "정신없이 총알 갈기는 손맛"이 실제로 나는가.
 * 그래서 조작은 이동/대시뿐이고 사격은 전부 자동이다.
 *
 * 다만 그 상태는 출발점이 아니라 도달점이다. 1발에서 시작해 레벨업으로
 * 쌓아 올려야 "확 늘었다"는 순간이 생기고, 처음부터 화면을 덮어버리면
 * 가만히 서 있어도 사방이 정리돼 긴장이 사라진다.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Input } from '../input/input';
import { AnimView, loadSheet, type Sheet } from '../anim/sheet';
import { THEMES, buildTheme } from './stage_bg';
import { createSfx } from './sfx';
import { GachaReel, RARITY_COLOR, type Rarity, type ReelItem } from './gacha';

/**
 * 이 모드는 본편(560×240 가로)과 화면 비율 자체가 다르다.
 * 사방에서 몰려오는 걸 보여줘야 하는데 가로로 납작하면 위아래가 너무
 * 좁고, 한 손으로 쥔 세로 화면이 이 장르에 훨씬 맞는다.
 * 보이는 넓이는 본편과 거의 같아서(129,600 vs 134,400px²) 적 밀도
 * 수치는 그대로 쓸 수 있다.
 */
const W = 270;
const H = 480;

const ARENA_W = 1400;
const ARENA_H = 900;

const PLAYER_R = 7;
const BASE_SPEED = 108;
const DASH_SPEED = 300;
const DASH_TIME = 0.16;
const DASH_CD = 0.55;
/** 세이버 차지 돌진 — 이 시간에 걸쳐 목적지까지 눈으로 좇을 수 있게 옮긴다 */
const LUNGE_MOVE_DUR = 0.18;

const MAX_BULLETS = 700;
const MAX_FOES = 170;
const MAX_PARTS = 460;
const MAX_GEMS = 80;

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

function pickKind(): FoeKind {
  let r = Math.random() * SPAWN_TOTAL;
  for (const k of KIND_LIST) {
    r -= SPAWN_WEIGHT[k];
    if (r <= 0) return k;
  }
  return KIND_LIST[0];
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

const BOSS_DEFS: BossDef[] = [
  { id: 'bolt_hand', pattern: 'slam', color: 0xffe86b, elem: 'elec', drop: 'bolt_chain' },
  { id: 'water_shade', pattern: 'blink', color: 0x8ef0a0, elem: 'aqua', drop: 'shade_veil' },
  { id: 'saw_fang', pattern: 'boomer', color: 0xc98cff, elem: 'none', drop: 'saw_return' },
  { id: 'forge_core', pattern: 'charge', color: 0xff9a4c, elem: 'fire', drop: 'forge_ram' },
  { id: 'shell_wall', pattern: 'guard', color: 0x6ec8ff, elem: 'aqua', drop: 'shell_guard' },
  { id: 'edge_gale', pattern: 'dasher', color: 0xff5c9c, elem: 'none', drop: 'edge_cut' },
  { id: 'frost_eye', pattern: 'sniper', color: 0xdcf4ff, elem: 'ice', drop: 'frost_lance' },
  { id: 'flame_ring', pattern: 'barrier', color: 0xff5c5c, elem: 'fire', drop: 'flame_orbit' },
];

/**
 * 스테이지 배경 — 고른 보스의 속성에 맞춰 한 번 정해진다.
 * 테마가 4개뿐이라 냉각 구획을 수·빙 둘이 나눠 쓴다.
 */
const THEME_FOR_ELEM: Record<Element, number> = { elec: 0, aqua: 1, ice: 1, fire: 2, none: 3 };


interface EnemyLite { id: string; name?: string }
const ENEMY_NAMES: Record<string, string> = {};
for (const e of Object.values(
  import.meta.glob('/data/enemies/*.json', { eager: true, import: 'default' }) as Record<string, EnemyLite>,
)) {
  if (e.name) ENEMY_NAMES[e.id] = e.name;
}

interface Foe {
  kind: FoeKind;
  x: number;
  y: number;
  kx: number;
  ky: number;
  hp: number;
  def: KindDef;
  scale: number;
  elite: boolean;
  flash: number;
  view: AnimView;
  alive: boolean;
  /** 행동 단계 (0=평소, 1=준비, 2=돌진/사격) */
  mode: number;
  timer: number;
  /** 돌진할 때 고정해 두는 방향 */
  ax: number;
  ay: number;
}

/** 적이 쏘는 탄 — 플레이어만 맞힌다 */
interface Hostile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  dmg: number;
  color: number;
}

/**
 * 보스 — 60초마다 하나 나온다.
 * 준비 동작(telegraph)을 확실히 보여주고 나서 사방으로 탄을 뿌린다.
 * 잡몹은 붙어야 아프지만 보스는 멀리서도 아프므로 계속 움직여야 한다.
 */
interface Boss {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  view: AnimView;
  mode: number;
  timer: number;
  flash: number;
  def: BossDef;
  /** 패턴이 쓰는 임시 값 — 돌진 방향, 조준각 등 */
  ax: number;
  ay: number;
  /** 방패를 든 상태인지 (정면 피해 감소) */
  guarding: boolean;
  /** 은신 중인지 */
  hidden: boolean;
}

/** 궤적선(버스터) / 회전 날(메탈 블레이드) / 구체(토네이도·미사일·폭탄) */
type Shape = 'tracer' | 'blade' | 'orb';

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  pierce: number;
  lastHit: Foe | null;
  alive: boolean;
  shape: Shape;
  color: number;
  /** 피격 반경 */
  r: number;
  /** 초당 회전 라디안 — 보이는 용도 */
  spin: number;
  angle: number;
  /** 0보다 크면 매 프레임 가장 가까운 적 쪽으로 이 각속도만큼 튼다 */
  homing: number;
  /** 0보다 크면 사라질 때 이 반경으로 터진다 */
  boomR: number;
  boomDmg: number;
  /** 0보다 크면 이 시간 뒤 플레이어 쪽으로 되돌아온다 (부메랑) */
  back: number;
  /**
   * back 이 다 되면 실제로 플레이어 쪽을 조준해 돌아오는 탄인지.
   * 예전엔 이걸 "pierce > 50" 로 대신 판별했는데, 그냥 다 뚫고 지나가라고
   * pierce 를 크게 잡은 차지샷·토네이도 같은 탄까지 걸려서 플레이어
   * 쪽으로 계속 방향을 트는 버그가 났다 — "빙글빙글 돈다"의 정체.
   */
  boomerang: boolean;
  /** 상성 계산용 */
  elem: Element;
}

/** 번개 — 즉발이라 탄이 아니고, 잠깐 보이는 선으로만 남는다 */
interface Bolt {
  x: number;
  y: number;
  life: number;
  color: number;
}

/** 폭발·타격 표시용으로 퍼지는 원 */
interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  color: number;
}

/** 플레이어 주위를 도는 실드 구슬 */
interface Orb {
  angle: number;
  cd: number;
}

interface Gem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  val: number;
  alive: boolean;
}

/** 가끔 떨어지는 회복 캡슐 */
interface Heal {
  x: number;
  y: number;
  life: number;
  /** 회복량 — 없으면 기본 캡슐 회복량(20)을 쓴다 */
  amt?: number;
}

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
}

/**
 * 캐릭터가 싸우는 방식. 데이터의 archetype 을 그대로 따른다.
 *
 *  charge — 느리지만 크고 센 탄 (버스터: 엑스·록맨·블루스·아일)
 *  rapid  — 빠르지만 작고 약한 탄 (연사: 액셀·포르테)
 *  saber  — 탄이 없고 넓은 참격 (근접: 제로·제로Z·벤트)
 */
type Style = 'charge' | 'rapid' | 'saber';

const STYLE_BY_ARCHETYPE: Record<string, Style> = {
  buster: 'charge',
  ranged: 'rapid',
  saber: 'saber',
};

const STYLE_DESC: Record<Style, string> = {
  charge: '느리지만 크고 센 탄',
  rapid: '빠르지만 작고 약한 탄',
  saber: '근접이지만 넓게 베는 강타',
};

/**
 * 대원별 공격 서명.
 *
 * 방식(차지/연사/세이버)은 밸런스의 뼈대라 그대로 두되, 같은 방식을 쓰는
 * 넷이 색만 다른 같은 총을 쏘면 아홉을 만든 의미가 없다. 그래서 '무엇을
 * 쏘는가'를 대원마다 다르게 잡는다.
 *
 * 세이버 셋은 모양만 바꾸면 거짓말이 된다 — 전방위 파문을 그려 놓고
 * 판정은 부채꼴이면 안 닿는 이유를 알 수가 없다. 그래서 판정도 같이
 * 바꾸되 넓이(0.5·span·r²)를 맞춰 뒀다. 셋 다 6050±60 이라 세이버끼리의
 * 초당 위력은 그대로다.
 *   종   2π  × 44  전방위로 짧게      도끼 1.08π × 60  넓은 부채꼴
 *   사슬 0.6π × 80  길게 뻗는 얇은 낫
 */
type ShotLook = 'nail' | 'lance' | 'needle' | 'harpoon' | 'ember' | 'firefly';
type SaberLook = 'ring' | 'fan' | 'crescent';
/** 차지를 놓았을 때 벌어지는 일. 대원마다 다르다 */
type ChargeLook =
  | 'drive'    // 못 — 짧고 두꺼운 말뚝. 밀어낸다
  | 'thread'   // 바늘 — 화면 끝까지 가는 실 한 줄
  | 'split'    // 거울 — 세 갈래로 갈라지는 빛
  | 'reel'     // 작살 — 꿰어서 끌고 온다
  | 'flame'    // 불씨 — 코앞을 태우는 부채꼴
  | 'volley'   // 반딧불 — 보이는 적 전부에게 유도탄
  | 'lunge'    // 도끼 — 조준선을 따라 파고드는 돌진 연참
  | 'quake'    // 종 — 제자리에서 세 번 퍼지는 파문
  | 'reap';    // 사슬 — 더 멀리, 더 얇게 지나간다

interface Sig {
  shot?: ShotLook;
  saber?: SaberLook;
  arcR?: number;
  arcSpan?: number;
  /** 유도 세기(rad/s) */
  homing?: number;
  // --- 기본 공격 특성. 곱을 서로 상쇄시켜 초당 위력은 건드리지 않는다
  dmgMul?: number;
  intervalMul?: number;
  /** 탄 수명 배수 = 사거리 */
  rangeMul?: number;
  speedMul?: number;
  spreadMul?: number;
  shots?: number;
  pierce?: number;
  /** 명중 시 밀어내기 배수 */
  knock?: number;
  charge: ChargeLook;
}

/**
 * 대원별 공격 서명.
 *
 * 방식(차지/연사/세이버)은 밸런스의 뼈대라 그대로 두되, 같은 방식을 쓰는
 * 넷이 색만 다른 같은 총을 쏘면 아홉을 만든 의미가 없다.
 *
 * 수치는 전부 '서로 상쇄되는 쌍'으로만 넣었다 — 사거리를 늘리면 위력을
 * 깎고, 간격을 늘리면 한 방을 키운다. 그래야 고르는 이유가 세기가 아니라
 * 취향이 된다. 한쪽만 올리면 그 대원이 정답이 되고 나머지 여덟은 장식이다.
 *
 * 세이버 셋은 모양만 바꾸면 거짓말이 된다 — 전방위 파문을 그려 놓고
 * 판정은 부채꼴이면 안 닿는 이유를 알 수가 없다. 그래서 판정도 같이
 * 바꾸되 넓이(0.5·span·r²)를 맞춰 뒀다. 셋 다 6050±60 이다.
 */
const SIG: Record<string, Sig> = {
  // 제일 두껍다. 버티면서 쏜다 — 밀어내는 힘이 세다
  nail: { shot: 'nail', knock: 2.6, charge: 'drive' },
  // 얇지만 한 발이 무겁다 — 느리게 쏘고 크게 때린다
  mirror: { shot: 'lance', dmgMul: 1.4, intervalMul: 1.4, charge: 'split' },
  // 가장 튼튼하고 사거리가 길다 — 멀리 가는 대신 한 발이 가볍다
  needle: { shot: 'needle', rangeMul: 1.8, speedMul: 1.3, dmgMul: 0.82, charge: 'thread' },
  // 꿰뚫어 여럿을 한 줄로 눕힌다 — 많이 뚫는 대신 하나에겐 약하다
  harpoon: { shot: 'harpoon', pierce: 9, dmgMul: 0.74, charge: 'reel' },
  // 가까이 붙어야 제 몫을 한다 — 사거리를 절반으로 깎고 발수를 늘렸다
  ember: { shot: 'ember', rangeMul: 0.5, shots: 3, dmgMul: 0.75, spreadMul: 1.5, charge: 'flame' },
  // 알아서 따라가는 탄 — 빗나가지 않는 만큼 한 발이 가볍다
  firefly: { shot: 'firefly', homing: 2.2, dmgMul: 0.8, charge: 'volley' },
  // 전방위로 짧고 빠르게 — interval 을 안 늘려서 셋 중 제일 자주 휘두른다.
  // 한때 여기에 "0.24초 뒤 한 번 더 때리는 잔류 파문"을 더해서 DPS를
  // 맞췄는데, 그러면 스윙 한 번마다 적이 두 번 flash 를 먹는다. 실제
  // 스윙 간격(도끼보다 35% 빠름)보다 체감 타격 빈도가 훨씬 크게
  // 뛰어서 "종만 두 배는 빠르다"는 소리가 나왔다 — 겨눔이 아니라 이
  // 이중 타격이 원인이었다. dmgMul 을 없애 한 방을 정직하게 키우는
  // 쪽으로 되돌렸다: 간격만 빠르고 한 스윙엔 한 번만 맞는다.
  bell: { saber: 'ring', arcR: 44, arcSpan: Math.PI * 2, charge: 'quake' },
  // 느리지만 한 번에 크게 벤다
  axe: { saber: 'fan', arcR: 60, arcSpan: Math.PI * 1.08, dmgMul: 1.35, intervalMul: 1.35, charge: 'lunge' },
  // 제일 세고 제일 잘 죽는다 — 겨눠야 닿는 대신 한 방이 크다
  chain: { saber: 'crescent', arcR: 80, arcSpan: Math.PI * 0.6, dmgMul: 1.2, intervalMul: 1.2, charge: 'reap' },
};

const STYLE_NAME: Record<Style, string> = {
  charge: '차지 버스터',
  rapid: '연사',
  saber: '세이버',
};

interface Weapon {
  style: Style;
  interval: number;
  shots: number;
  spread: number;
  dmg: number;
  speed: number;
  pierce: number;
  drones: number;
  magnet: number;
  /** saber 전용 — 참격 반경과 부채꼴 각도 */
  arcR: number;
  arcSpan: number;
  /** 방식별 기본 위력. 위력 카드를 여기 비례해서 올린다 */
  baseDmg: number;
  /** 기본 사격의 속성 */
  elem: Element;
}

/** 세이버 참격 자국 — 잠깐 보이고 사라진다 */
interface Arc {
  x: number;
  y: number;
  angle: number;
  r: number;
  span: number;
  life: number;
  max: number;
  color: number;
  /** 그리는 방식. 특수무기가 만드는 자국은 기본 부채꼴이다 */
  look?: SaberLook;
}

interface Upgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  /** 이 방식에서만 뽑힌다. 없으면 전부 해당 — 세이버에게 탄속을 주면 안 된다 */
  only?: Style[];
  apply: () => void;
}

/** 파티클은 이 색들만 쓴다 — 색이 고정이라야 색깔별 배치 그리기가 가능하다 */
const PART_COLORS = [0xfff0a0, 0xff9a4c, 0xffc45c, 0xfff2c0, 0xff5c5c, 0x8ef0ff, 0xffffff];

/** 특수무기 탄 색. 같은 이유로 고정이다 (SPECIALS 의 color 와 맞춰 둘 것) */
const SPECIAL_COLORS = [0xd8e2f0, 0xffa8dc, 0x9fe8ff, 0xff8a5c];

const GRID_CELL = 34;
const GRID_W = Math.ceil(ARENA_W / GRID_CELL);
const GRID_H = Math.ceil(ARENA_H / GRID_CELL);

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * 각진 SF 패널 — 그냥 둥근 사각형은 아무 게임에나 붙는 기본값처럼 보인다.
 * 모서리를 깎은 팔각형 + 이중 테두리 + 네 귀퉁이 브라켓으로, 록맨류
 * 하드웨어 UI에 가까운 인상을 준다. 선택된 칸(active)은 테두리가
 * 굵어지고 안쪽에 한 겹 더 도는 밝은 선이 붙는다.
 */
function drawPanel(
  g: Graphics,
  x: number, y: number, w: number, h: number,
  opts: { fill?: number; fillAlpha?: number; accent?: number; active?: boolean; cut?: number } = {},
): void {
  const cut = opts.cut ?? Math.min(9, h * 0.16);
  const fill = opts.fill ?? 0x0e1428;
  const accent = opts.accent ?? 0x8ef0ff;
  const active = !!opts.active;

  const outline = (px: number, py: number, pw: number, ph: number, pc: number): void => {
    g.moveTo(px + pc, py)
      .lineTo(px + pw - pc, py)
      .lineTo(px + pw, py + pc)
      .lineTo(px + pw, py + ph - pc)
      .lineTo(px + pw - pc, py + ph)
      .lineTo(px + pc, py + ph)
      .lineTo(px, py + ph - pc)
      .lineTo(px, py + pc)
      .closePath();
  };

  outline(x, y, w, h, cut);
  g.fill({ color: fill, alpha: opts.fillAlpha ?? 1 });
  outline(x, y, w, h, cut);
  g.stroke({ color: active ? accent : 0x222c52, width: active ? 2 : 1, alpha: active ? 1 : 0.85 });

  if (active) {
    const inset = 3;
    outline(x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(2, cut - inset));
    g.stroke({ color: accent, width: 1, alpha: 0.45 });

    // 귀퉁이 브라켓 — 네 모서리에서 안쪽으로 짧게 뻗는 조준선 느낌
    const bl = Math.min(9, w * 0.18, h * 0.26);
    const corners: [number, number, number, number][] = [
      [x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      g.moveTo(cx, cy).lineTo(cx + sx * bl, cy).stroke({ color: accent, width: 2, alpha: 0.9 });
      g.moveTo(cx, cy).lineTo(cx, cy + sy * bl).stroke({ color: accent, width: 2, alpha: 0.9 });
    }
  }
}

/**
 * 원형 조작 버튼 — 대시와 차지가 지금까지 서로 다른 손으로 그려진
 * 것처럼 보였다. 대시는 옅은 원 하나, 차지는 그림이 아예 없이 글자
 * 일곱 글자뿐이었다. 하나는 배경에 묻히고 하나는 존재 자체가 안 보였다.
 *
 * drawPanel() 과 같은 시각 언어(이중 테두리 + 모서리 브라켓)를 원형으로
 * 옮겨 하나로 통일한다. 방향(사각 모서리)이 없는 원에서는 브라켓 대신
 * 8방향 눈금을 두른다 — 조준 다이얼처럼 읽혀서 "누르는 자리"가 명확해진다.
 *
 * fill01 은 두 버튼이 서로 다른 값을 넣는 공용 파라미터다. 대시는
 * 쿨다운 회복률, 차지는 눌러 모은 정도 — 그림 문법은 같고 채워지는
 * 이유만 다르다.
 */
function drawTouchButton(
  g: Graphics,
  cx: number, cy: number, r: number,
  opts: { accent: number; fill01: number; ready: boolean; pressed: boolean },
): void {
  const { accent, pressed } = opts;
  const fill01 = clamp(opts.fill01, 0, 1);

  // 바탕 — 배경보다 확실히 어둡게 깔아야 그 위의 얇은 테두리가 산다
  g.circle(cx, cy, r).fill({ color: 0x05070f, alpha: 0.62 });

  // 채움 쐐기 — 12시에서 시계방향으로 fill01 만큼. 대시는 회복될수록,
  // 차지는 모을수록 이 쐐기가 자란다. 다 찼을 때만 확 밝아져야
  // "지금 쓸 수 있다"가 곁눈으로도 읽힌다.
  if (fill01 > 0.02) {
    const a0 = -Math.PI / 2;
    g.moveTo(cx, cy).arc(cx, cy, r - 3, a0, a0 + fill01 * Math.PI * 2).closePath();
    g.fill({ color: accent, alpha: opts.ready ? 0.32 : 0.16 });
  }
  if (pressed) g.circle(cx, cy, r - 7).fill({ color: accent, alpha: 0.3 });

  // 이중 테두리
  g.circle(cx, cy, r).stroke({ color: accent, width: 2, alpha: opts.ready ? 0.9 : 0.4 });
  g.circle(cx, cy, r - 4).stroke({ color: accent, width: 1, alpha: opts.ready ? 0.5 : 0.22 });

  // 8방향 눈금 — drawPanel 의 모서리 브라켓을 원형으로 옮긴 것
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    g.moveTo(cx + c * (r - 6), cy + s * (r - 6))
      .lineTo(cx + c * (r + 2), cy + s * (r + 2))
      .stroke({ color: accent, width: i % 2 === 0 ? 2 : 1, alpha: opts.ready ? 0.85 : 0.35 });
  }
}

/** 색을 흰색 쪽으로 amount 만큼 민다 — 탄 심지를 캐릭터 색의 밝은 판으로 쓴다 */
function lighten(color: number, amount: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const up = (c: number): number => Math.round(c + (255 - c) * amount);
  return (up(r) << 16) | (up(g) << 8) | up(b);
}

// ---------------------------------------------------------------- 펫(서포트 유닛)
//
// 지금까지 서포트 유닛은 "플레이어 자리에서 탄이 하나 나가는" 것뿐이라
// 뽑아도 뭐가 생겼는지 알 수가 없었다. 실제로 주위를 도는 몸을 주고,
// 공격도 그 몸에서 나가게 한다. 생김새는 원작 디자인을 따른다 —
// 러시(빨간 개), 비트(빨강+흰 새), 탱고(초록 고양이), 에디(뚜껑 로봇).

type PetId = 'rush_slam' | 'beat_dive' | 'tango_roll' | 'eddie_call';
const PET_ORDER: PetId[] = ['rush_slam', 'beat_dive', 'tango_roll', 'eddie_call'];

const PET_OUTLINE = 0x0a0a12;

/**
 * 펫 한 마리를 찍는다. mono 가 들어오면 전부 그 색으로 칠한다 —
 * 윤곽선을 네 방향으로 한 번씩 깔 때 쓴다.
 * vx 는 "앞쪽이 양수"인 좌표라, dir 이 -1 이면 좌우가 뒤집힌다.
 */
function paintPet(
  g: Graphics, id: PetId, x: number, y: number, dir: number, t: number, mono?: number,
): void {
  const r = (vx: number, vy: number, w: number, h: number, color: number): void => {
    const left = dir > 0 ? x + vx : x - vx - w;
    g.rect(Math.round(left), Math.round(y + vy), w, h).fill({ color: mono ?? color });
  };
  // 걷기/날갯짓용 2프레임 토글
  const step = Math.sin(t * 9) > 0 ? 1 : 0;
  const flap = Math.round(Math.sin(t * 14) * 2);

  if (id === 'rush_slam') {
    // 러시 — 빨간 로봇 개
    const RED = 0xe03830, RED_L = 0xff8b6a, RED_D = 0x8e1a16, CREAM = 0xffe8c8, DARK = 0x1a1020;
    r(-4, 4, 3, 3 + step, DARK);
    r(2, 4, 3, 4 - step, DARK);
    r(-8, -5, 2, 4, RED_D);
    r(-6, -2, 12, 6, RED);
    r(-6, -2, 12, 1, RED_L);
    r(-6, 3, 12, 1, RED_D);
    r(3, -8, 7, 7, RED);
    r(3, -8, 7, 1, RED_L);
    r(2, -10, 3, 3, RED_D);
    r(8, -5, 3, 3, CREAM);
    r(9, -4, 2, 1, DARK);
    r(5, -6, 2, 2, DARK);
  } else if (id === 'beat_dive') {
    // 비트 — 빨간 몸에 흰 머리, 노란 부리
    const RED = 0xe03830, RED_L = 0xff8b6a, RED_D = 0x8e1a16, WHITE = 0xf4f4fc, YEL = 0xffc020, DARK = 0x1a1020;
    r(-7, -1, 3, 3, RED_D);
    r(-4, -3, 9, 6, RED);
    r(-4, -3, 9, 1, RED_L);
    // 날개는 항상 몸통에 붙어 있어야 한다 — 위로만 퍼덕이게 잡는다
    r(-4, -5 - Math.abs(flap), 7, 3, RED_L);
    r(3, -7, 6, 6, WHITE);
    r(3, -7, 6, 1, 0xffffff);
    r(5, -5, 2, 2, DARK);
    r(8, -4, 3, 2, YEL);
    r(-1, 3, 2, 2, YEL);
  } else if (id === 'tango_roll') {
    // 탱고 — 초록 로봇 고양이
    const GRN = 0x3fc060, GRN_L = 0x8ef0a0, GRN_D = 0x1c6a34, CREAM = 0xf0ffe0, DARK = 0x102010;
    r(-4, 4, 3, 2 + step, DARK);
    r(2, 4, 3, 3 - step, DARK);
    r(-9, -8, 4, 2, GRN);
    r(-9, -6, 2, 5, GRN);
    r(-6, -2, 12, 6, GRN);
    r(-6, -2, 12, 1, GRN_L);
    r(-5, 2, 10, 2, CREAM);
    r(3, -8, 7, 7, GRN);
    r(3, -8, 7, 1, GRN_L);
    r(3, -11, 2, 3, GRN_D);
    r(7, -11, 2, 3, GRN_D);
    r(5, -6, 2, 2, DARK);
    r(8, -4, 2, 2, CREAM);
  } else {
    // 에디 — 뚜껑이 달린 배달 로봇. 뚜껑이 들썩인다
    const ORG = 0xe85820, ORG_L = 0xffa060, YEL = 0xffd060, CREAM = 0xfff0c0, WHITE = 0xf4f4fc, DARK = 0x1a1020;
    const lid = -Math.abs(flap);
    r(-4, 4, 3, 3, DARK);
    r(2, 4, 3, 3, DARK);
    r(-5, -3, 11, 7, ORG);
    r(-5, -3, 11, 1, ORG_L);
    r(-3, -1, 7, 5, WHITE);
    r(0, 0, 3, 3, DARK);
    r(-6, -6 + lid, 13, 3, YEL);
    r(-6, -6 + lid, 13, 1, CREAM);
  }
}

/** 윤곽선을 두르고 펫을 그린다 — 임시 도트 스프라이트와 같은 마감이다 */
function drawPet(g: Graphics, id: PetId, x: number, y: number, dir: number, t: number): void {
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    paintPet(g, id, x + ox, y + oy, dir, t, PET_OUTLINE);
  }
  paintPet(g, id, x, y, dir, t);
}


/** 캐릭터 선택에 필요한 것만 추린 형태 — 본편 CharacterDef 의 부분집합이다 */
interface HordeChar {
  id: string;
  name: string;
  /** 캐릭터별 한 줄. 없으면 전투 방식 설명만 나온다 */
  desc?: string;
  sprite_scale?: number;
  archetype?: string;
  /** 총구 높이 계산용 — 본편(player.ts)은 이미 이 둘로 손 높이를 잡는다.
   * 프로토타입은 그동안 이걸 안 쓰고 py-10(허리 아래) 으로 고정해 놔서,
   * 총알이 손이 아니라 발 근처에서 나가는 것처럼 보였다. */
  hitbox?: { w: number; h: number };
  muzzle_ratio?: number;
  base_stats: { hp: number };
  /** X·제로만 갖고 있다. 나머지는 시작 스킬에서 탄을 가져온다 */
  shot?: { speed: number; color: string; power: number; element?: string };
  starting_skills?: string[];
}

interface SkillLite {
  id: string;
  element?: string;
  effects?: { type: string; speed?: number; color?: number; power?: number }[];
}

const CHAR_DEFS = Object.values(
  import.meta.glob('/data/characters/*.json', { eager: true, import: 'default' }) as Record<string, HordeChar>,
).sort((a, b) => a.id.localeCompare(b.id));

const SKILLS: Record<string, SkillLite> = {};
for (const s of Object.values(
  import.meta.glob('/data/skills/*.json', { eager: true, import: 'default' }) as Record<string, SkillLite>,
)) {
  SKILLS[s.id] = s;
}

interface ShotInfo {
  speed: number;
  color: number;
  power: number;
  elem: Element;
}

/**
 * 캐릭터의 탄 성질을 뽑는다. shot 블록이 있으면 그걸 쓰고, 없으면 시작
 * 스킬의 projectile 효과에서 가져온다 — 9명 중 7명이 후자다.
 * color 는 데이터마다 "0x..." 문자열이거나 십진수라 Number() 로 통일한다.
 */
/** 데이터의 element 문자열을 이 게임의 속성으로 옮긴다 */
function toElement(raw: string | undefined): Element {
  switch (raw) {
    case 'elec': case 'electric': case 'thunder': return 'elec';
    case 'aqua': case 'water': case 'bubble': return 'aqua';
    case 'fire': case 'flame': case 'heat': return 'fire';
    case 'ice': case 'chill': case 'freeze': return 'ice';
    default: return 'none';
  }
}

function resolveShot(c: HordeChar): ShotInfo {
  if (c.shot) {
    return {
      speed: c.shot.speed, color: Number(c.shot.color), power: c.shot.power,
      elem: toElement(c.shot.element),
    };
  }
  const sk = SKILLS[c.starting_skills?.[0] ?? ''];
  const proj = sk?.effects?.find((e) => e.type === 'projectile');
  const dmg = sk?.effects?.find((e) => e.type === 'damage');
  // 세이버 스킬은 melee_hitbox 라 projectile 이 없다 — 참격 색이라도
  // 세이버답게 잡아준다. 안 그러면 전부 기본 하늘색으로 나온다.
  const fallback = c.archetype === 'saber' ? 0x8ef0d8 : 0x9fe8ff;
  return {
    speed: proj?.speed ?? 300, color: Number(proj?.color ?? fallback), power: dmg?.power ?? 8,
    elem: toElement(sk?.element),
  };
}

const SHOTS = new Map<string, ShotInfo>(CHAR_DEFS.map((c) => [c.id, resolveShot(c)]));
const STYLES = new Map<Style | string, Style>();
for (const c of CHAR_DEFS) STYLES.set(c.id, STYLE_BY_ARCHETYPE[c.archetype ?? ''] ?? 'charge');
/** 캐릭터별 최고 기록 — 다른 캐릭터를 굴려볼 이유가 된다 */
interface Best { t: number; kills: number }
const BEST_KEY = 'horde.best';

function loadBest(): Record<string, Best> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, Best>;
  } catch {
    return {};
  }
}

function saveBest(all: Record<string, Best>): void {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(all));
  } catch {
    // 저장이 안 되는 환경이면 이번 판 기록만 못 남길 뿐이다
  }
}

/** 한 번이라도 클리어한 스테이지 — 스테이지 선택 화면에 표시만 하고 다시 도전을 막지는 않는다 */
const CLEARED_KEY = 'horde.cleared';

function loadCleared(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CLEARED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function saveCleared(ids: string[]): void {
  try {
    localStorage.setItem(CLEARED_KEY, JSON.stringify(ids));
  } catch {
    // 저장이 안 되는 환경이면 이번 판 표시만 못 남길 뿐이다
  }
}

const styleOf = (c: HordeChar): Style => (STYLES.get(c.id) as Style) ?? 'charge';

/**
 * 선택 화면 한 칸이 62px 뿐이라 긴 이름은 옆 칸을 침범한다.
 * 괄호 설명을 떼고, 그래서 이름이 겹치면 id 꼬리를 붙여 구분한다
 * ("제로(제로 시리즈)" → "제로Z").
 */
const SHORT_NAMES = new Map<string, string>();
{
  const base = CHAR_DEFS.map((c) => c.name.replace(/\s*[(（].*$/, '').trim() || c.id);
  for (let i = 0; i < CHAR_DEFS.length; i++) {
    const dup = base.some((n, j) => j !== i && n === base[i]);
    const tail = CHAR_DEFS[i].id.split('_')[1];
    SHORT_NAMES.set(CHAR_DEFS[i].id, dup && tail ? base[i] + tail.toUpperCase() : base[i]);
  }
}

export async function runHordeProto(app: Application, input: Input): Promise<void> {
  // 도트 서체가 실제로 쓰일 수 있게 준비될 때까지 기다린다 — 안 그러면
  // Text 를 만드는 순간 폴백(시스템 monospace)으로 한 번 그려지고, 폰트가
  // 늦게 도착해도 다시 안 그려져서 계속 밋밋한 채로 남는다.
  try {
    await document.fonts.load('9px Silkscreen');
    await document.fonts.ready;
  } catch {
    // 폰트를 못 받아도 폴백(monospace)으로 계속 진행한다
  }

  // 백버퍼를 세로로 다시 잡고 확대는 CSS 가 맡는다 — 본편과 같은 방식이라
  // 어느 배율에서도 도트가 보간되지 않는다.
  app.renderer.resize(W, H);
  const canvas = app.canvas as HTMLCanvasElement;
  const fit = (): void => {
    const raw = Math.min(window.innerWidth / W, window.innerHeight / H);
    const scale = raw >= 2 ? Math.floor(raw) : raw;
    canvas.style.width = `${Math.round(W * scale)}px`;
    canvas.style.height = `${Math.round(H * scale)}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = `${Math.round((window.innerWidth - W * scale) / 2)}px`;
    canvas.style.top = `${Math.round((window.innerHeight - H * scale) / 2)}px`;
  };
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 100));

  const sheets = new Map<FoeKind, Sheet>();
  await Promise.all(
    KIND_LIST.map(async (k) => {
      sheets.set(k, await loadSheet('enemies', k));
    }),
  );
  // 고를 수 있는 캐릭터의 시트를 전부 미리 받아둔다 — 선택 화면에서
  // 9명을 동시에 세워 보여줘야 하므로 어차피 다 필요하다.
  const charSheets = new Map<string, Sheet>();
  await Promise.all(
    CHAR_DEFS.map(async (c) => {
      charSheets.set(c.id, await loadSheet('characters', c.id));
    }),
  );
  // 보스도 미리 받아둔다 — 스테이지 선택 화면에 8명을 동시에 세워
  // 보여줘야 하니, 처음 마주칠 때 불러오면 그 순간 뚝 끊긴다.
  const bossSheets = new Map<string, Sheet>();
  await Promise.all(
    BOSS_DEFS.map(async (b) => {
      bossSheets.set(b.id, await loadSheet('enemies', b.id));
    }),
  );

  // ------------------------------------------------------------ 레이어
  const world = new Container();
  const ui = new Container();
  app.stage.addChild(world, ui);

  // 바닥보다 느리게 흐르는 아래층 — 뚫린 격자망 칸으로 비친다.
  // 시차가 있어야 바닥이 판때기가 아니라 위에 얹힌 층으로 읽힌다.
  const farLayer = new Container();
  app.stage.addChildAt(farLayer, 0);

  const groundLayer = new Container();
  const gemG = new Graphics();
  const foeLayer = new Container();
  const bulletG = new Graphics();
  const specialG = new Graphics();
  const partG = new Graphics();
  // animG 는 바닥 바로 위여야 한다 — 아래에 두면 흐르는 쇳물도 눈발도
  // 바닥에 가려서 안 보인다.
  const animG = new Graphics();
  // 세이버 차지 돌진의 회전 이펙트 전용 — foeLayer(캐릭터) 보다 뒤에
  // 둬야 한다. specialG 처럼 위에 그리면 정작 돌아가는 캐릭터 본체가
  // 이펙트에 파묻혀 안 보인다.
  const lungeG = new Graphics();
  // petBackG 는 foeLayer 보다 아래다 — 궤도 뒤쪽(위쪽)을 도는 펫은
  // 플레이어에 가려야 "돌고 있다"가 입체로 읽힌다.
  const petBackG = new Graphics();
  world.addChild(groundLayer, animG, gemG, lungeG, petBackG, foeLayer, bulletG, specialG, partG);

  // 배경 — 스테이지 테마는 stage_bg.ts 에 있다.
  // 판이 진행되면서 구역이 바뀌므로 정지 배경 한 장으로 끝나지 않는다.
  let themeIndex = 0;
  let theme = THEMES[0];
  const themeCache = new Map<string, { far: Container; ground: Container }>();
  function useTheme(i: number): void {
    themeIndex = i % THEMES.length;
    theme = THEMES[themeIndex];
    let built = themeCache.get(theme.id);
    if (!built) {
      built = buildTheme(theme, ARENA_W, ARENA_H);
      themeCache.set(theme.id, built);
    }
    farLayer.removeChildren();
    groundLayer.removeChildren();
    farLayer.addChild(built.far);
    groundLayer.addChild(built.ground);
  }


  foeLayer.sortableChildren = true;
  let hero: AnimView | null = null;
  let heroScale = 1;
  let charDef: HordeChar = CHAR_DEFS[0];
  let shotColor = 0xff8a2c;
  let shotCore = 0xfff0b0;
  /** 이번 판 주무기의 생김새. 한 판 안에서는 안 바뀐다 */
  let shotLook: ShotLook = 'nail';
  let saberLook: SaberLook = 'fan';
  let chargeLook: ChargeLook = 'drive';
  let shotHoming = 0;
  /** 명중 시 밀어내기 배수 */
  let shotKnock = 1;
  /** 주무기 탄 수명 = 사거리. 방식 기본 0.5 초에 서명 배수를 곱한다 */
  let shotLife = 0.5;
  /**
   * 예약 타격 — 지금 판정하지 않고 잠시 뒤에 터지는 원형 피해. 종의
   * 차지(quake)가 쓴다 — 제자리에서 세 번 퍼뜨리는 파문 중 두·세 번째를
   * 여기 밀어 둔다. 한때 자동공격에도 붙여 "스윙마다 두 번 때린다"를
   * 만들었는데, 그러면 실제 스윙 간격보다 체감 타격 빈도가 훨씬 크게
   * 뛰어서 "느리게 쐈는데 유독 빠르게 느껴진다"는 문제가 됐다 — 차지처럼
   * 드물게 쓰는 연출에만 남긴다.
   */
  interface Echo { x: number; y: number; r: number; t: number; dmg: number }
  const echoes: Echo[] = [];

  const droneG = new Graphics();
  const petG = new Graphics();
  world.addChild(droneG, petG);

  // ------------------------------------------------------------ HUD
  const hudBar = new Graphics();
  ui.addChild(hudBar);
  const mono = { fontFamily: "'Silkscreen', monospace", fontSize: 9, fill: 0xcfe0ff } as const;

  const timeLabel = new Text({ text: '', style: { ...mono, fontSize: 13, fill: 0xffffff } });
  timeLabel.anchor.set(0.5, 0);
  timeLabel.position.set(W / 2, 1);
  const killLabel = new Text({ text: '', style: { ...mono, fontSize: 10, fill: 0xffd85c } });
  killLabel.anchor.set(1, 0);
  killLabel.position.set(W - 6, 3);
  const lvLabel = new Text({ text: '', style: { ...mono, fontSize: 10, fill: 0x8ef0ff } });
  lvLabel.position.set(6, 3);
  const hintLabel = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0x8a97c4 } });
  hintLabel.anchor.set(0.5, 1);
  hintLabel.position.set(W / 2, H - 3);
  ui.addChild(timeLabel, killLabel, lvLabel, hintLabel);

  const stageLabel = new Text({ text: '', style: { ...mono, fontSize: 12, fill: 0xffffff } });
  stageLabel.anchor.set(0.5);
  stageLabel.position.set(W / 2, 46);
  stageLabel.visible = false;
  ui.addChild(stageLabel);

  const bossLabel = new Text({ text: '', style: { ...mono, fontSize: 9, fill: 0xffb0c8 } });
  bossLabel.anchor.set(0.5, 0);
  bossLabel.position.set(W / 2, 30);
  bossLabel.visible = false;
  ui.addChild(bossLabel);

  const muteLabel = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0x8a97c4 } });
  muteLabel.anchor.set(1, 1);
  muteLabel.position.set(W - 4, H - 3);
  ui.addChild(muteLabel);

  const centerLabel = new Text({ text: '', style: { ...mono, fontSize: 15, fill: 0xffffff } });
  centerLabel.anchor.set(0.5);
  centerLabel.position.set(W / 2, H / 2 - 14);
  const subLabel = new Text({ text: '', style: { ...mono, fontSize: 10, fill: 0xc9d6ff } });
  subLabel.anchor.set(0.5);
  subLabel.position.set(W / 2, H / 2 + 8);
  ui.addChild(centerLabel, subLabel);

  const cardG = new Graphics();
  const cardTexts: Text[] = [];
  const cardBadges: Text[] = [];
  ui.addChild(cardG);
  const charBtnLabel = new Text({ text: '다른 캐릭터로', style: { ...mono, fontSize: 9, fill: 0xc9d6ff } });
  charBtnLabel.anchor.set(0.5);
  charBtnLabel.visible = false;
  charBtnLabel.position.set(W / 2, H - 33);
  ui.addChild(charBtnLabel);
  for (let i = 0; i < 3; i++) {
    const name = new Text({ text: '', style: { ...mono, fontSize: 11, fill: 0xffffff } });
    name.anchor.set(0.5);
    const desc = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0xa8b6e0 } });
    desc.anchor.set(0.5);
    cardTexts.push(name, desc);
    const badge = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0xffd85c } });
    badge.anchor.set(0.5);
    badge.visible = false;
    cardBadges.push(badge);
    ui.addChild(name, desc, badge);
  }
  // cardG 는 이 둘보다 뒤에 붙었으므로 그대로 두면 어두운 판이 글자를 덮는다.
  // 다시 addChild 해서 맨 위로 올린다.
  ui.addChild(centerLabel, subLabel);

  // 본편 가상패드(JUMP/FIRE/WPN)는 이 모드에 안 맞는다 — 여기선 점프도
  // 수동사격도 없어서 버튼 넷 중 셋이 아무것도 안 하고, 그러면서 레벨업
  // 카드 위를 덮는다. 이 모드에 필요한 것만 직접 그린다: 이동 + 대시.
  const sfx = createSfx();
  const best = loadBest();
  const clearedStages = new Set<string>(loadCleared());
  // 브라우저는 사용자 동작 전에는 소리를 안 내준다 — 첫 입력에서 연다
  const unlock = (): void => sfx.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  input.disableTouch();
  const padG = new Graphics();
  const dashLabel = new Text({ text: 'DASH', style: { fontFamily: "'Silkscreen', monospace", fontSize: 8, fill: 0x8ef0ff } });
  dashLabel.anchor.set(0.5);
  dashLabel.visible = false;
  const fireLabel = new Text({ text: 'CHARGE', style: { fontFamily: "'Silkscreen', monospace", fontSize: 7, fill: 0xffd85c } });
  fireLabel.anchor.set(0.5);
  fireLabel.visible = false;
  ui.addChild(padG, dashLabel, fireLabel);

  // ------------------------------------------------------------ 상태
  const foes: Foe[] = [];
  const bullets: Bullet[] = [];
  const gems: Gem[] = [];
  const parts: Part[] = [];
  const rings: Ring[] = [];
  const bolts: Bolt[] = [];
  const arcs: Arc[] = [];
  const hostiles: Hostile[] = [];
  const heals: Heal[] = [];
  let boss: Boss | null = null;
  let bossAt = 70;
  let bossBanner = 0;
  let bossKills = 0;
  /** 보스 문이 열리고 이름·체력바가 차오르는 연출 — 이 시간 동안은 세계가 멈춘다 */
  let bossIntroT = 0;
  const BOSS_INTRO_DUR = 1.6;
  /** 체력바가 몇 칸 찼는지 — 틱 소리를 한 번씩만 내려면 세어둬야 한다 */
  let bossIntroTicks = 0;
  const BOSS_INTRO_FILL_START = 0.5;
  const BOSS_INTRO_FILL_END = 1.4;
  const BOSS_INTRO_TICKS = 8;
  let newRecord = false;
  /** 가챠 코인 — 정예를 잡으면 하나, 보스는 셋. 모이면 자동으로 돌아간다 */
  let coins = 2;
  const COINS_PER_PULL = 5;
  /** 연속으로 SSR 이 안 나온 횟수 — 천장 */
  let pityCount = 0;
  let pendingPulls = 0;
  /** 보스를 잡으면 다음 카드는 무기만 나온다 */
  let paused = false;
  /** 가챠 화면에서의 화면 탭 */
  let gachaTap = false;
  const pools = new Map<FoeKind, AnimView[]>();
  const grid: Foe[][] = Array.from({ length: GRID_W * GRID_H }, () => []);
  const cellIndex = (x: number, y: number): number => {
    const cx = Math.floor(x / GRID_CELL);
    const cy = Math.floor(y / GRID_CELL);
    if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H) return -1;
    return cy * GRID_W + cx;
  };

  let px = ARENA_W / 2;
  let py = ARENA_H / 2;
  let facing = 1;
  let hp = 100;
  let maxHp = 100;
  let iframe = 0;
  let dashTimer = 0;
  let dashCd = 0;
  let dashDx = 1;
  let dashDy = 0;

  let time = 0;
  let kills = 0;
  let level = 1;
  let xp = 0;
  let xpNeed = 4;
  let spawnAcc = 0;
  let fireAcc = 0;
  let surgeAt = 32;
  /** 구역 이름을 띄워두는 남은 시간 */
  let stageBanner = 0;
  /** 배경 애니메이션용 시계 — 일시정지 중에도 흘러야 자연스럽다 */
  let animClock = 0;
  let shake = 0;
  let hitstop = 0;
  let phase: 'select' | 'play' | 'pick' | 'gacha' | 'dead' | 'boss_select' | 'stage_clear' = 'select';
  let selIndex = 0;
  /** 사격 자세를 유지하는 남은 시간 — 0보다 크면 공격 모션을 재생한다 */
  let attackHold = 0;
  let attackBeat = 0;
  /** 콤보 태그를 가진 시트(제로)에서 몇 단째를 틀 차례인지 */
  let comboStep = 0;
  /** 이동 표시용 — 몸 방향(facing)과 별개로 실제 진행 방향을 들고 있는다 */
  let moveDirX = 0;
  let moveDirY = 0;
  /** 세이버 사거리 표시용 조준각 — shoot() 과 같은 계산을 매 프레임 유지한다 */
  let aimAngle = 0;
  let dustAcc = 0;
  /** run_attack 이 없는 시트에서 걷기와 휘두르기를 번갈아 쓰기 위한 간격 */
  let swingGap = 0;
  /** 레벨업 카드 한 장 — 능력치이거나 특수무기(신규/강화)다 */
  type PickOption =
    | { kind: 'stat'; up: Upgrade }
    | { kind: 'weapon'; def: SpecialDef; lv: number };

  let pickIndex = 0;
  let pickList: PickOption[] = [];
  let deadTimer = 0;
  /** 이번 판이 목표로 하는 스테이지의 보스. 캐릭터 선택 뒤 스테이지
      선택에서 정해지고, 판이 끝날 때까지 안 바뀐다(재도전에도 유지). */
  let stageBoss: BossDef | null = null;
  /** 이 판에서 stageBoss 를 이미 등장시켰는지 — 두 번 뜨는 걸 막는다 */
  let stageBossSpawned = false;
  /** 방금 잡은 보스가 stageBoss 였는지 — 가챠 연출이 끝난 뒤 결과 화면으로
      갈지, 그냥 농사를 계속할지를 가른다 */
  let pendingStageClear = false;
  let clearTimer = 0;
  let lastClearWeaponName: string | null = null;

  // 레벨업 카드는 손가락으로 직접 짚는 게 맞다. 가상 스틱으로 커서를 옮겨
  // 버튼으로 확정하는 방식은 눈앞에 카드가 세 장 떠 있는데도 조작이
  // 한 단계 겉돌아서 안 맞는다. 키보드 ←→/Z 도 그대로 둔다.
  const cardRects: { x: number; y: number; w: number; h: number }[] = [];
  /** 사망 화면의 "캐릭터 변경" 영역 — 그 밖을 누르면 같은 캐릭터로 재시도한다 */
  const BTN_CHAR = { x: W / 2 - 62, y: H - 44, w: 124, h: 22 };
  /** 캔버스 좌표 → 게임 좌표. 백버퍼가 W×H 고정이라 비율만 맞추면 된다 */
  const toGame = (e: PointerEvent): { x: number; y: number } => {
    const r = app.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  };
  // 이동은 왼쪽 어디를 짚어도 그 자리가 원점이 되는 스틱이다. 고정 위치
  // 패드는 손가락이 조금만 미끄러져도 입력이 끊긴다.
  const STICK = { dead: 5, radius: 24, drag: 28 };
  const DASH_BTN = { x: W - 44, y: H - 44, r: 27 };
  /** 차지 버튼 — 누르고 있으면 모이고 떼면 나간다. 대시 위에 둔다. */
  const FIRE_BTN = { x: W - 52, y: H - 104, r: 25 };
  let stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  let dashId: number | null = null;
  let touchDash = false;
  let fireId: number | null = null;
  let touchFire = false;
  let touchMode = false;

  // 브라우저가 드래그를 스크롤/확대 제스처로 가져가면 pointercancel 이 나거나
  // move 가 끊긴다. 그러면 스틱이 마지막 방향에 붙박인다 — touch-action 을
  // 꺼서 제스처 자체가 시작되지 않게 하는 게 근본 처방이다.
  app.canvas.style.touchAction = 'none';

  app.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'touch') touchMode = true;
    e.preventDefault();
    const p = toGame(e);

    const inside = (r: { x: number; y: number; w: number; h: number }): boolean =>
      p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

    if (phase === 'select') {
      for (let i = 0; i < selRects.length; i++) {
        if (!inside(selRects[i])) continue;
        // 짚자마자 시작하면 손가락으로는 설명을 읽을 방법이 아예 없다.
        // 마우스에는 hover 가 있어서 '짚어 보기'와 '고르기'가 갈리지만
        // 터치에는 그게 없어서, 누르는 순간 판이 시작돼 버린다.
        //
        // 그래서 다른 칸을 누르면 설명만 바꾸고, 이미 골라 둔 칸을 다시
        // 눌러야 시작한다. 이미 고른 것으로 시작할 때는 여전히 한 번이다.
        if (i === selIndex) startRun();
        else selIndex = i;
        break;
      }
      return;
    }
    if (phase === 'boss_select') {
      for (let i = 0; i < bossSelRects.length && i < bossPickList.length; i++) {
        if (!inside(bossSelRects[i])) continue;
        // 캐릭터 선택과 같은 두 단계. 여기는 설명을 못 읽어서가 아니라
        // 잘못 짚은 손가락 하나로 보스전이 바로 시작되기 때문이다.
        if (i === bossSelIndex) chooseBoss();
        else bossSelIndex = i;
        break;
      }
      return;
    }
    if (phase === 'gacha') {
      gachaTap = true;
      return;
    }
    if (phase === 'pick') {
      for (let i = 0; i < cardRects.length && i < pickList.length; i++) {
        if (!inside(cardRects[i])) continue;
        pickIndex = i;
        choosePick();
        break;
      }
      return;
    }
    if (phase === 'dead') {
      if (deadTimer <= 0.5) return;
      if (inside(BTN_CHAR)) { phase = 'select'; return; }
      reset();
      return;
    }
    if (phase === 'stage_clear') {
      if (clearTimer <= 0.5) return;
      if (inside(BTN_CHAR)) { phase = 'select'; return; }
      openBossSelect();
      return;
    }

    if (Math.hypot(p.x - DASH_BTN.x, p.y - DASH_BTN.y) <= DASH_BTN.r * 1.25) {
      dashId = e.pointerId;
      touchDash = true;
    } else if (Math.hypot(p.x - FIRE_BTN.x, p.y - FIRE_BTN.y) <= FIRE_BTN.r * 1.25) {
      fireId = e.pointerId;
      touchFire = true;
    } else if (stick === null) {
      stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    }
    try {
      app.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 캡처 실패는 무시 — 경계 밖 추적만 약해질 뿐 나머지는 그대로 동작한다
    }
  });

  app.canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!stick || e.pointerId !== stick.id) return;
    e.preventDefault();
    const p = toGame(e);
    let dx = p.x - stick.ox;
    let dy = p.y - stick.oy;
    // 너무 멀어지면 원점을 손가락 쪽으로 끌어당긴다 — 미끄러져도 계속 조작된다
    const d = Math.hypot(dx, dy);
    if (d > STICK.drag) {
      const pull = (d - STICK.drag) / d;
      stick.ox += dx * pull;
      stick.oy += dy * pull;
    }
    stick.x = p.x;
    stick.y = p.y;
  });

  const endPointer = (e: PointerEvent): void => {
    if (stick && e.pointerId === stick.id) stick = null;
    if (dashId === e.pointerId) dashId = null;
    // 차지는 "떼는 것"이 발사라 여기서 반드시 풀려야 한다
    if (fireId === e.pointerId) { fireId = null; touchFire = false; }
  };
  const releaseAll = (): void => {
    stick = null;
    dashId = null;
    touchDash = false;
    fireId = null;
    touchFire = false;
  };
  // 손가락을 놓친 경로가 하나라도 새면 그 방향으로 영구히 밀리므로
  // 끝날 수 있는 모든 경로를 다 잡는다. 이미 지워진 손가락이면 조용히 무시된다.
  for (const target of [app.canvas, window] as (HTMLCanvasElement | Window)[]) {
    target.addEventListener('pointerup', endPointer as EventListener);
    target.addEventListener('pointercancel', endPointer as EventListener);
  }
  app.canvas.addEventListener('lostpointercapture', endPointer);
  // 화면이 가려지거나 포커스를 잃으면 up 이 아예 안 오는 경우가 있다
  window.addEventListener('blur', () => { releaseAll(); if (phase === 'play') paused = true; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });
  // Pointer Events 는 카카오톡/네이버 인앱 브라우저 같은 웹뷰에서 터치와
  // 어긋나는 경우가 있다 — pointerup 이 씹혀도 이 경로는 살아있다.
  // pointerId 와 Touch.identifier 는 같은 값이라는 보장이 없으니 매칭하지
  // 않고, "화면에 닿은 손가락이 진짜 하나도 없다"는 사실 자체만 신뢰한다.
  // 그거면 스틱이 영구히 눌린 채로 남을 이유가 없다.
  const reconcileTouches = (e: TouchEvent): void => {
    if (e.touches.length === 0) releaseAll();
  };
  window.addEventListener('touchend', reconcileTouches, { passive: true });
  window.addEventListener('touchcancel', reconcileTouches, { passive: true });

  // 시작은 1발이다. 처음부터 화면을 덮으면 도달점이 없어서 "확 늘었다"는
  // 순간이 안 생기고, 가만히 있어도 사방이 정리돼 버린다.
  // 탄이 화면을 덮는 상태는 여기서 쌓아 올려 도달하는 곳이지 출발점이 아니다.
  const w: Weapon = {
    style: 'charge',
    baseDmg: 6,
    elem: 'none',
    arcR: 50,
    arcSpan: Math.PI * 1.1,
    interval: 0.16,
    shots: 1,
    spread: 0.06,
    dmg: 6,
    speed: 330,
    // 시작부터 관통 1을 준다. 1발이 한 마리에서 멈추면 어느 방향도 못 뚫어
    // 적이 무조건 쌓이고, 20초 안에 사방이 막혀 손쓸 수가 없다.
    pierce: 1,
    drones: 0,
    magnet: 40,
  };

  const taken: Record<string, number> = {};

  const UPGRADES: Upgrade[] = [
    {
      // 세이버를 막지 않으면 근접 스윙이 20%씩 9번 빨라져 0.42초 → 0.06초,
      // 초당 16번 넘게 도는 회전베기가 된다. 몸 전체가 도는 연출이라
      // 이 속도에서는 애니메이션이 아니라 그냥 깜빡이는 잔상이 된다 —
      // "종 캐릭터 연사 속도가 비정상적으로 빨라졌다"는 게 바로 이거였다.
      // 세이버의 성장은 참격 확장(반경) 카드가 맡는다.
      id: 'rapid', name: '연사 강화', desc: '발사 간격 -20%', max: 9, only: ['charge', 'rapid'],
      apply: () => { w.interval = Math.max(0.026, w.interval * 0.8); },
    },
    {
      id: 'spread', name: '확산탄', desc: '동시 발사 +2', max: 9, only: ['charge', 'rapid'],
      apply: () => { w.shots += 2; w.spread = Math.min(1.6, w.spread + 0.09); },
    },
    {
      // 정액으로 올리면 방식마다 값어치가 딴판이 된다. 연사는 한 발 위력이
      // 2 라 +3이면 배로 뛰고, 반대로 +1로 낮추면 적 체력이 제곱으로 느는
      // 후반에 완전히 뒤처져 뽑으면 손해인 카드가 된다. 기본 위력에 비례시킨다.
      id: 'power', name: '위력 증폭', desc: '위력 상승', max: 9,
      apply: () => { w.dmg += Math.max(1, Math.round(w.baseDmg * 0.3)); },
    },
    {
      id: 'pierce', name: '관통 탄자', desc: '관통 +1', max: 5, only: ['charge', 'rapid'],
      apply: () => { w.pierce += 1; },
    },
    {
      id: 'velo', name: '가속 장전', desc: '탄속 +70', max: 4, only: ['charge', 'rapid'],
      apply: () => { w.speed += 70; },
    },
    {
      // 세이버는 탄이 없으니 확산·관통·탄속이 전부 죽은 카드가 된다.
      // 그 자리를 참격 자체를 키우는 카드로 채운다.
      id: 'arc', name: '참격 확장', desc: '베는 범위 확대', max: 6, only: ['saber'],
      apply: () => { w.arcR += 12; w.arcSpan = Math.min(Math.PI * 2, w.arcSpan + 0.18); },
    },
    {
      id: 'drone', name: '옵션 유닛', desc: '주위를 도는 포탑 +1', max: 4,
      apply: () => { w.drones += 1; },
    },
    {
      id: 'legs', name: '부스터 다리', desc: '이동속도 +12%', max: 5,
      apply: () => { legsMul += 0.12; applyArmor(); },
    },
    {
      id: 'magnet', name: '자력 코어', desc: '경험치 흡수 범위 +40', max: 4,
      apply: () => { baseMagnet += 40; applyArmor(); },
    },
    {
      id: 'armor', name: '수리 팩', desc: '최대체력 +20, 전량 회복', max: 99,
      apply: () => { maxHp += 20; hp = maxHp; },
    },
  ];

  let speedMul = 1;
  /** 아머와 카드 효과를 따로 들고 있다가 applyArmor() 에서 합친다 —
      한쪽에 곱해서 쌓으면 아머를 먹을 때마다 카드 효과가 지워지거나 겹친다 */
  let legsMul = 1;
  let baseMagnet = 40;
  /** 아머를 먹었을 때 띄우는 안내 */
  let armorBanner = 0;
  let armorGot: ArmorSlot | null = null;

  // --- 라이드 아머
  /**
   * X 시리즈의 탑승 메카. 몰이사냥에 딱 맞는 "잠깐 압도적으로 세지는" 순간이
   * 지금 없다 — 판이 계속 같은 밀도로만 흐른다. 20초 동안 거대하고 무겁고
   * 다 밟고 다니는 구간을 넣으면 판에 굴곡이 생긴다.
   */
  let rideT = 0;
  let ridePunch = 0;
  const RIDE_TIME = 18;
  interface RidePod { x: number; y: number; bob: number }
  const ridePods: RidePod[] = [];
  let rideAt = 55;

  // ------------------------------------------------------------ 헬퍼
  function spawnPart(x: number, y: number, n: number, color: number, power: number): void {
    if (parts.length + n > MAX_PARTS) parts.splice(0, parts.length + n - MAX_PARTS);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = power * (0.35 + Math.random() * 0.9);
      const life = 0.16 + Math.random() * 0.26;
      parts.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life, max: life,
        color,
        size: 1 + Math.floor(Math.random() * 2),
      });
    }
  }

  function takeView(kind: FoeKind): AnimView {
    const pool = pools.get(kind);
    const v = pool?.pop();
    if (v) {
      v.visible = true;
      return v;
    }
    const nv = new AnimView(sheets.get(kind)!);
    nv.play('move');
    return nv;
  }

  function spawnFoe(elite: boolean): void {
    if (foes.length >= MAX_FOES) return;
    const kind = pickKind();
    const def = KINDS[kind];
    // 원형으로 뿌리면 화면 비율이 안 맞는 축의 개체가 한참을 걸어온다.
    // 화면(세로) 비율에 맞춘 타원 바로 바깥에 뿌려야 스폰 즉시 압박이 된다.
    const a = Math.random() * Math.PI * 2;
    const far = 1 + Math.random() * 0.22;
    const x = clamp(px + Math.cos(a) * 175 * far, 14, ARENA_W - 14);
    const y = clamp(py + Math.sin(a) * 290 * far, 14, ARENA_H - 14);

    // 화력이 지수로 커지므로 적 체력도 그렇게 따라가야 한다.
    // 선형으로 두면 30초 넘어가는 순간 스폰 즉시 증발해서 화면이 텅 빈다.
    // 난이도는 체력이 아니라 머릿수가 끌고 간다. 체력을 가파르게 올리면
    // 킬 수가 줄고 → 레벨이 안 오르고 → 화력이 멈춰서 교착에 빠진다.
    // "너무 어렵다" 피드백을 받고 곡선을 조금 눕혔다. 계수를 낮췄을 뿐
    // 모양(선형+2차)은 그대로다 — 5분 지점 기준 체력이 대략 20% 낮아진다.
    const grow = 1 + time * 0.045 + time * time * 0.00095;
    const view = takeView(kind);
    const scale = def.scale * (elite ? 1.6 : 1);
    view.scale.set(scale, scale);
    view.tint = elite ? 0xffb0b0 : 0xffffff;
    view.alpha = 1;
    foeLayer.addChild(view);

    foes.push({
      mode: 0, timer: Math.random() * 1.2, ax: 0, ay: 0,
      kind, x, y, kx: 0, ky: 0,
      hp: def.hp * grow * (elite ? 5.5 : 1),
      def, scale, elite, flash: 0, view, alive: true,
    });
  }

  /**
   * 경험치를 떨군다. 상한을 넘으면 가장 오래된 것을 새 것에 합친다 —
   * 그냥 쌓아두면 초당 수십 개가 안 주워진 채 남아 후반에 바닥이 온통
   * 경험치로 덮여서 적도 탄도 안 보인다. 버리지 않고 합치므로 총량은 같다.
   */
  function pushGem(x: number, y: number, val: number): void {
    let v = val;
    while (gems.length >= MAX_GEMS) v += gems.shift()!.val;
    const a = Math.random() * Math.PI * 2;
    gems.push({ x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, val: v, alive: true });
  }

  /** 화면에서 치우고 뷰를 재사용 풀로 돌려보낸다 */
  function retire(f: Foe): void {
    foeLayer.removeChild(f.view);
    f.view.visible = false;
    let pool = pools.get(f.kind);
    if (!pool) pools.set(f.kind, (pool = []));
    pool.push(f.view);
    const idx = foes.indexOf(f);
    if (idx >= 0) foes.splice(idx, 1);
  }

  function killFoe(f: Foe): void {
    if (!f.alive) return;
    f.alive = false;
    kills++;
    spawnPart(f.x, f.y - 8, f.elite ? 26 : 9, f.elite ? 0xffc45c : 0xff9a4c, f.elite ? 190 : 130);
    if (f.elite) {
      coins += 2;
      sfx.coin();
      // E탱크는 드물어야 아껴 쓴다
      if (eTanks < E_TANK_MAX && Math.random() < 0.22) {
        eTanks++;
        sfx.reveal('R');
      }
    }

    // 아주 가끔 회복 캡슐 — 흔하면 긴장이 사라지고, 없으면 회복 수단이
    // 레벨업 카드뿐이라 후반에 손쓸 방법이 없다.
    if (Math.random() < (f.elite ? 0.4 : 0.014) && heals.length < 6) {
      heals.push({ x: f.x, y: f.y - 6, life: 14 });
    }
    const drops = f.elite ? 8 : 1;
    for (let i = 0; i < drops; i++) {
      pushGem(f.x, f.y - 6, f.def.xp * (f.elite ? 3 : 1));
    }
    shake = Math.max(shake, f.elite ? 6 : 1.2);
    sfx.kill();
    retire(f);
  }

  function fireOne(ax: number, ay: number, ox: number, oy: number, dmg: number): void {
    if (bullets.length >= MAX_BULLETS) bullets.splice(0, bullets.length - MAX_BULLETS + 1);
    bullets.push({
      x: ox, y: oy,
      vx: Math.cos(ax) * w.speed,
      vy: Math.sin(ax) * w.speed * 0.82,
      life: ay,
      dmg,
      pierce: w.pierce,
      lastHit: null,
      alive: true,
      // 모양은 대원 서명이 정한다. shape 은 판정·묶음 처리용이고
      // 실제로 화면에 뭘 그릴지는 shotLook 이 정한다
      shape: w.style === 'charge' ? 'orb' : 'tracer',
      color: shotColor,
      r: w.style === 'charge' ? (shotLook === 'needle' ? 4 : 7) : shotLook === 'ember' ? 3 : 2,
      spin: 0,
      angle: ax,
      homing: shotHoming,
      boomR: 0,
      boomDmg: 0,
      back: 0,
      boomerang: false,
      elem: w.elem,
    });
  }

  /** 특수무기 탄 — 버스터와 달리 무기마다 모양·색·거동이 다르다 */
  function addBullet(b: Partial<Bullet> & { x: number; y: number; vx: number; vy: number; dmg: number }): void {
    if (bullets.length >= MAX_BULLETS) bullets.splice(0, bullets.length - MAX_BULLETS + 1);
    bullets.push({
      life: 1, pierce: 0, lastHit: null, alive: true,
      shape: 'orb', color: 0xffffff, r: 4, spin: 0, angle: 0,
      homing: 0, boomR: 0, boomDmg: 0, back: 0, boomerang: false, elem: 'none',
      ...b,
    } as Bullet);
  }

  /**
   * 잡몹 피해 — 상성을 여기 한 곳에서만 계산한다.
   * 여러 군데서 f.hp 를 직접 깎으면 어디는 적용되고 어디는 안 되는 일이 생긴다.
   */
  function hurtFoe(f: Foe, amount: number, elem: Element, fx?: number, fy?: number): void {
    const m = elemMult(elem, f.def.elem);
    f.hp -= amount * m;
    f.flash = 0.07;
    f.view.tint = m >= WEAK_MULT ? 0xffffa0 : 0xff5c5c;
    if (m >= WEAK_MULT) {
      // 약점이 터졌다는 걸 눈으로 알려준다 — 안 보이면 상성이 있는 줄도 모른다
      spawnPart(fx ?? f.x, fy ?? f.y - 8, 3, ELEM_COLOR[elem], 200);
      if (Math.random() < 0.25) {
        rings.push({ x: f.x, y: f.y - 8, r: 16, life: 0.2, max: 0.2, color: ELEM_COLOR[elem] });
      }
    }
    if (f.hp <= 0) killFoe(f);
  }

  /** 보스에게 피해를 준다 — 죽으면 정리까지 */
  function hurtBoss(amount: number, elem: Element = 'none'): void {
    const b = boss;
    if (!b) return;
    const m = elemMult(elem, b.def.elem);
    amount *= m;
    if (m >= WEAK_MULT) {
      spawnPart(b.x, b.y - 14, 4, ELEM_COLOR[elem], 200);
      b.flash = 0.1;
    }
    // 은신 중엔 못 맞히고, 방패를 든 동안은 대부분 튕긴다 —
    // "지금은 때릴 때가 아니다"를 몸으로 알게 하는 구간이다
    if (b.hidden) return;
    b.hp -= b.guarding ? amount * 0.18 : amount;
    if (b.guarding) spawnPart(b.x, b.y - 14, 1, 0x9fd0ff, 90);
    b.flash = Math.max(b.flash, 0.07);
    // 약점이면 노랗게 — 빨강이면 상성이 걸렸는지 알 수가 없다
    b.view.tint = m >= WEAK_MULT ? 0xffffa0 : 0xff5c5c;
    if (b.hp <= 0) killBoss();
  }

  /** 반경 안의 적을 한꺼번에 때린다 (크래시 봄버·번개) */
  function blast(x: number, y: number, radius: number, dmg: number, color: number, elem: Element = 'none'): void {
    rings.push({ x, y, r: radius, life: 0.24, max: 0.24, color });
    sfx.explode();
    spawnPart(x, y, 12, 0xff9a4c, 150);
    shake = Math.max(shake, 3);
    for (let j = foes.length - 1; j >= 0; j--) {
      const f = foes[j];
      const dx = f.x - x;
      const dy = (f.y - 8 - y) * 1.2;
      if (dx * dx + dy * dy > radius * radius) continue;
      hurtFoe(f, dmg, elem);
    }
    const b = boss;
    if (b) {
      const bx = b.x - x;
      const by = (b.y - 14 - y) * 1.2;
      if (bx * bx + by * by <= (radius + 16) * (radius + 16)) hurtBoss(dmg, elem);
    }
  }

  /**
   * 세이버 참격 — 탄을 안 쏘고 부채꼴 안의 적을 한꺼번에 벤다.
   *
   * 붙어야만 닿으므로 몰이사냥에서는 그 자체가 위험 부담이다. 대신 한 번에
   * 여러 마리를 베고 밀쳐내서, 파고들어 쓸어내는 방식으로 성립하게 했다.
   */
  function swingSaber(angle: number): void {
    arcs.push({
      x: px, y: py - 10, angle, r: w.arcR, span: w.arcSpan,
      life: 0.16, max: 0.16, color: shotColor, look: saberLook,
    });
    shake = Math.max(shake, 1.5);

    const half = w.arcSpan / 2;
    for (let j = foes.length - 1; j >= 0; j--) {
      const f = foes[j];
      const dx = f.x - px;
      const dy = (f.y - 8 - (py - 10)) / 0.78;
      const reach = w.arcR + f.def.r * f.scale;
      if (dx * dx + dy * dy > reach * reach) continue;
      let d = Math.atan2(dy, dx) - angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > half) continue;

      const len = Math.hypot(dx, dy) || 1;
      f.kx += (dx / len) * 190;
      f.ky += (dy / len) * 190 * 0.78;
      spawnPart(f.x, f.y - 8, 3, 0xfff2c0, 120);
      hurtFoe(f, w.dmg, w.elem);
    }

    const b = boss;
    if (b) {
      const dx = b.x - px;
      const dy = (b.y - 14 - (py - 10)) / 0.78;
      const reach = w.arcR + 18;
      if (dx * dx + dy * dy <= reach * reach) {
        let d = Math.atan2(dy, dx) - angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) <= half) {
          hurtBoss(w.dmg, w.elem);
          spawnPart(b.x, b.y - 14, 4, 0xfff2c0, 140);
        }
      }
    }
  }

  function fireHostile(x: number, y: number, ang: number, speed: number, dmg: number, color: number): void {
    if (hostiles.length > 220) hostiles.shift();
    hostiles.push({
      x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed * 0.8,
      life: 3.4, r: 4, dmg, color,
    });
  }

  async function spawnBoss(pick?: BossDef, announce = true): Promise<void> {
    if (boss) return;
    // 이미 잡아서 무기를 받은 보스는 뒤로 미룬다 — 같은 놈만 계속 나오면
    // Weapon Get 이 성립을 안 한다
    const fresh = BOSS_DEFS.filter((d) => !owned.has(d.drop));
    const bd = pick ?? (fresh.length ? fresh : BOSS_DEFS)[
      Math.floor(Math.random() * (fresh.length ? fresh.length : BOSS_DEFS.length))
    ];
    const id = bd.id;
    let sheet = bossSheets.get(id);
    if (!sheet) {
      sheet = await loadSheet('enemies', id);
      bossSheets.set(id, sheet);
    }
    const view = new AnimView(sheet);
    view.play('move');
    view.scale.set(1.9, 1.9);
    foeLayer.addChild(view);
    const a = Math.random() * Math.PI * 2;
    // 보스도 잡몹과 같은 비율로 눕힌다 — 여기만 그대로 두면 무기를
    // 다 갖춰도 첫 보스보다 마지막 보스가 불균형하게 벅차진다.
    const maxHp = Math.round(200 + time * 40);
    boss = {
      id, name: ENEMY_NAMES[id] ?? id,
      x: clamp(px + Math.cos(a) * 190, 40, ARENA_W - 40),
      y: clamp(py + Math.sin(a) * 300, 40, ARENA_H - 40),
      hp: maxHp, maxHp, view, mode: 0, timer: 2.4, flash: 0,
      def: bd, ax: 0, ay: 0, guarding: false, hidden: false,
    };
    if (announce) {
      bossBanner = 2.4;
      sfx.boss();
      shake = 8;
    }
  }

  /** 보스 행동 — 다가오다가 준비 동작을 보이고 사방으로 뿌린다 */
  /**
   * 보스 행동 — 패턴마다 완전히 다르게 움직인다.
   *
   * 공통 규칙은 하나다: **때리기 전에 반드시 예고한다.** 예고 없이 아프면
   * 그건 어려운 게 아니라 불공평한 거라 외울 게 없다. 록맨 보스가 외워지는
   * 이유가 정확히 이 규칙이다.
   */
  function updateBoss(dt: number): void {
    const b = boss;
    if (!b) return;
    const dx = px - b.x;
    const dy = py - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const aim = Math.atan2(dy, dx);

    if (b.flash > 0) {
      b.flash -= dt;
      if (b.flash <= 0) b.view.tint = 0xffffff;
    }

    b.timer -= dt;
    const walk = (sp: number): void => {
      b.x += (dx / d) * sp * dt;
      b.y += (dy / d) * sp * 0.78 * dt;
    };
    /** 예고 중 깜빡임 — 모든 패턴이 같은 신호를 쓴다 */
    const telegraph = (): void => {
      b.view.play('telegraph', 'idle');
      b.view.tint = Math.floor(b.timer * 20) % 2 === 0 ? 0xffc0c0 : 0xffffff;
    };
    const done = (): void => {
      b.view.tint = 0xffffff;
    };

    switch (b.def.pattern) {
      // ---------------- 내리찍기 — 다가와 멈추고 바닥을 쳐 고리를 퍼뜨린다
      case 'slam':
        if (b.mode === 0) {
          walk(46);
          b.view.play('move', 'idle');
          if (b.timer <= 0 && d < 150) { b.mode = 1; b.timer = 0.7; }
        } else if (b.mode === 1) {
          telegraph();
          if (b.timer <= 0) {
            b.mode = 2; b.timer = 0.5; done();
            b.view.play('attack_1', 'idle');
            // 세 겹 고리로 퍼져 나간다 — 사이를 비집고 나와야 한다
            for (let ring = 0; ring < 3; ring++) {
              const n = 12 + ring * 4;
              for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2 + ring * 0.2;
                fireHostile(b.x, b.y - 10, a, 90 + ring * 46, 12, 0xffe86b);
              }
            }
            rings.push({ x: b.x, y: b.y - 6, r: 90, life: 0.4, max: 0.4, color: 0xffe86b });
            shake = Math.max(shake, 11);
            sfx.explode();
          }
        } else if (b.timer <= 0) { b.mode = 0; b.timer = 1.6; }
        break;

      // ---------------- 은신 — 사라졌다 옆에 나타나 3갈래로 뱉는다
      case 'blink':
        if (b.mode === 0) {
          walk(52);
          b.view.play('move', 'idle');
          b.hidden = false;
          b.view.alpha = 1;
          if (b.timer <= 0) { b.mode = 1; b.timer = 0.6; }
        } else if (b.mode === 1) {
          // 흐려지며 사라진다 — 사라지는 것 자체가 예고다
          b.hidden = true;
          b.view.alpha = Math.max(0.12, b.timer / 0.6);
          if (b.timer <= 0) {
            b.mode = 2; b.timer = 0.45;
            const a = Math.random() * Math.PI * 2;
            b.x = clamp(px + Math.cos(a) * 62, 20, ARENA_W - 20);
            b.y = clamp(py + Math.sin(a) * 48, 24, ARENA_H - 12);
            b.view.alpha = 1;
            b.hidden = false;
            b.view.play('attack_1', 'idle');
            spawnPart(b.x, b.y - 10, 16, 0x8ef0a0, 190);
            for (let i = -1; i <= 1; i++) {
              fireHostile(b.x, b.y - 10, Math.atan2(py - b.y, px - b.x) + i * 0.3, 150, 12, 0x8ef0a0);
            }
            sfx.explode();
            shake = Math.max(shake, 7);
          }
        } else if (b.timer <= 0) { b.mode = 0; b.timer = 2.2; }
        break;

      // ---------------- 부메랑 — 순간이동하며 돌아오는 날을 던진다
      case 'boomer':
        if (b.mode === 0) {
          walk(34);
          b.view.play('move', 'idle');
          if (b.timer <= 0) { b.mode = 1; b.timer = 0.55; }
        } else if (b.mode === 1) {
          telegraph();
          if (b.timer <= 0) {
            b.mode = 2; b.timer = 0.6; done();
            b.view.play('attack_1', 'idle');
            // 나갔다 돌아오는 날 — homing 을 걸면 되돌아오는 것처럼 보인다
            for (let i = -1; i <= 1; i++) {
              const h = hostiles.length;
              fireHostile(b.x, b.y - 10, aim + i * 0.42, 210, 12, 0xc98cff);
              if (hostiles[h]) hostiles[h].life = 4.5;
            }
            // 던진 뒤 옆으로 순간이동
            const a = Math.random() * Math.PI * 2;
            b.x = clamp(b.x + Math.cos(a) * 110, 20, ARENA_W - 20);
            b.y = clamp(b.y + Math.sin(a) * 90, 24, ARENA_H - 12);
            spawnPart(b.x, b.y - 10, 12, 0xc98cff, 160);
            sfx.shot('rapid');
          }
        } else if (b.timer <= 0) { b.mode = 0; b.timer = 1.5; }
        break;

      // ---------------- 돌진 — 방향을 고정하고 직선으로 꽂는다
      case 'charge':
        if (b.mode === 0) {
          walk(30);
          b.view.play('move', 'idle');
          if (b.timer <= 0 && d < 220) { b.mode = 1; b.timer = 0.75; }
        } else if (b.mode === 1) {
          telegraph();
          if (b.timer <= 0) {
            b.mode = 2; b.timer = 0.85; done();
            b.ax = dx / d;
            b.ay = dy / d;
            b.view.play('attack_1', 'idle');
            sfx.dash();
          }
        } else if (b.mode === 2) {
          // 고정 방향 — 옆으로 빠지면 피할 수 있다
          b.x += b.ax * 330 * dt;
          b.y += b.ay * 330 * 0.78 * dt;
          spawnPart(b.x, b.y - 6, 2, 0xff9a4c, 130);
          if (b.timer <= 0) {
            b.mode = 3; b.timer = 0.7;
            rings.push({ x: b.x, y: b.y - 6, r: 70, life: 0.35, max: 0.35, color: 0xff9a4c });
            for (let i = 0; i < 10; i++) {
              fireHostile(b.x, b.y - 10, (i / 10) * Math.PI * 2, 110, 11, 0xff9a4c);
            }
            shake = Math.max(shake, 9);
          }
        } else if (b.timer <= 0) { b.mode = 0; b.timer = 1.2; }
        break;

      // ---------------- 방패 — 정면을 막고 유도탄만 흘린다
      case 'guard':
        if (b.mode === 0) {
          walk(40);
          b.view.play('move', 'idle');
          b.guarding = false;
          if (b.timer <= 0) { b.mode = 1; b.timer = 2.6; }
        } else if (b.mode === 1) {
          // 막는 동안은 피해가 크게 줄어든다 — 뒤로 돌아가야 한다
          b.guarding = true;
          b.view.play('telegraph', 'idle');
          b.view.tint = 0x9fd0ff;
          if (Math.floor(b.timer * 2) !== Math.floor((b.timer + dt) * 2)) {
            const h = hostiles.length;
            fireHostile(b.x, b.y - 10, aim, 120, 11, 0x6ec8ff);
            if (hostiles[h]) hostiles[h].life = 3.6;
          }
          if (b.timer <= 0) { b.mode = 0; b.timer = 2.0; b.guarding = false; done(); }
        }
        break;

      // ---------------- 연속 돌진 — 짧게 여러 번 꽂는다
      case 'dasher':
        if (b.mode === 0) {
          walk(56);
          b.view.play('move', 'idle');
          if (b.timer <= 0) { b.mode = 1; b.timer = 0.42; b.ax = 3; }
        } else if (b.mode === 1) {
          telegraph();
          if (b.timer <= 0) {
            b.mode = 2; b.timer = 0.3; done();
            b.ay = aim;
            b.view.play('attack_1', 'idle');
          }
        } else if (b.mode === 2) {
          b.x += Math.cos(b.ay) * 420 * dt;
          b.y += Math.sin(b.ay) * 420 * 0.78 * dt;
          spawnPart(b.x, b.y - 8, 2, 0xff5c9c, 150);
          if (b.timer <= 0) {
            b.ax -= 1;
            if (b.ax > 0) { b.mode = 1; b.timer = 0.26; }
            else { b.mode = 0; b.timer = 1.5; }
          }
        }
        break;

      // ---------------- 저격 — 멀리서 조준선을 긋고 쏜다
      case 'sniper':
        if (b.mode === 0) {
          // 거리를 유지한다
          if (d < 170) walk(-46);
          else if (d > 260) walk(40);
          b.view.play('move', 'idle');
          if (b.timer <= 0) { b.mode = 1; b.timer = 0.8; }
        } else if (b.mode === 1) {
          // 조준선이 그려진다 — 선 밖으로 나가면 피한다
          b.ay = aim;
          b.view.play('telegraph', 'idle');
          b.view.tint = Math.floor(b.timer * 24) % 2 === 0 ? 0xffffff : 0xdcf4ff;
          if (b.timer <= 0) {
            b.mode = 2; b.timer = 0.4; done();
            b.view.play('attack_1', 'idle');
            for (let i = 0; i < 3; i++) {
              const h = hostiles.length;
              fireHostile(b.x, b.y - 10, b.ay, 330 + i * 30, 15, 0xdcf4ff);
              if (hostiles[h]) hostiles[h].r = 5;
            }
            sfx.shot('charge');
            shake = Math.max(shake, 5);
          }
        } else if (b.timer <= 0) { b.mode = 0; b.timer = 1.4; }
        break;

      // ---------------- 배리어 — 주위를 돌던 구슬을 쏘아 보낸다
      case 'barrier':
        if (b.mode === 0) {
          walk(38);
          b.view.play('move', 'idle');
          b.ax += dt * 3;
          if (b.timer <= 0) { b.mode = 1; b.timer = 0.6; }
        } else if (b.mode === 1) {
          telegraph();
          b.ax += dt * 9;
          if (b.timer <= 0) {
            b.mode = 2; b.timer = 0.5; done();
            b.view.play('attack_1', 'idle');
            for (let i = 0; i < 6; i++) {
              const a = b.ax + (i / 6) * Math.PI * 2;
              fireHostile(b.x + Math.cos(a) * 34, b.y - 10 + Math.sin(a) * 26, a, 175, 13, 0xff5c5c);
            }
            sfx.explode();
            shake = Math.max(shake, 6);
          }
        } else if (b.timer <= 0) { b.mode = 0; b.timer = 1.8; }
        break;
    }

    b.x = clamp(b.x, 20, ARENA_W - 20);
    b.y = clamp(b.y, 24, ARENA_H - 12);
    b.view.scale.x = dx < 0 ? -1.9 : 1.9;
    b.view.update(app.ticker.deltaMS);
    b.view.position.set(Math.round(b.x), Math.round(b.y));
    b.view.zIndex = b.y;

    // 접촉 피해 — 은신 중엔 없다(안 보이는 걸로 아프면 불공평하다)
    if (iframe <= 0 && !b.hidden && d < 26) {
      hp -= takeDmg(15);
      iframe = 0.85;
      hitstop = 0.06;
      shake = 9;
      spawnPart(px, py - 10, 16, 0xff5c5c, 160);
      sfx.hurt();
      if (hp <= 0) { hp = 0; phase = 'dead'; deadTimer = 0; sfx.dead(); recordBest(); }
    }
  }

  function killBoss(): void {
    const b = boss;
    if (!b) return;
    for (let i = 0; i < 26; i++) pushGem(b.x, b.y - 8, 4);
    spawnPart(b.x, b.y - 10, 60, 0xffc45c, 220);
    rings.push({ x: b.x, y: b.y - 10, r: 70, life: 0.5, max: 0.5, color: 0xffd05c });
    shake = 14;
    sfx.explode();
    foeLayer.removeChild(b.view);
    boss = null;
    bossKills++;
    // 이번에 잡은 게 이 판의 목표(스테이지 보스)인지 — 맞다면 가챠가
    // 끝난 뒤 농사를 계속하는 게 아니라 클리어 화면으로 간다.
    const isStageBoss = !!stageBoss && b.def.id === stageBoss.id;
    // Weapon Get — 그 보스의 무기를 준다. 시리즈의 핵심이 이거다.
    // 이미 갖고 있으면 한 단계 올려준다.
    const dropId = b.def.drop;
    // 보스 무기는 BOSS_WEAPONS 에 있다 — 여기서 LEGENDS 를 뒤지면 영원히 못 찾는다
    const dropDef = BOSS_WEAPONS.find((x) => x.id === dropId);
    if (dropDef && (owned.get(dropId) ?? 0) < dropDef.max) {
      pullResult = dropDef;
      pendingStageClear = isStageBoss;
      // 릴에는 보스 무기 여덟만 올린다 — 어떤 보스가 뭘 주는지가 같이 보인다
      reel.start(
        BOSS_WEAPONS.map((x) => ({ name: x.name, color: x.color, rarity: x.rarity ?? 'R' })),
        BOSS_WEAPONS.indexOf(dropDef),
        `${b.name} 격파 — 무기 획득`,
      );
      phase = 'gacha';
    } else {
      coins += COINS_PER_PULL;
      sfx.coin();
      // 무기를 못 주는 경우(이미 판 안에서 이 보스를 또 잡은 경우)에도
      // 스테이지 보스라면 클리어는 클리어다 — 가챠 없이 바로 결과로 간다.
      if (isStageBoss) {
        markStageCleared(b.def.id);
        clearTimer = 0;
        phase = 'stage_clear';
      }
    }
  }

  /** 스테이지 클리어 표시를 남긴다 — 다시 도전은 막지 않고 배지만 붙는다 */
  function markStageCleared(id: string): void {
    clearedStages.add(id);
    saveCleared([...clearedStages]);
  }

  /**
   * 모은 걸 놓는다. 방식마다 결과가 달라야 세 캐릭터가 다 차지를 쓸 이유가 생긴다.
   *   차지 버스터 — 조준선을 따라 화면을 가르는 일직선 관통 광선
   *   연사        — 짧은 시간 폭주 난사
   *   세이버      — 몸을 돌리며 조준선으로 파고드는 회전 돌진 연참
   */
  /**
   * 조준선을 따라 즉발 관통 광선 한 줄. 차지 넷이 파라미터만 바꿔 쓴다.
   * 날아가는 시간이 없으니 탄이 뭔가에 걸려 방향이 흔들릴 일 자체가 없다.
   *
   * pull 이 있으면 맞은 것을 플레이어 쪽으로 끌어당긴다(작살).
   */
  function chargeBeam(a: number, range: number, width: number, dmg: number, pull = 0): void {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    // 거울처럼 한 번에 여러 줄기를 쏘는 대원이 있어서 각도는 쌓아 둔다.
    // 하나만 기억하면 마지막 줄기만 그려지고 나머지는 판정만 있고 안 보인다.
    if (chargeBeamT <= 0) chargeBeamAngles.length = 0;
    chargeBeamAngles.push(a);
    chargeBeamRange = range;
    chargeBeamWidth = width;
    chargeBeamT = 0.3;
    for (let j = foes.length - 1; j >= 0; j--) {
      const f = foes[j];
      const rx = f.x - px;
      const ry = (f.y - 8 - (py - 10)) / 0.78;
      const along = rx * c + ry * sn;
      if (along < -f.def.r || along > range) continue;
      const perp = Math.abs(-rx * sn + ry * c);
      if (perp > width + f.def.r) continue;
      // 음수면 밀어내기(못), 양수면 끌어당기기(작살)다.
      // pull > 0 으로 막아 두면 밀어내는 쪽이 조용히 사라진다
      if (pull !== 0) {
        const len = Math.hypot(rx, ry) || 1;
        f.kx -= (rx / len) * pull;
        f.ky -= (ry / len) * pull * 0.78;
      }
      hurtFoe(f, dmg, w.elem);
    }
    if (boss) {
      const rx = boss.x - px;
      const ry = (boss.y - 14 - (py - 10)) / 0.78;
      const along = rx * c + ry * sn;
      const perp = Math.abs(-rx * sn + ry * c);
      if (along > -18 && along < range && perp < width + 18) hurtBoss(dmg, w.elem);
    }
  }

  /** 조준선을 따라 몸으로 파고드는 돌진 연참. 도끼와 사슬이 나눠 쓴다 */
  function chargeLunge(a: number, range: number, width: number, dmg: number): void {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const fromX = px;
    const fromY = py;
    const toX = clamp(px + c * range, 12, ARENA_W - 12);
    const toY = py + sn * range * 0.78;
    iframe = Math.max(iframe, LUNGE_MOVE_DUR + 0.05);

    // 순간이동처럼 보이면 뭘 당했는지 읽을 수가 없다 — 실제 위치는 여기서
    // 바로 옮기지 않고, updateLegends() 가 매 프레임 조금씩 이동시켜서 눈으로
    // 좇을 수 있는 돌진으로 보이게 한다.
    lungeMoveT = LUNGE_MOVE_DUR;
    slashLungeT = 0.3;
    slashLungeFromX = fromX;
    slashLungeFromY = fromY;
    slashLungeToX = toX;
    slashLungeToY = toY;
    slashLungeWidth = width;

    // 경로 위에 큰 참격을 여러 개 겹쳐 찍으면 정작 돌아가는 캐릭터가 그
    // 밑에 파묻힌다. 착지 지점에 마무리 일격 하나만 남긴다.
    arcs.push({
      x: toX, y: toY - 10, angle: a, r: width * 1.6, span: Math.PI * 0.9,
      life: 0.16, max: 0.16, color: 0xffffff,
    });

    for (let j = foes.length - 1; j >= 0; j--) {
      const f = foes[j];
      const rx = f.x - fromX;
      const ry = (f.y - 8 - (fromY - 10)) / 0.78;
      const along = rx * c + ry * sn;
      if (along < -f.def.r || along > range + f.def.r) continue;
      const perp = Math.abs(-rx * sn + ry * c);
      if (perp > width + f.def.r) continue;
      hurtFoe(f, dmg, w.elem);
    }
    if (boss) {
      const rx = boss.x - fromX;
      const ry = (boss.y - 14 - (fromY - 10)) / 0.78;
      const along = rx * c + ry * sn;
      const perp = Math.abs(-rx * sn + ry * c);
      if (along > -18 && along < range + 18 && perp < width + 18) hurtBoss(dmg, w.elem);
    }
    rings.push({ x: toX, y: toY - 10, r: 32, life: 0.3, max: 0.3, color: shotCore });
  }

  /** 제자리 원형 타격 한 번 */
  function chargeBurstRing(r: number, dmg: number, color: number): void {
    for (let j = foes.length - 1; j >= 0; j--) {
      const f = foes[j];
      const dx = f.x - px;
      const dy = (f.y - 8 - (py - 10)) / 0.78;
      const reach = r + f.def.r * f.scale;
      if (dx * dx + dy * dy <= reach * reach) hurtFoe(f, dmg, w.elem);
    }
    if (boss) {
      const dx = boss.x - px;
      const dy = (boss.y - 14 - (py - 10)) / 0.78;
      if (dx * dx + dy * dy <= (r + 18) * (r + 18)) hurtBoss(dmg, w.elem);
    }
    arcs.push({ x: px, y: py - 10, angle: 0, r, span: Math.PI * 2, life: 0.2, max: 0.2, color, look: 'ring' });
  }

  /**
   * 차지 해제 — 아홉이 전부 다르다.
   *
   * 방식이 같아도 차지까지 같으면 결국 같은 캐릭터다. 차지는 한 판에
   * 몇 번 안 쓰는 대신 화면이 크게 바뀌는 순간이라, 여기가 갈려야
   * "이 대원을 고른 이유"가 생긴다.
   *
   * 기대 피해는 대략 맞춰 뒀다. 멀리 가는 것은 얇고, 두꺼운 것은 짧다.
   */
  function releaseCharge(lv: number): void {
    const t = nearestFoe(px, py);
    const a = t ? Math.atan2(t.y - 8 - (py - 10), t.x - px) : facing > 0 ? 0 : Math.PI;
    const full = lv === 2;
    const mult = full ? 1 : 0.5;
    // 세이버는 근접이라 위험을 감수한 만큼, 다 찬 차지는 확실히 세게 흔들린다
    shake = Math.max(shake, w.style === 'saber' ? (full ? 9 : 4) : full ? 6 : 3);
    const base = w.dmg;

    switch (chargeLook) {
      case 'drive':
        // 못 — 말뚝 박기. 코앞만 닿지만 두껍고, 맞은 것은 멀리 밀린다
        chargeBeam(a, full ? 190 : 130, full ? 34 : 24, Math.round(base * (full ? 9 : 4.5)), -260);
        shake = Math.max(shake, full ? 11 : 6);
        break;
      case 'thread':
        // 바늘 — 화면 끝까지 가는 실 한 줄. 얇아서 겨눠야 맞는다
        chargeBeam(a, full ? 900 : 560, full ? 7 : 5, Math.round(base * (full ? 6.2 : 3.1)));
        break;
      case 'split':
        // 거울 — 세 갈래로 갈라진다. 한 줄씩은 약해도 잘 빗나가지 않는다
        for (const off of [-0.42, 0, 0.42]) {
          chargeBeam(a + off, full ? 380 : 260, full ? 11 : 8, Math.round(base * (full ? 2.7 : 1.35)));
        }
        break;
      case 'reel':
        // 작살 — 꿰어서 끌고 온다. 흩어진 것을 한 줄로 모으는 게 목적이다
        chargeBeam(a, full ? 460 : 300, full ? 13 : 10, Math.round(base * (full ? 5 : 2.5)), 300);
        break;
      case 'flame': {
        // 불씨 — 코앞을 부채꼴로 태운다. 사거리가 짧은 대신 폭이 넓다
        const r = full ? 96 : 66;
        const span = Math.PI * 0.62;
        const dmg = Math.round(base * (full ? 7 : 3.5));
        for (let j = foes.length - 1; j >= 0; j--) {
          const f = foes[j];
          const dx = f.x - px;
          const dy = (f.y - 8 - (py - 10)) / 0.78;
          if (dx * dx + dy * dy > (r + f.def.r) * (r + f.def.r)) continue;
          let d = Math.atan2(dy, dx) - a;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          if (Math.abs(d) > span / 2) continue;
          hurtFoe(f, dmg, w.elem);
        }
        if (boss) {
          const dx = boss.x - px;
          const dy = (boss.y - 14 - (py - 10)) / 0.78;
          if (dx * dx + dy * dy <= (r + 18) * (r + 18)) {
            let d = Math.atan2(dy, dx) - a;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            if (Math.abs(d) <= span / 2) hurtBoss(dmg, w.elem);
          }
        }
        arcs.push({ x: px, y: py - 10, angle: a, r, span, life: 0.22, max: 0.22, color: shotColor });
        for (let i = 0; i < 10; i++) {
          const d = a + (Math.random() - 0.5) * span;
          const l = r * (0.3 + Math.random() * 0.7);
          spawnPart(px + Math.cos(d) * l, py - 10 + Math.sin(d) * l * 0.78, 2, shotCore, 150);
        }
        burstT = full ? 0.5 : 0.25;
        break;
      }
      case 'volley': {
        // 반딧불 — 보이는 것 전부에게 한 발씩. 겨눌 필요가 없다
        // 사방으로 흩뿌리고 유도에 맡긴다 — 여기서 표적을 직접 배정하면
        // 적이 몇 없을 때 같은 놈에게 열 발이 몰린다
        const n = full ? 10 : 5;
        const dmg = Math.round(base * (full ? 2.1 : 1.4));
        for (let i = 0; i < n; i++) {
          const ang = a + (i / n) * Math.PI * 2;
          addBullet({
            x: px, y: py - 10,
            vx: Math.cos(ang) * 150, vy: Math.sin(ang) * 150 * 0.8,
            dmg, life: 2.2, color: shotColor, r: 3,
            homing: 6, elem: w.elem,
          });
        }
        break;
      }
      case 'quake':
        // 종 — 돌진이 안 어울린다. 전방위로 싸우는 대원이라 제자리에서
        // 세 번 크게 퍼뜨린다. 두 번째·세 번째는 예약으로 밀어 둔다
        chargeBurstRing(full ? 56 : 42, Math.round(base * (full ? 3.4 : 1.8)), shotCore);
        for (let i = 1; i <= 2; i++) {
          echoes.push({
            x: px, y: py - 10, r: (full ? 56 : 42) + i * (full ? 26 : 18), t: i * 0.16,
            dmg: Math.round(base * (full ? 2.4 : 1.2)),
          });
        }
        break;
      case 'reap':
        // 사슬 — 더 멀리, 더 얇게 지나간다. 겨냥이 맞으면 한 줄을 쓸어낸다
        chargeLunge(a, full ? 280 : 170, w.arcR * (full ? 0.72 : 0.6), Math.round(base * (full ? 6 : 3)));
        break;
      default:
        // 도끼 — 몸 자체가 칼이 되어 조준선을 따라 파고든다
        chargeLunge(a, full ? 190 : 110, w.arcR * (full ? 1.25 : 1), Math.round(base * (full ? 6.5 : 3.2)));
        break;
    }

    if (chargeLook === 'drive' || chargeLook === 'thread' || chargeLook === 'split' || chargeLook === 'reel') {
      for (let i = 0; i < 2; i++) {
        rings.push({ x: px, y: py - 10, r: 18 + i * 14, life: 0.22, max: 0.22, color: shotCore });
      }
    }
    spawnPart(px, py - 10, Math.round(10 * (mult + 0.5)), shotCore, 190);
    sfx.shot('charge');
  }

  function nearestFoe(fx: number, fy: number): Foe | null {
    let best: Foe | null = null;
    let bd = Infinity;
    for (const f of foes) {
      const dx = f.x - fx;
      const dy = (f.y - fy) * 1.25;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  /**
   * 옵션 유닛 발사 — 세이버는 탄이 없는 근접 방식이라, 이 호출이 shoot() 의
   * 세이버 분기 안(early return 뒤)에 있으면 세이버 캐릭터는 옵션 유닛을
   * 뽑아도 영원히 발동하지 않는다. 도는 것만 보이고 아무 것도 안 쏘는
   * 장식이 돼버려서, 방식과 무관하게 shoot() 맨 앞에서 항상 부른다.
   */
  function fireDrones(base: number): void {
    for (let d = 0; d < w.drones; d++) {
      const ang = droneAngle + (d / w.drones) * Math.PI * 2;
      const dx = px + Math.cos(ang) * 30;
      const dy = py - 12 + Math.sin(ang) * 20;
      const dt2 = nearestFoe(dx, dy);
      const da = dt2 ? Math.atan2((dt2.y - 8) - dy, dt2.x - dx) : base;
      fireOne(da, 0.5, dx, dy, Math.max(2, Math.round(w.dmg * 0.6)));
      // 쏘는 순간 자체가 안 보이면 "도는 장식"과 구분이 안 된다 — 총구 섬광을 남긴다
      spawnPart(dx, dy, 2, 0x8ef0ff, 70);
    }
  }

  function shoot(): void {
    const target = nearestFoe(px, py);
    const base = target ? Math.atan2((target.y - 8) - (py - 10), target.x - px) : facing > 0 ? 0 : Math.PI;
    attackHold = 0.2;
    const muzX = px + facing * 9;
    // 총알이 실제로 나가는 자리는 조준 각도 계산(py-10, 위 base)과는
    // 별개로 본편과 같은 손 높이 공식을 쓴다 — py-10 은 허리 아래라
    // 총알이 발 근처에서 나가는 것처럼 보였다.
    const muzY = py - (charDef.hitbox?.h ?? 30) * (charDef.muzzle_ratio ?? 0.63);

    fireDrones(base);

    if (w.style === 'saber') {
      swingSaber(base);
      sfx.shot('saber');
      return;
    }

    for (let i = 0; i < w.shots; i++) {
      const t = w.shots === 1 ? 0 : i / (w.shots - 1) - 0.5;
      // 연사는 매 발이 조금씩 흩어져야 "갈긴다"는 느낌이 난다
      const jitter = w.style === 'rapid' ? (Math.random() - 0.5) * 0.1 : 0;
      fireOne(base + t * w.spread + jitter, shotLife * (w.style === 'charge' ? 1.5 : 1), muzX, muzY, w.dmg);
    }
    spawnPart(muzX + Math.cos(base) * 5, muzY + Math.sin(base) * 5, w.style === 'charge' ? 4 : 2, 0xfff2c0, 60);
    sfx.shot(w.style);
  }

  let droneAngle = 0;

  // ------------------------------------------------------------ 특수무기
  //
  // 이 장르의 뽑기는 능력치가 아니라 "무기가 하나 더 붙는" 데서 온다.
  // 전부 록맨 시리즈에 실제로 나왔던 특수무기이고, 수치가 아니라 거동이
  // 서로 다르게 잡았다 — 전방위/추적/관통/폭발/즉발/근접.
  //
  // 위력은 레벨업 카드 한 장 값에 맞췄다. 카드는 레벨당 한 장뿐이라
  // 무기를 집으면 능력치를 못 집으므로, 둘의 값이 비슷해야 곡선이 안 깨진다.
  interface SpecialDef {
    id: string;
    name: string;
    /** 레벨을 받아 카드에 쓸 설명을 만든다 */
    desc: (lv: number) => string;
    color: number;
    max: number;
    /** 재사용 대기시간. passive 무기는 안 쓴다 */
    interval?: (lv: number) => number;
    fire?: (lv: number) => void;
    /** 가챠 전용 무기에만 있다. 레벨업 카드에는 안 나온다 */
    rarity?: Rarity;
    /** 상성 계산에 쓴다. 없으면 무속성 */
    elem?: Element;
  }

  const SPECIALS: SpecialDef[] = [
    {
      id: 'metal_blade',
      name: '메탈 블레이드',
      color: 0xd8e2f0,
      max: 5,
      desc: (lv) => (lv === 0 ? '전방위로 관통하는 톱날' : `날 ${4 + lv + 1}개 · 위력 ${8 + 4 * (lv + 1)}`),
      interval: (lv) => 0.55 - 0.05 * lv,
      fire: (lv) => {
        const n = 4 + lv;
        const dmg = 8 + 4 * lv;
        for (let i = 0; i < n; i++) {
          const a = bladeSpin + (i / n) * Math.PI * 2;
          addBullet({
            x: px, y: py - 10,
            vx: Math.cos(a) * 260, vy: Math.sin(a) * 260 * 0.8,
            life: 0.9, dmg, pierce: 2 + lv,
            shape: 'blade', color: 0xd8e2f0, r: 5, spin: 16,
          });
        }
        bladeSpin += 0.5;
      },
    },
    {
      id: 'rolling_shield',
      name: '롤링 실드',
      color: 0x6ec8ff,
      max: 5,
      desc: (lv) => (lv === 0 ? '몸을 도는 방어막' : `구슬 ${lv + 2}개 · 접촉 ${6 + 4 * (lv + 1)}`),
      // passive — interval/fire 없음. 아래 updateOrbs() 가 처리한다.
    },
    {
      id: 'homing_torpedo',
      name: '홈잉 토피도',
      color: 0xffa8dc,
      max: 5,
      desc: (lv) => (lv === 0 ? '알아서 쫓아가는 유도탄' : `유도탄 ${1 + Math.floor((lv + 1) / 2)}발 · 위력 ${26 + 12 * (lv + 1)}`),
      interval: (lv) => 0.85 - 0.08 * lv,
      fire: (lv) => {
        const n = 1 + Math.floor(lv / 2);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          addBullet({
            x: px, y: py - 10,
            vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 * 0.8,
            life: 2.4, dmg: 26 + 12 * lv, pierce: 0,
            shape: 'orb', color: 0xffa8dc, r: 5, homing: 5.5,
          });
        }
      },
    },
    {
      id: 'storm_tornado',
      elem: 'ice',
      name: '스톰 토네이도',
      color: 0x9fe8ff,
      max: 5,
      desc: (lv) => (lv === 0 ? '앞을 쓸어버리는 회오리' : `크기 ${18 + 3 * (lv + 1)} · 위력 ${7 + 4 * (lv + 1)}`),
      interval: (lv) => 1.5 - 0.14 * lv,
      fire: (lv) => {
        const t = nearestFoe(px, py);
        const a = t ? Math.atan2(t.y - 8 - (py - 10), t.x - px) : facing > 0 ? 0 : Math.PI;
        addBullet({
          x: px, y: py - 10,
          vx: Math.cos(a) * 95, vy: Math.sin(a) * 95 * 0.8,
          life: 1.7, dmg: 7 + 4 * lv, pierce: 999,
          shape: 'orb', color: 0x9fe8ff, r: 18 + 3 * lv, spin: 9,
        });
      },
    },
    {
      id: 'crash_bomber',
      elem: 'fire',
      name: '크래시 봄버',
      color: 0xff8a5c,
      max: 5,
      desc: (lv) => (lv === 0 ? '박히고 터지는 폭탄' : `폭발 ${34 + 7 * (lv + 1)} · 위력 ${22 + 11 * (lv + 1)}`),
      interval: (lv) => 1.25 - 0.11 * lv,
      fire: (lv) => {
        const t = nearestFoe(px, py);
        const a = t ? Math.atan2(t.y - 8 - (py - 10), t.x - px) : facing > 0 ? 0 : Math.PI;
        addBullet({
          x: px, y: py - 10,
          vx: Math.cos(a) * 200, vy: Math.sin(a) * 200 * 0.8,
          life: 1.1, dmg: 0, pierce: 0,
          shape: 'orb', color: 0xff8a5c, r: 5, spin: 7,
          boomR: 34 + 7 * lv, boomDmg: 22 + 11 * lv,
        });
      },
    },
    {
      id: 'triad_thunder',
      elem: 'elec',
      name: '트라이어드 썬더',
      color: 0xffe86b,
      max: 5,
      desc: (lv) => (lv === 0 ? '주변을 내리치는 번개' : `${2 + lv + 1}발 · 위력 ${18 + 10 * (lv + 1)}`),
      interval: (lv) => 1.8 - 0.16 * lv,
      fire: (lv) => {
        const n = 2 + lv;
        const dmg = 18 + 10 * lv;
        // 가까운 적부터 골라 때린다 — 무작위로 흩뿌리면 허공을 치는 일이 잦다
        const near = foes
          .filter((f) => Math.abs(f.x - px) < 200 && Math.abs(f.y - py) < 130)
          .slice(0, n * 3);
        for (let i = 0; i < n && near.length; i++) {
          const f = near.splice(Math.floor(Math.random() * near.length), 1)[0];
          bolts.push({ x: f.x, y: f.y - 8, life: 0.14, color: 0xffe86b });
          blast(f.x, f.y - 8, 20, dmg, 0xffe86b, 'elec');
        }
      },
    },
  ];

  /**
   * 가챠 전용 무기.
   *
   * 레벨업으로 얻는 여섯 개와 급이 달라야 뽑는 의미가 있다. 그래서 수치를
   * 올린 게 아니라 **화면에서 벌어지는 일의 크기**를 다르게 잡았다 —
   * 화면을 통째로 날리거나, 플레이어 자체가 무기가 되거나, 스무 발이
   * 한꺼번에 흩어지거나. 보고 나서 "저건 다르다"가 바로 와야 한다.
   */
  const LEGENDS: SpecialDef[] = [
    {
      id: 'giga_crash',
      name: '기가 크래시',
      color: 0xfff2c0,
      rarity: 'SSR',
      max: 5,
      desc: (lv) => (lv === 0 ? '화면 전체를 날려버린다' : `위력 ${78 + 46 * (lv + 1)} · 간격 ${(15 - 1.4 * (lv + 1)).toFixed(1)}초`),
      interval: (lv) => 15 - 1.4 * lv,
      fire: (lv) => {
        // 화면에 보이는 것을 전부 지운다. 반경이 아니라 시야 전체다.
        // 위력에 비해 이펙트가 밋밋하다는 피드백 — 발동 순간 잠깐 멎었다가
        // (히트스톱) 확 터지게 해서 무게를 실었다. 그 대신 위력은 살짝 낮췄다.
        gigaFlash = 0.6;
        shake = 18;
        hitstop = 0.09;
        sfx.explode();
        const dmg = 78 + 46 * lv;
        for (let j = foes.length - 1; j >= 0; j--) {
          const f = foes[j];
          if (!inView(f.x, f.y)) continue;
          spawnPart(f.x, f.y - 8, 3, 0xfff2c0, 200);
          hurtFoe(f, dmg, 'none');
        }
        if (boss && inView(boss.x, boss.y)) hurtBoss(dmg * 0.8);
        for (let i = 0; i < 5; i++) {
          rings.push({ x: px, y: py - 10, r: 70 + i * 60, life: 0.55, max: 0.55, color: i % 2 ? 0xfff2c0 : 0xffffff });
        }
        spawnPart(px, py - 10, 40, 0xfff2c0, 260);
      },
    },
    {
      id: 'nova_strike',
      name: '노바 스트라이크',
      color: 0x9ff0ff,
      rarity: 'SSR',
      max: 5,
      desc: (lv) => (lv === 0 ? '무적으로 꿰뚫는 돌진' : `위력 ${70 + 40 * (lv + 1)} · 간격 ${(9 - 0.9 * (lv + 1)).toFixed(1)}초`),
      interval: (lv) => 9 - 0.9 * lv,
      fire: (lv) => {
        // 적이 제일 몰린 쪽으로 플레이어째 꽂는다
        const t = densestDir();
        novaAngle = t;
        novaTimer = 0.42;
        novaDmg = 70 + 40 * lv;
        iframe = Math.max(iframe, 0.62);
        shake = 10;
        sfx.dash();
      },
    },
    {
      id: 'ray_splasher',
      name: '레이 스플래셔',
      color: 0xffe86b,
      rarity: 'SR',
      max: 5,
      desc: (lv) => (lv === 0 ? '유도 불꽃을 한꺼번에 흩뿌린다' : `${14 + 4 * (lv + 1)}발 · 위력 ${9 + 5 * (lv + 1)}`),
      interval: (lv) => 2.8 - 0.22 * lv,
      fire: (lv) => {
        const n = 14 + 4 * lv;
        const dmg = 9 + 5 * lv;
        const base = Math.atan2(0, facing) + (Math.random() - 0.5) * 0.6;
        for (let i = 0; i < n; i++) {
          const a = base + (i / n) * Math.PI * 2;
          addBullet({
            x: px, y: py - 10,
            vx: Math.cos(a) * (150 + Math.random() * 90),
            vy: Math.sin(a) * (150 + Math.random() * 90) * 0.8,
            life: 1.9, dmg, pierce: 1, homing: 4.2,
            shape: 'orb', color: 0xffe86b, r: 3,
          });
        }
        // 발사 순간 장미꽃 모양 섬광 — 스무 발이 한꺼번에 나가는 게
        // 탄만으로는 안 읽혀서 출발점에 표시를 남긴다
        for (let i = 0; i < 3; i++) {
          rings.push({ x: px, y: py - 10, r: 22 + i * 16, life: 0.26, max: 0.26, color: 0xffe86b });
        }
        spawnPart(px, py - 10, 10, 0xffe86b, 200);
        sfx.shot('rapid');
      },
    },
    {
      id: 'soul_body',
      name: '소울 바디',
      color: 0x8ef0d8,
      rarity: 'SR',
      max: 5,
      desc: (lv) => (lv === 0 ? '분신이 적을 끌어모으고 터진다' : `폭발 ${60 + 12 * (lv + 1)} · 위력 ${45 + 30 * (lv + 1)}`),
      interval: (lv) => 6.5 - 0.5 * lv,
      fire: (lv) => {
        decoy = {
          x: px, y: py, life: 2.4,
          r: 60 + 12 * lv,
          dmg: 45 + 30 * lv,
        };
        sfx.pick();
      },
    },
    {
      id: 'fire_wave',
      elem: 'fire',
      name: '파이어 웨이브',
      color: 0xff8a2c,
      rarity: 'R',
      max: 5,
      desc: (lv) => (lv === 0 ? '앞을 계속 태우는 화염' : `사거리 ${52 + 8 * (lv + 1)} · 초당 ${Math.round((6 + 4 * (lv + 1)) / 0.12)}`),
      // 계속 나가는 무기라 별도 쿨다운 없이 0.12초마다 판정한다
      interval: () => 0.12,
      fire: (lv) => {
        const r = 52 + 8 * lv;
        const dmg = 6 + 4 * lv;
        const span = Math.PI * 0.5;
        flameR = r;
        flameSpan = span;
        flameT = 0.14;
        const half = span / 2;
        for (let j = foes.length - 1; j >= 0; j--) {
          const f = foes[j];
          const dx = f.x - px;
          const dy = (f.y - 8 - (py - 10)) / 0.78;
          if (dx * dx + dy * dy > (r + f.def.r) * (r + f.def.r)) continue;
          let d = Math.atan2(dy, dx) - aimAngle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          if (Math.abs(d) > half) continue;
          if (Math.random() < 0.3) spawnPart(f.x, f.y - 8, 1, 0xff9a4c, 90);
          hurtFoe(f, dmg, 'fire');
        }
      },
    },
    {
      id: 'charge_kick',
      name: '차지 킥',
      color: 0xff5c9c,
      rarity: 'R',
      max: 5,
      desc: (lv) => (lv === 0 ? '대시 자리에 불길이 남는다' : `자국 위력 ${14 + 9 * (lv + 1)}`),
      // 대시할 때만 발동하므로 주기 발사가 없다 (아래 dash 처리에서 직접 남긴다)
    },
    // ------------------------------------------------------------
    // 서포트 유닛 — 록맨 시리즈의 로봇 동물들. 전부 "플레이어 대신 뭔가를
    // 해주는" 조력자라, 직접 조준하는 무기들과는 결이 다르게 잡았다.
    {
      id: 'beat_dive',
      name: '비트',
      color: 0x6ec8ff,
      rarity: 'SR',
      max: 5,
      desc: (lv) => (lv === 0 ? '급강하해서 적을 덮친다' : `위력 ${18 + 10 * (lv + 1)} · 간격 ${(2.4 - 0.16 * (lv + 1)).toFixed(1)}초`),
      interval: (lv) => 2.4 - 0.16 * lv,
      fire: (lv) => {
        const p = petPos('beat_dive');
        const t = nearestFoe(p.x, p.y);
        const a = t ? Math.atan2(t.y - 8 - p.y, t.x - p.x) : facing > 0 ? 0 : Math.PI;
        const dmg = 18 + 10 * lv;
        addBullet({
          x: p.x, y: p.y,
          vx: Math.cos(a) * 260, vy: Math.sin(a) * 260 * 0.8,
          life: 1.4, dmg, pierce: 2, homing: 7,
          shape: 'orb', color: 0x6ec8ff, r: 7, spin: 14,
        });
        spawnPart(p.x, p.y, 4, 0x6ec8ff, 90);
        petFlash.set('beat_dive', 0.18);
        sfx.shot('rapid');
      },
    },
    {
      id: 'tango_roll',
      name: '탱고',
      color: 0xff9a4c,
      rarity: 'SR',
      max: 5,
      desc: (lv) => (lv === 0 ? '구르며 계속 들이받는다' : `위력 ${14 + 8 * (lv + 1)} · 간격 ${(3.2 - 0.22 * (lv + 1)).toFixed(1)}초`),
      interval: (lv) => 3.2 - 0.22 * lv,
      fire: (lv) => {
        const p = petPos('tango_roll');
        const t = nearestFoe(p.x, p.y);
        // 몸을 말아 굴러가는 기술이라, 탱고 자리에서 적 쪽으로 출발한다
        const a = t ? Math.atan2(t.y - 8 - p.y, t.x - p.x) : densestDir();
        const dmg = 14 + 8 * lv;
        addBullet({
          x: p.x, y: p.y,
          vx: Math.cos(a) * 150, vy: Math.sin(a) * 150 * 0.8,
          life: 2.2, dmg, pierce: 99,
          shape: 'orb', color: 0x3fc060, r: 9, spin: 18,
        });
        spawnPart(p.x, p.y, 4, 0x8ef0a0, 70);
        petFlash.set('tango_roll', 0.18);
        sfx.shot('charge');
      },
    },
    {
      id: 'eddie_call',
      name: '에디',
      color: 0xffd85c,
      rarity: 'SR',
      max: 5,
      desc: (lv) => (lv === 0 ? '가끔 회복 상자를 던져준다' : `회복 ${20 + 6 * (lv + 1)} · 간격 ${(9 - 0.7 * (lv + 1)).toFixed(1)}초`),
      interval: (lv) => 9 - 0.7 * lv,
      fire: (lv) => {
        const p = petPos('eddie_call');
        heals.push({ x: p.x, y: p.y + 6, life: 10, amt: 20 + 6 * lv });
        rings.push({ x: p.x, y: p.y, r: 20, life: 0.3, max: 0.3, color: 0xffd85c });
        spawnPart(p.x, p.y, 6, 0xffd85c, 90);
        petFlash.set('eddie_call', 0.25);
        sfx.pick();
      },
    },
    {
      id: 'rush_slam',
      name: '러시',
      color: 0x8ef0a0,
      rarity: 'SR',
      max: 5,
      desc: (lv) => (lv === 0 ? '적 쪽으로 뛰어들어 내리찍는다' : `반경 ${40 + 8 * (lv + 1)} · 위력 ${24 + 14 * (lv + 1)}`),
      interval: (lv) => 3.6 - 0.24 * lv,
      fire: (lv) => {
        const p = petPos('rush_slam');
        const t = nearestFoe(p.x, p.y);
        const tx = t ? t.x : px + facing * 60;
        const ty = t ? t.y - 8 : py - 10;
        const r = 40 + 8 * lv;
        const dmg = 24 + 14 * lv;
        // 러시는 제자리에서 쏘는 게 아니라 몸을 던진다 — 궤도에서 목표까지
        // 실제로 날아갔다 돌아오게 해야 "쟤가 덮쳤다"로 읽힌다
        rushLeapT = RUSH_LEAP_DUR;
        rushLeapX = tx;
        rushLeapY = ty;
        blast(tx, ty, r, dmg, 0x8ef0a0, 'none');
        for (let i = 0; i < 3; i++) {
          rings.push({ x: tx, y: ty, r: r * (0.5 + i * 0.3), life: 0.35, max: 0.35, color: 0x8ef0a0 });
        }
        spawnPart(tx, ty, 8, 0x8ef0a0, 130);
        petFlash.set('rush_slam', 0.2);
        shake = Math.max(shake, 6);
        sfx.explode();
      },
    },
  ];

  /** 주기 발사 루프가 한 번에 도는 전체 목록 */
  /**
   * 보스 무기 — 가챠에는 안 나온다. 그 보스를 이겨야만 얻는다.
   *
   * 록맨에서 보스 무기가 특별한 건 성능이 아니라 **출처**다. 뽑기로도
   * 나오면 보스를 이긴 의미가 사라지므로 풀을 아예 분리했다.
   */
  const BOSS_WEAPONS: SpecialDef[] = [
    {
      id: 'bolt_chain',
      elem: 'elec',
      name: '연쇄 벼락',
      color: 0xffe86b,
      rarity: 'SR',
      max: 5,
      desc: (lv) => (lv === 0 ? '적에서 적으로 튀는 전격' : `${2 + lv + 1}회 연쇄 · 위력 ${16 + 10 * (lv + 1)}`),
      interval: (lv) => 1.9 - 0.16 * lv,
      fire: (lv) => {
        // 가까운 적에서 시작해 이웃으로 계속 튄다 — 뭉쳐 있을수록 강하다
        const dmg = 16 + 10 * lv;
        let cur = nearestFoe(px, py);
        if (!cur) return;
        const hitSet = new Set<Foe>();
        let fromX = px;
        let fromY = py - 10;
        for (let jump = 0; jump < 2 + lv && cur; jump++) {
          hitSet.add(cur);
          bolts.push({ x: cur.x, y: cur.y - 8, life: 0.16, color: 0xffe86b });
          arcs.push({
            x: fromX, y: fromY, angle: Math.atan2(cur.y - 8 - fromY, cur.x - fromX),
            r: Math.hypot(cur.x - fromX, cur.y - 8 - fromY), span: 0.14,
            life: 0.16, max: 0.16, color: 0xffe86b,
          });
          spawnPart(cur.x, cur.y - 8, 3, 0xffe86b, 150);
          fromX = cur.x;
          fromY = cur.y - 8;
          hurtFoe(cur, dmg, 'elec');
          // 다음 이웃 찾기
          let best: Foe | null = null;
          let bd = 150 * 150;
          for (const f of foes) {
            if (hitSet.has(f) || !f.alive) continue;
            const ddx = f.x - fromX;
            const ddy = (f.y - 8 - fromY) / 0.78;
            const dd = ddx * ddx + ddy * ddy;
            if (dd < bd) { bd = dd; best = f; }
          }
          cur = best;
        }
        sfx.hit();
      },
    },
    {
      id: 'shade_veil',
      elem: 'aqua',
      name: '그림자 잠행',
      color: 0x8ef0a0,
      rarity: 'SSR',
      max: 5,
      desc: (lv) => (lv === 0 ? '잠깐 사라지며 주위를 태운다' : `무적 ${(0.9 + 0.22 * (lv + 1)).toFixed(1)}초 · 위력 ${18 + 12 * (lv + 1)}`),
      interval: (lv) => 9 - 0.7 * lv,
      fire: (lv) => {
        // 무적 + 주위 지속 피해. 위기 탈출과 공격을 겸한다.
        stingT = 0.9 + 0.22 * lv;
        stingDmg = 18 + 12 * lv;
        iframe = Math.max(iframe, stingT);
        sfx.dash();
      },
    },
    {
      id: 'saw_return',
      name: '되돌아오는 톱',
      color: 0xc98cff,
      rarity: 'SR',
      max: 5,
      desc: (lv) => (lv === 0 ? '나갔다 돌아오며 두 번 벤다' : `${1 + lv + 1}개 · 위력 ${20 + 11 * (lv + 1)}`),
      interval: (lv) => 2.2 - 0.18 * lv,
      fire: (lv) => {
        const n = 1 + lv;
        const dmg = 20 + 11 * lv;
        const t = nearestFoe(px, py);
        const base = t ? Math.atan2(t.y - 8 - (py - 10), t.x - px) : facing > 0 ? 0 : Math.PI;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.42;
          addBullet({
            x: px, y: py - 10,
            vx: Math.cos(a) * 240, vy: Math.sin(a) * 240 * 0.8,
            life: 2.6, dmg, pierce: 99,
            shape: 'blade', color: 0xc98cff, r: 7, spin: 20,
            back: 0.42, boomerang: true,
          });
        }
        sfx.shot('saber');
      },
    },
    {
      id: 'forge_ram',
      elem: 'fire',
      name: '달굼질',
      color: 0xff9a4c,
      rarity: 'SR',
      max: 5,
      desc: (lv) => (lv === 0 ? '발밑을 내리찍는 충격파' : `반경 ${64 + 12 * (lv + 1)} · 위력 ${34 + 22 * (lv + 1)}`),
      interval: (lv) => 3.4 - 0.28 * lv,
      fire: (lv) => {
        const r = 64 + 12 * lv;
        blast(px, py - 8, r, 34 + 22 * lv, 0xff9a4c, 'fire');
        for (let i = 0; i < 3; i++) {
          rings.push({ x: px, y: py - 8, r: r * (0.5 + i * 0.3), life: 0.4, max: 0.4, color: 0xff9a4c });
        }
        shake = Math.max(shake, 8);
      },
    },
    {
      id: 'shell_guard',
      elem: 'aqua',
      name: '껍질막',
      color: 0x6ec8ff,
      rarity: 'SSR',
      max: 5,
      desc: (lv) => (lv === 0 ? '적 탄을 튕겨내는 방패' : `반경 ${28 + 5 * (lv + 1)} · 튕길 때 ${10 + 8 * (lv + 1)}`),
      // 상시 발동 — 아래 updateLegends 에서 처리한다
    },
    {
      id: 'edge_cut',
      name: '칼금',
      color: 0xff5c9c,
      rarity: 'SR',
      max: 5,
      desc: (lv) => (lv === 0 ? '대시할 때 참격이 날아간다' : `${1 + lv + 1}갈래 · 위력 ${24 + 14 * (lv + 1)}`),
      // 대시할 때만 나간다 (대시 처리에서 직접 쏜다)
    },
    {
      id: 'frost_lance',
      elem: 'ice',
      name: '서릿살',
      color: 0xdcf4ff,
      rarity: 'SSR',
      max: 5,
      desc: (lv) => (lv === 0 ? '화면을 가르는 관통 광선' : `위력 ${30 + 20 * (lv + 1)} · 간격 ${(2.6 - 0.2 * (lv + 1)).toFixed(1)}초`),
      interval: (lv) => 2.6 - 0.2 * lv,
      fire: (lv) => {
        const t = nearestFoe(px, py);
        const a = t ? Math.atan2(t.y - 8 - (py - 10), t.x - px) : facing > 0 ? 0 : Math.PI;
        beamAngle = a;
        beamT = 0.3;
        beamDmg = 30 + 20 * lv;
        // 선을 따라 있는 것을 전부 관통한다
        const dmg = beamDmg;
        for (let j = foes.length - 1; j >= 0; j--) {
          const f = foes[j];
          const rx = f.x - px;
          const ry = (f.y - 8 - (py - 10)) / 0.78;
          const along = rx * Math.cos(a) + ry * Math.sin(a);
          if (along < 0 || along > 420) continue;
          const perp = Math.abs(-rx * Math.sin(a) + ry * Math.cos(a));
          if (perp > 12 + f.def.r) continue;
          spawnPart(f.x, f.y - 8, 3, 0xdcf4ff, 170);
          hurtFoe(f, dmg, 'ice');
        }
        if (boss) {
          const rx = boss.x - px;
          const ry = (boss.y - 14 - (py - 10)) / 0.78;
          const along = rx * Math.cos(a) + ry * Math.sin(a);
          const perp = Math.abs(-rx * Math.sin(a) + ry * Math.cos(a));
          if (along > 0 && along < 420 && perp < 26) hurtBoss(dmg, 'ice');
        }
        shake = Math.max(shake, 5);
        sfx.shot('charge');
      },
    },
    {
      id: 'flame_orbit',
      elem: 'fire',
      name: '불고리',
      color: 0xff5c5c,
      rarity: 'SR',
      max: 5,
      desc: (lv) => (lv === 0 ? '도는 구슬이 주기적으로 튀어나간다' : `구슬 ${2 + lv + 1}개 · 위력 ${16 + 11 * (lv + 1)}`),
      interval: (lv) => 2.6 - 0.2 * lv,
      fire: (lv) => {
        const n = 2 + lv;
        const dmg = 16 + 11 * lv;
        for (let i = 0; i < n; i++) {
          const a = orbitAngle + (i / n) * Math.PI * 2;
          addBullet({
            x: px + Math.cos(a) * 30, y: py - 10 + Math.sin(a) * 24,
            vx: Math.cos(a) * 260, vy: Math.sin(a) * 260 * 0.8,
            life: 1.6, dmg, pierce: 2,
            shape: 'orb', color: 0xff5c5c, r: 6, back: 0.5,
          });
        }
        sfx.shot('rapid');
      },
    },
  ];

  const ALL_WEAPONS: SpecialDef[] = [...SPECIALS, ...LEGENDS, ...BOSS_WEAPONS];

  const MAX_SPECIALS = 4;
  /** 보유 무기 id → 레벨(1부터) */
  const owned = new Map<string, number>();
  const cooldowns = new Map<string, number>();
  const orbs: Orb[] = [];
  let bladeSpin = 0;

  // --- 펫(서포트 유닛)
  /** 펫들이 플레이어 주위를 도는 각도 */
  let petAngle = 0;
  /** 방금 공격한 펫이 잠깐 번쩍인다 — 어느 놈이 쐈는지 보이게 */
  const petFlash = new Map<string, number>();
  /** 러시가 목표로 몸을 던진 뒤 궤도로 돌아오기까지 */
  const RUSH_LEAP_DUR = 0.4;
  let rushLeapT = 0;
  let rushLeapX = 0;
  let rushLeapY = 0;

  /** 지금 데리고 있는 펫 목록 — 뽑은 순서와 무관하게 자리가 고정된다 */
  function ownedPets(): PetId[] {
    return PET_ORDER.filter((id) => (owned.get(id) ?? 0) > 0);
  }

  /** 펫이 지금 서 있는 자리. 공격도 여기서 나가야 "쟤가 쐈다"가 읽힌다 */
  function petPos(id: PetId): { x: number; y: number; dir: number } {
    const list = ownedPets();
    const i = Math.max(0, list.indexOf(id));
    const n = Math.max(1, list.length);
    const a = petAngle + (i / n) * Math.PI * 2;
    const ox = px + Math.cos(a) * 34;
    // 도는 궤도는 위아래로 눌러 그린다 — 바닥에 누운 원으로 보여야 한다
    const oy = py - 16 + Math.sin(a) * 20;
    // 도는 방향(접선)을 보게 한다
    let dir = -Math.sin(a) >= 0 ? 1 : -1;

    // 러시가 덮치는 중이면 궤도를 벗어나 목표까지 갔다가 돌아온다.
    // 빠르게 나가고 천천히 돌아와야 "때리러 갔다"가 읽힌다.
    if (id === 'rush_slam' && rushLeapT > 0) {
      const p = 1 - rushLeapT / RUSH_LEAP_DUR;
      const k = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
      const lx = ox + (rushLeapX - ox) * k;
      const ly = oy + (rushLeapY - oy) * k;
      if (Math.abs(rushLeapX - ox) > 4) dir = rushLeapX > ox ? 1 : -1;
      return { x: lx, y: ly, dir };
    }
    return { x: ox, y: oy, dir };
  }

  /** 보디 파츠가 있으면 받는 피해가 줄어든다 */
  const takeDmg = (raw: number): number =>
    raw * (armor.has('body') ? 0.7 : 1) * (rideT > 0 ? 0.25 : 1);

  /** 화면에 보이는지 — draw() 와 같은 기준을 무기 쪽에서도 쓴다 */
  const inView = (x: number, y: number): boolean => {
    const cx = clamp(px - W / 2, 0, ARENA_W - W);
    const cy = clamp(py - H / 2, 0, ARENA_H - H);
    return x > cx - 24 && x < cx + W + 24 && y > cy - 24 && y < cy + H + 24;
  };

  // --- 레전드 무기용 상태
  /** 기가 크래시 섬광 남은 시간 */
  let gigaFlash = 0;
  /** 노바 스트라이크 — 돌진 중이면 0보다 크다 */
  let novaTimer = 0;
  let novaAngle = 0;
  let novaDmg = 0;
  /** 소울 바디 분신 */
  let decoy: { x: number; y: number; life: number; r: number; dmg: number } | null = null;
  /** 파이어 웨이브 화염 표시 */
  let flameT = 0;
  let flameR = 0;
  let flameSpan = 0;
  /** 차지 킥이 남긴 불길 */
  const kickTrail: { x: number; y: number; life: number; r: number; dmg: number }[] = [];

  // --- 보스 무기용 상태
  /** 카멜레온 스팅 — 남은 무적 시간 */
  let stingT = 0;
  let stingDmg = 0;
  /** 롱쇼트 빔 — 남은 표시 시간 */
  let beamT = 0;
  let beamAngle = 0;
  let beamDmg = 0;
  /** 크림슨 오빗 구슬이 도는 각도 */
  let orbitAngle = 0;

  // --- E탱크
  /**
   * 지금까지 회복은 주우면 즉시 발동이라 아무 판단이 없었다. 모아뒀다가
   * 내가 원할 때 터뜨리는 자원이 되면 "지금 쓸까 더 버틸까"가 생긴다.
   */
  let eTanks = 0;
  const E_TANK_MAX = 3;

  // --- 아머 파츠
  /**
   * data/characters 에 equipment_slots(head/body/arm/foot)가 이미 있는데
   * 안 쓰고 있었다. 스테이지에 캡슐로 숨겨두고, 먹으면 그 판 내내 붙는다.
   */
  type ArmorSlot = 'head' | 'body' | 'arm' | 'foot';
  const armor = new Set<ArmorSlot>();
  interface Capsule { x: number; y: number; slot: ArmorSlot; bob: number }
  const capsules: Capsule[] = [];
  let capsuleAt = 26;

  const ARMOR_INFO: Record<ArmorSlot, { name: string; desc: string; color: number }> = {
    head: { name: '헤드 파츠', desc: '경험치·아이템 흡수 범위 크게', color: 0x8ef0ff },
    body: { name: '보디 파츠', desc: '받는 피해 30% 감소', color: 0xffd85c },
    arm: { name: '암 파츠', desc: '차지가 2배 빨리 찬다', color: 0xff7b3c },
    foot: { name: '풋 파츠', desc: '이동 +18%, 대시 재사용 절반', color: 0x8ef0a0 },
  };

  // --- 차지 샷
  /**
   * X 시리즈의 손맛 자체. 지금까지 사격이 전부 자동이라 플레이어가 손으로
   * 하는 게 이동뿐이었다 — 잘하는 사람과 못하는 사람의 차이가 위치잡기
   * 하나였다. 자동 사격은 그대로 두고 그 위에 얹는다.
   */
  let chargeT = 0;
  /** 몇 단까지 찼는지 (0=없음, 1=중간, 2=최대) */
  let chargeLevel = 0;
  const CHARGE_STEP = [0.55, 1.25];
  /** 연사 차지의 폭주 남은 시간 */
  let burstT = 0;
  /** 세이버 차지 — 돌진 연참 잔상 표시 시간·시작점·도착점·폭 */
  let slashLungeT = 0;
  let slashLungeFromX = 0;
  let slashLungeFromY = 0;
  let slashLungeToX = 0;
  let slashLungeToY = 0;
  let slashLungeWidth = 0;
  /** 돌진이 실제로 진행 중인 시간 — 0 될 때까지 매 프레임 px/py 를 옮긴다 */
  let lungeMoveT = 0;
  /** 버스터 차지 — 일직선 관통 광선 표시 시간·방향·사거리·폭 */
  let chargeBeamT = 0;
  const chargeBeamAngles: number[] = [];
  let chargeBeamRange = 0;
  let chargeBeamWidth = 0;

  /** 적이 가장 몰려 있는 쪽 각도 — 노바 스트라이크가 헛돌지 않게 한다 */
  function densestDir(): number {
    const BINS = 12;
    const score = new Array<number>(BINS).fill(0);
    for (const f of foes) {
      const dx = f.x - px;
      const dy = (f.y - 8 - (py - 10)) / 0.78;
      const d = Math.hypot(dx, dy);
      if (d > 260) continue;
      const b = (Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * BINS) + BINS) % BINS;
      // 가까울수록 크게 친다
      score[b] += 1 + (260 - d) / 260;
    }
    let bi = 0;
    for (let i = 1; i < BINS; i++) if (score[i] > score[bi]) bi = i;
    if (score[bi] === 0) return facing > 0 ? 0 : Math.PI;
    return (bi + 0.5) / BINS * Math.PI * 2 - Math.PI;
  }

  function syncOrbs(): void {
    const lv = owned.get('rolling_shield') ?? 0;
    orbs.length = 0;
    const n = lv ? lv + 1 : 0;
    for (let i = 0; i < n; i++) orbs.push({ angle: (i / n) * Math.PI * 2, cd: 0 });
  }

  /** 실드 구슬 — 돌면서 닿는 적을 계속 깎는다 */
  function updateOrbs(dt: number): void {
    const lv = owned.get('rolling_shield') ?? 0;
    if (!lv) return;
    const dmg = 6 + 4 * lv;
    for (const o of orbs) {
      o.angle += dt * 2.6;
      o.cd -= dt;
      if (o.cd > 0) continue;
      const ox = px + Math.cos(o.angle) * 36;
      const oy = py - 12 + Math.sin(o.angle) * 24;
      const ci = cellIndex(ox, oy);
      if (ci < 0) continue;
      const cx = Math.floor(ox / GRID_CELL);
      const cy = Math.floor(oy / GRID_CELL);
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        if (gy < 0 || gy >= GRID_H) continue;
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          if (gx < 0 || gx >= GRID_W) continue;
          for (const f of grid[gy * GRID_W + gx]) {
            if (!f.alive) continue;
            const dx = f.x - ox;
            const dy = f.y - 8 - oy;
            const rr = f.def.r * f.scale + 6;
            if (dx * dx + dy * dy > rr * rr) continue;
            spawnPart(ox, oy, 2, 0x8ef0ff, 90);
            hurtFoe(f, dmg, 'none');
            o.cd = 0.12;
            gy = cy + 2;
            gx = cx + 2;
            break;
          }
        }
      }
    }
  }

  /** 시간이 된 무기를 쏜다 */
  function fireSpecials(dt: number): void {
    for (const def of ALL_WEAPONS) {
      const lv = owned.get(def.id) ?? 0;
      if (!lv || !def.fire || !def.interval) continue;
      const left = (cooldowns.get(def.id) ?? 0) - dt;
      if (left > 0) {
        cooldowns.set(def.id, left);
        continue;
      }
      cooldowns.set(def.id, Math.max(0.08, def.interval(lv)));
      def.fire(lv);
    }
  }

  /** 레전드 무기의 지속 효과 — 돌진·분신·불길 */
  function updateLegends(dt: number): void {
    if (gigaFlash > 0) gigaFlash -= dt;
    if (flameT > 0) flameT -= dt;
    if (beamT > 0) beamT -= dt;
    orbitAngle += dt * 2.2;

    // 카멜레온 스팅 — 무적인 동안 주위를 태운다
    if (stingT > 0) {
      stingT -= dt;
      iframe = Math.max(iframe, 0.06);
      spawnPart(px + (Math.random() - 0.5) * 30, py - 10 + (Math.random() - 0.5) * 26, 1, 0x8ef0a0, 90);
      for (let j = foes.length - 1; j >= 0; j--) {
        const f = foes[j];
        const dx = f.x - px;
        const dy = (f.y - 8 - (py - 10)) / 0.78;
        if (dx * dx + dy * dy > 46 * 46) continue;
        hurtFoe(f, stingDmg * dt * 2.4, 'aqua');
      }
    }

    // 가드 셸 — 적 탄을 튕겨낸다. 이걸 하는 무기가 이것뿐이다.
    const shellLv = owned.get('shell_guard') ?? 0;
    if (shellLv) {
      const rr = 28 + 5 * shellLv;
      const dmg = 10 + 8 * shellLv;
      for (let i = hostiles.length - 1; i >= 0; i--) {
        const h = hostiles[i];
        const dx = h.x - px;
        const dy = (h.y - (py - 10)) / 0.78;
        if (dx * dx + dy * dy > rr * rr) continue;
        hostiles.splice(i, 1);
        spawnPart(h.x, h.y, 4, 0x9fd0ff, 150);
        sfx.hit();
        // 튕긴 자리에 작은 반격
        blast(h.x, h.y, 18, dmg, 0x6ec8ff);
      }
    }

    // 세이버 차지 돌진 — 목적지는 releaseCharge() 가 이미 정해뒀다. 순간
    // 이동이면 뭘 당했는지 안 보이니, 여기서 매 프레임 조금씩 옮긴다.
    if (lungeMoveT > 0) {
      lungeMoveT -= dt;
      const t = clamp(1 - lungeMoveT / LUNGE_MOVE_DUR, 0, 1);
      px = slashLungeFromX + (slashLungeToX - slashLungeFromX) * t;
      py = slashLungeFromY + (slashLungeToY - slashLungeFromY) * t;
    }

    // 노바 스트라이크 — 무적으로 밀고 나가며 닿는 것을 지운다
    if (novaTimer > 0) {
      novaTimer -= dt;
      const sp = 620;
      px = clamp(px + Math.cos(novaAngle) * sp * dt, 12, ARENA_W - 12);
      py = clamp(py + Math.sin(novaAngle) * sp * 0.78 * dt, 20, ARENA_H - 10);
      iframe = Math.max(iframe, 0.12);
      spawnPart(px, py - 10, 3, 0x9ff0ff, 200);
      for (let j = foes.length - 1; j >= 0; j--) {
        const f = foes[j];
        const dx = f.x - px;
        const dy = f.y - 8 - (py - 10);
        const rr = 26 + f.def.r * f.scale;
        if (dx * dx + dy * dy > rr * rr) continue;
        hurtFoe(f, novaDmg, 'none');
      }
      if (boss) {
        const bdx = boss.x - px;
        const bdy = boss.y - 14 - (py - 10);
        if (bdx * bdx + bdy * bdy < 40 * 40) hurtBoss(novaDmg * dt * 4);
      }
    }

    // 소울 바디 — 적을 끌어당기다가 터진다
    if (decoy) {
      decoy.life -= dt;
      if (decoy.life <= 0) {
        blast(decoy.x, decoy.y - 8, decoy.r, decoy.dmg, 0x8ef0d8);
        for (let i = 0; i < 3; i++) {
          rings.push({ x: decoy.x, y: decoy.y - 8, r: decoy.r * (0.5 + i * 0.3), life: 0.4, max: 0.4, color: 0x8ef0d8 });
        }
        decoy = null;
      }
    }

    // 차지 킥 자국 — 남아서 계속 태운다
    for (let i = kickTrail.length - 1; i >= 0; i--) {
      const k = kickTrail[i];
      k.life -= dt;
      if (k.life <= 0) { kickTrail.splice(i, 1); continue; }
      for (let j = foes.length - 1; j >= 0; j--) {
        const f = foes[j];
        const dx = f.x - k.x;
        const dy = (f.y - 8 - k.y) / 0.78;
        if (dx * dx + dy * dy > k.r * k.r) continue;
        hurtFoe(f, k.dmg * dt * 3, 'fire');
      }
    }
  }

  // ------------------------------------------------------------ 가챠
  const reel = new GachaReel(W, H);
  ui.addChild(reel.view);
  /** 이번 뽑기 결과 (릴이 멈춘 뒤 지급) */
  let pullResult: SpecialDef | null = null;

  const RARITY_WEIGHT: Record<Rarity, number> = { R: 62, SR: 28, SSR: 10 };
  /** 이 횟수 안에 SSR 이 안 나오면 다음은 확정 — 없으면 계속 안 나오는 사람이 생긴다 */
  const PITY = 8;

  function rollRarity(): Rarity {
    if (pityCount >= PITY - 1) return 'SSR';
    let total = 0;
    for (const r of ['R', 'SR', 'SSR'] as Rarity[]) total += RARITY_WEIGHT[r];
    let x = Math.random() * total;
    for (const r of ['R', 'SR', 'SSR'] as Rarity[]) {
      x -= RARITY_WEIGHT[r];
      if (x <= 0) return r;
    }
    return 'R';
  }

  /** 코인이 찼으면 릴을 돌린다 */
  function tryPull(): void {
    if (phase !== 'play' || reel.active) return;
    if (pendingPulls <= 0 && coins >= COINS_PER_PULL) {
      coins -= COINS_PER_PULL;
      pendingPulls++;
    }
    if (pendingPulls <= 0) return;
    pendingPulls--;

    // 이미 최대까지 올린 무기는 후보에서 뺀다 — 다 찼으면 등급을 낮춰 찾는다
    const rarity = rollRarity();
    const avail = (r: Rarity): SpecialDef[] =>
      LEGENDS.filter((d) => d.rarity === r && (owned.get(d.id) ?? 0) < d.max);
    let pickPool = avail(rarity);
    if (!pickPool.length) {
      for (const r of ['SSR', 'SR', 'R'] as Rarity[]) {
        pickPool = avail(r);
        if (pickPool.length) break;
      }
    }
    if (!pickPool.length) {
      // 레전드를 전부 최대로 올렸다 — 그때는 체력으로 돌려준다
      maxHp += 40;
      hp = maxHp;
      sfx.pick();
      return;
    }

    const chosen = pickPool[Math.floor(Math.random() * pickPool.length)];
    pullResult = chosen;
    pityCount = chosen.rarity === 'SSR' ? 0 : pityCount + 1;

    // 릴에는 레전드 전체를 올리고 결과 위치만 지정한다 — 뭘 놓쳤는지가
    // 같이 보여야 다음 뽑기가 기대된다
    const items: ReelItem[] = LEGENDS.map((d) => ({
      name: d.name, color: d.color, rarity: d.rarity ?? 'R',
    }));
    reel.start(items, LEGENDS.indexOf(chosen), `가챠 · 남은 코인 ${coins}`);
    phase = 'gacha';
  }

  /** 릴이 끝나고 실제로 지급 */
  function grantPull(): void {
    const d = pullResult;
    pullResult = null;
    if (!d) return;
    owned.set(d.id, (owned.get(d.id) ?? 0) + 1);
    cooldowns.set(d.id, 0);
    if (d.id === 'rolling_shield') syncOrbs();
  }

  function levelUp(): void {
    level++;
    coins++;
    sfx.coin();
    xp -= xpNeed;
    // 2차식으로 올린다. 선형이면 킬 수가 초당 수십으로 불어나는 순간
    // 레벨이 초당 하나씩 올라 1분 만에 화력이 화면을 다 태워버린다.
    // 계수를 키워 후반 한 레벨이 10초 이상 걸리게 잡았다.
    xpNeed = Math.round(4 + level * 3 + level * level * 0.8);

    openPick();
  }

  /** 레벨업 카드 세 장을 뽑아 띄운다 */
  function openPick(): void {
    // 뽑기 후보 = 새 특수무기 + 보유 무기 강화 + 능력치.
    // 무기 쪽에 가중치를 크게 줘서 뽑기가 이 게임의 중심으로 읽히게 한다.
    const pool: { opt: PickOption; weight: number }[] = [];
    for (const def of SPECIALS) {
      const lv = owned.get(def.id) ?? 0;
      if (lv === 0) {
        if (owned.size < MAX_SPECIALS) pool.push({ opt: { kind: 'weapon', def, lv: 0 }, weight: 4 });
      } else if (lv < def.max) {
        pool.push({ opt: { kind: 'weapon', def, lv }, weight: 3 });
      }
    }
    for (const u of UPGRADES) {
      if (u.only && !u.only.includes(w.style)) continue;
      if ((taken[u.id] ?? 0) < u.max) pool.push({ opt: { kind: 'stat', up: u }, weight: 3 });
    }

    pickList = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      let total = 0;
      for (const p of pool) total += p.weight;
      let r = Math.random() * total;
      let idx = 0;
      for (let j = 0; j < pool.length; j++) {
        r -= pool[j].weight;
        if (r <= 0) { idx = j; break; }
      }
      pickList.push(pool.splice(idx, 1)[0].opt);
    }
    if (!pickList.length) return;
    pickIndex = 0;
    phase = 'pick';
    sfx.level();
  }

  /** 고른 캐릭터로 갈아끼운다 — 시트·색·기본 능력치가 전부 여기서 정해진다 */
  function setCharacter(def: HordeChar): void {
    charDef = def;
    if (hero) foeLayer.removeChild(hero);
    hero = new AnimView(charSheets.get(def.id)!);
    hero.play('idle');
    heroScale = def.sprite_scale ?? 1;
    hero.scale.set(heroScale, heroScale);
    foeLayer.addChild(hero);

    const si = SHOTS.get(def.id)!;
    shotColor = si.color;
    shotCore = lighten(shotColor, 0.55);
  }

  function startRun(): void {
    // 예전엔 캐릭터를 고르면 곧장 시작해서, 보스는 시간이 지나야
    // 무작위로 고르게 되는 중간 이벤트였다. 이제 보스(=스테이지)를
    // 먼저 정하고 그 스테이지 안에서 판이 벌어진다.
    setCharacter(CHAR_DEFS[selIndex]);
    openBossSelect();
  }

  function choosePick(): void {
    if (phase !== 'pick') return;
    const o = pickList[pickIndex];
    if (!o) return;
    sfx.pick();
    if (o.kind === 'stat') {
      taken[o.up.id] = (taken[o.up.id] ?? 0) + 1;
      o.up.apply();
    } else {
      owned.set(o.def.id, (owned.get(o.def.id) ?? 0) + 1);
      if (o.def.id === 'rolling_shield') syncOrbs();
      // 새로 얻은 무기는 바로 한 번 쏴준다 — 뽑은 게 뭔지 즉시 보여야 한다
      if (o.lv === 0) cooldowns.set(o.def.id, 0);
    }
    phase = 'play';
  }

  /** 이번 판이 이 캐릭터 최고 기록이면 남긴다 */
  function recordBest(): void {
    const prev = best[charDef.id];
    if (!prev || time > prev.t) {
      best[charDef.id] = { t: Math.floor(time), kills };
      saveBest(best);
      newRecord = true;
    }
  }

  /** 아머 효과를 능력치에 반영한다. 먹은 즉시와 판 시작에 부른다. */
  function applyArmor(): void {
    // 곱해서 쌓지 않도록 기준값에서 다시 계산한다
    speedMul = (armor.has('foot') ? 1.18 : 1) * legsMul;
    w.magnet = baseMagnet * (armor.has('head') ? 2.2 : 1);
  }

  function reset(): void {
    for (let i = foes.length - 1; i >= 0; i--) {
      foeLayer.removeChild(foes[i].view);
      foes[i].view.visible = false;
      let pool = pools.get(foes[i].kind);
      if (!pool) pools.set(foes[i].kind, (pool = []));
      pool.push(foes[i].view);
    }
    foes.length = 0;
    bullets.length = 0;
    gems.length = 0;
    parts.length = 0;
    rings.length = 0;
    bolts.length = 0;
    arcs.length = 0;
    hostiles.length = 0;
    heals.length = 0;
    if (boss) { foeLayer.removeChild(boss.view); boss = null; }
    bossAt = 70;
    bossBanner = 0;
    bossKills = 0;
    newRecord = false;
    coins = 2;
    pityCount = 0;
    eTanks = 0;
    rideT = 0; ridePunch = 0; ridePods.length = 0; rideAt = 55;
    armor.clear();
    legsMul = 1; baseMagnet = 40;
    capsules.length = 0;
    capsuleAt = 26;
    pendingPulls = 0;
    paused = false;
    owned.clear();
    cooldowns.clear();
    orbs.length = 0;
    bladeSpin = 0;
    comboStep = 0;
    px = ARENA_W / 2; py = ARENA_H / 2;
    // 캐릭터마다 체력과 탄이 다르다. 검증해 둔 곡선에서 크게 벗어나지 않도록
    // 원본 수치를 그대로 쓰지 않고 좁은 폭으로만 반영한다.
    // 1.2 → 1.3. 아홉 전원에게 균일하게 걸리는 값이라 캐릭터 간 격차는
    // 안 건드리면서 전반적인 생존 여유만 넓힌다.
    maxHp = Math.round(charDef.base_stats.hp * 1.3);
    hp = maxHp;
    iframe = 0;
    dashTimer = 0; dashCd = 0;
    attackHold = 0; attackBeat = 0;
    time = 0; kills = 0; level = 1; xp = 0; xpNeed = 4;
    spawnAcc = 0; fireAcc = 0; surgeAt = 32; shake = 0; hitstop = 0;
    echoes.length = 0;
    stageBanner = 0;
    stageBossSpawned = false;
    pendingStageClear = false;
    clearTimer = 0;
    // 배경은 고른 스테이지의 속성으로 정한다. 재도전(reset 만 다시 호출되는
    // 경로)에도 stageBoss 는 그대로 남아 있으니 같은 배경으로 다시 들어간다.
    useTheme(stageBoss ? THEME_FOR_ELEM[stageBoss.elem] : 0);
    speedMul = 1;
    w.interval = 0.16; w.shots = 1; w.spread = 0.06;
    const si = SHOTS.get(charDef.id)!;
    w.style = styleOf(charDef);
    w.elem = si.elem;
    w.speed = Math.round(si.speed * 1.25);
    w.drones = 0; w.magnet = 40;
    legsMul = 1; baseMagnet = 40; armorBanner = 0; armorGot = null;
    w.arcR = 50; w.arcSpan = Math.PI * 1.1;
    const sig: Sig = SIG[charDef.id] ?? { charge: 'drive' };
    shotLook = sig.shot ?? 'nail';
    saberLook = sig.saber ?? 'fan';
    chargeLook = sig.charge;
    shotHoming = sig.homing ?? 0;
    shotKnock = sig.knock ?? 1;

    // 초당 위력은 세 방식이 비슷하게 두고, 그 위력을 어떻게 꺼내느냐만
    // 다르게 한다 — 한 방이 큰가, 자잘하게 많은가, 붙어서 쓸어내는가.
    if (w.style === 'rapid') {
      // 액셀의 듀얼 피스톨 — 데이터에도 count 2 다. 두 발씩 흩뿌린다.
      w.interval = 0.075;
      w.dmg = Math.max(2, Math.round(si.power * 0.7));
      w.shots = 2; w.spread = 0.16; w.pierce = 0;
      w.baseDmg = w.dmg;
    } else if (w.style === 'saber') {
      // 너무 좁고 약해서 근접이 이 장르에서 성립을 안 했다 — 반경 42→60,
      // 부채꼴 153°→194°(반원보다 넓게), 위력도 한 단 더 올렸다.
      w.interval = 0.42;
      w.dmg = 12 + Math.round(si.power * 0.75);
      w.shots = 1; w.spread = 0; w.pierce = 0;
      // 넓이를 맞춰 둔 값이라 셋 다 초당 위력이 같다 — SIG 주석 참고
      w.arcR = sig.arcR ?? 60;
      w.arcSpan = sig.arcSpan ?? Math.PI * 1.08;
      w.baseDmg = w.dmg;
    } else {
      w.interval = 0.3;
      w.dmg = 9 + Math.round(si.power * 0.9);
      w.shots = 1; w.spread = 0.06; w.pierce = 3;
      w.baseDmg = w.dmg;
    }

    // 서명은 방식 기본값 '뒤에' 곱한다. 앞에 두면 방식 분기가 덮어써서
    // 아무 일도 안 일어난다.
    w.dmg = Math.max(1, Math.round(w.dmg * (sig.dmgMul ?? 1)));
    w.baseDmg = w.dmg;
    w.interval *= sig.intervalMul ?? 1;
    w.speed = Math.round(w.speed * (sig.speedMul ?? 1));
    w.spread *= sig.spreadMul ?? 1;
    if (sig.shots !== undefined) w.shots = sig.shots;
    if (sig.pierce !== undefined) w.pierce = sig.pierce;
    shotLife = 0.5 * (sig.rangeMul ?? 1);

    applyArmor();
    for (const k of Object.keys(taken)) delete taken[k];
    phase = 'play';
    deadTimer = 0;
  }

  // ------------------------------------------------------------ 캐릭터 선택
  const selLayer = new Container();
  ui.addChild(selLayer);
  const selG = new Graphics();
  selLayer.addChild(selG);
  // 세로 화면이라 9명을 한 줄로 못 세운다 — 3×3 격자로 놓는다
  const SEL_COLS = 3;
  const CELL_W = Math.floor(W / SEL_COLS);
  const CELL_H = 108;
  const SEL_TOP = 62;
  const selViews: AnimView[] = [];
  const selNames: Text[] = [];
  const selRects: { x: number; y: number; w: number; h: number }[] = [];

  for (let i = 0; i < CHAR_DEFS.length; i++) {
    const def = CHAR_DEFS[i];
    const col = i % SEL_COLS;
    const row = Math.floor(i / SEL_COLS);
    const cx = col * CELL_W + CELL_W / 2;
    const cyTop = SEL_TOP + row * CELL_H;
    const foot = cyTop + CELL_H - 26;

    const v = new AnimView(charSheets.get(def.id)!);
    v.play('idle');
    const s = def.sprite_scale ?? 1;
    v.scale.set(s, s);
    v.position.set(cx, foot);
    selLayer.addChild(v);
    selViews.push(v);

    const n = new Text({ text: SHORT_NAMES.get(def.id) ?? def.name, style: { ...mono, fontSize: 9, fill: 0x9fb0dd } });
    n.anchor.set(0.5, 0);
    n.position.set(cx, foot + 4);
    selLayer.addChild(n);
    selNames.push(n);

    selRects.push({ x: col * CELL_W, y: cyTop, w: CELL_W, h: CELL_H - 4 });
  }

  const selTitle = new Text({ text: '캐릭터 선택', style: { ...mono, fontSize: 14, fill: 0xffffff } });
  selTitle.anchor.set(0.5);
  selTitle.position.set(W / 2, 28);
  const selHint = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0x8a97c4 } });
  selHint.anchor.set(0.5);
  selHint.position.set(W / 2, H - 42);
  selHint.style.align = 'center';
  selLayer.addChild(selTitle, selHint);

  function drawSelect(dtMs: number): void {
    selG.clear();
    selG.rect(0, 0, W, H).fill({ color: 0x070a16 });
    for (let gx = 0; gx < W; gx += 18) selG.rect(gx, 0, 1, H).fill({ color: 0x101833, alpha: 0.6 });
    for (let gy = SEL_TOP - 8; gy < H; gy += 18) selG.rect(0, gy, W, 1).fill({ color: 0x101833, alpha: 0.6 });
    for (let i = 0; i < selRects.length; i++) {
      const r = selRects[i];
      const on = i === selIndex;
      drawPanel(selG, r.x + 2, r.y, r.w - 4, r.h, {
        fill: on ? 0x1e3266 : 0x0e1428,
        accent: 0x8ef0ff,
        active: on,
      });
      selViews[i].update(dtMs);
      selViews[i].alpha = on ? 1 : 0.5;
      selNames[i].style.fill = on ? 0xffffff : 0x7d8cb8;
    }
    selG.rect(W / 2 - 60, 40, 120, 2).fill({ color: 0x8ef0ff, alpha: 0.7 });
    const d = CHAR_DEFS[selIndex];
    const st = styleOf(d);
    const rec = best[d.id];
    // 전투 방식 설명은 버스터 넷이 전부 같은 문장이라, 그것만으로는
    // 누굴 고르든 똑같아 보인다. 캐릭터별 한 줄을 위에 얹는다.
    selHint.text =
      `${d.name} — ${STYLE_NAME[st]}\n` +
      (d.desc ? `${d.desc}\n` : '') +
      `${STYLE_DESC[st]}\n` +
      (rec ? `최고 ${rec.t}초 · ${rec.kills}킬   ` : '') +
      (touchMode ? '▸ 다시 눌러서 시작' : '▸ 눌러서 시작');
  }

  // ------------------------------------------------------------ 보스 선택
  // 60여 초마다 다음 상대가 무작위로 튀어나오면 "이 무기를 얻어서 저
  // 보스를 잡아야지" 라는 계획 자체가 성립을 안 한다. 상성표를 보고
  // 직접 순서를 짜는 게 록맨 시리즈의 정체성이라, 여기서 고르게 한다.
  const bossSelLayer = new Container();
  // Container 는 기본이 visible=true 라, 'select' 단계(맨 처음 캐릭터
  // 화면)는 아래에서 이 레이어를 끄는 코드까지 가지 않고 먼저 return
  // 해버린다 — 켜둔 채로 시작해서 캐릭터 선택 화면과 겹쳐 보였다.
  bossSelLayer.visible = false;
  ui.addChild(bossSelLayer);
  const bossSelG = new Graphics();
  bossSelLayer.addChild(bossSelG);
  const BOSS_SEL_COLS = 2;
  const BOSS_CELL_W = Math.floor(W / BOSS_SEL_COLS);
  const BOSS_CELL_H = 96;
  const BOSS_SEL_TOP = 54;
  const bossSelViews: AnimView[] = [];
  const bossSelNames: Text[] = [];
  const bossSelWeak: Text[] = [];
  const bossSelRects: { x: number; y: number; w: number; h: number }[] = [];

  for (const def of BOSS_DEFS) {
    const v = new AnimView(bossSheets.get(def.id)!);
    v.visible = false;
    bossSelLayer.addChild(v);
    bossSelViews.push(v);

    const n = new Text({ text: '', style: { ...mono, fontSize: 9, fill: 0x9fb0dd } });
    n.anchor.set(0.5, 0);
    bossSelLayer.addChild(n);
    bossSelNames.push(n);

    const wk = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0x8a97c4 } });
    wk.anchor.set(0.5, 0);
    bossSelLayer.addChild(wk);
    bossSelWeak.push(wk);
  }

  const bossSelTitle = new Text({ text: '스테이지 선택', style: { ...mono, fontSize: 13, fill: 0xffffff } });
  bossSelTitle.anchor.set(0.5);
  bossSelTitle.position.set(W / 2, 26);
  const bossSelHint = new Text({ text: '', style: { ...mono, fontSize: 8, fill: 0x8a97c4 } });
  bossSelHint.anchor.set(0.5);
  bossSelHint.position.set(W / 2, H - 22);
  bossSelLayer.addChild(bossSelTitle, bossSelHint);

  /** 아직 무기를 안 받은 보스만 후보다 — 다 모으면 처음부터 다시 돈다 */
  let bossPickList: BossDef[] = [];
  let bossSelIndex = 0;

  function openBossSelect(): void {
    // 예전엔 '이미 이번 판에서 잡은 보스'만 걸렀다(owned 는 판마다
    // 비워지는 판 내부 상태). 이제는 판을 시작하기 '전' 화면이라 owned 로
    // 거를 게 없다 — 여덟 스테이지를 늘 전부 보여주고, 대신 예전에 한
    // 번이라도 깬 적 있는 스테이지는 clearedStages 로 표시만 해 준다.
    bossPickList = BOSS_DEFS.slice();
    bossSelIndex = 0;
    phase = 'boss_select';
  }

  function drawBossSelect(dtMs: number): void {
    bossSelG.clear();
    bossSelG.rect(0, 0, W, H).fill({ color: 0x070a16 });
    // 얇은 격자 — 배경이 완전히 비어 있으면 하드웨어 화면이 아니라
    // 그냥 검은 종이로 보인다
    for (let gx = 0; gx < W; gx += 18) bossSelG.rect(gx, 0, 1, H).fill({ color: 0x101833, alpha: 0.6 });
    for (let gy = BOSS_SEL_TOP - 8; gy < H; gy += 18) bossSelG.rect(0, gy, W, 1).fill({ color: 0x101833, alpha: 0.6 });

    const pulse = 0.6 + Math.sin(animClock * 5) * 0.4;
    bossSelRects.length = 0;
    for (let i = 0; i < bossPickList.length; i++) {
      const def = bossPickList[i];
      const col = i % BOSS_SEL_COLS;
      const row = Math.floor(i / BOSS_SEL_COLS);
      const cx = col * BOSS_CELL_W + BOSS_CELL_W / 2;
      const cyTop = BOSS_SEL_TOP + row * BOSS_CELL_H;
      const on = i === bossSelIndex;
      const accent = def.elem === 'none' ? 0x8ef0ff : ELEM_COLOR[def.elem];
      const cellX = col * BOSS_CELL_W + 4;
      const cellY = cyTop;
      const cellW = BOSS_CELL_W - 8;
      const cellH = BOSS_CELL_H - 6;

      drawPanel(bossSelG, cellX, cellY, cellW, cellH, {
        fill: on ? 0x1a2a52 : 0x0e1428,
        accent,
        active: on,
      });
      bossSelRects.push({ x: col * BOSS_CELL_W, y: cyTop, w: BOSS_CELL_W, h: cellH });

      // 초상화 뒤에 원소색 그림자 — 선택된 칸은 숨쉬듯 밝기가 오간다
      const spriteY = cyTop + BOSS_CELL_H - 34;
      bossSelG.circle(cx, spriteY - 6, on ? 20 + pulse * 3 : 16)
        .fill({ color: accent, alpha: on ? 0.28 * pulse + 0.12 : 0.1 });

      const v = bossSelViews[i];
      v.visible = true;
      v.play('move');
      v.scale.set(1.05, 1.05);
      v.position.set(cx, spriteY);
      v.alpha = on ? 1 : 0.6;
      v.update(dtMs);

      // 클리어한 스테이지는 다시 도전을 막지 않되, 한 번 깼다는 건
      // 표시해 준다 — 안 그러면 여덟 칸이 매번 똑같아 보여서 진행감이 없다
      const cleared = clearedStages.has(def.id);
      bossSelNames[i].text = (ENEMY_NAMES[def.id] ?? def.id) + (cleared ? '  ✓' : '');
      bossSelNames[i].position.set(cx, cyTop + BOSS_CELL_H - 29);
      bossSelNames[i].style.fill = on ? 0xffffff : cleared ? 0xa8d8b0 : 0x7d8cb8;

      const counter = (Object.keys(BEATS) as Element[]).find((e) => e !== 'none' && BEATS[e] === def.elem);
      bossSelWeak[i].text = def.elem === 'none' ? '무속성' : `[${ELEM_NAME[def.elem]}] 약점 ${counter ? ELEM_NAME[counter] : '-'}`;
      bossSelWeak[i].position.set(cx, cyTop + BOSS_CELL_H - 16);
      bossSelWeak[i].style.fill = def.elem === 'none' ? 0x8a97c4 : ELEM_COLOR[def.elem];
    }
    for (let i = bossPickList.length; i < BOSS_DEFS.length; i++) bossSelViews[i].visible = false;

    // 제목 밑줄 — 텍스트 하나만 둥 떠 있으면 화면 헤더로 안 읽힌다
    bossSelG.rect(W / 2 - 60, 40, 120, 2).fill({ color: 0x8ef0ff, alpha: 0.7 });

    const picked = bossPickList[bossSelIndex];
    bossSelHint.text = picked
      ? `${ENEMY_NAMES[picked.id] ?? picked.id} ▸ ${touchMode ? '다시 눌러서' : '눌러서'} 출발`
      : '';
  }

  /**
   * 스테이지를 고른다 — 그 보스가 이번 판의 목표가 된다.
   *
   * 예전엔 여기서 곧장 보스를 등장시켰다(판 도중에 뽑는 중간 이벤트였으니
   * 등장 연출만 있으면 됐다). 이제는 판을 처음부터 다시 시작해야 하므로
   * reset() 을 부른다 — 그 안에서 stageBoss 를 보고 배경 테마를 정하고,
   * 실제 등장은 farm 시간(bossAt)이 지난 뒤 메인 루프에서 한 번만 한다.
   */
  function chooseBoss(): void {
    if (phase !== 'boss_select') return;
    const def = bossPickList[bossSelIndex];
    if (!def) return;
    stageBoss = def;
    reset();
    stageBanner = 2.4;
    sfx.stage();
  }

  // 튜닝용 훅 — 매 프레임 다시 만들면 쓸데없는 할당이 된다. 한 번만 붙인다.
  {
    const dbg = window as unknown as Record<string, unknown>;
    dbg.__hordeNextStage = (): void => { useTheme(themeIndex + 1); stageBanner = 2.2; };
    // id 를 주면 그 보스를 강제로 등장시킨다 — 70초 농사 시간을 기다리지
    // 않고 "보스 등장 → 처치 → 클리어" 파이프라인을 바로 검증하는 용도
    dbg.__hordeSpawnBoss = (id?: string): void => {
      void spawnBoss(id ? BOSS_DEFS.find((d) => d.id === id) : undefined);
    };
    dbg.__hordeOpenBossSelect = (): void => { openBossSelect(); };
    dbg.__hordeChooseBoss = (id: string): void => {
      const i = bossPickList.findIndex((d) => d.id === id);
      if (i >= 0) { bossSelIndex = i; chooseBoss(); }
    };
    dbg.__hordeStageBoss = (): string | null => stageBoss?.id ?? null;
    dbg.__hordeClearedStages = (): string[] => [...clearedStages];
    dbg.__hordeSpawnFoe = (elite = false): void => { spawnFoe(elite); };
    dbg.__hordeKillBoss = (): void => { if (boss) { boss.hp = 0; killBoss(); } };
    dbg.__hordeRide = (): void => { ridePods.push({ x: px + 20, y: py, bob: 0 }); };
    dbg.__hordeCapsule = (): void => {
      const left = (['head', 'body', 'arm', 'foot'] as ArmorSlot[]).filter((k) => !armor.has(k));
      if (left.length) capsules.push({ x: px + 20, y: py, slot: left[0], bob: 0 });
    };
    dbg.__hordeGiveCoins = (n: number): void => { coins += n; };
    dbg.__hordeSetHp = (v: number): void => { hp = v; };
    dbg.__hordeForceLevelUp = (): void => { levelUp(); };
    dbg.__hordeForcePull = (id: string): void => {
      const d = LEGENDS.find((x) => x.id === id);
      if (!d || phase !== 'play' || reel.active) return;
      pullResult = d;
      reel.start(
        LEGENDS.map((x) => ({ name: x.name, color: x.color, rarity: x.rarity ?? 'R' })),
        LEGENDS.indexOf(d),
        '가챠 · 남은 코인 ' + coins,
      );
      phase = 'gacha';
    };
    dbg.__hordeFireLegend = (id: string, lv = 1): void => { LEGENDS.find((x) => x.id === id)?.fire?.(lv); };
  }

  // ------------------------------------------------------------ 루프
  app.ticker.add(() => {
    const dt = Math.min(app.ticker.deltaMS / 1000, 1 / 30);

    if (phase === 'select') {
      if (input.pressed('left')) selIndex = (selIndex + CHAR_DEFS.length - 1) % CHAR_DEFS.length;
      if (input.pressed('right')) selIndex = (selIndex + 1) % CHAR_DEFS.length;
      if (input.pressed('up')) selIndex = (selIndex + CHAR_DEFS.length - SEL_COLS) % CHAR_DEFS.length;
      if (input.pressed('down')) selIndex = (selIndex + SEL_COLS) % CHAR_DEFS.length;
      if (input.pressed('jump') || input.pressed('shoot') || input.pressed('dash')) startRun();
      selLayer.visible = phase === 'select';
      if (selLayer.visible) drawSelect(app.ticker.deltaMS);
      input.endFrame();
      return;
    }
    if (phase === 'boss_select') {
      if (input.pressed('left')) bossSelIndex = (bossSelIndex + bossPickList.length - 1) % bossPickList.length;
      if (input.pressed('right')) bossSelIndex = (bossSelIndex + 1) % bossPickList.length;
      if (input.pressed('up')) bossSelIndex = (bossSelIndex + bossPickList.length - BOSS_SEL_COLS) % bossPickList.length;
      if (input.pressed('down')) bossSelIndex = (bossSelIndex + BOSS_SEL_COLS) % bossPickList.length;
      if (input.pressed('jump') || input.pressed('shoot') || input.pressed('dash')) chooseBoss();
      bossSelLayer.visible = true;
      drawBossSelect(app.ticker.deltaMS);
      draw(dt);
      input.endFrame();
      return;
    }
    bossSelLayer.visible = false;
    selLayer.visible = false;
    // 캐릭터를 고르기 전에는 아래 로직이 돌 일이 없다
    const hv = hero;
    if (!hv) { input.endFrame(); return; }

    if (phase === 'gacha') {
      reel.update(dt);
      if (reel.ticked) sfx.reelTick(reel.near);
      if (reel.shake > 0) shake = Math.max(shake, reel.shake);
      if (reel.justBurst) sfx.reveal(reel.result?.rarity ?? 'R');
      if (input.pressed('jump') || input.pressed('shoot') || input.pressed('dash') || gachaTap) {
        gachaTap = false;
        if (reel.canDismiss) {
          // 방금 받은 게 스테이지 보스의 무기였다면 농사를 계속하는 대신
          // 클리어 화면으로 간다 — grantPull() 이 pullResult 를 비우니
          // 이름은 그 전에 챙겨 둔다.
          const wasStageClear = pendingStageClear;
          const weaponName = pullResult?.name ?? null;
          grantPull();
          reel.dismiss();
          if (wasStageClear) {
            pendingStageClear = false;
            lastClearWeaponName = weaponName;
            if (stageBoss) markStageCleared(stageBoss.id);
            clearTimer = 0;
            phase = 'stage_clear';
          } else {
            phase = 'play';
            // 코인이 더 있으면 연달아 돌린다
            tryPull();
          }
        } else {
          reel.skip();
        }
      }
      gachaTap = false;
      draw(dt);
      input.endFrame();
      return;
    }

    if (phase === 'pick') {
      if (input.pressed('left')) pickIndex = (pickIndex + pickList.length - 1) % pickList.length;
      if (input.pressed('right')) pickIndex = (pickIndex + 1) % pickList.length;
      if (input.pressed('jump') || input.pressed('shoot') || input.pressed('dash')) choosePick();
      drawPick();
      draw(dt);
      input.endFrame();
      return;
    }

    if (phase === 'dead') {
      deadTimer += dt;
      if (deadTimer > 0.5) {
        if (input.pressed('menu') || input.pressed('weapon')) phase = 'select';
        else if (input.pressed('jump') || input.pressed('shoot') || input.pressed('dash')) reset();
      }
      draw(dt);
      input.endFrame();
      return;
    }

    if (phase === 'stage_clear') {
      clearTimer += dt;
      if (clearTimer > 0.5) {
        if (input.pressed('menu') || input.pressed('weapon')) phase = 'select';
        else if (input.pressed('jump') || input.pressed('shoot') || input.pressed('dash')) openBossSelect();
      }
      draw(dt);
      input.endFrame();
      return;
    }

    if (paused) {
      if (input.pressed('menu') || input.pressed('jump') || input.pressed('shoot')) paused = false;
      draw(dt);
      input.endFrame();
      return;
    }

    if (hitstop > 0) {
      hitstop -= dt;
      draw(dt);
      input.endFrame();
      return;
    }

    // 보스 문 연출 — 이름이 뜨고 체력바가 칸칸이 차는 동안은 세계가
    // 멈춘다. 그동안 적이 움직이거나 보스가 먼저 때리면 "준비할 시간"이
    // 사라진다.
    if (bossIntroT > 0) {
      bossIntroT -= dt;
      const elapsed = BOSS_INTRO_DUR - Math.max(0, bossIntroT);
      if (elapsed > BOSS_INTRO_FILL_START) {
        const span = BOSS_INTRO_FILL_END - BOSS_INTRO_FILL_START;
        const want = Math.min(
          BOSS_INTRO_TICKS,
          Math.floor(((elapsed - BOSS_INTRO_FILL_START) / span) * BOSS_INTRO_TICKS),
        );
        if (want > bossIntroTicks) {
          bossIntroTicks = want;
          sfx.reelTick(bossIntroTicks / BOSS_INTRO_TICKS);
        }
      }
      draw(dt);
      input.endFrame();
      return;
    }

    time += dt;
    droneAngle += dt * 2.4;
    // 펫은 옵션 유닛보다 느긋하게 돈다 — 같은 속도면 둘이 구분이 안 된다
    petAngle += dt * 1.15;
    if (rushLeapT > 0) rushLeapT -= dt;
    for (const [k, v] of petFlash) {
      if (v <= dt) petFlash.delete(k);
      else petFlash.set(k, v - dt);
    }
    if (stageBanner > 0) stageBanner -= dt;

    // ---- 이동
    let ix = input.axisX;
    let iy = (input.down('down') ? 1 : 0) - (input.down('up') ? 1 : 0);
    if (stick) {
      const sdx = stick.x - stick.ox;
      const sdy = stick.y - stick.oy;
      if (Math.hypot(sdx, sdy) > STICK.dead) { ix = sdx; iy = sdy; }
    }
    const len = Math.hypot(ix, iy);
    if (len > 0) { ix /= len; iy /= len; }

    // 몸은 쏘는 쪽을 본다 — 이동 방향을 따르면 등에서 탄이 나가는 그림이 된다.
    //
    // 대신 그러면 어디로 가는지가 안 읽힌다. 그건 몸 방향으로 풀지 않고
    // 따로 표시한다: 진행 방향 반대쪽으로 발밑 먼지를 뿌리고, 바닥에 방향
    // 화살표를 깐다. 몸은 조준, 발밑은 이동 — 둘이 안 싸운다.
    const aim = nearestFoe(px, py);
    if (aim) facing = aim.x >= px ? 1 : -1;
    else if (ix !== 0) facing = ix > 0 ? 1 : -1;
    // 세이버 사거리 표시용 — shoot() 이 실제로 계산하는 조준각과 같은
    // 식으로 매 프레임 갱신해 둔다. 겨눌 적이 없으면 바라보는 쪽으로 둔다.
    aimAngle = aim
      ? Math.atan2((aim.y - 8) - (py - 10), aim.x - px)
      : facing > 0 ? 0 : Math.PI;

    moveDirX = ix;
    moveDirY = iy;
    if (len > 0) {
      dustAcc -= dt;
      if (dustAcc <= 0) {
        dustAcc = 0.045;
        parts.push({
          x: px - ix * 7, y: py - 1 - iy * 5,
          vx: -ix * 34 + (Math.random() - 0.5) * 14,
          vy: -iy * 26 + (Math.random() - 0.5) * 10,
          life: 0.3, max: 0.3, color: 0x8ef0ff, size: 2,
        });
      }
    }

    // 차지 — 누르고 있으면 모이고, 떼면 나간다
    const holdFire = input.down('shoot') || touchFire;
    if (holdFire) {
      const before = chargeLevel;
      chargeT += dt * (armor.has('arm') ? 2 : 1);
      chargeLevel = chargeT >= CHARGE_STEP[1] ? 2 : chargeT >= CHARGE_STEP[0] ? 1 : 0;
      if (chargeLevel !== before && chargeLevel > 0) {
        sfx.pick();
        spawnPart(px, py - 10, 6, chargeLevel === 2 ? 0xfff2c0 : 0x9fe8ff, 130);
      }
    } else {
      if (chargeLevel > 0) releaseCharge(chargeLevel);
      chargeT = 0;
      chargeLevel = 0;
    }

    if (input.pressed('weapon')) sfx.toggleMute();
    if (input.pressed('menu')) paused = !paused;

    const wantDash = input.pressed('dash') || touchDash;
    touchDash = false;
    dashCd -= dt;
    if (dashTimer > 0) dashTimer -= dt;
    else if (wantDash && dashCd <= 0) {
      dashTimer = DASH_TIME;
      dashCd = DASH_CD;
      dashDx = len > 0 ? ix : facing;
      dashDy = len > 0 ? iy : 0;
      iframe = Math.max(iframe, DASH_TIME + 0.08);
      spawnPart(px, py - 10, 8, 0x8ef0ff, 90);
      sfx.dash();
      const ck = owned.get('charge_kick') ?? 0;
      if (ck) kickTrail.push({ x: px, y: py - 8, life: 2.2, r: 20, dmg: 14 + 9 * ck });
      const pe = owned.get('edge_cut') ?? 0;
      if (pe) {
        // 대시 방향으로 참격이 날아간다 — 차지 킥이 자리에 남는 것과 반대다
        const n = 1 + pe;
        const base = Math.atan2(dashDy * 0.78, dashDx);
        for (let i = 0; i < n; i++) {
          addBullet({
            x: px, y: py - 10,
            vx: Math.cos(base + (i - (n - 1) / 2) * 0.26) * 400,
            vy: Math.sin(base + (i - (n - 1) / 2) * 0.26) * 400 * 0.8,
            life: 0.7, dmg: 24 + 14 * pe, pierce: 4,
            shape: 'blade', color: 0xff5c9c, r: 9, spin: 26,
          });
        }
      }
    }

    if (dashTimer > 0) {
      px += dashDx * DASH_SPEED * dt;
      py += dashDy * DASH_SPEED * 0.78 * dt;
    } else {
      px += ix * BASE_SPEED * speedMul * dt;
      py += iy * BASE_SPEED * speedMul * 0.78 * dt;
    }
    px = clamp(px, 10, ARENA_W - 10);
    py = clamp(py, 20, ARENA_H - 8);

    // 사격 모션. 시트마다 가진 태그가 달라 (임시 도트는 run_attack 이 없다)
    // play() 의 fallback 으로 흘려보낸다.
    if (attackHold > 0) attackHold -= dt;
    attackBeat -= dt;
    const firing = attackHold > 0;
    const moving = len > 0;
    const idleTag = dashTimer > 0 ? 'dash' : moving ? 'run' : 'idle';
    let wantTag = idleTag;
    swingGap -= dt;
    // 콤보 태그가 있는 시트(제로)는 지금 몇 단째인지에 따라 태그가 달라진다
    const comboTag = (): string => {
      const t = comboStep === 0 ? 'attack_main' : `attack_main${comboStep + 1}`;
      return hv.has(t) ? t : 'attack_main';
    };
    if (holdFire && chargeT > 0 && hv.has('charge_loop')) {
      // 차지 중엔 무기 종류와 무관하게 이 자세가 최우선이다. 총류는
      // 원래 자동사격마다 스윙 자세가 없으니 더더욱, 세이버도 차지
      // 중엔 매 자동공격마다 휘두르는 게 아니라 웅크려 모으는 그림이어야
      // 한다.
      wantTag = 'charge_loop';
    } else if (firing) {
      const moveTag = dashTimer > 0 ? 'dash_attack' : 'run_attack';
      if (w.style !== 'saber') {
        // 총류(charge/rapid)는 자동사격 간격(빠르면 초당 여러 번)마다
        // 스윙 자세로 갈아탔더니 다리가 멈추거나 뚝뚝 끊겨 보였다 — 총은
        // 실제로 휘두르는 무기가 아니라 총구 섬광과 탄만으로 충분하다.
        // 팔을 크게 써야 하는 건 근접무기(세이버)뿐이다.
        wantTag = idleTag;
      } else if (!(dashTimer > 0 || moving)) {
        wantTag = comboTag();
      } else if (hv.has(moveTag)) {
        // 이동 전용 공격 태그가 있으면(엑스) 그대로 쓴다 — 걷기와 사격이
        // 한 태그에 들어 있어 고민할 게 없다.
        wantTag = moveTag;
      } else if (hv.has('attack_main')) {
        // 없으면(제로) 걷기와 휘두르기를 번갈아 쓴다. 계속 휘두르게 두면
        // 다리가 한 번도 안 움직여서 미끄러지듯 떠다니는 그림이 된다.
        const swinging = hv.current.startsWith('attack_main') && !hv.finished;
        wantTag = swinging || swingGap <= 0 ? comboTag() : idleTag;
      } else {
        wantTag = idleTag;
      }
    }
    // 콤보 중간 단(attack_main2/3)이 재생 중이면 끊지 않는다 — 매 프레임
    // attack_main 으로 되돌리면 2단 이후가 첫 프레임에서 잘려 안 보인다.
    const inCombo = hv.current.startsWith('attack_main') && !hv.finished;
    if (!(firing && wantTag === 'attack_main' && inCombo)) hv.play(wantTag, idleTag);
    // 공격 태그는 한 번 재생하고 끝나는 것들이라 계속 쏘는 동안에는 다시
    // 틀어줘야 이어져 보인다. 발사 간격(후반 0.027초)에 맞추면 첫 프레임에서
    // 부들거리기만 하므로, 한 번 끝까지 재생된 뒤에만 다시 튼다.
    if (firing && hv.finished && attackBeat <= 0 && wantTag !== idleTag) {
      attackBeat = 0.05;
      // 제로처럼 콤보 태그를 가진 시트는 돌려가며 틀어 같은 동작만
      // 반복되지 않게 한다.
      if (hv.current.startsWith('attack_main')) {
        comboStep = (comboStep + 1) % 3;
        if (moving && !hv.has('run_attack')) {
          // 한 번 휘두르고 나면 걷기를 보여준 뒤 다음 단을 낸다.
          // 여기서 바로 다음 스윙을 틀면 다리가 한 번도 안 움직인다.
          swingGap = 0.3;
          hv.play(idleTag, idleTag);
        } else {
          hv.play(comboTag(), 'attack_main');
        }
      } else {
        hv.restart();
      }
    }
    hv.scale.x = facing * heroScale;
    hv.scale.y = heroScale;
    hv.update(app.ticker.deltaMS);
    hv.position.set(Math.round(px), Math.round(py));
    hv.alpha = iframe > 0 && Math.floor(iframe * 24) % 2 === 0 ? 0.4 : 1;
    // 세이버 차지 돌진 — 회전베기라는 걸 알아보게 몸이 통째로 돈다
    hv.rotation = lungeMoveT > 0
      ? (1 - lungeMoveT / LUNGE_MOVE_DUR) * Math.PI * 2 * 2.5 * facing
      : 0;

    // ---- 스폰
    const rate = Math.min(55, 1.6 + time * 0.3);
    spawnAcc += rate * dt;
    while (spawnAcc >= 1) { spawnAcc -= 1; spawnFoe(false); }

    // 스테이지의 보스는 미리 골라 뒀다(stageBoss) — 여기서는 농사 시간이
    // 끝나면 그 보스 '하나'를 등장시키는 게 전부다. 예전처럼 시간이 지날
    // 때마다 새로 고르지 않는다 — 고르는 건 스테이지 선택 화면에서 이미
    // 끝났고, 여기서 또 고르면 스테이지가 도중에 다른 보스로 바뀌는
    // 꼴이 된다.
    if (!stageBossSpawned && !boss && stageBoss && time >= bossAt) {
      stageBossSpawned = true;
      bossIntroT = BOSS_INTRO_DUR;
      bossIntroTicks = 0;
      void spawnBoss(stageBoss, false);
    }
    if (bossBanner > 0) bossBanner -= dt;
    updateBoss(dt);

    if (time >= surgeAt) {
      surgeAt += 24;
      const elites = 1 + Math.floor(time / 50);
      for (let i = 0; i < elites; i++) spawnFoe(true);
      for (let i = 0; i < 10 + Math.floor(time / 4); i++) spawnFoe(false);
      shake = 7;
    }

    // ---- 자동사격
    // 연사 차지가 터지는 동안은 간격이 무너진다
    if (burstT > 0) burstT -= dt;
    if (slashLungeT > 0) slashLungeT -= dt;
    if (chargeBeamT > 0) chargeBeamT -= dt;
    const itv = burstT > 0 ? w.interval * 0.32 : w.interval;
    fireAcc += dt;
    let guard = 0;
    while (fireAcc >= itv && guard++ < 12) {
      fireAcc -= itv;
      shoot();
    }
    fireSpecials(dt);
    updateLegends(dt);
    tryPull();

    // --- 아머 캡슐 — 일정 시간마다 화면 밖 어딘가에 놓인다.
    // 가만히 있으면 절대 못 먹는 자리에 둬야 "찾으러 간다"가 생긴다.
    if (time >= capsuleAt && armor.size < 4 && capsules.length < 2) {
      capsuleAt += 42;
      const left = (['head', 'body', 'arm', 'foot'] as ArmorSlot[]).filter((k) => !armor.has(k));
      if (left.length) {
        const a = Math.random() * Math.PI * 2;
        capsules.push({
          x: clamp(px + Math.cos(a) * 250, 30, ARENA_W - 30),
          y: clamp(py + Math.sin(a) * 340, 40, ARENA_H - 30),
          slot: left[Math.floor(Math.random() * left.length)],
          bob: 0,
        });
      }
    }
    for (let i = capsules.length - 1; i >= 0; i--) {
      const cap = capsules[i];
      cap.bob += dt;
      // 캡슐 몸통은 cap.y 보다 8px 위에 그려진다 — 판정도 거기에 맞춰야
      // "겹쳤는데 안 먹힌다"가 안 생긴다
      const dx = px - cap.x;
      const dy = py - cap.y;
      if (dx * dx + dy * dy > 21 * 21) continue;
      capsules.splice(i, 1);
      armor.add(cap.slot);
      armorBanner = 2.6;
      armorGot = cap.slot;
      applyArmor();
      spawnPart(cap.x, cap.y, 26, ARMOR_INFO[cap.slot].color, 220);
      for (let r = 0; r < 3; r++) {
        rings.push({ x: cap.x, y: cap.y, r: 24 + r * 18, life: 0.5, max: 0.5, color: ARMOR_INFO[cap.slot].color });
      }
      shake = Math.max(shake, 8);
      sfx.reveal('SR');
    }

    // --- 라이드 아머 — 포드가 놓이고, 타면 잠깐 압도적으로 세진다
    if (time >= rideAt && rideT <= 0 && ridePods.length === 0) {
      rideAt += 70;
      const a = Math.random() * Math.PI * 2;
      ridePods.push({
        x: clamp(px + Math.cos(a) * 200, 30, ARENA_W - 30),
        y: clamp(py + Math.sin(a) * 280, 40, ARENA_H - 30),
        bob: 0,
      });
    }
    for (let i = ridePods.length - 1; i >= 0; i--) {
      const pod = ridePods[i];
      pod.bob += dt;
      const dx = px - pod.x;
      const dy = py - pod.y;
      if (dx * dx + dy * dy > 24 * 24) continue;
      ridePods.splice(i, 1);
      rideT = RIDE_TIME;
      hp = Math.min(maxHp, hp + 30);
      shake = Math.max(shake, 12);
      for (let r = 0; r < 4; r++) {
        rings.push({ x: px, y: py - 10, r: 24 + r * 22, life: 0.5, max: 0.5, color: 0xffd85c });
      }
      spawnPart(px, py - 10, 34, 0xffd85c, 240);
      sfx.reveal('SSR');
    }

    if (rideT > 0) {
      rideT -= dt;
      ridePunch -= dt;
      // 밟고 지나가는 것만으로 아프다 — 거대하다는 걸 몸으로 알린다
      for (let j = foes.length - 1; j >= 0; j--) {
        const f = foes[j];
        const dx = f.x - px;
        const dy = (f.y - 8 - (py - 10)) / 0.78;
        if (dx * dx + dy * dy > 34 * 34) continue;
        hurtFoe(f, 90 * dt * 3, 'none');
        f.kx += (dx > 0 ? 1 : -1) * 260 * dt * 3;
      }
      // 주기적으로 앞으로 내지르는 주먹
      if (ridePunch <= 0) {
        ridePunch = 0.85;
        const t = nearestFoe(px, py);
        const a = t ? Math.atan2(t.y - 8 - (py - 10), t.x - px) : facing > 0 ? 0 : Math.PI;
        const fx = px + Math.cos(a) * 46;
        const fy = py - 10 + Math.sin(a) * 36;
        blast(fx, fy, 44, 160, 0xffd85c, 'none');
        rings.push({ x: fx, y: fy, r: 44, life: 0.3, max: 0.3, color: 0xffd85c });
        shake = Math.max(shake, 7);
      }
      if (rideT <= 0) {
        spawnPart(px, py - 10, 22, 0xffd85c, 200);
        shake = Math.max(shake, 8);
      }
    }

    // --- E탱크 — 모아뒀다가 직접 터뜨린다
    if (input.pressed('up') && eTanks > 0 && hp < maxHp) {
      eTanks--;
      hp = maxHp;
      for (let r = 0; r < 3; r++) {
        rings.push({ x: px, y: py - 10, r: 20 + r * 16, life: 0.45, max: 0.45, color: 0x8ef0a0 });
      }
      spawnPart(px, py - 10, 24, 0x8ef0a0, 200);
      sfx.level();
    }

    // ---- 적
    if (iframe > 0) iframe -= dt;

    // 분신이 서 있으면 적은 그쪽으로 간다. 이게 소울 바디의 본체다 —
    // 유인이 없으면 그냥 시간차 폭탄이라 뽑을 이유가 없다.
    const lureX = decoy ? decoy.x : px;
    const lureY = decoy ? decoy.y : py;

    for (let i = foes.length - 1; i >= 0; i--) {
      const f = foes[i];
      const dx = lureX - f.x;
      const dy = lureY - f.y;

      // 뒤처진 개체는 조용히 치운다. 안 치우면 못 죽인 적이 영원히 따라와
      // 쌓이기만 해서, 한 번 밀리는 순간 회복이 불가능한 죽음의 나선이 된다.
      // 스폰 반경보다 넉넉히 바깥이라 화면에서 사라지는 게 보이지는 않는다.
      if (!f.elite && (Math.abs(px - f.x) > 360 || Math.abs(py - f.y) > 620)) {
        retire(f);
        continue;
      }

      const d = Math.hypot(dx, dy) || 1;
      // 초반 접근을 느리게 잡는다 — 화력이 1발일 때 정속으로 몰려오면
      // 포위가 끝나는 데 20초도 안 걸린다.
      const ramp = Math.min(1.2, 0.78 + time * 0.0045);
      let sp = f.def.speed * (f.elite ? 0.8 : 1) * ramp;
      let toward = 1;
      /** 돌진 중이면 목표를 계속 쫓지 않고 고정 방향으로만 간다 */
      let locked = false;

      f.timer -= dt;
      switch (BEHAVIOR[f.kind]) {
        case 'hop':
          // 튀어오르듯 끊어서 온다 — 멈췄다 붙는다
          if (f.timer <= 0) { f.mode = f.mode === 0 ? 1 : 0; f.timer = f.mode === 1 ? 0.3 : 0.5; }
          sp *= f.mode === 1 ? 2.1 : 0.18;
          break;
        case 'charge':
          // 파고드는 놈 — 멈춰 노려보다가(붉게) 직선으로 꽂힌다.
          // 돌진 방향을 그 순간에 고정하는 게 핵심이다. 계속 따라오게 두면
          // 플레이어보다 빠른 이상 절대 못 피해서 그냥 맞는 함정이 된다.
          if (f.mode === 0 && f.timer <= 0 && d < 170) { f.mode = 1; f.timer = 0.5; }
          else if (f.mode === 1 && f.timer <= 0) {
            f.mode = 2;
            f.timer = 0.42;
            f.ax = dx / d;
            f.ay = dy / d;
          } else if (f.mode === 2 && f.timer <= 0) { f.mode = 0; f.timer = 1.3; }
          if (f.mode === 1) { sp *= 0.08; if (f.flash <= 0) f.view.tint = 0xffa0a0; }
          else if (f.mode === 2) { sp *= 2.3; locked = true; }
          else if (f.flash <= 0) f.view.tint = f.elite ? 0xffb0b0 : 0xffffff;
          break;
        case 'shooter':
          // 거리를 두고 쏜다 — 붙으면 물러난다
          if (d < 120) toward = -1;
          else if (d < 200) toward = 0;
          if (f.timer <= 0) {
            f.timer = 3.4 + Math.random() * 1.4;
            if (d < 260) {
              fireHostile(f.x, f.y - 8, Math.atan2(dy, dx), 128, 6, 0xff77c8);
            }
          }
          break;
        default:
          break;
      }

      const mvx = locked ? f.ax : (dx / d) * toward;
      const mvy = locked ? f.ay : (dy / d) * toward;
      f.x += mvx * sp * dt + f.kx * dt;
      f.y += mvy * sp * 0.78 * dt + f.ky * dt;
      f.kx *= 0.86;
      f.ky *= 0.86;

      if (f.flash > 0) {
        f.flash -= dt;
        if (f.flash <= 0) f.view.tint = f.elite ? 0xffb0b0 : 0xffffff;
      }

      f.view.scale.x = dx < 0 ? -f.scale : f.scale;
      f.view.update(app.ticker.deltaMS);
      f.view.position.set(Math.round(f.x), Math.round(f.y));
      f.view.zIndex = f.y;

      const rr = f.def.r * f.scale + PLAYER_R;
      if (iframe <= 0 && dx * dx + dy * dy < rr * rr) {
        hp -= f.def.touch * (f.elite ? 1.7 : 1);
        iframe = 0.82;
        hitstop = 0.055;
        shake = 8;
        spawnPart(px, py - 10, 14, 0xff5c5c, 150);
        sfx.hurt();
        f.kx = -(dx / d) * 260;
        f.ky = -(dy / d) * 260;
        if (hp <= 0) {
          hp = 0;
          phase = 'dead';
          deadTimer = 0;
          spawnPart(px, py - 10, 40, 0xffffff, 220);
          shake = 12;
          sfx.dead();
          recordBest();
        }
      }
    }
    hv.zIndex = py + 0.5;

    // 적을 격자에 담는다. 탄 700발 × 적 200마리를 전수 비교하면 프레임이
    // 반토막 난다 — 탄은 자기 주변 칸만 본다. 밀어내기도 같은 격자를 쓴다.
    for (const c of grid) c.length = 0;
    for (const f of foes) {
      const ci = cellIndex(f.x, f.y);
      if (ci >= 0) grid[ci].push(f);
    }

    // 서로 밀어낸다. 없으면 전부 한 점에 겹쳐 "한 마리"처럼 보인다 —
    // 몰려온다는 압박은 개체가 벽처럼 퍼져 있어야 생긴다.
    for (const cell of grid) {
      // 한 칸에 몰릴 때 쌍 비교가 제곱으로 늘어나 프레임을 잡아먹는다.
      // 겹침을 완전히 없앨 필요는 없고 뭉치지만 않으면 되므로 앞쪽만 본다.
      const n = Math.min(cell.length, 10);
      for (let i = 0; i < n; i++) {
        const a = cell[i];
        for (let j = i + 1; j < cell.length; j++) {
          const b = cell[j];
          const dx = b.x - a.x;
          const dy = (b.y - a.y) * 1.35;
          const min = (a.def.r * a.scale + b.def.r * b.scale) * 0.95;
          const d2 = dx * dx + dy * dy;
          if (d2 > min * min) continue;
          const d = Math.sqrt(d2) || 0.5;
          const push = ((min - d) / d) * 150;
          a.kx -= dx * push * dt;
          a.ky -= dy * push * dt;
          b.kx += dx * push * dt;
          b.ky += dy * push * dt;
        }
      }
    }

    // ---- 탄
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];

      // 부메랑 — 일정 시간 뒤 던진 사람에게 되돌아온다. 오는 길에도 벤다.
      if (b.back > 0) {
        b.back -= dt;
        if (b.back <= 0) b.homing = 0;
      } else if (b.boomerang && b.homing === 0 && b.shape !== 'tracer') {
        const want = Math.atan2((py - 10 - b.y) / 0.8, px - b.x);
        const cur = Math.atan2(b.vy / 0.8, b.vx);
        let dd = want - cur;
        while (dd > Math.PI) dd -= Math.PI * 2;
        while (dd < -Math.PI) dd += Math.PI * 2;
        const na = cur + clamp(dd, -7 * dt, 7 * dt);
        const sp = Math.hypot(b.vx, b.vy / 0.8);
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp * 0.8;
      }

      // 유도탄은 매 프레임 목표 쪽으로 조금씩 튼다. 각도를 즉시 맞춰버리면
      // 절대 안 빗나가서 유도라는 느낌 자체가 사라진다.
      if (b.homing > 0) {
        const t = nearestFoe(b.x, b.y);
        if (t) {
          const want = Math.atan2((t.y - 8 - b.y) / 0.8, t.x - b.x);
          const cur = Math.atan2(b.vy / 0.8, b.vx);
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const turn = clamp(d, -b.homing * dt, b.homing * dt);
          const sp = Math.min(320, Math.hypot(b.vx, b.vy / 0.8) + 240 * dt);
          const na = cur + turn;
          b.vx = Math.cos(na) * sp;
          b.vy = Math.sin(na) * sp * 0.8;
        }
      }
      if (b.spin !== 0) b.angle += b.spin * dt;

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > ARENA_W + 20 || b.y < -20 || b.y > ARENA_H + 20) {
        if (b.boomR > 0) blast(b.x, b.y, b.boomR, b.boomDmg, b.color, b.elem);
        bullets.splice(i, 1);
        continue;
      }
      // 보스는 격자에 안 들어가므로 따로 본다
      const bs = boss;
      if (bs && b.lastHit === null) {
        const bdx = bs.x - b.x;
        const bdy = bs.y - 14 - b.y;
        const brr = 18 + b.r;
        if (bdx * bdx + bdy * bdy <= brr * brr) {
          if (b.boomR > 0) {
            blast(b.x, b.y, b.boomR, b.boomDmg, b.color, b.elem);
          } else {
            hurtBoss(b.dmg, b.elem);
            spawnPart(b.x, b.y, 3, 0xfff0a0, 120);
            sfx.hit();
          }
          if (b.pierce > 0) b.pierce--;
          else { bullets.splice(i, 1); continue; }
        }
      }

      const cx = Math.floor(b.x / GRID_CELL);
      const cy = Math.floor(b.y / GRID_CELL);
      // 한 프레임에 한 번만 맞는다 — 안 그러면 인접 칸을 도는 동안
      // 같은 탄이 여러 마리를 동시에 때려 관통 수치가 무의미해진다.
      let consumed = false;
      for (let gy = cy - 1; gy <= cy + 1 && !consumed; gy++) {
        if (gy < 0 || gy >= GRID_H) continue;
        for (let gx = cx - 1; gx <= cx + 1 && !consumed; gx++) {
          if (gx < 0 || gx >= GRID_W) continue;
          const cell = grid[gy * GRID_W + gx];
          for (const f of cell) {
            if (!f.alive || f === b.lastHit) continue;
            const dx = f.x - b.x;
            const dy = f.y - 8 - b.y;
            const rr = f.def.r * f.scale + b.r;
            if (dx * dx + dy * dy > rr * rr) continue;

            if (b.boomR > 0) {
              // 폭탄은 몸통 피해가 없다 — 터지는 것으로 끝낸다
              blast(b.x, b.y, b.boomR, b.boomDmg, b.color, b.elem);
              bullets.splice(i, 1);
              consumed = true;
              break;
            }

            const kn = b.color === shotColor ? shotKnock : 1;
            f.kx += (b.vx / w.speed) * 120 * kn;
            f.ky += (b.vy / w.speed) * 120 * kn;
            spawnPart(b.x, b.y, 2, b.shape === 'tracer' ? 0xfff0a0 : b.color, 110);
            sfx.hit();
            b.lastHit = f;
            hurtFoe(f, b.dmg, b.elem, b.x, b.y);

            if (b.pierce > 0) b.pierce--;
            else bullets.splice(i, 1);
            consumed = true;
            break;
          }
        }
      }
    }

    // ---- 예약 타격(종의 차지 파문) — swingSaber() 의 매 스윙이 아니라
    // releaseCharge() 의 quake 하나만 여기로 밀어 넣는다. 드물게 쓰는
    // 연출이라 항상 크고 밝게 띄운다.
    for (let i = echoes.length - 1; i >= 0; i--) {
      const e = echoes[i];
      e.t -= dt;
      if (e.t > 0) continue;
      echoes.splice(i, 1);
      for (let j = foes.length - 1; j >= 0; j--) {
        const f = foes[j];
        const dx = f.x - e.x;
        const dy = (f.y - 8 - e.y) / 0.78;
        const reach = e.r + f.def.r * f.scale;
        if (dx * dx + dy * dy <= reach * reach) hurtFoe(f, e.dmg, w.elem);
      }
      if (boss) {
        const dx = boss.x - e.x;
        const dy = (boss.y - 14 - e.y) / 0.78;
        const reach = e.r + 18;
        if (dx * dx + dy * dy <= reach * reach) hurtBoss(e.dmg, w.elem);
      }
      arcs.push({
        x: e.x, y: e.y, angle: 0, r: e.r, span: Math.PI * 2,
        life: 0.18, max: 0.18, color: shotCore, look: 'ring',
      });
    }

    updateOrbs(dt);

    // ---- 적 탄
    for (let i = hostiles.length - 1; i >= 0; i--) {
      const h = hostiles[i];
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.life -= dt;
      if (h.life <= 0 || h.x < -20 || h.x > ARENA_W + 20 || h.y < -20 || h.y > ARENA_H + 20) {
        hostiles.splice(i, 1);
        continue;
      }
      const dx = px - h.x;
      const dy = py - 10 - h.y;
      const rr = h.r + PLAYER_R;
      if (dx * dx + dy * dy > rr * rr) continue;
      hostiles.splice(i, 1);
      if (iframe > 0) continue;
      hp -= takeDmg(h.dmg);
      iframe = 0.72;
      hitstop = 0.05;
      shake = 7;
      spawnPart(px, py - 10, 12, 0xff5c5c, 150);
      sfx.hurt();
      if (hp <= 0) {
        hp = 0;
        phase = 'dead';
        deadTimer = 0;
        spawnPart(px, py - 10, 40, 0xffffff, 220);
        shake = 12;
        sfx.dead();
        recordBest();
      }
    }

    // ---- 회복 캡슐
    for (let i = heals.length - 1; i >= 0; i--) {
      const cap = heals[i];
      cap.life -= dt;
      if (cap.life <= 0) { heals.splice(i, 1); continue; }
      const dx = px - cap.x;
      const dy = py - 8 - cap.y;
      if (dx * dx + dy * dy > 13 * 13) continue;
      heals.splice(i, 1);
      hp = Math.min(maxHp, hp + (cap.amt ?? 20));
      spawnPart(px, py - 10, 12, 0x8ef0ff, 110);
      sfx.pick();
    }

    // ---- 경험치
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      const dx = px - g.x;
      const dy = py - 8 - g.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < w.magnet) {
        const pull = 130 + (w.magnet - d) * 6;
        g.vx += (dx / d) * pull * dt * 6;
        g.vy += (dy / d) * pull * dt * 6;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vx *= 0.9;
      g.vy *= 0.9;
      if (d < 11) {
        xp += g.val;
        gems.splice(i, 1);
      }
    }
    if (xp >= xpNeed) levelUp();

    draw(dt);
    input.endFrame();
  });

  // ------------------------------------------------------------ 그리기
  function draw(dt: number): void {
    animClock += dt;

    // 카메라
    if (shake > 0) shake = Math.max(0, shake - dt * 26);
    const camX = clamp(px - W / 2, 0, ARENA_W - W);
    const camY = clamp(py - H / 2, 0, ARENA_H - H);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    world.position.set(Math.round(-camX + sx), Math.round(-camY + sy));
    farLayer.position.set(Math.round(-camX * 0.42 + sx * 0.42), Math.round(-camY * 0.42 + sy * 0.42));

    // 화면 밖은 그리지 않는다. 탄 수백 발이 상시 떠 있는 게임이라
    // 이걸 안 하면 안 보이는 탄을 그리느라 프레임이 반으로 떨어진다.
    const vx0 = camX - 24;
    const vx1 = camX + W + 24;
    const vy0 = camY - 24;
    const vy1 = camY + H + 24;
    const onScreen = (x: number, y: number): boolean => x > vx0 && x < vx1 && y > vy0 && y < vy1;

    // 스테이지 애니메이션 — 보이는 범위만 다시 그린다
    animG.clear();
    if (theme.anim) {
      theme.anim(animG, { arenaW: ARENA_W, arenaH: ARENA_H, rnd: Math.random },
        animClock, { x0: vx0, y0: vy0, x1: vx1, y1: vy1 });
    }

    // 파티클 — 색깔별로 묶어서 fill 을 한 번씩만 부른다.
    // 개체마다 fill 하면 수백 개일 때 드로우콜만으로 프레임이 죽는다.
    partG.clear();
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
    }
    for (const color of PART_COLORS) {
      for (let tier = 0; tier < 2; tier++) {
        let any = false;
        for (const p of parts) {
          if (p.color !== color) continue;
          if ((p.life / p.max > 0.45 ? 1 : 0) !== tier) continue;
          if (!onScreen(p.x, p.y)) continue;
          partG.rect(Math.round(p.x), Math.round(p.y), p.size, p.size);
          any = true;
        }
        if (any) partG.fill({ color, alpha: tier === 1 ? 1 : 0.45 });
      }
    }

    // 주무기 탄 — 대원 서명(shotLook)마다 다르게 그린다.
    //
    // 여기가 통째로 하나였을 때는 아홉이 색만 다른 같은 총을 쐈다.
    // 한 판 안에서 생김새가 안 바뀌므로 탄마다 분기하지 않고 판 시작에
    // 정해진 shotLook 으로 한 번만 갈라 — 도형 묶음 그리기를 유지한다.
    bulletG.clear();
    const mine: Bullet[] = [];
    for (const b of bullets) {
      if (b.color !== shotColor || !onScreen(b.x, b.y)) continue;
      if (b.shape === 'tracer' || b.shape === 'orb') mine.push(b);
    }

    if (mine.length) {
      /** 진행 방향 단위벡터. 세로가 눌린 좌표라 vy 를 그대로 쓴다 */
      const dir = (b: Bullet): [number, number] => {
        const l = Math.hypot(b.vx, b.vy) || 1;
        return [b.vx / l, b.vy / l];
      };

      if (shotLook === 'needle') {
        // 바늘 — 아주 가늘고 긴 침. 길이로 사거리를 읽게 한다
        for (const b of mine) {
          const [dx, dy] = dir(b);
          bulletG.moveTo(b.x - dx * 16, b.y - dy * 16).lineTo(b.x + dx * 4, b.y + dy * 4);
        }
        bulletG.stroke({ color: 0x0a1024, width: 5, alpha: 0.55 });
        for (const b of mine) {
          const [dx, dy] = dir(b);
          bulletG.moveTo(b.x - dx * 16, b.y - dy * 16).lineTo(b.x + dx * 4, b.y + dy * 4);
        }
        bulletG.stroke({ color: shotColor, width: 3 });
        for (const b of mine) {
          const [dx, dy] = dir(b);
          bulletG.moveTo(b.x - dx * 6, b.y - dy * 6).lineTo(b.x + dx * 4, b.y + dy * 4);
        }
        bulletG.stroke({ color: shotCore, width: 1 });
      } else if (shotLook === 'nail') {
        // 못 — 굵고 짧은 대못. 머리가 뒤에 붙어 있어야 못으로 보인다
        for (const b of mine) {
          const [dx, dy] = dir(b);
          bulletG.moveTo(b.x - dx * 9, b.y - dy * 9).lineTo(b.x + dx * 3, b.y + dy * 3);
        }
        bulletG.stroke({ color: 0x0a1024, width: 9, alpha: 0.6 });
        for (const b of mine) {
          const [dx, dy] = dir(b);
          bulletG.moveTo(b.x - dx * 8, b.y - dy * 8).lineTo(b.x + dx * 3, b.y + dy * 3);
        }
        bulletG.stroke({ color: shotColor, width: 5 });
        for (const b of mine) {
          const [dx, dy] = dir(b);
          bulletG.rect(b.x - dx * 11 - 3, b.y - dy * 11 - 3, 6, 6);  // 못머리
        }
        bulletG.fill({ color: shotCore });
      } else if (shotLook === 'lance') {
        // 거울 — 각진 빛 조각. 둥글게 하면 다른 넷과 구별이 안 된다
        for (const b of mine) {
          const [dx, dy] = dir(b);
          const nx = -dy;
          const ny = dx;
          bulletG.moveTo(b.x + dx * 10, b.y + dy * 10)
            .lineTo(b.x + nx * 4, b.y + ny * 4)
            .lineTo(b.x - dx * 10, b.y - dy * 10)
            .lineTo(b.x - nx * 4, b.y - ny * 4)
            .closePath();
        }
        bulletG.fill({ color: 0x0a1024, alpha: 0.6 });
        for (const b of mine) {
          const [dx, dy] = dir(b);
          const nx = -dy;
          const ny = dx;
          bulletG.moveTo(b.x + dx * 8, b.y + dy * 8)
            .lineTo(b.x + nx * 3, b.y + ny * 3)
            .lineTo(b.x - dx * 8, b.y - dy * 8)
            .lineTo(b.x - nx * 3, b.y - ny * 3)
            .closePath();
        }
        bulletG.fill({ color: shotColor });
        for (const b of mine) bulletG.circle(b.x, b.y, 2);
        bulletG.fill({ color: shotCore });
      } else if (shotLook === 'harpoon') {
        // 작살 — 촉 뒤로 줄이 끌린다. 줄이 없으면 그냥 화살촉이다
        for (const b of mine) {
          const [dx, dy] = dir(b);
          bulletG.moveTo(b.x - dx * 22, b.y - dy * 22).lineTo(b.x - dx * 6, b.y - dy * 6);
        }
        bulletG.stroke({ color: shotColor, width: 1, alpha: 0.5 });
        for (const b of mine) {
          const [dx, dy] = dir(b);
          const nx = -dy;
          const ny = dx;
          bulletG.moveTo(b.x + dx * 8, b.y + dy * 8)
            .lineTo(b.x - dx * 4 + nx * 5, b.y - dy * 4 + ny * 5)
            .lineTo(b.x - dx * 4 - nx * 5, b.y - dy * 4 - ny * 5)
            .closePath();
        }
        bulletG.fill({ color: 0x0a1024, alpha: 0.6 });
        for (const b of mine) {
          const [dx, dy] = dir(b);
          const nx = -dy;
          const ny = dx;
          bulletG.moveTo(b.x + dx * 6, b.y + dy * 6)
            .lineTo(b.x - dx * 3 + nx * 4, b.y - dy * 3 + ny * 4)
            .lineTo(b.x - dx * 3 - nx * 4, b.y - dy * 3 - ny * 4)
            .closePath();
        }
        bulletG.fill({ color: shotColor });
      } else if (shotLook === 'ember') {
        // 불씨 — 날아가며 번진다. 뒤로 갈수록 커지고 옅어지는 불티
        for (const b of mine) {
          const [dx, dy] = dir(b);
          for (let k = 1; k <= 3; k++) {
            bulletG.circle(b.x - dx * k * 4, b.y - dy * k * 4, 1 + k * 1.4);
          }
        }
        bulletG.fill({ color: shotColor, alpha: 0.3 });
        for (const b of mine) bulletG.circle(b.x, b.y, 3);
        bulletG.fill({ color: shotColor });
        for (const b of mine) bulletG.circle(b.x, b.y, 1.5);
        bulletG.fill({ color: shotCore });
      } else {
        // 반딧불 — 작은 유도탄. 꼬리가 휘어야 따라가는 게 보인다
        for (const b of mine) {
          const [dx, dy] = dir(b);
          bulletG.moveTo(b.x - dx * 12, b.y - dy * 12).lineTo(b.x, b.y);
        }
        bulletG.stroke({ color: shotColor, width: 2, alpha: 0.45 });
        for (const b of mine) bulletG.circle(b.x, b.y, 3.5);
        bulletG.fill({ color: 0x0a1024, alpha: 0.6 });
        for (const b of mine) bulletG.circle(b.x, b.y, 2.5);
        bulletG.fill({ color: shotColor });
        for (const b of mine) bulletG.circle(b.x, b.y, 1.2);
        bulletG.fill({ color: shotCore });
      }
    }

    // 특수무기 탄 — 무기 색이 몇 개 안 되므로 색깔별로 묶어 한 번씩만 그린다
    specialG.clear();
    lungeG.clear();

    // 세이버 사거리 표시 — 실제로 얼마나 닿는지 스윙 전에도 보여야 한다.
    // 안 그러면 "닿았어야 하는데 안 닿았다"는 느낌만 남고 범위가 감이 안 온다.
    if (w.style === 'saber' && phase === 'play') {
      const a0 = aimAngle - w.arcSpan / 2;
      const a1 = aimAngle + w.arcSpan / 2;
      specialG.moveTo(px, py - 10).arc(px, py - 10, w.arcR, a0, a1).closePath();
      specialG.fill({ color: shotColor, alpha: 0.05 });
      specialG.arc(px, py - 10, w.arcR, a0, a1);
      specialG.stroke({ color: shotColor, alpha: 0.35, width: 1 });
    }

    // 세이버 참격 — 부채꼴이 확 퍼졌다 사라진다
    for (let i = arcs.length - 1; i >= 0; i--) {
      const ac = arcs[i];
      ac.life -= dt;
      if (ac.life <= 0) { arcs.splice(i, 1); continue; }
      const k = 1 - ac.life / ac.max;
      const r = ac.r * (0.55 + k * 0.45);
      const a0 = ac.angle - ac.span / 2;
      const a1 = ac.angle + ac.span / 2;
      if (ac.look === 'ring') {
        // 종 — 휘두른 자리에서 퍼져 나가는 파문. 안이 비어야 '남은 충격'이지
        // 채우면 그냥 커지는 원이 된다
        specialG.circle(ac.x, ac.y, r);
        specialG.stroke({ color: ac.color, width: 5 - k * 3, alpha: (1 - k) * 0.7 });
        specialG.circle(ac.x, ac.y, r * 0.72);
        specialG.stroke({ color: 0xffffff, width: 2, alpha: (1 - k) * 0.8 });
      } else if (ac.look === 'crescent') {
        // 사슬 — 길게 뻗는 얇은 낫. 부채꼴로 채우면 짧고 뭉툭해 보인다
        specialG.moveTo(ac.x + Math.cos(a0) * r, ac.y + Math.sin(a0) * r)
          .arc(ac.x, ac.y, r, a0, a1)
          .arc(ac.x, ac.y, r * 0.66, a1, a0, true)
          .closePath();
        specialG.fill({ color: ac.color, alpha: (1 - k) * 0.32 });
        specialG.arc(ac.x, ac.y, r, a0, a1);
        specialG.stroke({ color: 0xffffff, width: 3, alpha: (1 - k) * 0.95 });
      } else {
        specialG.moveTo(ac.x, ac.y).arc(ac.x, ac.y, r, a0, a1).closePath();
        specialG.fill({ color: ac.color, alpha: (1 - k) * 0.28 });
        specialG.arc(ac.x, ac.y, r, a0, a1);
        specialG.stroke({ color: 0xffffff, width: 2, alpha: (1 - k) * 0.9 });
      }
    }

    for (const color of SPECIAL_COLORS) {
      // 1) 꼬리 — 선이라 stroke 로 따로 그려야 한다. 점만 있으면 날아가는 게 안 보인다.
      let trail = false;
      for (const b of bullets) {
        if (b.shape !== 'orb' || b.color !== color || !onScreen(b.x, b.y)) continue;
        specialG.moveTo(b.x - b.vx * 0.055, b.y - b.vy * 0.055).lineTo(b.x, b.y);
        trail = true;
      }
      if (trail) specialG.stroke({ color, width: 3, alpha: 0.4 });

      // 2) 몸통
      let any = false;
      for (const b of bullets) {
        if (b.shape === 'tracer' || b.color !== color || !onScreen(b.x, b.y)) continue;
        if (b.shape === 'blade') {
          // 회전하는 마름모 — 톱날이 도는 게 보여야 한다
          const c = Math.cos(b.angle) * b.r;
          const s = Math.sin(b.angle) * b.r;
          specialG.moveTo(b.x + c, b.y + s)
            .lineTo(b.x - s, b.y + c)
            .lineTo(b.x - c, b.y - s)
            .lineTo(b.x + s, b.y - c)
            .closePath();
        } else {
          specialG.circle(b.x, b.y, b.r);
        }
        any = true;
      }
      if (any) specialG.fill({ color, alpha: 0.85 });

      // 3) 속심 — 가운데를 밝게 해서 덩어리가 아니라 발광체로 보이게
      let core = false;
      for (const b of bullets) {
        if (b.shape !== 'orb' || b.color !== color || b.r < 3 || !onScreen(b.x, b.y)) continue;
        specialG.circle(b.x, b.y, Math.max(1, b.r - 2));
        core = true;
      }
      if (core) specialG.fill({ color: lighten(color, 0.6), alpha: 0.9 });
    }
    // 큰 탄(토네이도)은 테두리를 덧그려 배경에 묻히지 않게 한다
    let outline = false;
    for (const b of bullets) {
      if (b.shape === 'tracer' || b.r < 10 || !onScreen(b.x, b.y)) continue;
      specialG.circle(b.x, b.y, b.r);
      outline = true;
    }
    if (outline) specialG.stroke({ color: 0xffffff, width: 1, alpha: 0.5 });

    // 적 탄 — 내 탄과 헷갈리면 안 되므로 분홍 계열에 어두운 테두리
    for (const h of hostiles) {
      if (!onScreen(h.x, h.y)) continue;
      specialG.circle(h.x, h.y, h.r + 2);
    }
    if (hostiles.length) specialG.fill({ color: 0x1a0a16, alpha: 0.8 });
    for (const h of hostiles) {
      if (!onScreen(h.x, h.y)) continue;
      specialG.circle(h.x, h.y, h.r);
    }
    if (hostiles.length) specialG.fill({ color: 0xff77c8 });
    for (const h of hostiles) {
      if (!onScreen(h.x, h.y)) continue;
      specialG.circle(h.x, h.y, Math.max(1, h.r - 2));
    }
    if (hostiles.length) specialG.fill({ color: 0xffe0f4 });

    // --- 레전드 무기 이펙트
    //
    // 레전드는 뽑기로만 나오는 물건이라 기본 무기와 같은 그림이면 안 된다.
    // 도형 하나로 끝내지 않고 겹(속심/외곽/잔상/불티)을 쌓고, 전부 시간에
    // 따라 일렁이게 했다 — 멈춰 있는 순간이 없어야 "특별한 것"으로 읽힌다.

    // 소울 바디 — 일렁이는 유령 분신. 적을 끌어당기는 선까지 같이 보인다.
    if (decoy) {
      const k = 1 - decoy.life / 2.4;
      const wob = Math.sin(animClock * 9) * 2;
      const pulse = 0.45 + Math.sin(animClock * 13) * 0.22;

      // 빨려 들어오는 유인선 — 이게 있어야 "끌어모으는 중"이 보인다
      for (let i = 0; i < 10; i++) {
        const a = animClock * 1.3 + (i / 10) * Math.PI * 2;
        const rr = decoy.r * (1 - ((animClock * 0.9 + i / 10) % 1)) * 0.9;
        specialG.moveTo(decoy.x + Math.cos(a) * rr, decoy.y - 8 + Math.sin(a) * rr * 0.78)
          .lineTo(decoy.x + Math.cos(a) * rr * 0.62, decoy.y - 8 + Math.sin(a) * rr * 0.48);
      }
      specialG.stroke({ color: 0x8ef0d8, width: 1, alpha: 0.4 });

      // 터지기 직전 예고 고리 — 언제 터지는지 알 수 있어야 한다
      specialG.circle(decoy.x, decoy.y - 8, decoy.r * k)
        .stroke({ color: 0xdcfff6, width: 1 + k * 2, alpha: 0.25 + k * 0.5 });

      // 분신 본체 — 겹쳐 그린 유령 실루엣
      for (let i = 2; i >= 0; i--) {
        const sp = 1 + i * 0.35;
        const al = pulse * (i === 0 ? 1 : 0.22);
        specialG.roundRect(decoy.x - 5 * sp + wob, decoy.y - 26 - i, 10 * sp, 26, 4)
          .fill({ color: i === 0 ? 0x8ef0d8 : 0x4fd6b8, alpha: al });
      }
      specialG.rect(decoy.x - 3 + wob, decoy.y - 23, 6, 7).fill({ color: 0xdcfff6, alpha: pulse + 0.2 });
      // 발밑 그림자 고리
      specialG.circle(decoy.x, decoy.y, 9).fill({ color: 0x8ef0d8, alpha: 0.18 });
    }

    // 차지 킥 — 겹겹이 흔들리는 불길 + 위로 오르는 불티
    for (const kt of kickTrail) {
      if (!onScreen(kt.x, kt.y)) continue;
      const a = Math.min(1, kt.life / 2.2);
      const fl = 0.86 + Math.sin(animClock * 17 + kt.x * 0.3) * 0.14;
      specialG.circle(kt.x, kt.y, kt.r * (0.75 + a * 0.35) * fl)
        .fill({ color: 0x8c1a44, alpha: a * 0.3 });
      specialG.circle(kt.x, kt.y, kt.r * 0.72 * fl)
        .fill({ color: 0xff5c9c, alpha: a * 0.34 });
      specialG.circle(kt.x, kt.y, kt.r * 0.42 * fl)
        .fill({ color: 0xffb0d4, alpha: a * 0.42 });
      // 오르는 불티
      for (let i = 0; i < 3; i++) {
        const ph = (animClock * 1.5 + i * 0.33 + kt.x * 0.05) % 1;
        specialG.rect(
          kt.x - kt.r * 0.5 + ((i * 7 + kt.y) % (kt.r)),
          kt.y - ph * 22, 2, 2,
        ).fill({ color: 0xffd0e4, alpha: a * (1 - ph) * 0.8 });
      }
    }

    // 파이어 웨이브 — 혓바닥이 제각각 날름거리는 화염
    if (flameT > 0 && phase === 'play') {
      const half = flameSpan / 2;
      // 캐릭터 자리(반지름 0)부터 부채꼴을 채우면 불투명한 화염이 그대로
      // 캐릭터를 덮어버린다. 안쪽 반지름을 비워 캐릭터 주변에 숨구멍을
      // 만든다 — 불이 캐릭터에서 뿜어져 나가는 게 아니라 캐릭터를
      // 지나쳐 앞으로 뻗어나가는 모양이 된다.
      const innerR = 20;
      // 겹 4장: 바깥 어두운 붉음 → 주황 → 노랑 → 흰 속심
      // 어두운 색을 넓게 깔면 파란 배경과 섞여 흙빛 삼각형이 된다.
      // 밝은 쪽을 넓게 쓰고 알파를 올려야 "타오른다"로 읽힌다.
      // 반투명으로 깔면 어두운 파란 바닥과 섞여 흙빛이 된다. 불은 원래
      // 불투명하니 거의 꽉 채워서 그린다 — 그래야 주황이 주황으로 보인다.
      const layers = [
        { k: 1.0, c: 0xd93a10, a: 0.85 },
        { k: 0.78, c: 0xff6a1e, a: 0.92 },
        { k: 0.54, c: 0xffab3d, a: 0.96 },
        { k: 0.28, c: 0xffe9a8, a: 1 },
      ];
      for (const L of layers) {
        const outerBase = flameR * L.k;
        // 안쪽 여백보다 작은 겹은 캐릭터 위치에서 다 뭉개지므로 아예 건너뛴다
        if (outerBase < innerR + 6) continue;
        // 부채꼴을 한 덩어리로 안 그리고 조각을 각각 다르게 흔든다
        const seg = 9;
        const a0 = aimAngle - half;
        specialG.moveTo(px + Math.cos(a0) * innerR, py - 10 + Math.sin(a0) * innerR * 0.78);
        for (let i = 0; i <= seg; i++) {
          const a = aimAngle - half + (i / seg) * flameSpan;
          const n = Math.sin(animClock * 21 + i * 1.7) * 0.13 + Math.sin(animClock * 33 + i) * 0.07;
          const rr = outerBase * (1 + n);
          specialG.lineTo(px + Math.cos(a) * rr, py - 10 + Math.sin(a) * rr * 0.78);
        }
        const a1 = aimAngle + half;
        specialG.lineTo(px + Math.cos(a1) * innerR, py - 10 + Math.sin(a1) * innerR * 0.78);
        specialG.closePath().fill({ color: L.c, alpha: L.a });
      }
      // 끝에서 떨어져 나가는 불똥
      for (let i = 0; i < 5; i++) {
        const ph = (animClock * 2.2 + i * 0.2) % 1;
        const a = aimAngle + (Math.sin(animClock * 5 + i * 2) * half);
        const rr = flameR * (0.7 + ph * 0.5);
        specialG.rect(
          px + Math.cos(a) * rr, py - 10 + Math.sin(a) * rr * 0.78, 2, 2,
        ).fill({ color: 0xffd08a, alpha: (1 - ph) * 0.9 });
      }
    }

    // 노바 스트라이크 — 창처럼 뻗는 플라스마. 잔상까지 남긴다.
    if (novaTimer > 0) {
      const c = Math.cos(novaAngle);
      const sn = Math.sin(novaAngle) * 0.78;
      const hy = py - 10;

      // 뒤로 늘어지는 꼬리를 세 겹으로
      const tails = [
        { len: 92, w: 20, c: 0x2f7ba0, a: 0.3 },
        { len: 68, w: 13, c: 0x9ff0ff, a: 0.45 },
        { len: 42, w: 6, c: 0xffffff, a: 0.6 },
      ];
      for (const T of tails) {
        const j = Math.sin(animClock * 40) * 2;
        specialG.moveTo(px - c * T.len - sn * (T.w + j), hy - sn * T.len + c * (T.w + j))
          .lineTo(px + c * 22, hy + sn * 22)
          .lineTo(px - c * T.len + sn * (T.w + j), hy - sn * T.len - c * (T.w + j))
          .closePath()
          .fill({ color: T.c, alpha: T.a });
      }

      // 진행 방향으로 감기는 고리 — 돌진하는 느낌은 여기서 나온다
      for (let i = 0; i < 4; i++) {
        const back = ((animClock * 3 + i / 4) % 1) * 70;
        const rr = 8 + back * 0.28;
        specialG.circle(px - c * back, hy - sn * back, rr)
          .stroke({ color: 0x9ff0ff, width: 2, alpha: (1 - back / 70) * 0.6 });
      }

      // 속심
      specialG.circle(px, hy, 24).fill({ color: 0x2f7ba0, alpha: 0.4 });
      specialG.circle(px, hy, 16).fill({ color: 0x9ff0ff, alpha: 0.75 });
      specialG.circle(px, hy, 8).fill({ color: 0xffffff, alpha: 0.95 });
      // 앞쪽 충격 쐐기
      specialG.moveTo(px + c * 40, hy + sn * 40)
        .lineTo(px + c * 8 - sn * 16, hy + sn * 8 + c * 16)
        .lineTo(px + c * 8 + sn * 16, hy + sn * 8 - c * 16)
        .closePath()
        .fill({ color: 0xffffff, alpha: 0.5 });
    }

    // --- 보스 무기 이펙트
    // 롱쇼트 빔 — 화면을 가르는 관통 광선
    if (beamT > 0 && phase === 'play') {
      const k = beamT / 0.3;
      const c = Math.cos(beamAngle);
      const sn = Math.sin(beamAngle) * 0.78;
      const hy = py - 10;
      const widths = [
        { w: 22 * k, c: 0x2f7ba0, a: 0.35 },
        { w: 12 * k, c: 0xdcf4ff, a: 0.6 },
        { w: 5 * k, c: 0xffffff, a: 0.95 },
      ];
      for (const L of widths) {
        specialG.moveTo(px - sn * L.w, hy + c * L.w)
          .lineTo(px + c * 420 - sn * L.w, hy + sn * 420 + c * L.w)
          .lineTo(px + c * 420 + sn * L.w, hy + sn * 420 - c * L.w)
          .lineTo(px + sn * L.w, hy - c * L.w)
          .closePath()
          .fill({ color: L.c, alpha: L.a });
      }
      // 발사구 섬광
      specialG.circle(px, hy, 16 * k).fill({ color: 0xffffff, alpha: 0.8 });
    }

    // 세이버 차지 돌진 — 도는 몸 자체가 참격이니, 회전이 뚜렷이 보이는
    // 톱날을 캐릭터 "뒤"(lungeG, foeLayer 보다 아래)에 그린다. specialG
    // 처럼 위에 그리면 정작 돌아가는 캐릭터가 이펙트에 파묻혀 안 보인다.
    // 회전각은 hv.rotation 과 같은 식으로 계산해 완전히 맞물려 돈다.
    if (lungeMoveT > 0 && phase === 'play') {
      // 중심을 관통하는 직선 3개는 그냥 별표(*)로 보인다 — 칼이 아니다.
      // 세이버 스윙과 같은 초승달(부채꼴) 조각을 여러 개 돌려서, 진짜
      // 칼날이 몸 주위를 도는 모양으로 만든다.
      const t = clamp(1 - lungeMoveT / LUNGE_MOVE_DUR, 0, 1);
      const spin = t * Math.PI * 2 * 2.5 * facing;
      const hy = py - 10;
      const blades = 3;
      // 실제 판정 반경(width)보다 눈에 보이는 크기가 훨씬 크면 사기
      // 기술처럼 보인다 — 버스터 빔 굵기 수준으로 시각적 크기만 줄인다
      const bladeR = slashLungeWidth * 0.65;
      const bladeSpan = Math.PI * 0.5;
      for (let i = 0; i < blades; i++) {
        const ang = spin + (i / blades) * Math.PI * 2;
        const a0 = ang - bladeSpan / 2;
        const a1 = ang + bladeSpan / 2;
        lungeG.moveTo(px, hy).arc(px, hy, bladeR, a0, a1).closePath()
          .fill({ color: shotCore, alpha: 0.4 });
        lungeG.arc(px, hy, bladeR, a0, a1)
          .stroke({ color: 0xffffff, width: 2.5, alpha: 0.95 });
      }
      lungeG.circle(px, hy, slashLungeWidth * 0.3).fill({ color: 0xffffff, alpha: 0.5 });
      // 지나온 궤적 — 캐릭터를 가리지 않게 옅은 선 하나로만
      lungeG.moveTo(slashLungeFromX, slashLungeFromY - 10).lineTo(px, hy)
        .stroke({ color: shotColor, width: 2, alpha: 0.25 });
    } else if (slashLungeT > 0 && phase === 'play') {
      // 돌진이 끝난 뒤 — 지나온 자리에 옅게 남는 잔광만 (착지 충격은
      // releaseCharge() 가 이미 rings 로 쏘아뒀다)
      const k = slashLungeT / 0.3;
      specialG.moveTo(slashLungeFromX, slashLungeFromY - 10)
        .lineTo(slashLungeToX, slashLungeToY - 10)
        .stroke({ color: shotColor, width: 2, alpha: 0.25 * k });
    }

    // 버스터 차지 — 조준선을 따라 화면을 가르는 일직선 관통 광선
    if (chargeBeamT > 0 && phase === 'play') {
      const k = chargeBeamT / 0.3;
      const hy = py - 10;
      const widths = [
        { w: chargeBeamWidth * 1.3 * k, c: shotColor, a: 0.3 },
        { w: chargeBeamWidth * 0.75 * k, c: shotCore, a: 0.6 },
        { w: chargeBeamWidth * 0.3 * k, c: 0xffffff, a: 0.95 },
      ];
      for (const ang of chargeBeamAngles) {
        const c = Math.cos(ang);
        const sn = Math.sin(ang) * 0.78;
        for (const L of widths) {
          specialG.moveTo(px - sn * L.w, hy + c * L.w)
            .lineTo(px + c * chargeBeamRange - sn * L.w, hy + sn * chargeBeamRange + c * L.w)
            .lineTo(px + c * chargeBeamRange + sn * L.w, hy + sn * chargeBeamRange - c * L.w)
            .lineTo(px + sn * L.w, hy - c * L.w)
            .closePath()
            .fill({ color: L.c, alpha: L.a });
        }
      }
      specialG.circle(px, hy, chargeBeamWidth * 1.1 * k).fill({ color: 0xffffff, alpha: 0.85 });
    }

    // 카멜레온 스팅 — 무적인 동안 몸 주위가 타오른다
    if (stingT > 0 && phase === 'play') {
      for (let i = 0; i < 3; i++) {
        const rr = 46 * (0.6 + i * 0.2) * (0.94 + Math.sin(animClock * 15 + i * 2) * 0.06);
        specialG.circle(px, py - 10, rr)
          .stroke({ color: i === 2 ? 0xdcffe4 : 0x8ef0a0, width: 2, alpha: 0.5 - i * 0.12 });
      }
      specialG.circle(px, py - 10, 46).fill({ color: 0x8ef0a0, alpha: 0.12 });
    }

    // 가드 셸 — 도는 방패 조각
    const shellDraw = owned.get('shell_guard') ?? 0;
    if (shellDraw && phase === 'play') {
      const rr = 28 + 5 * shellDraw;
      specialG.circle(px, py - 10, rr)
        .stroke({ color: 0x6ec8ff, width: 2, alpha: 0.4 + Math.sin(animClock * 5) * 0.12 });
      for (let i = 0; i < 6; i++) {
        const a = orbitAngle * 0.7 + (i / 6) * Math.PI * 2;
        specialG.rect(
          px + Math.cos(a) * rr - 3, py - 10 + Math.sin(a) * rr * 0.78 - 3, 6, 6,
        ).fill({ color: 0x9fd0ff, alpha: 0.8 });
      }
    }

    // 크림슨 오빗 — 주위를 도는 구슬
    const orbitLv = owned.get('flame_orbit') ?? 0;
    if (orbitLv && phase === 'play') {
      const n = 2 + orbitLv;
      for (let i = 0; i < n; i++) {
        const a = orbitAngle + (i / n) * Math.PI * 2;
        const ox = px + Math.cos(a) * 30;
        const oy = py - 10 + Math.sin(a) * 24;
        specialG.circle(ox, oy, 5).fill({ color: 0xff5c5c, alpha: 0.9 });
        specialG.circle(ox, oy, 2).fill({ color: 0xffd0d0, alpha: 0.95 });
      }
    }

    // 차지 — 모이는 게 몸에 보여야 언제 놓을지 판단할 수 있다
    if (chargeT > 0 && phase === 'play') {
      const k = Math.min(1, chargeT / CHARGE_STEP[1]);
      const c = chargeLevel === 2 ? 0xfff2c0 : chargeLevel === 1 ? 0x9fe8ff : 0x6ec8ff;
      // 빨려드는 고리
      for (let i = 0; i < 3; i++) {
        const ph = ((animClock * 1.8 + i / 3) % 1);
        specialG.circle(px, py - 10, 8 + (1 - ph) * 34 * (0.5 + k))
          .stroke({ color: c, width: 1 + k, alpha: ph * 0.65 });
      }
      // 속심
      specialG.circle(px, py - 10, 5 + k * 9)
        .fill({ color: c, alpha: 0.28 + k * 0.3 });
      if (chargeLevel > 0) {
        const puls = 0.6 + Math.sin(animClock * (chargeLevel === 2 ? 26 : 15)) * 0.35;
        specialG.circle(px, py - 10, 6 + chargeLevel * 5)
          .fill({ color: 0xffffff, alpha: puls * 0.5 });
        // 최대는 튀는 불꽃까지
        if (chargeLevel === 2 && Math.random() < 0.5) {
          spawnPart(px, py - 10, 1, 0xfff2c0, 120);
        }
      }
    }

    // 라이드 아머 포드
    for (const pod of ridePods) {
      if (!onScreen(pod.x, pod.y)) continue;
      const bob = Math.sin(pod.bob * 2.6) * 3;
      const pulse = 0.5 + Math.sin(pod.bob * 5) * 0.3;
      specialG.circle(pod.x, pod.y + 8, 18).fill({ color: 0xffd85c, alpha: 0.16 });
      specialG.rect(pod.x - 4, pod.y - 60 + bob, 8, 60).fill({ color: 0xffd85c, alpha: 0.2 });
      // 웅크린 메카 실루엣
      specialG.roundRect(pod.x - 14, pod.y - 26 + bob, 28, 26, 5).fill({ color: 0x3a2a10 });
      specialG.roundRect(pod.x - 12, pod.y - 24 + bob, 24, 22, 4).fill({ color: 0xffd85c, alpha: 0.85 });
      specialG.rect(pod.x - 7, pod.y - 20 + bob, 14, 6).fill({ color: 0x1a1408, alpha: 0.9 });
      specialG.rect(pod.x - 6, pod.y - 19 + bob, 12, 4).fill({ color: 0xfff2c0, alpha: pulse });
      specialG.rect(pod.x - 14, pod.y - 6 + bob, 8, 8).fill({ color: 0xc9a040 });
      specialG.rect(pod.x + 6, pod.y - 6 + bob, 8, 8).fill({ color: 0xc9a040 });
    }

    // 라이드 아머 탑승 중 — 플레이어를 감싼 거대한 골격
    if (rideT > 0 && phase === 'play') {
      const stomp = Math.sin(animClock * 9) * 2;
      const warn = rideT < 3 && Math.floor(rideT * 6) % 2 === 0;
      const body = warn ? 0xfff2c0 : 0xffd85c;
      // 뒤쪽 몸통
      specialG.roundRect(px - 20, py - 40 + stomp, 40, 40, 7).fill({ color: 0x3a2a10, alpha: 0.95 });
      specialG.roundRect(px - 17, py - 37 + stomp, 34, 34, 6).fill({ color: body, alpha: 0.9 });
      // 어깨
      specialG.roundRect(px - 30, py - 34 + stomp, 13, 18, 4).fill({ color: 0xc9a040 });
      specialG.roundRect(px + 17, py - 34 + stomp, 13, 18, 4).fill({ color: 0xc9a040 });
      // 발
      specialG.rect(px - 22, py - 4, 16, 8).fill({ color: 0x3a2a10 });
      specialG.rect(px + 6, py - 4, 16, 8).fill({ color: 0x3a2a10 });
      // 조종석 창
      specialG.rect(px - 9, py - 32 + stomp, 18, 9).fill({ color: 0x1a1408 });
      specialG.rect(px - 8, py - 31 + stomp, 16, 7).fill({ color: 0x9fe8ff, alpha: 0.5 });
      // 남은 시간 고리
      specialG.circle(px, py - 16, 42)
        .stroke({ color: body, width: 2, alpha: 0.3 + (rideT / RIDE_TIME) * 0.4 });
    }

    // 아머 캡슐 — 멀리서도 보여야 찾으러 갈 마음이 생긴다
    for (const cap of capsules) {
      if (!onScreen(cap.x, cap.y)) continue;
      const info = ARMOR_INFO[cap.slot];
      const bob = Math.sin(cap.bob * 3) * 3;
      const pulse = 0.5 + Math.sin(cap.bob * 6) * 0.3;
      // 바닥 빛
      specialG.circle(cap.x, cap.y + 6, 12).fill({ color: info.color, alpha: 0.16 });
      // 솟아오르는 빛기둥
      specialG.rect(cap.x - 3, cap.y - 46 + bob, 6, 46).fill({ color: info.color, alpha: 0.18 });
      // 캡슐 본체
      specialG.roundRect(cap.x - 7, cap.y - 18 + bob, 14, 20, 4).fill({ color: 0x0a1024 });
      specialG.roundRect(cap.x - 6, cap.y - 17 + bob, 12, 18, 3).fill({ color: info.color, alpha: 0.7 });
      specialG.roundRect(cap.x - 4, cap.y - 15 + bob, 8, 6, 2).fill({ color: 0xffffff, alpha: pulse });
      specialG.roundRect(cap.x - 7, cap.y - 18 + bob, 14, 20, 4)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.5 + pulse * 0.4 });
    }

    // 발밑 이동 방향 화살표 — 몸이 조준을 보고 있어도 어디로 가는지는 읽힌다
    if (phase === 'play' && (moveDirX !== 0 || moveDirY !== 0)) {
      const a = Math.atan2(moveDirY * 0.78, moveDirX);
      const bx = px + Math.cos(a) * 18;
      const by = py + 2 + Math.sin(a) * 13;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const tri = (k: number): void => {
        specialG
          .moveTo(bx + c * (7 + k), by + s * (7 + k))
          .lineTo(bx - (c * 3 + k) - s * (6 + k), by - (s * 3 + k) + c * (6 + k))
          .lineTo(bx - (c * 3 + k) + s * (6 + k), by - (s * 3 + k) - c * (6 + k))
          .closePath();
      };
      // 밝은 배경에 묻히지 않게 어두운 테두리를 깔고 그 위에 얹는다
      tri(1.5);
      specialG.fill({ color: 0x08101f, alpha: 0.75 });
      tri(0);
      specialG.fill({ color: 0x8ef0ff, alpha: 0.95 });
    }

    // 실드 구슬
    for (const o of orbs) {
      const ox = px + Math.cos(o.angle) * 36;
      const oy = py - 12 + Math.sin(o.angle) * 24;
      specialG.circle(ox, oy, 6).fill({ color: 0x6ec8ff, alpha: 0.9 });
      specialG.circle(ox, oy, 6).stroke({ color: 0xdff2ff, width: 1, alpha: 0.8 });
    }

    // 번개 — 내리꽂히는 세로 선
    for (let i = bolts.length - 1; i >= 0; i--) {
      const bl = bolts[i];
      bl.life -= dt;
      if (bl.life <= 0) { bolts.splice(i, 1); continue; }
      if (!onScreen(bl.x, bl.y)) continue;
      specialG.moveTo(bl.x, bl.y - 60).lineTo(bl.x + 3, bl.y - 30).lineTo(bl.x - 2, bl.y - 14).lineTo(bl.x, bl.y);
      specialG.stroke({ color: bl.color, width: 2, alpha: 0.9 });
    }

    // 폭발 파문
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.life -= dt;
      if (rg.life <= 0) { rings.splice(i, 1); continue; }
      const k = 1 - rg.life / rg.max;
      specialG.circle(rg.x, rg.y, rg.r * (0.45 + k * 0.55));
      specialG.stroke({ color: rg.color, width: 2, alpha: (1 - k) * 0.85 });
    }

    // 경험치
    gemG.clear();
    let gemAny = false;
    for (const g of gems) {
      if (!onScreen(g.x, g.y)) continue;
      gemG.rect(Math.round(g.x) - 2, Math.round(g.y) - 2, 4, 4);
      gemAny = true;
    }
    if (gemAny) {
      gemG.fill({ color: 0x4fd6e8 });
      for (const g of gems) {
        if (!onScreen(g.x, g.y)) continue;
        gemG.rect(Math.round(g.x) - 1, Math.round(g.y) - 1, 2, 2);
      }
      gemG.fill({ color: 0xd8fbff });
    }

    // 회복 캡슐 — 곧 사라질 때는 깜빡여서 알린다
    for (const cap of heals) {
      if (!onScreen(cap.x, cap.y)) continue;
      if (cap.life < 3 && Math.floor(cap.life * 6) % 2 === 0) continue;
      gemG.rect(cap.x - 5, cap.y - 5, 10, 10).fill({ color: 0x0a1024 });
      gemG.rect(cap.x - 4, cap.y - 4, 8, 8).fill({ color: 0x3fd06a });
      gemG.rect(cap.x - 1, cap.y - 3, 2, 6).fill({ color: 0xdcffe8 });
      gemG.rect(cap.x - 3, cap.y - 1, 6, 2).fill({ color: 0xdcffe8 });
    }


    // 옵션 유닛
    droneG.clear();
    for (let d = 0; d < w.drones; d++) {
      const ang = droneAngle + (d / w.drones) * Math.PI * 2;
      const dx = Math.round(px + Math.cos(ang) * 30);
      const dy = Math.round(py - 12 + Math.sin(ang) * 20);
      droneG.rect(dx - 3, dy - 3, 6, 6).fill({ color: 0x2f6fd0 });
      droneG.rect(dx - 2, dy - 2, 4, 4).fill({ color: 0x8ef0ff });
    }

    // 펫 — 주위를 돌면서 직접 싸우는 조력자들
    petG.clear();
    petBackG.clear();
    if (phase === 'play') {
      for (const id of ownedPets()) {
        const p = petPos(id);
        // 궤도 뒤쪽을 돌 때는 플레이어 뒤로 넘긴다
        const g = p.y < py - 15 ? petBackG : petG;
        // 바닥 그림자 — 없으면 공중에 붕 뜬 스티커로 보인다
        g.ellipse(Math.round(p.x), Math.round(py - 1), 7, 2.5)
          .fill({ color: 0x000000, alpha: 0.28 });
        const fl = petFlash.get(id) ?? 0;
        if (fl > 0) {
          g.circle(Math.round(p.x), Math.round(p.y), 13 * (fl / 0.2) + 4)
            .fill({ color: 0xffffff, alpha: 0.22 * (fl / 0.2) });
        }
        drawPet(g, id, Math.round(p.x), Math.round(p.y), p.dir, animClock);
      }
    }

    // HUD
    hudBar.clear();
    // 세로 화면은 폭이 270뿐이라 한 줄에 다 못 넣는다 — 두 줄로 나눈다
    hudBar.rect(0, 0, W, 26).fill({ color: 0x000000, alpha: 0.55 });
    hudBar.rect(0, 25, W, 1).fill({ color: 0x2b3560, alpha: 0.9 });
    // 체력 — 칸을 나눠서 그냥 색칠된 띠가 아니라 계기판처럼 보이게 한다
    const hpW = 120;
    const hpFill = Math.round(hpW * clamp(hp / maxHp, 0, 1));
    hudBar.rect(6, 17, hpW, 5).fill({ color: 0x2a1420 });
    hudBar.rect(6, 17, hpFill, 5).fill({ color: 0xff5c78 });
    for (let seg = 10; seg < hpW; seg += 10) hudBar.rect(6 + seg, 17, 1, 5).fill({ color: 0x000000, alpha: 0.35 });
    hudBar.rect(6, 17, hpW, 1).fill({ color: 0xffb0c0, alpha: 0.5 });
    // 경험치
    hudBar.rect(0, 26, W, 2).fill({ color: 0x12203a });
    hudBar.rect(0, 26, Math.round(W * clamp(xp / xpNeed, 0, 1)), 2).fill({ color: 0x4fd6e8 });

    // 보유 특수무기 — 색 칸과 레벨 눈금. 뭘 뽑았는지 한눈에 보여야 한다
    let hx = 134;
    for (const def of ALL_WEAPONS) {
      const lv = owned.get(def.id) ?? 0;
      if (!lv) continue;
      // 레전드는 등급색 테두리를 둘러 기본 무기와 한눈에 구분되게 한다
      if (def.rarity) {
        hudBar.rect(hx - 1, 15, 12, 9).fill({ color: RARITY_COLOR[def.rarity] });
      }
      // 색만 칠한 사각형은 아이콘이 아니라 색인표처럼 보인다 — 테두리와
      // 하이라이트를 둘러 작은 칩처럼 만든다
      hudBar.rect(hx, 16, 10, 7).fill({ color: 0x000000, alpha: 0.4 });
      hudBar.rect(hx + 1, 17, 8, 5).fill({ color: def.color });
      hudBar.rect(hx + 1, 17, 8, 1).fill({ color: 0xffffff, alpha: 0.55 });
      hudBar.rect(hx + 1, 17, 8, 5).stroke({ color: 0x0a0a12, width: 1, alpha: 0.6 });
      for (let i = 0; i < lv; i++) hudBar.rect(hx + i * 2, 13, 1, 2).fill({ color: 0xffffff });
      hx += 14;
    }

    // 튜닝용 계측 — 화면만 보고 "적당히 많네" 하고 넘기면 밀도를 못 맞춘다
    const dbg = window as unknown as Record<string, unknown>;
    dbg.__hordeTime = time;
    dbg.__hordeDead = phase === 'dead';
    dbg.__hordeStageClear = phase === 'stage_clear';
    dbg.__hordePhase = phase;
    dbg.__hordeStat = {
      foes: foes.length, bullets: bullets.length, lv: level, kills, hp: Math.round(hp),
      shots: w.shots, itv: +w.interval.toFixed(3), fps: Math.round(app.ticker.FPS),
      wep: [...owned].map(([id, l]) => `${id}${l}`).join(','),
      face: facing,
      anim: hero?.current ?? '',
      style: w.style,
      dmg: w.dmg,
      char: charDef.id,
      stick: stick ? `${Math.round(stick.x - stick.ox)},${Math.round(stick.y - stick.oy)}` : null,
      coins,
      pity: pityCount,
    };
    dbg.__hordePick = phase === 'pick'
      ? pickList.map((o) => (o.kind === 'stat' ? o.up.id : o.def.id))
      : null;
    dbg.__hordePickIndex = pickIndex;
    dbg.__hordeTheme = theme.id;
    dbg.__hordeGacha = phase === 'gacha';
    dbg.__hordeBossSelect = phase === 'boss_select' ? bossPickList.map((d) => d.id) : null;
    dbg.__hordeBossIntro = bossIntroT;
    dbg.__hordeArmor = [...armor].join(',');
    dbg.__hordeETank = eTanks;
    dbg.__hordeCaps = capsules.length;
    dbg.__hordeRideT = Math.round(rideT);
    dbg.__hordePos = [Math.round(px), Math.round(py)];
    dbg.__hordeBoss = boss ? { name: boss.name, hp: Math.round(boss.hp), max: boss.maxHp, elem: boss.def.elem, label: bossLabel.text } : null;
    dbg.__hordeHostiles = hostiles.length;
    dbg.__hordeBullets = bullets.map((b) => ({
      x: Math.round(b.x), y: Math.round(b.y),
      vx: Math.round(b.vx), vy: Math.round(b.vy),
      r: b.r, spin: b.spin, homing: b.homing, angle: +b.angle.toFixed(2),
    }));

    // 스테이지 진입 배너 — 어떤 구역에 누구를 잡으러 왔는지 시작하자마자 보여준다
    stageLabel.visible = stageBanner > 0 && phase === 'play';
    if (stageLabel.visible) {
      const bossName = stageBoss ? (ENEMY_NAMES[stageBoss.id] ?? stageBoss.id) : '';
      stageLabel.text = bossName ? `${theme.name} · ${bossName}` : theme.name;
      stageLabel.style.fill = theme.accent;
      stageLabel.alpha = Math.min(1, stageBanner / 0.6);
    }
    muteLabel.text = sfx.muted ? '♪ OFF (M)' : '';

    // 아머를 먹으면 뭘 얻었는지 알려준다 — 안 알려주면 뭐가 좋아졌는지 모른다
    if (armorBanner > 0 && armorGot && phase === 'play') {
      armorBanner -= dt;
      const info = ARMOR_INFO[armorGot];
      stageLabel.visible = true;
      stageLabel.text = `${info.name}\n${info.desc}`;
      stageLabel.style.fill = info.color;
      stageLabel.alpha = Math.min(1, armorBanner / 0.5);
    }

    // 기가 크래시 — 위력에 비해 밋밋하다는 피드백으로 손봤다. 발동 순간
    // 히트스톱으로 잠깐 멎었다가(fire() 에서 건다) 정지된 그 프레임에 섬광이
    // 최고조로 걸려 있어야 "터졌다"가 확 온다. 그 다음 별 모양 코어 →
    // 이중 빛기둥(굵은 백색 + 가는 금색) → 갈라지는 균열 → 잔광 고리 순으로
    // 겹쳐서 화면 하나로 끝나던 예전보다 훨씬 두꺼운 인상을 남긴다.
    if (gigaFlash > 0) {
      const k = gigaFlash / 0.6;
      const inv = 1 - k;
      hudBar.rect(0, 0, W, H).fill({ color: 0xffffff, alpha: Math.min(1, k * k * 1.5) });
      hudBar.rect(0, 0, W, H).fill({ color: 0xfff2c0, alpha: k * 0.45 });

      const cxs = W / 2;
      const cys = H / 2;

      // 코어 별 — 섬광 한가운데가 비어 있으면 허전하다
      const spikes = 8;
      const coreR = 14 + k * 26;
      hudBar.moveTo(cxs + coreR, cys);
      for (let i = 1; i <= spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? coreR : coreR * 0.42;
        hudBar.lineTo(cxs + Math.cos(a) * rr, cys + Math.sin(a) * rr);
      }
      hudBar.fill({ color: 0xffffff, alpha: k * 0.9 });

      // 빛기둥 — 굵은 백색 한 겹 + 그 사이를 메우는 가는 금색 한 겹
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + gigaFlash * 4;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const len = 60 + inv * 460;
        const wdt = 5 + k * 22;
        hudBar.moveTo(cxs + c * 10 - sn * wdt, cys + sn * 10 + c * wdt)
          .lineTo(cxs + c * len, cys + sn * len)
          .lineTo(cxs + c * 10 + sn * wdt, cys + sn * 10 - c * wdt)
          .closePath();
      }
      hudBar.fill({ color: 0xffffff, alpha: k * 0.5 });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + gigaFlash * 4 + 0.22;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const len = 40 + inv * 340;
        const wdt = 3 + k * 12;
        hudBar.moveTo(cxs + c * 10 - sn * wdt, cys + sn * 10 + c * wdt)
          .lineTo(cxs + c * len, cys + sn * len)
          .lineTo(cxs + c * 10 + sn * wdt, cys + sn * 10 - c * wdt)
          .closePath();
      }
      hudBar.fill({ color: 0xfff2c0, alpha: k * 0.6 });

      // 갈라지는 균열 — 꺾인 선이라야 "깨졌다"로 읽힌다
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.4;
        let x = cxs;
        let y = cys;
        hudBar.moveTo(x, y);
        for (let seg = 0; seg < 5; seg++) {
          const step = (44 + seg * 24) * inv;
          x += Math.cos(a + Math.sin(seg * 3 + i) * 0.5) * step;
          y += Math.sin(a + Math.sin(seg * 3 + i) * 0.5) * step;
          hudBar.lineTo(x, y);
        }
      }
      hudBar.stroke({ color: 0xfff2c0, width: 2, alpha: k * 0.9 });

      // 잔광 고리 — 색을 번갈아 겹쳐 두께감을 준다
      for (let i = 0; i < 4; i++) {
        const kk = Math.min(1, inv * 1.3 + i * 0.14);
        hudBar.circle(cxs, cys, kk * 320)
          .stroke({ color: i % 2 ? 0xfff2c0 : 0xffffff, width: 5 * (1 - kk), alpha: (1 - kk) * k * 2 });
      }
    }

    // E탱크 — 몇 개 들고 있는지
    if (phase !== 'select') {
      for (let i = 0; i < E_TANK_MAX; i++) {
        const ex = 6 + i * 9;
        hudBar.rect(ex, 30, 7, 9).fill({ color: 0x14301f });
        if (i < eTanks) {
          hudBar.rect(ex + 1, 31, 5, 7).fill({ color: 0x3fd06a });
          hudBar.rect(ex + 2, 32, 3, 2).fill({ color: 0xdcffe8 });
        }
        hudBar.rect(ex, 30, 7, 1).fill({ color: 0x8ef0a0, alpha: 0.5 });
      }
      // 아머 파츠 — 먹은 칸만 색이 들어온다
      const slots: ArmorSlot[] = ['head', 'body', 'arm', 'foot'];
      for (let i = 0; i < slots.length; i++) {
        const ax = 42 + i * 8;
        const on = armor.has(slots[i]);
        hudBar.rect(ax, 31, 6, 7)
          .fill({ color: on ? ARMOR_INFO[slots[i]].color : 0x1a2340, alpha: on ? 1 : 0.6 });
      }
    }

    // 가챠 코인 — 얼마나 모였는지가 보여야 다음 한 개가 급해진다
    if (phase !== 'select') {
      const cw = 46;
      const cx0 = W - cw - 6;
      hudBar.rect(cx0, 30, cw, 7).fill({ color: 0x2a2410 });
      hudBar.rect(cx0, 30, Math.round(cw * clamp(coins / COINS_PER_PULL, 0, 1)), 7)
        .fill({ color: 0xffd05c });
      hudBar.rect(cx0, 30, cw, 1).fill({ color: 0xfff2c0, alpha: 0.5 });
    }

    // 보스 체력 — 화면 위에 따로 붙인다. 얼마나 남았는지가 안 보이면
    // 언제까지 버텨야 하는지를 몰라서 그냥 도망만 다니게 된다.
    bossLabel.visible = !!boss && phase === 'play';
    if (boss && phase === 'play') {
      const be = boss.def.elem;
      // 무엇으로 때려야 잘 들어가는지 같이 보여준다.
      // 이게 없으면 상성이 있다는 사실 자체를 모른 채 끝난다.
      const counter = (Object.keys(BEATS) as Element[]).find((e) => e !== 'none' && BEATS[e] === be);
      bossLabel.text = be === 'none'
        ? boss.name
        : `${boss.name}  [${ELEM_NAME[be]}]` + (counter ? `  약점 ${ELEM_NAME[counter]}` : '');
      bossLabel.style.fill = ELEM_COLOR[be];
      const bw = W - 40;
      // 문이 열리는 동안은 체력바가 0에서 칸칸이 차오른다 — 처음부터
      // 꽉 차 있으면 "만난 순간"이 아니라 "원래 있던 것"으로 읽힌다
      let hpRatio = clamp(boss.hp / boss.maxHp, 0, 1);
      if (bossIntroT > 0) {
        const elapsed = BOSS_INTRO_DUR - bossIntroT;
        hpRatio = clamp(
          (elapsed - BOSS_INTRO_FILL_START) / (BOSS_INTRO_FILL_END - BOSS_INTRO_FILL_START),
          0, 1,
        );
      }
      hudBar.rect(20, 42, bw, 6).fill({ color: 0x2a1420 });
      hudBar.rect(20, 42, Math.round(bw * hpRatio), 6).fill({ color: 0xff5c78 });
      hudBar.rect(20, 42, bw, 1).fill({ color: 0xffb0c8, alpha: 0.6 });
    }
    // 보스 문 — 처음 마주친 순간이라는 걸 알려주는 잠깐의 암전
    if (bossIntroT > 0 && boss) {
      const elapsed = BOSS_INTRO_DUR - bossIntroT;
      const dim = 1 - clamp(elapsed / BOSS_INTRO_FILL_START, 0, 1);
      if (dim > 0) hudBar.rect(0, 0, W, H).fill({ color: 0x000000, alpha: dim * 0.75 });
    }
    if (bossBanner > 0 && phase === 'play') {
      stageLabel.visible = true;
      stageLabel.text = '경 고';
      stageLabel.style.fill = 0xff5c78;
      stageLabel.alpha = Math.floor(bossBanner * 8) % 2 === 0 ? 1 : 0.25;
    }

    timeLabel.text = `${Math.floor(time)}s`;
    killLabel.text = `KILL ${kills}`;
    lvLabel.text = `Lv.${level}`;

    if (phase === 'dead') {
      centerLabel.position.set(W / 2, H / 2 - 34);
      centerLabel.text = '격 파 당 함';
      subLabel.position.set(W / 2, H / 2 + 2);
      const b = best[charDef.id];
      subLabel.text =
        `${Math.floor(time)}초 · ${kills}킬 · Lv.${level}` +
        (bossKills ? ` · 보스 ${bossKills}` : '') +
        (newRecord ? '\n★ 최고 기록 ★' : b ? `\n최고 ${b.t}초 · ${b.kills}킬` : '') +
        '\n화면을 누르면 재시도';
      hintLabel.text = '';
      cardG.clear();
      // 밝아진 배경 위에서는 글자만 얹으면 안 읽힌다 — 판을 깔고 올린다
      for (const t of cardTexts) t.text = '';
      for (const b of cardBadges) b.visible = false;
      cardG.roundRect(14, H / 2 - 56, W - 28, 112, 5).fill({ color: 0x05070f, alpha: 0.9 });
      cardG.roundRect(14, H / 2 - 56, W - 28, 112, 5).stroke({ color: 0x3a4a90, width: 1 });
      cardG.roundRect(BTN_CHAR.x, BTN_CHAR.y, BTN_CHAR.w, BTN_CHAR.h, 4).fill({ color: 0x16203f });
      cardG.roundRect(BTN_CHAR.x, BTN_CHAR.y, BTN_CHAR.w, BTN_CHAR.h, 4).stroke({ color: 0x4f6198, width: 1 });
      charBtnLabel.visible = true;
    } else if (phase === 'stage_clear') {
      centerLabel.position.set(W / 2, H / 2 - 34);
      centerLabel.text = 'STAGE CLEAR';
      subLabel.position.set(W / 2, H / 2 + 2);
      const nm = stageBoss ? (ENEMY_NAMES[stageBoss.id] ?? stageBoss.id) : '';
      subLabel.text =
        `${nm} 격파 · ${Math.floor(time)}초 · ${kills}킬 · Lv.${level}` +
        (lastClearWeaponName ? `\n무기 획득 · ${lastClearWeaponName}` : '') +
        '\n화면을 누르면 다음 스테이지로';
      hintLabel.text = '';
      cardG.clear();
      for (const t of cardTexts) t.text = '';
      for (const b of cardBadges) b.visible = false;
      // 죽음 화면과 같은 틀에 테두리만 금빛으로 — 같은 종류의 결과 화면인데
      // 이건 실패가 아니라 성공이라는 걸 색으로 구분한다
      cardG.roundRect(14, H / 2 - 56, W - 28, 112, 5).fill({ color: 0x05070f, alpha: 0.9 });
      cardG.roundRect(14, H / 2 - 56, W - 28, 112, 5).stroke({ color: 0xffd05c, width: 1 });
      cardG.roundRect(BTN_CHAR.x, BTN_CHAR.y, BTN_CHAR.w, BTN_CHAR.h, 4).fill({ color: 0x16203f });
      cardG.roundRect(BTN_CHAR.x, BTN_CHAR.y, BTN_CHAR.w, BTN_CHAR.h, 4).stroke({ color: 0x4f6198, width: 1 });
      charBtnLabel.visible = true;
    } else if (paused && phase === 'play') {
      cardG.clear();
      cardG.rect(0, 0, W, H).fill({ color: 0x05070f, alpha: 0.7 });
      centerLabel.position.set(W / 2, H / 2 - 10);
      centerLabel.text = '일시정지';
      subLabel.text = '아무 키나 눌러 계속';
      hintLabel.text = '';
    } else if (phase === 'pick') {
      // drawPick() 이 먼저 돌고 draw() 가 나중이라, 여기서 비우면 제목이 지워진다
      centerLabel.position.set(W / 2, 42);
      subLabel.position.set(W / 2, H / 2 + 8);
      centerLabel.text = 'LEVEL UP';
      subLabel.text = '';
      hintLabel.text = '카드를 눌러 선택';
    } else {
      centerLabel.text = '';
      subLabel.text = '';
      hintLabel.text = eTanks > 0 && hp < maxHp * 0.5
        ? (touchMode ? 'E탱크 있음 — 위로 밀어 사용' : 'E탱크 있음 — ↑ 로 사용')
        : time < 9 ? (touchMode ? '끌어서 이동 · CHARGE 길게 눌러 차지' : '방향키 이동 · X 길게 눌러 차지') : '';
    }

    if (phase !== 'pick' && phase !== 'dead' && phase !== 'stage_clear') {
      cardG.clear();
      for (const t of cardTexts) t.text = '';
      for (const b of cardBadges) b.visible = false;
      charBtnLabel.visible = false;
    }

    // 터치 조작 표시 — 레벨업 카드가 떠 있는 동안은 숨긴다.
    // 카드를 손가락으로 짚는 화면에 조작 패드가 겹쳐 있으면 뭘 누르는지 모른다.
    padG.clear();
    dashLabel.visible = touchMode && phase === 'play';
    fireLabel.visible = touchMode && phase === 'play';
    if (fireLabel.visible) fireLabel.position.set(FIRE_BTN.x, FIRE_BTN.y);
    if (touchMode && phase === 'play') {
      // 대시 — 쿨다운 회복률을 쐐기로 채운다. 다 차면 테두리가 확 밝아진다.
      dashLabel.position.set(DASH_BTN.x, DASH_BTN.y);
      const cd = dashCd > 0 ? 1 - dashCd / DASH_CD : 1;
      dashLabel.alpha = cd >= 1 ? 0.95 : 0.45;
      drawTouchButton(padG, DASH_BTN.x, DASH_BTN.y, DASH_BTN.r, {
        accent: 0x8ef0ff, fill01: cd, ready: cd >= 1, pressed: dashId !== null,
      });

      // 차지 — 눌러 모은 정도를 같은 쐐기로 채운다. 다 찬 뒤(2단)에는
      // 색을 금빛으로 바꿔 "지금 놓으면 최대치"를 알린다. 지금까지는
      // 이 자리에 글자 일곱 개뿐이라 버튼 자체가 안 보였다.
      fireLabel.position.set(FIRE_BTN.x, FIRE_BTN.y);
      const chargeFrac = chargeT > 0 ? Math.min(1, chargeT / CHARGE_STEP[1]) : 0;
      const chargeReady = chargeLevel > 0;
      fireLabel.alpha = chargeReady ? 1 : 0.55;
      drawTouchButton(padG, FIRE_BTN.x, FIRE_BTN.y, FIRE_BTN.r, {
        accent: chargeLevel === 2 ? 0xfff2c0 : 0xffd85c,
        fill01: chargeFrac, ready: chargeReady, pressed: fireId !== null,
      });

      if (stick) {
        padG.circle(stick.ox, stick.oy, STICK.radius).fill({ color: 0xffffff, alpha: 0.06 });
        padG.circle(stick.ox, stick.oy, STICK.radius).stroke({ color: 0xffffff, alpha: 0.22, width: 1 });
        const dx = stick.x - stick.ox;
        const dy = stick.y - stick.oy;
        const d = Math.hypot(dx, dy);
        const k = d > STICK.radius ? STICK.radius / d : 1;
        padG.circle(stick.ox + dx * k, stick.oy + dy * k, 9).fill({ color: 0xdfe8ff, alpha: 0.34 });
      }
    }
  }

  function drawPick(): void {
    cardG.clear();
    cardG.rect(0, 0, W, H).fill({ color: 0x05070f, alpha: 0.72 });

    // 세로 화면이라 카드를 가로로 늘어놓을 수 없다 — 위에서 아래로 쌓는다.
    // 손가락으로 짚을 거라 한 장을 화면 폭 거의 전부로 잡는다.
    const cw = W - 28;
    const ch = 86;
    const gap = 14;
    const total = pickList.length * ch + (pickList.length - 1) * gap;
    const x = 14;
    const y0 = (H - total) / 2 + 10;
    cardRects.length = 0;
    for (let i = 0; i < pickList.length; i++) {
      const cy = y0 + i * (ch + gap);
      const on = i === pickIndex;
      cardRects.push({ x, y: cy, w: cw, h: ch });
      const o = pickList[i];
      const isNew = o.kind === 'weapon' && o.lv === 0;
      drawPanel(cardG, x, cy, cw, ch, {
        fill: on ? 0x1e3266 : 0x11172e,
        accent: o.kind === 'weapon' ? o.def.color : 0x8ef0ff,
        active: on,
      });

      // 무기 카드는 위쪽에 그 무기 색의 띠를 둘러 능력치 카드와 구분한다
      if (o.kind === 'weapon') {
        cardG.rect(x + 10, cy + 3, cw - 20, 4).fill({ color: o.def.color, alpha: on ? 1 : 0.55 });
      }

      const name = cardTexts[i * 2];
      const desc = cardTexts[i * 2 + 1];
      const badge = cardBadges[i];
      if (o.kind === 'stat') {
        name.text = o.up.name;
        desc.text = o.up.desc;
        badge.text = '';
      } else {
        name.text = o.def.name;
        desc.text = o.def.desc(o.lv);
        badge.text = isNew ? 'NEW' : `Lv.${o.lv} → ${o.lv + 1}`;
        badge.style.fill = isNew ? 0xffd85c : 0x8ef0ff;
        badge.position.set(x + cw / 2, cy + 18);
      }
      badge.visible = badge.text !== '';
      name.style.fill = on ? 0xffffff : 0x9fb0dd;
      name.position.set(x + cw / 2, cy + 43);
      desc.position.set(x + cw / 2, cy + 66);
    }
    for (let i = pickList.length; i < 3; i++) {
      cardTexts[i * 2].text = '';
      cardTexts[i * 2 + 1].text = '';
      cardBadges[i].visible = false;
    }
  }
}
