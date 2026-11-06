import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { OutboxMessageRepository } from '../persistence/repositories/outbox-message.repository';
import { SqsClientService } from './sqs.client';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly orm: MikroORM,
    private readonly sqsClient: SqsClientService,
    private readonly configService: ConfigService,
  ) {
    this.pollIntervalMs = this.configService.get<number>('outboxPollIntervalMs', 1000);
  }

  onModuleInit(): void {
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => this.runOnce(), this.pollIntervalMs);
  }

  private async runOnce(): Promise<void> {
    if (this.running) {
      this.scheduleNext();
      return;
    }
    this.running = true;

    try {
      const em = this.orm.em.fork() as EntityManager;
      const outboxRepo = new OutboxMessageRepository(em);
      const now = new Date();

      // FOR UPDATE SKIP LOCKED ensures multiple publisher pods don't double-publish
      const pending = await em.transactional(() => outboxRepo.findDuePending(now, 100));

      let published = 0;
      let failed = 0;

      for (const message of pending) {
        try {
          const body = JSON.stringify(message.payload);
          await this.sqsClient.sendMessage(
            this.sqsClient.getWageringQueueUrl(),
            body,
            message.aggregateId,
          );

          await em.transactional(async () => {
            await outboxRepo.markPublished(message.id, new Date());
          });

          published++;
        } catch (err) {
          this.logger.error({ messageId: message.id, err }, 'Failed to publish outbox message');
          const retryAt = new Date(Date.now() + 5000 * Math.pow(2, message.attempts));
          await em.transactional(async () => {
            await outboxRepo.scheduleRetry(message.id, message.attempts + 1, retryAt);
          });
          failed++;
        }
      }

      if (published > 0 || failed > 0) {
        this.logger.log({ published, failed }, 'Outbox publisher cycle complete');
      }
    } catch (err) {
      this.logger.error({ err }, 'OutboxPublisher error');
    } finally {
      this.running = false;
      this.scheduleNext();
    }
  }
}
