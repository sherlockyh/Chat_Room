import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth';
import { CursorPageDto } from '../../common/page.dto';
import { CreateChatroomDto, DirectChatDto, InviteMembersDto } from './chatroom.dto';
import { ChatroomService } from './chatroom.service';

@ApiTags('聊天室管理')
@ApiBearerAuth()
@Controller('chatrooms')
export class ChatroomController {
  constructor(private readonly rooms: ChatroomService) {}
  @Get()
  @ApiOperation({ summary: '我加入的聊天室' })
  list(@CurrentUser() userId: number, @Query() page: CursorPageDto) {
    return this.rooms.list(userId, page);
  }
  @Get(':roomId')
  @ApiOperation({ summary: '读取已加入的聊天室详情' })
  detail(@CurrentUser() userId: number, @Param('roomId', ParseIntPipe) roomId: number) {
    return this.rooms.detail(userId, roomId);
  }
  @Post()
  @ApiOperation({ summary: '创建群聊并加入' })
  create(@CurrentUser() userId: number, @Body() dto: CreateChatroomDto) {
    return this.rooms.create(userId, dto.name);
  }
  @Post('direct')
  @ApiOperation({ summary: '发起好友私聊，重复请求复用同一聊天室' })
  direct(@CurrentUser() userId: number, @Body() dto: DirectChatDto) {
    return this.rooms.direct(userId, dto.friendId);
  }
  @Post(':roomId/members')
  @ApiOperation({ summary: '群主邀请好友入群，重复邀请不重复添加' })
  invite(
    @CurrentUser() userId: number,
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: InviteMembersDto,
  ) {
    return this.rooms.invite(userId, roomId, dto.userIds);
  }
}
