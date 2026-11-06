import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import {
  ProcessWagerTransactionCommand,
  ProcessWagerTransactionResult,
} from './commands/process-wager-transaction.command';
import { WagerTransactionRepository } from '../../infrastructure/persistence/repositories/wager-transaction.repository';
import { WalletRepository } from '../../infrastructure/persistence/repositories/wallet.repository';
import { WalletLedgerEntryRepository } from '../../infrastructure/persistence/repositories/wallet-ledger-entry.repository';
import { InboxMessageRepository } from '../../infrastructure/persistence/repositories/inbox-message.repository';
import { OutboxMessageRepository } from '../../infrastructure/persistence/repositories/outbox-message.repository';
import { Money } from '../../domain/value-objects/money.vo';
import { Wallet } from '../../domain/wallet/wallet.aggregate';
import { WagerTransaction } from '../../domain/wager-transaction/wager-transaction.entity';
import { WalletLedgerEntry } from '../../domain/wallet-ledger-entry/wallet-ledger-entry.entity';
import { OutboxMessage } from '../../domain/messaging/outbox-message.entity';
import { InboxMessage } from '../../domain/messaging/inbox-message.entity';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
  LedgerDirection,
  FailureCode,
} from '../../domain/wager-transaction/wager-transaction.kinds';
import { computePayloadHash } from '../../shared/utils/payload-hash.util';
import { computeNextRetryAt } from '../../shared/utils/backoff.util';
import {
  InsufficientFundsError,
  WalletCurrencyMismatchError,
} from '../../domain/wallet/wallet.errors';
import {
  IdempotencyConflictException,
  WalletNotFoundException,
  ReferenceNotFoundException,
  ReferenceAlreadyReversedException,
  InvalidReferenceKindException,
  AmountMismatchException,
  NegativeBalanceOnReversalException,
  InsufficientFundsException,
  CurrencyMismatchException,
} from '../../shared/exceptions/domain.exception';
import {
  WagerTransactionProcessed,
  WagerTransactionRejected,
  WagerTransactionPendingReference,
} from '../../domain/events/wager-transaction-events';
import { WalletBalanceChanged } from '../../domain/events/wallet-events';
import { InsufficientFundsError as DomainInsufficientFundsError } from '../../domain/wallet/wallet.errors';

const MAX_PENDING_REFERENCE_RETRIES = 10;

@Injectable()
export class WageringService {
  private readonly logger = new Logger(WageringService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly walletRepo: WalletRepository,
    private readonly txRepo: WagerTransactionRepository,
    private readonly ledgerRepo: WalletLedgerEntryRepository,
    private readonly inboxRepo: InboxMessageRepository,
    private readonly outboxRepo: OutboxMessageRepository,
  ) {}

