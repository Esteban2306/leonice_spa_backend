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
import { CreateReservationDto } from './dto/create-reservation.dto';
import { CancelReservationDto } from './dto/cancel-reservation.dto';
import { RescheduleReservationDto } from './dto/reschedule-reservation.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CreateReservationOrchestrator } from './orchestrators/create-reservation.orchestrator';
import { CancelReservationOrchestrator } from './orchestrators/cancel-reservation.orchestrator';
import { RescheduleReservationOrchestrator } from './orchestrators/reschedule-reservation.orchestrator';
import { CheckInReservationOrchestrator } from './orchestrators/check-in-reservation.orchestrator';
import { CompleteReservationOrchestrator } from './orchestrators/complete-reservation.orchestrator';
import { ConfirmDepositOrchestrator } from './orchestrators/confirm-deposit.orchestrator';
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
    private readonly confirmDepositOrchestrator: ConfirmDepositOrchestrator,
    private readonly adminRescheduleOrchestrator: AdminRescheduleReservationOrchestrator,
    private readonly adminCancelOrchestrator: AdminCancelReservationOrchestrator,
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
  create(@Body() dto: CreateReservationDto) {
    return this.createOrchestrator.execute(dto);
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelReservationDto,
  ) {
    return this.cancelOrchestrator.execute(id, dto.phone, dto.reason);
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
      dto.notifyClient ?? false,
      dto.internalNote,
    );
  }

  @Patch(':id/check-in')
  checkIn(@Param('id', ParseUUIDPipe) id: string) {
    return this.checkInOrchestrator.execute(id);
  }

  @Patch(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.completeOrchestrator.execute(id);
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
