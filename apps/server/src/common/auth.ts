import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export const Public = () => SetMetadata('public', true);
export type AuthRequest = Request & { userId: number };
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthRequest>().userId,
);

/** JWT 的 sub 必须是数据库中的正整数用户编号。 */
export function subjectId(payload: { sub?: unknown }): number {
  if (!Number.isSafeInteger(payload.sub) || Number(payload.sub) < 1)
    throw new UnauthorizedException('登录凭证无效');
  return Number(payload.sub);
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}
  async canActivate(context: ExecutionContext) {
    // 实时事件由握手中间件和 Gateway 逐事件鉴权。
    if (context.getType() !== 'http') return true;
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('请先登录');
    try {
      request.userId = subjectId(await this.jwt.verifyAsync(token));
      return true;
    } catch {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
  }
}
