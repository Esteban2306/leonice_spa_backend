import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, mergeMap } from 'rxjs';
import { AppException } from '../../common/errors/app.exception';
import { normalizePhone } from '../../clients/utils/normalize-phone.util';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  CONDUIT_TOOL_OPTIONS,
  type ConduitToolOptions,
  type RequestWithConduitContact,
} from './conduit-contact.interceptor';

const PHONE_KEYS = new Set(['phone', 'clientPhone']);
const CLIENT_ID_KEYS = new Set(['clientId']);
const RESERVATION_ID_KEYS = new Set(['reservationId']);
const MAX_DEPTH = 12;

export interface IdentityMarkers {
  phones: { path: string; value: string }[];
  clientIds: { path: string; value: string }[];
  reservationIds: { path: string; value: string }[];
}

export function collectIdentityMarkers(
  value: unknown,
  path = '$',
  markers: IdentityMarkers = { phones: [], clientIds: [], reservationIds: [] },
  depth = 0,
): IdentityMarkers {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return markers;
  }
  if (value instanceof Date || Buffer.isBuffer(value)) return markers;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectIdentityMarkers(item, `${path}[${index}]`, markers, depth + 1),
    );
    return markers;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (PHONE_KEYS.has(key) && typeof child === 'string') {
      markers.phones.push({ path: childPath, value: child });
    }
    if (CLIENT_ID_KEYS.has(key) && typeof child === 'string') {
      markers.clientIds.push({ path: childPath, value: child });
    }
    if (RESERVATION_ID_KEYS.has(key) && typeof child === 'string') {
      markers.reservationIds.push({ path: childPath, value: child });
    }
    if (key === 'reservations' && Array.isArray(child)) {
      child.forEach((item: unknown, index) => {
        if (
          item !== null &&
          typeof item === 'object' &&
          typeof (item as { id?: unknown }).id === 'string'
        ) {
          markers.reservationIds.push({
            path: `${childPath}[${index}].id`,
            value: (item as { id: string }).id,
          });
        }
      });
    }
    if (
      key === 'client' &&
      child !== null &&
      typeof child === 'object' &&
      typeof (child as { id?: unknown }).id === 'string'
    ) {
      markers.clientIds.push({
        path: `${childPath}.id`,
        value: (child as { id: string }).id,
      });
    }
    collectIdentityMarkers(child, childPath, markers, depth + 1);
  }
  return markers;
}

@Injectable()
export class ConduitResponseGuardInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ConduitResponseGuardInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithConduitContact>();
    const options =
      this.reflector.getAllAndOverride<ConduitToolOptions>(
        CONDUIT_TOOL_OPTIONS,
        [context.getHandler(), context.getClass()],
      ) ?? {};
    const verifiedPhone = req.conduitContact?.phone ?? null;

    if (options.publicData || !verifiedPhone) return next.handle();

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        await this.assertBelongsTo(verifiedPhone, body, req.path);
        return body;
      }),
    );
  }

  private async assertBelongsTo(
    verifiedPhone: string,
    body: unknown,
    route: string,
  ): Promise<void> {
    const markers = collectIdentityMarkers(body);
    const foreign = markers.phones
      .filter((marker) => normalizePhone(marker.value) !== verifiedPhone)
      .map((marker) => marker.path);

    if (markers.clientIds.length > 0 || markers.reservationIds.length > 0) {
      const owner = await this.prisma.client.client.findUnique({
        where: { phone: verifiedPhone },
        select: { id: true },
      });
      for (const marker of markers.clientIds) {
        if (marker.value !== owner?.id) foreign.push(marker.path);
      }
      if (markers.reservationIds.length > 0) {
        const reservations = await this.prisma.client.reservation.findMany({
          where: { id: { in: markers.reservationIds.map((m) => m.value) } },
          select: { id: true, clientId: true },
        });
        const ownerOf = new Map(reservations.map((r) => [r.id, r.clientId]));
        for (const marker of markers.reservationIds) {
          const clientId = ownerOf.get(marker.value);
          if (clientId !== undefined && clientId !== owner?.id) {
            foreign.push(marker.path);
          }
        }
      }
    }

    if (foreign.length > 0) {
      this.logger.error(
        `Respuesta bloqueada en ${route}: contenía datos de otra persona (${foreign.join(', ')})`,
      );
      throw new AppException('CONTACT_DATA_BLOCKED');
    }
  }
}
