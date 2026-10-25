/**
 * MooVN Window & Dock Layout Manager (`windowManager.ts`)
 *
 * Implements:
 * - Viewport boundary clamping for floating windows on drag, resize, and window resize (`GPT-19`, `GPT-24`, `Kimi 1L`)
 * - Bounded z-index normalization (`40 .. 40 + N - 1`) (`Kimi 3E`)
 * - Minimum pane size & center-canvas reservation for 3-column split sashes (`GPT-25`)
 * - Layout state persistence (`localStorage`) & one-click reset (`GPT-30`, `GPT-39`)
 */

export interface ViewportSize {
  width: number;
  height: number;
}

export interface FloatingWindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManagedFloatingWindow extends FloatingWindowRect {
  id: string;
  title?: string;
  zIndex: number;
}

export interface PersistedLayoutState {
  version: 2;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  leftWidth: number;
  rightWidth: number;
  bottomOpen: boolean;
  bottomHeight: number;
  centerViewMode: 'canvas' | 'stage' | 'script' | 'ui';
  rightTab: 'inspector' | 'ai' | 'assets';
  floatingWindows: ManagedFloatingWindow[];
}

import { Z_INDEX_TOKENS } from './featureFlags.ts';

export const LAYOUT_STORAGE_KEY = 'moovn_layout_state_v2';
export const BASE_FLOATING_Z_INDEX = Z_INDEX_TOKENS.floatingBase;
export const MAX_FLOATING_Z_INDEX = Z_INDEX_TOKENS.floatingMax;

export type ResponsiveLayoutBreakpoint = 'three-column' | 'two-column' | 'single-column';

/**
 * Resolves the responsive workspace layout mode (`GPT-26 / CL-26`, Section 8):
 * - `>= 1100px`: `'three-column'` (Left Outline | Center Canvas/Stage/Script | Right Inspector)
 * - `768px .. 1099px`: `'two-column'` (Left Outline auto-collapses into drawer; Center + Right visible)
 * - `< 768px`: `'single-column'` (Single active pane + bottom tab bar)
 */
export function getResponsiveLayoutMode(viewportWidth: number): ResponsiveLayoutBreakpoint {
  const vw = Number.isFinite(viewportWidth) ? viewportWidth : 1280;
  if (vw >= 1100) return 'three-column';
  if (vw >= 768) return 'two-column';
  return 'single-column';
}

/**
 * Clamps a floating window rectangle so its title bar and borders remain strictly
 * inside the visible viewport (`x >= 8`, `y >= 44`, `right <= viewport.width - 8`, `bottom <= viewport.height - 32`).
 */
export function clampFloatingRect(
  rect: FloatingWindowRect,
  viewport: ViewportSize,
  minW = 280,
  minH = 200
): FloatingWindowRect {
  const vw = Math.max(360, Number.isFinite(viewport.width) ? viewport.width : 1280);
  const vh = Math.max(320, Number.isFinite(viewport.height) ? viewport.height : 800);

  const maxW = Math.max(minW, vw - 16);
  const maxH = Math.max(minH, vh - 76);

  const width = Math.round(
    Math.min(maxW, Math.max(minW, Number.isFinite(rect.width) ? rect.width : 520))
  );
  const height = Math.round(
    Math.min(maxH, Math.max(minH, Number.isFinite(rect.height) ? rect.height : 420))
  );

  const maxX = Math.max(8, vw - width - 8);
  const maxY = Math.max(44, vh - height - 32);

  const x = Math.round(
    Math.min(maxX, Math.max(8, Number.isFinite(rect.x) ? rect.x : 120))
  );
  const y = Math.round(
    Math.min(maxY, Math.max(44, Number.isFinite(rect.y) ? rect.y : 72))
  );

  return { x, y, width, height };
}

/**
 * Clamps all floating windows to fit within the given viewport.
 */
export function clampAllFloatingWindows<T extends ManagedFloatingWindow>(
  windows: T[],
  viewport: ViewportSize
): T[] {
  return windows.map((w) => {
    const clamped = clampFloatingRect(w, viewport);
    return {
      ...w,
      ...clamped,
    };
  });
}

