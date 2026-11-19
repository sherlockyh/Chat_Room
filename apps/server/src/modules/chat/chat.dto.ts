import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class SyncMessagesDto {
  @ApiProperty({ description: '最后一次已同步的消息 ID，0 表示没有游标' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  after: number;

  @ApiPropertyOptional({ description: '续页时传回首页的同步上界' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  through?: number;

  @ApiPropertyOptional({ default: 100, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 100;
}

export class RoomEventDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  roomId: number;
}

export class SendMessageDto extends RoomEventDto {
  @ApiProperty({ required: false, format: 'uuid', description: '客户端消息编号，重试时复用' })
  @IsOptional()
  @IsUUID('4')
  clientMessageId?: string;
  @ApiProperty({ maxLength: 4000, example: '大家好' })
  @IsString()
  @Length(1, 4000)
  @Matches(/\S/, { message: '不能发送空白消息' })
  content: string;
}
export class UploadMessageDto {
  @ApiProperty({ format: 'uuid', description: '上传消息编号，重试时复用' })
  @IsUUID('4')
  clientMessageId: string;
}
