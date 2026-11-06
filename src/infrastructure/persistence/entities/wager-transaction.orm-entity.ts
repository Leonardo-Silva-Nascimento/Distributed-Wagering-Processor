import {
  Entity,
  PrimaryKey,
  Property,
  Embedded,
  Enum,
  Index,
  Unique,
} from '@mikro-orm/core';
import { MoneyEmbeddable } from './money.embeddable';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
  FailureCode,
} from '../../../domain/wager-transaction/wager-transaction.kinds';

@Entity({ tableName: 'wager_transactions' })
export class WagerTransactionOrmEntity {
  @PrimaryKey({ type: 'uuid', columnType: 'uuid' })
  id!: string;

  @Property({ type: 'varchar', length: 100 })
  @Index()
  providerId!: string;

  @Property({ type: 'varchar', length: 255 })
  externalTransactionId!: string;

  @Property({ type: 'varchar', length: 500 })
  @Index()
  idempotencyKey!: string;

  @Property({ type: 'varchar', length: 64 })
  payloadHash!: string;

  @Property({ type: 'uuid', columnType: 'uuid' })
  @Index()
  walletId!: string;

  @Property({ type: 'varchar', length: 36 })
  @Index()
  playerId!: string;

  @Property({ type: 'varchar', length: 255 })
  @Index()
  roundId!: string;

  @Property({ type: 'varchar', length: 255 })
  gameId!: string;

  @Enum(() => WagerTransactionKind)
  kind!: WagerTransactionKind;

  @Embedded(() => MoneyEmbeddable, { prefix: 'money_', object: false })
  money!: MoneyEmbeddable;

  @Property({ type: 'varchar', length: 255, nullable: true })
  referenceExternalTransactionId?: string;

  @Property({ type: 'uuid', columnType: 'uuid', nullable: true })
  referenceTransactionId?: string;

  @Enum(() => WagerTransactionStatus)
  @Index()
  status!: WagerTransactionStatus;

  @Enum({ items: () => FailureCode, nullable: true })
  failureCode?: FailureCode;

  @Property({ type: 'timestamptz', nullable: true })
  processedAt?: Date;

  @Property({ type: 'integer', defaultRaw: '0' })
  retryCount!: number;

  @Property({ type: 'timestamptz', nullable: true })
  nextRetryAt?: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt!: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt!: Date;
}
