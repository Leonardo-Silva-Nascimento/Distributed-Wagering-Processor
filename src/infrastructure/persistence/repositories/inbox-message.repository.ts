import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { InboxMessage } from '../../../domain/messaging/inbox-message.entity';
import { InboxMessageOrmEntity } from '../entities/inbox-message.orm-entity';

@Injectable()
export class InboxMessageRepository {
  constructor(private readonly em: EntityManager) {}

  async findByMessageId(messageId: string): Promise<InboxMessage | null> {
    const entity = await this.em.findOne(InboxMessageOrmEntity, { messageId });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdempotencyKey(
    consumerName: string,
    idempotencyKey: string,
  ): Promise<InboxMessage | null> {
    const entity = await this.em.findOne(InboxMessageOrmEntity, {
      consumerName,
      idempotencyKey,
    });
    return entity ? this.toDomain(entity) : null;
  }

  /**
   * Attempts to insert an inbox message.
   * Returns true if inserted (new), false if already existed (duplicate).
   * Uses INSERT ... ON CONFLICT DO NOTHING for atomic deduplication.
   */
  async insertIfNotExists(message: InboxMessage): Promise<boolean> {
    const knex = this.em.getKnex();
    const result = await knex('inbox_messages')
      .insert({
        message_id: message.messageId,
        consumer_name: message.consumerName,
        payload_hash: message.payloadHash,
        idempotency_key: message.idempotencyKey,
        received_at: message.receivedAt,
        processed_at: message.processedAt ?? null,
      })
      .onConflict('message_id')
      .ignore()
      .returning('message_id');

    return result.length > 0;
  }

  /**
   * Attempts to insert by idempotency key (consumer_name + idempotency_key).
   * Returns true if inserted (new), false if key already exists.
   */
  async insertByIdempotencyKeyIfNotExists(message: InboxMessage): Promise<boolean> {
    const knex = this.em.getKnex();
    const result = await knex('inbox_messages')
      .insert({
        message_id: message.messageId,
        consumer_name: message.consumerName,
        payload_hash: message.payloadHash,
        idempotency_key: message.idempotencyKey,
        received_at: message.receivedAt,
        processed_at: message.processedAt ?? null,
      })
      .onConflict(['consumer_name', 'idempotency_key'])
      .ignore()
      .returning('message_id');

    return result.length > 0;
  }

  async markProcessed(messageId: string, at: Date): Promise<void> {
    const knex = this.em.getKnex();
    await knex('inbox_messages').where('message_id', messageId).update({ processed_at: at });
  }

  private toDomain(entity: InboxMessageOrmEntity): InboxMessage {
    return InboxMessage.rehydrate({
      messageId: entity.messageId,
      consumerName: entity.consumerName,
      payloadHash: entity.payloadHash,
      idempotencyKey: entity.idempotencyKey,
      receivedAt: entity.receivedAt,
      processedAt: entity.processedAt,
    });
  }
}
