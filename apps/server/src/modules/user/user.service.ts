import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../../infrastructure/prisma.service';
import { LoginDto, RegisterDto } from './user.dto';
import { CaptchaService } from './captcha.service';
import { SearchUsersDto } from './search-users.dto';
import { cursorPage } from '../../common/cursor-page';

export const publicUserSelect = { id: true, username: true, nickname: true, avatar: true } as const;

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly captcha: CaptchaService,
  ) {}
  async register(dto: RegisterDto) {
    await this.captcha.verify(dto.captchaId, dto.captchaCode);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        nickname: dto.nickname,
        passwordHash: await hash(dto.password, 12),
      },
      select: publicUserSelect,
    });
    return { accessToken: await this.jwt.signAsync({ sub: user.id }), user };
  }
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || !(await compare(dto.password, user.passwordHash)))
      throw new UnauthorizedException('账号或密码错误');
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      user: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar },
    };
  }
  async profile(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }
  async search(userId: number, query: SearchUsersDto) {
    const rows = await this.prisma.user.findMany({
      where: {
        id: { not: userId, ...(query.before ? { lt: query.before } : {}) },
        username: { startsWith: query.q },
      },
      select: {
        ...publicUserSelect,
        befriendedBy: { where: { userId }, select: { id: true }, take: 1 },
      },
      orderBy: { id: 'desc' },
      take: query.limit + (query.paged ? 1 : 0),
    });
    return cursorPage(
      rows.map(({ befriendedBy, ...user }) => ({
        ...user,
        isFriend: befriendedBy.length > 0,
      })),
      query,
    );
  }
}
