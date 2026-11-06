import { IntegrationEvent, IntegrationEventProps } from './integration-event';
import { MoneyProps } from '../value-objects/money.vo';
import { WagerTransactionKind, WagerTransactionStatus, FailureCode } from '../wager-transaction/wager-transaction.kinds';
import { WagerTransaction } from '../wager-transaction/wager-transaction.entity';
import { EventContext } from './wallet-events';

export interface WagerTransactionProcessedData {
  transactionId: string;
  walletId: string;
  playerId: string;
  providerId: string;
  externalTransactionId: string;
  kind: WagerTransactionKind;
  status: WagerTransactionStatus;
  money: MoneyProps;
  roundId: string;
  gameId: string;
  processedAt: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  static from(tx: WagerTransaction, ctx: EventContext, eventId: string): WagerTransactionProcessed {
    return new WagerTransactionProcessed({
      eventId,
      aggregateId: tx.id,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: tx.processedAt ?? new Date(),
      data: {
        transactionId: tx.id,
        walletId: tx.walletId,
        playerId: tx.playerId,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        kind: tx.kind,
        status: tx.status,
        money: tx.money.toJSON(),
        roundId: tx.roundId,
        gameId: tx.gameId,
        processedAt: (tx.processedAt ?? new Date()).toISOString(),
      },
    });
  }

  private constructor(props: IntegrationEventProps<WagerTransactionProcessedData>) {
    super(props);
  }
}

export interface WagerTransactionRejectedData {
  transactionId: string;
  walletId: string;
  playerId: string;
  providerId: string;
  externalTransactionId: string;
  kind: WagerTransactionKind;
  failureCode: FailureCode;
  money: MoneyProps;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
  readonly eventType = 'WagerTransactionRejected';
  readonly version = 1;

  static from(tx: WagerTransaction, ctx: EventContext, eventId: string): WagerTransactionRejected {
    return new WagerTransactionRejected({
      eventId,
      aggregateId: tx.id,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: new Date(),
      data: {
        transactionId: tx.id,
        walletId: tx.walletId,
        playerId: tx.playerId,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        kind: tx.kind,
        failureCode: tx.failureCode!,
        money: tx.money.toJSON(),
      },
    });
  }

  private constructor(props: IntegrationEventProps<WagerTransactionRejectedData>) {
    super(props);
  }
}

export interface WagerTransactionPendingReferenceData {
  transactionId: string;
  walletId: string;
  providerId: string;
  externalTransactionId: string;
  referenceExternalTransactionId: string;
  kind: WagerTransactionKind;
  retryCount: number;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  readonly eventType = 'WagerTransactionPendingReference';
  readonly version = 1;

  static from(tx: WagerTransaction, ctx: EventContext, eventId: string): WagerTransactionPendingReference {
    return new WagerTransactionPendingReference({
      eventId,
      aggregateId: tx.id,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: new Date(),
      data: {
        transactionId: tx.id,
        walletId: tx.walletId,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        referenceExternalTransactionId: tx.referenceExternalTransactionId!,
        kind: tx.kind,
        retryCount: tx.retryCount,
      },
    });
  }

  private constructor(props: IntegrationEventProps<WagerTransactionPendingReferenceData>) {
    super(props);
  }
}
