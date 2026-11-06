import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';

export async function runMigrations(orm: MikroORM): Promise<void> {
  const migrator = orm.getMigrator();
  await migrator.up();
}

export async function truncateAllTables(orm: MikroORM): Promise<void> {
  const em = orm.em as EntityManager;
  const knex = em.getKnex();
  await knex.raw(`
    TRUNCATE TABLE
      outbox_messages,
      inbox_messages,
      wallet_ledger_entries,
      wager_transactions,
      wallets
    RESTART IDENTITY CASCADE;
  `);
}