  async process(cmd: ProcessWagerTransactionCommand): Promise<ProcessWagerTransactionResult> {
    const payloadHash = computePayloadHash({
      providerId: cmd.providerId,
      externalTransactionId: cmd.externalTransactionId,
      walletId: cmd.walletId,
      playerId: cmd.playerId,
      kind: cmd.kind,
      amount: cmd.amount,
      currency: cmd.currency,
      roundId: cmd.roundId,
      gameId: cmd.gameId,
      ...(cmd.referenceExternalTransactionId
        ? { referenceExternalTransactionId: cmd.referenceExternalTransactionId }
        : {}),
    });

    // Check idempotency BEFORE acquiring any locks
    const existing = await this.txRepo.findByIdempotencyKey(cmd.idempotencyKey);
    if (existing) {
      if (!existing.matchesPayload(payloadHash)) {
        throw new IdempotencyConflictException(cmd.idempotencyKey);
      }
      // Replay — return original result
      const wallet = await this.walletRepo.findById(existing.walletId);
      return {
        transactionId: existing.id,
        status: existing.status,
        balance: wallet ? wallet.balance.toJSON() : { amount: '0.00', currency: cmd.currency },
        idempotentReplay: true,
        failureCode: existing.failureCode,
      };
    }

    try {
      return await this.em.transactional(async () => {
        // Acquire wallet lock FIRST to serialize all operations on this wallet
        const wallet = await this.walletRepo.findByIdWithLock(cmd.walletId);
        if (!wallet) {
          // Create a failed transaction record for auditability
          const tx = this.buildTransaction(uuidv4(), cmd, payloadHash);
          tx.reject(FailureCode.WalletNotFound, new Date());
          await this.txRepo.save(tx);
          await this.em.flush();
          throw new WalletNotFoundException(cmd.walletId);
        }

        const tx = this.buildTransaction(uuidv4(), cmd, payloadHash);

        let result: ProcessWagerTransactionResult;

        try {
          result = await this.applyTransaction(tx, wallet, cmd);
        } catch (err) {
          if (err instanceof DomainInsufficientFundsError) {
            tx.reject(FailureCode.InsufficientFunds, new Date());
            await this.txRepo.save(tx);
            this.enqueueRejectedEvent(tx, cmd.correlationId);
            await this.em.flush();
            return {
              transactionId: tx.id,
              status: WagerTransactionStatus.Rejected,
              balance: wallet.balance.toJSON(),
              idempotentReplay: false,
              failureCode: FailureCode.InsufficientFunds,
            };
          }
          throw err;
        }

        return result;
      });
    } catch (err) {
      // Concurrent requests with the same idempotency key: one wins the insert race,
      // the rest hit the unique constraint. Treat these as idempotent replays.
      if (err instanceof UniqueConstraintViolationException) {
        const winner = await this.txRepo.findByIdempotencyKey(cmd.idempotencyKey);
        if (winner) {
          if (!winner.matchesPayload(payloadHash)) {
            throw new IdempotencyConflictException(cmd.idempotencyKey);
          }
          const wallet = await this.walletRepo.findById(winner.walletId);
          return {
            transactionId: winner.id,
            status: winner.status,
            balance: wallet ? wallet.balance.toJSON() : { amount: '0.00', currency: cmd.currency },
            idempotentReplay: true,
            failureCode: winner.failureCode,
          };
        }
      }
      throw err;
    }
  }

  private buildTransaction(
    id: string,
    cmd: ProcessWagerTransactionCommand,
    payloadHash: string,
  ): WagerTransaction {
    return WagerTransaction.create({
      id,
      providerId: cmd.providerId,
      externalTransactionId: cmd.externalTransactionId,
      idempotencyKey: cmd.idempotencyKey,
      payloadHash,
      walletId: cmd.walletId,
      playerId: cmd.playerId,
      roundId: cmd.roundId,
      gameId: cmd.gameId,
      kind: cmd.kind,
      money: Money.from({ amount: cmd.amount, currency: cmd.currency }),
      referenceExternalTransactionId: cmd.referenceExternalTransactionId,
    });
  }

  private async applyTransaction(
    tx: WagerTransaction,
    wallet: Wallet,
    cmd: ProcessWagerTransactionCommand,
  ): Promise<ProcessWagerTransactionResult> {
    const now = new Date();

    switch (tx.kind) {
      case WagerTransactionKind.Bet:
        return this.processBet(tx, wallet, now, cmd.correlationId);

      case WagerTransactionKind.Win:
        return this.processCredit(tx, wallet, now, cmd.correlationId);

      case WagerTransactionKind.Loss:
        return this.processLoss(tx, wallet, now, cmd.correlationId);

      case WagerTransactionKind.Refund:
        return this.processRefund(tx, wallet, now, cmd);

      case WagerTransactionKind.Rollback:
        return this.processRollback(tx, wallet, now, cmd);

      case WagerTransactionKind.Opening:
        throw new Error('OPENING transactions cannot be submitted via API');
    }
  }

  /**
   * Flushes in FK-dependency order:
   * 1. wallet update (FK source for ledger entries and transactions)
   * 2. transaction insert (FK source for ledger entries)
   * 3. ledger entry + outbox inserts
   *
   * This is required because MikroORM's UoW ordering is based on declared
   * @ManyToOne relationships; since we use bare UUID properties, we must flush manually.
   */
  private async flushInOrder(
    wallet: Wallet,
    tx: WagerTransaction,
    ledgerEntry?: WalletLedgerEntry,
  ): Promise<void> {
    await this.walletRepo.save(wallet);
    await this.em.flush();
    await this.txRepo.save(tx);
    await this.em.flush();
    if (ledgerEntry) {
      await this.ledgerRepo.save(ledgerEntry);
      await this.em.flush();
    }
  }

