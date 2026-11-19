// 使用本机真实 MySQL、Redis、MinIO；可通过 Nginx 验证完整部署链路。
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { Client } = require('minio');
const Redis = require('ioredis');
const { io } = require('socket.io-client');
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
if (env.NODE_ENV === 'production') throw new Error('此脚本仅用于本地开发环境');
const base = process.env.CHAT_TEST_BASE_URL || 'http://127.0.0.1:' + (env.PORT || '3000');
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const storage = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: Number(env.MINIO_PORT),
  useSSL: env.MINIO_USE_SSL === 'true',
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
const prefix = 'it_' + randomBytes(5).toString('hex');
const users = [];
const clients = [];

async function api(method, path, user, body, expected = 200) {
  const response = await fetch(base + '/api' + path, {
    method,
    headers: {
      ...(user ? { Authorization: 'Bearer ' + user.token } : {}),
      ...(!(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, expected, method + ' ' + path + ': ' + JSON.stringify(data));
  return data;
}
function socket(user, endpoint = base) {
  const client = io(endpoint, {
    transports: ['websocket'],
    auth: { token: user.token },
    reconnection: false,
  });
  clients.push(client);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('实时连接超时')), 5000);
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
function emit(client, event, data) {
  return new Promise((resolve, reject) =>
    client
      .timeout(5000)
      .emit(event, data, (error, result) => (error ? reject(error) : resolve(result))),
  );
}
function nextMessage(client) {
  return new Promise((resolve, reject) => {
    const handler = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      client.off('message:new', handler);
      reject(new Error('未收到消息广播'));
    }, 5000);
    client.once('message:new', handler);
  });
}
function fileBody(id, data, name, mime) {
  const body = new FormData();
  body.append('clientMessageId', id);
  body.append('file', new Blob([data], { type: mime }), name);
  return body;
}
async function befriend(sender, receiver) {
  const request = await api(
    'POST',
    '/friend-requests',
    sender,
    { receiverId: receiver.id, message: '一起聊天吧' },
    201,
  );
  await api('PATCH', '/friend-requests/' + request.id, receiver, { status: 'ACCEPTED' });
  return request;
}
async function main() {
  try {
    const health = await api('GET', '/health/ready');
    assert.equal(health.status, 'ok');
    const swagger = await fetch(base + '/api/docs-json');
    assert.equal(swagger.status, 200);
    assert.ok((await swagger.json()).paths['/api/chat/rooms/{roomId}/files']);
    if (process.env.CHAT_TEST_BASE_URL) {
      const home = await fetch(base + '/');
      assert.equal(home.status, 200);
      const html = await home.text();
      for (const path of [
        '/login',
        '/chat',
        '/chatrooms',
        '/friendships',
        '/favorites',
        '/friend-requests',
        '/users',
      ]) {
        const response = await fetch(base + path);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), html, '前端路由回退失败：' + path);
      }
      const assets = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)];
      assert.ok(assets.length >= 2);
      for (const [, path] of assets) {
        const response = await fetch(new URL(path, base));
        assert.equal(response.status, 200);
        assert.ok(response.headers.get('cache-control').includes('immutable'));
      }
      console.log('通过：Nginx 静态资源、前端路由回退、资源缓存、API 和 Swagger 代理');
    }
    const password = 'Test_' + randomBytes(12).toString('hex');
    const failedCaptcha = await api('GET', '/users/captcha');
    const failedKey = 'register:captcha:' + failedCaptcha.captchaId;
    const failedAnswer = await redis.get(failedKey);
    const invalidRegistration = {
      username: prefix + '_bad',
      nickname: '验证码测试',
      password,
      captchaId: failedCaptcha.captchaId,
      captchaCode: '0000',
    };
    await api('POST', '/users/register', undefined, invalidRegistration, 400);
    await api(
      'POST',
      '/users/register',
      undefined,
      { ...invalidRegistration, captchaCode: failedAnswer },
      400,
    );
    assert.equal(await redis.get(failedKey), null);
    for (let index = 0; index < 3; index++) {
      const challenge = await api('GET', '/users/captcha');
      const key = 'register:captcha:' + challenge.captchaId;
      const ttl = await redis.ttl(key);
      assert.ok(ttl > 0 && ttl <= 300);
      // 答案只从本地测试用 Redis 读取，公开接口不能返回答案。
      assert.equal(challenge.captchaCode, undefined);
      const registered = await api(
        'POST',
        '/users/register',
        undefined,
        {
          username: prefix + '_' + index,
          nickname: '临时测试' + index,
          password,
          captchaId: challenge.captchaId,
          captchaCode: await redis.get(key),
        },
        201,
      );
      users.push({ ...registered.user, token: registered.accessToken });
      assert.equal(await redis.get(key), null);
      const loggedIn = await api('POST', '/users/login', undefined, {
        username: registered.user.username,
        password,
      });
      assert.equal(loggedIn.user.id, registered.user.id);
      assert.equal((await api('GET', '/users/me', users[index])).id, registered.user.id);
    }
    console.log('通过：真实验证码注册、错误与重放拦截、原子消费、登录和用户资料');
    const [alice, bob, carol] = users;
    const search = await api('GET', '/users/search?q=' + prefix, alice);
    assert.equal(search.length, 2);
    assert.ok(search.every((user) => user.passwordHash === undefined && user.id !== alice.id));
    await api('POST', '/friend-requests', alice, { receiverId: alice.id }, 400);
    const request = await api('POST', '/friend-requests', alice, { receiverId: bob.id }, 201);
    assert.equal(
      (await api('POST', '/friend-requests', alice, { receiverId: bob.id }, 201)).id,
      request.id,
    );
    await api('POST', '/friend-requests', bob, { receiverId: alice.id }, 409);
    await api('PATCH', '/friend-requests/' + request.id, carol, { status: 'ACCEPTED' }, 403);
    await Promise.all([
      api('PATCH', '/friend-requests/' + request.id, bob, { status: 'ACCEPTED' }),
      api('PATCH', '/friend-requests/' + request.id, bob, { status: 'ACCEPTED' }),
    ]);
    assert.equal(
      await prisma.friendship.count({
        where: {
          OR: [
            { userId: alice.id, friendId: bob.id },
            { userId: bob.id, friendId: alice.id },
          ],
        },
      }),
      2,
    );
    await api('PATCH', '/friendships/' + bob.id, alice, { remark: '测试备注' });
    assert.equal((await api('GET', '/friendships', alice))[0].remark, '测试备注');
    console.log('通过：搜索、申请防重、反向申请提示、权限校验、并发接受与双向好友关系、备注');

    const rejected = await api('POST', '/friend-requests', carol, { receiverId: bob.id }, 201);
    await api('PATCH', '/friend-requests/' + rejected.id, bob, { status: 'REJECTED' });
    await api('PATCH', '/friend-requests/' + rejected.id, bob, { status: 'ACCEPTED' }, 409);
    assert.equal(
      (await api('POST', '/friend-requests', carol, { receiverId: bob.id }, 201)).id,
      rejected.id,
    );
    console.log('通过：拒绝申请、禁止覆盖终态、重新申请复用记录');

    await api('POST', '/chatrooms/direct', carol, { friendId: alice.id }, 403);
    const direct = await Promise.all([
      api('POST', '/chatrooms/direct', alice, { friendId: bob.id }, 201),
      api('POST', '/chatrooms/direct', bob, { friendId: alice.id }, 201),
    ]);
    assert.equal(direct[0].id, direct[1].id);
    assert.equal(direct[0].members.length, 2);
    const [aSocket, bSocket, cSocket] = await Promise.all(
      users.map((user, index) =>
        socket(user, index === 2 ? process.env.CHAT_TEST_PEER_URL : undefined),
      ),
    );
    const directId = direct[0].id;
    assert.equal((await emit(aSocket, 'room:join', { roomId: directId })).ok, true);
    assert.equal((await emit(bSocket, 'room:join', { roomId: directId })).ok, true);
    assert.equal((await emit(cSocket, 'room:join', { roomId: directId })).ok, false);
    const input = { roomId: directId, content: '双账号实时私聊', clientMessageId: randomUUID() };
    const received = nextMessage(bSocket);
    // 模拟发送端未拿到 ACK：先只验证接收端，再用同一编号重试。
    aSocket.emit('message:send', input);
    const first = await received;
    const sent = await emit(aSocket, 'message:send', input);
    assert.equal(sent.ok, true);
    assert.equal(first.id, sent.data.id);
    assert.equal(
      (await emit(aSocket, 'message:send', { ...input, content: '不能复用编号篡改内容' })).ok,
      false,
    );
    assert.equal(
      await prisma.chatHistory.count({
        where: { senderId: alice.id, clientMessageId: input.clientMessageId },
      }),
      1,
    );
    console.log('通过：并发私聊复用、双账号实时消息、消息幂等与内容冲突检查、陌生人拒绝入房');

    bSocket.disconnect();
    const offline = [];
    for (let offset = 0; offset < 100; offset += 10) {
      if (offset) await new Promise((resolve) => setTimeout(resolve, 1000));
      const batch = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          emit(aSocket, 'message:send', {
            roomId: directId,
            content: '断线消息 ' + (offset + index),
            clientMessageId: randomUUID(),
          }),
        ),
      );
      for (const result of batch) {
        assert.equal(result.ok, true, JSON.stringify(result));
        offline.push(result.data.id);
      }
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('重连超时')), 5000);
      bSocket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      bSocket.connect();
    });
    assert.equal((await emit(bSocket, 'room:join', { roomId: directId })).ok, true);
    const syncPath = '/chat/rooms/' + directId + '/messages/sync?limit=30&after=';
    let page = await api('GET', syncPath + sent.data.id, bob);
    const recovered = page.items.map((item) => item.id);
    const through = page.through;
    const liveBroadcast = nextMessage(bSocket);
    const live = await emit(aSocket, 'message:send', {
      roomId: directId,
      content: '同步期间的新消息',
      clientMessageId: randomUUID(),
    });
    assert.equal(live.ok, true);
    assert.equal((await liveBroadcast).id, live.data.id);
    while (page.nextAfter !== null) {
      page = await api('GET', syncPath + page.nextAfter + '&through=' + through, bob);
      assert.equal(page.through, through);
      recovered.push(...page.items.map((item) => item.id));
    }
    assert.deepEqual(
      recovered,
      offline.sort((a, b) => a - b),
    );
    const tail = await api('GET', syncPath + through, bob);
    assert.deepEqual(
      tail.items.map((item) => item.id),
      [live.data.id],
    );
    console.log('通过：断线 100 条消息分批无重无漏，补拉期间的新消息由实时广播接收');

    const group = await api('POST', '/chatrooms', alice, { name: '临时测试群' }, 201);
    await api('POST', '/chatrooms/' + group.id + '/members', bob, { userIds: [carol.id] }, 403);
    await api('POST', '/chatrooms/' + group.id + '/members', alice, { userIds: [carol.id] }, 403);
    await befriend(alice, carol);
    await api(
      'POST',
      '/chatrooms/' + group.id + '/members',
      alice,
      { userIds: [bob.id, carol.id] },
      201,
    );
    assert.equal(
      (await api('POST', '/chatrooms/' + group.id + '/members', alice, { userIds: [bob.id] }, 201))
        ._count.members,
      3,
    );
    for (const client of [aSocket, bSocket, cSocket])
      assert.equal((await emit(client, 'room:join', { roomId: group.id })).ok, true);
    const groupReceived = nextMessage(cSocket);
    assert.equal(
      (
        await emit(bSocket, 'message:send', {
          roomId: group.id,
          content: '三人群聊测试',
          clientMessageId: randomUUID(),
        })
      ).ok,
      true,
    );
    assert.equal((await groupReceived).content, '三人群聊测试');
    console.log('通过：群主权限、好友邀请限制、成员去重、三账号群聊广播');
    if (process.env.CHAT_TEST_PEER_URL) console.log('通过：不同后端进程之间的 Redis 消息广播');

    const favorited = await api('POST', '/favorites', bob, { historyId: sent.data.id }, 201);
    assert.equal(
      (await api('POST', '/favorites', bob, { historyId: sent.data.id }, 201)).id,
      favorited.id,
    );
    await api('POST', '/favorites', carol, { historyId: sent.data.id }, 403);
    assert.equal((await api('GET', '/favorites', bob))[0].history.id, sent.data.id);
    await api('DELETE', '/favorites/' + favorited.id, carol);
    assert.ok(await prisma.favorite.findUnique({ where: { id: favorited.id } }));
    await api('DELETE', '/favorites/' + favorited.id, bob);
    assert.equal(await prisma.favorite.findUnique({ where: { id: favorited.id } }), null);
    console.log('通过：收藏去重、收藏越权拦截、列表和取消收藏');

    const id = randomUUID();
    const bytes = Buffer.from('聊天室附件内容');
    const fileReceived = nextMessage(bSocket);
    const uploaded = await api(
      'POST',
      '/chat/rooms/' + directId + '/files',
      alice,
      fileBody(id, bytes, '中文附件.txt', 'text/plain'),
      201,
    );
    assert.equal(uploaded.type, 'FILE');
    assert.equal(uploaded.fileName, '中文附件.txt');
    assert.equal((await fileReceived).id, uploaded.id);
    assert.equal(
      (
        await api(
          'POST',
          '/chat/rooms/' + directId + '/files',
          alice,
          fileBody(id, bytes, '中文附件.txt', 'text/plain'),
          201,
        )
      ).id,
      uploaded.id,
    );
    const download = await fetch(base + '/api/chat/messages/' + uploaded.id + '/file', {
      headers: { Authorization: 'Bearer ' + bob.token },
    });
    assert.equal(download.status, 200);
    assert.equal(await download.text(), bytes.toString());
    assert.ok(
      download.headers.get('content-disposition').includes(encodeURIComponent('中文附件.txt')),
    );
    await api('GET', '/chat/messages/' + uploaded.id + '/file', carol, undefined, 403);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Z4QAAAAASUVORK5CYII=',
      'base64',
    );
    const image = await api(
      'POST',
      '/chat/rooms/' + group.id + '/files',
      alice,
      fileBody(randomUUID(), png, '像素.png', 'image/png'),
      201,
    );
    assert.equal(image.type, 'IMAGE');
    assert.equal(image.mimeType, 'image/png');
    const forged = await api(
      'POST',
      '/chat/rooms/' + group.id + '/files',
      alice,
      fileBody(randomUUID(), Buffer.from('<svg onload="alert(1)"/>'), '假图片.svg', 'image/png'),
      201,
    );
    assert.equal(forged.type, 'FILE');
    assert.equal(forged.mimeType, 'application/octet-stream');
    const boundary = await api(
      'POST',
      '/chat/rooms/' + group.id + '/files',
      alice,
      fileBody(
        randomUUID(),
        Buffer.alloc(10 * 1024 * 1024),
        'limit.bin',
        'application/octet-stream',
      ),
      201,
    );
    assert.equal(boundary.fileSize, 10 * 1024 * 1024);
    await api(
      'POST',
      '/chat/rooms/' + group.id + '/files',
      alice,
      fileBody(
        randomUUID(),
        Buffer.alloc(10 * 1024 * 1024 + 1),
        'oversized.bin',
        'application/octet-stream',
      ),
      413,
    );
    console.log(
      '通过：MinIO 文件落库广播、中文名称、权限下载、重复上传去重、图片识别、伪造图片降级与大小限制',
    );

    const newest = await api('GET', '/chat/rooms/' + directId + '/messages?limit=1', bob);
    const older = await api(
      'GET',
      '/chat/rooms/' + directId + '/messages?limit=1&before=' + newest[0].id,
      bob,
    );
    assert.ok(older[0].id < newest[0].id);
    await api('DELETE', '/friendships/' + bob.id, alice);
    assert.equal(
      await prisma.friendship.count({
        where: {
          OR: [
            { userId: alice.id, friendId: bob.id },
            { userId: bob.id, friendId: alice.id },
          ],
        },
      }),
      0,
    );
    assert.equal(
      (
        await emit(bSocket, 'message:send', {
          roomId: directId,
          content: '解除后拒绝发送',
          clientMessageId: randomUUID(),
        })
      ).ok,
      false,
    );
    assert.ok((await api('GET', '/chat/rooms/' + directId + '/messages', bob)).length > 0);
    console.log('通过：历史游标分页、双向删除好友、解除后禁止私聊发送并保留历史');
  } finally {
    clients.forEach((client) => client.disconnect());
    const ids = users.map((user) => user.id);
    if (ids.length) {
      const files = await prisma.chatHistory.findMany({
        where: { senderId: { in: ids }, objectKey: { not: null } },
        select: { objectKey: true },
      });
      for (const file of files) await storage.removeObject(env.MINIO_BUCKET, file.objectKey);
      await prisma.chatroom.deleteMany({ where: { ownerId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
    redis.disconnect();
    console.log('已清理临时账号、会话、消息、申请、收藏与 MinIO 对象');
  }
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
