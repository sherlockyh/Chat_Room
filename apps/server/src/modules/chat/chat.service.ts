import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { PageDto } from '../../common/page.dto';
import { ChatroomService } from '../chatroom/chatroom.service';
import { publicUserSelect } from '../user/user.service';
import { SendMessageDto, SyncMessagesDto } from './chat.dto';
import { StorageService } from '../../infrastructure/storage.service';

const messageInclude = { sender: { select: publicUserSelect } } as const;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: ChatroomService,
    private readonly storage: StorageService,
  ) {}
  async history(userId: number, roomId: number, page: PageDto) {
    await this.rooms.assertMember(userId, roomId);
    return this.prisma.chatHistory.findMany({
      where: { roomId, ...(page.before ? { id: { lt: page.before } } : {}) },
      include: { sender: { select: publicUserSelect } },
      orderBy: { id: 'desc' },
      take: page.limit,
    });
  }
  async sync(userId: number, roomId: number, page: SyncMessagesDto) {
    await this.rooms.assertMember(userId, roomId);
    if (page.through !== undefined && page.through < page.after)
      throw new BadRequestException('同步上界不能小于起始游标');
    const latest =
      page.through === undefined
        ? await this.prisma.chatHistory.findFirst({
            where: { roomId },
            orderBy: { id: 'desc' },
            select: { id: true },
          })
        : null;
    // 固定到首页查询时的已提交上界，持续进来的新消息由 Socket 接收。
    const through = page.through ?? Math.max(page.after, latest?.id ?? 0);
    const rows = await this.prisma.chatHistory.findMany({
      where: { roomId, id: { gt: page.after, lte: through } },
      include: messageInclude,
      orderBy: { id: 'asc' },
      take: page.limit + 1,
    });
    const items = rows.slice(0, page.limit);
    return { items, through, nextAfter: rows.length > page.limit ? items.at(-1)!.id : null };
  }
  async send(
    userId: number,
    dto: SendMessageDto,
  ): Promise<Prisma.ChatHistoryGetPayload<{ include: typeof messageInclude }>> {
    await this.rooms.assertCanSend(userId, dto.roomId);
    const existing = await this.findClientMessage(userId, dto.clientMessageId);
    if (existing) {
      if (
        existing.roomId !== dto.roomId ||
        existing.type !== 'TEXT' ||
        existing.content !== dto.content
      )
        throw new ConflictException('消息编号已用于其他内容');
      return existing;
    }
    try {
      return await this.createMessage({
        roomId: dto.roomId,
        senderId: userId,
        content: dto.content,
        type: 'TEXT',
        clientMessageId: dto.clientMessageId,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return this.send(userId, dto);
      throw error;
    }
  }
  private createMessage(data: Prisma.ChatHistoryUncheckedCreateInput) {
    return this.prisma.$transaction(async (tx) => {
      // 写入前锁住房间，确保同房低 ID 先提交，增量读取不会跨过未提交消息。
      await tx.$queryRaw`SELECT id FROM chatroom WHERE id = ${data.roomId} FOR UPDATE`;
      return tx.chatHistory.create({ data, include: messageInclude });
    });
  }
  private findClientMessage(userId: number, clientMessageId?: string) {
    return clientMessageId
      ? this.prisma.chatHistory.findUnique({
          where: { senderId_clientMessageId: { senderId: userId, clientMessageId } },
          include: messageInclude,
        })
      : Promise.resolve(null);
  }
  async upload(
    userId: number,
    roomId: number,
    clientMessageId: string,
    file?: Express.Multer.File,
  ) {
    await this.rooms.assertCanSend(userId, roomId);
    const existing = await this.findClientMessage(userId, clientMessageId);
    if (existing) {
      if (existing.roomId !== roomId || !existing.objectKey)
        throw new ConflictException('消息编号已用于其他内容');
      return existing;
    }
    if (!file || file.size === 0) throw new BadRequestException('请选择非空文件');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('文件不能超过 10 MB');
    let originalName = file.originalname;
    // multipart 的文件名可能按 Latin-1 解码，恢复浏览器发送的 UTF-8 中文名称。
    if (/^[\u0000-\u00ff]*$/.test(originalName)) {
      try {
        originalName = new TextDecoder('utf-8', { fatal: true }).decode(
          Buffer.from(originalName, 'latin1'),
        );
      } catch {
        /* 保留合法的原始文件名。 */
      }
    }
    const fileName = originalName.replace(/[/\\\u0000-\u001f\u007f]/g, '_').slice(0, 180) || '附件';
    const mimeType = this.imageMime(file.buffer) ?? 'application/octet-stream';
    const objectKey = 'messages/' + userId + '/' + randomUUID();
    try {
      await this.storage.client.putObject(this.storage.bucket, objectKey, file.buffer, file.size, {
        'Content-Type': mimeType,
      });
      return await this.createMessage({
        roomId,
        senderId: userId,
        content: fileName,
        type: mimeType.startsWith('image/') ? 'IMAGE' : 'FILE',
        clientMessageId,
        objectKey,
        fileName,
        mimeType,
        fileSize: file.size,
      });
    } catch (error) {
      // 数据库响应丢失时先对账；只有本对象未关联消息才能补偿删除。
      let committed;
      try {
        committed = await this.findClientMessage(userId, clientMessageId);
      } catch (reconcileError) {
        // 无法确认提交结果时保留对象，避免删除实际已发送的附件。
        this.logger.error(
          '上传结果无法确认，保留对象：' + objectKey + '，消息编号：' + clientMessageId,
          reconcileError instanceof Error ? reconcileError.stack : undefined,
        );
        throw error;
      }
      if (committed?.objectKey === objectKey) return committed;
      try {
        await this.storage.client.removeObject(this.storage.bucket, objectKey);
      } catch (cleanupError) {
        this.logger.error(
          '上传补偿失败，对象：' + objectKey,
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        );
      }
      if (committed?.roomId === roomId && committed.objectKey) return committed;
      throw error;
    }
  }
  private imageMime(buffer: Buffer): string | null {
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      return 'image/png';
    if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
    if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
    if (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
      return 'image/webp';
    return null;
  }
  async download(userId: number, id: number) {
    const history = await this.prisma.chatHistory.findUnique({ where: { id } });
    if (!history?.objectKey) throw new NotFoundException('附件不存在');
    await this.rooms.assertMember(userId, history.roomId);
    return {
      stream: await this.storage.client.getObject(this.storage.bucket, history.objectKey),
      fileName: history.fileName ?? '附件',
      mimeType: history.mimeType ?? 'application/octet-stream',
      fileSize: history.fileSize ?? undefined,
    };
  }
}
