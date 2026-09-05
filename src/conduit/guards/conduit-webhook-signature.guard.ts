import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { verifyConduitMessageStatusSignature } from '../../common/conduit-security/verify-conduit-signature';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Injectable()
export class ConduitWebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest>();

    if (!req.rawBody) {
      throw new UnauthorizedException(
        'No se pudo leer el cuerpo de la petición',
      );
    }

    const signature = req.headers['x-conduit-signature'] as string | undefined;
    const secret = this.config.getOrThrow<string>('CONDUIT_WEBHOOK_SECRET');

    const isValid = verifyConduitMessageStatusSignature(
      req.rawBody,
      signature,
      secret,
    );
    if (!isValid) {
      throw new UnauthorizedException('Firma de Conduit inválida');
    }

    return true;
  }
}
