import { FailureCode } from './wager-transaction.kinds';

export class InvalidTransactionStateError extends Error {
  constructor(
    transactionId: string,
    currentStatus: string,
    attemptedTransition: string,
  ) {
    super(
      `Transaction ${transactionId} is in terminal state ${currentStatus} — cannot transition to ${attemptedTransition}`,
    );
    this.name = 'InvalidTransactionStateError';
  }
}

export class TransactionRejectedError extends Error {
  constructor(
    public readonly failureCode: FailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'TransactionRejectedError';
  }
}
