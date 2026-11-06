import { IsString, IsNotEmpty, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { WagerTransactionKind } from '../../../../domain/wager-transaction/wager-transaction.kinds';
import { MoneyDto } from '../../../http/wallets/dto/create-wallet.dto';

export class CreateWagerTransactionDto {
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @IsString()
  @IsNotEmpty()
  externalTransactionId!: string;

  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsString()
  @IsNotEmpty()
  roundId!: string;

  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @IsEnum(WagerTransactionKind)
  kind!: WagerTransactionKind;

  @ValidateNested()
  @Type(() => MoneyDto)
  money!: MoneyDto;

  @IsString()
  @IsOptional()
  referenceExternalTransactionId?: string;
}