  private async flushTransactionOnly(tx: WagerTransaction): Promise<void> {
    await this.txRepo.save(tx);
    await this.em.flush();
  }

  private async processBet(
    tx: WagerTransaction,
    wallet: Wallet,
    now: Date,
    correlationId: string,
  ): Promise<ProcessWagerTransactionResult> {
    // wallet.debit throws InsufficientFundsError if balance insufficient
    wallet.debit(tx.money, now);

    const ledgerEntry = this.createLedgerEntry(tx, wallet, LedgerDirection.Debit, now);
    tx.markProcessed(undefined, now);

    await this.flushInOrder(wallet, tx, ledgerEntry);
    this.enqueueBalanceChangedEvent(wallet, ledgerEntry, correlationId, tx.id);
    this.enqueueProcessedEvent(tx, correlationId);
    await this.em.flush();

    return {
      transactionId: tx.id,
      status: tx.status,
      balance: wallet.balance.toJSON(),
      idempotentReplay: false,
    };
  }

  private async processCredit(
    tx: WagerTransaction,
    wallet: Wallet,
    now: Date,
    correlationId: string,
  ): Promise<ProcessWagerTransactionResult> {
    wallet.credit(tx.money, now);

    const ledgerEntry = this.createLedgerEntry(tx, wallet, LedgerDirection.Credit, now);
    tx.markProcessed(undefined, now);

    await this.flushInOrder(wallet, tx, ledgerEntry);
    this.enqueueBalanceChangedEvent(wallet, ledgerEntry, correlationId, tx.id);
    this.enqueueProcessedEvent(tx, correlationId);
    await this.em.flush();

    return {
      transactionId: tx.id,
      status: tx.status,
      balance: wallet.balance.toJSON(),
      idempotentReplay: false,
    };
  }

  private async processLoss(
    tx: WagerTransaction,
    wallet: Wallet,
    now: Date,
    correlationId: string,
  ): Promise<ProcessWagerTransactionResult> {
    tx.markProcessed(undefined, now);

    await this.flushTransactionOnly(tx);
    this.enqueueProcessedEvent(tx, correlationId);
    await this.em.flush();

    return {
      transactionId: tx.id,
      status: tx.status,
      balance: wallet.balance.toJSON(),
      idempotentReplay: false,
    };
  }

  private async processRefund(
    tx: WagerTransaction,
    wallet: Wallet,
    now: Date,
    cmd: ProcessWagerTransactionCommand,
  ): Promise<ProcessWagerTransactionResult> {
    const reference = await this.txRepo.findByProviderAndExternalId(
      tx.providerId,
      tx.referenceExternalTransactionId!,
    );

    if (!reference || reference.status !== WagerTransactionStatus.Processed) {
      return this.handlePendingReference(tx, wallet, now, cmd.correlationId);
    }

    // Validate reference kind — REFUND can only reference BET
    if (reference.kind !== WagerTransactionKind.Bet) {
      tx.reject(FailureCode.InvalidReferenceKind, now);
      await this.txRepo.save(tx);
      this.enqueueRejectedEvent(tx, cmd.correlationId);
      await this.em.flush();
      throw new InvalidReferenceKindException(tx.kind, reference.kind);
    }

    this.validateReferenceConstraints(tx, reference, wallet);
    await this.checkNoExistingReversal(tx, reference);

    // Credit wallet with the BET amount
    wallet.credit(reference.money, now);

    const ledgerEntry = this.createLedgerEntry(tx, wallet, LedgerDirection.Credit, now);
    tx.markProcessed(reference.id, now);

    await this.flushInOrder(wallet, tx, ledgerEntry);
    this.enqueueBalanceChangedEvent(wallet, ledgerEntry, cmd.correlationId, tx.id);
    this.enqueueProcessedEvent(tx, cmd.correlationId);
    await this.em.flush();

    return {
      transactionId: tx.id,
      status: tx.status,
      balance: wallet.balance.toJSON(),
      idempotentReplay: false,
    };
  }

