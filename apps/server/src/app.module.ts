import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { AuthGuard } from './common/auth';
import { HttpThrottlerGuard } from './common/http-throttler.guard';
import { validateEnv } from './config/env';
import { HealthController } from './health.controller';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { UserModule } from './modules/user/user.module';
import { FriendshipModule } from './modules/friendship/friendship.module';
import { ChatroomModule } from './modules/chatroom/chatroom.module';
import { ChatModule } from './modules/chat/chat.module';
import { FavoriteModule } from './modules/favorite/favorite.module';
import { FriendRequestModule } from './modules/friend-request/friend-request.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnv }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    InfrastructureModule,
    UserModule,
    FriendshipModule,
    ChatroomModule,
    ChatModule,
    FavoriteModule,
    FriendRequestModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
