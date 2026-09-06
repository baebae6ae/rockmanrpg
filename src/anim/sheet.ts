/**
 * Sprite sheet loader.
 *
 * Normal production sheets live in assets/sprites/ (or generated fallback
 * sheets in assets/generated/). Horde also supports the nine newly uploaded
 * production sheets in assets/raw/ and normalizes them at runtime so the
 * existing Horde combat/attack code does not need to change.
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
  source: 'sprites' | 'generated' | 'raw';
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

/**
 * The upload commit added these nine files in the same order as the Horde
 * roster. IDs remain unchanged so all existing combat data stays intact.
 */
const RAW_HORDE_CHARACTER: Record<string, string> = {
  nail: new URL('../../assets/raw/ChatGPT Image 2026년 9월 5일 오후 12_08_50.png', import.meta.url).href,
  bell: new URL('../../assets/raw/ChatGPT Image 2026년 9월 5일 오후 12_21_52.png', import.meta.url).href,
  ember: new URL('../../assets/raw/ChatGPT Image 2026년 9월 5일 오후 12_25_01.png', import.meta.url).href,
  mirror: new URL('../../assets/raw/ChatGPT Image 2026년 9월 6일 오후 11_18_14.png', import.meta.url).href,
  needle: new URL('../../assets/raw/ChatGPT Image 2026년 9월 6일 오후 12_04_37.png', import.meta.url).href,
  firefly: new URL('../../assets/raw/ChatGPT Image 2026년 9월 6일 오후 12_11_24.png', import.meta.url).href,
  axe: new URL('../../assets/raw/ChatGPT Image 2026년 9월 6일 오후 12_12_53.png', import.meta.url).href,
  harpoon: new URL('../../assets/raw/ChatGPT Image 2026년 9월 6일 오후 12_13_13.png', import.meta.url).href,
  chain: new URL('../../assets/raw/ChatGPT Image 2026년 9월 6일 오후 12_13_52.png', import.meta.url).href,
};

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

type Box = [number, number, number, number];

function findRawFrames(canvas: HTMLCanvasElement): Box[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const w = canvas.width;
  const h = canvas.height;
  const pixels = ctx.getImageData(0, 0, w, h).data;

  // The uploaded character sheets use a common presentation template:
  // labels on the far left, the character animation rows in the middle,
  // a character card on the right, and projectile/effect rows at the bottom.
  const x0 = Math.floor(w * 0.075);
  const x1 = Math.floor(w * 0.79);
  const y1 = Math.floor(h * 0.76);
  const rw = x1 - x0;
  const rh = y1;

  const bgR = pixels[0];
  const bgG = pixels[1];
  const bgB = pixels[2];
  const mask = new Uint8Array(rw * rh);

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = (y * w + (x + x0)) * 4;
      const a = pixels[i + 3];
      const nearBg =
        Math.abs(pixels[i] - bgR) +
        Math.abs(pixels[i + 1] - bgG) +
        Math.abs(pixels[i + 2] - bgB) < 42;
      mask[y * rw + x] = a > 16 && !nearBg ? 1 : 0;
    }
  }

  const seen = new Uint8Array(mask.length);
  const boxes: Box[] = [];
  const q: number[] = [];
  const dirs = [-1, 0, 1];

  for (let sy = 0; sy < rh; sy++) {
    for (let sx = 0; sx < rw; sx++) {
      const start = sy * rw + sx;
      if (!mask[start] || seen[start]) continue;

      seen[start] = 1;
      q.length = 0;
      q.push(start);
      let head = 0;
      let bx0 = sx;
      let bx1 = sx;
      let by0 = sy;
      let by1 = sy;
      let area = 0;

      while (head < q.length) {
        const index = q[head++];
        const cx = index % rw;
        const cy = Math.floor(index / rw);
        area++;
        bx0 = Math.min(bx0, cx);
        bx1 = Math.max(bx1, cx);
        by0 = Math.min(by0, cy);
        by1 = Math.max(by1, cy);

        for (const dy of dirs) {
          const ny = cy + dy;
          if (ny < 0 || ny >= rh) continue;
          for (const dx of dirs) {
            const nx = cx + dx;
            if (nx < 0 || nx >= rw) continue;
            const ni = ny * rw + nx;
            if (!seen[ni] && mask[ni]) {
              seen[ni] = 1;
              q.push(ni);
            }
          }
        }
      }

      const bw = bx1 - bx0 + 1;
      const bh = by1 - by0 + 1;
      if (area >= 180 && bw >= 12 && bh >= 18 && bw <= 120 && bh <= 120) {
        boxes.push([bx0 + x0, by0, bx1 + x0, by1]);
      }
    }
  }

  let merged = boxes;
  let changed = true;
  while (changed) {
    changed = false;
    const out: Box[] = [];
    for (const box of merged) {
      let joined = false;
      for (let i = 0; i < out.length; i++) {
        const other = out[i];
        if (
          box[0] - 8 <= other[2] && box[2] + 8 >= other[0] &&
          box[1] - 8 <= other[3] && box[3] + 8 >= other[1]
        ) {
          out[i] = [
            Math.min(box[0], other[0]),
            Math.min(box[1], other[1]),
            Math.max(box[2], other[2]),
            Math.max(box[3], other[3]),
          ];
          joined = true;
          changed = true;
          break;
        }
      }
      if (!joined) out.push(box);
    }
    merged = out;
  }

  merged.sort((a, b) => (a[1] + a[3]) - (b[1] + b[3]) || a[0] - b[0]);
  return merged;
}

