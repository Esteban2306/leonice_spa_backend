import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

@Injectable()
export class ConduitToolAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const providedKey = req.headers['x-api-key'];
    const expectedKey = this.config.getOrThrow<string>('CONDUIT_TOOL_API_KEY');

    if (
      typeof providedKey !== 'string' ||
      !this.safeEquals(providedKey, expectedKey)
    ) {
      throw new UnauthorizedException('API key inválida');
    }
    return true;
  }

  private safeEquals(a: string, b: string): boolean {
    const digestA = createHash('sha256').update(a).digest();
    const digestB = createHash('sha256').update(b).digest();
    return timingSafeEqual(digestA, digestB);
  }
}
