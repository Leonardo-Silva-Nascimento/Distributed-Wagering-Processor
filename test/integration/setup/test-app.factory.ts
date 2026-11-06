import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { AppModule } from '../../../src/app.module';
import { GlobalExceptionFilter } from '../../../src/infrastructure/http/filters/domain-exception.filter';
import { runMigrations } from './test-db.helper';

let app: NestFastifyApplication | null = null;
let migrationsRun = false;

export async function createTestApp(): Promise<NestFastifyApplication> {
  if (app) return app;

  const created = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  const orm = created.get(MikroORM);

  if (!migrationsRun) {
    await runMigrations(orm);
    migrationsRun = true;
  }

  created.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  created.useGlobalFilters(new GlobalExceptionFilter());

  created.use((_req: unknown, _res: unknown, next: () => void) => {
    RequestContext.create(orm.em, next);
  });

  await created.init();

  app = created;
  return created;
}

export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
    migrationsRun = false;
  }
}
