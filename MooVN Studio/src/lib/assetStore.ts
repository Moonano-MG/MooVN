import type { AvatarLayerTextureMap, VNProject } from '../types.ts';
import { isTauriEnvironment, readAssetViaTauri, storeAssetViaTauri } from './tauriBridge.ts';

export const MAX_ASSET_BYTES = 100 * 1024 * 1024;
export const ASSET_PREFIX = 'moovn-asset://';
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', apng: 'image/apng', mp4: 'video/mp4', webm: 'video/webm',
  mov: 'video/quicktime', ogv: 'video/ogg',
};
const DB_NAME = 'moovn-binary-assets';
const STORE = 'assets';

function openAssetDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('ERR_ASSET_STORAGE: 浏览器资源存储不可用'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('ERR_ASSET_STORAGE: 无法打开资源库'));
    req.onblocked = () => reject(new Error('ERR_ASSET_STORAGE: 资源库被其他窗口占用'));
  });
}

async function putBrowserAsset(name: string, blob: Blob): Promise<void> {
  const db = await openAssetDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(blob, name);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('ERR_ASSET_STORAGE: 写入资源失败'));
      transaction.onabort = () => reject(transaction.error || new Error('ERR_ASSET_STORAGE: 资源写入已中止'));
    });
  } finally { db.close(); }
}

async function getBrowserAsset(name: string): Promise<Blob> {
  const db = await openAssetDb();
  try {
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(name);
      request.onsuccess = () => resolve(request.result as Blob | undefined);
      request.onerror = () => reject(request.error || new Error('ERR_ASSET_READ: 无法读取资源'));
    });
    if (!(blob instanceof Blob)) throw new Error(`ERR_ASSET_MISSING: 找不到资源 ${name}`);
    return blob;
  } finally { db.close(); }
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('ERR_ASSET_HASH: 当前环境不支持 SHA-256');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function extensionForFile(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!(ext in MIME_BY_EXTENSION)) throw new Error('ERR_ASSET_TYPE: 仅支持 PNG/JPEG/GIF/WebP/APNG/MP4/WebM/MOV/OGV');
  if (file.type && !['image/', 'video/'].some((prefix) => file.type.startsWith(prefix))) {
    throw new Error('ERR_ASSET_TYPE: 只允许图片和视频');
  }
  return ext;
}

function parseReference(reference: string): { name: string; hash: string; mime: string } {
  const match = /^moovn-asset:\/\/([a-f0-9]{64})\.([a-z0-9]+)$/.exec(reference);
  if (!match || !MIME_BY_EXTENSION[match[2]]) throw new Error('ERR_ASSET_REFERENCE: 资源引用无效');
  return { name: `${match[1]}.${match[2]}`, hash: match[1], mime: MIME_BY_EXTENSION[match[2]] };
}

/** Persist binary media separately and return a small content-addressed project reference. */
export async function importAsset(file: File): Promise<string> {
  const ext = extensionForFile(file);
  if (file.size <= 0 || file.size > MAX_ASSET_BYTES) {
    throw new Error(`ERR_ASSET_SIZE: 图片或视频须在 1 字节至 ${MAX_ASSET_BYTES / 1024 / 1024} MiB 之间`);
  }
  const bytes = await file.arrayBuffer();
  const hash = await sha256(bytes);
  const name = `${hash}.${ext}`;
  const reference = `${ASSET_PREFIX}${name}`;
  if (isTauriEnvironment()) {
    await storeAssetViaTauri(name, new Uint8Array(bytes));
    await readAsset(reference); // Verify the bytes persisted by the native backend before committing the reference.
  } else {
    await putBrowserAsset(name, new Blob([bytes], { type: MIME_BY_EXTENSION[ext] }));
  }
  return reference;
}

/** Missing or modified resources are errors, not empty images or silent fallback. */
export async function readAsset(reference: string): Promise<Blob> {
  const { name, hash, mime } = parseReference(reference);
  const blob = isTauriEnvironment()
    ? new Blob([await readAssetViaTauri(name)], { type: mime })
    : await getBrowserAsset(name);
  if (blob.size <= 0 || blob.size > MAX_ASSET_BYTES || await sha256(await blob.arrayBuffer()) !== hash) {
    throw new Error(`ERR_ASSET_INTEGRITY: 资源校验失败 ${name}`);
  }
  return blob.type === mime ? blob : new Blob([blob], { type: mime });
}

function extensionForMime(mime: string): string | undefined {
  return Object.keys(MIME_BY_EXTENSION).find((key) => MIME_BY_EXTENSION[key] === mime);
}

