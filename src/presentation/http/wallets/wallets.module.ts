import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletService } from '../../../application/wallet/wallet.service';
import { WalletRepository } from '../../../infrastructure/persistence/repositories/wallet.repository';
import { WagerTransactionRepository } from '../../../infrastructure/persistence/repositories/wager-transaction.repository';
import { WalletLedgerEntryRepository } from '../../../infrastructure/persistence/repositories/wallet-ledger-entry.repository';
import { OutboxMessageRepository } from '../../../infrastructure/persistence/repositories/outbox-message.repository';

@Module({
  controllers: [WalletsController],
  providers: [
    WalletService,
    WalletRepository,
    WagerTransactionRepository,
    WalletLedgerEntryRepository,
    OutboxMessageRepository,
  ],
  exports: [WalletService],
})
export class WalletsModule {}
