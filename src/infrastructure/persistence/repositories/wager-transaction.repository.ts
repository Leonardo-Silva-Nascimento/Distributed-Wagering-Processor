import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { WagerTransaction } from '../../../domain/wager-transaction/wager-transaction.entity';
import { WagerTransactionOrmEntity } from '../entities/wager-transaction.orm-entity';
import {
  WagerTransactionStatus,
  FailureCode,
  WagerTransactionKind,
} from '../../../domain/wager-transaction/wager-transaction.kinds';

@Injectable()
export class WagerTransactionRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionOrmEntity, { id });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionOrmEntity, { idempotencyKey });
    return entity ? this.toDomain(entity) : null;
  }

  async findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionOrmEntity, {
      providerId,
      externalTransactionId,
    });
    return entity ? this.toDomain(entity) : null;
  }

  async findPendingReferences(now: Date, limit = 50): Promise<WagerTransaction[]> {
    const knex = this.em.getKnex();
    const rows = await knex('wager_transactions')
      .where('status', WagerTransactionStatus.PendingReference)
      .where('next_retry_at', '<=', now)
      .orderBy('next_retry_at', 'asc')
      .limit(limit)
      .forUpdate()
      .skipLocked();

    return rows.map((row: Record<string, unknown>) => this.rowToDomain(row));
  }

  async existsReversalFor(
    walletId: string,
    providerId: string,
    referenceTransactionId: string,
    kind: WagerTransactionKind,
  ): Promise<boolean> {
    const count = await this.em.count(WagerTransactionOrmEntity, {
      walletId,
      providerId,
      referenceTransactionId,
      kind,
      status: WagerTransactionStatus.Processed,
    });
    return count > 0;
  }

  async save(transaction: WagerTransaction): Promise<void> {
    const existing = await this.em.findOne(WagerTransactionOrmEntity, { id: transaction.id });

    if (existing) {
      existing.status = transaction.status;
      existing.referenceTransactionId = transaction.referenceTransactionId;
      existing.failureCode = transaction.failureCode as FailureCode | undefined;
      existing.processedAt = transaction.processedAt;
      existing.retryCount = transaction.retryCount;
      existing.nextRetryAt = transaction.nextRetryAt;
      existing.updatedAt = transaction.updatedAt ?? new Date();
      this.em.persist(existing);
    } else {
      const entity = this.em.create(WagerTransactionOrmEntity, {
        id: transaction.id,
        providerId: transaction.providerId,
        externalTransactionId: transaction.externalTransactionId,
        idempotencyKey: transaction.idempotencyKey,
        payloadHash: transaction.payloadHash,
        walletId: transaction.walletId,
        playerId: transaction.playerId,
        roundId: transaction.roundId,
        gameId: transaction.gameId,
        kind: transaction.kind,
        money: {
          amount: transaction.money.amount,
          currency: transaction.money.currency,
        },
        referenceExternalTransactionId: transaction.referenceExternalTransactionId,
        referenceTransactionId: transaction.referenceTransactionId,
        status: transaction.status,
        failureCode: transaction.failureCode as FailureCode | undefined,
        processedAt: transaction.processedAt,
        retryCount: transaction.retryCount,
        nextRetryAt: transaction.nextRetryAt,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt ?? transaction.createdAt,
      });
      this.em.persist(entity);
    }
  }

  private toDomain(entity: WagerTransactionOrmEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind,
      moneyAmount: entity.money.amount,
      moneyCurrency: entity.money.currency,
      referenceExternalTransactionId: entity.referenceExternalTransactionId,
      referenceTransactionId: entity.referenceTransactionId,
      status: entity.status,
      failureCode: entity.failureCode,
      processedAt: entity.processedAt,
      retryCount: entity.retryCount,
      nextRetryAt: entity.nextRetryAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  private rowToDomain(row: Record<string, unknown>): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: row['id'] as string,
      providerId: row['provider_id'] as string,
      externalTransactionId: row['external_transaction_id'] as string,
      idempotencyKey: row['idempotency_key'] as string,
      payloadHash: row['payload_hash'] as string,
      walletId: row['wallet_id'] as string,
      playerId: row['player_id'] as string,
      roundId: row['round_id'] as string,
      gameId: row['game_id'] as string,
      kind: row['kind'] as WagerTransactionKind,
      moneyAmount: row['money_amount'] as string,
      moneyCurrency: row['money_currency'] as string,
      referenceExternalTransactionId: row['reference_external_transaction_id'] as string | undefined,
      referenceTransactionId: row['reference_transaction_id'] as string | undefined,
      status: row['status'] as WagerTransactionStatus,
      failureCode: row['failure_code'] as FailureCode | undefined,
      processedAt: row['processed_at'] as Date | undefined,
      retryCount: row['retry_count'] as number,
      nextRetryAt: row['next_retry_at'] as Date | undefined,
      createdAt: row['created_at'] as Date,
      updatedAt: row['updated_at'] as Date,
    });
  }
}
