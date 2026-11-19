import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth';
import { FriendRequestService } from './friend-request.service';
import {
  CreateFriendRequestDto,
  DecideFriendRequestDto,
  ListFriendRequestsDto,
} from './friend-request.dto';

@ApiTags('好友请求管理')
@ApiBearerAuth()
@Controller('friend-requests')
export class FriendRequestController {
  constructor(private readonly requests: FriendRequestService) {}
  @Get()
  @ApiOperation({ summary: '我发出和收到的好友申请' })
  list(@CurrentUser() userId: number, @Query() page: ListFriendRequestsDto) {
    return this.requests.list(userId, page);
  }
  @Post()
  @ApiOperation({ summary: '发送好友申请（待处理申请重复提交时复用）' })
  create(@CurrentUser() userId: number, @Body() dto: CreateFriendRequestDto) {
    return this.requests.create(userId, dto);
  }
  @Patch(':id')
  @ApiOperation({ summary: '接受或拒绝收到的好友申请' })
  decide(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideFriendRequestDto,
  ) {
    return this.requests.decide(userId, id, dto);
  }
}
