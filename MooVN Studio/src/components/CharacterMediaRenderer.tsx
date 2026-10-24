import React, { useEffect, useRef, useState } from 'react';
import { CharacterIdleMotion, CharacterMediaType } from '../types';
import {
  clampAvatarDelta,
  IAvatarRenderable,
  newImageAvatar,
} from '../lib/avatarSystem';

interface CharacterMediaRendererProps {
  mediaUrl: string;
  alt: string;
  mediaType?: CharacterMediaType;
  videoLoop?: boolean;
  videoMuted?: boolean;
  videoPlaybackRate?: number;
  chromaKeyColor?: string;
  idleMotion?: CharacterIdleMotion;
  blinkEnabled?: boolean;
  isTalking?: boolean;
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
  mediaUrl,
  alt,
  mediaType,
  videoLoop = true,
  videoMuted = true,
  videoPlaybackRate = 1,
  chromaKeyColor,
  idleMotion = 'none',
  blinkEnabled = true,
  isTalking = false,
  className = '',
  style,
}) => {
  const resolvedType = detectCharacterMediaType(mediaUrl, mediaType);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarRef = useRef<IAvatarRenderable | null>(null);

  const [videoStatus, setVideoStatus] = useState<'ready' | 'blocked' | 'error'>('ready');
  const [renderState, setRenderState] = useState<{
    bodyScaleY: number;
    hairRotDeg: number;
    eyesClosed: boolean;
    mouthFrame: 'neutral' | 'talk_a' | 'talk_b';
    prevTexture: string | null;
    currTexture: string | null;
    crossfadeAlpha: number;
  }>({
    bodyScaleY: 1,
    hairRotDeg: 0,
    eyesClosed: false,
    mouthFrame: 'neutral',
    prevTexture: null,
    currTexture: mediaUrl,
    crossfadeAlpha: 1,
  });

  // Initialize and clean up layered ImageAvatar instance
  useEffect(() => {
    const avatar = newImageAvatar({
      baseTexture: mediaUrl,
      breathingEnabled: idleMotion === 'breathe',
      blinkEnabled,
    });
    avatarRef.current = avatar;
    return () => {
      avatar.release();
      avatarRef.current = null;
    };
  }, []);

  // Sync expression texture changes (triggers single-shot 180ms crossfade, never loops)
  useEffect(() => {
    const avatar = avatarRef.current;
    if (!avatar) return;
    avatar.setExpression(mediaUrl);
    const cf = avatar.getCrossfadeState();
    setRenderState((prev) => ({
      ...prev,
      prevTexture: cf.previousTexture,
      currTexture: cf.currentTexture || mediaUrl,
      crossfadeAlpha: cf.alpha,
    }));
  }, [mediaUrl]);

  // Sync breathing / blink / lip-sync channels
  useEffect(() => {
    const avatar = avatarRef.current;
    if (!avatar) return;
    avatar.setBreathingEnabled(idleMotion === 'breathe');
    avatar.setBlinkEnabled(blinkEnabled);
    avatar.setTalking(Boolean(isTalking));
  }, [idleMotion, blinkEnabled, isTalking]);

  // Run layered avatar state machine loop with clamped dt (clamp(dt, 0, 0.05))
  useEffect(() => {
    if (resolvedType === 'video') return;
    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = clampAvatarDelta(rawDt);
      const avatar = avatarRef.current;
      if (avatar && !avatar.isReleased()) {
        avatar.update(dt);
        const layers = avatar.getAllLayers();
        const cf = avatar.getCrossfadeState();
        const mouthFrame: 'neutral' | 'talk_a' | 'talk_b' = layers.mouth_talk_b.visible
          ? 'talk_b'
          : layers.mouth_talk_a.visible
          ? 'talk_a'
          : 'neutral';

        setRenderState((prev) => {
          const nextScaleY = Math.round(layers.body.scaleY * 10000) / 10000;
          const nextHairRot = Math.round(layers.hair_front.rotationDeg * 100) / 100;
          const nextBlink = layers.eyes_closed.visible;
          const nextAlpha = Math.round(cf.alpha * 100) / 100;
          if (
            prev.bodyScaleY === nextScaleY &&
            prev.hairRotDeg === nextHairRot &&
            prev.eyesClosed === nextBlink &&
            prev.mouthFrame === mouthFrame &&
            prev.crossfadeAlpha === nextAlpha &&
            prev.currTexture === (cf.currentTexture || mediaUrl)
          ) {
            return prev;
          }
          return {
            bodyScaleY: nextScaleY,
            hairRotDeg: nextHairRot,
            eyesClosed: nextBlink,
            mouthFrame,
            prevTexture: cf.previousTexture,
            currTexture: cf.currentTexture || mediaUrl,
            crossfadeAlpha: nextAlpha,
          };
        });
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [resolvedType, mediaUrl]);

  // Video playback & downsampled chroma-key compositing
  useEffect(() => {
    if (resolvedType !== 'video') return;
    const video = videoRef.current;
    if (!video) return;

    setVideoStatus('ready');
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
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        // Downsample chroma-key buffer to MAX_CHROMA_DIMENSION so main thread never stalls
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
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = frame.data;
          for (let i = 0; i < data.length; i += 4) {
            const dr = data[i] - kr;
            const dg = data[i + 1] - kg;
            const db = data[i + 2] - kb;
            const distSq = dr * dr + dg * dg + db * db;
            if (distSq < thresholdSq) {
              data[i + 3] = 0;
            } else if (distSq < thresholdSq * 1.6) {
              const alphaRatio =
                (distSq - thresholdSq) / (thresholdSq * 0.6);
              data[i + 3] = Math.round(data[i + 3] * alphaRatio);
            }
          }
          ctx.putImageData(frame, 0, 0);
        } catch {
          // Cross-origin video without CORS falls back to standard video element
        }
      }
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [resolvedType, mediaUrl, videoPlaybackRate, chromaKeyColor]);

  const useChromaCanvas =
    resolvedType === 'video' &&
    Boolean(chromaKeyColor && chromaKeyColor !== 'none' && parseHexRgb(chromaKeyColor));

  if (resolvedType === 'video') {
    return (
      <div className="relative inline-flex items-end justify-center max-w-full max-h-full">
        <video
          ref={videoRef}
          src={mediaUrl}
          loop={videoLoop}
          muted={videoMuted}
          playsInline
          autoPlay
          crossOrigin="anonymous"
          onError={() => setVideoStatus('error')}
          className={`${className} ${useChromaCanvas ? 'hidden' : ''}`}
          style={{
            ...style,
            transformOrigin: 'bottom center',
          }}
        />
        {useChromaCanvas && (
          <canvas
            ref={canvasRef}
            aria-label={alt}
            className={className}
            style={{
              ...style,
              transformOrigin: 'bottom center',
            }}
          />
        )}
        {videoStatus !== 'ready' && (
          <button
            type="button"
            onClick={() => {
              const v = videoRef.current;
              if (v) {
                v.play()
                  .then(() => setVideoStatus('ready'))
                  .catch(() => setVideoStatus('error'));
              }
            }}
            className="absolute bottom-3 px-2 py-1 rounded bg-zinc-900/90 border border-zinc-600 text-[11px] text-zinc-200 hover:bg-zinc-800"
          >
            {videoStatus === 'blocked' ? '点击播放视频立绘' : '视频立绘加载失败'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative inline-flex items-end justify-center max-w-full max-h-full"
      style={{
        transformOrigin: 'bottom center',
        transform:
          renderState.bodyScaleY !== 1
            ? `scaleY(${renderState.bodyScaleY})`
            : undefined,
      }}
    >
      {/* Previous expression sprite during single-shot 180ms crossfade */}
      {renderState.prevTexture && renderState.crossfadeAlpha < 1 && (
        <img
          src={renderState.prevTexture}
          alt={alt}
          draggable={false}
          className={`${className} absolute inset-0 pointer-events-none`}
          style={{
            ...style,
            opacity: Math.max(0, 1 - renderState.crossfadeAlpha),
            transformOrigin: 'bottom center',
          }}
        />
      )}

      {/* Primary body/expression sprite layer */}
      <img
        src={renderState.currTexture || mediaUrl}
        alt={alt}
        draggable={false}
        className={className}
        style={{
          ...style,
          opacity:
            style?.opacity !== undefined
              ? Number(style.opacity) * renderState.crossfadeAlpha
              : renderState.crossfadeAlpha,
          transformOrigin: 'bottom center',
        }}
      />

      {/* Lip-sync & blink state data attributes for engine inspection */}
      <span
        data-avatar-blink={renderState.eyesClosed ? 'closed' : 'open'}
        data-avatar-mouth={renderState.mouthFrame}
        className="sr-only"
      />
    </div>
  );
};

export default CharacterMediaRenderer;
