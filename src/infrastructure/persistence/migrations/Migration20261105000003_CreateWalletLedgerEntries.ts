import { Migration } from '@mikro-orm/migrations';

export class Migration20261105000003_CreateWalletLedgerEntries extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TYPE ledger_direction AS ENUM ('DEBIT', 'CREDIT');
    `);

    this.addSql(`
      CREATE TABLE wallet_ledger_entries (
        id                      UUID              NOT NULL,
        wallet_id               UUID              NOT NULL,
        transaction_id          UUID              NOT NULL,
        direction               ledger_direction  NOT NULL,
        money_amount            VARCHAR(30)       NOT NULL,
        money_currency          CHAR(3)           NOT NULL,
        balance_before_amount   VARCHAR(30)       NOT NULL,
        balance_before_currency CHAR(3)           NOT NULL,
        balance_after_amount    VARCHAR(30)       NOT NULL,
        balance_after_currency  CHAR(3)           NOT NULL,
        created_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

        CONSTRAINT wallet_ledger_entries_pkey PRIMARY KEY (id),
        CONSTRAINT wallet_ledger_entries_transaction_uidx UNIQUE (transaction_id),
        CONSTRAINT wallet_ledger_entries_wallet_fk
          FOREIGN KEY (wallet_id) REFERENCES wallets(id),
        CONSTRAINT wallet_ledger_entries_transaction_fk
          FOREIGN KEY (transaction_id) REFERENCES wager_transactions(id),
        CONSTRAINT wallet_ledger_entries_money_amount_check
          CHECK (money_amount ~ '^\\d+\\.\\d{2}$'),
        CONSTRAINT wallet_ledger_entries_balance_non_negative
          CHECK (
            CAST(balance_before_amount AS NUMERIC) >= 0
            AND CAST(balance_after_amount AS NUMERIC) >= 0
          ),
        CONSTRAINT wallet_ledger_entries_arithmetic_check
          CHECK (
            (direction = 'DEBIT'  AND CAST(balance_before_amount AS NUMERIC) - CAST(money_amount AS NUMERIC) = CAST(balance_after_amount AS NUMERIC))
            OR
            (direction = 'CREDIT' AND CAST(balance_before_amount AS NUMERIC) + CAST(money_amount AS NUMERIC) = CAST(balance_after_amount AS NUMERIC))
          )
      );
    `);

    this.addSql(`
      CREATE INDEX wallet_ledger_entries_wallet_id_idx
        ON wallet_ledger_entries (wallet_id, created_at DESC);
    `);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS wallet_ledger_entries CASCADE;`);
    this.addSql(`DROP TYPE IF EXISTS ledger_direction;`);
  }
}
