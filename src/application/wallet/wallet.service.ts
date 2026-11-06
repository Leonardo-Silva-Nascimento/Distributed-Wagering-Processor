import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { v4 as uuidv4 } from 'uuid';
import { WalletRepository } from '../../infrastructure/persistence/repositories/wallet.repository';
import { WagerTransactionRepository } from '../../infrastructure/persistence/repositories/wager-transaction.repository';
import { WalletLedgerEntryRepository } from '../../infrastructure/persistence/repositories/wallet-ledger-entry.repository';
import { OutboxMessageRepository } from '../../infrastructure/persistence/repositories/outbox-message.repository';
import { Wallet } from '../../domain/wallet/wallet.aggregate';
import { WagerTransaction } from '../../domain/wager-transaction/wager-transaction.entity';
import { WalletLedgerEntry } from '../../domain/wallet-ledger-entry/wallet-ledger-entry.entity';
import { OutboxMessage } from '../../domain/messaging/outbox-message.entity';
import { Money } from '../../domain/value-objects/money.vo';
import {
  WagerTransactionKind,
  LedgerDirection,
  WagerTransactionStatus,
} from '../../domain/wager-transaction/wager-transaction.kinds';
import { computePayloadHash } from '../../shared/utils/payload-hash.util';
import {
  WalletNotFoundException,
  WalletAlreadyExistsException,
} from '../../shared/exceptions/domain.exception';
import { WalletBalanceChanged } from '../../domain/events/wallet-events';
import { WagerTransactionProcessed } from '../../domain/events/wager-transaction-events';

export interface CreateWalletCommand {
  playerId: string;
  initialBalance: { amount: string; currency: string };
  correlationId: string;
}

export interface CreateWalletResult {
  id: string;
  playerId: string;
  balance: { amount: string; currency: string };
  version: number;
}

export interface GetWalletResult {
  id: string;
  playerId: string;
  balance: { amount: string; currency: string };
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReconciliationResult {
  walletId: string;
  storedBalance: { amount: string; currency: string };
  calculatedBalance: { amount: string; currency: string };
  difference: { amount: string; currency: string };
  consistent: boolean;
  checkedEntries: number;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly walletRepo: WalletRepository,
    private readonly txRepo: WagerTransactionRepository,
    private readonly ledgerRepo: WalletLedgerEntryRepository,
    private readonly outboxRepo: OutboxMessageRepository,
  ) {}

  async createWallet(cmd: CreateWalletCommand): Promise<CreateWalletResult> {
    const initialBalance = Money.from(cmd.initialBalance);

    return await this.em.transactional(async () => {
      const existing = await this.walletRepo.findByPlayerAndCurrency(
        cmd.playerId,
        initialBalance.currency,
      );
      if (existing) {
        throw new WalletAlreadyExistsException(cmd.playerId, initialBalance.currency);
      }

      const walletId = uuidv4();
      const wallet = Wallet.open({
        id: walletId,
        playerId: cmd.playerId,
        initialBalance,
      });

      await this.walletRepo.save(wallet);
      // Flush wallet first so FK constraints are satisfied for ledger/transaction inserts
      await this.em.flush();

      if (!initialBalance.isZero()) {
        await this.createOpeningTransaction(wallet, initialBalance, cmd.correlationId);
        await this.em.flush();
      }

      return {
        id: wallet.id,
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
      };
    });
  }

  private async createOpeningTransaction(
    wallet: Wallet,
    amount: Money,
    correlationId: string,
  ): Promise<void> {
    const now = new Date();
    const txId = uuidv4();
    const payloadHash = computePayloadHash({
      kind: WagerTransactionKind.Opening,
      walletId: wallet.id,
      playerId: wallet.playerId,
      amount: amount.amount,
      currency: amount.currency,
    });

    const tx = WagerTransaction.createOpening({
      id: txId,
      providerId: 'system',
      externalTransactionId: `opening-${wallet.id}`,
      idempotencyKey: `opening-${wallet.id}`,
      payloadHash,
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'opening',
      gameId: 'opening',
      money: amount,
    });

    // wallet already has initial balance set via open(), so balanceBefore=0, balanceAfter=amount
    const ledgerEntry = WalletLedgerEntry.create({
      id: uuidv4(),
      walletId: wallet.id,
      transactionId: tx.id,
      direction: LedgerDirection.Credit,
      money: amount,
      balanceBefore: Money.zero(amount.currency),
      balanceAfter: amount,
      createdAt: now,
    });

    tx.markProcessed(undefined, now);

    await this.txRepo.save(tx);
    await this.em.flush(); // transaction must exist before ledger FK

    await this.ledgerRepo.save(ledgerEntry);

    const event = WalletBalanceChanged.from(
      wallet,
      ledgerEntry,
      { correlationId },
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
    await this.outboxRepo.save(outbox);
  }

  async getWallet(walletId: string): Promise<GetWalletResult> {
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) throw new WalletNotFoundException(walletId);

    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  async getLedger(
    walletId: string,
    cursor?: string,
    limit = 50,
  ) {
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) throw new WalletNotFoundException(walletId);

    return this.ledgerRepo.findByWalletId(walletId, cursor, limit);
  }

  async reconcile(walletId: string): Promise<ReconciliationResult> {
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) throw new WalletNotFoundException(walletId);

    const ledgerPage = await this.ledgerRepo.findByWalletId(walletId, undefined, 1);
    const reconstructed = await this.ledgerRepo.reconstructBalance(walletId, wallet.currency);

    const stored = wallet.balance;
    const difference = stored.subtract(reconstructed);
    const consistent = difference.isZero();

    if (!consistent) {
      this.logger.error(
        {
          walletId,
          storedBalance: stored.toJSON(),
          calculatedBalance: reconstructed.toJSON(),
          difference: difference.toJSON(),
        },
        'RECONCILIATION_DIVERGENCE: wallet balance does not match ledger reconstruction',
      );
    }

    return {
      walletId,
      storedBalance: stored.toJSON(),
      calculatedBalance: reconstructed.toJSON(),
      difference: difference.toJSON(),
      consistent,
      checkedEntries: ledgerPage.total,
    };
  }
}
