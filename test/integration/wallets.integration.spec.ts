import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { MikroORM } from '@mikro-orm/core';
import { createTestApp, closeTestApp } from './setup/test-app.factory';
import { truncateAllTables } from './setup/test-db.helper';

describe('Wallets API (integration)', () => {
  let app: NestFastifyApplication;
  let orm: MikroORM;

  beforeAll(async () => {
    app = await createTestApp();
    orm = app.get(MikroORM);
  }, 60_000);

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await truncateAllTables(orm);
  });

  describe('POST /wallets', () => {
    it('creates a wallet with initial balance', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: 'player-1',
          initialBalance: { amount: '1000.00', currency: 'BRL' },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.playerId).toBe('player-1');
      expect(body.balance.amount).toBe('1000.00');
      expect(body.balance.currency).toBe('BRL');
      expect(body.version).toBe(1);
      expect(body.id).toBeDefined();
    });

    it('creates wallet with zero balance', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: 'player-2',
          initialBalance: { amount: '0.00', currency: 'BRL' },
        },
      });

      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).balance.amount).toBe('0.00');
    });

    it('returns 409 for duplicate playerId + currency', async () => {
      await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: 'player-dup',
          initialBalance: { amount: '100.00', currency: 'BRL' },
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: 'player-dup',
          initialBalance: { amount: '200.00', currency: 'BRL' },
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it('allows same player with different currency', async () => {
      await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: 'player-mc',
          initialBalance: { amount: '100.00', currency: 'BRL' },
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: 'player-mc',
          initialBalance: { amount: '100.00', currency: 'USD' },
        },
      });

      expect(res.statusCode).toBe(201);
    });

    it('creates an OPENING transaction + ledger entry for non-zero balance', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: 'player-ledger',
          initialBalance: { amount: '500.00', currency: 'BRL' },
        },
      });
      const { id: walletId } = JSON.parse(createRes.body);

      const ledgerRes = await app.inject({
        method: 'GET',
        url: `/wallets/${walletId}/ledger`,
      });

      expect(ledgerRes.statusCode).toBe(200);
      const { entries } = JSON.parse(ledgerRes.body);
      expect(entries).toHaveLength(1);
      expect(entries[0].direction).toBe('CREDIT');
      expect(entries[0].money.amount).toBe('500.00');
      expect(entries[0].balanceBefore.amount).toBe('0.00');
      expect(entries[0].balanceAfter.amount).toBe('500.00');
    });
  });

  describe('GET /wallets/:walletId', () => {
    it('returns wallet by id', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: 'player-get',
          initialBalance: { amount: '100.00', currency: 'BRL' },
        },
      });
      const { id } = JSON.parse(createRes.body);

      const res = await app.inject({ method: 'GET', url: `/wallets/${id}` });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).id).toBe(id);
    });

    it('returns 404 for unknown wallet', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/wallets/00000000-0000-0000-0000-000000000000',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /wallets/:walletId/reconciliation', () => {
    it('reports consistent when balance matches ledger', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: 'player-rec',
          initialBalance: { amount: '100.00', currency: 'BRL' },
        },
      });
      const { id: walletId } = JSON.parse(createRes.body);

      const res = await app.inject({
        method: 'POST',
        url: `/wallets/${walletId}/reconciliation`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.consistent).toBe(true);
      expect(body.difference.amount).toBe('0.00');
      expect(body.storedBalance.amount).toBe('100.00');
      expect(body.calculatedBalance.amount).toBe('100.00');
    });
  });
});
