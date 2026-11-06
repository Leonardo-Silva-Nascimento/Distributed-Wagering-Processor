import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OutboxMessage } from '../../../domain/messaging/outbox-message.entity';
import { OutboxMessageOrmEntity } from '../entities/outbox-message.orm-entity';

@Injectable()
export class OutboxMessageRepository {
  constructor(private readonly em: EntityManager) {}

  async save(message: OutboxMessage): Promise<void> {
    const existing = await this.em.findOne(OutboxMessageOrmEntity, { id: message.id });

    if (existing) {
      existing.attempts = message.attempts;
      existing.nextAttemptAt = message.nextAttemptAt;
      existing.publishedAt = message.publishedAt;
      this.em.persist(existing);
    } else {
      const entity = this.em.create(OutboxMessageOrmEntity, {
        id: message.id,
        aggregateId: message.aggregateId,
        aggregateType: message.aggregateType,
        eventType: message.eventType,
        payload: message.payload as Record<string, unknown>,
        occurredAt: message.occurredAt,
        attempts: message.attempts,
        nextAttemptAt: message.nextAttemptAt,
        publishedAt: message.publishedAt,
        createdAt: message.createdAt,
      });
      this.em.persist(entity);
    }
  }

  /**
   * Fetches pending outbox messages due for publishing using FOR UPDATE SKIP LOCKED.
   * Uses raw knex to bypass MikroORM's identity map so multiple pods don't deadlock.
   */
  async findDuePending(now: Date, limit = 100): Promise<OutboxMessage[]> {
    const knex = this.em.getKnex();
    const rows = await knex('outbox_messages')
      .whereNull('published_at')
      .where(function () {
        this.whereNull('next_attempt_at').orWhere('next_attempt_at', '<=', now);
      })
      .orderBy('created_at', 'asc')
      .limit(limit)
      .forUpdate()
      .skipLocked();

    return rows.map((row: Record<string, unknown>) => this.rowToDomain(row));
  }

  async markPublished(id: string, at: Date): Promise<void> {
    const knex = this.em.getKnex();
    await knex('outbox_messages').where('id', id).update({ published_at: at });
  }

  async scheduleRetry(id: string, attempts: number, nextAttemptAt: Date): Promise<void> {
    const knex = this.em.getKnex();
    await knex('outbox_messages')
      .where('id', id)
      .update({ attempts, next_attempt_at: nextAttemptAt });
  }

  private rowToDomain(row: Record<string, unknown>): OutboxMessage {
    return OutboxMessage.rehydrate({
      id: row['id'] as string,
      aggregateId: row['aggregate_id'] as string,
      aggregateType: row['aggregate_type'] as string,
      eventType: row['event_type'] as string,
      payload: row['payload'] as Record<string, unknown>,
      occurredAt: row['occurred_at'] as Date,
      attempts: row['attempts'] as number,
      nextAttemptAt: row['next_attempt_at'] as Date | undefined,
      publishedAt: row['published_at'] as Date | undefined,
      createdAt: row['created_at'] as Date,
    });
  }
}
