/** Generate an opaque, collision-resistant identifier without relying on wall-clock time. */
export function newId(prefix: string): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('ERR_SECURE_RANDOM_UNAVAILABLE: crypto.randomUUID is required');
  }
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
