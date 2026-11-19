import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';

/** Redis 同步房间广播；使用 WebSocket 传输。 */
export class RedisIoAdapter extends IoAdapter {
  private pub: Redis;
  private sub: Redis;
  private adapterFactory: ReturnType<typeof createAdapter>;
  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
    private readonly origin: string,
  ) {
    super(app);
  }
  async connect() {
    this.pub = new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    this.sub = this.pub.duplicate({ lazyConnect: true });
    await Promise.all([this.pub.connect(), this.sub.connect()]);
    this.adapterFactory = createAdapter(this.pub, this.sub);
  }
  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
      cors: { origin: this.origin },
    }) as Server;
    server.adapter(this.adapterFactory);
    return server;
  }
  async dispose() {
    this.pub?.disconnect();
    this.sub?.disconnect();
    await super.dispose();
  }
}
