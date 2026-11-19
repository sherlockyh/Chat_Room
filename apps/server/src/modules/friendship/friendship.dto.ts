import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateRemarkDto {
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  remark: string;
}
