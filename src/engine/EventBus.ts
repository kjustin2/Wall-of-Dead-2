type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>();

  on<T>(name: string, handler: Handler<T>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(name, handler);
  }

  off<T>(name: string, handler: Handler<T>): void {
    this.handlers.get(name)?.delete(handler as Handler<unknown>);
  }

  emit<T>(name: string, payload: T): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const handler of [...set]) handler(payload);
  }

  clear(): void {
    this.handlers.clear();
  }

  listenerCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [name, set] of this.handlers.entries()) out[name] = set.size;
    return out;
  }
}

export const events = new EventBus();
