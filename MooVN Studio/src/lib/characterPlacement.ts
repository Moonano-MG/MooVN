import type { CSSProperties } from 'react';
import type { CharacterPlacement } from '../types.ts';

// Width is relative to the actual scene viewport; the media determines its own
// height from its intrinsic aspect ratio. All consumers use the same baseline.
export const CHARACTER_WIDTH_PERCENT = 22;

export function characterPlacementStyle(placement: CharacterPlacement): CSSProperties {
  return {
    left: `${placement.x}%`,
    top: `${placement.y}%`,
    width: `${CHARACTER_WIDTH_PERCENT}%`,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    transformOrigin: 'bottom center',
    transform: `translate(-50%, -100%) scale(${placement.scale})${placement.flipX ? ' scaleX(-1)' : ''}`,
    opacity: placement.opacity ?? 1,
  };
}

type StageRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
type Point = { x: number; y: number };

export function pointerPercent(clientX: number, clientY: number, rect: StageRect): Point {
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  };
}

/** Preserve where the user grabbed the portrait instead of snapping its feet to the pointer. */
export function placementGrabOffset(placement: CharacterPlacement, point: Point): Point {
  return { x: placement.x - point.x, y: placement.y - point.y };
}

export function draggedPlacement(point: Point, offset: Point): Point {
  const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
  return { x: clamp(point.x + offset.x), y: clamp(point.y + offset.y) };
}
