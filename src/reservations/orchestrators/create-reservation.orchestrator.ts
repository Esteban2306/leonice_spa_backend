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
import {
  ClientsService,
  type ResolveClientOptions,
} from 'src/clients/clients.service';
import { PlacementCheckService } from '../service/placement-check.service';
import { placementRejectionException } from '../domain/placement-rejection.exception';
import { CreateReservationDto } from '../dto/create-reservation.dto';
import { validateAdvancedWindow } from '../validators/validate-advance-window';
import { DepositDeadlineService } from '../service/deposit-deadline.service';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { getDayBoundaries } from '../domain/day-boundaries';
import { getCalendarDayKey } from '../domain/calendar-day-key';
import { OperatingScheduleService } from '../service/operating-schedule.service';
import { generateAvailableSlots } from '../domain/availability-calculator';
import { personKey } from '../domain/person-key';
import { minuteOfDay } from '../domain/operating-hours';
import {
  scheduleComboTreatments,
  TreatmentTimingInput,
} from '../domain/schedule-combo-treatments';
import { formatLocalTime } from '../domain/format-local-time';
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
import { ConfirmDepositOrchestrator } from './confirm-deposit.orchestrator';

export interface CreateReservationOptions extends ResolveClientOptions {
  priceOverrides?: ReadonlyMap<string, number>;
}

export interface CreateReservationResult {
  reservations: Reservation[];
  summary: string;
  creditAppliedReservationIds: string[];
}

