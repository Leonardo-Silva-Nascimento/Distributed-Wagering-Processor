import Decimal from 'decimal.js';

export interface MoneyProps {
  amount: string;
  currency: string;
}

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export class Money {
  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    const { amount, currency } = props;

    if (!currency || typeof currency !== 'string' || currency.trim().length === 0) {
      throw new MoneyValidationError('Currency must be a non-empty string');
    }

    if (!amount || typeof amount !== 'string' || amount.trim().length === 0) {
      throw new MoneyValidationError('Amount must be a non-empty string');
    }

    if (/[eE]/.test(amount)) {
      throw new MoneyValidationError('Scientific notation is not allowed');
    }

    let decimal: Decimal;
    try {
      decimal = new Decimal(amount);
    } catch {
      throw new MoneyValidationError(`Invalid amount: "${amount}"`);
    }

    if (!decimal.isFinite()) {
      throw new MoneyValidationError('Amount must be finite (no NaN or Infinity)');
    }

    if (decimal.isNegative()) {
      throw new MoneyValidationError('Amount cannot be negative in entry contracts');
    }

    const decimalPlaces = decimal.decimalPlaces();
    if (decimalPlaces > 2) {
      throw new MoneyValidationError(
        `Amount must have at most 2 decimal places, got ${decimalPlaces}`,
      );
    }

    return new Money(decimal.toDecimalPlaces(2), currency.toUpperCase());
  }

  static zero(currency: string): Money {
    return new Money(new Decimal('0.00'), currency.toUpperCase());
  }

  /** Internal factory for arithmetic results — allows negative intermediate values. */
  private static fromDecimal(value: Decimal, currency: string): Money {
    return new Money(value.toDecimalPlaces(2), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromDecimal(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromDecimal(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return Money.fromDecimal(this.value.negated(), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  isNegative(): boolean {
    return this.value.lessThan(0);
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.greaterThan(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  get amount(): string {
    return this.value.toFixed(2);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.value.toFixed(2),
      currency: this.currency,
    };
  }

  toString(): string {
    return `${this.value.toFixed(2)} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}

export class MoneyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyValidationError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`Currency mismatch: expected ${expected}, got ${actual}`);
    this.name = 'CurrencyMismatchError';
  }
}
