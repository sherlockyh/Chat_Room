import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth';
import { CursorPageDto } from '../../common/page.dto';
import { FriendshipService } from './friendship.service';
import { UpdateRemarkDto } from './friendship.dto';

@ApiTags('好友管理')
@ApiBearerAuth()
@Controller('friendships')
export class FriendshipController {
  constructor(private readonly friends: FriendshipService) {}
  @Get()
  @ApiOperation({ summary: '我的好友列表' })
  list(@CurrentUser() userId: number, @Query() page: CursorPageDto) {
    return this.friends.list(userId, page);
  }
  @Patch(':friendId')
  @ApiOperation({ summary: '修改好友备注' })
  remark(
    @CurrentUser() userId: number,
    @Param('friendId', ParseIntPipe) friendId: number,
    @Body() dto: UpdateRemarkDto,
  ) {
    return this.friends.remark(userId, friendId, dto.remark);
  }
  @Delete(':friendId')
  @ApiOperation({ summary: '解除双方好友关系' })
  remove(@CurrentUser() userId: number, @Param('friendId', ParseIntPipe) friendId: number) {
    return this.friends.remove(userId, friendId);
  }
}
