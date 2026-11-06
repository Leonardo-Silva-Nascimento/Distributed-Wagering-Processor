import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/postgresql';
import { MikroORM } from '@mikro-orm/core';
import { WagerTransactionRepository } from '../persistence/repositories/wager-transaction.repository';
import { WalletRepository } from '../persistence/repositories/wallet.repository';
import { WalletLedgerEntryRepository } from '../persistence/repositories/wallet-ledger-entry.repository';
import { InboxMessageRepository } from '../persistence/repositories/inbox-message.repository';
import { OutboxMessageRepository } from '../persistence/repositories/outbox-message.repository';
import { WageringService } from '../../application/wagering/wagering.service';
import {
  WagerTransactionStatus,
  FailureCode,
} from '../../domain/wager-transaction/wager-transaction.kinds';
import { computeNextRetryAt } from '../../shared/utils/backoff.util';
import { WagerTransaction } from '../../domain/wager-transaction/wager-transaction.entity';

const MAX_RETRIES = 10;

@Injectable()
export class PendingReferenceWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendingReferenceWorkerService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly orm: MikroORM,
    private readonly configService: ConfigService,
  ) {
    this.pollIntervalMs = this.configService.get<number>(
      'pendingReferencePollIntervalMs',
      5000,
    );
  }

  onModuleInit(): void {
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => this.runOnce(), this.pollIntervalMs);
  }

  private async runOnce(): Promise<void> {
    if (this.running) {
      this.scheduleNext();
      return;
    }
    this.running = true;

    try {
      const em = this.orm.em.fork() as EntityManager;
      const txRepo = new WagerTransactionRepository(em);
      const walletRepo = new WalletRepository(em);
      const ledgerRepo = new WalletLedgerEntryRepository(em);
      const inboxRepo = new InboxMessageRepository(em);
      const outboxRepo = new OutboxMessageRepository(em);

      const now = new Date();
      const pending = await em.transactional(() =>
        txRepo.findPendingReferences(now, 50),
      );

      for (const tx of pending) {
        await this.reprocessOne(em, tx, txRepo, walletRepo, ledgerRepo, inboxRepo, outboxRepo);
      }

      if (pending.length > 0) {
        this.logger.log(`PendingReferenceWorker processed ${pending.length} transactions`);
      }
    } catch (err) {
      this.logger.error({ err }, 'PendingReferenceWorker error');
    } finally {
      this.running = false;
      this.scheduleNext();
    }
  }

  private async reprocessOne(
    em: EntityManager,
    tx: WagerTransaction,
    txRepo: WagerTransactionRepository,
    walletRepo: WalletRepository,
    ledgerRepo: WalletLedgerEntryRepository,
    inboxRepo: InboxMessageRepository,
    outboxRepo: OutboxMessageRepository,
  ): Promise<void> {
    const service = new WageringService(em, walletRepo, txRepo, ledgerRepo, inboxRepo, outboxRepo);

    try {
      await service.process({
        idempotencyKey: tx.idempotencyKey,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        playerId: tx.playerId,
        walletId: tx.walletId,
        roundId: tx.roundId,
        gameId: tx.gameId,
        kind: tx.kind,
        amount: tx.money.amount,
        currency: tx.money.currency,
        referenceExternalTransactionId: tx.referenceExternalTransactionId,
        correlationId: tx.idempotencyKey,
      });
    } catch (err) {
      this.logger.warn(
        { transactionId: tx.id, retryCount: tx.retryCount, err },
        'PendingReference reprocess failed',
      );

      if (tx.retryCount >= MAX_RETRIES) {
        await em.transactional(async () => {
          const fresh = await txRepo.findById(tx.id);
          if (fresh && !fresh.isTerminal()) {
            fresh.reject(FailureCode.ReferenceExhausted, new Date());
            await txRepo.save(fresh);
            await em.flush();
          }
        });
      } else {
        const now = new Date();
        await em.transactional(async () => {
          const fresh = await txRepo.findById(tx.id);
          if (fresh && fresh.status === WagerTransactionStatus.PendingReference) {
            fresh.incrementRetry(computeNextRetryAt(fresh.retryCount, now), now);
            await txRepo.save(fresh);
            await em.flush();
          }
        });
      }
    }
  }
}
