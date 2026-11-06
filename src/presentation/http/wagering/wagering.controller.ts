import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { WageringService } from '../../../application/wagering/wagering.service';
import { WagerTransactionRepository } from '../../../infrastructure/persistence/repositories/wager-transaction.repository';
import { CreateWagerTransactionDto } from './dto/create-wager-transaction.dto';
import { WagerTransactionKind } from '../../../domain/wager-transaction/wager-transaction.kinds';

@Controller()
export class WageringController {
  constructor(
    private readonly wageringService: WageringService,
    private readonly txRepo: WagerTransactionRepository,
  ) {}

  @Post('wagering/transactions')
  @HttpCode(HttpStatus.OK)
  async submitTransaction(
    @Body() dto: CreateWagerTransactionDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: FastifyRequest,
  ) {
    if (!idempotencyKey) {
      throw new UnprocessableEntityException('Idempotency-Key header is required');
    }

    const correlationId = (req.headers['x-correlation-id'] as string) ?? uuidv4();

    return this.wageringService.process({
      idempotencyKey,
      providerId: dto.providerId,
      externalTransactionId: dto.externalTransactionId,
      playerId: dto.playerId,
      walletId: dto.walletId,
      roundId: dto.roundId,
      gameId: dto.gameId,
      kind: dto.kind as WagerTransactionKind,
      amount: dto.money.amount,
      currency: dto.money.currency,
      referenceExternalTransactionId: dto.referenceExternalTransactionId,
      correlationId,
    });
  }

  @Get('wagering/transactions/:transactionId')
  async getTransaction(@Param('transactionId') transactionId: string) {
    const tx = await this.txRepo.findById(transactionId);
    if (!tx) {
      throw new UnprocessableEntityException(`Transaction not found: ${transactionId}`);
    }
    return {
      transactionId: tx.id,
      status: tx.status,
      kind: tx.kind,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      walletId: tx.walletId,
      playerId: tx.playerId,
      roundId: tx.roundId,
      money: tx.money.toJSON(),
      failureCode: tx.failureCode,
      processedAt: tx.processedAt,
      createdAt: tx.createdAt,
    };
  }

  @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
  async getTransactionByExternalId(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    const tx = await this.txRepo.findByProviderAndExternalId(providerId, externalTransactionId);
    if (!tx) {
      throw new UnprocessableEntityException(
        `Transaction not found: provider=${providerId}, externalId=${externalTransactionId}`,
      );
    }
    return {
      transactionId: tx.id,
      status: tx.status,
      kind: tx.kind,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      walletId: tx.walletId,
      playerId: tx.playerId,
      roundId: tx.roundId,
      money: tx.money.toJSON(),
      failureCode: tx.failureCode,
      processedAt: tx.processedAt,
      createdAt: tx.createdAt,
    };
  }
}
