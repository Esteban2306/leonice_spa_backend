import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

type AuditEntityType = 'Client' | 'Reservation' | 'Treatment' | 'CapacityPool';
type AuditAction =
  | 'CREATE_CLIENT'
  | 'UPDATE_CLIENT'
  | 'DELETE_CLIENT'
  | 'CREATE_RESERVATION'
  | 'UPDATE_RESERVATION'
  | 'CANCEL_RESERVATION'
  | 'CREATE_TREATMENT'
  | 'UPDATE_TREATMENT'
  | 'DELETE_TREATMENT'
  | 'UPDATE_CAPACITY_POOL';

interface AuditConfig {
  action: AuditAction;
  entityType: AuditEntityType;
  getEntityId: (req: Request) => string | null;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  private readonly normalizeStringOrArray = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) {
      const first = value[0];
      if (first === null || first === undefined) return null;
      if (typeof first === 'string') return first;
      if (typeof first === 'number' || typeof first === 'boolean')
        return String(first);
      if (typeof first === 'object') return JSON.stringify(first);
      return String(first);
    }
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();

    const userId: string | null = ((): string | null => {
      const user = req.user;
      if (user && typeof user === 'object' && user !== null && 'id' in user) {
        const id = (user as { id: unknown }).id;
        if (typeof id === 'string') return id;
      }
      return null;
    })();

    const ip: string | null = this.normalizeStringOrArray(req.ip);

    const path: string = req.path;
    const method: string = req.method;
    const userAgent: string = req.get('User-Agent') ?? '';

    const config: AuditConfig | null = this.getAuditConfig(path, method);
    if (!config) return next.handle();

    const { action, entityType, getEntityId } = config;
    const entityId: string | null = getEntityId(req);

    if (entityId === null) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (result) => {
        const oldValue: Prisma.InputJsonValue | undefined =
          await this.getOldValue(entityType, entityId);
        const newValue: Prisma.InputJsonValue | undefined =
          this.getNewValue(result);

        await this.auditService.logAction(
          userId,
          action,
          entityType,
          entityId,
          oldValue,
          newValue,
          ip,
          userAgent,
        );
      }),
    );
  }

  private readonly getAuditConfig = (
    path: string,
    method: string,
  ): AuditConfig | null => {
    const configs: Record<string, Record<string, AuditConfig>> = {
      '/clients': {
        POST: {
          action: 'CREATE_CLIENT',
          entityType: 'Client',
          getEntityId: (req: Request): string | null => {
            const body = req.body as unknown;
            if (
              body &&
              typeof body === 'object' &&
              body !== null &&
              'id' in body
            ) {
              const id = (body as { id: unknown }).id;
              if (typeof id === 'string') return id;
            }
            return null;
          },
        },
        PATCH: {
          action: 'UPDATE_CLIENT',
          entityType: 'Client',
          getEntityId: (req: Request): string | null => {
            const params = req.params as unknown;
            if (
              params &&
              typeof params === 'object' &&
              params !== null &&
              'id' in params
            ) {
              const id = (params as { id: unknown }).id;
              if (typeof id === 'string') return id;
            }
            return null;
          },
        },
        DELETE: {
          action: 'DELETE_CLIENT',
          entityType: 'Client',
          getEntityId: (req: Request): string | null => {
            const params = req.params as unknown;
            if (
              params &&
              typeof params === 'object' &&
              params !== null &&
              'id' in params
            ) {
              const id = (params as { id: unknown }).id;
              if (typeof id === 'string') return id;
            }
            return null;
          },
        },
      },
      '/reservations': {
        POST: {
          action: 'CREATE_RESERVATION',
          entityType: 'Reservation',
          getEntityId: (req: Request): string | null => {
            const body = req.body as unknown;
            if (
              body &&
              typeof body === 'object' &&
              body !== null &&
              'id' in body
            ) {
              const id = (body as { id: unknown }).id;
              if (typeof id === 'string') return id;
            }
            return null;
          },
        },
        PATCH: {
          action: 'UPDATE_RESERVATION',
          entityType: 'Reservation',
          getEntityId: (req: Request): string | null => {
            const params = req.params as unknown;
            if (
              params &&
              typeof params === 'object' &&
              params !== null &&
              'id' in params
            ) {
              const id = (params as { id: unknown }).id;
              if (typeof id === 'string') return id;
            }
            return null;
          },
        },
        DELETE: {
          action: 'CANCEL_RESERVATION',
          entityType: 'Reservation',
          getEntityId: (req: Request): string | null => {
            const params = req.params as unknown;
            if (
              params &&
              typeof params === 'object' &&
              params !== null &&
              'id' in params
            ) {
              const id = (params as { id: unknown }).id;
              if (typeof id === 'string') return id;
            }
            return null;
          },
        },
      },
      '/treatments': {
        POST: {
          action: 'CREATE_TREATMENT',
          entityType: 'Treatment',
          getEntityId: (req: Request): string | null => {
            const body = req.body as unknown;
            if (
              body &&
              typeof body === 'object' &&
              body !== null &&
              'id' in body
            ) {
              const id = (body as { id: unknown }).id;
              if (typeof id === 'string') return id;
            }
            return null;
          },
        },
        PATCH: {
          action: 'UPDATE_TREATMENT',
          entityType: 'Treatment',
          getEntityId: (req: Request): string | null => {
            const params = req.params as unknown;
            if (
              params &&
              typeof params === 'object' &&
              params !== null &&
              'id' in params
            ) {
              const id = (params as { id: unknown }).id;
              if (typeof id === 'string') return id;
            }
            return null;
          },
        },
        DELETE: {
          action: 'DELETE_TREATMENT',
          entityType: 'Treatment',
          getEntityId: (req: Request): string | null => {
            const params = req.params as unknown;
            if (
              params &&
              typeof params === 'object' &&
              params !== null &&
              'id' in params
            ) {
              const id = (params as { id: unknown }).id;
              if (typeof id === 'string') return id;
            }
            return null;
          },
        },
      },
      '/capacity-pools': {
        PATCH: {
          action: 'UPDATE_CAPACITY_POOL',
          entityType: 'CapacityPool',
          getEntityId: (req: Request): string | null => {
            const params = req.params as unknown;
            if (
              params &&
              typeof params === 'object' &&
              params !== null &&
              'id' in params
            ) {
              const id = (params as { id: unknown }).id;
              if (typeof id === 'string') return id;
            }
            return null;
          },
        },
      },
    };

    for (const [basePath, methods] of Object.entries(configs)) {
      if (path.startsWith(basePath) && methods[method]) {
        return { ...methods[method] };
      }
    }
    return null;
  };

  private readonly getOldValue = async (
    entityType: AuditEntityType,
    entityId: string,
  ): Promise<Prisma.InputJsonValue | undefined> => {
    const model = entityType.toLowerCase();
    try {
      const prismaModel = this.prisma[model as keyof PrismaService];
      if (
        prismaModel &&
        typeof prismaModel === 'object' &&
        prismaModel !== null &&
        'findUnique' in prismaModel &&
        typeof (prismaModel as { findUnique: unknown }).findUnique ===
          'function'
      ) {
        const result = await (
          prismaModel as {
            findUnique: (args: {
              where: { id: string };
            }) => Promise<Prisma.InputJsonValue | null>;
          }
        ).findUnique({ where: { id: entityId } });
        return result ?? undefined;
      }
      return undefined;
    } catch {
      return undefined;
    }
  };

  private readonly getNewValue = (
    result: Prisma.InputJsonValue | undefined,
  ): Prisma.InputJsonValue | undefined => {
    return result;
  };
}
