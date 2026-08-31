import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Prisma,
  Reservation,
  ReservationChannel,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { AvailabilityRepository } from '../repositories/availability.repository';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ClientsService } from 'src/clients/clients.service';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from 'src/infrastructure/queue/queue.constants';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { CreateReservationDto } from '../dto/create-reservation.dto';
import { validateAdvancedWindow } from '../validators/validate-advance-window';
import { fitsOperatingHours } from '../domain/validate-operating-hours';
import { assertNoSameDayCategoryConflict } from '../validators/assert-no-same-day-category-conflict';
import { assertNoDuplicateCategoriesInCombo } from '../validators/assert-no-duplicate-categories-in-combo';
import { DomainException } from 'src/common/exceptions/domain.exception';
import {
  DEPOSITO_TIMEOUT_MS,
  VALORACION_TIMEOUT_MS,
} from '../domain/reservation-timing.constants';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { getDayBoundaries } from '../domain/day-boundaries';
import { getOperatingWindowsForDate } from '../domain/operating-hours';
import { generateAvailableSlots } from '../domain/availability-calculator';
import {
  sequenceComboTreatments,
  TreatmentTimingInput,
} from '../domain/sequence-combo-treatments';
import {
  overlapsAny,
  latestConflictEnd,
  TimeInterval,
} from '../domain/personal-conflict-checker';
import { findNearestSlot } from '../domain/find-nearest-slot';
import {
  buildBookingSummary,
  BookedSegmentSummary,
} from '../domain/reservation-booking-summary';
import { assertNoDuplicateTreatmentsInRequest } from '../validators/assert-no-duplicate-treatments-in-request';
import { determineTreatmentPricing } from 'src/catalog/treatments/validators/compute-treatment-pricing';

export interface CreateReservationResult {
  reservations: Reservation[];
  summary: string;
}

