import { Migration } from '@mikro-orm/migrations';

export class Migration20261105000001_CreateWallets extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE wallets (
        id              UUID          NOT NULL,
        player_id       VARCHAR(255)  NOT NULL,
        currency        CHAR(3)       NOT NULL,
        balance_amount  VARCHAR(30)   NOT NULL DEFAULT '0.00',
        balance_currency CHAR(3)      NOT NULL,
        version         INTEGER       NOT NULL DEFAULT 1,
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT wallets_pkey PRIMARY KEY (id),
        CONSTRAINT wallets_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
        CONSTRAINT wallets_balance_amount_check CHECK (balance_amount ~ '^\\d+\\.\\d{2}$'),
        CONSTRAINT wallets_balance_non_negative CHECK (CAST(balance_amount AS NUMERIC) >= 0),
        CONSTRAINT wallets_currency_match CHECK (currency = balance_currency)
      );
    `);

    this.addSql(`
      CREATE UNIQUE INDEX wallets_player_currency_uidx
        ON wallets (player_id, currency);
    `);

    this.addSql(`
      CREATE INDEX wallets_player_id_idx ON wallets (player_id);
    `);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS wallets CASCADE;`);
  }
}
