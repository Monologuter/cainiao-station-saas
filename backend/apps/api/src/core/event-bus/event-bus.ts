import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface DomainEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  name: string;
  payload: TPayload;
  occurredAt: Date;
  eventId: string;
}

export type EventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => Promise<void>;

@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private readonly handlers = new Map<string, EventHandler[]>();

  static createEvent<TPayload extends Record<string, unknown>>(
    name: string,
    payload: TPayload,
  ): DomainEvent<TPayload> {
    return { name, payload, occurredAt: new Date(), eventId: randomUUID() };
  }

  subscribe(name: string, handler: EventHandler): void {
    const handlers = this.handlers.get(name) ?? [];
    handlers.push(handler);
    this.handlers.set(name, handlers);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.name) ?? [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(
          `Event handler failed for ${event.name}:${event.eventId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
