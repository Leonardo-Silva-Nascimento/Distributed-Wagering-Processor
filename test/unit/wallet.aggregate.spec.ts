import { describe, it, expect } from 'vitest';
import { Wallet } from '../../src/domain/wallet/wallet.aggregate';
import { Money } from '../../src/domain/value-objects/money.vo';
import { InsufficientFundsError, WalletCurrencyMismatchError } from '../../src/domain/wallet/wallet.errors';

const makeWallet = (balance = '100.00', currency = 'BRL') =>
  Wallet.open({
    id: 'wallet-1',
    playerId: 'player-1',
    initialBalance: Money.from({ amount: balance, currency }),
  });

describe('Wallet', () => {
  describe('open', () => {
    it('creates wallet with initial balance', () => {
      const w = makeWallet('500.00');
      expect(w.balance.amount).toBe('500.00');
      expect(w.balance.currency).toBe('BRL');
      expect(w.version).toBe(1);
    });
  });

  describe('debit', () => {
    it('debits the balance', () => {
      const w = makeWallet('100.00');
      w.debit(Money.from({ amount: '30.00', currency: 'BRL' }), new Date());
      expect(w.balance.amount).toBe('70.00');
      expect(w.version).toBe(2);
    });

    it('allows full debit to zero', () => {
      const w = makeWallet('100.00');
      w.debit(Money.from({ amount: '100.00', currency: 'BRL' }), new Date());
      expect(w.balance.amount).toBe('0.00');
    });

    it('throws InsufficientFundsError when balance insufficient', () => {
      const w = makeWallet('50.00');
      expect(() =>
        w.debit(Money.from({ amount: '80.00', currency: 'BRL' }), new Date()),
      ).toThrow(InsufficientFundsError);
    });

    it('throws WalletCurrencyMismatchError on currency mismatch', () => {
      const w = makeWallet('100.00', 'BRL');
      expect(() =>
        w.debit(Money.from({ amount: '10.00', currency: 'USD' }), new Date()),
      ).toThrow(WalletCurrencyMismatchError);
    });

    it('increments version on successful debit', () => {
      const w = makeWallet('100.00');
      w.debit(Money.from({ amount: '10.00', currency: 'BRL' }), new Date());
      w.debit(Money.from({ amount: '10.00', currency: 'BRL' }), new Date());
      expect(w.version).toBe(3);
    });
  });

  describe('credit', () => {
    it('credits the balance', () => {
      const w = makeWallet('100.00');
      w.credit(Money.from({ amount: '50.00', currency: 'BRL' }), new Date());
      expect(w.balance.amount).toBe('150.00');
      expect(w.version).toBe(2);
    });

    it('throws WalletCurrencyMismatchError on currency mismatch', () => {
      const w = makeWallet('100.00', 'BRL');
      expect(() =>
        w.credit(Money.from({ amount: '10.00', currency: 'USD' }), new Date()),
      ).toThrow(WalletCurrencyMismatchError);
    });
  });

  describe('rehydrate', () => {
    it('reconstructs wallet from state', () => {
      const now = new Date();
      const w = Wallet.rehydrate({
        id: 'w-1',
        playerId: 'p-1',
        currency: 'BRL',
        balanceAmount: '250.00',
        version: 5,
        createdAt: now,
        updatedAt: now,
      });
      expect(w.balance.amount).toBe('250.00');
      expect(w.version).toBe(5);
    });
  });

  describe('invariant: balance never negative', () => {
    it('race condition scenario: two simultaneous 80.00 bets on 100.00 balance', () => {
      // Simulates two sequential operations (the second should fail after first succeeds)
      const w = makeWallet('100.00');
      w.debit(Money.from({ amount: '80.00', currency: 'BRL' }), new Date());
      expect(w.balance.amount).toBe('20.00');

      expect(() =>
        w.debit(Money.from({ amount: '80.00', currency: 'BRL' }), new Date()),
      ).toThrow(InsufficientFundsError);

      // Balance unchanged after rejection
      expect(w.balance.amount).toBe('20.00');
    });
  });
});
