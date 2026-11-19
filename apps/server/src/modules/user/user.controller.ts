import { Body, Controller, Get, Header, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '../../common/auth';
import { CaptchaResponseDto, LoginDto, RegisterDto } from './user.dto';
import { UserService } from './user.service';
import { CaptchaService } from './captcha.service';
import { SearchUsersDto } from './search-users.dto';

@ApiTags('用户')
@Controller('users')
export class UserController {
  constructor(
    private readonly users: UserService,
    private readonly captcha: CaptchaService,
  ) {}
  @Public()
  @Get('captcha')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '获取注册图形验证码（5 分钟内有效，校验后失效）' })
  @ApiOkResponse({ type: CaptchaResponseDto })
  createCaptcha() {
    return this.captcha.create();
  }
  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: '注册并登录' })
  register(@Body() dto: RegisterDto) {
    return this.users.register(dto);
  }
  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '账号密码登录' })
  login(@Body() dto: LoginDto) {
    return this.users.login(dto);
  }
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前用户资料' })
  profile(@CurrentUser() userId: number) {
    return this.users.profile(userId);
  }
  @Get('search')
  @ApiBearerAuth()
  @ApiOperation({ summary: '按账号前缀搜索其他用户' })
  search(@CurrentUser() userId: number, @Query() query: SearchUsersDto) {
    return this.users.search(userId, query);
  }
}