@Injectable()
export class CreateReservationOrchestrator {
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
    private readonly depositDeadline: DepositDeadlineService,
    private readonly confirmDeposit: ConfirmDepositOrchestrator,
  ) {}

  async execute(
    dto: CreateReservationDto,
    options: CreateReservationOptions = { trustedIdentity: false },
  ): Promise<CreateReservationResult> {
    const client = await this.clientService.resolveOrCreateForBooking(
      dto.client,
      options,
    );
    const dependent = dto.dependent
      ? await this.clientService.resolveDependent(client.id, dto.dependent)
      : null;
    // The hair profile and the deposit credit belong to the client, not to the person she books for.
    const pricingProfile = dependent
      ? { hairLength: null, hairColor: null, hairProfileUpdatedAt: null }
      : client;

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

    const requestedStart = new Date(dto.scheduledStart);
    validateAdvancedWindow(requestedStart);

    const activePromotions = (
      await this.promotionsService.findAllCurrentlyValid()
    ).filter((promotion) => promotion.endsAt >= requestedStart);

    const timingInputs: TreatmentTimingInput[] = treatments.map((t) => {
      const pricing = determineTreatmentPricing(t, pricingProfile);
      const promo = resolveApplicablePromotion(activePromotions, {
        treatmentId: t.id,
        categoryId: t.categoryId,
      });
      const finalPricing = applyPromotionDiscount(pricing, promo);
      const agreedPrice = options.priceOverrides?.get(t.id);
      return {
        treatmentId: t.id,
        treatmentName: t.name,
        categoryId: t.categoryId,
        categoryName: t.category.name,
        isPrincipal: t.category.isPrincipal,
        durationMinutes: finalPricing.durationMinutes,
        price: agreedPrice ?? finalPricing.price,
        forcesAssessment: t.requiresPriorAssessment || pricing.forcesAssessment,
        needsHairProfile: pricing.needsHairProfile,
      };
    });

    const draftSegments = scheduleComboTreatments(timingInputs, requestedStart);
    const comboGroupId = draftSegments.length > 1 ? randomUUID() : null;

    const withoutDeposit = options.trustedIdentity && client.depositExempt;
    const categoryIds = [...new Set(treatments.map((t) => t.categoryId))];
    const { dayStart, dayEnd } = getDayBoundaries(requestedStart);
    const depositClockStartedAt = new Date();

    const { reservations, resolvedSegments, creditAppliedIds } =
      await this.availabilityRepository.withCategoriesLock(
        categoryIds,
        requestedStart,
        async (tx) => {
          const resolved: BookedSegmentSummary[] = [];
          const created: Reservation[] = [];

          const creditAppliedIds: string[] = [];
          const availableCredits = withoutDeposit
            ? []
            : await this.depositCredit.findAvailableForClient(client.id, tx);
          const credit = availableCredits[0] ?? null;
          const hasCredit = credit !== null;
          const startsDepositClock = !hasCredit && !withoutDeposit;
          let depositExpiresAt: Date | null = null;

          for (const [index, draft] of draftSegments.entries()) {
            const treatment = treatments.find(
              (t) => t.id === draft.treatmentId,
            )!;

            const placement =
              index === 0 || comboGroupId === null
                ? await this.resolvePlacement({
                    tx,
                    clientId: client.id,
                    dependentId: dependent?.id ?? null,
                    categoryId: draft.categoryId,
                    treatmentId: draft.treatmentId,
                    categoryName: draft.categoryName,
                    durationMinutes: draft.durationMinutes,
                    idealStart: draft.scheduledStart,
                    dayStart,
                    dayEnd,
                    firstSegment: true,
                  })
                : await this.placeAlongside({
                    tx,
                    clientId: client.id,
                    dependentId: dependent?.id ?? null,
                    categoryId: draft.categoryId,
                    treatmentId: draft.treatmentId,
                    categoryName: draft.categoryName,
                    durationMinutes: draft.durationMinutes,
                    start: created[0].scheduledStart,
                  });

            const initialStatus = withoutDeposit
              ? ReservationStatus.CONFIRMADA
              : ReservationStatus.PENDIENTE_DEPOSITO;
            if (startsDepositClock && depositExpiresAt === null) {
              depositExpiresAt = await this.depositDeadline.computeExpiry(
                depositClockStartedAt,
                placement.scheduledStart,
                tx,
              );
            }

            const createdReservation = await tx.reservation.create({
              data: {
                clientId: client.id,
                dependentId: dependent?.id ?? null,
                categoryId: draft.categoryId,
                treatmentId: draft.treatmentId,
                status: initialStatus,
                channel: dto.channel ?? ReservationChannel.WEB,
                scheduledStart: placement.scheduledStart,
                scheduledEnd: placement.scheduledEnd,
                finalPrice: draft.price,
                finalDurationMinutes: draft.durationMinutes,
                comboGroupId,
                depositClockStartedAt: startsDepositClock
                  ? depositClockStartedAt
                  : null,
                depositExpiresAt,
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
        await this.depositDeadline.scheduleTimeout(
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

      if (reservation.status === ReservationStatus.CONFIRMADA) {
        await this.confirmDeposit.afterConfirmed(reservation, {
          withoutDeposit: true,
        });
      }

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

  private async placeAlongside(params: {
    tx: Prisma.TransactionClient;
    clientId: string;
    dependentId: string | null;
    categoryId: string;
    treatmentId: string;
    categoryName: string;
    durationMinutes: number;
    start: Date;
  }): Promise<{
    scheduledStart: Date;
    scheduledEnd: Date;
    wasAdjusted: boolean;
    adjustmentReason?: string;
  }> {
    const {
      tx,
      clientId,
      dependentId,
      categoryId,
      treatmentId,
      categoryName,
      start,
    } = params;
    const end = new Date(start.getTime() + params.durationMinutes * 60_000);
    const decision = await this.placementCheck.evaluate(tx, {
      clientId,
      dependentId,
      categoryId,
      treatmentId,
      start,
      end,
    });
    if (decision.ok) {
      return { scheduledStart: start, scheduledEnd: end, wasAdjusted: false };
    }
    if (
      decision.reason === 'NO_CAPACITY' ||
      decision.reason === 'OUTSIDE_OPERATING_HOURS'
    ) {
      throw new AppException('PLACEMENT_NO_SLOT_THAT_DAY', {
        message: `No hay cupo para ${categoryName} a las ${formatLocalTime(start)}, a la misma hora que el resto del combo. Elige otra hora.`,
        details: { categoryId, date: getCalendarDayKey(start) },
      });
    }
    throw placementRejectionException(decision.reason);
  }

  private async resolvePlacement(params: {
    tx: Prisma.TransactionClient;
    clientId: string;
    dependentId: string | null;
    categoryId: string;
    treatmentId: string;
    categoryName: string;
    durationMinutes: number;
    idealStart: Date;
    dayStart: Date;
    dayEnd: Date;
    firstSegment: boolean;
  }): Promise<{
    scheduledStart: Date;
    scheduledEnd: Date;
    wasAdjusted: boolean;
    adjustmentReason?: string;
  }> {
    const {
      tx,
      clientId,
      dependentId,
      categoryId,
      treatmentId,
      categoryName,
      durationMinutes,
      idealStart,
      dayStart,
      dayEnd,
      firstSegment,
    } = params;

    const plan = await this.operatingSchedule.getDayPlan(
      idealStart,
      categoryId,
      tx,
    );
    const startMinutes = firstSegment ? plan.startMinutes : null;

    let candidateStart = idealStart;
    let candidateEnd = new Date(
      candidateStart.getTime() + durationMinutes * 60_000,
    );

    const decision = await this.placementCheck.evaluate(tx, {
      clientId,
      dependentId,
      categoryId,
      treatmentId,
      start: candidateStart,
      end: candidateEnd,
    });

    const allowedStart =
      !startMinutes || startMinutes.includes(minuteOfDay(candidateStart));
    if (decision.ok && allowedStart) {
      return {
        scheduledStart: candidateStart,
        scheduledEnd: candidateEnd,
        wasAdjusted: false,
      };
    }

    if (
      !decision.ok &&
      (decision.reason === 'INVALID_RANGE' ||
        decision.reason === 'IN_THE_PAST' ||
        decision.reason === 'DUPLICATE_BOOKING')
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
        tx,
      );
    const sameTreatmentStarts = new Set(
      (
        await this.reservationsRepository.findActiveStartsForPersonTreatment(
          { clientId, dependentId, treatmentId, dayStart, dayEnd },
          tx,
        )
      ).map((start) => start.getTime()),
    );
    const person = personKey(clientId, dependentId);
    const validCandidates = generateAvailableSlots({
      operatingWindows: plan.windows,
      held: held.filter((interval) => interval.personKey !== person),
      durationMinutes,
      capacity,
      startMinutes,
    }).filter((candidate) => !sameTreatmentStarts.has(candidate.getTime()));

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
}
