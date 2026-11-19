import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/auth';
import { PageDto } from '../../common/page.dto';
import { ChatService } from './chat.service';
import { SyncMessagesDto, UploadMessageDto } from './chat.dto';
import { ChatGateway } from './chat.gateway';

@ApiTags('聊天')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}
  @Get('rooms/:roomId/messages')
  @ApiOperation({ summary: '查询历史消息（ID 倒序，before 向前翻页）' })
  history(
    @CurrentUser() userId: number,
    @Param('roomId', ParseIntPipe) roomId: number,
    @Query() page: PageDto,
  ) {
    return this.chat.history(userId, roomId, page);
  }
  @Get('rooms/:roomId/messages/sync')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: '按正序补齐已同步游标之后的消息' })
  sync(
    @CurrentUser() userId: number,
    @Param('roomId', ParseIntPipe) roomId: number,
    @Query() page: SyncMessagesDto,
  ) {
    return this.chat.sync(userId, roomId, page);
  }
  @Post('rooms/:roomId/files')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'clientMessageId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        clientMessageId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOperation({ summary: '上传附件并发送消息，单文件最大 10 MB' })
  async upload(
    @CurrentUser() userId: number,
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: UploadMessageDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const saved = await this.chat.upload(userId, roomId, dto.clientMessageId, file);
    this.gateway.broadcast(saved);
    return saved;
  }
  @Get('messages/:id/file')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: '下载自己会话内的消息附件' })
  async download(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number) {
    const file = await this.chat.download(userId, id);
    return new StreamableFile(file.stream, {
      type: file.mimeType,
      length: file.fileSize,
      disposition:
        'attachment; filename="download"; filename*=UTF-8\'\'' +
        encodeURIComponent(file.fileName).replace(/'/g, '%27'),
    });
  }
}
