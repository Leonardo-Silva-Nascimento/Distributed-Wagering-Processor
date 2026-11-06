import { Module } from '@nestjs/common';
import { SqsClientService } from './sqs.client';
import { OutboxPublisherService } from './outbox-publisher.service';
import { SqsConsumerService } from './sqs-consumer.service';
import { PendingReferenceWorkerService } from './pending-reference-worker.service';

@Module({
  providers: [
    SqsClientService,
    OutboxPublisherService,
    SqsConsumerService,
    PendingReferenceWorkerService,
  ],
  exports: [SqsClientService],
})
export class MessagingModule {}
