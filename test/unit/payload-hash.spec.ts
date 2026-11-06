import { describe, it, expect } from 'vitest';
import { computePayloadHash } from '../../src/shared/utils/payload-hash.util';

describe('computePayloadHash', () => {
  it('produces the same hash for identical payloads', () => {
    const payload = { a: '1', b: '2', c: '3' };
    expect(computePayloadHash(payload)).toBe(computePayloadHash(payload));
  });

  it('produces different hashes for different payloads', () => {
    const a = { amount: '10.00', kind: 'BET' };
    const b = { amount: '20.00', kind: 'BET' };
    expect(computePayloadHash(a)).not.toBe(computePayloadHash(b));
  });

  it('is deterministic regardless of key order', () => {
    const a = { kind: 'BET', amount: '10.00' };
    const b = { amount: '10.00', kind: 'BET' };
    expect(computePayloadHash(a)).toBe(computePayloadHash(b));
  });

  it('produces 64-character hex string (SHA-256)', () => {
    const hash = computePayloadHash({ test: 'value' });
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('nested objects are canonicalized', () => {
    const a = { money: { currency: 'BRL', amount: '5.00' } };
    const b = { money: { amount: '5.00', currency: 'BRL' } };
    expect(computePayloadHash(a)).toBe(computePayloadHash(b));
  });
});
