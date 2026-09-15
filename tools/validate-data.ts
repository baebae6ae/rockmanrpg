/**
 * 데이터 검증 — 빌드 전에 데이터가 스키마(docs/DESIGN.md §6)를 지키는지,
 * 참조하는 스프라이트가 실제로 존재하는지 확인한다.
 *
 * 캐릭터가 수백 개로 늘어나면 사람 눈으로는 못 잡으므로 여기서 잡는다.
 *
 * 실행: npm run validate
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** §5.5 — 이게 없으면 캐릭터가 동작하지 않는다 */
const REQUIRED_TAGS = ['idle', 'run', 'jump_rise', 'jump_fall', 'hurt', 'death', 'attack_main'];

const MOVEMENT_FLAGS = [
  'can_dash',
  'can_air_dash',
  'can_wall_kick',
  'can_double_jump',
  'can_climb_ladder',
  'can_slide',
];

const errors: string[] = [];
const warnings: string[] = [];

function fail(where: string, message: string): void {
  errors.push(`  ✗ ${where}: ${message}`);
}

function warn(where: string, message: string): void {
  warnings.push(`  ! ${where}: ${message}`);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(path, `JSON 파싱 실패 — ${(e as Error).message}`);
    return null;
  }
}

/** assets/sprites 를 우선하고 없으면 assets/generated 를 본다 (런타임 로더와 동일 규칙) */
function findSheet(kind: string, id: string): { dir: string; source: string } | null {
  for (const source of ['sprites', 'generated']) {
    const dir = resolve(ROOT, `assets/${source}/${kind}/${id}`);
    if (existsSync(resolve(dir, `${id}.png`)) && existsSync(resolve(dir, `${id}.json`))) {
      return { dir, source };
    }
  }
  return null;
}

const charDir = resolve(ROOT, 'data/characters');
const files = existsSync(charDir) ? readdirSync(charDir).filter((f) => f.endsWith('.json')) : [];

if (files.length === 0) fail('data/characters', '캐릭터 데이터가 하나도 없다');

/** 아래 "호드 모드 내부 표" 검증에서 쓴다 — 캐릭터별 archetype 을 여기서 같이 모은다 */
const characterIds: { id: string; archetype: string }[] = [];

for (const file of files) {
  const where = `data/characters/${file}`;
  const def = readJson(resolve(charDir, file)) as Record<string, any> | null;
  if (!def) continue;

  const expectedId = file.replace(/\.json$/, '');
  if (def.id !== expectedId) fail(where, `id 가 파일명과 다르다 (${def.id} ≠ ${expectedId})`);
  if (typeof def.archetype === 'string') characterIds.push({ id: expectedId, archetype: def.archetype });

  for (const key of ['name', 'series', 'archetype', 'hitbox', 'movement']) {
    if (def[key] === undefined) fail(where, `필수 필드 누락: ${key}`);
  }

  if (def.hitbox && (!def.hitbox.w || !def.hitbox.h)) {
    fail(where, 'hitbox 에 w/h 가 필요하다');
  }

  if (def.movement) {
    for (const flag of MOVEMENT_FLAGS) {
      if (typeof def.movement[flag] !== 'boolean') {
        fail(where, `movement.${flag} 가 boolean 이 아니다`);
      }
    }
  }

  if (def.sprite_scale !== undefined && !Number.isInteger(def.sprite_scale)) {
    fail(where, `sprite_scale 은 정수여야 한다 (§2) — ${def.sprite_scale}`);
  }

  // 스프라이트 시트
  const sheet = findSheet('characters', expectedId);
  if (!sheet) {
    fail(where, `스프라이트가 없다 — assets/{sprites,generated}/characters/${expectedId}/`);
    continue;
  }

  const meta = readJson(resolve(sheet.dir, `${expectedId}.json`)) as Record<string, any> | null;
  if (!meta) continue;

  const metaWhere = `${sheet.source}/characters/${expectedId}`;
  if (!meta.canvas?.w || !meta.canvas?.h) fail(metaWhere, 'canvas 크기가 없다');
  if (!meta.columns) fail(metaWhere, 'columns 가 없다');

  const tags = Object.keys(meta.tags ?? {});
  for (const tag of REQUIRED_TAGS) {
    if (!tags.includes(tag)) fail(metaWhere, `필수 애니메이션 태그 누락: ${tag}`);
  }
  if (sheet.source === 'generated') {
    warn(where, '아직 임시 도트를 쓰고 있다 (진짜 스프라이트로 교체 가능)');
  }
}

