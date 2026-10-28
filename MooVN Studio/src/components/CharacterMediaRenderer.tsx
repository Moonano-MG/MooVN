import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AvatarLayerTextureMap,
  CharacterIdleMotion,
  CharacterMediaType,
} from '../types';
import {
  ALL_AVATAR_LAYER_IDS,
  clampAvatarDelta,
  IAvatarRenderable,
  newImageAvatar,
} from '../lib/avatarSystem';
import { ASSET_PREFIX, readAsset } from '../lib/assetStore';

interface CharacterMediaRendererProps {
  mediaUrl: string;
  alt: string;
  mediaType?: CharacterMediaType;
  layerTextures?: AvatarLayerTextureMap;
  videoLoop?: boolean;
  videoMuted?: boolean;
  videoPlaybackRate?: number;
  chromaKeyColor?: string;
  idleMotion?: CharacterIdleMotion;
  blinkEnabled?: boolean;
  isTalking?: boolean;
  motionLevel?: 'off' | 'subtle' | 'full';
  className?: string;
  style?: React.CSSProperties;
}

const MAX_CHROMA_DIMENSION = 480;

export function detectCharacterMediaType(
  url: string,
  explicitType?: CharacterMediaType
): CharacterMediaType {
  if (explicitType) return explicitType;
  const lower = (url || '').toLowerCase();
  if (
    lower.startsWith('data:video/') ||
    lower.endsWith('.mp4') ||
    lower.endsWith('.webm') ||
    lower.endsWith('.mov') ||
    lower.includes('.mp4?') ||
    lower.includes('.webm?')
  ) {
    return 'video';
  }
  if (
    lower.startsWith('data:image/gif') ||
    lower.startsWith('data:image/webp') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.apng') ||
    lower.endsWith('.webp')
  ) {
    return 'animated_image';
  }
  return 'static';
}

export function isVideoMediaSource(
  url?: string,
  explicitType?: CharacterMediaType
): boolean {
  return detectCharacterMediaType(url || '', explicitType) === 'video';
}

/** Capture one still frame so animated image formats obey motion-off. */
function snapshotImage(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(source)) image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context || !canvas.width || !canvas.height) throw new Error('无法读取图像尺寸');
        context.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (error: unknown) {
        reject(new Error(`无法生成静止帧：${error instanceof Error ? error.message : String(error)}`));
      }
    };
    image.onerror = () => reject(new Error('无法加载图像静止帧'));
    image.src = source;
  });
}

function parseHexRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b];
    }
  }
  return null;
}

