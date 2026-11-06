import { Migration } from '@mikro-orm/migrations';

export class Migration20261105000004_CreateInboxMessages extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE inbox_messages (
        message_id      VARCHAR(255)  NOT NULL,
        consumer_name   VARCHAR(255)  NOT NULL,
        payload_hash    VARCHAR(64)   NOT NULL,
        idempotency_key VARCHAR(500)  NOT NULL,
        received_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        processed_at    TIMESTAMPTZ   NULL,

        CONSTRAINT inbox_messages_pkey PRIMARY KEY (message_id),
        CONSTRAINT inbox_messages_idempotency_key_uidx
          UNIQUE (consumer_name, idempotency_key)
      );
    `);

    this.addSql(`
      CREATE INDEX inbox_messages_consumer_name_idx ON inbox_messages (consumer_name);
    `);

    this.addSql(`
      CREATE INDEX inbox_messages_idempotency_key_idx ON inbox_messages (idempotency_key);
    `);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS inbox_messages CASCADE;`);
  }
}
