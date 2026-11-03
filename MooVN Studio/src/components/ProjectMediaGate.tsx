import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AvatarLayerTextureMap } from '../types';
import {
  classifyProjectMedia,
  fetchConsentedProjectMedia,
  MAX_REMOTE_MEDIA_BYTES,
  type ProjectMediaReference,
} from '../lib/projectMediaPolicy';

type RemoteReference = Extract<ProjectMediaReference, { kind: 'remote' }>;
interface ProjectMediaGateProps {
  mediaUrl: string;
  layerTextures?: AvatarLayerTextureMap;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  children: (mediaUrl: string, layerTextures?: AvatarLayerTextureMap) => React.ReactNode;
}

function stopPointer(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

const MediaNoticeContext = createContext<HTMLElement | null>(null);

/** Keep notices above dialogue/portrait layers, even when a portrait is offscreen. */
export const ProjectMediaNoticeArea: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return (
    <MediaNoticeContext.Provider value={target}>
      <div ref={setTarget} aria-label="工程媒体状态" onMouseDown={stopPointer} onTouchStart={stopPointer} onClick={stopPointer}
        className="absolute top-1 left-1 right-1 z-[45] max-h-[30%] overflow-y-auto flex flex-wrap gap-1 empty:hidden" />
      {children}
    </MediaNoticeContext.Provider>
  );
};

function MediaNotice({ children }: { children: React.ReactNode }) {
  const target = useContext(MediaNoticeContext);
  return target ? createPortal(children, target) : <>{children}</>;
}

/** Block untrusted media synchronously, before the renderer can mount an img/video. */
export const ProjectMediaGate: React.FC<ProjectMediaGateProps> = (props) => {
  const entries = Object.values(props.layerTextures || {}).filter((source): source is string => typeof source === 'string');
  const refs = [props.mediaUrl, ...entries].map(classifyProjectMedia);
  const invalid = refs.find((ref) => ref.kind === 'invalid');
  if (entries.length > 12 || invalid?.kind === 'invalid') {
    return (
      <MediaNotice>
        <div role="alert" className="max-w-full rounded bg-rose-950/95 border border-rose-500 p-2 text-xs text-rose-100" style={{ pointerEvents: 'auto' }} onMouseDown={stopPointer} onTouchStart={stopPointer} onClick={stopPointer}>
          「{props.alt}」媒体未加载：{invalid?.kind === 'invalid' ? invalid.reason : '分层数量超出限制'}。请导入本地素材。
        </div>
      </MediaNotice>
    );
  }
  const remote = [...new Map(refs.filter((ref): ref is RemoteReference => ref.kind === 'remote')
    .map((ref) => [ref.source, ref])).values()].sort((a, b) => a.source.localeCompare(b.source));
  if (!remote.length) return <>{props.children(props.mediaUrl, props.layerTextures)}</>;
  // Exact source strings (not a lossy hash) are the permission boundary. A
  // changed set of remote addresses remounts the gate and invalidates consent.
  return <RemoteMediaGate key={JSON.stringify(remote.map((ref) => ref.source))} {...props} remote={remote} />;
};

interface RemoteMediaGateProps extends ProjectMediaGateProps { remote: RemoteReference[] }
type RemoteResult = { attempt: number; urls?: Map<string, string>; error?: string };

