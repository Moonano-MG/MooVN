/** 类型安全事件发射器：Events 将事件名映射到负载类型 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Emitter<Events extends Record<string, any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private map = new Map<keyof Events, Array<(p: any) => void>>();

  on<K extends keyof Events>(event: K, fn: (p: Events[K]) => void): () => void {
    const list = this.map.get(event) ?? [];
    list.push(fn);
    this.map.set(event, list);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: (p: Events[K]) => void): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = this.map.get(event) as Array<(p: any) => void> | undefined;
    if (!list) return;
    const i = list.indexOf(fn as never);
    if (i >= 0) list.splice(i, 1);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const list = this.map.get(event);
    if (!list) return;
    for (const fn of [...list]) {
      try {
        fn(payload);
      } catch (err) {
        console.error('[MooVN] listener error:', err);
      }
    }
  }
}
