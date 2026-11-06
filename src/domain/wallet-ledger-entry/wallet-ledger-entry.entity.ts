import { Money } from '../value-objects/money.vo';
import { LedgerDirection } from '../wager-transaction/wager-transaction.kinds';

export interface CreateLedgerEntryProps {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt: Date;
}

export interface LedgerEntryState {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  moneyAmount: string;
  moneyCurrency: string;
  balanceBeforeAmount: string;
  balanceAfterAmount: string;
  currency: string;
  createdAt: Date;
}

export class WalletLedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly transactionId: string,
    public readonly direction: LedgerDirection,
    public readonly money: Money,
    public readonly balanceBefore: Money,
    public readonly balanceAfter: Money,
    public readonly createdAt: Date,
  ) {}

  static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
    const { money, balanceBefore, balanceAfter, direction } = props;

    const entry = new WalletLedgerEntry(
      props.id,
      props.walletId,
      props.transactionId,
      direction,
      money,
      balanceBefore,
      balanceAfter,
      props.createdAt,
    );

    if (!entry.isBalanced()) {
      throw new Error(
        `Ledger entry arithmetic invalid: ${balanceBefore} ${direction === LedgerDirection.Debit ? '-' : '+'} ${money} != ${balanceAfter}`,
      );
    }

    return entry;
  }

  static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
    return new WalletLedgerEntry(
      state.id,
      state.walletId,
      state.transactionId,
      state.direction,
      Money.from({ amount: state.moneyAmount, currency: state.moneyCurrency }),
      Money.from({ amount: state.balanceBeforeAmount, currency: state.currency }),
      Money.from({ amount: state.balanceAfterAmount, currency: state.currency }),
      state.createdAt,
    );
  }

  isBalanced(): boolean {
    if (this.direction === LedgerDirection.Debit) {
      return this.balanceBefore.subtract(this.money).equals(this.balanceAfter);
    } else {
      return this.balanceBefore.add(this.money).equals(this.balanceAfter);
    }
  }
}
