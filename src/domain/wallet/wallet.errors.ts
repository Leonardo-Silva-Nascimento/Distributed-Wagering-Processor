export class InsufficientFundsError extends Error {
  constructor(
    public readonly walletId: string,
    public readonly requested: string,
    public readonly available: string,
  ) {
    super(
      `Insufficient funds in wallet ${walletId}: requested ${requested}, available ${available}`,
    );
    this.name = 'InsufficientFundsError';
  }
}

export class WalletCurrencyMismatchError extends Error {
  constructor(walletCurrency: string, operationCurrency: string) {
    super(
      `Wallet currency ${walletCurrency} does not match operation currency ${operationCurrency}`,
    );
    this.name = 'WalletCurrencyMismatchError';
  }
}

export class WalletAlreadyExistsError extends Error {
  constructor(playerId: string, currency: string) {
    super(`Wallet already exists for player ${playerId} with currency ${currency}`);
    this.name = 'WalletAlreadyExistsError';
  }
}
