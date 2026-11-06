export interface LedgerCursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: LedgerCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(encoded: string): LedgerCursor {
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as LedgerCursor;
    if (!decoded.createdAt || !decoded.id) {
      throw new Error('Invalid cursor fields');
    }
    return decoded;
  } catch {
    throw new Error(`Invalid cursor: ${encoded}`);
  }
}
