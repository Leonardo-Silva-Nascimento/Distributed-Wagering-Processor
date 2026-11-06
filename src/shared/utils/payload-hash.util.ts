import { createHash } from 'crypto';

/**
 * Computes a stable SHA-256 hash over a canonical JSON representation of the payload.
 * Only business-significant fields are included; transport metadata (headers, messageId) is excluded.
 * Keys are sorted alphabetically to ensure determinism regardless of object property ordering.
 */
export function computePayloadHash(payload: Record<string, unknown>): string {
  const canonical = canonicalize(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';

  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }

  if (typeof value === 'object') {
    const sorted = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalize((value as Record<string, unknown>)[key]));
    return '{' + sorted.join(',') + '}';
  }

  return JSON.stringify(value);
}
