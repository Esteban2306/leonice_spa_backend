import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ConduitToolAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const providedKey = req.headers['x-api-key'] as string | undefined;
    const expectedKey = this.config.getOrThrow<string>('CONDUIT_TOOL_API_KEY');

    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException('API key inválida');
    }
    return true;
  }
}
