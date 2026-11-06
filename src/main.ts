import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './infrastructure/http/filters/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: process.env['LOG_LEVEL'] ?? 'info',
      },
    }),
  );

  // Run pending migrations on startup
  const orm = app.get(MikroORM);
  await orm.getMigrator().up();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  // RequestContext middleware for per-request EntityManager scoping
  const { RequestContext } = await import('@mikro-orm/core');
  app.use((_req: unknown, _res: unknown, next: () => void) => {
    RequestContext.create(orm.em, next);
  });

  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`Application running on port ${port}`);

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received — shutting down gracefully');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch(console.error);
