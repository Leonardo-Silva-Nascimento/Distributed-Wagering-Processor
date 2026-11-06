import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { MikroORM } from '@mikro-orm/core';
import { SqsClientService } from '../../../infrastructure/messaging/sqs.client';

@Controller('health')
export class HealthController {
  constructor(
    private readonly orm: MikroORM,
    private readonly sqsClient: SqsClientService,
  ) {}

  @Get('live')
  liveness(@Res() res: FastifyReply): void {
    res.status(HttpStatus.OK).send({ status: 'ok' });
  }

  @Get('ready')
  async readiness(@Res() res: FastifyReply): Promise<void> {
    const checks: Record<string, string> = {};
    let healthy = true;

    // Check PostgreSQL
    try {
      await this.orm.em.getConnection().execute('SELECT 1');
      checks['postgres'] = 'ok';
    } catch {
      checks['postgres'] = 'unreachable';
      healthy = false;
    }

    // Check SQS / LocalStack
    try {
      const reachable = await this.sqsClient.isReachable();
      checks['sqs'] = reachable ? 'ok' : 'unreachable';
      if (!reachable) healthy = false;
    } catch {
      checks['sqs'] = 'unreachable';
      healthy = false;
    }

    const status = healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(status).send({ status: healthy ? 'ok' : 'degraded', checks });
  }
}
