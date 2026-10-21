import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import {
  CharacterDef,
  CharacterExpression,
  SceneDef,
  StageCharacterPlacement,
} from '../types/moovn';
import { BACKGROUND_PRESET_META } from '../services/thumbnailGenerator';

interface PixiStageCanvasProps {
  scene: SceneDef;
  characters: CharacterDef[];
  interactiveEditor?: boolean;
  selectedCharacterId?: string | null;
  onSelectCharacter?: (characterId: string | null) => void;
  onUpdateCharacterPlacement?: (characterId: string, patch: Partial<StageCharacterPlacement>) => void;
  particleQuality?: 'high' | 'medium' | 'low';
}

interface ParticleItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
}

export const PixiStageCanvas: React.FC<PixiStageCanvasProps> = ({
  scene,
  characters,
  interactiveEditor = false,
  selectedCharacterId = null,
  onSelectCharacter,
  onUpdateCharacterPlacement,
  particleQuality = 'high',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingCharId, setDraggingCharId] = useState<string | null>(null);
  const [pixiVersion] = useState<string>(() => PIXI.VERSION || '8.x');

  // Render animated background & weather particles at 60fps on the underlying canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const width = 1280;
    const height = 720;
    canvas.width = width;
    canvas.height = height;

    const countMap = { high: 95, medium: 55, low: 25 };
    const particleCount =
      scene.background.weather === 'none' ? 0 : countMap[particleQuality] || 75;

    const particles: ParticleItem[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: scene.background.weather === 'rain' ? -2.2 : (Math.random() - 0.5) * 0.7,
      vy:
        scene.background.weather === 'rain'
          ? 11 + Math.random() * 6
          : scene.background.weather === 'bubbles'
          ? -(0.8 + Math.random() * 1.4)
          : (Math.random() - 0.5) * 0.5,
      size:
        scene.background.weather === 'rain'
          ? 1.5
          : scene.background.weather === 'bubbles'
          ? 3 + Math.random() * 6
          : 1.8 + Math.random() * 2.5,
      alpha: 0.25 + Math.random() * 0.65,
      phase: Math.random() * Math.PI * 2,
    }));

    const bgMeta =
      BACKGROUND_PRESET_META[scene.background.presetId] ||
      BACKGROUND_PRESET_META.rainy_station;

    let tick = 0;
    const render = () => {
      tick += 0.02;
      ctx.clearRect(0, 0, width, height);

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, bgMeta.skyTop);
      skyGrad.addColorStop(0.65, bgMeta.skyBottom);
      skyGrad.addColorStop(1, '#030816');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Atmospheric ambient glow
      const radGrad = ctx.createRadialGradient(
        width * 0.68,
        height * 0.28,
        20,
        width * 0.68,
        height * 0.28,
        520
      );
      radGrad.addColorStop(0, `${bgMeta.accentColor}44`);
      radGrad.addColorStop(0.5, `${bgMeta.horizonColor}22`);
      radGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, width, height);

      // Preset-specific scenic architecture
      const preset = scene.background.presetId;
      if (preset === 'rainy_station') {
        // Moon & Distant City Lights
        ctx.fillStyle = 'rgba(186, 230, 253, 0.16)';
        ctx.beginPath();
        ctx.arc(920, 155, 68, 0, Math.PI * 2);
        ctx.fill();

        // Station Canopy & Pillars
        ctx.fillStyle = '#061226';
        ctx.fillRect(0, 520, width, 200);
        ctx.strokeStyle = '#1e40af';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 520);
        ctx.lineTo(width, 520);
        ctx.stroke();

        // Overhead power lines & pillars
        for (let px = 140; px < width; px += 280) {
          ctx.fillStyle = '#091936';
          ctx.fillRect(px, 160, 16, 360);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
          ctx.fillRect(px + 3, 180, 4, 320);
        }

        // Glowing Station Clock (23:59)
        ctx.save();
        ctx.translate(220, 230);
        ctx.fillStyle = 'rgba(7, 22, 48, 0.9)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#bae6fd';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -28);
        ctx.moveTo(0, 0);
        ctx.lineTo(-4, -20);
        ctx.stroke();
        ctx.restore();
      } else if (preset === 'deep_sea_observatory') {
        // Giant Underwater Glass Dome ribs
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.25)';
        ctx.lineWidth = 3;
        for (let r = 220; r <= 680; r += 140) {
          ctx.beginPath();
          ctx.arc(width / 2, height + 60, r, Math.PI, Math.PI * 2);
          ctx.stroke();
        }
        // Bioluminescent jellyfish silhouettes
        for (let j = 0; j < 4; j++) {
          const jx = 220 + j * 270 + Math.sin(tick + j) * 24;
          const jy = 180 + (j % 2) * 70 + Math.cos(tick * 0.8 + j) * 18;
          ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
          ctx.beginPath();
          ctx.arc(jx, jy, 24, Math.PI, 0);
          ctx.fill();
          ctx.strokeStyle = 'rgba(45, 212, 191, 0.35)';
          ctx.lineWidth = 1.5;
          for (let t = -12; t <= 12; t += 8) {
            ctx.beginPath();
            ctx.moveTo(jx + t, jy);
            ctx.quadraticCurveTo(
              jx + t + Math.sin(tick * 2 + t) * 6,
              jy + 22,
              jx + t,
              jy + 42
            );
            ctx.stroke();
          }
        }
      } else if (preset === 'starlight_deck' || preset === 'dawn_harbor') {
        // Horizon & Water Reflection
        const waterY = 475;
        const waterGrad = ctx.createLinearGradient(0, waterY, 0, height);
        waterGrad.addColorStop(0, 'rgba(14, 42, 92, 0.85)');
        waterGrad.addColorStop(1, 'rgba(3, 9, 23, 0.98)');
        ctx.fillStyle = waterGrad;
        ctx.fillRect(0, waterY, width, height - waterY);

        // Shimmering waves on sea
        ctx.strokeStyle =
          preset === 'dawn_harbor'
            ? 'rgba(251, 191, 36, 0.35)'
            : 'rgba(125, 211, 252, 0.32)';
        ctx.lineWidth = 1.5;
        for (let wy = waterY + 12; wy < height - 40; wy += 18) {
          const waveW = 140 + ((wy - waterY) % 90);
          const wx = width * 0.62 - waveW / 2 + Math.sin(tick + wy * 0.1) * 14;
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + waveW, wy);
          ctx.stroke();
        }
      } else {
        // Cyber archive / Blue classroom grid perspective
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
        ctx.lineWidth = 1;
        for (let gx = 80; gx < width; gx += 120) {
          ctx.beginPath();
          ctx.moveTo(gx, 80);
          ctx.lineTo(gx, height - 100);
          ctx.stroke();
        }
      }

      // Weather particles
      if (scene.background.isAnimated && particles.length > 0) {
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          p.phase += 0.04;

          if (p.y > height) {
            p.y = -10;
            p.x = Math.random() * width;
          } else if (p.y < -10) {
            p.y = height + 10;
            p.x = Math.random() * width;
          }
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;

          if (scene.background.weather === 'rain') {
            ctx.strokeStyle = `rgba(147, 197, 253, ${p.alpha * 0.65})`;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.vx * 2.2, p.y + p.vy * 2.2);
            ctx.stroke();
          } else if (scene.background.weather === 'bubbles') {
            ctx.strokeStyle = `rgba(94, 234, 212, ${p.alpha * 0.7})`;
            ctx.fillStyle = `rgba(56, 189, 248, ${p.alpha * 0.18})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(p.x + Math.sin(p.phase) * 4, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            // starlight / fireflies / snow
            const glowColor =
              scene.background.weather === 'fireflies'
                ? `rgba(251, 191, 36, ${0.35 + Math.sin(p.phase) * 0.3})`
                : `rgba(186, 230, 253, ${0.4 + Math.sin(p.phase) * 0.35})`;
            ctx.fillStyle = glowColor;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      if (scene.background.isAnimated) {
        animId = requestAnimationFrame(render);
      }
    };

    render();
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [
    scene.background.presetId,
    scene.background.weather,
    scene.background.isAnimated,
    particleQuality,
  ]);

  // Handle dragging characters on the visual stage in Editor Mode
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactiveEditor || !draggingCharId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relX = Math.max(8, Math.min(92, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const relY = Math.max(20, Math.min(88, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
    onUpdateCharacterPlacement?.(draggingCharId, { x: relX, y: relY });
  };

  const handlePointerUp = () => {
    if (draggingCharId) {
      setDraggingCharId(null);
    }
  };

  const sortedCharacters = [...scene.characters].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={() => {
        if (interactiveEditor && !draggingCharId) {
          onSelectCharacter?.(null);
        }
      }}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
        background: '#040a18',
      }}
    >
      {/* Background Canvas (Pixi.js / WebGL & 2D Particle Renderer) */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: scene.background.blur > 0 ? `blur(${scene.background.blur}px)` : undefined,
        }}
      />

      {/* Custom Background Image Overlay if provided */}
      {scene.background.customUrl && (
        <img
          src={scene.background.customUrl}
          alt="scene background"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.85,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Stage Characters Layer */}
      {sortedCharacters.map((placement) => {
        const charDef = characters.find((c) => c.id === placement.characterId);
        if (!charDef) return null;
        const isSelected = interactiveEditor && selectedCharacterId === placement.characterId;

        return (
          <div
            key={placement.characterId}
            onPointerDown={(e) => {
              if (!interactiveEditor) return;
              e.stopPropagation();
              onSelectCharacter?.(placement.characterId);
              setDraggingCharId(placement.characterId);
            }}
            onClick={(e) => {
              if (interactiveEditor) e.stopPropagation();
            }}
            style={{
              position: 'absolute',
              left: `${placement.x}%`,
              top: `${placement.y}%`,
              transform: `translate(-50%, -50%) scale(${placement.flipX ? -placement.scale : placement.scale}, ${
                placement.scale
              })`,
              opacity: placement.alpha,
              zIndex: placement.zIndex + 5,
              cursor: interactiveEditor ? 'grab' : 'default',
              transition: draggingCharId === placement.characterId ? 'none' : 'left 0.25s ease, top 0.25s ease, transform 0.25s ease',
              filter: placement.speakingHighlight
                ? `drop-shadow(0 0 18px ${charDef.themeColor}66)`
                : 'brightness(0.84)',
            }}
          >
            {/* Editor Selection Gizmo Frame */}
            {isSelected && (
              <div
                style={{
                  position: 'absolute',
                  inset: '-10px',
                  border: `2px dashed ${charDef.themeColor}`,
                  borderRadius: '12px',
                  background: 'rgba(56, 189, 248, 0.08)',
                  pointerEvents: 'none',
                  transform: placement.flipX ? 'scaleX(-1)' : undefined,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '-26px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#07152e',
                    border: `1px solid ${charDef.themeColor}`,
                    color: '#e0f2fe',
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                  }}
                >
                  {charDef.name} · ({placement.x}%, {placement.y}%) · [{placement.expression}]
                </div>
              </div>
            )}

            {/* Anime Character Full-Body Standee SVG Sprite */}
            <CharacterSpriteSvg
              character={charDef}
              expression={placement.expression}
              animation={placement.animation}
            />
          </div>
        );
      })}

      {/* Editor Stage HUD Info Badge */}
      {interactiveEditor && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 12,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            background: 'rgba(5, 13, 28, 0.82)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: 6,
            padding: '4px 10px',
            color: '#bae6fd',
            fontSize: 11,
            zIndex: 30,
            pointerEvents: 'none',
          }}
        >
          <span style={{ color: '#38bdf8', fontWeight: 700 }}>Pixi.js v{pixiVersion} 舞台</span>
          <span>|</span>
          <span>场景 #{scene.globalNumber}: {scene.title}</span>
          <span>|</span>
          <span>直接拖拽立绘可调整坐标并实时同步 YAML</span>
        </div>
      )}
    </div>
  );
};

const CharacterSpriteSvg: React.FC<{
  character: CharacterDef;
  expression: CharacterExpression;
  animation: StageCharacterPlacement['animation'];
}> = ({ character, expression }) => {
  // Mouth and eyebrow shapes based on expression
  const getMouthPath = () => {
    switch (expression) {
      case 'smile':
        return 'M -8 18 Q 0 26 8 18';
      case 'shy':
        return 'M -5 20 Q 0 23 5 20';
      case 'surprised':
        return 'M -4 19 A 4 5 0 1 0 4 19 A 4 5 0 1 0 -4 19';
      case 'sad':
        return 'M -7 23 Q 0 17 7 23';
      case 'serious':
        return 'M -7 20 L 7 20';
      default:
        return 'M -6 19 Q 0 22 6 19';
    }
  };

  return (
    <svg
      width="250"
      height="420"
      viewBox="-125 -110 250 420"
      style={{ overflow: 'visible', display: 'block' }}
    >
      <defs>
        <linearGradient id={`hair_${character.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={character.hairColor} />
          <stop offset="100%" stopColor={character.themeColor} />
        </linearGradient>
        <linearGradient id={`coat_${character.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={character.outfitColor} />
          <stop offset="100%" stopColor="#040b17" />
        </linearGradient>
      </defs>

      {/* Back Hair */}
      <path
        d="M -52 -35 Q -72 80 -58 185 Q 0 205 58 185 Q 72 80 52 -35 Z"
        fill={`url(#hair_${character.id})`}
        opacity="0.9"
      />

      {/* Torso / Uniform Cape */}
      <path
        d="M -68 295 L -48 72 Q 0 54 48 72 L 68 295 Z"
        fill={`url(#coat_${character.id})`}
        stroke={character.themeColor}
        strokeWidth="2.2"
      />

      {/* Inner Collar & Ribbon / Tie */}
      <polygon points="-24,68 0,115 24,68" fill="#f1f5f9" />
      <polygon points="-9,88 0,142 9,88" fill={character.themeColor} />

      {/* Decorative Gold/Blue Lapel Trim */}
      <path
        d="M -46 78 L -28 190 M 46 78 L 28 190"
        stroke={character.themeColor}
        strokeWidth="2"
        strokeDasharray="6 4"
        opacity="0.75"
      />

      {/* Neck */}
      <rect x="-12" y="36" width="24" height="36" rx="8" fill="#fde6d8" />

      {/* Head / Face */}
      <ellipse
        cx="0"
        cy="0"
        rx="44"
        ry="48"
        fill="#fde6d8"
        stroke={character.themeColor}
        strokeWidth="1.4"
      />

      {/* Shy Blush */}
      {(expression === 'shy' || expression === 'smile') && (
        <>
          <ellipse cx="-22" cy="10" rx="9" ry="4.5" fill="#fb7185" opacity="0.45" />
          <ellipse cx="22" cy="10" rx="9" ry="4.5" fill="#fb7185" opacity="0.45" />
        </>
      )}

      {/* Eyes */}
      <g transform="translate(-18, -2)">
        <ellipse cx="0" cy="0" rx="8.5" ry="10.5" fill="#0f172a" />
        <ellipse cx="0" cy="1" rx="7" ry="8.5" fill={character.eyeColor} />
        <circle cx="-2.5" cy="-3.5" r="2.8" fill="#ffffff" />
        <circle cx="2.5" cy="3" r="1.4" fill="#e0f2fe" />
      </g>
      <g transform="translate(18, -2)">
        <ellipse cx="0" cy="0" rx="8.5" ry="10.5" fill="#0f172a" />
        <ellipse cx="0" cy="1" rx="7" ry="8.5" fill={character.eyeColor} />
        <circle cx="-2.5" cy="-3.5" r="2.8" fill="#ffffff" />
        <circle cx="2.5" cy="3" r="1.4" fill="#e0f2fe" />
      </g>

      {/* Eyebrows */}
      <path
        d={
          expression === 'sad'
            ? 'M -27 -16 L -10 -20 M 10 -20 L 27 -16'
            : expression === 'serious'
            ? 'M -27 -20 L -10 -15 M 10 -15 L 27 -20'
            : 'M -26 -18 Q -18 -22 -10 -18 M 10 -18 Q 18 -22 26 -18'
        }
        stroke="#1e293b"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />

      {/* Mouth */}
      <path
        d={getMouthPath()}
        stroke="#be123c"
        strokeWidth="2.2"
        fill={expression === 'surprised' ? '#be123c' : 'none'}
        strokeLinecap="round"
      />

      {/* Front Bangs & Side Hair */}
      <path
        d="M -48 -12 Q -45 -56 0 -58 Q 45 -56 48 -12 Q 36 -32 22 -12 Q 8 -36 0 -10 Q -12 -36 -24 -12 Q -36 -30 -48 -12 Z"
        fill={`url(#hair_${character.id})`}
        stroke={character.themeColor}
        strokeWidth="1.2"
      />

      {/* Character Accessories (Azure Watch / Train Cap Emblem) */}
      <circle
        cx="0"
        cy="92"
        r="7"
        fill="#0284c7"
        stroke="#bae6fd"
        strokeWidth="2"
      />
    </svg>
  );
};
