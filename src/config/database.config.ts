export const databaseConfig = () => ({
  database: {
    host: process.env['DB_HOST'] ?? 'localhost',
    port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
    name: process.env['DB_NAME'] ?? 'wagering',
    user: process.env['DB_USER'] ?? 'wagering',
    password: process.env['DB_PASSWORD'] ?? 'wagering',
  },
});
