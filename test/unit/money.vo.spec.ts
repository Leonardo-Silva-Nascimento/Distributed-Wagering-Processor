import { describe, it, expect } from 'vitest';
import { Money, MoneyValidationError, CurrencyMismatchError } from '../../src/domain/value-objects/money.vo';

describe('Money', () => {
  describe('Money.from', () => {
    it('creates from valid string amount', () => {
      const m = Money.from({ amount: '25.00', currency: 'BRL' });
      expect(m.amount).toBe('25.00');
      expect(m.currency).toBe('BRL');
    });

    it('normalizes currency to uppercase', () => {
      const m = Money.from({ amount: '10.00', currency: 'brl' });
      expect(m.currency).toBe('BRL');
    });

    it('accepts zero', () => {
      const m = Money.from({ amount: '0.00', currency: 'BRL' });
      expect(m.isZero()).toBe(true);
    });

    it('rejects negative amounts', () => {
      expect(() => Money.from({ amount: '-1.00', currency: 'BRL' })).toThrow(MoneyValidationError);
    });

    it('rejects empty string', () => {
      expect(() => Money.from({ amount: '', currency: 'BRL' })).toThrow(MoneyValidationError);
    });

    it('rejects scientific notation', () => {
      expect(() => Money.from({ amount: '1e5', currency: 'BRL' })).toThrow(MoneyValidationError);
    });

    it('rejects more than 2 decimal places', () => {
      expect(() => Money.from({ amount: '1.001', currency: 'BRL' })).toThrow(MoneyValidationError);
    });

    it('rejects NaN string', () => {
      expect(() => Money.from({ amount: 'abc', currency: 'BRL' })).toThrow(MoneyValidationError);
    });

    it('rejects empty currency', () => {
      expect(() => Money.from({ amount: '1.00', currency: '' })).toThrow(MoneyValidationError);
    });
  });

  describe('Money.zero', () => {
    it('creates zero money', () => {
      const m = Money.zero('USD');
      expect(m.isZero()).toBe(true);
      expect(m.amount).toBe('0.00');
    });
  });

  describe('arithmetic', () => {
    it('adds two amounts', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '5.50', currency: 'BRL' });
      expect(a.add(b).amount).toBe('15.50');
    });

    it('subtracts amounts', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '3.00', currency: 'BRL' });
      expect(a.subtract(b).amount).toBe('7.00');
    });

    it('subtraction can produce negative (internal use)', () => {
      const a = Money.from({ amount: '5.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'BRL' });
      expect(a.subtract(b).isNegative()).toBe(true);
    });

    it('negate changes sign', () => {
      const a = Money.from({ amount: '5.00', currency: 'BRL' });
      expect(a.negate().isNegative()).toBe(true);
      expect(a.negate().amount).toBe('-5.00');
    });

    it('throws on currency mismatch in add', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '5.00', currency: 'USD' });
      expect(() => a.add(b)).toThrow(CurrencyMismatchError);
    });

    it('throws on currency mismatch in subtract', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '5.00', currency: 'USD' });
      expect(() => a.subtract(b)).toThrow(CurrencyMismatchError);
    });

    it('is immutable — add returns new instance', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '5.00', currency: 'BRL' });
      const c = a.add(b);
      expect(a.amount).toBe('10.00');
      expect(c.amount).toBe('15.00');
    });
  });

  describe('comparisons', () => {
    it('isLessThan', () => {
      const a = Money.from({ amount: '5.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'BRL' });
      expect(a.isLessThan(b)).toBe(true);
      expect(b.isLessThan(a)).toBe(false);
    });

    it('isGreaterThan', () => {
      const a = Money.from({ amount: '15.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'BRL' });
      expect(a.isGreaterThan(b)).toBe(true);
    });

    it('equals', () => {
      const a = Money.from({ amount: '10.00', currency: 'BRL' });
      const b = Money.from({ amount: '10.00', currency: 'BRL' });
      const c = Money.from({ amount: '10.00', currency: 'USD' });
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('serializes to MoneyProps', () => {
      const m = Money.from({ amount: '99.99', currency: 'BRL' });
      expect(m.toJSON()).toEqual({ amount: '99.99', currency: 'BRL' });
    });
  });

  describe('fixed scale', () => {
    it('serializes with 2 decimal places', () => {
      const m = Money.from({ amount: '5.10', currency: 'BRL' });
      expect(m.amount).toBe('5.10');
    });
  });
});
