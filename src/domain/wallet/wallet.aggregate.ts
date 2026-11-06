import { Money } from '../value-objects/money.vo';
import { InsufficientFundsError, WalletCurrencyMismatchError } from './wallet.errors';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balanceAmount: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: { id: string; playerId: string; initialBalance: Money }): Wallet {
    const { id, playerId, initialBalance } = props;
    const now = new Date();
    return new Wallet(id, playerId, initialBalance.currency, initialBalance, 1, now, now);
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      Money.from({ amount: state.balanceAmount, currency: state.currency }),
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money, at: Date): void {
    this.assertSameCurrency(amount);

    if (amount.isNegative() || amount.isZero()) {
      throw new Error('Debit amount must be positive');
    }

    const newBalance = this._balance.subtract(amount);
    if (newBalance.isNegative()) {
      throw new InsufficientFundsError(this.id, amount.toString(), this._balance.toString());
    }

    this._balance = newBalance;
    this._version += 1;
    this._updatedAt = at;
  }

  credit(amount: Money, at: Date): void {
    this.assertSameCurrency(amount);

    if (amount.isNegative() || amount.isZero()) {
      throw new Error('Credit amount must be positive');
    }

    this._balance = this._balance.add(amount);
    this._version += 1;
    this._updatedAt = at;
  }

  private assertSameCurrency(money: Money): void {
    if (this.currency !== money.currency) {
      throw new WalletCurrencyMismatchError(this.currency, money.currency);
    }
  }
}