// ---------------------------------------------------------------- 적·패턴·맵

/** §7.1 — 인터프리터가 아는 프리미티브. 새 op 을 추가하면 여기도 갱신한다. */
const KNOWN_OPS = new Set([
  'wait', 'anim', 'telegraph', 'face_player', 'invulnerable',
  'loop', 'if_hp_below', 'random',
  'move_to', 'charge', 'jump', 'teleport',
  'shoot', 'shoot_aimed', 'melee',
]);

const MOB_TAGS = ['idle', 'hurt', 'death'];
const BOSS_TAGS = ['idle', 'move', 'telegraph', 'attack_1', 'hurt', 'death'];

function readAll(dir: string): { id: string; where: string; data: Record<string, any> }[] {
  const full = resolve(ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      id: f.replace(/\.json$/, ''),
      where: `${dir}/${f}`,
      data: readJson(resolve(full, f)) as Record<string, any>,
    }))
    .filter((e) => e.data);
}

function walkOps(steps: unknown, where: string): void {
  if (!Array.isArray(steps)) return;
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const op = (step as Record<string, unknown>).op;
    if (typeof op !== 'string' || !KNOWN_OPS.has(op)) {
      fail(where, `알 수 없는 프리미티브: ${String(op)}`);
    }
    walkOps((step as Record<string, unknown>).then, where);
    for (const branch of ((step as Record<string, unknown>).options as unknown[]) ?? []) {
      walkOps(branch, where);
    }
  }
}

const patterns = readAll('data/patterns');
for (const { id, where, data } of patterns) {
  if (data.id !== id) fail(where, `id 가 파일명과 다르다 (${data.id} ≠ ${id})`);
  if (!Array.isArray(data.sequence) || data.sequence.length === 0) {
    fail(where, 'sequence 가 비어 있다');
    continue;
  }
  walkOps(data.sequence, where);
}
const patternIds = new Set(patterns.map((p) => p.id));

const enemies = readAll('data/enemies');
for (const { id, where, data } of enemies) {
  if (data.id !== id) fail(where, `id 가 파일명과 다르다 (${data.id} ≠ ${id})`);

  for (const key of ['name', 'tier', 'hitbox', 'stats', 'element', 'pattern']) {
    if (data[key] === undefined) fail(where, `필수 필드 누락: ${key}`);
  }
  if (data.stats && (data.stats.hp === undefined || data.stats.exp === undefined)) {
    fail(where, 'stats 에 hp 와 exp 가 필요하다');
  }
  if (data.pattern && !patternIds.has(data.pattern)) {
    fail(where, `참조하는 패턴이 없다: ${data.pattern}`);
  }

  const sheet = findSheet('enemies', id);
  if (!sheet) {
    fail(where, `스프라이트가 없다 — assets/{sprites,generated}/enemies/${id}/`);
    continue;
  }
  const meta = readJson(resolve(sheet.dir, `${id}.json`)) as Record<string, any> | null;
  if (!meta) continue;

  const required = data.tier === 'boss' || data.tier === 'signature' ? BOSS_TAGS : MOB_TAGS;
  const tags = Object.keys(meta.tags ?? {});
  for (const tag of required) {
    if (!tags.includes(tag)) {
      fail(`${sheet.source}/enemies/${id}`, `필수 애니메이션 태그 누락: ${tag}`);
    }
  }
}
const enemyIds = new Set(enemies.map((e) => e.id));

const mapList = readAll('data/maps');
const mapIds = new Set(mapList.map((m) => m.id));

