import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { SqsClientService } from './sqs.client';
import { WageringService } from '../../application/wagering/wagering.service';
import { InboxMessageRepository } from '../persistence/repositories/inbox-message.repository';
import { WagerTransactionRepository } from '../persistence/repositories/wager-transaction.repository';
import { WalletRepository } from '../persistence/repositories/wallet.repository';
import { WalletLedgerEntryRepository } from '../persistence/repositories/wallet-ledger-entry.repository';
import { OutboxMessageRepository } from '../persistence/repositories/outbox-message.repository';
import { InboxMessage } from '../../domain/messaging/inbox-message.entity';
import { computePayloadHash } from '../../shared/utils/payload-hash.util';
import { WagerTransactionKind } from '../../domain/wager-transaction/wager-transaction.kinds';

interface WagerTransactionRequestedMessage {
  messageId: string;
  type: string;
  occurredAt: string;
  data: {
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: string;
    money: { amount: string; currency: string };
    referenceExternalTransactionId?: string;
  };
}

const CONSUMER_NAME = 'sqs-wager-consumer';

@Injectable()
export class SqsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumerService.name);
  private shutdown = false;
  private activeLoops = 0;
  private readonly concurrency: number;

  constructor(
    private readonly orm: MikroORM,
    private readonly sqsClient: SqsClientService,
    private readonly configService: ConfigService,
  ) {
    this.concurrency = this.configService.get<number>('sqsConsumerConcurrency', 3);
  }

  onModuleInit(): void {
    for (let i = 0; i < this.concurrency; i++) {
      this.startLoop(i);
    }
  }

  onModuleDestroy(): void {
    this.shutdown = true;
  }

  private async startLoop(index: number): Promise<void> {
    this.activeLoops++;
    this.logger.log(`SQS consumer loop ${index} started`);

    while (!this.shutdown) {
      try {
        await this.pollOnce();
      } catch (err) {
        this.logger.error({ loop: index, err }, 'SQS consumer loop error');
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    this.activeLoops--;
    this.logger.log(`SQS consumer loop ${index} stopped`);
  }

  private async pollOnce(): Promise<void> {
    const messages = await this.sqsClient.receiveMessages(10, 20);

    await Promise.allSettled(
      messages.map((msg) => this.processMessage(msg.messageId, msg.receiptHandle, msg.body)),
    );
  }

  private async processMessage(
    sqsMessageId: string,
    receiptHandle: string,
    rawBody: string,
  ): Promise<void> {
    let parsed: WagerTransactionRequestedMessage;

    try {
      parsed = JSON.parse(rawBody) as WagerTransactionRequestedMessage;
    } catch {
      this.logger.error({ sqsMessageId, rawBody: rawBody.slice(0, 200) }, 'Failed to parse SQS message body');
      await this.sqsClient.deleteMessage(receiptHandle);
      return;
    }

    const { data } = parsed;
    const payloadHash = computePayloadHash({
      providerId: data.providerId,
      externalTransactionId: data.externalTransactionId,
      walletId: data.walletId,
      playerId: data.playerId,
      kind: data.kind,
      amount: data.money.amount,
      currency: data.money.currency,
      roundId: data.roundId,
      gameId: data.gameId,
      ...(data.referenceExternalTransactionId
        ? { referenceExternalTransactionId: data.referenceExternalTransactionId }
        : {}),
    });

    const em = this.orm.em.fork() as EntityManager;

    try {
      await em.transactional(async () => {
        const inboxRepo = new InboxMessageRepository(em);

        // Deduplication by sqsMessageId (transport-level)
        const inbox = InboxMessage.receive({
          messageId: sqsMessageId,
          consumerName: CONSUMER_NAME,
          payloadHash,
          idempotencyKey: data.idempotencyKey,
          receivedAt: new Date(),
        });

        const inserted = await inboxRepo.insertIfNotExists(inbox);
        if (!inserted) {
          // Already processed — safe to ack
          this.logger.debug({ sqsMessageId }, 'SQS message already processed (transport dedup)');
          return;
        }

        // Process the wagering transaction
        const txRepo = new WagerTransactionRepository(em);
        const walletRepo = new WalletRepository(em);
        const ledgerRepo = new WalletLedgerEntryRepository(em);
        const outboxRepo = new OutboxMessageRepository(em);

        const service = new WageringService(em, walletRepo, txRepo, ledgerRepo, inboxRepo, outboxRepo);

        await service.process({
          idempotencyKey: data.idempotencyKey,
          providerId: data.providerId,
          externalTransactionId: data.externalTransactionId,
          playerId: data.playerId,
          walletId: data.walletId,
          roundId: data.roundId,
          gameId: data.gameId,
          kind: data.kind as WagerTransactionKind,
          amount: data.money.amount,
          currency: data.money.currency,
          referenceExternalTransactionId: data.referenceExternalTransactionId,
          correlationId: sqsMessageId,
        });

        await inboxRepo.markProcessed(sqsMessageId, new Date());
      });

      // Ack ONLY after successful commit
      await this.sqsClient.deleteMessage(receiptHandle);
      this.logger.debug({ sqsMessageId }, 'SQS message processed and acked');
    } catch (err) {
      const isBusinessError = this.isTerminalBusinessError(err);

      if (isBusinessError) {
        // Terminal business error — ack it, don't retry
        this.logger.warn(
          { sqsMessageId, err },
          'Business rule rejection — acking message',
        );
        await this.sqsClient.deleteMessage(receiptHandle);
      } else {
        // Transient error — do NOT ack, let SQS redeliver
        this.logger.error(
          { sqsMessageId, err },
          'Transient error processing SQS message — will redeliver',
        );
      }
    }
  }

  private isTerminalBusinessError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const status = (err as { status?: number }).status;
    // 4xx errors are business errors (except 429 Too Many Requests)
    return typeof status === 'number' && status >= 400 && status < 500 && status !== 429;
  }
}
