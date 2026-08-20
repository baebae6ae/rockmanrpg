/**
 * 스프라이트 시트 로더 — docs/DESIGN.md §5
 *
 * 정규화 규격(고정 캔버스 균일 격자, 발바닥 하단 중앙)만 다루므로
 * 프레임별 피벗 데이터가 필요 없다.
 *
 * assets/sprites/ 에 진짜 스프라이트가 있으면 그것을, 없으면
 * assets/generated/ 의 임시 도트를 쓴다. 교체는 파일을 넣는 것으로 끝난다.
 */

import { Assets, Rectangle, Sprite, Texture } from 'pixi.js';

export interface TagMeta {
  from: number;
  to: number;
  duration: number;
  loop: boolean;
}

export interface SheetMeta {
  canvas: { w: number; h: number };
  columns: number;
  tags: Record<string, TagMeta>;
}

export interface Sheet {
  textures: Texture[];
  meta: SheetMeta;
  /** 진짜 스프라이트를 쓰고 있는지 임시 도트인지 */
  source: 'sprites' | 'generated';
}

// sprites/generated 만 본다 — assets/raw/ 는 임포트 전 원본을 잠깐 두는
// 곳이라 여기 걸리면 실제 게임 번들에 리핑 시트 원본(수백 KB~수 MB)이
// 그대로 딸려 들어간다.
const pngUrls = import.meta.glob('/assets/{sprites,generated}/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const metaFiles = import.meta.glob('/assets/{sprites,generated}/**/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, SheetMeta>;

function resolvePaths(kind: 'characters' | 'enemies', id: string) {
  for (const source of ['sprites', 'generated'] as const) {
    const base = `/assets/${source}/${kind}/${id}/${id}`;
    const png = pngUrls[`${base}.png`];
    const meta = metaFiles[`${base}.json`];
    if (png && meta) return { png, meta, source };
  }
  return null;
}

const cache = new Map<string, Promise<Sheet>>();

export function loadSheet(kind: 'characters' | 'enemies', id: string): Promise<Sheet> {
  const key = `${kind}/${id}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const found = resolvePaths(kind, id);
  if (!found) {
    return Promise.reject(
      new Error(
        `스프라이트를 찾을 수 없다: ${kind}/${id}\n` +
          `assets/sprites/${kind}/${id}/ 또는 assets/generated/${kind}/${id}/ 를 확인하라.`,
      ),
    );
  }

  const promise = (async (): Promise<Sheet> => {
    const base = await Assets.load<Texture>(found.png);
    base.source.scaleMode = 'nearest';

    const { w, h } = found.meta.canvas;
    const cols = found.meta.columns;
    const rows = Math.ceil(base.height / h);
    const textures: Texture[] = [];

    for (let i = 0; i < cols * rows; i++) {
      const x = (i % cols) * w;
      const y = Math.floor(i / cols) * h;
      if (y + h > base.height) break;
      textures.push(new Texture({ source: base.source, frame: new Rectangle(x, y, w, h) }));
    }

    return { textures, meta: found.meta, source: found.source };
  })();

  cache.set(key, promise);
  return promise;
}

/** 태그 단위로 재생되는 스프라이트 */
export class AnimView extends Sprite {
  private tagName = '';
  private tag: TagMeta | null = null;
  private index = 0;
  private elapsed = 0;
  private done = false;

  constructor(private readonly sheet: Sheet) {
    super(sheet.textures[0]);
    // 프레임 하단이 발바닥이므로 앵커는 하단 중앙
    this.anchor.set(0.5, 1);
  }

  get current(): string {
    return this.tagName;
  }

  get finished(): boolean {
    return this.done;
  }

  has(name: string): boolean {
    return name in this.sheet.meta.tags;
  }

  /** 없는 태그면 fallback 을 쓴다. 캐릭터마다 보유 태그가 다르기 때문. */
  play(name: string, fallback = 'idle'): void {
    const resolved = this.has(name) ? name : fallback;
    if (resolved === this.tagName) return;

    const tag = this.sheet.meta.tags[resolved];
    if (!tag) return;

    this.tagName = resolved;
    this.tag = tag;
    this.index = tag.from;
    this.elapsed = 0;
    this.done = false;
    this.texture = this.sheet.textures[this.index];
  }

  update(dtMs: number): void {
    if (!this.tag) return;

    this.elapsed += dtMs;
    while (this.elapsed >= this.tag.duration) {
      this.elapsed -= this.tag.duration;
      if (this.index < this.tag.to) {
        this.index++;
      } else if (this.tag.loop) {
        this.index = this.tag.from;
      } else {
        this.done = true;
        break;
      }
    }
    this.texture = this.sheet.textures[this.index];
  }
}
