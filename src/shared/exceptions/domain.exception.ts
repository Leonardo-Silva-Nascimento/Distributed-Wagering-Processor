import { HttpException, HttpStatus } from '@nestjs/common';
import { FailureCode } from '../../domain/wager-transaction/wager-transaction.kinds';

export class DomainException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus,
    public readonly failureCode?: FailureCode | string,
  ) {
    super({ message, failureCode, error: 'DomainError' }, statusCode);
  }
}

export class InsufficientFundsException extends DomainException {
  constructor(walletId: string, requested: string, available: string) {
    super(
      `Insufficient funds: requested ${requested}, available ${available}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      FailureCode.InsufficientFunds,
    );
  }
}

export class WalletNotFoundException extends DomainException {
  constructor(walletId: string) {
    super(`Wallet not found: ${walletId}`, HttpStatus.NOT_FOUND, FailureCode.WalletNotFound);
  }
}

export class WalletAlreadyExistsException extends DomainException {
  constructor(playerId: string, currency: string) {
    super(
      `Wallet already exists for player ${playerId} with currency ${currency}`,
      HttpStatus.CONFLICT,
      'WALLET_ALREADY_EXISTS',
    );
  }
}

export class TransactionNotFoundException extends DomainException {
  constructor(id: string) {
    super(`Transaction not found: ${id}`, HttpStatus.NOT_FOUND, 'TRANSACTION_NOT_FOUND');
  }
}

export class IdempotencyConflictException extends DomainException {
  constructor(idempotencyKey: string) {
    super(
      `Idempotency key ${idempotencyKey} was used with a different payload`,
      HttpStatus.CONFLICT,
      FailureCode.DuplicatePayload,
    );
  }
}

export class ReferenceNotFoundException extends DomainException {
  constructor(referenceExternalId: string) {
    super(
      `Reference transaction not found: ${referenceExternalId}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      FailureCode.ReferenceNotFound,
    );
  }
}

export class ReferenceAlreadyReversedException extends DomainException {
  constructor(referenceExternalId: string) {
    super(
      `Reference transaction ${referenceExternalId} has already been reversed`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      FailureCode.ReferenceAlreadyReversed,
    );
  }
}

export class InvalidReferenceKindException extends DomainException {
  constructor(kind: string, referenceKind: string) {
    super(
      `${kind} cannot reference a ${referenceKind} transaction`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      FailureCode.InvalidReferenceKind,
    );
  }
}

export class CurrencyMismatchException extends DomainException {
  constructor(expected: string, actual: string) {
    super(
      `Currency mismatch: expected ${expected}, got ${actual}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      FailureCode.CurrencyMismatch,
    );
  }
}

export class AmountMismatchException extends DomainException {
  constructor(expected: string, actual: string) {
    super(
      `Amount mismatch: reversal amount ${actual} must equal reference amount ${expected}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      FailureCode.AmountMismatch,
    );
  }
}

export class NegativeBalanceOnReversalException extends DomainException {
  constructor() {
    super(
      'Reversal would produce negative balance',
      HttpStatus.UNPROCESSABLE_ENTITY,
      FailureCode.NegativeBalanceOnReversal,
    );
  }
}
