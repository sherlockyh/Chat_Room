import { HttpException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { subjectId } from '../../common/auth';
import { RedisService } from '../../infrastructure/redis.service';
import { ChatroomService } from '../chatroom/chatroom.service';
import { RoomEventDto, SendMessageDto } from './chat.dto';
import { ChatService } from './chat.service';
import type { ChatHistory } from '@prisma/client';

type ChatSocket = Socket & { data: { userId: number; expiresAt: number; authenticated: boolean } };

/** Socket.IO 使用握手 JWT；每次事件再次检查有效期和聊天室成员身份。 */
@WebSocketGateway({ maxHttpBufferSize: 32 * 1024 })
export class ChatGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);
  constructor(
    private readonly jwt: JwtService,
    private readonly chat: ChatService,
    private readonly rooms: ChatroomService,
    private readonly redis: RedisService,
  ) {}
  afterInit(server: Server) {
    // 握手中间件完成鉴权后才接收事件，避免异步连接回调造成鉴权竞态。
    server.use(async (client, next) => {
      try {
        const token: unknown = client.handshake.auth.token;
        if (typeof token !== 'string') throw new Error('缺少凭证');
        const payload = await this.jwt.verifyAsync<{ sub: number; exp: number }>(token);
        if (!Number.isFinite(payload.exp)) throw new Error('缺少有效期');
        client.data = {
          userId: subjectId(payload),
          expiresAt: payload.exp * 1000,
          authenticated: true,
        };
        next();
      } catch {
        next(Object.assign(new Error('登录凭证无效或已过期'), { data: { code: 'AUTH_EXPIRED' } }));
      }
    });
    server.on('connection', (client: ChatSocket) => {
      const timer = setTimeout(
        () => this.expire(client),
        Math.max(0, client.data.expiresAt - Date.now()),
      );
      timer.unref();
      client.once('disconnect', () => clearTimeout(timer));
    });
  }
  @SubscribeMessage('room:join')
  join(@ConnectedSocket() client: ChatSocket, @MessageBody() body: unknown) {
    return this.run(client, async () => {
      const dto = await this.parse(RoomEventDto, body);
      await this.rooms.assertMember(client.data.userId, dto.roomId);
      await client.join('room:' + dto.roomId);
      return null;
    });
  }
  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() client: ChatSocket, @MessageBody() body: unknown) {
    return this.run(client, async () => {
      const dto = await this.parse(RoomEventDto, body);
      await client.leave('room:' + dto.roomId);
      return null;
    });
  }
  @SubscribeMessage('message:send')
  send(@ConnectedSocket() client: ChatSocket, @MessageBody() body: unknown) {
    return this.run(client, async () => {
      const dto = await this.parse(SendMessageDto, body);
      const saved = await this.chat.send(client.data.userId, dto);
      // 先落库再广播；断线后的消息通过同步接口补齐。
      this.broadcast(saved);
      return saved;
    });
  }
  broadcast(saved: ChatHistory) {
    this.server.to('room:' + saved.roomId).emit('message:new', saved);
  }
  private async parse<T extends object>(type: new () => T, body: unknown): Promise<T> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('消息参数无效');
    const dto = plainToInstance(type, body);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length)
      throw new Error('消息参数无效');
    return dto;
  }
  private async run<T>(client: ChatSocket, action: () => Promise<T>) {
    try {
      if (!client.data.authenticated || Date.now() >= client.data.expiresAt) {
        this.expire(client);
        return { ok: false, error: '登录已失效' };
      }
      const key = 'socket:rate:' + client.data.userId + ':' + Math.floor(Date.now() / 1000);
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, 2);
      if (count > 20) return { ok: false, error: '操作太频繁，请稍后再试' };
      return { ok: true, data: await action() };
    } catch (error) {
      if (error instanceof HttpException) return { ok: false, error: error.message };
      if (error instanceof Error && error.message === '消息参数无效')
        return { ok: false, error: error.message };
      this.logger.error(error instanceof Error ? error.stack : error);
      return { ok: false, error: '操作失败，请稍后再试' };
    }
  }
  private expire(client: ChatSocket) {
    client.emit('session:expired');
    client.disconnect(true);
  }
}
