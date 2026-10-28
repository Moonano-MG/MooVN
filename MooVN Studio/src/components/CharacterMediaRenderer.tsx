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
  idleMotion = 'none',
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
  const bodyContainerRef = useRef<HTMLDivElement | null>(null);

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
      breathingEnabled: !effectiveMotionOff && idleMotion === 'breathe',
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
  }, [layerTextures, hasL1Layers, mediaUrl]);

  useEffect(() => {
    const avatar = avatarRef.current;
    if (!avatar) return;
    avatar.setBreathingEnabled(!effectiveMotionOff && idleMotion === 'breathe');
    avatar.setBlinkEnabled(!effectiveMotionOff && blinkEnabled && hasL1Layers);
    avatar.setTalking(!effectiveMotionOff && Boolean(isTalking) && hasL1Layers);
    if (effectiveMotionOff) {
      setL1FacialState((state) => state.eyesClosed || state.mouthFrame !== 'neutral'
        ? { eyesClosed: false, mouthFrame: 'neutral' }
        : state);
    }
  }, [idleMotion, blinkEnabled, isTalking, effectiveMotionOff, hasL1Layers, mediaUrl, layerTextures]);

  // Imperative RAF loop ONLY runs when L1 layers or breathing are active (`GPT-14`)
  // Updates body breathing via imperative DOM transform (0 React re-renders per frame!)
  // and only triggers React state when discrete L1 blink/mouth state changes.
  useEffect(() => {
    if (resolvedType === 'video') return;
    const shouldAnimate =
      !effectiveMotionOff && (hasL1Layers || idleMotion === 'breathe');
    if (!shouldAnimate) {
      if (bodyContainerRef.current) {
        bodyContainerRef.current.style.transform = 'scaleY(1)';
      }
      return;
    }

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

        // Imperative DOM update for subtle body breathing (no React re-render)
        if (bodyContainerRef.current) {
          const sy = layers.body.scaleY;
          bodyContainerRef.current.style.transform =
            Math.abs(sy - 1) > 0.0002 ? `scale(1, ${sy.toFixed(4)})` : 'scale(1, 1)';
        }

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
  }, [resolvedType, effectiveMotionOff, hasL1Layers, idleMotion]);

  // Video playback & downsampled chroma-key compositing
  useEffect(() => {
    if (resolvedType !== 'video') return;
    const video = videoRef.current;
    if (!video) return;

    setVideoStatus('ready');
    setChromaError(null);
    video.playbackRate = Math.max(0.25, Math.min(3, videoPlaybackRate || 1));

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err: unknown) => {
        const name = (err as { name?: string })?.name || '';
        setVideoStatus(name === 'NotAllowedError' ? 'blocked' : 'error');
      });
    }

    const keyRgb =
      chromaKeyColor && chromaKeyColor !== 'none'
        ? parseHexRgb(chromaKeyColor)
        : null;
    if (!keyRgb || !canvasRef.current) return;

    let rafId = 0;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const [kr, kg, kb] = keyRgb;
    const thresholdSq = 68 * 68;

    const renderFrame = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
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
      cancelAnimationFrame(rafId);
      video.pause();
    };
  }, [resolvedType, mediaUrl, videoPlaybackRate, chromaKeyColor]);

  if (assetError) {
    return <div role="alert" className="text-xs text-rose-300 bg-zinc-900/90 p-2">{assetError}</div>;
  }
  if (!mediaUrl && !hasL1Layers) {
    return <div className={className} style={style} aria-label={sourceMediaUrl ? '资源加载中' : '未绑定立绘'} />;
  }

  if (resolvedType === 'video') {
    const useChromaCanvas = Boolean(
      chromaKeyColor && chromaKeyColor !== 'none' && parseHexRgb(chromaKeyColor) && !chromaError
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
        {videoStatus !== 'ready' && (
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

  // L1 Layered Avatar Rendering when `layerTextures` are configured
  if (hasL1Layers && layerTextures) {
    const avatar = avatarRef.current;
    const layers = avatar?.getAllLayers();
    return (
      <div
        ref={bodyContainerRef}
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
          src={layerTextures.body || mediaUrl || Object.values(layerTextures).find(Boolean)}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="w-full h-full object-contain invisible pointer-events-none select-none"
        />
        {ALL_AVATAR_LAYER_IDS.map((layerId) => {
          const layer = layers?.[layerId];
          const tex = layer?.texture || layerTextures[layerId];
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

  // Default L0 Static Portrait (with optional subtle bottom-anchored body breathing when explicitly enabled)
  return (
    <div
      ref={bodyContainerRef}
      className={`relative inline-flex items-end justify-center select-none ${className}`}
      style={{
        ...style,
        transformOrigin: 'bottom center',
      }}
      data-avatar-level="L0_STATIC"
    >
      {crossfade.prevUrl && crossfade.fading && (
        <img
          src={crossfade.prevUrl}
          alt={alt}
          draggable={false}
          className="w-full h-full object-contain pointer-events-none select-none absolute inset-0 opacity-0 transition-opacity duration-180"
        />
      )}
      <img
        src={crossfade.currUrl}
        alt={alt}
        draggable={false}
        className="w-full h-full object-contain pointer-events-none select-none transition-opacity duration-180"
      />
    </div>
  );
};
