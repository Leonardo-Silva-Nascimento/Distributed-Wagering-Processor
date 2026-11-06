import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { MikroORM } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { createTestApp, closeTestApp } from './setup/test-app.factory';
import { truncateAllTables } from './setup/test-db.helper';

describe('Wagering API (integration)', () => {
  let app: NestFastifyApplication;
  let orm: MikroORM;
  let walletId: string;

  const createWallet = async (amount = '1000.00') => {
    const res = await app.inject({
      method: 'POST',
      url: '/wallets',
      payload: {
        playerId: `player-${uuidv4()}`,
        initialBalance: { amount, currency: 'BRL' },
      },
    });
    return JSON.parse(res.body) as { id: string; playerId: string; balance: { amount: string; currency: string } };
  };

  const submitTransaction = async (params: {
    walletId: string;
    playerId: string;
    kind: string;
    amount?: string;
    idempotencyKey?: string;
    referenceExternalTransactionId?: string;
    externalTransactionId?: string;
  }) => {
    const extId = params.externalTransactionId ?? uuidv4();
    const idemKey = params.idempotencyKey ?? `provider-a:${extId}`;
    return app.inject({
      method: 'POST',
      url: '/wagering/transactions',
      headers: { 'idempotency-key': idemKey },
      payload: {
        providerId: 'provider-a',
        externalTransactionId: extId,
        playerId: params.playerId,
        walletId: params.walletId,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: params.kind,
        money: { amount: params.amount ?? '25.00', currency: 'BRL' },
        ...(params.referenceExternalTransactionId
          ? { referenceExternalTransactionId: params.referenceExternalTransactionId }
          : {}),
      },
    });
  };

  beforeAll(async () => {
    app = await createTestApp();
    orm = app.get(MikroORM);
  }, 60_000);

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await truncateAllTables(orm);
    const w = await createWallet('1000.00');
    walletId = w.id;
  });

  describe('BET', () => {
    it('debits wallet on successful BET', async () => {
      const wallet = await createWallet('1000.00');
      const extId = uuidv4();
      const res = await submitTransaction({
        walletId: wallet.id,
        playerId: wallet.playerId ?? 'player-bet',
        kind: 'BET',
        amount: '100.00',
        externalTransactionId: extId,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('PROCESSED');
      expect(body.balance.amount).toBe('900.00');
      expect(body.idempotentReplay).toBe(false);
    });

    it('rejects BET when insufficient funds', async () => {
      const wallet = await createWallet('50.00');
      const res = await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'BET',
        amount: '100.00',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('REJECTED');
      expect(body.failureCode).toBe('INSUFFICIENT_FUNDS');
    });

    it('returns idempotent replay for same key + payload', async () => {
      const wallet = await createWallet('1000.00');
      const extId = uuidv4();
      const idemKey = `provider-a:${extId}`;

      await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'BET',
        amount: '100.00',
        externalTransactionId: extId,
        idempotencyKey: idemKey,
      });

      const res2 = await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'BET',
        amount: '100.00',
        externalTransactionId: extId,
        idempotencyKey: idemKey,
      });

      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.body).idempotentReplay).toBe(true);
    });

    it('returns 409 for idempotency key with different payload', async () => {
      const wallet = await createWallet('1000.00');
      const extId = uuidv4();
      const idemKey = `provider-a:${extId}`;

      await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'BET',
        amount: '100.00',
        externalTransactionId: extId,
        idempotencyKey: idemKey,
      });

      // Same idempotency key, different amount
      const res2 = await app.inject({
        method: 'POST',
        url: '/wagering/transactions',
        headers: { 'idempotency-key': idemKey },
        payload: {
          providerId: 'provider-a',
          externalTransactionId: extId,
          playerId: 'p',
          walletId: wallet.id,
          roundId: 'round-1',
          gameId: 'game-1',
          kind: 'BET',
          money: { amount: '200.00', currency: 'BRL' }, // Different amount!
        },
      });

      expect(res2.statusCode).toBe(409);
    });
  });

  describe('WIN', () => {
    it('credits wallet on WIN', async () => {
      const wallet = await createWallet('1000.00');
      const res = await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'WIN',
        amount: '50.00',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('PROCESSED');
      expect(body.balance.amount).toBe('1050.00');
    });
  });

  describe('LOSS', () => {
    it('does not change balance on LOSS', async () => {
      const wallet = await createWallet('1000.00');
      const res = await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'LOSS',
        amount: '100.00',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('PROCESSED');
      expect(body.balance.amount).toBe('1000.00');
    });

    it('LOSS does not create ledger entry', async () => {
      const wallet = await createWallet('1000.00');
      await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'LOSS',
        amount: '100.00',
      });

      const ledgerRes = await app.inject({
        method: 'GET',
        url: `/wallets/${wallet.id}/ledger`,
      });
      const { entries } = JSON.parse(ledgerRes.body);
      // Only the OPENING entry should exist
      const lossEntries = entries.filter((e: { direction: string }) => e.direction === 'DEBIT');
      expect(lossEntries).toHaveLength(0);
    });
  });

  describe('REFUND', () => {
    it('credits wallet by reversing a BET', async () => {
      const wallet = await createWallet('1000.00');
      const betExtId = uuidv4();

      // Place BET
      await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'BET',
        amount: '200.00',
        externalTransactionId: betExtId,
      });

      // REFUND the BET
      const refundRes = await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'REFUND',
        amount: '200.00',
        referenceExternalTransactionId: betExtId,
      });

      expect(refundRes.statusCode).toBe(200);
      const body = JSON.parse(refundRes.body);
      expect(body.status).toBe('PROCESSED');
      expect(body.balance.amount).toBe('1000.00');
    });

    it('rejects double REFUND on same BET', async () => {
      const wallet = await createWallet('1000.00');
      const betExtId = uuidv4();

      await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'BET',
        amount: '100.00',
        externalTransactionId: betExtId,
      });

      await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'REFUND',
        amount: '100.00',
        referenceExternalTransactionId: betExtId,
      });

      const res2 = await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'REFUND',
        amount: '100.00',
        referenceExternalTransactionId: betExtId,
      });

      expect(JSON.parse(res2.body).failureCode).toBe('REFERENCE_ALREADY_REVERSED');
    });

    it('handles REFUND before BET (PENDING_REFERENCE)', async () => {
      const wallet = await createWallet('1000.00');
      const betExtId = uuidv4();

      // Send REFUND before BET exists
      const refundRes = await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'REFUND',
        amount: '100.00',
        referenceExternalTransactionId: betExtId,
      });

      expect(refundRes.statusCode).toBe(200);
      expect(JSON.parse(refundRes.body).status).toBe('PENDING_REFERENCE');
    });
  });

  describe('ROLLBACK', () => {
    it('rolls back a BET (credits wallet)', async () => {
      const wallet = await createWallet('1000.00');
      const betExtId = uuidv4();

      await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'BET',
        amount: '300.00',
        externalTransactionId: betExtId,
      });

      const rbRes = await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'ROLLBACK',
        amount: '300.00',
        referenceExternalTransactionId: betExtId,
      });

      expect(rbRes.statusCode).toBe(200);
      expect(JSON.parse(rbRes.body).balance.amount).toBe('1000.00');
    });

    it('rolls back a WIN (debits wallet)', async () => {
      const wallet = await createWallet('1000.00');
      const winExtId = uuidv4();

      await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'WIN',
        amount: '500.00',
        externalTransactionId: winExtId,
      });

      const rbRes = await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'ROLLBACK',
        amount: '500.00',
        referenceExternalTransactionId: winExtId,
      });

      expect(rbRes.statusCode).toBe(200);
      expect(JSON.parse(rbRes.body).balance.amount).toBe('1000.00');
    });
  });

  describe('ledger consistency invariant', () => {
    it('wallet.balance == reconstructed ledger balance', async () => {
      const wallet = await createWallet('1000.00');
      const betExtId = uuidv4();
      const winExtId = uuidv4();

      await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'BET',
        amount: '200.00',
        externalTransactionId: betExtId,
      });

      await submitTransaction({
        walletId: wallet.id,
        playerId: 'p',
        kind: 'WIN',
        amount: '100.00',
        externalTransactionId: winExtId,
      });

      const recRes = await app.inject({
        method: 'POST',
        url: `/wallets/${wallet.id}/reconciliation`,
      });

      const rec = JSON.parse(recRes.body);
      expect(rec.consistent).toBe(true);
      expect(rec.storedBalance.amount).toBe('900.00');
      expect(rec.calculatedBalance.amount).toBe('900.00');
    });
  });
});
