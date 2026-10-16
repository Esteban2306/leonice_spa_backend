import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

import { clientIpTracker } from '../../config/throttler.config';

@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    return Promise.resolve(clientIpTracker(req));
  }
}
