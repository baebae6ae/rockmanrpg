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

for (const file of files) {
  const where = `data/characters/${file}`;
  const def = readJson(resolve(charDir, file)) as Record<string, any> | null;
  if (!def) continue;

  const expectedId = file.replace(/\.json$/, '');
  if (def.id !== expectedId) fail(where, `id 가 파일명과 다르다 (${def.id} ≠ ${expectedId})`);

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

for (const { where, data } of readAll('data/maps')) {
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
  if (!SLOTS.has(data.slot)) fail(where, `알 수 없는 장비 슬롯: ${data.slot}`);
  if (!data.name) fail(where, '필수 필드 누락: name');
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
}

// ---------------------------------------------------------------- 결과

for (const w of warnings) console.log(w);

if (errors.length > 0) {
  console.error(`\n데이터 검증 실패 — ${errors.length}건\n`);
  for (const e of errors) console.error(e);
  process.exit(1);
}

console.log(
  `데이터 검증 통과 — 캐릭터 ${files.length} · 적 ${enemies.length} · 패턴 ${patterns.length} · 무기 ${skills.length} · 장비 ${itemsList.length}`,
);
