import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** 按主键向前翻页；不使用深 offset。 */
export class PageDto {
  @ApiPropertyOptional({ description: '上一页最后一条记录的 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;

  @ApiPropertyOptional({ default: 30, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;
}

/** 管理列表可选返回分页元信息，聊天历史继续使用数组契约。 */
export class CursorPageDto extends PageDto {
  @ApiPropertyOptional({
    description: '传 true 返回 items、hasMore 和 nextBefore；不传保持数组响应',
    enum: ['true'],
  })
  @IsOptional()
  @IsIn(['true'])
  paged?: 'true';
}
