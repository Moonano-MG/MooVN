import React, { useEffect, useRef } from 'react';
import { CharacterIdleMotion, CharacterMediaType } from '../types';

export interface CharacterMediaRendererProps {
  src: string;
  alt: string;
  mediaType?: CharacterMediaType;
  videoLoop?: boolean;
  videoPlaybackRate?: number;
  chromaKeyColor?: string;
  idleMotion?: CharacterIdleMotion;
  isSpeaking?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function isVideoMediaSource(src?: string, mediaType?: CharacterMediaType): boolean {
  if (mediaType === 'video') return true;
  if (!src) return false;
  const lower = src.toLowerCase();
  return (
    lower.startsWith('data:video/') ||
    lower.startsWith('blob:video/') ||
    /\.(mp4|webm|mov|ogv)(\?|#|$)/i.test(lower)
  );
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
  src,
  alt,
  mediaType,
  videoLoop = true,
  videoPlaybackRate = 1,
  chromaKeyColor,
  idleMotion = 'none',
  isSpeaking = false,
  className = '',
  style,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isVideo = isVideoMediaSource(src, mediaType);
  const useChromaKey =
    isVideo &&
    Boolean(chromaKeyColor && chromaKeyColor !== 'none' && parseHexRgb(chromaKeyColor));

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.playbackRate = Math.max(0.25, Math.min(3, videoPlaybackRate || 1));
    vid.play().catch(() => {
      // Autoplay fallback handled silently
    });
  }, [src, videoPlaybackRate]);

  useEffect(() => {
    if (!useChromaKey || !chromaKeyColor) return;
    const vid = videoRef.current;
    const canvas = canvasRef.current;
    if (!vid || !canvas) return;
    const rgb = parseHexRgb(chromaKeyColor);
    if (!rgb) return;
    const [keyR, keyG, keyB] = rgb;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let rafId = 0;
    const toleranceSq = 68 * 68 * 3;

    const renderFrame = () => {
      if (vid.readyState >= 2 && vid.videoWidth > 0 && vid.videoHeight > 0) {
        if (canvas.width !== vid.videoWidth || canvas.height !== vid.videoHeight) {
          canvas.width = vid.videoWidth;
          canvas.height = vid.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        try {
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = frame.data;
          for (let i = 0; i < data.length; i += 4) {
            const dr = data[i] - keyR;
            const dg = data[i + 1] - keyG;
            const db = data[i + 2] - keyB;
            if (dr * dr + dg * dg + db * db <= toleranceSq) {
              data[i + 3] = 0;
            }
          }
          ctx.putImageData(frame, 0, 0);
        } catch {
          // Cross-origin fallback
        }
      }
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [useChromaKey, chromaKeyColor, src]);

  // Compute CSS animation for idleMotion / speaking
  const activeMotion: CharacterIdleMotion =
    idleMotion !== 'none' ? idleMotion : isSpeaking ? 'talk_pulse' : 'none';

  const motionClass =
    activeMotion === 'breathe'
      ? 'moovn-char-breathe'
      : activeMotion === 'float'
      ? 'moovn-char-float'
      : activeMotion === 'talk_pulse'
      ? 'moovn-char-talk'
      : activeMotion === 'bounce'
      ? 'moovn-char-bounce'
      : activeMotion === 'sway'
      ? 'moovn-char-sway'
      : '';

  if (isVideo) {
    return (
      <>
        <video
          ref={videoRef}
          src={src}
          loop={videoLoop}
          muted
           autoPlay
          playsInline
          crossOrigin="anonymous"
          draggable={false}
          style={useChromaKey ? { display: 'none' } : style}
          className={`${className} ${motionClass}`}
        />
        {useChromaKey && (
          <canvas
            ref={canvasRef}
            style={style}
            className={`${className} ${motionClass}`}
          />
        )}
      </>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      style={style}
      className={`${className} ${motionClass}`}
    />
  );
};
