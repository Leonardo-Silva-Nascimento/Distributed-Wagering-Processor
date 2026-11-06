import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Wallet } from '../../../domain/wallet/wallet.aggregate';
import { WalletOrmEntity } from '../entities/wallet.orm-entity';

@Injectable()
export class WalletRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletOrmEntity, { id });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdWithLock(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(
      WalletOrmEntity,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    return entity ? this.toDomain(entity) : null;
  }

  async findByPlayerAndCurrency(playerId: string, currency: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletOrmEntity, { playerId, currency });
    return entity ? this.toDomain(entity) : null;
  }

  async save(wallet: Wallet): Promise<void> {
    const existing = await this.em.findOne(WalletOrmEntity, { id: wallet.id });

    if (existing) {
      existing.balance = {
        amount: wallet.balance.amount,
        currency: wallet.currency,
      };
      existing.version = wallet.version;
      existing.updatedAt = wallet.updatedAt;
      this.em.persist(existing);
    } else {
      const entity = this.em.create(WalletOrmEntity, {
        id: wallet.id,
        playerId: wallet.playerId,
        currency: wallet.currency,
        balance: {
          amount: wallet.balance.amount,
          currency: wallet.currency,
        },
        version: wallet.version,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      });
      this.em.persist(entity);
    }
  }

  private toDomain(entity: WalletOrmEntity): Wallet {
    return Wallet.rehydrate({
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balanceAmount: entity.balance.amount,
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }
}
