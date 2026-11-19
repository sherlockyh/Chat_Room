import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length, Matches } from 'class-validator';
import type { CaptchaChallenge } from '@chat/shared';

export class CaptchaResponseDto implements CaptchaChallenge {
  @ApiProperty({ description: '验证码编号，用于注册时校验', format: 'uuid' })
  captchaId: string;

  @ApiProperty({ description: '可直接作为 img 的 src 的 SVG 图片地址' })
  image: string;

  @ApiProperty({ description: '有效时长，单位秒', example: 300 })
  expiresIn: number;
}

export class LoginDto {
  @ApiProperty({ example: 'alice', minLength: 3, maxLength: 32 })
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: '账号仅支持字母、数字和下划线' })
  username: string;

  @ApiProperty({ minLength: 8, maxLength: 72, description: '密码不会在响应中返回' })
  @IsString()
  @Length(8, 72)
  password: string;
}

export class RegisterDto extends LoginDto {
  @ApiProperty({ description: '获取图形验证码接口返回的编号', format: 'uuid' })
  @IsUUID('4', { message: '请先获取图形验证码' })
  captchaId: string;

  @ApiProperty({ description: '图片中的 4 位字符，不区分大小写', minLength: 4, maxLength: 4 })
  @IsString()
  @Matches(/^[a-zA-Z0-9]{4}$/, { message: '请输入 4 位图形验证码' })
  captchaCode: string;

  @ApiProperty({ example: '小林', maxLength: 50 })
  @IsString()
  @Length(1, 50)
  @Matches(/\S/, { message: '昵称不能为空白' })
  nickname: string;
}