for (const { where, data } of mapList) {
  for (const key of ['width', 'height', 'ground_y', 'player_spawn', 'solids']) {
    if (data[key] === undefined) fail(where, `필수 필드 누락: ${key}`);
  }
  if (!Array.isArray(data.solids) || data.solids.length === 0) {
    fail(where, 'solids 가 비어 있다 — 바닥이 없으면 플레이어가 떨어진다');
  } else {
    data.solids.forEach((s: Record<string, any>, i: number) => {
      for (const k of ['x', 'y', 'w', 'h']) {
        if (typeof s[k] !== 'number') fail(where, `solids[${i}].${k} 가 숫자가 아니다`);
      }
      if (s.w <= 0 || s.h <= 0) fail(where, `solids[${i}] 의 크기가 0 이하다`);
    });
  }

  for (const spawn of (data.spawns ?? []) as Record<string, unknown>[]) {
    if (!enemyIds.has(String(spawn.enemy))) {
      fail(where, `배치가 참조하는 적이 없다: ${String(spawn.enemy)}`);
    }
    if (typeof spawn.x === 'number' && data.width && (spawn.x < 0 || spawn.x > data.width)) {
      fail(where, `배치가 맵 밖이다: ${String(spawn.enemy)} x=${String(spawn.x)}`);
    }
  }
}

// ---------------------------------------------------------------- 무기·장비

const SLOTS = new Set(['head', 'body', 'arm', 'foot']);
const ELEMENTS = new Set(
  ((readJson(resolve(ROOT, 'data/elements.json')) as Record<string, any>)?.elements ?? []) as string[],
);

const skills = readAll('data/skills');
for (const { id, where, data } of skills) {
  if (data.id !== id) fail(where, `id 가 파일명과 다르다 (${data.id} ≠ ${id})`);

  for (const key of ['name', 'element', 'cost', 'cooldown', 'unlock', 'upgrade', 'effects']) {
    if (data[key] === undefined) fail(where, `필수 필드 누락: ${key}`);
  }

  if (data.element && ELEMENTS.size > 0 && !ELEMENTS.has(data.element)) {
    fail(where, `elements.json 에 없는 속성: ${data.element}`);
  }

  const up = data.upgrade;
  if (up) {
    if (!Array.isArray(up.sp_cost)) fail(where, 'upgrade.sp_cost 는 배열이어야 한다');
    else if (up.sp_cost.length < (up.max_level ?? 1) - 1) {
      fail(where, `upgrade.sp_cost 가 max_level 에 비해 짧다 (${up.sp_cost.length} < ${up.max_level - 1})`);
    }
  }

  if (Array.isArray(data.effects) && !data.effects.some((e: any) => e.type === 'damage')) {
    warn(where, 'damage 효과가 없다 — 위력이 기본값으로 처리된다');
  }

  if (data.unlock?.source === 'boss' && !enemyIds.has(String(data.unlock.boss_id))) {
    fail(where, `해금 조건이 참조하는 보스가 없다: ${String(data.unlock.boss_id)}`);
  }
}
const skillIds = new Set(skills.map((s) => s.id));

const itemsList = readAll('data/items');
for (const { id, where, data } of itemsList) {
  if (data.id !== id) fail(where, `id 가 파일명과 다르다 (${data.id} ≠ ${id})`);
  if (!data.name) fail(where, '필수 필드 누락: name');

  if (data.kind === 'armor') {
    if (!SLOTS.has(data.slot)) fail(where, `알 수 없는 장비 슬롯: ${data.slot}`);
  } else if (data.kind === 'consumable') {
    if (!data.use || (data.use.hp === undefined && data.use.energy === undefined)) {
      fail(where, '소모품에 use.hp 또는 use.energy 가 필요하다');
    }
  } else {
    fail(where, `알 수 없는 아이템 종류: ${data.kind}`);
  }

  if (data.price !== undefined && (typeof data.price !== 'number' || data.price < 0)) {
    fail(where, `price 가 올바르지 않다: ${String(data.price)}`);
  }
}
const itemIds = new Set(itemsList.map((i) => i.id));

