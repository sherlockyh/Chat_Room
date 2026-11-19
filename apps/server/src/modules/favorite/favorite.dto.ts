import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CreateFavoriteDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  historyId: number;
}
