import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CursorPageDto } from '../../common/page.dto';

export class ListFriendRequestsDto extends CursorPageDto {
  @ApiPropertyOptional({
    enum: ['received', 'sent'],
    description: '收到或发出的申请，不传返回双方申请',
  })
  @IsOptional()
  @IsIn(['received', 'sent'])
  direction?: 'received' | 'sent';
}

export class CreateFriendRequestDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  receiverId: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}
export class DecideFriendRequestDto {
  @ApiProperty({ enum: ['ACCEPTED', 'REJECTED'] })
  @IsIn(['ACCEPTED', 'REJECTED'])
  status: 'ACCEPTED' | 'REJECTED';
}
