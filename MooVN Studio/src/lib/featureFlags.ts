/**
 * MooVN Studio Feature Flags & Z-Index Hierarchy Tokens (`featureFlags.ts`)
 *
 * Centralizes experimental capability switches (`GPT-20`, `GPT-43`, `GPT-44`, `GPT-58`)
 * and deterministic z-index layer tokens (`GPT-49`: `dock < floating < dropdown < modal < toast`).
 */

export interface MooVNFeatureFlags {
  /** Experimental floating window detachment (default: false; single-tree docked split is default, `GPT-58`) */
  floatingWindowsExperimental: boolean;
  /** Experimental Live2D Cubism WebGL runtime (default: false until SDK + .model3.json are loaded, `GPT-16`) */
  live2dExperimental: boolean;
  /** Experimental WebAssembly engine runtime in browser mode (default: false; uses static check in Web, `GPT-07`) */
  webWasmEngineExperimental: boolean;
  /** Experimental browser-side WebGPU/WASM local LLM inference (default: false, `GPT-43`) */
  localBrowserLlmExperimental: boolean;
}

export const DEFAULT_FEATURE_FLAGS: Readonly<MooVNFeatureFlags> = Object.freeze({
  floatingWindowsExperimental: false,
  live2dExperimental: false,
  webWasmEngineExperimental: false,
  localBrowserLlmExperimental: false,
});

const FEATURE_FLAGS_STORAGE_KEY = 'moovn_feature_flags_v1';

export function getFeatureFlags(): MooVNFeatureFlags {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { ...DEFAULT_FEATURE_FLAGS };
  }
  try {
    const raw = localStorage.getItem(FEATURE_FLAGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FEATURE_FLAGS };
    const parsed = JSON.parse(raw) as Partial<MooVNFeatureFlags>;
    return {
      floatingWindowsExperimental:
        typeof parsed.floatingWindowsExperimental === 'boolean'
          ? parsed.floatingWindowsExperimental
          : DEFAULT_FEATURE_FLAGS.floatingWindowsExperimental,
      live2dExperimental:
        typeof parsed.live2dExperimental === 'boolean'
          ? parsed.live2dExperimental
          : DEFAULT_FEATURE_FLAGS.live2dExperimental,
      webWasmEngineExperimental:
        typeof parsed.webWasmEngineExperimental === 'boolean'
          ? parsed.webWasmEngineExperimental
          : DEFAULT_FEATURE_FLAGS.webWasmEngineExperimental,
      localBrowserLlmExperimental:
        typeof parsed.localBrowserLlmExperimental === 'boolean'
          ? parsed.localBrowserLlmExperimental
          : DEFAULT_FEATURE_FLAGS.localBrowserLlmExperimental,
    };
  } catch {
    return { ...DEFAULT_FEATURE_FLAGS };
  }
}

export function setFeatureFlag<K extends keyof MooVNFeatureFlags>(
  key: K,
  value: MooVNFeatureFlags[K]
): MooVNFeatureFlags {
  const next = {
    ...getFeatureFlags(),
    [key]: value,
  };
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }
  return next;
}

/**
 * Deterministic Z-Index Hierarchy (`GPT-49 / CL-49`):
 * `dock (10) < floating (100..299) < dropdown (400) < modal (600) < toast (800)`
 */
export const Z_INDEX_TOKENS = Object.freeze({
  dock: 10,
  floatingBase: 100,
  floatingMax: 299,
  dropdown: 400,
  modal: 600,
  toast: 800,
});
