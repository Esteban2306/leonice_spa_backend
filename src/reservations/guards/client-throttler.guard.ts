import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    const phone = (req.body as { client?: { phone?: string } })?.client?.phone;
    return Promise.resolve(phone ? `phone:${phone}` : `ip:${req.ip}`);
  }
}
