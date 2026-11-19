const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { Module, Global, ValidationPipe } = require('@nestjs/common');
const { NestFactory, APP_GUARD, APP_FILTER } = require('@nestjs/core');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const { ThrottlerModule } = require('@nestjs/throttler');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
const { io } = require('socket.io-client');
const { UserModule } = require('../dist/modules/user/user.module');
const { ChatroomModule } = require('../dist/modules/chatroom/chatroom.module');
const { ChatModule } = require('../dist/modules/chat/chat.module');
const { FriendshipModule } = require('../dist/modules/friendship/friendship.module');
const { FavoriteModule } = require('../dist/modules/favorite/favorite.module');
const { FriendRequestModule } = require('../dist/modules/friend-request/friend-request.module');
const { AuthGuard } = require('../dist/common/auth');
const { HttpThrottlerGuard } = require('../dist/common/http-throttler.guard');
const { ApiExceptionFilter } = require('../dist/common/api-exception.filter');
const { PrismaService } = require('../dist/infrastructure/prisma.service');
const { RedisService } = require('../dist/infrastructure/redis.service');
const { StorageService } = require('../dist/infrastructure/storage.service');
const { validateEnv } = require('../dist/config/env');
const { CaptchaService } = require('../dist/modules/user/captcha.service');
const { randomUUID } = require('node:crypto');

// 使用内存仓储隔离外部依赖；覆盖真实 Nest 路由、JWT、DTO 和 Socket.IO 链路。
const users = [];
const histories = [];
const rooms = [];
const captchaStore = new Map();
const redisClient = {
  incr: async () => 1,
  expire: async () => 1,
  set: async (key, value, mode, ttl) => {
    assert.equal(mode, 'EX');
    assert.equal(ttl, 300);
    captchaStore.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    return 'OK';
  },
  getdel: async (key) => {
    const entry = captchaStore.get(key);
    captchaStore.delete(key);
    return entry && entry.expiresAt > Date.now() ? entry.value : null;
  },
};
function select(value, fields) {
  return fields ? Object.fromEntries(Object.keys(fields).map((key) => [key, value[key]])) : value;
}
const prisma = {
  $transaction: async function (work) {
    return work(this);
  },
  $queryRaw: async () => [],
  user: {
    create: async ({ data, select: fields }) => {
      const user = { ...data, id: users.length + 1, avatar: null };
      users.push(user);
      return select(user, fields);
    },
    findUnique: async ({ where, select: fields }) => {
      const user = users.find((item) =>
        where.id ? item.id === where.id : item.username === where.username,
      );
      return user ? select(user, fields) : null;
    },
  },
  chatroom: {
    findUnique: async ({ where }) => {
      const room = rooms.find((item) => item.id === where.id);
      return room ? { ...room, type: 'GROUP' } : null;
    },
    create: async ({ data }) => {
      const room = {
        id: rooms.length + 1,
        ownerId: data.ownerId,
        name: data.name,
        createdAt: new Date(),
        members: [{ userId: data.ownerId }],
        _count: { members: 1 },
      };
      rooms.push(room);
      return room;
    },
  },
  userChatroom: {
    findUnique: async ({ where }) => {
      const { userId, roomId } = where.userId_roomId;
      return (
        rooms
          .find((room) => room.id === roomId)
          ?.members.find((member) => member.userId === userId) ?? null
      );
    },
  },
  chatHistory: {
    findUnique: async ({ where: { senderId_clientMessageId: key } }) =>
      histories.find(
        (row) => row.senderId === key.senderId && row.clientMessageId === key.clientMessageId,
      ) ?? null,
    findFirst: async ({ where: { roomId } }) =>
      histories.findLast((row) => row.roomId === roomId) ?? null,
    create: async ({ data }) => {
      const item = {
        ...data,
        id: histories.length + 1,
        createdAt: new Date(),
        sender: select(
          users.find((user) => user.id === data.senderId),
          { id: true, username: true, nickname: true, avatar: true },
        ),
      };
      histories.push(item);
      return item;
    },
    findMany: async ({ where, orderBy, take }) =>
      histories
        .filter(
          ({ roomId, id }) =>
            roomId === where.roomId &&
            id > (where.id?.gt ?? 0) &&
            id <= (where.id?.lte ?? Infinity) &&
            id < (where.id?.lt ?? Infinity),
        )
        .sort((a, b) => (orderBy.id === 'asc' ? a.id - b.id : b.id - a.id))
        .slice(0, take),
  },
};

