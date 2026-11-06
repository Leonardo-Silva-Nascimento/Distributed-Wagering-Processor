export const sqsConfig = () => ({
  sqs: {
    region: process.env['AWS_REGION'] ?? 'us-east-1',
    endpoint: process.env['AWS_ENDPOINT_URL'] ?? 'http://localhost:4566',
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? 'test',
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? 'test',
    wageringQueueUrl:
      process.env['SQS_WAGERING_QUEUE_URL'] ??
      'http://localhost:4566/000000000000/wager-transactions.fifo',
    wageringDlqUrl:
      process.env['SQS_WAGERING_DLQ_URL'] ??
      'http://localhost:4566/000000000000/wager-transactions-dlq.fifo',
    maxReceiveCount: parseInt(process.env['SQS_MAX_RECEIVE_COUNT'] ?? '3', 10),
  },
});
