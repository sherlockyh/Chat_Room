import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CursorPageDto } from '../../common/page.dto';
import { cursorPage } from '../../common/cursor-page';
import { publicUserSelect } from '../user/user.service';
import { withUserPair } from '../../common/user-pair';

@Injectable()
export class FriendshipService {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: number, page: CursorPageDto) {
    const rows = await this.prisma.friendship.findMany({
      where: { userId, ...(page.before ? { id: { lt: page.before } } : {}) },
      include: { friend: { select: publicUserSelect } },
      orderBy: { id: 'desc' },
      take: page.limit + (page.paged ? 1 : 0),
    });
    return cursorPage(rows, page);
  }
  remark(userId: number, friendId: number, remark: string) {
    return this.prisma.friendship.update({
      where: { userId_friendId: { userId, friendId } },
      data: { remark },
    });
  }
  remove(userId: number, friendId: number) {
    return withUserPair(this.prisma, userId, friendId, async (tx) => {
      await tx.friendship.deleteMany({
        where: {
          OR: [
            { userId, friendId },
            { userId: friendId, friendId: userId },
          ],
        },
      });
      return { success: true };
    });
  }
}
