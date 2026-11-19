import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/prisma.service';

/** 固定顺序锁定双方用户，串行处理申请、好友关系与私聊创建。 */
export function withUserPair<T>(
  prisma: PrismaService,
  userId: number,
  peerId: number,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  if (userId === peerId) throw new BadRequestException('不能对自己执行此操作');
  const [first, second] = [userId, peerId].sort((a, b) => a - b);
  return prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql(
        ['SELECT id FROM users WHERE id IN (', ', ', ') ORDER BY id FOR UPDATE'],
        first,
        second,
      ),
    );
    if (users.length !== 2) throw new NotFoundException('用户不存在');
    return action(tx);
  });
}
