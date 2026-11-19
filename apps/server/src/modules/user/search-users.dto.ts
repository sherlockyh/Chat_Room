import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { CursorPageDto } from '../../common/page.dto';

export class SearchUsersDto extends CursorPageDto {
  @ApiProperty({ description: '按账号前缀搜索，至少 2 位', example: 'al' })
  @IsString()
  @Length(2, 32)
  @Matches(/^[a-zA-Z0-9_]+$/)
  q: string;
}
