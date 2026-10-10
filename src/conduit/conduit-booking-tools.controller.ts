import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ReservationChannel } from '@prisma/client';
import { ConduitTool } from './decorators/conduit-tool.decorator';
import { ConduitToolOptionsMeta } from './interceptors/conduit-contact.interceptor';
import { RescheduleReservationOrchestrator } from '../reservations/orchestrators/reschedule-reservation.orchestrator';
import { GetAvailabilityCalendarDto } from '../reservations/dto/get-availability-calendar.dto';
import { TreatmentsService } from '../catalog/treatments/treatments.service';
import { ReservationsService } from '../reservations/reservations.service';
import { CreateReservationOrchestrator } from '../reservations/orchestrators/create-reservation.orchestrator';
import { GetAvailabilityDto } from '../reservations/dto/get-availability.dto';
import { CreateReservationDto } from '../reservations/dto/create-reservation.dto';
import { CancelReservationOrchestrator } from '../reservations/orchestrators/cancel-reservation.orchestrator';
import {
  ConduitCancelReservationDto,
  ConduitRescheduleReservationDto,
  ConduitUpcomingReservationsQueryDto,
} from './dto/conduit-cancel-reservation.dto';

@Controller({ path: 'conduit/booking', version: '1' })
@ConduitTool()
export class ConduitBookingToolsController {
  constructor(
    private readonly treatmentsService: TreatmentsService,
    private readonly reservationsService: ReservationsService,
    private readonly createReservation: CreateReservationOrchestrator,
    private readonly cancelReservation: CancelReservationOrchestrator,
    private readonly rescheduleReservation: RescheduleReservationOrchestrator,
  ) {}

  @Get('treatments')
  findTreatments(@Query('categoryId') categoryId?: string) {
    return this.treatmentsService.findAll(categoryId);
  }

  @Get('availability')
  async getAvailability(@Query() query: GetAvailabilityDto) {
    const slots = await this.reservationsService.getAvailability(
      query.treatmentId,
      query.date,
    );
    return { treatmentId: query.treatmentId, date: query.date, slots };
  }

  /**
   * Disponibilidad de uno o varios servicios (combo) en un rango de días.
   * Con purpose=RESCHEDULE considera la reserva que se moverá.
   */
  @Get('availability/calendar')
  getAvailabilityCalendar(@Query() query: GetAvailabilityCalendarDto) {
    return this.reservationsService.getAvailabilityCalendar(query);
  }

  @Post('reservations')
  create(@Body() dto: CreateReservationDto) {
    return this.createReservation.execute({
      ...dto,
      channel: ReservationChannel.WHATSAPP,
    });
  }

  @ConduitToolOptionsMeta({ requiresVerifiedContact: true })
  @Get('reservations/upcoming')
  findUpcoming(@Query() query: ConduitUpcomingReservationsQueryDto) {
    return this.cancelReservation.listUpcomingByPhone(query.phone);
  }

  @ConduitToolOptionsMeta({ requiresVerifiedContact: true })
  @HttpCode(HttpStatus.OK)
  @Post('reservations/cancel')
  cancel(@Body() dto: ConduitCancelReservationDto) {
    return this.cancelReservation.executeVerifiedByPhone({
      reservationId: dto.reservationId,
      phone: dto.phone,
      scope: dto.scope,
      channel: 'WHATSAPP',
      reason: dto.reason,
    });
  }

  /** Reagendar desde el bot: misma lógica y eventos que el reagendamiento público. */
  @ConduitToolOptionsMeta({ requiresVerifiedContact: true })
  @HttpCode(HttpStatus.OK)
  @Post('reservations/reschedule')
  reschedule(@Body() dto: ConduitRescheduleReservationDto) {
    return this.rescheduleReservation.execute(
      dto.reservationId,
      dto.phone,
      new Date(dto.newScheduledStart),
    );
  }
}
