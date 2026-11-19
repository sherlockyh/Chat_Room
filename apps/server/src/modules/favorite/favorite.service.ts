import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CursorPageDto } from '../../common/page.dto';
import { cursorPage } from '../../common/cursor-page';
import { publicUserSelect } from '../user/user.service';

@Injectable()
export class FavoriteService {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: number, page: CursorPageDto) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId, ...(page.before ? { id: { lt: page.before } } : {}) },
      include: { history: { include: { sender: { select: publicUserSelect } } } },
      orderBy: { id: 'desc' },
      take: page.limit + (page.paged ? 1 : 0),
    });
    return cursorPage(rows, page);
  }
  async add(userId: number, historyId: number) {
    const history = await this.prisma.chatHistory.findUnique({
      where: { id: historyId },
      select: { roomId: true },
    });
    if (!history) throw new NotFoundException('消息不存在');
    if (
      !(await this.prisma.userChatroom.findUnique({
        where: { userId_roomId: { userId, roomId: history.roomId } },
      }))
    )
      throw new ForbiddenException('只能收藏自己会话内的消息');
    return this.prisma.favorite.upsert({
      where: { userId_historyId: { userId, historyId } },
      create: { userId, historyId },
      update: {},
    });
  }
  async remove(userId: number, id: number) {
    await this.prisma.favorite.deleteMany({ where: { id, userId } });
    return { success: true };
  }
}
