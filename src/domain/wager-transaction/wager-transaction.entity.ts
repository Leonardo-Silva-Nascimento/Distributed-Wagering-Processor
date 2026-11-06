import { Money } from '../value-objects/money.vo';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
  LedgerDirection,
  FailureCode,
} from './wager-transaction.kinds';
import { InvalidTransactionStateError } from './wager-transaction.errors';

export interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
}

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  moneyAmount: string;
  moneyCurrency: string;
  referenceExternalTransactionId?: string;
  referenceTransactionId?: string;
  status: WagerTransactionStatus;
  failureCode?: FailureCode;
  processedAt?: Date;
  retryCount: number;
  nextRetryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TERMINAL_STATUSES = new Set([
  WagerTransactionStatus.Processed,
  WagerTransactionStatus.Rejected,
  WagerTransactionStatus.Failed,
]);

const KINDS_REQUIRING_REFERENCE = new Set([
  WagerTransactionKind.Refund,
  WagerTransactionKind.Rollback,
]);

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: WagerTransactionStatus,
    private _referenceTransactionId?: string,
    private _failureCode?: FailureCode,
    private _processedAt?: Date,
    private _retryCount: number = 0,
    private _nextRetryAt?: Date,
    private _updatedAt?: Date,
  ) {}

  static create(props: CreateWagerTransactionProps): WagerTransaction {
    const requiresRef = KINDS_REQUIRING_REFERENCE.has(props.kind);
    if (requiresRef && !props.referenceExternalTransactionId) {
      throw new Error(
        `Transaction kind ${props.kind} requires referenceExternalTransactionId`,
      );
    }

    if (props.kind === WagerTransactionKind.Opening) {
      throw new Error('OPENING transactions cannot be created via this factory');
    }

    const now = new Date();
    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      now,
      WagerTransactionStatus.Pending,
      undefined,
      undefined,
      undefined,
      0,
      undefined,
      now,
    );
  }

  static createOpening(props: Omit<CreateWagerTransactionProps, 'kind' | 'referenceExternalTransactionId'>): WagerTransaction {
    const now = new Date();
    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      WagerTransactionKind.Opening,
      props.money,
      undefined,
      now,
      WagerTransactionStatus.Pending,
      undefined,
      undefined,
      undefined,
      0,
      undefined,
      now,
    );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      Money.from({ amount: state.moneyAmount, currency: state.moneyCurrency }),
      state.referenceExternalTransactionId,
      state.createdAt,
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.processedAt,
      state.retryCount,
      state.nextRetryAt,
      state.updatedAt,
    );
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): FailureCode | undefined {
    return this._failureCode;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  get retryCount(): number {
    return this._retryCount;
  }

  get nextRetryAt(): Date | undefined {
    return this._nextRetryAt;
  }

  get updatedAt(): Date | undefined {
    return this._updatedAt;
  }

  markProcessed(referenceTransactionId: string | undefined, at: Date): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(this.id, this._status, 'PROCESSED');
    }
    this._status = WagerTransactionStatus.Processed;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = at;
    this._updatedAt = at;
  }

  markPendingReference(nextRetryAt: Date, at: Date): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(this.id, this._status, 'PENDING_REFERENCE');
    }
    this._status = WagerTransactionStatus.PendingReference;
    this._nextRetryAt = nextRetryAt;
    this._retryCount += 1;
    this._updatedAt = at;
  }

  incrementRetry(nextRetryAt: Date, at: Date): void {
    if (this._status !== WagerTransactionStatus.PendingReference) {
      throw new InvalidTransactionStateError(this.id, this._status, 'retry-increment');
    }
    this._nextRetryAt = nextRetryAt;
    this._retryCount += 1;
    this._updatedAt = at;
  }

  reject(code: FailureCode, at: Date): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(this.id, this._status, 'REJECTED');
    }
    this._status = WagerTransactionStatus.Rejected;
    this._failureCode = code;
    this._updatedAt = at;
  }

  fail(code: FailureCode, at: Date): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(this.id, this._status, 'FAILED');
    }
    this._status = WagerTransactionStatus.Failed;
    this._failureCode = code;
    this._updatedAt = at;
  }

  isTerminal(): boolean {
    return TERMINAL_STATUSES.has(this._status);
  }

  affectsBalance(): boolean {
    return this.kind !== WagerTransactionKind.Loss;
  }

  requiresReference(): boolean {
    return KINDS_REQUIRING_REFERENCE.has(this.kind);
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Opening:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Rollback: {
        if (!reference) {
          throw new Error('ROLLBACK requires a reference transaction to determine ledger direction');
        }
        // Rollback inverts the direction of the reference
        const refDirection = reference.ledgerDirectionFor();
        return refDirection === LedgerDirection.Debit ? LedgerDirection.Credit : LedgerDirection.Debit;
      }
      case WagerTransactionKind.Loss:
        throw new Error('LOSS transactions do not produce ledger entries');
    }
  }
}
