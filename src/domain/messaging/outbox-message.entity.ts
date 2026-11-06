export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
  createdAt: Date;
}

export class OutboxMessage {
  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly aggregateType: string,
    public readonly eventType: string,
    public readonly payload: Readonly<Record<string, unknown>>,
    public readonly occurredAt: Date,
    private _attempts: number,
    private _nextAttemptAt?: Date,
    private _publishedAt?: Date,
    public readonly createdAt: Date = new Date(),
  ) {}

  static enqueue(props: {
    id: string;
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    payload: Record<string, unknown>;
    occurredAt: Date;
  }): OutboxMessage {
    const now = new Date();
    return new OutboxMessage(
      props.id,
      props.aggregateId,
      props.aggregateType,
      props.eventType,
      props.payload,
      props.occurredAt,
      0,
      now,
      undefined,
      now,
    );
  }

  static rehydrate(state: OutboxMessageState): OutboxMessage {
    return new OutboxMessage(
      state.id,
      state.aggregateId,
      state.aggregateType,
      state.eventType,
      state.payload,
      state.occurredAt,
      state.attempts,
      state.nextAttemptAt,
      state.publishedAt,
      state.createdAt,
    );
  }

  get attempts(): number {
    return this._attempts;
  }

  get nextAttemptAt(): Date | undefined {
    return this._nextAttemptAt;
  }

  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  isPending(): boolean {
    return this._publishedAt === undefined;
  }

  isDue(now: Date): boolean {
    if (!this.isPending()) return false;
    if (!this._nextAttemptAt) return true;
    return now >= this._nextAttemptAt;
  }

  markPublished(at: Date): void {
    this._publishedAt = at;
  }

  scheduleRetry(now: Date): void {
    const baseMs = 2000;
    const maxMs = 300_000;
    const jitter = Math.floor(Math.random() * 1000);
    const delay = Math.min(baseMs * Math.pow(2, this._attempts) + jitter, maxMs);
    this._attempts += 1;
    this._nextAttemptAt = new Date(now.getTime() + delay);
  }
}
