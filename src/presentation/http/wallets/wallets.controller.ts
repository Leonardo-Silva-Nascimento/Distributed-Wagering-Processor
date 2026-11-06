import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { WalletService } from '../../../application/wallet/wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateWalletDto, @Req() req: FastifyRequest) {
    const correlationId = (req.headers['x-correlation-id'] as string) ?? uuidv4();
    return this.walletService.createWallet({
      playerId: dto.playerId,
      initialBalance: dto.initialBalance,
      correlationId,
    });
  }

  @Get(':walletId')
  async getWallet(@Param('walletId') walletId: string) {
    return this.walletService.getWallet(walletId);
  }

  @Get(':walletId/ledger')
  async getLedger(
    @Param('walletId') walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const page = await this.walletService.getLedger(walletId, cursor, parsedLimit);

    return {
      entries: page.entries.map((e) => ({
        id: e.id,
        walletId: e.walletId,
        transactionId: e.transactionId,
        direction: e.direction,
        money: e.money.toJSON(),
        balanceBefore: e.balanceBefore.toJSON(),
        balanceAfter: e.balanceAfter.toJSON(),
        createdAt: e.createdAt,
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  @Post(':walletId/reconciliation')
  @HttpCode(HttpStatus.OK)
  async reconcile(@Param('walletId') walletId: string) {
    return this.walletService.reconcile(walletId);
  }
}
