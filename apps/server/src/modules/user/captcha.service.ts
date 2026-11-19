import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import svgCaptcha from 'svg-captcha';
import type { CaptchaChallenge } from '@chat/shared';
import { RedisService } from '../../infrastructure/redis.service';

const CHARACTERS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const EXPIRES_IN = 300;
// svg-captcha 支持指定文本渲染，随包声明遗漏了该调用签名。
const renderCaptcha = svgCaptcha as unknown as (
  text: string,
  options: typeof svgCaptcha.options,
) => string;

@Injectable()
export class CaptchaService {
  constructor(private readonly redis: RedisService) {}

  async create(): Promise<CaptchaChallenge> {
    const text = Array.from({ length: 4 }, () => CHARACTERS[randomInt(CHARACTERS.length)]).join('');
    const captchaId = randomUUID();
    const svg = renderCaptcha(text, {
      width: 132,
      height: 44,
      fontSize: 42,
      noise: 3,
      color: true,
      background: '#f1f5fb',
    });
    await this.redis.client.set(
      'register:captcha:' + captchaId,
      text.toLowerCase(),
      'EX',
      EXPIRES_IN,
    );
    return {
      captchaId,
      image: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
      expiresIn: EXPIRES_IN,
    };
  }

  async verify(captchaId: string, code: string): Promise<void> {
    // 原子读取并删除：成功或失败均消耗本次验证码，阻止重放和并发复用。
    const expected = await this.redis.client.getdel('register:captcha:' + captchaId);
    if (!expected || expected !== code.toLowerCase()) {
      throw new BadRequestException('验证码错误或已过期，请刷新后重试');
    }
  }
}
