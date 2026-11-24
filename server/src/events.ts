import type { ServerEvent } from "@ai-office/shared";

export class EventBus {
  private subs = new Set<(e: ServerEvent) => void>();
  publish(e: ServerEvent): void {
    for (const fn of [...this.subs]) fn(e);
  }
  subscribe(fn: (e: ServerEvent) => void): () => void {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }
  subscriberCount(): number {
    return this.subs.size;
  }
}
