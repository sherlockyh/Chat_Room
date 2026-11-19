import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  canActivate(context: ExecutionContext) {
    return context.getType() === 'http' ? super.canActivate(context) : Promise.resolve(true);
  }
}
