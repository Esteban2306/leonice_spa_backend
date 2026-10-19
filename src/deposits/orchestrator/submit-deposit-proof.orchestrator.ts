import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { DepositsRepository } from '../repositories/deposits.repositories';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { ConfirmDepositOrchestrator } from 'src/reservations/orchestrators/confirm-deposit.orchestrator';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import { SubmitParams } from '../types/deposits.types';
import { normalizePhone } from 'src/clients/utils/normalize-phone.util';
import { DepositStatus, ReservationStatus } from '@prisma/client';
import { DomainException } from 'src/common/exceptions/domain.exception';
import { AppException } from 'src/common/errors/app.exception';
import { EventBusService } from 'src/common/events/event.service';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';

export const SUPERSEDED_PROOF_REASON =
  'Reemplazado por un comprobante más reciente';

@Injectable()
export class SubmitDepositProofOrchestrator {
  private readonly logger = new Logger(SubmitDepositProofOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly depositsRepository: DepositsRepository,
    private readonly reservationRepository: ReservationsRepository,
    private readonly cloudinary: CloudinaryService,
    private readonly confirmDepositOrchestrator: ConfirmDepositOrchestrator,
    private readonly eventBus: EventBusService,
  ) {}

  async assertCanSubmit(reservationId: string, phone: string) {
    const reservation =
      await this.reservationRepository.findByIdWithClientPhone(reservationId);

    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    if (normalizePhone(phone) !== reservation.client.phone) {
      throw new ForbiddenException(
        'No se pudo verificar la propiedad de esta reserva',
      );
    }
    if (reservation.status !== ReservationStatus.PENDIENTE_DEPOSITO) {
      throw new DomainException(
        `Esta reserva no está esperando un depósito (estado actual: ${reservation.status})`,
      );
    }
    return reservation;
  }

  async execute(params: SubmitParams) {
    let uploaded = params.preUploadedImage;
    try {
      const reservation = await this.assertCanSubmit(
        params.reservationId,
        params.phone,
      );
      uploaded ??= await this.uploadProof(params);
      const deposit = await this.recordProof(params, uploaded);
      await this.afterRecorded(params, reservation, deposit);
      return deposit;
    } catch (error) {
      if (uploaded && !(await this.isRecorded(uploaded.publicId))) {
        await this.discardQuietly(uploaded.publicId);
      }
      throw error;
    }
  }

  private async uploadProof(params: SubmitParams) {
    if (!params.fileBuffer) return undefined;
    try {
      return await this.cloudinary.uploadDepositProof(
        params.fileBuffer,
        params.reservationId,
      );
    } catch (error) {
      this.logger.error(
        `Fallo subiendo el comprobante de la reserva ${params.reservationId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new AppException('DEPOSIT_PROOF_UPLOAD_FAILED', { cause: error });
    }
  }

  private async isRecorded(publicId: string) {
    const count = await this.prisma.client.depositRecord.count({
      where: { imageCloudinaryId: publicId },
    });
    return count > 0;
  }

  private async discardQuietly(publicId: string) {
    try {
      await this.cloudinary.destroyImage(publicId);
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar el comprobante huérfano ${publicId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async recordProof(
    params: SubmitParams,
    uploaded: { url: string; publicId: string } | undefined,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: ReservationStatus }[]>`
        SELECT status FROM reservations WHERE id = ${params.reservationId} FOR UPDATE`;
      const currentStatus = locked[0]?.status;
      if (currentStatus !== ReservationStatus.PENDIENTE_DEPOSITO) {
        throw new DomainException(
          `Esta reserva no está esperando un depósito (estado actual: ${currentStatus ?? 'desconocido'})`,
        );
      }

      await this.depositsRepository.supersedePendingProofs(
        params.reservationId,
        SUPERSEDED_PROOF_REASON,
        tx,
      );

      return params.strategy.submitProof(
        {
          reservationId: params.reservationId,
          imageUrl: uploaded?.url,
          imageCloudinaryId: uploaded?.publicId,
          coverage: params.coverage,
        },
        tx,
      );
    });
  }

  private async afterRecorded(
    params: SubmitParams,
    reservation: { clientId: string; client: { phone: string } },
    deposit: { id: string; status: DepositStatus; imageUrl: string | null },
  ) {
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
  }
}
