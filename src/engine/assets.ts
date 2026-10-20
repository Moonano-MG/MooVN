/**
 * 资源加载：图片（含立绘白底抠图）、音频
 */

export type AssetOverride = (path: string) => string | null;

export class Assets {
  private texCache = new Map<string, Promise<HTMLImageElement | null>>();
  private keyedCache = new Map<string, Promise<HTMLCanvasElement | null>>();
  private audioCache = new Map<string, HTMLAudioElement>();
  private override: AssetOverride | null = null;

  /** Tauri 环境可通过 convertFileSrc 等重写路径 */
  setOverride(fn: AssetOverride): void {
    this.override = fn;
  }

  resolve(path: string): string {
    if (!path) return '';
    if (/^(https?:|data:|blob:)/.test(path)) return path;
    const p = this.override ? this.override(path) : null;
    const clean = p ?? path;
    return clean.startsWith('./') || clean.startsWith('../') || clean.startsWith('/')
      ? clean
      : `./${clean}`;
  }

  loadImage(path: string): Promise<HTMLImageElement | null> {
    const url = this.resolve(path);
    if (!this.texCache.has(url)) {
      this.texCache.set(
        url,
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => {
            console.warn('[MooVN] 图片加载失败:', url);
            resolve(null);
          };
          img.src = url;
        })
      );
    }
    return this.texCache.get(url)!;
  }

  /**
   * 加载立绘并移除纯白背景。
   * 使用"边缘泛洪"算法：只清除与画布边缘连通的近白像素，
   * 避免把角色身上的白色衣物一起挖空。
   */
  loadKeyedSprite(path: string): Promise<HTMLCanvasElement | null> {
    const url = this.resolve(path);
    if (!this.keyedCache.has(url)) {
      this.keyedCache.set(
        url,
        this.loadImage(path).then(async (img) => {
          if (!img) return null;
          try {
            return await floodKeyWhite(img);
          } catch (err) {
            console.warn('[MooVN] 立绘抠图失败，使用原图:', err);
            return drawToCanvas(img);
          }
        })
      );
    }
    return this.keyedCache.get(url)!;
  }

  loadAudio(path: string): HTMLAudioElement | null {
    if (!path) return null;
    const url = this.resolve(path);
    if (!this.audioCache.has(url)) {
      const el = new Audio();
      el.src = url;
      el.preload = 'auto';
      el.addEventListener('error', () => console.warn('[MooVN] 音频加载失败:', url));
      this.audioCache.set(url, el);
    }
    return this.audioCache.get(url) ?? null;
  }
}

function drawToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

const WHITE_THRESHOLD = 238; // RGB 全部高于该值视为"近白"

async function floodKeyWhite(img: HTMLImageElement): Promise<HTMLCanvasElement> {
  const c = drawToCanvas(img);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = c;
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];

  const pushIfNearWhite = (x: number, y: number) => {
    const i = y * w + x;
    if (visited[i]) return;
    const o = i * 4;
    const [r, g, b] = [d[o], d[o + 1], d[o + 2]];
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      visited[i] = 1;
      stack.push(i);
    }
  };

  // 从四条边开始泛洪
  for (let x = 0; x < w; x++) {
    pushIfNearWhite(x, 0);
    pushIfNearWhite(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    pushIfNearWhite(0, y);
    pushIfNearWhite(w - 1, y);
  }

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) pushIfNearWhite(x - 1, y);
    if (x < w - 1) pushIfNearWhite(x + 1, y);
    if (y > 0) pushIfNearWhite(x, y - 1);
    if (y < h - 1) pushIfNearWhite(x, y + 1);
  }

  // 对泛洪区域计算 alpha：≥HIGH 完全透明，LOW..HIGH 之间线性羽化
  const HIGH = 246;
  const LOW = 232;
  for (let i = 0; i < w * h; i++) {
    if (!visited[i]) continue;
    const o = i * 4;
    const lum = Math.max(d[o], d[o + 1], d[o + 2]);
    let a = 1;
    if (lum >= HIGH) a = 0;
    else if (lum > LOW) a = 1 - (lum - LOW) / (HIGH - LOW);
    d[o + 3] = Math.round(d[o + 3] * a);
  }

  ctx.putImageData(image, 0, 0);
  return c;
}
