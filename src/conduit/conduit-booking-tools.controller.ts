import {
  BadRequestException,
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
import {
  toBotTreatment,
  toBotTreatmentDetail,
} from './tools/bot-treatment-view';
import { matchTreatment } from './tools/treatment-matcher';
import { TreatmentsService } from '../catalog/treatments/treatments.service';
import { ClientsRepository } from '../clients/repositories/clients.repository';
import { ReservationsService } from '../reservations/reservations.service';
import { CreateReservationOrchestrator } from '../reservations/orchestrators/create-reservation.orchestrator';
import { GetAvailabilityDto } from '../reservations/dto/get-availability.dto';
import { ConduitCreateReservationDto } from './dto/conduit-create-reservation.dto';
import { CancellationLinkService } from '../reservations/service/cancellation-link.service';
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
    private readonly cancellationLinks: CancellationLinkService,
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

  /**
   * Ficha de un tratamiento por el nombre que la clienta usó. Solo acierta
   * cuando el nombre identifica un único tratamiento; si es ambiguo devuelve
   * las opciones y si no lo reconoce, `not_found`.
   */
  @ConduitToolOptionsMeta({ publicData: true })
  @Get('treatments/detail')
  async findTreatmentDetail(
    @Req() req: RequestWithConduitContact,
    @Query('query') query?: string,
  ) {
    const phone = req.conduitContact?.phone;
    const [treatments, client] = await Promise.all([
      this.treatmentsService.findAll(),
      phone ? this.clientsRepository.findByPhone(phone) : null,
    ]);
    const match = matchTreatment(query ?? '', treatments);
    if (match.status === 'found') {
      return {
        status: 'found' as const,
        ...toBotTreatmentDetail(match.treatment, client),
      };
    }
    if (match.status === 'ambiguous') {
      return {
        status: 'ambiguous' as const,
        options: match.options.map((t) => ({ id: t.id, name: t.name })),
        optionNames: match.options.map((t) => `• ${t.name}`),
      };
    }
    return { status: 'not_found' as const };
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
  async create(
    @Body() dto: ConduitCreateReservationDto,
    @Req() req: RequestWithConduitContact,
  ) {
    const treatments = await this.resolveTreatmentIds(dto);
    return this.createReservation.execute(
      {
        client: dto.client,
        treatments,
        scheduledStart: dto.scheduledStart,
        channel: ReservationChannel.WHATSAPP,
      },
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
  @Get('reservations/cancellation-link')
  async cancellationLink(
    @Query() _query: ConduitUpcomingReservationsQueryDto,
    @VerifiedPhone() phone: string,
  ) {
    const { days } = await this.cancelReservation.listUpcomingByPhone(phone);
    const next = days[0]?.reservations[0];
    if (!next) return { hasUpcoming: false as const };

    const issued = await this.cancellationLinks.issue(next.reservationId, {
      send: false,
    });
    return {
      hasUpcoming: true as const,
      reservationId: next.reservationId,
      url: issued.url,
      treatment: next.treatment,
      scheduledStart: next.scheduledStart,
      expiresAt: issued.expiresAt,
      sameDayCount: days[0].reservations.length,
      upcomingDays: days.length,
    };
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

  private async resolveTreatmentIds(
    dto: ConduitCreateReservationDto,
  ): Promise<string[]> {
    const ids = dto.treatments ?? [];
    const names = dto.treatmentNames ?? [];
    if (ids.length === 0 && names.length === 0) {
      throw new BadRequestException(
        'Indica los servicios con treatments (ids) o treatmentNames (nombres).',
      );
    }
    if (names.length === 0) return ids;

    const catalog = await this.treatmentsService.findAll();
    const resolved = [...ids];
    for (const name of names) {
      const match = matchTreatment(name, catalog);
      if (match.status === 'found') {
        resolved.push(match.treatment.id);
      } else if (match.status === 'ambiguous') {
        throw new BadRequestException(
          `El servicio "${name}" coincide con varios (${match.options.map((t) => t.name).join(', ')}). Pregúntale a la clienta cuál es.`,
        );
      } else {
        throw new BadRequestException(
          `No encontré el servicio "${name}" en el catálogo.`,
        );
      }
    }
    return [...new Set(resolved)];
  }
}
