import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReservationChannel } from '@prisma/client';
import { ConduitToolAuthGuard } from './guards/conduit-tool-auth.guard';
import { TreatmentsService } from '../catalog/treatments/treatments.service';
import { ReservationsService } from '../reservations/reservations.service';
import { CreateReservationOrchestrator } from '../reservations/orchestrators/create-reservation.orchestrator';
import { GetAvailabilityDto } from '../reservations/dto/get-availability.dto';
import { CreateReservationDto } from '../reservations/dto/create-reservation.dto';
import { CancelReservationOrchestrator } from '../reservations/orchestrators/cancel-reservation.orchestrator';
import {
  ConduitCancelReservationDto,
  ConduitUpcomingReservationsQueryDto,
} from './dto/conduit-cancel-reservation.dto';

@Controller({ path: 'conduit/booking', version: '1' })
@UseGuards(ConduitToolAuthGuard)
export class ConduitBookingToolsController {
  constructor(
    private readonly treatmentsService: TreatmentsService,
    private readonly reservationsService: ReservationsService,
    private readonly createReservation: CreateReservationOrchestrator,
    private readonly cancelReservation: CancelReservationOrchestrator,
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

  @Post('reservations')
  create(@Body() dto: CreateReservationDto) {
    return this.createReservation.execute({
      ...dto,
      channel: ReservationChannel.WHATSAPP,
    });
  }

  @Get('reservations/upcoming')
  findUpcoming(@Query() query: ConduitUpcomingReservationsQueryDto) {
    return this.cancelReservation.listUpcomingByPhone(query.phone);
  }

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
}
