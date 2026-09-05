import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ReservationChannel } from '@prisma/client';
import { ConduitToolAuthGuard } from './guards/conduit-tool-auth.guard';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';
import { TreatmentsService } from '../catalog/treatments/treatments.service';
import { ReservationsService } from '../reservations/reservations.service';
import { CreateReservationOrchestrator } from '../reservations/orchestrators/create-reservation.orchestrator';
import { GetAvailabilityDto } from '../reservations/dto/get-availability.dto';
import { CreateReservationDto } from '../reservations/dto/create-reservation.dto';

@Controller({ path: 'conduit/booking', version: '1' })
@UseGuards(ConduitToolAuthGuard)
export class ConduitBookingToolsController {
  constructor(
    private readonly treatmentsService: TreatmentsService,
    private readonly reservationsService: ReservationsService,
    private readonly createReservation: CreateReservationOrchestrator,
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
  @UseInterceptors(IdempotencyInterceptor)
  create(@Body() dto: CreateReservationDto) {
    return this.createReservation.execute({
      ...dto,
      channel: ReservationChannel.WHATSAPP,
    });
  }
}
