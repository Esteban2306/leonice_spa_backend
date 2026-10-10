import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { AppException } from '../../common/errors/app.exception';
import { normalizePhone } from '../../clients/utils/normalize-phone.util';

export const CONDUIT_TOOL_OPTIONS = 'conduitToolOptions';

export interface ConduitToolOptions {
  /**
   * La herramienta consulta o modifica datos de un cliente existente
   * (reservas, depósitos, perfil): exige un teléfono verificado por Conduit.
   */
  requiresVerifiedContact?: boolean;
}

export const ConduitToolOptionsMeta = (options: ConduitToolOptions) =>
  SetMetadata(CONDUIT_TOOL_OPTIONS, options);

export interface ConduitContact {
  phone: string | null;
  lid: string | null;
}

export type RequestWithConduitContact = Request & {
  conduitContact?: ConduitContact;
};

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Impone la identidad que Conduit verificó (el número del chat de WhatsApp)
 * sobre lo que el modelo de IA haya puesto en la petición. Así, aunque
 * alguien le pida al bot "cancela la cita del 3001234567", solo puede
 * operar sobre sus propias reservas.
 *
 * - Cuerpo: `phone` y `client.phone` se reemplazan por el número verificado.
 * - Query (no modificable de forma fiable en Express 5): debe coincidir.
 * - Chat identificado solo por LID (sin teléfono): se rechazan las
 *   herramientas que operan sobre clientes existentes.
 *
 * Las llamadas sin headers de contacto (scripts internos con la misma API
 * key) siguen funcionando con el teléfono del cuerpo.
 */
@Injectable()
export class ConduitContactInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithConduitContact>();
    const options =
      this.reflector.getAllAndOverride<ConduitToolOptions>(
        CONDUIT_TOOL_OPTIONS,
        [context.getHandler(), context.getClass()],
      ) ?? {};

    const rawPhone = header(req, 'x-conduit-contact-phone');
    const lid = header(req, 'x-conduit-contact-lid') ?? null;

    if (!rawPhone) {
      if (lid && options.requiresVerifiedContact) {
        throw new AppException('CONTACT_NOT_VERIFIED');
      }
      req.conduitContact = { phone: null, lid };
      return next.handle();
    }

    const phone = normalizePhone(rawPhone);
    req.conduitContact = { phone, lid };

    const body = req.body as Record<string, unknown> | undefined;
    if (body && typeof body === 'object') {
      if ('phone' in body) body.phone = phone;
      const client = body.client;
      if (client && typeof client === 'object' && !Array.isArray(client)) {
        (client as Record<string, unknown>).phone = phone;
      }
    }

    const queryPhone = (req.query as Record<string, unknown> | undefined)
      ?.phone;
    if (
      typeof queryPhone === 'string' &&
      normalizePhone(queryPhone) !== phone
    ) {
      throw new AppException('CONTACT_MISMATCH');
    }

    return next.handle();
  }
}
