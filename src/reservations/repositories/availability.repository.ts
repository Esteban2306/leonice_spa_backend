import { Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;
import { HOLDING_EXCLUDED_STATUSES } from '../domain/reservation-status.constants';

interface AttemptToHoldSlotParams {
  categoryId: string;
  treatmentId: string;
  clientId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  finalPrice: number;
  finalDurationMinutes: number;
}

@Injectable()
export class AvailabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCapacityForCategory(
    categoryId: string,
    client: PrismaClientOrTx = this.prisma.client,
  ): Promise<number> {
    const result = await client.capacityPool.aggregate({
      where: { categoryId, isActive: true },
      _sum: { maxConcurrent: true },
    });
    return result._sum.maxConcurrent ?? 0;
  }

  // trae todas las reservas acrtivas del dia en una sola consulta, para que los horarios de candidatos se hagan en memoria que es mas barato
  async getHoldingReservationsInRange(
    categoryId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ) {
    return this.prisma.client.reservation.findMany({
      where: {
        categoryId,
        status: { notIn: HOLDING_EXCLUDED_STATUSES },
        scheduledStart: { gte: rangeStart },
        scheduledEnd: { lte: rangeEnd },
      },
      select: { scheduledStart: true, scheduledEnd: true },
    });
  }

  /*
  Este es el camino que escritura que se utiliza en el camino, utilizo SQL crudo, 
  pero se evalua dentro de la transaccion que ya sostiene el advisory lock asi el resultado no puede
  perder informacion entre la lectura y la escritura.

  Se hace uso de LATERAL JOIN ya que el volumen de transacciones por categoria es minisculo,
  lo cual cual hace que sea mas simple la lectura y manetinimiento, sin ningun costo real de rendimiento
  en esta parte, Los literales se escriben literalmente en sql porque sin una constante fija en el codigo,
  nunca entrada de usuario no hay inyeccion en este punto.
  */
  async getMaxConcurrentInWindow(
    tx: Prisma.TransactionClient,
    categoryId: string,
    candidateStart: Date,
    candidateEnd: Date,
  ): Promise<number> {
    const result = await tx.$queryRaw<{ max_concurrent: bigint | null }[]>`
    WITH candidate_points AS (
        SELECT ${candidateStart}::timestamptz AS ts
        UNION
        SELECT scheduled_start
        FROM reservations
        WHERE category_id = ${categoryId}
          AND status NOT IN ('CANCELADA', 'NO_SHOW', 'REPROGRAMADA')
          AND scheduled_start >= ${candidateStart}
          AND scheduled_start < ${candidateEnd}
      )
      SELECT COALESCE(MAX(active_count), 0) AS max_concurrent
      FROM candidate_points cp
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS active_count
        FROM reservations r
        WHERE r.category_id = ${categoryId}
          AND r.status NOT IN ('CANCELADA', 'NO_SHOW', 'REPROGRAMADA')
          AND r.scheduled_start <= cp.ts
          AND r.scheduled_end > cp.ts
      ) counts;
    `;

    return Number(result[0]?.max_concurrent ?? 0);
  }

  /*
  en esta funcion se toma el advisory lock (fecha, categoria) dentro de una transaccion
  y ejecuta el callback mientras lo sostiene. se librea solo al terminar la transaccion,
  nunca hayque liberarlo a mano.
  */
  async withCategoryLock<T>(
    categoryId: string,
    date: Date,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const dayKey = date.toISOString().slice(0, 10);
    const lockKey = `${dayKey}:${categoryId}`;

    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      return fn(tx);
    });
  }

  async withCategoriesLock<T>(
    categoryIds: string[],
    date: Date,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const dayKey = date.toISOString().slice(0, 10);
    const sortedUniqueIds = [...new Set(categoryIds)].sort();

    return this.prisma.client.$transaction(async (tx) => {
      for (const categoryId of sortedUniqueIds) {
        const lockKey = `${dayKey}:${categoryId}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      }
      return fn(tx);
    });
  }

  /*
  toma el lock y revalida en fresco, crea la reserva si hay cupo, existe principalmente
  para poder demostrar y probar que la garantia de concurrencia funciona.
  */

  async attemptToHoldSlot(
    params: AttemptToHoldSlotParams,
  ): Promise<{ success: boolean; reservationId?: string }> {
    return this.withCategoryLock(
      params.categoryId,
      params.scheduledStart,
      async (tx) => {
        const capacity = await this.getCapacityForCategory(
          params.categoryId,
          tx,
        );
        const concurrent = await this.getMaxConcurrentInWindow(
          tx,
          params.categoryId,
          params.scheduledStart,
          params.scheduledEnd,
        );

        if (concurrent >= capacity) {
          return { success: false };
        }

        const reservation = await tx.reservation.create({
          data: {
            clientId: params.clientId,
            categoryId: params.categoryId,
            treatmentId: params.treatmentId,
            status: ReservationStatus.PENDIENTE_DEPOSITO,
            channel: 'WEB',
            scheduledStart: params.scheduledStart,
            scheduledEnd: params.scheduledEnd,
            finalPrice: params.finalPrice,
            finalDurationMinutes: params.finalDurationMinutes,
          },
        });

        return { success: true, reservationId: reservation.id };
      },
    );
  }
}
