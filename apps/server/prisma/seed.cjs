const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnv();

if (!process.env.DATABASE_URL) {
  throw new Error('缺少 DATABASE_URL，请先配置 apps/server/.env');
}

const prisma = new PrismaClient();
const demoPassword = 'Demo_123456';

async function upsertUser(username, nickname) {
  return prisma.user.upsert({
    where: { username },
    update: { nickname },
    create: {
      username,
      nickname,
      passwordHash: await bcrypt.hash(demoPassword, 10),
    },
  });
}

async function upsertFriendship(userId, friendId) {
  return prisma.friendship.upsert({
    where: { userId_friendId: { userId, friendId } },
    update: {},
    create: { userId, friendId },
  });
}

async function upsertMembership(userId, roomId) {
  return prisma.userChatroom.upsert({
    where: { userId_roomId: { userId, roomId } },
    update: {},
    create: { userId, roomId },
  });
}

async function upsertTextMessage({ roomId, senderId, clientMessageId, content }) {
  return prisma.chatHistory.upsert({
    where: { senderId_clientMessageId: { senderId, clientMessageId } },
    update: { content },
    create: { roomId, senderId, clientMessageId, content, type: 'TEXT' },
  });
}

async function main() {
  const [alice, bob, carol] = await Promise.all([
    upsertUser('demo_alice', '演示 Alice'),
    upsertUser('demo_bob', '演示 Bob'),
    upsertUser('demo_carol', '演示 Carol'),
  ]);

  await Promise.all([upsertFriendship(alice.id, bob.id), upsertFriendship(bob.id, alice.id)]);

  const group =
    (await prisma.chatroom.findFirst({
      where: { ownerId: alice.id, type: 'GROUP', name: '演示群聊' },
    })) ||
    (await prisma.chatroom.create({
      data: { name: '演示群聊', type: 'GROUP', ownerId: alice.id },
    }));

  await Promise.all([
    upsertMembership(alice.id, group.id),
    upsertMembership(bob.id, group.id),
    upsertMembership(carol.id, group.id),
  ]);

  const directKey = [alice.id, bob.id].sort((a, b) => a - b).join(':');
  const direct = await prisma.chatroom.upsert({
    where: { directKey },
    update: {},
    create: {
      name: '好友私聊',
      type: 'DIRECT',
      directKey,
      ownerId: alice.id,
      members: { create: [{ userId: alice.id }, { userId: bob.id }] },
    },
  });
  await Promise.all([upsertMembership(alice.id, direct.id), upsertMembership(bob.id, direct.id)]);

  const firstMessage = await upsertTextMessage({
    roomId: group.id,
    senderId: alice.id,
    clientMessageId: 'demo-group-hello',
    content: '欢迎来到演示群聊，大家可以在这里测试实时消息。',
  });
  await upsertTextMessage({
    roomId: group.id,
    senderId: bob.id,
    clientMessageId: 'demo-group-reply',
    content: '收到，附件、收藏和分页也可以一起体验。',
  });
  await upsertTextMessage({
    roomId: direct.id,
    senderId: alice.id,
    clientMessageId: 'demo-direct-hello',
    content: '这是演示私聊消息。',
  });

  await prisma.favorite.upsert({
    where: { userId_historyId: { userId: alice.id, historyId: firstMessage.id } },
    update: {},
    create: { userId: alice.id, historyId: firstMessage.id },
  });

  console.log('演示数据已就绪');
  console.log('账号: demo_alice / demo_bob / demo_carol');
  console.log('密码: ' + demoPassword);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
