import { Module } from '@nestjs/common';
import { WageringController } from './wagering.controller';
import { WageringService } from '../../../application/wagering/wagering.service';
import { WagerTransactionRepository } from '../../../infrastructure/persistence/repositories/wager-transaction.repository';
import { WalletRepository } from '../../../infrastructure/persistence/repositories/wallet.repository';
import { WalletLedgerEntryRepository } from '../../../infrastructure/persistence/repositories/wallet-ledger-entry.repository';
import { InboxMessageRepository } from '../../../infrastructure/persistence/repositories/inbox-message.repository';
import { OutboxMessageRepository } from '../../../infrastructure/persistence/repositories/outbox-message.repository';

@Module({
  controllers: [WageringController],
  providers: [
    WageringService,
    WagerTransactionRepository,
    WalletRepository,
    WalletLedgerEntryRepository,
    InboxMessageRepository,
    OutboxMessageRepository,
  ],
  exports: [WageringService, WagerTransactionRepository],
})
export class WageringModule {}
