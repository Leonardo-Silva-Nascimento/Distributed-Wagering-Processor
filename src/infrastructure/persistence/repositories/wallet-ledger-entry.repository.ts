import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { WalletLedgerEntry } from '../../../domain/wallet-ledger-entry/wallet-ledger-entry.entity';
import { WalletLedgerEntryOrmEntity } from '../entities/wallet-ledger-entry.orm-entity';
import { LedgerDirection } from '../../../domain/wager-transaction/wager-transaction.kinds';
import { decodeCursor, encodeCursor } from '../../../shared/utils/cursor.util';
import { Money } from '../../../domain/value-objects/money.vo';

export interface LedgerPage {
  entries: WalletLedgerEntry[];
  nextCursor: string | null;
  total: number;
}

@Injectable()
export class WalletLedgerEntryRepository {
  constructor(private readonly em: EntityManager) {}

  async save(entry: WalletLedgerEntry): Promise<void> {
    const entity = this.em.create(WalletLedgerEntryOrmEntity, {
      id: entry.id,
      walletId: entry.walletId,
      transactionId: entry.transactionId,
      direction: entry.direction,
      money: { amount: entry.money.amount, currency: entry.money.currency },
      balanceBefore: {
        amount: entry.balanceBefore.amount,
        currency: entry.balanceBefore.currency,
      },
      balanceAfter: {
        amount: entry.balanceAfter.amount,
        currency: entry.balanceAfter.currency,
      },
      createdAt: entry.createdAt,
    });
    this.em.persist(entity);
  }

  async findByWalletId(
    walletId: string,
    cursor?: string,
    limit = 50,
  ): Promise<LedgerPage> {
    const knex = this.em.getKnex();

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const fetchLimit = safeLimit + 1;

    let query = knex('wallet_ledger_entries')
      .where('wallet_id', walletId)
      .orderBy([
        { column: 'created_at', order: 'desc' },
        { column: 'id', order: 'desc' },
      ])
      .limit(fetchLimit);

    if (cursor) {
      const decoded = decodeCursor(cursor);
      query = query.where(function () {
        this.where('created_at', '<', decoded.createdAt).orWhere(function () {
          this.where('created_at', '=', decoded.createdAt).andWhere('id', '<', decoded.id);
        });
      });
    }

    const rows: Record<string, unknown>[] = await query;
    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;

    const entries = pageRows.map((row) => this.rowToDomain(row));
    const lastRow = pageRows[pageRows.length - 1];

    const nextCursor =
      hasMore && lastRow
        ? encodeCursor({
            createdAt: new Date(lastRow['created_at'] as string | Date).toISOString(),
            id: lastRow['id'] as string,
          })
        : null;

    // Reconstruct total balance from ledger for reconciliation
    const totalResult = await knex('wallet_ledger_entries')
      .where('wallet_id', walletId)
      .count('* as total')
      .first();
    const total = parseInt(String((totalResult as Record<string, unknown>)['total'] ?? '0'), 10);

    return { entries, nextCursor, total };
  }

  async reconstructBalance(walletId: string, currency: string): Promise<Money> {
    const knex = this.em.getKnex();

    const result = await knex('wallet_ledger_entries')
      .where('wallet_id', walletId)
      .select(
        knex.raw(`
          SUM(
            CASE direction
              WHEN 'CREDIT' THEN CAST(money_amount AS NUMERIC)
              WHEN 'DEBIT'  THEN -CAST(money_amount AS NUMERIC)
            END
          ) as reconstructed
        `),
      )
      .first();

    const reconstructed = String(
      (result as Record<string, unknown>)['reconstructed'] ?? '0',
    );
    const decimal = parseFloat(reconstructed);
    return Money.from({
      amount: decimal.toFixed(2),
      currency,
    });
  }

  private rowToDomain(row: Record<string, unknown>): WalletLedgerEntry {
    const currency = row['money_currency'] as string;
    return WalletLedgerEntry.rehydrate({
      id: row['id'] as string,
      walletId: row['wallet_id'] as string,
      transactionId: row['transaction_id'] as string,
      direction: row['direction'] as LedgerDirection,
      moneyAmount: row['money_amount'] as string,
      moneyCurrency: currency,
      balanceBeforeAmount: row['balance_before_amount'] as string,
      balanceAfterAmount: row['balance_after_amount'] as string,
      currency,
      createdAt: new Date(row['created_at'] as string | Date),
    });
  }
}
