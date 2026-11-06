import { Migration } from '@mikro-orm/migrations';

export class Migration20261105000005_CreateOutboxMessages extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE outbox_messages (
        id              UUID          NOT NULL,
        aggregate_id    VARCHAR(255)  NOT NULL,
        aggregate_type  VARCHAR(100)  NOT NULL,
        event_type      VARCHAR(255)  NOT NULL,
        payload         JSONB         NOT NULL,
        occurred_at     TIMESTAMPTZ   NOT NULL,
        attempts        INTEGER       NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ   NULL,
        published_at    TIMESTAMPTZ   NULL,
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT outbox_messages_pkey PRIMARY KEY (id)
      );
    `);

    this.addSql(`
      CREATE INDEX outbox_messages_pending_idx
        ON outbox_messages (next_attempt_at)
        WHERE published_at IS NULL;
    `);

    this.addSql(`
      CREATE INDEX outbox_messages_aggregate_idx
        ON outbox_messages (aggregate_id, aggregate_type);
    `);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS outbox_messages CASCADE;`);
  }
}
