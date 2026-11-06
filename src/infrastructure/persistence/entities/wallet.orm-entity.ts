import {
  Entity,
  PrimaryKey,
  Property,
  Embedded,
  Index,
  Unique,
} from '@mikro-orm/core';
import { MoneyEmbeddable } from './money.embeddable';

@Entity({ tableName: 'wallets' })
export class WalletOrmEntity {
  @PrimaryKey({ type: 'uuid', columnType: 'uuid' })
  id!: string;

  @Property({ type: 'varchar', length: 36, columnType: 'varchar(36)' })
  @Index()
  playerId!: string;

  @Property({ type: 'varchar', length: 3, columnType: 'char(3)' })
  currency!: string;

  @Embedded(() => MoneyEmbeddable, { prefix: 'balance_', object: false })
  balance!: MoneyEmbeddable;

  @Property({ type: 'integer', defaultRaw: '1' })
  version!: number;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  createdAt!: Date;

  @Property({ type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt!: Date;
}

// Composite unique index defined in migration (player_id + currency)