const RemoteMediaGate: React.FC<RemoteMediaGateProps> = ({ mediaUrl, layerTextures, alt, children, remote }) => {
  // The gate is keyed by this set. Keep its references stable through unrelated
  // editor renders so approval cannot accidentally cause repeated network calls.
  const [approvedCandidates] = useState(() => remote);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<RemoteResult | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!dialogOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setDialogOpen(false);
        buttonRef.current?.focus();
      } else if (event.key === 'Tab' && dialogRef.current) {
        const controls = [...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )].filter((element) => element.getClientRects().length > 0);
        if (!controls.length) {
          event.preventDefault();
          dialogRef.current.focus();
          return;
        }
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [dialogOpen]);

  useEffect(() => {
    if (!attempt) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const objectUrls: string[] = [];
    let cancelled = false;
    const release = () => {
      for (const url of objectUrls) URL.revokeObjectURL(url);
      objectUrls.length = 0;
    };
    (async () => {
      const urls = new Map<string, string>();
      let remaining = MAX_REMOTE_MEDIA_BYTES;
      for (const ref of approvedCandidates) {
        const blob = await fetchConsentedProjectMedia(ref.source, controller.signal, remaining);
        if (cancelled || controller.signal.aborted) return;
        remaining -= blob.size;
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        urls.set(ref.source, objectUrl);
      }
      if (!cancelled && !controller.signal.aborted) setResult({ attempt, urls });
    })().catch((error: unknown) => {
      if (cancelled || controller.signal.aborted) return;
      release();
      setResult({ attempt, error: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      cancelled = true;
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
      release();
    };
  }, [attempt, approvedCandidates]);

  const resultUrls = attempt > 0 && result?.attempt === attempt ? result.urls : undefined;
  const incomplete = Boolean(resultUrls && approvedCandidates.some((ref) => !resultUrls.get(ref.source)?.startsWith('blob:')));
  const ready = incomplete ? undefined : resultUrls;
  const failed = incomplete ? 'ERR_REMOTE_MEDIA_STATE: 已批准的素材未完整解析，请重试或导入本地素材。'
    : attempt > 0 && result?.attempt === attempt ? result.error : undefined;
  const loading = attempt > 0 && result?.attempt !== attempt;
  const resolvedLayers = useMemo(() => {
    if (!ready || !layerTextures) return layerTextures;
    return Object.fromEntries(Object.entries(layerTextures).map(([layer, source]) => [
      layer, typeof source === 'string' ? (ready.get(source) || source) : source,
    ])) as AvatarLayerTextureMap;
  }, [ready, layerTextures]);

  const closeDialog = () => {
    setDialogOpen(false);
    buttonRef.current?.focus();
  };
  const stopLoading = (event: React.MouseEvent) => {
    event.stopPropagation();
    controllerRef.current?.abort();
    setAttempt(0);
    setResult(null);
  };
  if (ready) {
    return (
      <>
        {children(ready.get(mediaUrl) || mediaUrl, resolvedLayers)}
        <MediaNotice>
          <button
            type="button" aria-label={`停止远程素材：${alt}`}
            onMouseDown={stopPointer} onTouchStart={stopPointer} onClick={stopLoading}
            className="max-w-full rounded bg-zinc-950/95 border border-amber-500/60 px-2 py-1 text-[11px] text-amber-100"
            style={{ pointerEvents: 'auto' }}
          >停止远程素材 · {alt}</button>
        </MediaNotice>
      </>
    );
  }

  return (
    <>
      <MediaNotice>
        <div role={failed ? 'alert' : undefined} className="max-w-full rounded border border-amber-500/60 bg-zinc-950/95 px-2 py-1 text-amber-100" style={{ pointerEvents: 'auto' }} onMouseDown={stopPointer} onTouchStart={stopPointer} onClick={stopPointer}>
          {loading ? (
            <div role="status" className="text-[11px]">
              正在加载「{alt}」的远程素材…{' '}
              <button type="button" onClick={stopLoading} className="underline">取消加载</button>
            </div>
          ) : (
            <button
              ref={buttonRef} type="button" aria-haspopup="dialog"
              aria-label={`${failed ? '远程素材加载失败' : '远程素材已阻止'}：${alt}，查看详情`}
              onClick={(event) => { event.stopPropagation(); setDialogOpen(true); }}
              className="max-w-full break-words text-left text-[11px] font-semibold hover:text-white"
            >{failed ? '远程素材加载失败' : '远程素材已阻止'} · {alt} · 查看</button>
          )}
        </div>
      </MediaNotice>
      {dialogOpen && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4" onMouseDown={stopPointer} onTouchStart={stopPointer} onClick={stopPointer}>
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-amber-500/60 bg-[#161619] p-4 text-sm text-zinc-100 shadow-2xl">
            <h2 id={titleId} className="text-base font-semibold">允许加载远程素材？</h2>
            <p id={descriptionId} className="mt-2 text-zinc-200">工程为「{alt}」指定了 {approvedCandidates.length} 个远程地址。默认不会连接；允许后站点可看到你的 IP、访问时间及浏览器跨域 Origin。</p>
            <ul aria-label="待加载的远程地址" className="my-3 max-h-40 overflow-y-auto rounded border border-[#454047] bg-black/30 p-2 text-xs text-amber-100 break-all">
              {approvedCandidates.map((ref) => <li key={ref.source} className="py-1">{ref.display}</li>)}
            </ul>
            <details className="mb-3 text-xs text-zinc-300">
              <summary className="cursor-pointer underline">查看完整地址（可能含敏感参数）</summary>
              <ul className="mt-2 max-h-28 overflow-y-auto rounded bg-black/30 p-2 break-all">
                {approvedCandidates.map((ref) => <li key={ref.source} className="py-1">{ref.source}</li>)}
              </ul>
            </details>
            {approvedCandidates.some((ref) => ref.insecure) && <p className="mb-2 font-semibold text-amber-300">其中包含 HTTP 明文地址，传输内容可能被窃听或修改。</p>}
            <p className="text-xs text-zinc-300">请求不携带 Cookie 或 Referer，不跟随重定向，本组远程素材总计最多 100 MiB。跨域限制或桌面安全策略可能阻止加载；也可先下载并导入本地素材。此许可仅作用于当前立绘和这组地址，切换节点或关闭后需重新确认。</p>
            {failed && <p role="alert" className="mt-3 rounded border border-rose-500/60 bg-rose-950/50 p-2 text-xs text-rose-200">{failed}</p>}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" autoFocus onClick={closeDialog} className="rounded border border-zinc-600 px-3 py-2 text-zinc-200 hover:bg-zinc-800">取消</button>
              <button type="button" onClick={() => { setDialogOpen(false); setResult(null); setAttempt((current) => current + 1); }} className="rounded bg-amber-300 px-3 py-2 font-semibold text-zinc-950 hover:bg-amber-200">允许并尝试加载</button>
            </div>
          </div>
        </div>, document.body,
      )}
    </>
  );
};
