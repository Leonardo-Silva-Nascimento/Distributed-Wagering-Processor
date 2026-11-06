import { Entity, PrimaryKey, Property, Index } from '@mikro-orm/core';

@Entity({ tableName: 'outbox_messages' })
export class OutboxMessageOrmEntity {
  @PrimaryKey({ type: 'uuid', columnType: 'uuid' })
  id!: string;

  @Property({ type: 'varchar', length: 255 })
  @Index()
  aggregateId!: string;

  @Property({ type: 'varchar', length: 100 })
  aggregateType!: string;

  @Property({ type: 'varchar', length: 255 })
  @Index()
  eventType!: string;

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  @Property({ type: 'timestamptz' })
  occurredAt!: Date;

  @Property({ type: 'integer', defaultRaw: '0' })
  attempts!: number;

  @Property({ type: 'timestamptz', nullable: true })
  @Index()
  nextAttemptAt?: Date;

  @Property({ type: 'timestamptz', nullable: true })
  publishedAt?: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt!: Date;
}
