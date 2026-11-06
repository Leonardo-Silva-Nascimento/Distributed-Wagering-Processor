import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { sqsConfig } from './config/sqs.config';
import { WalletsModule } from './presentation/http/wallets/wallets.module';
import { WageringModule } from './presentation/http/wagering/wagering.module';
import { HealthModule } from './presentation/http/health/health.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import mikroOrmConfig from './infrastructure/persistence/mikro-orm.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, sqsConfig],
    }),
    MikroOrmModule.forRoot(mikroOrmConfig),
    WalletsModule,
    WageringModule,
    HealthModule,
    MessagingModule,
  ],
})
export class AppModule {}