// 캐릭터의 기본 무기가 실제로 있는지
for (const file of files) {
  const def = readJson(resolve(charDir, file)) as Record<string, any> | null;
  for (const sid of def?.starting_skills ?? []) {
    if (!skillIds.has(sid)) fail(`data/characters/${file}`, `기본 무기가 없다: ${sid}`);
  }
}

for (const { where, data } of readAll('data/maps')) {
  for (const entry of (data.items ?? []) as Record<string, unknown>[]) {
    if (!itemIds.has(String(entry.id))) {
      fail(where, `배치가 참조하는 아이템이 없다: ${String(entry.id)}`);
    }
  }

  // 포탈이 실제로 존재하는 맵·포탈을 가리키는지
  for (const portal of (data.portals ?? []) as Record<string, any>[]) {
    const target = mapList.find((m) => m.id === portal.to_map);
    if (!mapIds.has(String(portal.to_map))) {
      fail(where, `포탈이 없는 맵을 가리킨다: ${String(portal.to_map)}`);
      continue;
    }
    const back = (target?.data.portals ?? []).some((q: any) => q.id === portal.to_portal);
    if (!back) {
      fail(where, `포탈 ${String(portal.id)} 의 도착 포탈이 없다: ${String(portal.to_map)}#${String(portal.to_portal)}`);
    }
  }

  for (const npc of (data.npcs ?? []) as Record<string, any>[]) {
    for (const sid of npc.shop ?? []) {
      if (!itemIds.has(String(sid))) fail(where, `상점 품목이 없다: ${String(sid)}`);
    }
  }
}

// ---------------------------------------------------------------- 호드 모드 내부 표
//
// horde.ts 의 무기·보스·대원 표는 JSON 이 아니라 TS 리터럴이라 위 검증이
// 못 본다. 그런데 정확히 이 파일에서 "선언은 있는데 실제로는 빠진 값"
// 버그가 여러 번 나왔다(보스 속성 누락, 파티클/총알 색상이 하드코딩
// 허용목록에 없어서 안 보이던 문제 등). import 로 불러오면 pixi.js·오디오
// 등 브라우저 전용 의존성이 Node 에서 죽으므로, 소스를 텍스트로 읽어
// 괄호 깊이를 세어 그 안의 리터럴만 뽑아낸다.

/**
 * 주석을 지운다 — 한글 주석 안의 쉼표(",")가 실제 코드의 쉼표처럼
 * 보여서 아래 topLevelChunks 의 깊이 계산을 흐트러뜨리는 걸 막는다.
 * 문자열/템플릿 리터럴 내부는 통째로 건너뛰어 그 안의 `//`, `/*` 를
 * 주석으로 착각하지 않는다.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        j += src[j] === '\\' ? 2 : 1;
      }
      j++;
      out += src.slice(i, j);
      i = j;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const hordeSrc = stripComments(readFileSync(resolve(ROOT, 'src/proto/horde.ts'), 'utf8'));
const stageBgSrc = stripComments(readFileSync(resolve(ROOT, 'src/proto/stage_bg.ts'), 'utf8'));

/** start 위치의 여는 괄호와 짝이 맞는 닫는 괄호까지, 괄호 내부를 포함해 반환한다 */
function balancedBlock(text: string, start: number): string {
  const open = text[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) throw new Error(`괄호가 아니다: ${open}`);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('짝이 맞지 않는 괄호');
}

/** 괄호/함수 내부 안 보고, 주어진 텍스트 바로 한 단계 깊이의 콤마로만 나눈다 */
function topLevelChunks(inner: string): string[] {
  const chunks: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      chunks.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  chunks.push(inner.slice(start));
  return chunks.map((s) => s.trim()).filter(Boolean);
}

/** chunk 맨 앞에 주석 줄이 섞여 있을 수 있어 줄 단위로 걸러 가며 찾는다 */
function fieldValue(chunk: string, key: string): string | null {
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) continue;
    const m = trimmed.match(new RegExp(`^${key}:\\s*'([^']*)'`));
    if (m) return m[1];
  }
  return null;
}

