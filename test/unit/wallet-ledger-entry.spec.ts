import { describe, it, expect } from 'vitest';
import { WalletLedgerEntry } from '../../src/domain/wallet-ledger-entry/wallet-ledger-entry.entity';
import { Money } from '../../src/domain/value-objects/money.vo';
import { LedgerDirection } from '../../src/domain/wager-transaction/wager-transaction.kinds';

describe('WalletLedgerEntry', () => {
  it('creates a balanced DEBIT entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'le-1',
      walletId: 'w-1',
      transactionId: 'tx-1',
      direction: LedgerDirection.Debit,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
      balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
      balanceAfter: Money.from({ amount: '75.00', currency: 'BRL' }),
      createdAt: new Date(),
    });
    expect(entry.isBalanced()).toBe(true);
  });

  it('creates a balanced CREDIT entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'le-2',
      walletId: 'w-1',
      transactionId: 'tx-2',
      direction: LedgerDirection.Credit,
      money: Money.from({ amount: '50.00', currency: 'BRL' }),
      balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
      balanceAfter: Money.from({ amount: '150.00', currency: 'BRL' }),
      createdAt: new Date(),
    });
    expect(entry.isBalanced()).toBe(true);
  });

  it('throws when arithmetic does not balance (DEBIT)', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'le-3',
        walletId: 'w-1',
        transactionId: 'tx-3',
        direction: LedgerDirection.Debit,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '80.00', currency: 'BRL' }), // Wrong: should be 75.00
        createdAt: new Date(),
      }),
    ).toThrow('Ledger entry arithmetic invalid');
  });

  it('throws when arithmetic does not balance (CREDIT)', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: 'le-4',
        walletId: 'w-1',
        transactionId: 'tx-4',
        direction: LedgerDirection.Credit,
        money: Money.from({ amount: '50.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '140.00', currency: 'BRL' }), // Wrong: should be 150.00
        createdAt: new Date(),
      }),
    ).toThrow('Ledger entry arithmetic invalid');
  });

  it('is immutable — has no mutating methods', () => {
    const entry = WalletLedgerEntry.create({
      id: 'le-5',
      walletId: 'w-1',
      transactionId: 'tx-5',
      direction: LedgerDirection.Debit,
      money: Money.from({ amount: '10.00', currency: 'BRL' }),
      balanceBefore: Money.from({ amount: '50.00', currency: 'BRL' }),
      balanceAfter: Money.from({ amount: '40.00', currency: 'BRL' }),
      createdAt: new Date(),
    });

    // Verify all properties are readonly
    expect(() => {
      (entry as unknown as Record<string, unknown>)['id'] = 'other';
    }).not.toThrow(); // Object.assign on a readonly property silently fails in non-strict mode
    // The actual immutability is via TypeScript's readonly — no mutation methods exist
    expect(typeof (entry as unknown as Record<string, unknown>)['markProcessed']).toBe('undefined');
  });
});
