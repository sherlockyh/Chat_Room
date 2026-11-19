import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CursorPageDto } from '../../common/page.dto';
import { cursorPage } from '../../common/cursor-page';
import { withUserPair } from '../../common/user-pair';
import { publicUserSelect } from '../user/user.service';

const roomInclude = {
  _count: { select: { members: true } },
  members: { select: { userId: true, user: { select: publicUserSelect } } },
} as const;

@Injectable()
export class ChatroomService {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: number, page: CursorPageDto) {
    const rows = await this.prisma.chatroom.findMany({
      where: { members: { some: { userId } }, ...(page.before ? { id: { lt: page.before } } : {}) },
      include: roomInclude,
      orderBy: { id: 'desc' },
      take: page.limit + (page.paged ? 1 : 0),
    });
    return cursorPage(rows, page);
  }
  async detail(userId: number, roomId: number) {
    await this.assertMember(userId, roomId);
    return this.prisma.chatroom.findUniqueOrThrow({ where: { id: roomId }, include: roomInclude });
  }
  create(userId: number, name: string) {
    return this.prisma.chatroom.create({
      data: { name, ownerId: userId, members: { create: { userId } } },
      include: roomInclude,
    });
  }
  async assertMember(userId: number, roomId: number) {
    const membership = await this.prisma.userChatroom.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
    if (!membership) throw new ForbiddenException('你不是该聊天室成员');
  }
  direct(userId: number, friendId: number) {
    return withUserPair(this.prisma, userId, friendId, async (tx) => {
      if (!(await tx.friendship.findUnique({ where: { userId_friendId: { userId, friendId } } })))
        throw new ForbiddenException('请先添加对方为好友');
      const directKey = [userId, friendId].sort((a, b) => a - b).join(':');
      return tx.chatroom.upsert({
        where: { directKey },
        update: {},
        create: {
          name: '好友私聊',
          type: 'DIRECT',
          directKey,
          ownerId: userId,
          members: { create: [{ userId }, { userId: friendId }] },
        },
        include: roomInclude,
      });
    });
  }
  async invite(userId: number, roomId: number, userIds: number[]) {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.chatroom.findUnique({ where: { id: roomId } });
      if (!room) throw new NotFoundException('聊天室不存在');
      if (room.type !== 'GROUP' || room.ownerId !== userId)
        throw new ForbiddenException('只有群主可以邀请好友入群');
      const count = await tx.friendship.count({ where: { userId, friendId: { in: userIds } } });
      if (count !== userIds.length) throw new ForbiddenException('只能邀请自己的好友');
      await tx.userChatroom.createMany({
        data: userIds.map((id) => ({ roomId, userId: id })),
        skipDuplicates: true,
      });
      return tx.chatroom.findUniqueOrThrow({ where: { id: roomId }, include: roomInclude });
    });
  }
  async assertCanSend(userId: number, roomId: number) {
    await this.assertMember(userId, roomId);
    const room = await this.prisma.chatroom.findUnique({
      where: { id: roomId },
      include: { members: { select: { userId: true } } },
    });
    if (!room) throw new NotFoundException('聊天室不存在');
    if (room.type === 'DIRECT') {
      const peer = room.members.find((member) => member.userId !== userId);
      if (
        !peer ||
        !(await this.prisma.friendship.findUnique({
          where: { userId_friendId: { userId, friendId: peer.userId } },
        }))
      )
        throw new ForbiddenException('已解除好友关系，无法继续发送私聊消息');
    }
  }
}
