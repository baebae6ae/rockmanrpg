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

// ---------------------------------------------------------------- 결과

for (const w of warnings) console.log(w);

if (errors.length > 0) {
  console.error(`\n데이터 검증 실패 — ${errors.length}건\n`);
  for (const e of errors) console.error(e);
  process.exit(1);
}

console.log(`데이터 검증 통과 — 캐릭터 ${files.length}개`);