@Injectable()
export class CreateReservationOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly reservationsRepository: ReservationsRepository,
    private readonly clientService: ClientsService,
    private readonly eventBus: EventBusService,
    @InjectQueue(QUEUE_NAMES.RESERVATION_TIMEOUTS)
    private readonly timeoutsQueue: Queue,
  ) {}

  async execute(dto: CreateReservationDto): Promise<CreateReservationResult> {
    const client = await this.clientService.resolveOrCreateForBooking(
      dto.client,
    );

    const treatmentIds = dto.treatments;
    assertNoDuplicateTreatmentsInRequest(treatmentIds);

    const treatments = await this.prisma.client.treatment.findMany({
      where: { id: { in: treatmentIds }, isActive: true },
      include: {
        category: true,
        hairLengthPricing: true,
        hairColorSurcharges: true,
      },
    });
    if (treatments.length !== treatmentIds.length) {
      throw new NotFoundException(
        'Uno o más tratamientos no existen o no están activos',
      );
    }
    assertNoDuplicateCategoriesInCombo(treatments.map((t) => t.categoryId));

    const requestedStart = new Date(dto.scheduledStart);
    validateAdvancedWindow(requestedStart);

    const timingInputs: TreatmentTimingInput[] = treatments.map((t) => {
      const pricing = determineTreatmentPricing(t, client);
      return {
        treatmentId: t.id,
        treatmentName: t.name,
        categoryId: t.categoryId,
        categoryName: t.category.name,
        isPrincipal: t.category.isPrincipal,
        durationMinutes: pricing.durationMinutes,
        price: pricing.price,
        forcesAssessment: t.requiresPriorAssessment || pricing.forcesAssessment,
        needsHairProfile: pricing.needsHairProfile,
      };
    });

    const draftSegments = sequenceComboTreatments(timingInputs, requestedStart);
    const comboGroupId = draftSegments.length > 1 ? randomUUID() : null;

    const categoryIds = [...new Set(treatments.map((t) => t.categoryId))];
    const { dayStart, dayEnd } = getDayBoundaries(requestedStart);

    const { reservations, resolvedSegments } =
      await this.availabilityRepository.withCategoriesLock(
        categoryIds,
        requestedStart,
        async (tx) => {
          const existingIntervals: TimeInterval[] =
            await this.reservationsRepository.findActiveIntervalsForClientOnDay(
              client.id,
              dayStart,
              dayEnd,
              tx,
            );

          const resolved: BookedSegmentSummary[] = [];
          const created: Reservation[] = [];

          for (const draft of draftSegments) {
            const treatment = treatments.find(
              (t) => t.id === draft.treatmentId,
            )!;

            const conflictIntervals: TimeInterval[] = [
              ...existingIntervals,
              ...created.map((r) => ({
                start: r.scheduledStart,
                end: r.scheduledEnd,
              })),
            ];

            const placement = await this.resolvePlacement({
              tx,
              categoryId: draft.categoryId,
              categoryName: draft.categoryName,
              durationMinutes: draft.durationMinutes,
              idealStart: draft.scheduledStart,
              dayStart,
              dayEnd,
              conflictIntervals,
            });

            const hasCategoryConflict =
              await this.reservationsRepository.hasActiveReservationInCategoryOnDay(
                client.id,
                draft.categoryId,
                dayStart,
                dayEnd,
                undefined,
                tx,
              );
            assertNoSameDayCategoryConflict(
              draft.categoryName,
              hasCategoryConflict,
            );

            const requiresAssessment = treatment.requiresPriorAssessment;
            const price = requiresAssessment
              ? (treatment.basePriceMax ?? 0)
              : (treatment.basePriceMin ?? 0);
            const initialStatus = requiresAssessment
              ? ReservationStatus.PENDIENTE_VALORACION
              : ReservationStatus.PENDIENTE_DEPOSITO;

            const createdReservation = await tx.reservation.create({
              data: {
                clientId: client.id,
                categoryId: draft.categoryId,
                treatmentId: draft.treatmentId,
                status: initialStatus,
                channel: dto.channel ?? ReservationChannel.WEB,
                scheduledStart: placement.scheduledStart,
                scheduledEnd: placement.scheduledEnd,
                finalPrice: price,
                finalDurationMinutes: draft.durationMinutes,
                comboGroupId,
              },
            });

            created.push(createdReservation);
            resolved.push({
              treatmentName: treatment.name,
              scheduledStart: placement.scheduledStart,
              scheduledEnd: placement.scheduledEnd,
              wasAdjusted: placement.wasAdjusted,
              adjustmentReason: placement.adjustmentReason,
            });
          }

          return { reservations: created, resolvedSegments: resolved };
        },
      );

    for (let i = 0; i < reservations.length; i++) {
      const reservation = reservations[i];
      const draft = draftSegments[i];

      if (reservation.status === ReservationStatus.PENDIENTE_VALORACION) {
        await this.timeoutsQueue.add(
          JOB_NAMES.VALORACION_TIMEOUT,
          { reservationId: reservation.id },
          { delay: VALORACION_TIMEOUT_MS },
        );
      } else {
        await this.timeoutsQueue.add(
          JOB_NAMES.DEPOSITO_TIMEOUT,
          { reservationId: reservation.id },
          { delay: DEPOSITO_TIMEOUT_MS },
        );
      }

      this.eventBus.publish(EVENT_TYPES.RESERVATION_CREATED, {
        reservationId: reservation.id,
        clientId: reservation.clientId,
        clientPhone: client.phone,
        treatmentId: reservation.treatmentId,
        categoryId: reservation.categoryId,
        status: reservation.status,
        scheduledStart: reservation.scheduledStart,
        channel: reservation.channel,
      });

      if (draft.needsHairProfile) {
        this.eventBus.publish(EVENT_TYPES.RESERVATION_NEEDS_HAIR_PROFILE, {
          reservationId: reservation.id,
          clientId: reservation.clientId,
          clientPhone: client.phone,
          treatmentId: reservation.treatmentId,
          treatmentName: draft.treatmentName,
          scheduledStart: reservation.scheduledStart,
        });
      }
    }

    return { reservations, summary: buildBookingSummary(resolvedSegments) };
  }

  private async resolvePlacement(params: {
    tx: Prisma.TransactionClient;
    categoryId: string;
    categoryName: string;
    durationMinutes: number;
    idealStart: Date;
    dayStart: Date;
    dayEnd: Date;
    conflictIntervals: TimeInterval[];
  }): Promise<{
    scheduledStart: Date;
    scheduledEnd: Date;
    wasAdjusted: boolean;
    adjustmentReason?: string;
  }> {
    const {
      tx,
      categoryId,
      categoryName,
      durationMinutes,
      idealStart,
      dayStart,
      dayEnd,
      conflictIntervals,
    } = params;

    let candidateStart = idealStart;
    let wasAdjusted = false;
    let adjustmentReason: string | undefined;

    const initialConflictEnd = latestConflictEnd(
      candidateStart,
      new Date(candidateStart.getTime() + durationMinutes * 60_000),
      conflictIntervals,
    );
    if (initialConflictEnd) {
      candidateStart = initialConflictEnd;
      wasAdjusted = true;
      adjustmentReason =
        'se ajustó para no cruzarse con otra cita tuya el mismo día';
    }

    let candidateEnd = new Date(
      candidateStart.getTime() + durationMinutes * 60_000,
    );
    const capacity = await this.availabilityRepository.getCapacityForCategory(
      categoryId,
      tx,
    );
    const fits = fitsOperatingHours(candidateStart, candidateEnd);
    const stillConflicts = overlapsAny(
      candidateStart,
      candidateEnd,
      conflictIntervals,
    );
    const concurrent = fits
      ? await this.availabilityRepository.getMaxConcurrentInWindow(
          tx,
          categoryId,
          candidateStart,
          candidateEnd,
        )
      : Infinity;

    if (!fits || stillConflicts || concurrent >= capacity) {
      const held =
        await this.availabilityRepository.getHoldingReservationsInRange(
          categoryId,
          dayStart,
          dayEnd,
        );
      const windows = getOperatingWindowsForDate(idealStart);
      const allCandidates = generateAvailableSlots({
        operatingWindows: windows,
        held,
        durationMinutes,
        capacity,
      });
      const validCandidates = allCandidates.filter((c) => {
        const end = new Date(c.getTime() + durationMinutes * 60_000);
        return !overlapsAny(c, end, conflictIntervals);
      });

      const nearest = findNearestSlot(validCandidates, idealStart);
      if (!nearest) {
        throw new DomainException(
          `No hay cupo disponible para ${categoryName} ese día, ni siquiera ajustando el horario. Intenta otro día.`,
        );
      }

      candidateStart = nearest;
      candidateEnd = new Date(nearest.getTime() + durationMinutes * 60_000);
      wasAdjusted = true;
      adjustmentReason = 'se reubicó al horario disponible más cercano ese día';
    }

    return {
      scheduledStart: candidateStart,
      scheduledEnd: candidateEnd,
      wasAdjusted,
      adjustmentReason,
    };
  }
}
