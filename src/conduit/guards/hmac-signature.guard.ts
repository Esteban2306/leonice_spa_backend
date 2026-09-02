import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Injectable()
export class HmacSignatureGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly cache: SafeCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RawBodyRequest>();

    const signature = req.headers['x-conduit-signature'] as string | undefined;
    const eventId = req.headers['x-conduit-event-id'] as string | undefined;

    if (!signature || !eventId || !req.rawBody) {
      throw new UnauthorizedException(
        'Falta la firma de Conduit o el ID de evento',
      );
    }

    const alreadyProcessed = await this.cache.get<boolean>(
      `conduit:event:${eventId}`,
    );
    if (alreadyProcessed) {
      throw new UnauthorizedException(
        'Este evento ya fue procesado (duplicado)',
      );
    }

    const secret = this.config.getOrThrow<string>('CONDUIT_WEBHOOK_SECRET');
    const expected = createHmac('sha256', secret)
      .update(req.rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    const isValid =
      signatureBuffer.length === expectedBuffer.length &&
      timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      throw new UnauthorizedException('Firma de Conduit inválida');
    }

    await this.cache.set(`conduit:event:${eventId}`, true, 24 * 60 * 60);
    return true;
  }
}