class TestInfrastructure {}
Global()(TestInfrastructure);
Module({
  providers: [
    { provide: PrismaService, useValue: prisma },
    { provide: RedisService, useValue: { client: redisClient } },
    { provide: StorageService, useValue: { client: {}, bucket: 'test' } },
  ],
  exports: [PrismaService, RedisService, StorageService],
})(TestInfrastructure);
class TestApp {}
Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: 'test-secret-at-least-thirty-two-characters',
      signOptions: { expiresIn: '1h' },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    TestInfrastructure,
    UserModule,
    ChatroomModule,
    ChatModule,
    FriendshipModule,
    FavoriteModule,
    FriendRequestModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})(TestApp);

let app;
let url;
let owner;
let outsider;
let room;
let ownerCaptcha;
const clients = [];
async function request(path, body, token) {
  const response = await fetch(url + '/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
async function issueCaptcha() {
  const response = await request('/users/captcha');
  assert.equal(response.status, 200);
  const captchaId = response.data.captchaId;
  // 答案仅从测试仓储替身获取，不通过 HTTP 接口泄露。
  return { captchaId, captchaCode: captchaStore.get('register:captcha:' + captchaId).value };
}
function connect(token) {
  const client = io(url, { transports: ['websocket'], auth: { token }, reconnection: false });
  clients.push(client);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket 连接超时')), 3000);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
function emit(client, event, body) {
  return new Promise((resolve, reject) =>
    client
      .timeout(3000)
      .emit(event, body, (error, result) => (error ? reject(error) : resolve(result))),
  );
}
before(async () => {
  app = await NestFactory.create(TestApp, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});
after(async () => {
  clients.forEach((client) => client.disconnect());
  await app?.close();
});

test('配置缺失时拒绝启动', () => assert.throws(() => validateEnv({}), /DATABASE_URL/));
test('未登录不能读取用户资料', async () => assert.equal((await request('/users/me')).status, 401));
test('图形验证码接口匿名可用、不缓存且不返回答案', async () => {
  const response = await request('/users/captcha');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(response.data).sort(), ['captchaId', 'expiresIn', 'image']);
  assert.equal(response.data.expiresIn, 300);
  assert.match(response.data.captchaId, /^[a-f0-9-]{36}$/);
  const svg = Buffer.from(response.data.image.split(',')[1], 'base64').toString();
  assert.match(svg, /^<svg/);
  assert.match(svg, /<path/);
  assert.doesNotMatch(svg, /<text/);
});
test('验证码过期、错误、复用与并发消费校验', async () => {
  const service = app.get(CaptchaService);
  const missingId = randomUUID();
  await assert.rejects(service.verify(missingId, 'ABCD'), /验证码错误或已过期/);
  const wrongId = randomUUID();
  captchaStore.set('register:captcha:' + wrongId, {
    value: 'a2bc',
    expiresAt: Date.now() + 300000,
  });
  await assert.rejects(service.verify(wrongId, 'XXXX'), /验证码错误或已过期/);
  await assert.rejects(service.verify(wrongId, 'A2BC'), /验证码错误或已过期/);
  const expiredId = randomUUID();
  captchaStore.set('register:captcha:' + expiredId, { value: 'a2bc', expiresAt: Date.now() - 1 });
  await assert.rejects(service.verify(expiredId, 'A2BC'), /验证码错误或已过期/);
  const validId = randomUUID();
  captchaStore.set('register:captcha:' + validId, {
    value: 'a2bc',
    expiresAt: Date.now() + 300000,
  });
  const results = await Promise.allSettled([
    service.verify(validId, 'A2BC'),
    service.verify(validId, 'a2bc'),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
});
test('注册、登录与密码散列', async () => {
  const bad = await request('/users/register', {
    username: 'alice',
    password: 'password123',
    nickname: '小林',
  });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.message.includes('请先获取图形验证码'));
  assert.equal(users.length, 0);
  ownerCaptcha = await issueCaptcha();
  const registered = await request('/users/register', {
    username: 'alice',
    password: 'password123',
    nickname: '小林',
    ...ownerCaptcha,
    captchaCode: ownerCaptcha.captchaCode.toUpperCase(),
  });
  assert.equal(registered.status, 201);
  owner = registered.data;
  assert.equal(owner.user.passwordHash, undefined);
  assert.notEqual(users[0].passwordHash, 'password123');
  assert.equal(
    (await request('/users/login', { username: 'alice', password: 'wrongpassword' })).status,
    401,
  );
  assert.equal(
    (await request('/users/login', { username: 'alice', password: 'password123' })).status,
    200,
  );
  outsider = (
    await request('/users/register', {
      username: 'bobby',
      password: 'password123',
      nickname: '小周',
      ...(await issueCaptcha()),
    })
  ).data;
});
test('注册接口拒绝已消费和错误的验证码，且不写入用户', async () => {
  const replay = await request('/users/register', {
    username: 'carol',
    password: 'password123',
    nickname: '小陈',
    ...ownerCaptcha,
  });
  assert.equal(replay.status, 400);
  assert.match(replay.data.message, /验证码错误或已过期/);
  const challenge = await issueCaptcha();
  const wrong = await request('/users/register', {
    username: 'carol',
    password: 'password123',
    nickname: '小陈',
    ...challenge,
    captchaCode: '0000',
  });
  assert.equal(wrong.status, 400);
  assert.equal(users.length, 2);
  assert.equal(captchaStore.has('register:captcha:' + challenge.captchaId), false);
});
test('创建聊天室及历史消息访问权限', async () => {
  const result = await request('/chatrooms', { name: '测试聊天室' }, owner.accessToken);
  assert.equal(result.status, 201);
  room = result.data;
  assert.equal(
    (await request('/chat/rooms/' + room.id + '/messages', undefined, outsider.accessToken)).status,
    403,
  );
  assert.equal(
    (await request('/chat/rooms/' + room.id + '/messages?limit=1000', undefined, owner.accessToken))
      .status,
    400,
  );
});
test('Swagger 包含六个模块和登录请求字段', () => {
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
  for (const path of [
    '/api/users/login',
    '/api/users/captcha',
    '/api/friendships',
    '/api/chatrooms',
    '/api/chat/rooms/{roomId}/messages',
    '/api/favorites',
    '/api/friend-requests',
  ])
    assert.ok(doc.paths[path], path);
  assert.ok(doc.components.schemas.LoginDto.properties.password);
  assert.ok(doc.components.schemas.RegisterDto.required.includes('captchaId'));
  assert.ok(doc.components.schemas.RegisterDto.required.includes('captchaCode'));
});
test('Socket 握手拒绝无效及过期 JWT', async () => {
  await assert.rejects(connect('invalid'), /登录凭证/);
  const token = app.get(JwtService).sign({ sub: 1 }, { expiresIn: -1 });
  await assert.rejects(connect(token), /登录凭证/);
});
test('Socket 成员校验、参数校验、落库与广播', async () => {
  const ownerSocket = await connect(owner.accessToken);
  const outsiderSocket = await connect(outsider.accessToken);
  assert.equal((await emit(outsiderSocket, 'room:join', { roomId: room.id })).ok, false);
  assert.equal(
    (await emit(outsiderSocket, 'message:send', { roomId: room.id, content: '越权消息' })).ok,
    false,
  );
  assert.equal((await emit(ownerSocket, 'room:join', { roomId: room.id })).ok, true);
  assert.equal(
    (await emit(ownerSocket, 'message:send', { roomId: room.id, content: '   ' })).ok,
    false,
  );
  const broadcast = new Promise((resolve) => ownerSocket.once('message:new', resolve));
  const result = await emit(ownerSocket, 'message:send', {
    roomId: room.id,
    content: '你好，聊天室',
  });
  assert.equal(result.ok, true);
  assert.equal((await broadcast).id, result.data.id);
  assert.equal(histories.length, 1);
  const history = await request(
    '/chat/rooms/' + room.id + '/messages',
    undefined,
    owner.accessToken,
  );
  assert.equal(history.data[0].content, '你好，聊天室');
  assert.equal((await emit(ownerSocket, 'room:leave', { roomId: room.id })).ok, true);
});

test('同步接口限制会话成员和游标边界，兼容原历史数组', async () => {
  const path = '/chat/rooms/' + room.id + '/messages';
  assert.equal(
    (await request(path + '/sync?after=0', undefined, outsider.accessToken)).status,
    403,
  );
  for (const query of ['', '?after=-1', '?after=5&through=4', '?after=0&limit=101']) {
    assert.equal((await request(path + '/sync' + query, undefined, owner.accessToken)).status, 400);
  }
  const history = await request(path, undefined, owner.accessToken);
  const synced = await request(path + '/sync?after=0', undefined, owner.accessToken);
  assert.deepEqual(synced.data, {
    items: history.data,
    through: history.data[0].id,
    nextAfter: null,
  });
});

test('JWT 到期会主动结束已入房但不发送事件的连接', async () => {
  const token = app.get(JwtService).sign({ sub: owner.user.id }, { expiresIn: 3 });
  const client = await connect(token);
  assert.equal((await emit(client, 'room:join', { roomId: room.id })).ok, true);
  let expired = false;
  client.once('session:expired', () => (expired = true));
  const reason = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('未在到期时断开连接')), 4500);
    client.once('disconnect', (reason) => {
      clearTimeout(timer);
      resolve(reason);
    });
  });
  assert.equal(reason, 'io server disconnect');
  assert.equal(expired, true);
});