  private async processRollback(
    tx: WagerTransaction,
    wallet: Wallet,
    now: Date,
    cmd: ProcessWagerTransactionCommand,
  ): Promise<ProcessWagerTransactionResult> {
    const reference = await this.txRepo.findByProviderAndExternalId(
      tx.providerId,
      tx.referenceExternalTransactionId!,
    );

    if (!reference || reference.status !== WagerTransactionStatus.Processed) {
      return this.handlePendingReference(tx, wallet, now, cmd.correlationId);
    }

    // ROLLBACK can reference BET, WIN, REFUND
    const allowedKinds = [
      WagerTransactionKind.Bet,
      WagerTransactionKind.Win,
      WagerTransactionKind.Refund,
    ];
    if (!allowedKinds.includes(reference.kind)) {
      tx.reject(FailureCode.InvalidReferenceKind, now);
      await this.txRepo.save(tx);
      this.enqueueRejectedEvent(tx, cmd.correlationId);
      await this.em.flush();
      throw new InvalidReferenceKindException(tx.kind, reference.kind);
    }

    this.validateReferenceConstraints(tx, reference, wallet);
    await this.checkNoExistingReversal(tx, reference);

    const rollbackDirection = tx.ledgerDirectionFor(reference);

    if (rollbackDirection === LedgerDirection.Credit) {
      wallet.credit(reference.money, now);
    } else {
      try {
        wallet.debit(reference.money, now);
      } catch (err) {
        if (err instanceof DomainInsufficientFundsError) {
          tx.reject(FailureCode.NegativeBalanceOnReversal, now);
          await this.txRepo.save(tx);
          this.enqueueRejectedEvent(tx, cmd.correlationId);
          await this.em.flush();
          return {
            transactionId: tx.id,
            status: tx.status,
            balance: wallet.balance.toJSON(),
            idempotentReplay: false,
            failureCode: FailureCode.NegativeBalanceOnReversal,
          };
        }
        throw err;
      }
    }

    const ledgerEntry = this.createLedgerEntry(tx, wallet, rollbackDirection, now);
    tx.markProcessed(reference.id, now);

    await this.flushInOrder(wallet, tx, ledgerEntry);
    this.enqueueBalanceChangedEvent(wallet, ledgerEntry, cmd.correlationId, tx.id);
    this.enqueueProcessedEvent(tx, cmd.correlationId);
    await this.em.flush();

    return {
      transactionId: tx.id,
      status: tx.status,
      balance: wallet.balance.toJSON(),
      idempotentReplay: false,
    };
  }

  private async handlePendingReference(
    tx: WagerTransaction,
    wallet: Wallet,
    now: Date,
    correlationId: string,
  ): Promise<ProcessWagerTransactionResult> {
    if (tx.retryCount >= MAX_PENDING_REFERENCE_RETRIES) {
      tx.reject(FailureCode.ReferenceExhausted, now);
      await this.txRepo.save(tx);
      this.enqueueRejectedEvent(tx, correlationId);
      await this.em.flush();
      return {
        transactionId: tx.id,
        status: tx.status,
        balance: wallet.balance.toJSON(),
        idempotentReplay: false,
        failureCode: FailureCode.ReferenceExhausted,
      };
    }

    const nextRetryAt = computeNextRetryAt(0, now);
    tx.markPendingReference(nextRetryAt, now);
    await this.txRepo.save(tx);

    this.enqueuePendingReferenceEvent(tx, correlationId);
    await this.em.flush();

    return {
      transactionId: tx.id,
      status: tx.status,
      balance: wallet.balance.toJSON(),
      idempotentReplay: false,
    };
  }

