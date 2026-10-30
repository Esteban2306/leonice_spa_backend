import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReservationsService } from './reservations.service';
import { GetAvailabilityDto } from './dto/get-availability.dto';
import { GetAvailabilityCalendarDto } from './dto/get-availability-calendar.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { CancelReservationDto } from './dto/cancel-reservation.dto';
import { RescheduleReservationDto } from './dto/reschedule-reservation.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateReservationOrchestrator } from './orchestrators/create-reservation.orchestrator';
import { CancelReservationOrchestrator } from './orchestrators/cancel-reservation.orchestrator';
import { RescheduleReservationOrchestrator } from './orchestrators/reschedule-reservation.orchestrator';
import { CheckInReservationOrchestrator } from './orchestrators/check-in-reservation.orchestrator';
import { CompleteReservationOrchestrator } from './orchestrators/complete-reservation.orchestrator';
import { ConfirmValoracionOrchestrator } from './orchestrators/confirm-valoracion.orchestrator';
import { ConfirmValoracionDto } from './dto/confirm-valoracion.dto';
import {
  CLIENT_BOOKING_RATE_LIMIT,
  CLIENT_BOOKING_RATE_LIMIT_TTL_MS,
} from './domain/reservation-timing.constants';
import { AdminRescheduleReservationDto } from './dto/admin-reschedule-reservation.dto';
import { AdminRescheduleReservationOrchestrator } from './orchestrators/admin-reservartion.orchestator';
import { FindReservationsQueryDto } from './dto/find-reservations-query.dto';
import { SkipCsrf } from 'src/auth/decorators/skip-csrf.decorator';
import { AdminCancelReservationOrchestrator } from './orchestrators/admin-cancel-reservation.orchestrator';
import { AdminCancelReservationDto } from './dto/admin-cancel-reservation.dto';
import { ReviveReservationOrchestrator } from './orchestrators/revive-reservation.orchestrator';
import { CancellationLinkService } from './service/cancellation-link.service';
import { IssueCancellationLinkDto } from './dto/cancellation-link.dto';
import { CompleteReservationDto } from './dto/complete-reservation.dto';
import { ReservationSettlementService } from './service/reservation-settlement.service';

@Controller({ path: 'reservations', version: '1' })
export class ReservationsController {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly createOrchestrator: CreateReservationOrchestrator,
    private readonly cancelOrchestrator: CancelReservationOrchestrator,
    private readonly rescheduleOrchestrator: RescheduleReservationOrchestrator,
    private readonly confirmValoracionOrchestrator: ConfirmValoracionOrchestrator,
    private readonly checkInOrchestrator: CheckInReservationOrchestrator,
    private readonly completeOrchestrator: CompleteReservationOrchestrator,
    private readonly adminRescheduleOrchestrator: AdminRescheduleReservationOrchestrator,
    private readonly adminCancelOrchestrator: AdminCancelReservationOrchestrator,
    private readonly reviveOrchestrator: ReviveReservationOrchestrator,
    private readonly cancellationLinks: CancellationLinkService,
    private readonly settlementService: ReservationSettlementService,
  ) {}

  @Get()
  findMany(@Query() query: FindReservationsQueryDto) {
    return this.reservationsService.findMany(query);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('availability')
  async getAvailability(@Query() query: GetAvailabilityDto) {
    const slots = await this.reservationsService.getAvailability(
      query.treatmentId,
      query.date,
    );
    return { treatmentId: query.treatmentId, date: query.date, slots };
  }

  @Get('availability/calendar')
  getAvailabilityCalendar(@Query() query: GetAvailabilityCalendarDto) {
    return this.reservationsService.getAvailabilityCalendar(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.getById(id);
  }

  @Public()
  @SkipCsrf()
  @Throttle({
    'client-booking': {
      limit: CLIENT_BOOKING_RATE_LIMIT,
      ttl: CLIENT_BOOKING_RATE_LIMIT_TTL_MS,
    },
  })
  @Post()
  create(
    @Body() dto: CreateReservationDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.createOrchestrator.execute(dto, {
      trustedIdentity: user !== undefined,
    });
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelReservationDto,
  ) {
    return this.cancelOrchestrator.executeVerifiedByPhone({
      reservationId: id,
      phone: dto.phone,
      scope: dto.scope ?? 'SINGLE',
      channel: 'WEB',
      reason: dto.reason,
    });
  }

  @Post(':id/cancellation-link')
  issueCancellationLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueCancellationLinkDto,
  ) {
    return this.cancellationLinks.issue(id, { send: dto.send ?? false });
  }

  @Patch(':id/admin-cancel')
  adminCancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCancelReservationDto,
  ) {
    return this.adminCancelOrchestrator.execute(
      id,
      dto.reason,
      dto.notifyClient ?? true,
    );
  }

  @Patch(':id/revive')
  revive(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviveOrchestrator.execute(id);
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch(':id/reschedule')
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleReservationDto,
  ) {
    return this.rescheduleOrchestrator.execute(
      id,
      dto.phone,
      new Date(dto.newScheduledStart),
    );
  }

  @Patch(':id/admin-reschedule')
  adminReschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminRescheduleReservationDto,
  ) {
    return this.adminRescheduleOrchestrator.execute(
      id,
      new Date(dto.newScheduledStart),
      dto.notifyClient ?? true,
      dto.internalNote,
    );
  }

  @Patch(':id/check-in')
  checkIn(@Param('id', ParseUUIDPipe) id: string) {
    return this.checkInOrchestrator.execute(id);
  }

  @Get(':id/settlement')
  settlement(@Param('id', ParseUUIDPipe) id: string) {
    return this.settlementService.compute(id);
  }

  @Patch(':id/complete')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteReservationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.completeOrchestrator.execute({
      reservationId: id,
      adminUserId: user.id,
      cashAmount: dto.cashAmount,
      transferAmount: dto.transferAmount,
      advanceAmount: dto.advanceAmount,
    });
  }

  @Patch(':id/confirm-valoracion')
  confirmValoracion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmValoracionDto,
  ) {
    return this.confirmValoracionOrchestrator.execute(
      id,
      dto.finalPrice,
      dto.finalDurationMinutes,
    );
  }
}
