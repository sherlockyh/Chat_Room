import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { CaptchaService } from './captcha.service';

@Module({
  controllers: [UserController],
  providers: [UserService, CaptchaService],
  exports: [UserService],
})
export class UserModule {}
