import { IntegrationEvent, IntegrationEventProps } from './integration-event';
import { MoneyProps } from '../value-objects/money.vo';
import { LedgerDirection } from '../wager-transaction/wager-transaction.kinds';
import { Wallet } from '../wallet/wallet.aggregate';
import { WalletLedgerEntry } from '../wallet-ledger-entry/wallet-ledger-entry.entity';

export interface EventContext {
  correlationId: string;
  causationId?: string;
}

export interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
  readonly eventType = 'WalletBalanceChanged';
  readonly version = 1;

  static from(
    wallet: Wallet,
    entry: WalletLedgerEntry,
    ctx: EventContext,
    eventId: string,
  ): WalletBalanceChanged {
    return new WalletBalanceChanged({
      eventId,
      aggregateId: wallet.id,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: entry.createdAt,
      data: {
        walletId: wallet.id,
        transactionId: entry.transactionId,
        direction: entry.direction,
        money: entry.money.toJSON(),
        balanceBefore: entry.balanceBefore.toJSON(),
        balanceAfter: entry.balanceAfter.toJSON(),
        walletVersion: wallet.version,
      },
    });
  }

  private constructor(props: IntegrationEventProps<WalletBalanceChangedData>) {
    super(props);
  }
}
