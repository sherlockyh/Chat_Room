import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/auth';
import { PrismaService } from './infrastructure/prisma.service';
import { RedisService } from './infrastructure/redis.service';
import { StorageService } from './infrastructure/storage.service';

@Public()
@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}
  @Get('live')
  @ApiOperation({ summary: '进程存活检查' })
  live() {
    return { status: 'ok' };
  }
  @Get('ready')
  @ApiOperation({ summary: 'MySQL、Redis 和 MinIO 就绪检查' })
  async ready() {
    let timeout: NodeJS.Timeout | undefined;
    try {
      const check = Promise.all([
        this.prisma.$queryRawUnsafe('SELECT 1'),
        this.redis.client.ping(),
        this.storage.client.bucketExists(this.storage.bucket),
      ]);
      const result = await Promise.race([
        check,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('依赖检查超时')), 3000);
        }),
      ]);
      if (!result[2]) throw new Error('存储桶尚未初始化');
      return { status: 'ok', mysql: 'up', redis: 'up', minio: 'up' };
    } catch {
      throw new ServiceUnavailableException('基础服务尚未就绪');
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
