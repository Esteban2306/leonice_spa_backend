import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { PlacementCheckService } from '../service/placement-check.service';
import { placementRejectionException } from '../domain/placement-rejection.exception';
import { CreateReservationDto } from '../dto/create-reservation.dto';
import { validateAdvancedWindow } from '../validators/validate-advance-window';
import { assertNoSameDayCategoryConflict } from '../validators/assert-no-same-day-category-conflict';
import { assertNoDuplicateCategoriesInCombo } from '../validators/assert-no-duplicate-categories-in-combo';
import { DEPOSITO_TIMEOUT_MS } from '../domain/reservation-timing.constants';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { getDayBoundaries } from '../domain/day-boundaries';
import { getCalendarDayKey } from '../domain/calendar-day-key';
import { OperatingScheduleService } from '../service/operating-schedule.service';
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
import { PromotionsService } from 'src/promotions/promotions.service';
import { resolveApplicablePromotion } from 'src/promotions/domain/resolve-applicable-promotion';
import { applyPromotionDiscount } from 'src/clients/domain/compute-treatment-pricing';
import { DepositCreditService } from '../service/deposit-credit.service';
import { AppException } from '../../common/errors/app.exception';

export interface CreateReservationResult {
  reservations: Reservation[];
  summary: string;
  creditAppliedReservationIds: string[];
}

@Injectable()
export class CreateReservationOrchestrator {
  private readonly logger = new Logger(CreateReservationOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly reservationsRepository: ReservationsRepository,
    private readonly clientService: ClientsService,
    private readonly eventBus: EventBusService,
    private readonly promotionsService: PromotionsService,
    private readonly placementCheck: PlacementCheckService,
    private readonly depositCredit: DepositCreditService,
    private readonly operatingSchedule: OperatingScheduleService,
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

    const activePromotions =
      await this.promotionsService.findAllCurrentlyValid();

    const timingInputs: TreatmentTimingInput[] = treatments.map((t) => {
      const pricing = determineTreatmentPricing(t, client);
      const promo = resolveApplicablePromotion(activePromotions, {
        treatmentId: t.id,
        categoryId: t.categoryId,
      });
      const finalPricing = applyPromotionDiscount(pricing, promo);
      return {
        treatmentId: t.id,
        treatmentName: t.name,
        categoryId: t.categoryId,
        categoryName: t.category.name,
        isPrincipal: t.category.isPrincipal,
        durationMinutes: finalPricing.durationMinutes,
        price: finalPricing.price,
        forcesAssessment: t.requiresPriorAssessment || pricing.forcesAssessment,
        needsHairProfile: pricing.needsHairProfile,
      };
    });

    const draftSegments = sequenceComboTreatments(timingInputs, requestedStart);
    const comboGroupId = draftSegments.length > 1 ? randomUUID() : null;

    const categoryIds = [...new Set(treatments.map((t) => t.categoryId))];
    const { dayStart, dayEnd } = getDayBoundaries(requestedStart);

    const { reservations, resolvedSegments, creditAppliedIds } =
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

          const creditAppliedIds: string[] = [];
          const availableCredits =
            await this.depositCredit.findAvailableForClient(client.id, tx);
          const credit = availableCredits[0] ?? null;
          const hasCredit = credit !== null;

          for (const [index, draft] of draftSegments.entries()) {
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
              clientId: client.id,
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

            const price = treatment.requiresPriorAssessment
              ? (treatment.basePriceMax ?? 0)
              : (treatment.basePriceMin ?? 0);
            const initialStatus = ReservationStatus.PENDIENTE_DEPOSITO;

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
                depositExpiresAt: hasCredit
                  ? null
                  : new Date(Date.now() + DEPOSITO_TIMEOUT_MS),
              },
            });

            if (credit && index === 0) {
              const applied = await this.depositCredit.applyToReservation(
                tx,
                credit.depositId,
                credit.appliedToReservationId,
                createdReservation.id,
              );
              if (!applied) {
                throw new AppException('CREDIT_ALREADY_APPLIED');
              }
            }
            if (hasCredit) creditAppliedIds.push(createdReservation.id);

            created.push(createdReservation);
            resolved.push({
              treatmentName: treatment.name,
              scheduledStart: placement.scheduledStart,
              scheduledEnd: placement.scheduledEnd,
              wasAdjusted: placement.wasAdjusted,
              adjustmentReason: placement.adjustmentReason,
            });
          }

          return {
            reservations: created,
            resolvedSegments: resolved,
            creditAppliedIds,
          };
        },
      );

    for (let i = 0; i < reservations.length; i++) {
      const reservation = reservations[i];
      const draft = draftSegments[i];

      if (
        reservation.status === ReservationStatus.PENDIENTE_DEPOSITO &&
        reservation.depositExpiresAt
      ) {
        await this.scheduleDepositTimeout(
          reservation.id,
          reservation.depositExpiresAt,
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

    return {
      reservations,
      summary: buildBookingSummary(resolvedSegments),
      creditAppliedReservationIds: creditAppliedIds,
    };
  }

  private async resolvePlacement(params: {
    tx: Prisma.TransactionClient;
    clientId: string;
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
      clientId,
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

    const decision = await this.placementCheck.evaluate(tx, {
      clientId,
      categoryId,
      start: candidateStart,
      end: candidateEnd,
    });

    if (decision.ok) {
      return {
        scheduledStart: candidateStart,
        scheduledEnd: candidateEnd,
        wasAdjusted,
        adjustmentReason,
      };
    }

    if (decision.reason === 'CATEGORY_DAY_CONFLICT') {
      assertNoSameDayCategoryConflict(categoryName, true);
      throw placementRejectionException(decision.reason);
    }
    if (
      decision.reason === 'INVALID_RANGE' ||
      decision.reason === 'IN_THE_PAST'
    ) {
      throw placementRejectionException(decision.reason);
    }

    const capacity = await this.availabilityRepository.getCapacityForCategory(
      categoryId,
      tx,
    );
    const held =
      await this.availabilityRepository.getHoldingReservationsInRange(
        categoryId,
        dayStart,
        dayEnd,
      );
    const windows = await this.operatingSchedule.getWindows(
      idealStart,
      categoryId,
      tx,
    );
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
      throw new AppException('PLACEMENT_NO_SLOT_THAT_DAY', {
        message: `No hay horario disponible para ${categoryName} ese día, ni siquiera ajustando la hora. Intenta otro día.`,
        details: { categoryId, date: getCalendarDayKey(idealStart) },
      });
    }

    candidateStart = nearest;
    candidateEnd = new Date(nearest.getTime() + durationMinutes * 60_000);

    return {
      scheduledStart: candidateStart,
      scheduledEnd: candidateEnd,
      wasAdjusted: true,
      adjustmentReason: 'se reubicó al horario disponible más cercano ese día',
    };
  }

  private async scheduleDepositTimeout(
    reservationId: string,
    expiresAt: Date,
  ): Promise<void> {
    try {
      await this.timeoutsQueue.add(
        JOB_NAMES.DEPOSITO_TIMEOUT,
        { reservationId },
        { delay: Math.max(expiresAt.getTime() - Date.now(), 0) },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo encolar deposito-timeout de ${reservationId}; lo cubrirá el barrido: ${message}`,
      );
    }
  }
}
