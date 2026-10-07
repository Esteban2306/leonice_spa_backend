import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Reservation, ReservationStatus } from '@prisma/client';
import { AvailabilityRepository } from '../repositories/availability.repository';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { getCalendarDayKey } from '../domain/calendar-day-key';
import type { PlacementRejection } from '../domain/evaluate-placement';
import {
  isRevivable,
  selectReservationsToRevive,
} from '../domain/select-reservations-to-revive';
import {
  REVIVE_ERROR_CODES,
  ReviveReservationException,
} from '../domain/revive-reservation.exception';
import { PlacementCheckService } from '../service/placement-check.service';

export interface ReviveReservationResult {
  reservations: Reservation[];
}

@Injectable()
export class ReviveReservationOrchestrator {
  private readonly logger = new Logger(ReviveReservationOrchestrator.name);

  constructor(
    private readonly reservationsRepository: ReservationsRepository,
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly placementCheck: PlacementCheckService,
  ) {}

  async execute(reservationId: string): Promise<ReviveReservationResult> {
    const target = await this.reservationsRepository.findById(reservationId);
    if (!target) throw new NotFoundException('Reserva no encontrada');

    const members = target.comboGroupId
      ? await this.reservationsRepository.findByComboGroupId(
          target.comboGroupId,
        )
      : [target];

    const selection = selectReservationsToRevive(target, members);
    if (!selection.ok) {
      throw selection.reason === 'COMBO_NOT_REVIVABLE'
        ? new ReviveReservationException(
            REVIVE_ERROR_CODES.COMBO_NOT_REVIVABLE,
            'No se puede revivir el combo: todas sus reservas deben estar canceladas por vencimiento del depósito.',
            reservationId,
          )
        : new ReviveReservationException(
            REVIVE_ERROR_CODES.NOT_REVIVABLE,
            'Solo se pueden revivir reservas canceladas automáticamente por falta de depósito.',
            reservationId,
          );
    }

    const selected = selection.reservations;
    const dayKey = getCalendarDayKey(selected[0].scheduledStart);
    if (selected.some((r) => getCalendarDayKey(r.scheduledStart) !== dayKey)) {
      throw new ReviveReservationException(
        REVIVE_ERROR_CODES.COMBO_NOT_REVIVABLE,
        'Las reservas del combo no están en el mismo día; reagéndalas manualmente.',
        reservationId,
      );
    }

    const categoryIds = [...new Set(selected.map((r) => r.categoryId))];

    const revived = await this.availabilityRepository.withCategoriesLock(
      categoryIds,
      selected[0].scheduledStart,
      async (tx) => {
        const now = new Date();
        const result: Reservation[] = [];

        for (const candidate of selected) {
          const fresh = await this.reservationsRepository.findById(
            candidate.id,
            tx,
          );
          if (!fresh || !isRevivable(fresh)) {
            throw new ReviveReservationException(
              REVIVE_ERROR_CODES.CONCURRENT_CHANGE,
              'La reserva cambió mientras se intentaba revivir. Revisa su estado actual.',
              candidate.id,
            );
          }

          const decision = await this.placementCheck.evaluate(tx, {
            clientId: fresh.clientId,
            categoryId: fresh.categoryId,
            start: fresh.scheduledStart,
            end: fresh.scheduledEnd,
            excludeReservationId: fresh.id,
            now,
          });
          if (!decision.ok) {
            throw this.toReviveException(decision.reason, fresh.id);
          }

          const applied =
            await this.reservationsRepository.updateStatusIfCurrent(
              fresh.id,
              ReservationStatus.CANCELADA,
              {
                status: ReservationStatus.PENDIENTE_DEPOSITO,
                cancelledAt: null,
                cancellationReason: null,
                cancellationSource: null,
                depositExpiresAt: null,
              },
              tx,
            );
          if (!applied) {
            throw new ReviveReservationException(
              REVIVE_ERROR_CODES.CONCURRENT_CHANGE,
              'La reserva cambió mientras se intentaba revivir. Revisa su estado actual.',
              fresh.id,
            );
          }

          const updated = await this.reservationsRepository.findById(
            fresh.id,
            tx,
          );
          if (!updated) throw new NotFoundException('Reserva no encontrada');
          result.push(updated);
        }

        return result;
      },
    );

    this.logger.log(
      `Reservas revividas a PENDIENTE_DEPOSITO sin plazo: ${revived.map((r) => r.id).join(', ')}`,
    );

    return { reservations: revived };
  }

  private toReviveException(
    reason: PlacementRejection,
    reservationId: string,
  ): ReviveReservationException {
    switch (reason) {
      case 'IN_THE_PAST':
        return new ReviveReservationException(
          REVIVE_ERROR_CODES.SLOT_IN_PAST,
          'La fecha de la reserva ya pasó; reagéndala en lugar de revivirla.',
          reservationId,
        );
      case 'OUTSIDE_OPERATING_HOURS':
        return new ReviveReservationException(
          REVIVE_ERROR_CODES.OUTSIDE_OPERATING_HOURS,
          'El horario de la reserva ya no cae dentro del horario de atención; reagéndala.',
          reservationId,
        );
      case 'NO_CAPACITY':
        return new ReviveReservationException(
          REVIVE_ERROR_CODES.NO_CAPACITY,
          'Ya no hay cupo en ese horario; reagenda la reserva.',
          reservationId,
        );
      case 'CATEGORY_DAY_CONFLICT':
        return new ReviveReservationException(
          REVIVE_ERROR_CODES.CATEGORY_DAY_CONFLICT,
          'El cliente ya tiene otra reserva activa en esta categoría ese día.',
          reservationId,
        );
      case 'CLIENT_OVERLAP':
        return new ReviveReservationException(
          REVIVE_ERROR_CODES.CLIENT_OVERLAP,
          'El cliente tiene otra cita que se cruza con este horario.',
          reservationId,
        );
      case 'INVALID_RANGE':
        return new ReviveReservationException(
          REVIVE_ERROR_CODES.NOT_REVIVABLE,
          'El rango horario de la reserva no es válido; reagéndala.',
          reservationId,
        );
    }
  }
}
