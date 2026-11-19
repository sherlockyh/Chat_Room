const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { ChatService } = require('../dist/modules/chat/chat.service');

// 对故障边界注入错误，验证 MinIO 与数据库之间的对账和补偿行为。
function fixture({ create, reconcile = async () => null, put, permission } = {}) {
  const calls = { uploads: [], removed: [], writes: [] };
  let queries = 0;
  const service = new ChatService(
    {
      $transaction: async function (work) {
        return work(this);
      },
      $queryRaw: async () => [{ id: 2 }],
      chatHistory: {
        findUnique: async () => (++queries === 1 ? null : reconcile(calls)),
        create: async ({ data }) => {
          calls.writes.push(data);
          return create ? create(data) : { id: 1, ...data };
        },
      },
    },
    { assertCanSend: permission || (async () => {}) },
    {
      bucket: 'test',
      client: {
        putObject: async (_bucket, key) => {
          calls.uploads.push(key);
          if (put) await put();
        },
        removeObject: async (_bucket, key) => calls.removed.push(key),
      },
    },
  );
  const logs = [];
  service.logger = { error: (...args) => logs.push(args) };
  const bytes = Buffer.from('测试附件');
  const file = { originalname: '附件.txt', buffer: bytes, size: bytes.length };
  return { service, calls, logs, file };
}

test('消息未写入数据库时补偿删除本次上传对象', async () => {
  const failure = new Error('数据库写入失败');
  const { service, calls, file } = fixture({
    create: async () => {
      throw failure;
    },
  });
  await assert.rejects(service.upload(1, 2, randomUUID(), file), (error) => error === failure);
  assert.equal(calls.uploads.length, 1);
  assert.deepEqual(calls.removed, calls.uploads);
});

test('数据库已提交但响应丢失时返回原消息并保留对象', async () => {
  const { service, calls, file } = fixture({
    create: async () => {
      throw new Error('提交响应丢失');
    },
    reconcile: async (calls) => ({ id: 9, ...calls.writes[0] }),
  });
  const saved = await service.upload(1, 2, randomUUID(), file);
  assert.equal(saved.id, 9);
  assert.equal(saved.objectKey, calls.uploads[0]);
  assert.deepEqual(calls.removed, []);
});

test('重复请求并发获胜时删除本次冗余对象并返回已保存消息', async () => {
  const existing = { id: 10, roomId: 2, objectKey: 'messages/1/winner' };
  const { service, calls, file } = fixture({
    create: async () => {
      throw new Error('唯一约束冲突');
    },
    reconcile: async () => existing,
  });
  assert.equal(await service.upload(1, 2, randomUUID(), file), existing);
  assert.deepEqual(calls.removed, calls.uploads);
  assert.ok(!calls.removed.includes(existing.objectKey));
});

test('数据库对账不可用时保留对象并记录待核查信息', async () => {
  const failure = new Error('提交结果未知');
  const { service, calls, logs, file } = fixture({
    create: async () => {
      throw failure;
    },
    reconcile: async () => {
      throw new Error('数据库不可用');
    },
  });
  const clientId = randomUUID();
  await assert.rejects(service.upload(1, 2, clientId, file), (error) => error === failure);
  assert.deepEqual(calls.removed, []);
  assert.ok(logs[0][0].includes(calls.uploads[0]));
  assert.ok(logs[0][0].includes(clientId));
});

test('对象存储失败时不创建消息', async () => {
  const failure = new Error('对象存储不可用');
  const { service, calls, file } = fixture({
    put: async () => {
      throw failure;
    },
  });
  await assert.rejects(service.upload(1, 2, randomUUID(), file), (error) => error === failure);
  assert.deepEqual(calls.writes, []);
  assert.deepEqual(calls.removed, calls.uploads);
});

test('没有发送权限时不执行任何上传和消息写入', async () => {
  const { service, calls, file } = fixture({
    permission: async () => {
      throw new Error('禁止发送');
    },
  });
  await assert.rejects(service.upload(1, 2, randomUUID(), file), /禁止发送/);
  assert.deepEqual(calls.uploads, []);
  assert.deepEqual(calls.writes, []);
});
