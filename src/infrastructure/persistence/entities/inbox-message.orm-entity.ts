import { Entity, PrimaryKey, Property, Index, Unique } from '@mikro-orm/core';

@Entity({ tableName: 'inbox_messages' })
export class InboxMessageOrmEntity {
  @PrimaryKey({ type: 'varchar', length: 255 })
  messageId!: string;

  @Property({ type: 'varchar', length: 255 })
  @Index()
  consumerName!: string;

  @Property({ type: 'varchar', length: 64 })
  payloadHash!: string;

  @Property({ type: 'varchar', length: 500 })
  @Index()
  idempotencyKey!: string;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  receivedAt!: Date;

  @Property({ type: 'timestamptz', nullable: true })
  processedAt?: Date;
}
