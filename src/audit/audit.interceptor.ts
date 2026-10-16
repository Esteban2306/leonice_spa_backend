import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { Observable, from } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AuditService } from './audit.service';
import {
  AuditEntityType,
  MatchedAuditRule,
  extractResultIds,
  matchAuditRule,
  redactAuditValue,
} from './audit-rules';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const matched = matchAuditRule(req.method, req.path);
    if (!matched) return next.handle();

    return from(this.loadSnapshot(matched)).pipe(
      mergeMap((before) =>
        next.handle().pipe(
          tap((result: unknown) => {
            void this.record(req, matched, before, result);
          }),
        ),
      ),
    );
  }

  private async loadSnapshot(matched: MatchedAuditRule): Promise<unknown> {
    if (!matched.paramId) return undefined;
    try {
      return await this.findEntity(matched.rule.entityType, matched.paramId);
    } catch {
      return undefined;
    }
  }

  private async record(
    req: Request,
    matched: MatchedAuditRule,
    before: unknown,
    result: unknown,
  ): Promise<void> {
    const ids =
      matched.rule.idSource === 'param'
        ? matched.paramId
          ? [matched.paramId]
          : []
        : extractResultIds(matched.rule.idSource, result);
    if (ids.length === 0) return;

    const userId = this.userIdOf(req);
    const userAgent = req.get('User-Agent') ?? null;
    const resultReservations =
      matched.rule.idSource === 'result-reservations' &&
      result &&
      typeof result === 'object'
        ? (result as { reservations?: unknown[] }).reservations
        : undefined;

    for (const [index, entityId] of ids.entries()) {
      const newValue = resultReservations ? resultReservations[index] : result;
      try {
        await this.auditService.logAction(
          userId,
          matched.rule.action,
          matched.rule.entityType,
          entityId,
          this.toJson(before),
          this.toJson(newValue),
          req.ip ?? null,
          userAgent ?? undefined,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `No se pudo registrar la auditoría ${matched.rule.action} de ${entityId}: ${message}`,
        );
      }
    }
  }

  private findEntity(entityType: AuditEntityType, id: string) {
    const where = { where: { id } };
    switch (entityType) {
      case 'Client':
        return this.prisma.client.client.findUnique(where);
      case 'Reservation':
        return this.prisma.client.reservation.findUnique(where);
      case 'Treatment':
        return this.prisma.client.treatment.findUnique(where);
      case 'CapacityPool':
        return this.prisma.client.capacityPool.findUnique(where);
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    return JSON.parse(
      JSON.stringify(redactAuditValue(value)),
    ) as Prisma.InputJsonValue;
  }

  private userIdOf(req: Request): string | null {
    const user = req.user as { id?: unknown } | undefined;
    return typeof user?.id === 'string' ? user.id : null;
  }
}
