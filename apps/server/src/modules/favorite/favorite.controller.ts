import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth';
import { CursorPageDto } from '../../common/page.dto';
import { FavoriteService } from './favorite.service';
import { CreateFavoriteDto } from './favorite.dto';

@ApiTags('收藏管理')
@ApiBearerAuth()
@Controller('favorites')
export class FavoriteController {
  constructor(private readonly favorites: FavoriteService) {}
  @Get()
  @ApiOperation({ summary: '我的消息收藏' })
  list(@CurrentUser() userId: number, @Query() page: CursorPageDto) {
    return this.favorites.list(userId, page);
  }
  @Post()
  @ApiOperation({ summary: '收藏会话中的消息，重复提交复用记录' })
  add(@CurrentUser() userId: number, @Body() dto: CreateFavoriteDto) {
    return this.favorites.add(userId, dto.historyId);
  }
  @Delete(':id')
  @ApiOperation({ summary: '取消自己的消息收藏' })
  remove(@CurrentUser() userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.favorites.remove(userId, id);
  }
}