export const CharacterMediaRenderer: React.FC<CharacterMediaRendererProps> = ({
  mediaUrl: sourceMediaUrl,
  alt,
  mediaType,
  layerTextures: sourceLayerTextures,
  videoLoop = true,
  videoMuted = true,
  videoPlaybackRate = 1,
  chromaKeyColor,
  blinkEnabled = true,
  isTalking = false,
  motionLevel = 'subtle',
  className = '',
  style,
}) => {
  const [mediaUrl, setMediaUrl] = useState(sourceMediaUrl.startsWith(ASSET_PREFIX) ? '' : sourceMediaUrl);
  const [layerTextures, setLayerTextures] = useState<AvatarLayerTextureMap | undefined>(undefined);
  const [assetError, setAssetError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setAssetError(null);
    if (!sourceMediaUrl.startsWith(ASSET_PREFIX)) {
      setMediaUrl(sourceMediaUrl);
      return;
    }
    setMediaUrl('');
    readAsset(sourceMediaUrl).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setMediaUrl(objectUrl);
    }).catch((error: unknown) => {
      if (!cancelled) setAssetError(error instanceof Error ? error.message : String(error));
    });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [sourceMediaUrl]);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    setLayerTextures(undefined);
    if (!sourceLayerTextures) return;
    Promise.all(Object.entries(sourceLayerTextures).map(async ([layer, source]) => {
      if (!source || !source.startsWith(ASSET_PREFIX)) return [layer, source] as const;
      const blob = await readAsset(source);
      if (cancelled) return [layer, undefined] as const;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      return [layer, url] as const;
    })).then((entries) => {
      if (!cancelled) setLayerTextures(Object.fromEntries(entries) as AvatarLayerTextureMap);
    }).catch((error: unknown) => {
      if (!cancelled) setAssetError(error instanceof Error ? error.message : String(error));
    });
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [sourceLayerTextures]);

  const resolvedType = detectCharacterMediaType(mediaUrl, mediaType);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarRef = useRef<IAvatarRenderable | null>(null);

  const [videoStatus, setVideoStatus] = useState<'ready' | 'blocked' | 'error'>('ready');
  const [chromaError, setChromaError] = useState<string | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  // Track single-shot texture crossfade on expression switch
  const [crossfade, setCrossfade] = useState<{
    prevUrl: string | null;
    currUrl: string;
    fading: boolean;
  }>({
    prevUrl: null,
    currUrl: mediaUrl,
    fading: false,
  });

  // Track L1 facial frame changes ONLY when L1 layered textures are actually configured
  const [l1FacialState, setL1FacialState] = useState<{
    eyesClosed: boolean;
    mouthFrame: 'neutral' | 'talk_a' | 'talk_b';
  }>({
    eyesClosed: false,
    mouthFrame: 'neutral',
  });

  const hasL1Layers = useMemo(() => {
    if (!layerTextures) return false;
    return Boolean(
      layerTextures.eyes_closed ||
        layerTextures.mouth_talk_a ||
        layerTextures.mouth_talk_b ||
        layerTextures.blush ||
        layerTextures.hair_front
    );
  }, [layerTextures]);

  const effectiveMotionOff = motionLevel === 'off' || prefersReducedMotion;
  const [stillFrame, setStillFrame] = useState<{
    source: string;
    layerSources: AvatarLayerTextureMap | undefined;
    base: string;
    layers: AvatarLayerTextureMap;
    error?: string;
  } | null>(null);

  // A GIF/APNG/WebP, including a layer image, may animate by itself even
  // when no RAF is running. Capture a still for every image while motion is
  // off, or show an explicit error rather than display an animated fallback.
  useEffect(() => {
    let cancelled = false;
    if (!effectiveMotionOff || resolvedType === 'video') {
      setStillFrame(null);
      return;
    }
    setStillFrame(null);
    const entries = Object.entries(layerTextures || {}).filter((entry): entry is [string, string] => Boolean(entry[1]));
    Promise.all([
      mediaUrl ? snapshotImage(mediaUrl) : Promise.resolve(''),
      ...entries.map(([, source]) => snapshotImage(source)),
    ]).then(([base, ...layers]) => {
      if (!cancelled) setStillFrame({ source: mediaUrl, layerSources: layerTextures, base, layers: Object.fromEntries(entries.map(([key], index) => [key, layers[index]])) });
    }).catch((error: unknown) => {
      if (!cancelled) setStillFrame({ source: mediaUrl, layerSources: layerTextures, base: '', layers: {}, error: error instanceof Error ? error.message : String(error) });
    });
    return () => { cancelled = true; };
  }, [effectiveMotionOff, mediaUrl, layerTextures, resolvedType]);

  // Listen to OS prefers-reduced-motion media query (`GPT-33`)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // Single-shot 180ms crossfade when `mediaUrl` changes (no 60fps React setState)
  useEffect(() => {
    setCrossfade((prev) => {
      if (prev.currUrl === mediaUrl) return prev;
      if (effectiveMotionOff) {
        return { prevUrl: null, currUrl: mediaUrl, fading: false };
      }
      return { prevUrl: prev.currUrl, currUrl: mediaUrl, fading: true };
    });
    if (effectiveMotionOff) return;
    const timer = window.setTimeout(() => {
      setCrossfade((prev) => ({ ...prev, prevUrl: null, fading: false }));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mediaUrl, effectiveMotionOff]);

  // Initialize ImageAvatar instance
  useEffect(() => {
    const avatar = newImageAvatar({
      baseTexture: mediaUrl,
      layerTextures,
      blinkIntervalMinSec: motionLevel === 'subtle' ? 4 : 2,
      blinkEnabled: !effectiveMotionOff && blinkEnabled && hasL1Layers,
    });
    avatarRef.current = avatar;
    // The instance is created after render; refresh once so the base and the
    // initially visible layers are present even when animation is disabled.
    setL1FacialState({ eyesClosed: false, mouthFrame: 'neutral' });
    return () => {
      avatar.release();
      avatarRef.current = null;
    };
  }, [layerTextures, hasL1Layers, mediaUrl, motionLevel]);

  useEffect(() => {
    const avatar = avatarRef.current;
    if (!avatar) return;
    avatar.setBlinkEnabled(!effectiveMotionOff && blinkEnabled && hasL1Layers);
    avatar.setTalking(!effectiveMotionOff && Boolean(isTalking) && hasL1Layers);
    if (effectiveMotionOff) {
      setL1FacialState((state) => state.eyesClosed || state.mouthFrame !== 'neutral'
        ? { eyesClosed: false, mouthFrame: 'neutral' }
        : state);
    }
  }, [blinkEnabled, isTalking, effectiveMotionOff, hasL1Layers, mediaUrl, layerTextures]);

  // L0 portraits never run a periodic animation. L1 updates discrete facial frames only.
  useEffect(() => {
    if (resolvedType === 'video') return;
    if (effectiveMotionOff || !hasL1Layers) return;

    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      if (typeof document !== 'undefined' && document.hidden) {
        lastTime = now;
        rafId = requestAnimationFrame(step);
        return;
      }

      const dt = clampAvatarDelta((now - lastTime) / 1000);
      lastTime = now;
      const avatar = avatarRef.current;

      if (avatar && !avatar.isReleased()) {
        avatar.update(dt);
        const layers = avatar.getAllLayers();

        // Only update React state if L1 discrete blink/mouth frame actually changed
        if (hasL1Layers) {
          const nextBlink = layers.eyes_closed.visible;
          const nextMouth: 'neutral' | 'talk_a' | 'talk_b' = layers.mouth_talk_b.visible
            ? 'talk_b'
            : layers.mouth_talk_a.visible
            ? 'talk_a'
            : 'neutral';
          setL1FacialState((prev) =>
            prev.eyesClosed === nextBlink && prev.mouthFrame === nextMouth
              ? prev
              : { eyesClosed: nextBlink, mouthFrame: nextMouth }
          );
        }
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [resolvedType, effectiveMotionOff, hasL1Layers]);

  // Video playback & downsampled chroma-key compositing
  useEffect(() => {
    if (resolvedType !== 'video') return;
    const video = videoRef.current;
    if (!video) return;

    setVideoStatus('ready');
    setChromaError(null);
    video.playbackRate = Math.max(0.25, Math.min(3, videoPlaybackRate || 1));
    if (effectiveMotionOff) {
      video.pause();
      return;
    }

    let cancelled = false;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err: unknown) => {
        if (cancelled) return;
        const name = (err as { name?: string })?.name || '';
        setVideoStatus(name === 'NotAllowedError' ? 'blocked' : 'error');
      });
    }

    const keyRgb =
      chromaKeyColor && chromaKeyColor !== 'none'
        ? parseHexRgb(chromaKeyColor)
        : null;
    if (!keyRgb || !canvasRef.current) return () => { cancelled = true; video.pause(); };

    let rafId = 0;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      setChromaError('无法初始化视频色键画布');
      return () => { cancelled = true; video.pause(); };
    }

    const [kr, kg, kb] = keyRgb;
    const thresholdSq = 68 * 68;

    let lastRenderedAt = -Infinity;
    const renderFrame = (now: number) => {
      if ((typeof document !== 'undefined' && document.hidden) || now - lastRenderedAt < 1000 / 24) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        lastRenderedAt = now;
        const aspect = video.videoWidth / video.videoHeight;
        const targetW =
          video.videoWidth > video.videoHeight
            ? Math.min(video.videoWidth, MAX_CHROMA_DIMENSION)
            : Math.round(Math.min(video.videoHeight, MAX_CHROMA_DIMENSION) * aspect);
        const targetH =
          video.videoHeight >= video.videoWidth
            ? Math.min(video.videoHeight, MAX_CHROMA_DIMENSION)
            : Math.round(Math.min(video.videoWidth, MAX_CHROMA_DIMENSION) / aspect);

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = Math.max(1, targetW);
          canvas.height = Math.max(1, targetH);
        }

        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = frame.data;
          for (let i = 0; i < data.length; i += 4) {
            const dr = data[i] - kr;
            const dg = data[i + 1] - kg;
            const db = data[i + 2] - kb;
            if (dr * dr + dg * dg + db * db <= thresholdSq) {
              data[i + 3] = 0;
            }
          }
          ctx.putImageData(frame, 0, 0);
        } catch (err: unknown) {
          setChromaError(
            err instanceof Error
              ? `跨域或画布像素读取受限 (${err.message})`
              : '视频色键读取受限'
          );
          return;
        }
      }
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      video.pause();
    };
  }, [resolvedType, mediaUrl, videoPlaybackRate, chromaKeyColor, effectiveMotionOff]);

  if (assetError) {
    return <div role="alert" className="text-xs text-rose-300 bg-zinc-900/90 p-2">{assetError}</div>;
  }
  if (!mediaUrl && !hasL1Layers) {
    return <div className={className} style={style} aria-label={sourceMediaUrl ? '资源加载中' : '未绑定立绘'} />;
  }

  if (resolvedType === 'video') {
    const useChromaCanvas = Boolean(
      !effectiveMotionOff && chromaKeyColor && chromaKeyColor !== 'none' && parseHexRgb(chromaKeyColor) && !chromaError
    );
    return (
      <div
        className={`relative inline-flex items-end justify-center select-none ${className}`}
        style={style}
      >
        <video
          ref={videoRef}
          src={mediaUrl}
          loop={videoLoop}
          muted={videoMuted}
          playsInline
          onError={() => setVideoStatus('error')}
          className={
            useChromaCanvas
              ? 'hidden'
              : 'w-full h-full object-contain pointer-events-none select-none'
          }
        />
        {useChromaCanvas && (
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain pointer-events-none select-none"
          />
        )}
        {!effectiveMotionOff && videoStatus !== 'ready' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const v = videoRef.current;
              if (v) {
                v.muted = true;
                v.play()
                  .then(() => setVideoStatus('ready'))
                  .catch(() => setVideoStatus('error'));
              }
            }}
            className="absolute inset-x-2 bottom-4 px-2.5 py-1.5 rounded bg-zinc-900/90 border border-amber-500/50 text-[11px] text-amber-200 shadow pointer-events-auto"
          >
            {videoStatus === 'blocked'
              ? '自动播放受阻，点击恢复播放'
              : '视频资源加载失败'}
          </button>
        )}
        {chromaError && (
          <div className="absolute top-2 inset-x-2 px-2 py-1 rounded bg-amber-950/90 border border-amber-500/40 text-[10px] text-amber-200">
            {chromaError}
          </div>
        )}
      </div>
    );
  }

  if (effectiveMotionOff && (!stillFrame || stillFrame.source !== mediaUrl || stillFrame.layerSources !== layerTextures)) {
    return <div className={className} style={style} role="status">正在生成静止帧…</div>;
  }
  if (effectiveMotionOff && stillFrame?.error) {
    return <div role="alert" className="text-xs text-amber-200 bg-zinc-900/90 p-2">动效已关闭；{stillFrame.error}。请重新导入图片。</div>;
  }

  // L1 Layered Avatar Rendering when `layerTextures` are configured
  if (hasL1Layers && layerTextures) {
    const avatar = avatarRef.current;
    const layers = avatar?.getAllLayers();
    return (
      <div
        className={`relative inline-flex items-end justify-center select-none ${className}`}
        style={{
          ...style,
          transformOrigin: 'bottom center',
        }}
        data-avatar-level="L1_LAYERED"
        data-eyes-closed={l1FacialState.eyesClosed ? 'true' : 'false'}
        data-mouth-frame={l1FacialState.mouthFrame}
      >
        {/* The absolutely positioned layers need an intrinsic sizing image;
            otherwise a width-based stage placement collapses to zero height. */}
        <img
          src={effectiveMotionOff ? (stillFrame?.layers.body || stillFrame?.base || Object.values(stillFrame?.layers || {}).find(Boolean)) : (layerTextures.body || mediaUrl || Object.values(layerTextures).find(Boolean))}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="w-full h-full object-contain invisible pointer-events-none select-none"
        />
        {ALL_AVATAR_LAYER_IDS.map((layerId) => {
          const layer = layers?.[layerId];
          const tex = effectiveMotionOff
            ? (stillFrame?.layers[layerId] || (layerId === 'body' ? stillFrame?.base : undefined))
            : (layer?.texture || layerTextures[layerId]);
          if (!tex || (layer && !layer.visible)) return null;
          return (
            <img
              key={layerId}
              src={tex}
              alt={`${alt}-${layerId}`}
              draggable={false}
              style={{ zIndex: layer?.zOrder ?? 20 }}
              className="w-full h-full object-contain pointer-events-none select-none absolute inset-0"
            />
          );
        })}
      </div>
    );
  }

  // Default L0 static portrait; no periodic transform is applied.
  return (
    <div
      className={`relative inline-flex items-end justify-center select-none ${className}`}
      style={{
        ...style,
        transformOrigin: 'bottom center',
      }}
      data-avatar-level="L0_STATIC"
    >
      {!effectiveMotionOff && crossfade.prevUrl && crossfade.fading && (
        <img
          src={crossfade.prevUrl}
          alt={alt}
          draggable={false}
          className="w-full h-full object-contain pointer-events-none select-none absolute inset-0 opacity-0 transition-opacity duration-180"
        />
      )}
      <img
        src={effectiveMotionOff ? stillFrame?.base : crossfade.currUrl}
        alt={alt}
        draggable={false}
        className="w-full h-full object-contain pointer-events-none select-none transition-opacity duration-180"
      />
    </div>
  );
};
