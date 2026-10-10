import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import {
  verifyConduitMessageStatusSignature,
  verifyConduitMessageStatusSignatureV2,
} from '../../common/conduit-security/verify-conduit-signature';

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

    const secret = this.config.getOrThrow<string>('CONDUIT_WEBHOOK_SECRET');
    const signatureV2 = req.headers['x-conduit-signature-v2'] as
      string | undefined;
    const timestamp = req.headers['x-conduit-timestamp'] as string | undefined;

    // V2 (con timestamp) es obligatoria salvo que se habilite explícitamente
    // la firma antigua: si se aceptara V1 como respaldo, bastaría con quitar
    // los headers V2 de un webhook capturado para reenviarlo.
    const allowLegacy =
      this.config.get<string>('CONDUIT_WEBHOOK_ALLOW_LEGACY_SIGNATURE') ===
      'true';

    const isValid = signatureV2
      ? verifyConduitMessageStatusSignatureV2(
          req.rawBody,
          signatureV2,
          timestamp,
          secret,
        )
      : allowLegacy &&
        verifyConduitMessageStatusSignature(
          req.rawBody,
          req.headers['x-conduit-signature'] as string | undefined,
          secret,
        );
    if (!isValid) {
      throw new UnauthorizedException('Firma de Conduit inválida');
    }

    return true;
  }
}
