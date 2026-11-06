// This file runs before any test module imports, setting env vars for test DB/SQS
process.env['NODE_ENV'] = 'test';
process.env['DB_HOST'] = 'localhost';
process.env['DB_PORT'] = '5433';
process.env['DB_NAME'] = 'wagering_test';
process.env['DB_USER'] = 'wagering';
process.env['DB_PASSWORD'] = 'wagering';
process.env['AWS_REGION'] = 'us-east-1';
process.env['AWS_ENDPOINT_URL'] = 'http://localhost:4567';
process.env['AWS_ACCESS_KEY_ID'] = 'test';
process.env['AWS_SECRET_ACCESS_KEY'] = 'test';
process.env['SQS_WAGERING_QUEUE_URL'] = 'http://localhost:4567/000000000000/wager-transactions.fifo';
process.env['SQS_WAGERING_DLQ_URL'] = 'http://localhost:4567/000000000000/wager-transactions-dlq.fifo';
process.env['LOG_LEVEL'] = 'error';
process.env['OUTBOX_POLL_INTERVAL_MS'] = '999999';
process.env['PENDING_REFERENCE_POLL_INTERVAL_MS'] = '999999';
process.env['SQS_CONSUMER_CONCURRENCY'] = '0';
