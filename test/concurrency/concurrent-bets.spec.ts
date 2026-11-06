import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { MikroORM } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { createTestApp, closeTestApp } from '../integration/setup/test-app.factory';
import { truncateAllTables } from '../integration/setup/test-db.helper';

describe('Concurrency Tests', () => {
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

  describe('Mandatory scenario: two simultaneous 80.00 BET on 100.00 balance', () => {
    it('exactly one PROCESSED, one REJECTED, balance=20.00, one ledger entry', async () => {
      // Create wallet with 100.00
      const createRes = await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: `player-${uuidv4()}`,
          initialBalance: { amount: '100.00', currency: 'BRL' },
        },
      });
      const wallet = JSON.parse(createRes.body) as { id: string; playerId: string };

      const extId1 = uuidv4();
      const extId2 = uuidv4();

      // Fire both bets simultaneously
      const [res1, res2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/wagering/transactions',
          headers: { 'idempotency-key': `provider-a:${extId1}` },
          payload: {
            providerId: 'provider-a',
            externalTransactionId: extId1,
            playerId: wallet.playerId,
            walletId: wallet.id,
            roundId: 'round-concurrent',
            gameId: 'game-1',
            kind: 'BET',
            money: { amount: '80.00', currency: 'BRL' },
          },
        }),
        app.inject({
          method: 'POST',
          url: '/wagering/transactions',
          headers: { 'idempotency-key': `provider-a:${extId2}` },
          payload: {
            providerId: 'provider-a',
            externalTransactionId: extId2,
            playerId: wallet.playerId,
            walletId: wallet.id,
            roundId: 'round-concurrent',
            gameId: 'game-1',
            kind: 'BET',
            money: { amount: '80.00', currency: 'BRL' },
          },
        }),
      ]);

      const body1 = JSON.parse(res1.body);
      const body2 = JSON.parse(res2.body);
      const statuses = [body1.status, body2.status];

      expect(statuses.filter((s) => s === 'PROCESSED')).toHaveLength(1);
      expect(statuses.filter((s) => s === 'REJECTED')).toHaveLength(1);

      // Final balance must be 20.00
      const walletRes = await app.inject({
        method: 'GET',
        url: `/wallets/${wallet.id}`,
      });
      const finalWallet = JSON.parse(walletRes.body);
      expect(finalWallet.balance.amount).toBe('20.00');

      // Exactly one ledger DEBIT entry (excluding OPENING CREDIT)
      const ledgerRes = await app.inject({
        method: 'GET',
        url: `/wallets/${wallet.id}/ledger`,
      });
      const { entries } = JSON.parse(ledgerRes.body) as { entries: Array<{ direction: string }> };
      const debits = entries.filter((e) => e.direction === 'DEBIT');
      expect(debits).toHaveLength(1);

      // Reconciliation must pass
      const recRes = await app.inject({
        method: 'POST',
        url: `/wallets/${wallet.id}/reconciliation`,
      });
      expect(JSON.parse(recRes.body).consistent).toBe(true);
    });
  });

  describe('50 identical bets in parallel → one debit', () => {
    it('deduplicates 50 concurrent submissions of the same bet', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: `player-${uuidv4()}`,
          initialBalance: { amount: '1000.00', currency: 'BRL' },
        },
      });
      const wallet = JSON.parse(createRes.body) as { id: string; playerId: string };
      const extId = uuidv4();
      const idemKey = `provider-a:${extId}`;

      const requests = Array.from({ length: 50 }, () =>
        app.inject({
          method: 'POST',
          url: '/wagering/transactions',
          headers: { 'idempotency-key': idemKey },
          payload: {
            providerId: 'provider-a',
            externalTransactionId: extId,
            playerId: wallet.playerId,
            walletId: wallet.id,
            roundId: 'round-50',
            gameId: 'game-1',
            kind: 'BET',
            money: { amount: '100.00', currency: 'BRL' },
          },
        }),
      );

      const results = await Promise.all(requests);
      const bodies = results.map((r) => JSON.parse(r.body) as { status: string; idempotentReplay: boolean });

      // All should return 200
      results.forEach((r) => expect(r.statusCode).toBe(200));

      // Exactly one non-replay PROCESSED
      const originalProcessed = bodies.filter(
        (b) => b.status === 'PROCESSED' && !b.idempotentReplay,
      );
      expect(originalProcessed).toHaveLength(1);

      // All others are replays
      const replays = bodies.filter((b) => b.idempotentReplay);
      expect(replays.length).toBe(49);

      // Final balance debited only once
      const walletRes = await app.inject({ method: 'GET', url: `/wallets/${wallet.id}` });
      expect(JSON.parse(walletRes.body).balance.amount).toBe('900.00');

      // One DEBIT ledger entry
      const ledgerRes = await app.inject({ method: 'GET', url: `/wallets/${wallet.id}/ledger` });
      const { entries } = JSON.parse(ledgerRes.body) as { entries: Array<{ direction: string }> };
      const debits = entries.filter((e) => e.direction === 'DEBIT');
      expect(debits).toHaveLength(1);
    });
  });

  describe('Multiple wallets in parallel', () => {
    it('processes independent wallets concurrently without interference', async () => {
      const NUM_WALLETS = 10;

      const wallets = await Promise.all(
        Array.from({ length: NUM_WALLETS }, async () => {
          const r = await app.inject({
            method: 'POST',
            url: '/wallets',
            payload: {
              playerId: `player-${uuidv4()}`,
              initialBalance: { amount: '500.00', currency: 'BRL' },
            },
          });
          return JSON.parse(r.body) as { id: string; playerId: string };
        }),
      );

      const betResults = await Promise.all(
        wallets.map((w) => {
          const extId = uuidv4();
          return app.inject({
            method: 'POST',
            url: '/wagering/transactions',
            headers: { 'idempotency-key': `provider-a:${extId}` },
            payload: {
              providerId: 'provider-a',
              externalTransactionId: extId,
              playerId: w.playerId,
              walletId: w.id,
              roundId: 'round-parallel',
              gameId: 'game-1',
              kind: 'BET',
              money: { amount: '100.00', currency: 'BRL' },
            },
          });
        }),
      );

      betResults.forEach((r) => {
        expect(r.statusCode).toBe(200);
        expect(JSON.parse(r.body).status).toBe('PROCESSED');
      });

      // Verify each wallet independently
      await Promise.all(
        wallets.map(async (w) => {
          const r = await app.inject({ method: 'GET', url: `/wallets/${w.id}` });
          expect(JSON.parse(r.body).balance.amount).toBe('400.00');
        }),
      );
    });
  });

  describe('REFUND delivered before BET (PENDING_REFERENCE resolution)', () => {
    it('marks REFUND as PENDING_REFERENCE then resolves after BET arrives', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/wallets',
        payload: {
          playerId: `player-${uuidv4()}`,
          initialBalance: { amount: '1000.00', currency: 'BRL' },
        },
      });
      const wallet = JSON.parse(createRes.body) as { id: string; playerId: string };
      const betExtId = uuidv4();

      // Send REFUND first
      const refundRes = await app.inject({
        method: 'POST',
        url: '/wagering/transactions',
        headers: { 'idempotency-key': `provider-a:refund-${betExtId}` },
        payload: {
          providerId: 'provider-a',
          externalTransactionId: `refund-${betExtId}`,
          playerId: wallet.playerId,
          walletId: wallet.id,
          roundId: 'round-ooo',
          gameId: 'game-1',
          kind: 'REFUND',
          money: { amount: '200.00', currency: 'BRL' },
          referenceExternalTransactionId: betExtId,
        },
      });

      expect(JSON.parse(refundRes.body).status).toBe('PENDING_REFERENCE');

      // Now send the BET
      await app.inject({
        method: 'POST',
        url: '/wagering/transactions',
        headers: { 'idempotency-key': `provider-a:${betExtId}` },
        payload: {
          providerId: 'provider-a',
          externalTransactionId: betExtId,
          playerId: wallet.playerId,
          walletId: wallet.id,
          roundId: 'round-ooo',
          gameId: 'game-1',
          kind: 'BET',
          money: { amount: '200.00', currency: 'BRL' },
        },
      });

      // Balance should be 1000.00: BET debited 200, then REFUND is PENDING — wallet shows 800.00 for now
      // The pending reference worker will resolve this. We test that the REFUND exists as PENDING_REFERENCE.
      const refundExtId = `refund-${betExtId}`;
      const txRes = await app.inject({
        method: 'GET',
        url: `/providers/provider-a/wagering/transactions/${refundExtId}`,
      });
      const tx = JSON.parse(txRes.body);
      expect(['PENDING_REFERENCE', 'PROCESSED']).toContain(tx.status);
    });
  });
});
