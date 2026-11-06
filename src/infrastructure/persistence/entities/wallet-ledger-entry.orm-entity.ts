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
import { LedgerDirection } from '../../../domain/wager-transaction/wager-transaction.kinds';

@Entity({ tableName: 'wallet_ledger_entries' })
export class WalletLedgerEntryOrmEntity {
  @PrimaryKey({ type: 'uuid', columnType: 'uuid' })
  id!: string;

  @Property({ type: 'uuid', columnType: 'uuid' })
  @Index()
  walletId!: string;

  @Property({ type: 'uuid', columnType: 'uuid' })
  @Unique()
  transactionId!: string;

  @Enum(() => LedgerDirection)
  direction!: LedgerDirection;

  @Embedded(() => MoneyEmbeddable, { prefix: 'money_', object: false })
  money!: MoneyEmbeddable;

  @Embedded(() => MoneyEmbeddable, { prefix: 'balance_before_', object: false })
  balanceBefore!: MoneyEmbeddable;

  @Embedded(() => MoneyEmbeddable, { prefix: 'balance_after_', object: false })
  balanceAfter!: MoneyEmbeddable;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  @Index()
  createdAt!: Date;
}