/** `const NAME ... = [ {..}, {..} ]` 배열 리터럴에서 원소별 { id, elem } 만 뽑는다 */
function parseWeaponPool(source: string, arrayName: string): { id: string; elem: string | null }[] {
  const declIdx = source.indexOf(`const ${arrayName}`);
  if (declIdx === -1) throw new Error(`${arrayName} 선언을 못 찾았다`);
  const eqIdx = source.indexOf('=', declIdx);
  const bracketStart = source.indexOf('[', eqIdx);
  const inner = balancedBlock(source, bracketStart).slice(1, -1);
  return topLevelChunks(inner)
    .filter((c) => c.startsWith('{'))
    .map((obj) => {
      const fields = topLevelChunks(obj.slice(1, -1));
      let id: string | null = null;
      let elem: string | null = null;
      for (const f of fields) {
        id = id ?? fieldValue(f, 'id');
        elem = elem ?? fieldValue(f, 'elem');
      }
      if (!id) throw new Error(`${arrayName} 안에 id 없는 원소: ${obj.slice(0, 60)}`);
      return { id, elem };
    });
}

/** `const NAME: Record<...> = { key: {...} 또는 'val', ... }` 에서 최상위 key 만 뽑는다 */
function parseFlatObjectKeys(source: string, objName: string): string[] {
  const declIdx = source.indexOf(`const ${objName}`);
  if (declIdx === -1) throw new Error(`${objName} 선언을 못 찾았다`);
  const eqIdx = source.indexOf('=', declIdx);
  const braceStart = source.indexOf('{', eqIdx);
  const inner = balancedBlock(source, braceStart).slice(1, -1);
  return topLevelChunks(inner)
    .map((c) => {
      for (const line of c.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;
        return trimmed.match(/^(\w+):/)?.[1] ?? null;
      }
      return null;
    })
    .filter((k): k is string => !!k);
}

