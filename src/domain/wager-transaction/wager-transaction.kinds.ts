export enum WagerTransactionKind {
  Opening = 'OPENING',
  Bet = 'BET',
  Win = 'WIN',
  Loss = 'LOSS',
  Refund = 'REFUND',
  Rollback = 'ROLLBACK',
}

export enum WagerTransactionStatus {
  Pending = 'PENDING',
  PendingReference = 'PENDING_REFERENCE',
  Processed = 'PROCESSED',
  Rejected = 'REJECTED',
  Failed = 'FAILED',
}

export enum LedgerDirection {
  Debit = 'DEBIT',
  Credit = 'CREDIT',
}

export enum FailureCode {
  InsufficientFunds = 'INSUFFICIENT_FUNDS',
  ReferenceNotFound = 'REFERENCE_NOT_FOUND',
  ReferenceAlreadyReversed = 'REFERENCE_ALREADY_REVERSED',
  ReferenceNotProcessed = 'REFERENCE_NOT_PROCESSED',
  InvalidReferenceKind = 'INVALID_REFERENCE_KIND',
  CrossWalletReference = 'CROSS_WALLET_REFERENCE',
  CrossProviderReference = 'CROSS_PROVIDER_REFERENCE',
  CrossRoundReference = 'CROSS_ROUND_REFERENCE',
  CurrencyMismatch = 'CURRENCY_MISMATCH',
  AmountMismatch = 'AMOUNT_MISMATCH',
  DuplicatePayload = 'DUPLICATE_PAYLOAD',
  InternalIdConflict = 'INTERNAL_ID_CONFLICT',
  ReferenceExhausted = 'REFERENCE_EXHAUSTED',
  NegativeBalanceOnReversal = 'NEGATIVE_BALANCE_ON_REVERSAL',
  WalletNotFound = 'WALLET_NOT_FOUND',
}
