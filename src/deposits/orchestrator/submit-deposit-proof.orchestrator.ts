import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { ConfirmDepositOrchestrator } from 'src/reservations/orchestrators/confirm-deposit.orchestrator';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import { SubmitParams } from '../types/deposits.types';
import { normalizePhone } from 'src/clients/utils/normalize-phone.util';
import { DepositStatus, ReservationStatus } from '@prisma/client';
import { DomainException } from 'src/common/exceptions/domain.exception';
import { EventBusService } from 'src/common/events/event.service';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';

@Injectable()
export class SubmitDepositProofOrchestrator {
  constructor(
    private readonly reservationRepository: ReservationsRepository,
    private readonly cloudinary: CloudinaryService,
    private readonly confirmDepositOrchestrator: ConfirmDepositOrchestrator,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(params: SubmitParams) {
    const reservation =
      await this.reservationRepository.findByIdWithClientPhone(
        params.reservationId,
      );

    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    if (normalizePhone(params.phone) !== reservation.client.phone) {
      throw new ForbiddenException(
        'No se pudo verificar la propiedad de esta reserva',
      );
    }
    if (reservation.status !== ReservationStatus.PENDIENTE_DEPOSITO) {
      throw new DomainException(
        `Esta reserva no está esperando un depósito (estado actual: ${reservation.status})`,
      );
    }

    const uploaded =
      params.preUploadedImage ??
      (params.fileBuffer
        ? await this.cloudinary.uploadDepositProof(
            params.fileBuffer,
            params.reservationId,
          )
        : undefined);

    const deposit = await params.strategy.submitProof({
      reservationId: params.reservationId,
      imageUrl: uploaded?.url,
      imageCloudinaryId: uploaded?.publicId,
      coverage: params.coverage,
    });

    if (deposit.status === DepositStatus.CONFIRMADO) {
      await this.confirmDepositOrchestrator.execute(params.reservationId);
    } else {
      this.eventBus.publish(EVENT_TYPES.DEPOSIT_SUBMITTED_FOR_REVIEW, {
        depositId: deposit.id,
        reservationId: params.reservationId,
        clientId: reservation.clientId,
        clientPhone: reservation.client.phone,
        imageUrl: deposit.imageUrl ?? '',
      });
    }

    return deposit;
  }
}