try {
  const specials = parseWeaponPool(hordeSrc, 'SPECIALS');
  const legends = parseWeaponPool(hordeSrc, 'LEGENDS');
  const bossWeapons = parseWeaponPool(hordeSrc, 'BOSS_WEAPONS');
  const bossWeaponsById = new Map(bossWeapons.map((w) => [w.id, w]));

  // 무기 id 는 세 풀(레벨업/가챠/보스 드랍)을 합쳐 owned 맵 하나에 들어간다 —
  // 하나라도 겹치면 레벨이 서로 덮어써진다.
  const seen = new Map<string, string>();
  for (const [poolName, pool] of [
    ['SPECIALS', specials],
    ['LEGENDS', legends],
    ['BOSS_WEAPONS', bossWeapons],
  ] as const) {
    for (const { id } of pool) {
      const prev = seen.get(id);
      if (prev) fail('horde.ts', `무기 id 중복: '${id}' (${prev}, ${poolName})`);
      seen.set(id, poolName);
    }
  }

  // 보스가 주는 무기가 실제로 존재하고, 보스 본인의 속성과 일치하는지
  // (saw_return/edge_cut/charge_kick 에서 이게 어긋나 있던 버그의 재발 방지)
  // 'const BOSS_DEFS: BossDef[] = [...]' — 타입 표기의 '[]' 를 배열 리터럴로
  // 착각하지 않도록 '=' 뒤에서부터 '[' 를 찾는다
  const bossDefsEq = hordeSrc.indexOf('=', hordeSrc.indexOf('const BOSS_DEFS'));
  const bossDefs = topLevelChunks(balancedBlock(hordeSrc, hordeSrc.indexOf('[', bossDefsEq)).slice(1, -1))
    .filter((c) => c.startsWith('{'))
    .map((obj) => {
      const fields = topLevelChunks(obj.slice(1, -1));
      const get = (key: string) => fields.map((f) => fieldValue(f, key)).find((v) => v !== null) ?? null;
      return { id: get('id'), elem: get('elem'), drop: get('drop') };
    });

  for (const boss of bossDefs) {
    const weapon = boss.drop ? bossWeaponsById.get(boss.drop) : undefined;
    if (!boss.drop || !weapon) {
      fail('horde.ts', `보스 '${boss.id}' 가 주는 무기가 BOSS_WEAPONS 에 없다: ${boss.drop}`);
    } else if (weapon.elem !== boss.elem) {
      fail(
        'horde.ts',
        `보스 '${boss.id}'(${boss.elem}) 가 주는 무기 '${boss.drop}' 의 속성이 다르다: ${weapon.elem ?? '(없음)'}`,
      );
    }
  }

  // 펫 넷은 전부 LEGENDS 안에 실제로 있는 무기여야 한다
  const petOrderMatch = hordeSrc.match(/const PET_ORDER: PetId\[\] = \[([^\]]*)\]/);
  const petOrder = petOrderMatch ? [...petOrderMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
  const legendIds = new Set(legends.map((w) => w.id));
  if (petOrder.length === 0) fail('horde.ts', 'PET_ORDER 를 못 찾았다');
  for (const id of petOrder) {
    if (!legendIds.has(id)) fail('horde.ts', `PET_ORDER 가 LEGENDS 에 없는 무기를 가리킨다: ${id}`);
  }

  // 속성별 스테이지 테마 인덱스가 실제 THEMES 배열 범위 안인지
  const themeForElem = parseFlatObjectKeys(hordeSrc, 'THEME_FOR_ELEM').map((elem) => {
    const chunk = topLevelChunks(
      balancedBlock(hordeSrc, hordeSrc.indexOf('{', hordeSrc.indexOf('const THEME_FOR_ELEM'))).slice(1, -1),
    ).find((c) => c.startsWith(`${elem}:`));
    return { elem, idx: Number(chunk?.split(':')[1]) };
  });
  const themesMatch = stageBgSrc.match(/export const THEMES\s*:\s*StageTheme\[\]\s*=\s*\[([^\]]*)\]/);
  const themeCount = themesMatch ? topLevelChunks(themesMatch[1]).length : 0;
  if (themeCount === 0) fail('stage_bg.ts', 'THEMES 배열을 못 찾았다');
  for (const { elem, idx } of themeForElem) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= themeCount) {
      fail('horde.ts', `THEME_FOR_ELEM.${elem} 이 THEMES 범위를 벗어난다: ${idx} (THEMES 는 ${themeCount}개)`);
    }
  }

  // 대원별 공격 서명(SIG)·총구 위치(MUZZLE)·방식(STYLE_BY_ARCHETYPE) 이
  // 실제 9명의 캐릭터 데이터를 전부 커버하는지
  const sigIds = new Set(parseFlatObjectKeys(hordeSrc, 'SIG'));
  const muzzleIds = new Set(parseFlatObjectKeys(hordeSrc, 'MUZZLE'));
  const styleByArchetype = new Set(parseFlatObjectKeys(hordeSrc, 'STYLE_BY_ARCHETYPE'));

  for (const { id, archetype } of characterIds) {
    if (!sigIds.has(id)) fail('horde.ts', `SIG 에 캐릭터 '${id}' 의 공격 서명이 없다`);
    if (!styleByArchetype.has(archetype)) {
      fail('horde.ts', `STYLE_BY_ARCHETYPE 에 archetype '${archetype}' (캐릭터 '${id}') 이 없다`);
    }
    // 세이버는 근접이라 총구 좌표가 필요 없다 — 버스터/연사만 있으면 된다
    if (archetype !== 'saber' && !muzzleIds.has(id)) {
      fail('horde.ts', `MUZZLE 에 캐릭터 '${id}' (${archetype}) 의 총구 좌표가 없다`);
    }
  }
} catch (e) {
  fail('horde.ts', `호드 모드 내부 표 파싱 실패 — ${(e as Error).message}`);
}

// ---------------------------------------------------------------- 결과

for (const w of warnings) console.log(w);

if (errors.length > 0) {
  console.error(`\n데이터 검증 실패 — ${errors.length}건\n`);
  for (const e of errors) console.error(e);
  process.exit(1);
}

console.log(
  `데이터 검증 통과 — 캐릭터 ${files.length} · 적 ${enemies.length} · 패턴 ${patterns.length} · 무기 ${skills.length} · 아이템 ${itemsList.length} · 맵 ${mapList.length}`,
);
