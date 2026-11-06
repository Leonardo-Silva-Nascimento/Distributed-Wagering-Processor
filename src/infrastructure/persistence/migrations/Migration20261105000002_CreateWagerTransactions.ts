import { Migration } from '@mikro-orm/migrations';

export class Migration20261105000002_CreateWagerTransactions extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TYPE wager_transaction_kind AS ENUM (
        'OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'
      );
    `);

    this.addSql(`
      CREATE TYPE wager_transaction_status AS ENUM (
        'PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'
      );
    `);

    this.addSql(`
      CREATE TYPE wager_failure_code AS ENUM (
        'INSUFFICIENT_FUNDS',
        'REFERENCE_NOT_FOUND',
        'REFERENCE_ALREADY_REVERSED',
        'REFERENCE_NOT_PROCESSED',
        'INVALID_REFERENCE_KIND',
        'CROSS_WALLET_REFERENCE',
        'CROSS_PROVIDER_REFERENCE',
        'CROSS_ROUND_REFERENCE',
        'CURRENCY_MISMATCH',
        'AMOUNT_MISMATCH',
        'DUPLICATE_PAYLOAD',
        'INTERNAL_ID_CONFLICT',
        'REFERENCE_EXHAUSTED',
        'NEGATIVE_BALANCE_ON_REVERSAL',
        'WALLET_NOT_FOUND'
      );
    `);

    this.addSql(`
      CREATE TABLE wager_transactions (
        id                              UUID                        NOT NULL,
        provider_id                     VARCHAR(100)                NOT NULL,
        external_transaction_id         VARCHAR(255)                NOT NULL,
        idempotency_key                 VARCHAR(500)                NOT NULL,
        payload_hash                    VARCHAR(64)                 NOT NULL,
        wallet_id                       UUID                        NOT NULL,
        player_id                       VARCHAR(255)                NOT NULL,
        round_id                        VARCHAR(255)                NOT NULL,
        game_id                         VARCHAR(255)                NOT NULL,
        kind                            wager_transaction_kind      NOT NULL,
        money_amount                    VARCHAR(30)                 NOT NULL,
        money_currency                  CHAR(3)                     NOT NULL,
        reference_external_transaction_id VARCHAR(255)              NULL,
        reference_transaction_id        UUID                        NULL,
        status                          wager_transaction_status    NOT NULL DEFAULT 'PENDING',
        failure_code                    wager_failure_code          NULL,
        processed_at                    TIMESTAMPTZ                 NULL,
        retry_count                     INTEGER                     NOT NULL DEFAULT 0,
        next_retry_at                   TIMESTAMPTZ                 NULL,
        created_at                      TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
        updated_at                      TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),

        CONSTRAINT wager_transactions_pkey PRIMARY KEY (id),
        CONSTRAINT wager_transactions_money_amount_check
          CHECK (money_amount ~ '^\\d+\\.\\d{2}$'),
        CONSTRAINT wager_transactions_reference_check
          CHECK (
            kind NOT IN ('REFUND', 'ROLLBACK')
            OR reference_external_transaction_id IS NOT NULL
          ),
        CONSTRAINT wager_transactions_wallet_fk
          FOREIGN KEY (wallet_id) REFERENCES wallets(id)
      );
    `);

    this.addSql(`
      CREATE UNIQUE INDEX wager_transactions_provider_ext_uidx
        ON wager_transactions (provider_id, external_transaction_id);
    `);

    this.addSql(`
      CREATE UNIQUE INDEX wager_transactions_idempotency_key_uidx
        ON wager_transactions (idempotency_key);
    `);

    this.addSql(`
      CREATE INDEX wager_transactions_wallet_id_idx
        ON wager_transactions (wallet_id);
    `);

    this.addSql(`
      CREATE INDEX wager_transactions_player_id_idx
        ON wager_transactions (player_id);
    `);

    this.addSql(`
      CREATE INDEX wager_transactions_status_idx
        ON wager_transactions (status)
        WHERE status IN ('PENDING', 'PENDING_REFERENCE');
    `);

    this.addSql(`
      CREATE INDEX wager_transactions_pending_ref_next_retry_idx
        ON wager_transactions (next_retry_at)
        WHERE status = 'PENDING_REFERENCE';
    `);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS wager_transactions CASCADE;`);
    this.addSql(`DROP TYPE IF EXISTS wager_transaction_kind;`);
    this.addSql(`DROP TYPE IF EXISTS wager_transaction_status;`);
    this.addSql(`DROP TYPE IF EXISTS wager_failure_code;`);
  }
}
