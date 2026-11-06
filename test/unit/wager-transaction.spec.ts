import { describe, it, expect } from 'vitest';
import { WagerTransaction } from '../../src/domain/wager-transaction/wager-transaction.entity';
import { Money } from '../../src/domain/value-objects/money.vo';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
  LedgerDirection,
  FailureCode,
} from '../../src/domain/wager-transaction/wager-transaction.kinds';
import { InvalidTransactionStateError } from '../../src/domain/wager-transaction/wager-transaction.errors';

const makeMoney = (amount = '25.00') => Money.from({ amount, currency: 'BRL' });

const makeProps = (kind = WagerTransactionKind.Bet) => ({
  id: 'tx-1',
  providerId: 'provider-a',
  externalTransactionId: 'ext-123',
  idempotencyKey: 'provider-a:ext-123',
  payloadHash: 'hash123',
  walletId: 'wallet-1',
  playerId: 'player-1',
  roundId: 'round-1',
  gameId: 'game-1',
  kind,
  money: makeMoney(),
});

describe('WagerTransaction', () => {
  describe('create', () => {
    it('creates BET in PENDING status', () => {
      const tx = WagerTransaction.create(makeProps(WagerTransactionKind.Bet));
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.kind).toBe(WagerTransactionKind.Bet);
    });

    it('creates WIN in PENDING status', () => {
      const tx = WagerTransaction.create(makeProps(WagerTransactionKind.Win));
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
    });

    it('requires referenceExternalTransactionId for REFUND', () => {
      expect(() =>
        WagerTransaction.create({ ...makeProps(WagerTransactionKind.Refund) }),
      ).toThrow('requires referenceExternalTransactionId');
    });

    it('requires referenceExternalTransactionId for ROLLBACK', () => {
      expect(() =>
        WagerTransaction.create({ ...makeProps(WagerTransactionKind.Rollback) }),
      ).toThrow('requires referenceExternalTransactionId');
    });

    it('creates REFUND when referenceExternalTransactionId provided', () => {
      const tx = WagerTransaction.create({
        ...makeProps(WagerTransactionKind.Refund),
        referenceExternalTransactionId: 'ext-100',
      });
      expect(tx.requiresReference()).toBe(true);
    });

    it('rejects OPENING kind', () => {
      expect(() =>
        WagerTransaction.create(makeProps(WagerTransactionKind.Opening)),
      ).toThrow('OPENING transactions cannot be created via this factory');
    });
  });

  describe('transitions', () => {
    it('markProcessed transitions to PROCESSED', () => {
      const tx = WagerTransaction.create(makeProps());
      tx.markProcessed(undefined, new Date());
      expect(tx.status).toBe(WagerTransactionStatus.Processed);
      expect(tx.isTerminal()).toBe(true);
    });

    it('reject transitions to REJECTED', () => {
      const tx = WagerTransaction.create(makeProps());
      tx.reject(FailureCode.InsufficientFunds, new Date());
      expect(tx.status).toBe(WagerTransactionStatus.Rejected);
      expect(tx.failureCode).toBe(FailureCode.InsufficientFunds);
      expect(tx.isTerminal()).toBe(true);
    });

    it('fail transitions to FAILED', () => {
      const tx = WagerTransaction.create(makeProps());
      tx.fail(FailureCode.WalletNotFound, new Date());
      expect(tx.status).toBe(WagerTransactionStatus.Failed);
      expect(tx.isTerminal()).toBe(true);
    });

    it('markPendingReference transitions to PENDING_REFERENCE', () => {
      const tx = WagerTransaction.create({
        ...makeProps(WagerTransactionKind.Refund),
        referenceExternalTransactionId: 'ext-100',
      });
      tx.markPendingReference(new Date(), new Date());
      expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
      expect(tx.isTerminal()).toBe(false);
    });

    it('throws InvalidTransactionStateError when transitioning from PROCESSED', () => {
      const tx = WagerTransaction.create(makeProps());
      tx.markProcessed(undefined, new Date());
      expect(() => tx.markProcessed(undefined, new Date())).toThrow(InvalidTransactionStateError);
    });

    it('throws InvalidTransactionStateError when rejecting from REJECTED', () => {
      const tx = WagerTransaction.create(makeProps());
      tx.reject(FailureCode.InsufficientFunds, new Date());
      expect(() => tx.reject(FailureCode.InsufficientFunds, new Date())).toThrow(InvalidTransactionStateError);
    });
  });

  describe('affectsBalance', () => {
    it('BET affects balance', () => {
      const tx = WagerTransaction.create(makeProps(WagerTransactionKind.Bet));
      expect(tx.affectsBalance()).toBe(true);
    });

    it('LOSS does not affect balance', () => {
      const tx = WagerTransaction.create(makeProps(WagerTransactionKind.Loss));
      expect(tx.affectsBalance()).toBe(false);
    });

    it('WIN affects balance', () => {
      const tx = WagerTransaction.create(makeProps(WagerTransactionKind.Win));
      expect(tx.affectsBalance()).toBe(true);
    });
  });

  describe('ledgerDirectionFor', () => {
    it('BET → DEBIT', () => {
      const tx = WagerTransaction.create(makeProps(WagerTransactionKind.Bet));
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
    });

    it('WIN → CREDIT', () => {
      const tx = WagerTransaction.create(makeProps(WagerTransactionKind.Win));
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });

    it('REFUND → CREDIT', () => {
      const tx = WagerTransaction.create({
        ...makeProps(WagerTransactionKind.Refund),
        referenceExternalTransactionId: 'ext-100',
      });
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });

    it('ROLLBACK inverts reference direction (DEBIT ref → CREDIT)', () => {
      const refTx = WagerTransaction.create(makeProps(WagerTransactionKind.Bet));
      const rollback = WagerTransaction.create({
        ...makeProps(WagerTransactionKind.Rollback),
        referenceExternalTransactionId: 'ext-100',
      });
      expect(rollback.ledgerDirectionFor(refTx)).toBe(LedgerDirection.Credit);
    });

    it('ROLLBACK inverts reference direction (CREDIT ref → DEBIT)', () => {
      const refTx = WagerTransaction.create(makeProps(WagerTransactionKind.Win));
      const rollback = WagerTransaction.create({
        ...makeProps(WagerTransactionKind.Rollback),
        referenceExternalTransactionId: 'ext-100',
      });
      expect(rollback.ledgerDirectionFor(refTx)).toBe(LedgerDirection.Debit);
    });

    it('LOSS throws when calling ledgerDirectionFor', () => {
      const tx = WagerTransaction.create(makeProps(WagerTransactionKind.Loss));
      expect(() => tx.ledgerDirectionFor()).toThrow('LOSS transactions do not produce ledger entries');
    });
  });

  describe('matchesPayload', () => {
    it('returns true for same hash', () => {
      const tx = WagerTransaction.create(makeProps());
      expect(tx.matchesPayload('hash123')).toBe(true);
    });

    it('returns false for different hash', () => {
      const tx = WagerTransaction.create(makeProps());
      expect(tx.matchesPayload('different-hash')).toBe(false);
    });
  });
});
