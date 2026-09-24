/**
 * Sprite sheet loader.
 *
 * Production sheets live in assets/sprites/ (or generated fallback sheets in
 * assets/generated/) — a fixed-size grid PNG plus a JSON describing the
 * canvas cell size, column count, and named animation tag ranges.
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
  /** 칸 번호마다의 총구 위치 [바라보는 쪽으로의 거리, 발에서의 높이] */
  muzzle?: [number, number][];
  /** 다리가 대기 자세와 가장 닮은 걷기 칸(태그 안에서의 순번) */
  walk_neutral?: number;
}

export interface Sheet {
  textures: Texture[];
  meta: SheetMeta;
  source: 'sprites' | 'generated';
}

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

export class AnimView extends Sprite {
  private tagName = '';
  private tag: TagMeta | null = null;
  private index = 0;
  private elapsed = 0;
  private done = false;

  constructor(private readonly sheet: Sheet) {
    super(sheet.textures[0]);
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

  /** 지금 보이는 칸의 총구 위치 — 시트에 기록이 없으면 null */
  muzzle(): [number, number] | null {
    return this.sheet.meta.muzzle?.[this.index] ?? null;
  }

  /** 지금 칸이 태그 안에서 몇 번째인지 */
  get offset(): number {
    return this.tag ? this.index - this.tag.from : 0;
  }

  /** 지금 칸이 이번 틱(dtMs) 안에 다음 칸으로 넘어가는가 */
  endsWithin(dtMs: number): boolean {
    return !!this.tag && this.elapsed + dtMs >= this.tag.duration;
  }

  get walkNeutral(): number {
    return this.sheet.meta.walk_neutral ?? 0;
  }

  /** startOffset — 태그의 몇 번째 칸부터 틀지 (걷기를 이어 붙일 때) */
  play(name: string, fallback = 'idle', startOffset = 0): void {
    const resolved = this.has(name) ? name : fallback;
    if (resolved === this.tagName) return;

    const tag = this.sheet.meta.tags[resolved];
    if (!tag) return;

    this.tagName = resolved;
    this.tag = tag;
    this.index = tag.from + (startOffset % (tag.to - tag.from + 1));
    this.elapsed = 0;
    this.done = false;
    this.texture = this.sheet.textures[this.index];
  }

  restart(): void {
    if (!this.tag) return;
    this.index = this.tag.from;
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
