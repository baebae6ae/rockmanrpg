/**
 * 단일 HTML 빌드를 Artifact 퍼블리시용 페이지 조각으로 변환한다.
 *
 * Artifact 는 업로드한 파일을 <!doctype html><head></head><body> 골격에 감싸므로
 * 문서 태그가 중복되면 안 된다. 여기서 <title> / <style> / <script> 와 body 내용만
 * 뽑아낸다.
 *
 * 실행: npm run build:artifact-page
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'dist-artifact/index.html');
const OUT = resolve(ROOT, 'dist-artifact/page.html');

const html = readFileSync(SRC, 'utf8');

const title = html.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? '<title>록맨 RPG</title>';
const headEnd = html.search(/<\/head>/i);
const head = headEnd >= 0 ? html.slice(0, headEnd) : '';
const styles = [...head.matchAll(/<style[\s\S]*?<\/style>/gi)].map((m) => m[0]);
const headScripts = [...head.matchAll(/<script[\s\S]*?<\/script>/gi)].map((m) => m[0]);

const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
if (!bodyMatch) throw new Error('body 를 찾을 수 없다 — 빌드 산출물 형식이 바뀌었는지 확인하라');

const page = [title, ...styles, ...headScripts, bodyMatch[1].trim()].join('\n');

writeFileSync(OUT, `${page}\n`);
console.log(`Artifact 페이지 생성 → dist-artifact/page.html (${(page.length / 1024).toFixed(0)} KB)`);
