import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './infrastructure/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  // 生产仅通过容器内网 Nginx 访问，因此只信任最近一层代理。
  if (config.get('NODE_ENV') === 'production')
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.getOrThrow<string>('WEB_ORIGIN') });
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Chat Room API')
      .setDescription('聊天室基础接口；实时事件契约见 packages/shared 和 README。')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  const ioAdapter = new RedisIoAdapter(
    app,
    config.getOrThrow<string>('REDIS_URL'),
    config.getOrThrow<string>('WEB_ORIGIN'),
  );
  await ioAdapter.connect();
  app.useWebSocketAdapter(ioAdapter);
  const port = Number(config.get('PORT', 3000));
  await app.listen(port, '0.0.0.0');
  Logger.log('API: http://localhost:' + port + '/api，Swagger: /api/docs', 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error, undefined, 'Bootstrap');
  process.exit(1);
});
