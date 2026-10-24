import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ReservationChannel } from '@prisma/client';
import { ConduitTool } from './decorators/conduit-tool.decorator';
import { VerifiedPhone } from './decorators/verified-phone.decorator';
import {
  ConduitToolOptionsMeta,
  hasVerifiedIdentity,
  type RequestWithConduitContact,
} from './interceptors/conduit-contact.interceptor';
import { RescheduleReservationOrchestrator } from '../reservations/orchestrators/reschedule-reservation.orchestrator';
import { GetAvailabilityCalendarDto } from '../reservations/dto/get-availability-calendar.dto';
import { toBotTreatment } from './tools/bot-treatment-view';
import { TreatmentsService } from '../catalog/treatments/treatments.service';
import { ClientsRepository } from '../clients/repositories/clients.repository';
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
    private readonly clientsRepository: ClientsRepository,
  ) {}

  @ConduitToolOptionsMeta({ publicData: true })
  @Get('treatments')
  async findTreatments(
    @Req() req: RequestWithConduitContact,
    @Query('categoryId') categoryId?: string,
  ) {
    const phone = req.conduitContact?.phone;
    const [treatments, client] = await Promise.all([
      this.treatmentsService.findAll(categoryId),
      phone ? this.clientsRepository.findByPhone(phone) : null,
    ]);
    return treatments.map((treatment) => toBotTreatment(treatment, client));
  }

  @ConduitToolOptionsMeta({ publicData: true })
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
  @ConduitToolOptionsMeta({ publicData: true })
  @Get('availability/calendar')
  getAvailabilityCalendar(@Query() query: GetAvailabilityCalendarDto) {
    return this.reservationsService.getAvailabilityCalendar(query);
  }

  @Post('reservations')
  create(
    @Body() dto: CreateReservationDto,
    @Req() req: RequestWithConduitContact,
  ) {
    return this.createReservation.execute(
      { ...dto, channel: ReservationChannel.WHATSAPP },
      { trustedIdentity: hasVerifiedIdentity(req) },
    );
  }

  @ConduitToolOptionsMeta({ requiresVerifiedContact: true })
  @Get('reservations/upcoming')
  findUpcoming(
    @Query() _query: ConduitUpcomingReservationsQueryDto,
    @VerifiedPhone() phone: string,
  ) {
    return this.cancelReservation.listUpcomingByPhone(phone);
  }

  @ConduitToolOptionsMeta({ requiresVerifiedContact: true })
  @HttpCode(HttpStatus.OK)
  @Post('reservations/cancel')
  cancel(
    @Body() dto: ConduitCancelReservationDto,
    @VerifiedPhone() phone: string,
  ) {
    return this.cancelReservation.executeVerifiedByPhone({
      reservationId: dto.reservationId,
      phone,
      scope: dto.scope,
      channel: 'WHATSAPP',
      reason: dto.reason,
    });
  }

  /** Reagendar desde el bot: misma lógica y eventos que el reagendamiento público. */
  @ConduitToolOptionsMeta({ requiresVerifiedContact: true })
  @HttpCode(HttpStatus.OK)
  @Post('reservations/reschedule')
  reschedule(
    @Body() dto: ConduitRescheduleReservationDto,
    @VerifiedPhone() phone: string,
  ) {
    return this.rescheduleReservation.execute(
      dto.reservationId,
      phone,
      new Date(dto.newScheduledStart),
    );
  }
}
