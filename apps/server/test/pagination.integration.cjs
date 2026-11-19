// 本地真实数据库及 HTTP 分页回归；仅创建并清理带随机前缀的测试数据。
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { JwtService } = require('@nestjs/jwt');
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
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const prefix = 'pg_' + randomBytes(5).toString('hex');
const base = process.env.CHAT_TEST_BASE_URL || 'http://127.0.0.1:3000';
let token;
let owner;
async function get(path, expected = 200) {
  const response = await fetch(base + '/api' + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const data = await response.json();
  assert.equal(response.status, expected, path + ': ' + JSON.stringify(data));
  return data;
}
async function walk(path, expectedIds) {
  const ids = [];
  let before;
  do {
    const page = await get(
      path +
        (path.includes('?') ? '&' : '?') +
        'paged=true&limit=12' +
        (before ? '&before=' + before : ''),
    );
    assert.ok(page.items.length <= 12);
    ids.push(...page.items.map((item) => item.id));
    assert.equal(page.hasMore, page.nextBefore !== null);
    if (page.hasMore) {
      assert.equal(page.nextBefore, page.items.at(-1).id);
      assert.ok(!before || page.nextBefore < before);
    }
    before = page.nextBefore;
    assert.ok(ids.length <= expectedIds.length);
  } while (before);
  assert.deepEqual(
    ids,
    [...expectedIds].sort((a, b) => b - a),
    path,
  );
  assert.equal(new Set(ids).size, ids.length);
}
async function main() {
  try {
    owner = await prisma.user.create({
      data: { username: prefix + '_owner', nickname: '分页测试', passwordHash: 'test-only' },
    });
    token = new JwtService({ secret: env.JWT_SECRET }).sign(
      { sub: owner.id },
      { expiresIn: '10m' },
    );
    await prisma.user.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        username: prefix + '_peer' + index,
        nickname: '测试好友' + index,
        passwordHash: 'test-only',
      })),
    });
    const peers = await prisma.user.findMany({
      where: { username: { startsWith: prefix + '_peer' } },
    });
    await prisma.friendship.createMany({
      data: peers.map((peer) => ({ userId: owner.id, friendId: peer.id })),
    });
    await prisma.friendRequest.createMany({
      data: [
        ...peers.map((peer) => ({ senderId: peer.id, receiverId: owner.id })),
        ...peers.slice(0, 2).map((peer) => ({ senderId: owner.id, receiverId: peer.id })),
      ],
    });
    await prisma.chatroom.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        ownerId: owner.id,
        name: prefix + '_room' + index,
      })),
    });
    const rooms = await prisma.chatroom.findMany({ where: { ownerId: owner.id } });
    await prisma.userChatroom.createMany({
      data: rooms.map((room) => ({ userId: owner.id, roomId: room.id })),
    });
    await prisma.chatHistory.createMany({
      data: rooms.map((room) => ({ senderId: owner.id, roomId: room.id, content: '分页测试消息' })),
    });
    const histories = await prisma.chatHistory.findMany({ where: { senderId: owner.id } });
    await prisma.favorite.createMany({
      data: histories.map((item) => ({ userId: owner.id, historyId: item.id })),
    });
    for (const [path, records] of [
      ['/friendships', await prisma.friendship.findMany({ where: { userId: owner.id } })],
      ['/chatrooms', rooms],
      ['/favorites', await prisma.favorite.findMany({ where: { userId: owner.id } })],
      [
        '/friend-requests?direction=received',
        await prisma.friendRequest.findMany({ where: { receiverId: owner.id } }),
      ],
      [
        '/friend-requests?direction=sent',
        await prisma.friendRequest.findMany({ where: { senderId: owner.id } }),
      ],
      ['/users/search?q=' + prefix + '_peer', peers],
    ])
      await walk(
        path,
        records.map((item) => item.id),
      );
    assert.ok(
      (await get('/users/search?q=' + prefix + '_peer&paged=true')).items.every(
        (item) => item.isFriend,
      ),
    );
    assert.ok(
      (await get('/friend-requests?direction=received&paged=true')).items.every(
        (item) => item.receiverId === owner.id,
      ),
    );
    assert.ok(
      (await get('/friend-requests?direction=sent&paged=true')).items.every(
        (item) => item.senderId === owner.id,
      ),
    );
    for (const path of ['/friendships', '/chatrooms', '/favorites', '/friend-requests']) {
      assert.ok(Array.isArray(await get(path + '?limit=1')), '旧数组契约：' + path);
    }
    const oldestRoom = [...rooms].sort((a, b) => a.id - b.id)[0];
    const recentRooms = await get('/chatrooms?limit=100');
    assert.ok(!recentRooms.some((room) => room.id === oldestRoom.id));
    const roomDetail = await get('/chatrooms/' + oldestRoom.id);
    assert.equal(roomDetail.id, oldestRoom.id);
    assert.equal(roomDetail._count.members, 1);
    assert.equal(roomDetail.members[0].user.id, owner.id);
    const ownerToken = token;
    token = new JwtService({ secret: env.JWT_SECRET }).sign(
      { sub: peers[0].id },
      { expiresIn: '10m' },
    );
    await get('/chatrooms/' + oldestRoom.id, 403);
    token = ownerToken;
    const first = await get('/favorites?paged=true&limit=100');
    const last = await get('/favorites?paged=true&limit=100&before=' + first.nextBefore);
    await prisma.favorite.deleteMany({
      where: { id: { in: last.items.map((item) => item.id) }, userId: owner.id },
    });
    assert.deepEqual(await get('/favorites?paged=true&limit=100&before=' + first.nextBefore), {
      items: [],
      hasMore: false,
      nextBefore: null,
    });
    // 游标记录删除后，继续翻页仍不会遗漏剩余记录。
    await prisma.favorite.delete({ where: { id: first.nextBefore } });
    const remaining = await get('/favorites?paged=true&limit=100');
    assert.equal(remaining.items.length, 99);
    assert.equal(remaining.hasMore, false);
    await get('/friend-requests?direction=unknown&paged=true', 400);
    await get('/chatrooms?paged=false', 400);
    await get('/chatrooms?paged=true&limit=101', 400);
    await get('/chatrooms?paged=true&before=0', 400);
    console.log(
      '通过：六类列表真实分页、跨越100条、顺序及无重复遗漏、申请方向、好友关系、旧契约、末页删除、参数校验、较早会话详情及成员权限',
    );
  } finally {
    if (owner) await prisma.chatroom.deleteMany({ where: { ownerId: owner.id } });
    await prisma.user.deleteMany({ where: { username: { startsWith: prefix + '_' } } });
    await prisma.$disconnect();
    console.log('已清理分页测试数据');
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
