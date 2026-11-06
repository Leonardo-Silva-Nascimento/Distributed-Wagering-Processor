const BASE_MS = 2_000;
const MAX_MS = 300_000; // 5 minutes

export function computeBackoffMs(retryCount: number): number {
  const jitter = Math.floor(Math.random() * 1_000);
  return Math.min(BASE_MS * Math.pow(2, retryCount) + jitter, MAX_MS);
}

export function computeNextRetryAt(retryCount: number, now: Date): Date {
  return new Date(now.getTime() + computeBackoffMs(retryCount));
}