function groupRows(frames: Box[]): Box[][] {
  const rows: Box[][] = [];
  for (const box of frames) {
    const cy = (box[1] + box[3]) / 2;
    let row = rows.find((r) => {
      if (!r.length) return false;
      const ry = (r[0][1] + r[0][3]) / 2;
      return Math.abs(cy - ry) < 34;
    });
    if (!row) {
      row = [];
      rows.push(row);
    }
    row.push(box);
  }
  for (const row of rows) row.sort((a, b) => a[0] - b[0]);
  return rows.sort((a, b) => ((a[0][1] + a[0][3]) / 2) - ((b[0][1] + b[0][3]) / 2));
}

async function loadRawHordeSheet(id: string): Promise<Sheet> {
  const url = RAW_HORDE_CHARACTER[id];
  if (!url) throw new Error(`Horde raw 스프라이트 매핑이 없다: ${id}`);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`raw 스프라이트를 불러오지 못했다: ${url}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(`canvas를 만들 수 없다: ${id}`);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const rows = groupRows(findRawFrames(canvas));
  if (!rows.length) throw new Error(`raw 스프라이트 프레임을 찾지 못했다: ${id}`);

  const textures: Texture[] = [];
  const tags: Record<string, TagMeta> = {};
  const rowNames = [
    'idle', 'walk', 'run', 'jump_rise', 'jump_fall',
    'dash', 'attack_main', 'attack_air', 'charge_loop', 'hurt',
  ];

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const from = textures.length;

    for (const [x0, y0, x1, y1] of row) {
      const cw = x1 - x0 + 1;
      const ch = y1 - y0 + 1;
      const scale = Math.min(1, 60 / Math.max(cw, ch));
      const dw = Math.max(1, Math.round(cw * scale));
      const dh = Math.max(1, Math.round(ch * scale));

      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = 64;
      frameCanvas.height = 64;
      const fctx = frameCanvas.getContext('2d');
      if (!fctx) continue;
      fctx.imageSmoothingEnabled = false;
      fctx.clearRect(0, 0, 64, 64);
      fctx.drawImage(canvas, x0, y0, cw, ch, Math.floor((64 - dw) / 2), 63 - dh, dw, dh);

      const texture = Texture.from(frameCanvas);
      texture.source.scaleMode = 'nearest';
      textures.push(texture);
    }

    const name = rowNames[ri];
    if (name && from < textures.length) {
      tags[name] = {
        from,
        to: textures.length - 1,
        duration: name === 'idle' ? 140 : 85,
        loop: !['jump_rise', 'jump_fall', 'hurt'].includes(name),
      };
    }
  }

  if (!tags.idle) tags.idle = { from: 0, to: 0, duration: 140, loop: true };
  if (!tags.walk) tags.walk = tags.idle;
  if (!tags.run) tags.run = tags.walk;
  if (!tags.jump_rise) tags.jump_rise = tags.idle;
  if (!tags.jump_fall) tags.jump_fall = tags.jump_rise;
  if (!tags.dash) tags.dash = tags.run;
  if (!tags.attack_main) tags.attack_main = tags.idle;
  if (!tags.attack_air) tags.attack_air = tags.attack_main;
  if (!tags.charge_loop) tags.charge_loop = tags.idle;
  if (!tags.hurt) tags.hurt = tags.idle;

  return {
    textures,
    meta: { canvas: { w: 64, h: 64 }, columns: 1, tags },
    source: 'raw',
  };
}

export function loadSheet(kind: 'characters' | 'enemies', id: string): Promise<Sheet> {
  const key = `${kind}/${id}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const found = resolvePaths(kind, id);
  const isHorde = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('horde');
  if (!found && isHorde && kind === 'characters' && RAW_HORDE_CHARACTER[id]) {
    const promise = loadRawHordeSheet(id);
    cache.set(key, promise);
    return promise;
  }

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
