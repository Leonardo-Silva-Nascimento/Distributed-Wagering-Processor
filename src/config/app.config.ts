export const appConfig = () => ({
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  pendingReferenceMaxRetries: parseInt(
    process.env['PENDING_REFERENCE_MAX_RETRIES'] ?? '10',
    10,
  ),
  sqsConsumerConcurrency: parseInt(process.env['SQS_CONSUMER_CONCURRENCY'] ?? '3', 10),
  outboxPollIntervalMs: parseInt(process.env['OUTBOX_POLL_INTERVAL_MS'] ?? '1000', 10),
  pendingReferencePollIntervalMs: parseInt(
    process.env['PENDING_REFERENCE_POLL_INTERVAL_MS'] ?? '5000',
    10,
  ),
});
