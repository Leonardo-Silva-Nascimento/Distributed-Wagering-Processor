import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SqsClientService } from '../../../infrastructure/messaging/sqs.client';

@Module({
  controllers: [HealthController],
  providers: [SqsClientService],
})
export class HealthModule {}
