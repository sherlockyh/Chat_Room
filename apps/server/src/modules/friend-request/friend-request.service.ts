import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { cursorPage } from '../../common/cursor-page';
import { publicUserSelect } from '../user/user.service';
import { withUserPair } from '../../common/user-pair';
import {
  CreateFriendRequestDto,
  DecideFriendRequestDto,
  ListFriendRequestsDto,
} from './friend-request.dto';

@Injectable()
export class FriendRequestService {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: number, page: ListFriendRequestsDto) {
    const rows = await this.prisma.friendRequest.findMany({
      where: {
        ...(page.direction === 'received'
          ? { receiverId: userId }
          : page.direction === 'sent'
            ? { senderId: userId }
            : { OR: [{ senderId: userId }, { receiverId: userId }] }),
        ...(page.before ? { id: { lt: page.before } } : {}),
      },
      include: { sender: { select: publicUserSelect }, receiver: { select: publicUserSelect } },
      orderBy: { id: 'desc' },
      take: page.limit + (page.paged ? 1 : 0),
    });
    return cursorPage(rows, page);
  }
  create(senderId: number, dto: CreateFriendRequestDto) {
    return withUserPair(this.prisma, senderId, dto.receiverId, async (tx) => {
      if (
        await tx.friendship.findUnique({
          where: { userId_friendId: { userId: senderId, friendId: dto.receiverId } },
        })
      )
        throw new ConflictException('已经是好友');
      const reverse = await tx.friendRequest.findUnique({
        where: { senderId_receiverId: { senderId: dto.receiverId, receiverId: senderId } },
      });
      if (reverse?.status === 'PENDING')
        throw new ConflictException('对方已向你发送申请，请到好友请求中处理');
      const where = { senderId_receiverId: { senderId, receiverId: dto.receiverId } };
      const existing = await tx.friendRequest.findUnique({ where });
      if (existing?.status === 'PENDING') return existing;
      return tx.friendRequest.upsert({
        where,
        create: { senderId, ...dto },
        update: { status: 'PENDING', message: dto.message ?? null },
      });
    });
  }
  async decide(userId: number, id: number, dto: DecideFriendRequestDto) {
    const request = await this.prisma.friendRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('申请不存在');
    if (request.receiverId !== userId) throw new ForbiddenException('只能处理收到的申请');
    return withUserPair(this.prisma, userId, request.senderId, async (tx) => {
      const current = await tx.friendRequest.findUniqueOrThrow({ where: { id } });
      if (current.status === dto.status) return current;
      if (current.status !== 'PENDING') throw new ConflictException('申请已处理，请刷新列表');
      if (dto.status === 'ACCEPTED') {
        await tx.friendship.createMany({
          data: [
            { userId, friendId: current.senderId },
            { userId: current.senderId, friendId: userId },
          ],
          skipDuplicates: true,
        });
        await tx.friendRequest.updateMany({
          where: { senderId: userId, receiverId: current.senderId, status: 'PENDING' },
          data: { status: 'ACCEPTED' },
        });
      }
      return tx.friendRequest.update({ where: { id }, data: { status: dto.status } });
    });
  }
}
