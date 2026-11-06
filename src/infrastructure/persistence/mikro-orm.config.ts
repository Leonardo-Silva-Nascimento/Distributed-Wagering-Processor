import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { join } from 'path';
import { WalletOrmEntity } from './entities/wallet.orm-entity';
import { WagerTransactionOrmEntity } from './entities/wager-transaction.orm-entity';
import { WalletLedgerEntryOrmEntity } from './entities/wallet-ledger-entry.orm-entity';
import { InboxMessageOrmEntity } from './entities/inbox-message.orm-entity';
import { OutboxMessageOrmEntity } from './entities/outbox-message.orm-entity';
import { MoneyEmbeddable } from './entities/money.embeddable';

export default defineConfig({
  host: process.env['DB_HOST'] ?? 'localhost',
  port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
  dbName: process.env['DB_NAME'] ?? 'wagering',
  user: process.env['DB_USER'] ?? 'wagering',
  password: process.env['DB_PASSWORD'] ?? 'wagering',
  entities: [
    WalletOrmEntity,
    WagerTransactionOrmEntity,
    WalletLedgerEntryOrmEntity,
    InboxMessageOrmEntity,
    OutboxMessageOrmEntity,
    MoneyEmbeddable,
  ],
  migrations: {
    path: join(__dirname, 'migrations'),
    glob: '!(*.d).{js,ts}',
    transactional: true,
    allOrNothing: true,
    snapshot: false,
  },
  extensions: [Migrator],
  debug: process.env['NODE_ENV'] === 'development',
  /**
   * Use dynamic import() instead of require() for migration files.
   * This is needed in CommonJS packages that use ESM-like TypeScript syntax
   * when running under ts-node/vitest.
   */
  dynamicImportProvider: (id: string) => import(id),
  driverOptions: {
    connection: {
      ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : undefined,
    },
  },
});
