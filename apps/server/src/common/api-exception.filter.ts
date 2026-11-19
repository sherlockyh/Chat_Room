import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        response.status(409).json({ statusCode: 409, message: '记录已存在' });
        return;
      }
      if (error.code === 'P2025') {
        response.status(404).json({ statusCode: 404, message: '记录不存在' });
        return;
      }
    }
    this.logger.error(error instanceof Error ? error.stack : error);
    response.status(500).json({ statusCode: 500, message: '服务暂时不可用' });
  }
}
