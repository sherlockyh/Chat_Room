import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateChatroomDto {
  @ApiProperty({ example: '项目讨论组', maxLength: 80 })
  @IsString()
  @Length(1, 80)
  @Matches(/\S/, { message: '聊天室名称不能为空白' })
  name: string;
}

export class DirectChatDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  friendId: number;
}
export class InviteMembersDto {
  @ApiProperty({ type: [Number], description: '群主的好友 ID，单次最多 50 人' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds: number[];
}