/**
 * Normalizes floating window `zIndex` values into a dense range
 * `[BASE_FLOATING_Z_INDEX .. BASE_FLOATING_Z_INDEX + windows.length - 1]`.
 * If `activeId` is provided, that window is promoted to the highest `zIndex`.
 */
export function normalizeWindowZIndices<T extends ManagedFloatingWindow>(
  windows: T[],
  activeId?: string
): T[] {
  if (windows.length === 0) return [];
  const sorted = [...windows].sort((a, b) => {
    if (activeId) {
      if (a.id === activeId && b.id !== activeId) return 1;
      if (b.id === activeId && a.id !== activeId) return -1;
    }
    return a.zIndex - b.zIndex;
  });

  const zMap = new Map<string, number>();
  sorted.forEach((w, idx) => {
    zMap.set(w.id, Math.min(MAX_FLOATING_Z_INDEX, BASE_FLOATING_Z_INDEX + idx));
  });

  return windows.map((w) => ({
    ...w,
    zIndex: zMap.get(w.id) ?? BASE_FLOATING_Z_INDEX,
  }));
}

/**
 * Clamps the docked 3-column and bottom-drawer sizes so the center workspace
 * always retains at least 320px of horizontal space.
 */
export function clampSplitWidths(
  leftWidth: number,
  rightWidth: number,
  bottomHeight: number,
  viewport: ViewportSize,
  leftCollapsed = false,
  rightCollapsed = false
): { leftWidth: number; rightWidth: number; bottomHeight: number } {
  const vw = Math.max(640, Number.isFinite(viewport.width) ? viewport.width : 1280);
  const vh = Math.max(480, Number.isFinite(viewport.height) ? viewport.height : 800);

  let lw = Math.min(420, Math.max(200, Math.round(leftWidth || 248)));
  let rw = Math.min(520, Math.max(260, Math.round(rightWidth || 356)));
  const bh = Math.min(
    Math.max(140, Math.floor(vh * 0.45)),
    Math.max(140, Math.round(bottomHeight || 220))
  );

  const minCenterWidth = 320;
  const activeLeft = leftCollapsed ? 0 : lw;
  const activeRight = rightCollapsed ? 0 : rw;
  const availableForSides = Math.max(200, vw - minCenterWidth);

  if (activeLeft + activeRight > availableForSides && activeLeft + activeRight > 0) {
    const ratio = availableForSides / (activeLeft + activeRight);
    if (!leftCollapsed) {
      lw = Math.max(180, Math.floor(lw * ratio));
    }
    if (!rightCollapsed) {
      rw = Math.max(220, Math.floor(rw * ratio));
    }
  }

  return { leftWidth: lw, rightWidth: rw, bottomHeight: bh };
}

export function saveLayoutStateToStorage(state: PersistedLayoutState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues for layout preferences
  }
}

export function loadLayoutStateFromStorage(
  viewport: ViewportSize
): PersistedLayoutState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedLayoutState>;
    if (!parsed || parsed.version !== 2) return null;

    const splits = clampSplitWidths(
      parsed.leftWidth ?? 248,
      parsed.rightWidth ?? 356,
      parsed.bottomHeight ?? 220,
      viewport,
      Boolean(parsed.leftCollapsed),
      Boolean(parsed.rightCollapsed)
    );

    const rawFloating = Array.isArray(parsed.floatingWindows)
      ? parsed.floatingWindows
      : [];
    const clampedFloating = normalizeWindowZIndices(
      clampAllFloatingWindows(rawFloating, viewport)
    );

    return {
      version: 2,
      leftCollapsed: Boolean(parsed.leftCollapsed),
      rightCollapsed: Boolean(parsed.rightCollapsed),
      leftWidth: splits.leftWidth,
      rightWidth: splits.rightWidth,
      bottomOpen: Boolean(parsed.bottomOpen),
      bottomHeight: splits.bottomHeight,
      centerViewMode:
        parsed.centerViewMode === 'stage' ||
        parsed.centerViewMode === 'script' ||
        parsed.centerViewMode === 'ui'
          ? parsed.centerViewMode
          : 'canvas',
      rightTab:
        parsed.rightTab === 'ai' || parsed.rightTab === 'assets'
          ? parsed.rightTab
          : 'inspector',
      floatingWindows: clampedFloating,
    };
  } catch {
    return null;
  }
}

export function clearLayoutStateStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
