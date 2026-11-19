import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

/** 私有桶客户端；上传签名和文件权限随文件业务实现。 */
@Injectable()
export class StorageService {
  readonly client: Client;
  readonly bucket: string;
  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('MINIO_BUCKET');
    this.client = new Client({
      endPoint: config.getOrThrow<string>('MINIO_ENDPOINT'),
      port: Number(config.get('MINIO_PORT', 9000)),
      useSSL: config.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
    });
  }
}