  private validateReferenceConstraints(
    tx: WagerTransaction,
    reference: WagerTransaction,
    wallet: Wallet,
  ): void {
    if (reference.walletId !== tx.walletId) {
      throw new Error(`Cross-wallet reference: ${reference.walletId} vs ${tx.walletId}`);
    }
    if (reference.providerId !== tx.providerId) {
      throw new Error(`Cross-provider reference: ${reference.providerId} vs ${tx.providerId}`);
    }
    if (reference.roundId !== tx.roundId) {
      throw new Error(`Cross-round reference: ${reference.roundId} vs ${tx.roundId}`);
    }
    if (reference.money.currency !== tx.money.currency) {
      throw new CurrencyMismatchException(reference.money.currency, tx.money.currency);
    }
    if (!reference.money.equals(tx.money)) {
      throw new AmountMismatchException(reference.money.amount, tx.money.amount);
    }
  }

  private async checkNoExistingReversal(
    tx: WagerTransaction,
    reference: WagerTransaction,
  ): Promise<void> {
    const alreadyReversed = await this.txRepo.existsReversalFor(
      tx.walletId,
      tx.providerId,
      reference.id,
      tx.kind,
    );
    if (alreadyReversed) {
      throw new ReferenceAlreadyReversedException(reference.externalTransactionId);
    }
  }

  private createLedgerEntry(
    tx: WagerTransaction,
    wallet: Wallet,
    direction: LedgerDirection,
    now: Date,
  ): WalletLedgerEntry {
    // Balance is already updated on wallet by the time we get here
    const balanceAfter = wallet.balance;
    const balanceBefore =
      direction === LedgerDirection.Debit
        ? balanceAfter.add(tx.money)
        : balanceAfter.subtract(tx.money);

    return WalletLedgerEntry.create({
      id: uuidv4(),
      walletId: wallet.id,
      transactionId: tx.id,
      direction,
      money: tx.money,
      balanceBefore,
      balanceAfter,
      createdAt: now,
    });
  }

  private enqueueBalanceChangedEvent(
    wallet: Wallet,
    entry: WalletLedgerEntry,
    correlationId: string,
    causationId: string,
  ): void {
    const event = WalletBalanceChanged.from(
      wallet,
      entry,
      { correlationId, causationId },
      uuidv4(),
    );
    const outbox = OutboxMessage.enqueue({
      id: uuidv4(),
      aggregateId: wallet.id,
      aggregateType: 'wallet',
      eventType: event.eventType,
      payload: event.toJSON() as Record<string, unknown>,
      occurredAt: event.occurredAt,
    });
    this.outboxRepo.save(outbox);
  }

  private enqueueProcessedEvent(tx: WagerTransaction, correlationId: string): void {
    const event = WagerTransactionProcessed.from(tx, { correlationId, causationId: tx.id }, uuidv4());
    const outbox = OutboxMessage.enqueue({
      id: uuidv4(),
      aggregateId: tx.id,
      aggregateType: 'wager_transaction',
      eventType: event.eventType,
      payload: event.toJSON() as Record<string, unknown>,
      occurredAt: event.occurredAt,
    });
    this.outboxRepo.save(outbox);
  }

  private enqueueRejectedEvent(tx: WagerTransaction, correlationId: string): void {
    const event = WagerTransactionRejected.from(tx, { correlationId, causationId: tx.id }, uuidv4());
    const outbox = OutboxMessage.enqueue({
      id: uuidv4(),
      aggregateId: tx.id,
      aggregateType: 'wager_transaction',
      eventType: event.eventType,
      payload: event.toJSON() as Record<string, unknown>,
      occurredAt: event.occurredAt,
    });
    this.outboxRepo.save(outbox);
  }

  private enqueuePendingReferenceEvent(tx: WagerTransaction, correlationId: string): void {
    const event = WagerTransactionPendingReference.from(
      tx,
      { correlationId, causationId: tx.id },
      uuidv4(),
    );
    const outbox = OutboxMessage.enqueue({
      id: uuidv4(),
      aggregateId: tx.id,
      aggregateType: 'wager_transaction',
      eventType: event.eventType,
      payload: event.toJSON() as Record<string, unknown>,
      occurredAt: event.occurredAt,
    });
    this.outboxRepo.save(outbox);
  }
}