type MediaOwner = { mediaUrl?: string; videoUrl?: string; layerTextures?: AvatarLayerTextureMap };

/** Visit only schema-defined media fields; dialogue, scripts and variable text are never URLs here. */
function forEachProjectMedia(project: VNProject, visit: (value: string, replace: (value: string) => void) => void): void {
  const seen = new WeakSet<object>();
  const owner = (source: MediaOwner) => {
    if (seen.has(source)) return;
    seen.add(source);
    for (const key of ['mediaUrl', 'videoUrl'] as const) {
      const value = source[key];
      if (typeof value === 'string') visit(value, (next) => { source[key] = next; });
    }
    if (source.layerTextures) {
      const layers = source.layerTextures;
      for (const key of Object.keys(layers) as (keyof AvatarLayerTextureMap)[]) {
        const value = layers[key];
        if (typeof value === 'string') visit(value, (next) => { layers[key] = next; });
      }
    }
  };
  for (const character of project.characters) {
    owner(character);
    for (const expression of character.expressions || []) owner(expression);
  }
  for (const node of project.nodes) {
    for (const placement of node.characters) owner(placement);
    if (node.mediaAnimation) owner(node.mediaAnimation);
  }
}

export function getProjectWorkspaceAssetReferences(project: VNProject): string[] {
  const refs = new Set<string>();
  forEachProjectMedia(project, (value) => { if (value.startsWith(ASSET_PREFIX)) refs.add(value); });
  return [...refs];
}

/** Convert legacy embedded media to workspace assets on a cloned project before saving. */
export async function migrateEmbeddedProjectMedia(project: VNProject): Promise<VNProject> {
  const copy = structuredClone(project);
  let migration: Promise<void> = Promise.resolve();
  forEachProjectMedia(copy, (value, replace) => {
    if (!value.startsWith('data:')) return;
    const match = /^data:([^;,]+)[;,]/.exec(value);
    const ext = match && extensionForMime(match[1]);
    if (!ext) throw new Error('ERR_ASSET_TYPE: 工程中的内嵌媒体格式不受支持');
    migration = migration.then(async () => {
      const comma = value.indexOf(',');
      if (comma < 0 || !value.slice(0, comma).endsWith(';base64')) {
        throw new Error('ERR_ASSET_FORMAT: 只支持 base64 编码的旧内嵌媒体');
      }
      const encoded = value.slice(comma + 1);
      if (encoded.length > Math.ceil(MAX_ASSET_BYTES * 4 / 3) + 4) throw new Error('ERR_ASSET_SIZE: 旧内嵌媒体超限');
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const reference = await importAsset(new File([bytes], `imported.${ext}`, { type: match[1] }));
      replace(reference);
    });
  });
  await migration;
  return copy;
}

/** Refuse to save a project whose content-addressed resources are missing or damaged. */
export async function verifyProjectAssets(project: VNProject): Promise<void> {
  for (const ref of getProjectWorkspaceAssetReferences(project)) await readAsset(ref);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('ERR_ASSET_READ: 无法打包资源'));
    reader.readAsDataURL(blob);
  });
}

/** A standalone HTML export embeds referenced files, while the editable project stays small. */
export async function hydrateAssetsForHtmlExport(project: VNProject): Promise<VNProject> {
  const copy = structuredClone(project);
  const refs = new Map<string, Promise<string>>();
  const pending: Promise<void>[] = [];
  forEachProjectMedia(copy, (value, replace) => {
    if (/^https?:\/\//i.test(value)) {
      throw new Error('ERR_EXPORT_EXTERNAL_MEDIA: 请先将远程媒体导入工程，再生成离线 HTML。');
    }
    if (!value.startsWith(ASSET_PREFIX) && !value.startsWith('/images/')) return;
    let data = refs.get(value);
    if (!data) {
      data = value.startsWith(ASSET_PREFIX)
        ? readAsset(value).then(blobToDataUrl)
        : fetch(value).then(async (response) => {
            if (!response.ok) throw new Error(`ERR_EXPORT_ASSET: 无法读取 ${value}`);
            const blob = await response.blob();
            if (!blob.type.startsWith('image/') && !blob.type.startsWith('video/')) throw new Error(`ERR_EXPORT_ASSET: 无效媒体 ${value}`);
            return blobToDataUrl(blob);
          });
      refs.set(value, data);
    }
    pending.push(data.then(replace));
  });
  await Promise.all(pending);
  return copy;
}
