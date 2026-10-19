import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { CloudinaryService } from '../infrastructure/cloudinary/cloudinary.service';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { DepositCreditService } from '../reservations/service/deposit-credit.service';
import {
  ANONYMIZED_BIRTH_DATE,
  ANONYMIZED_NAME,
  anonymizedPhone,
  isAnonymizedPhone,
} from './anonymized-client';

const ACTIVE_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.SOLICITUD_INICIADA,
  ReservationStatus.PENDIENTE_VALORACION,
  ReservationStatus.PENDIENTE_DEPOSITO,
  ReservationStatus.CONFIRMADA,
  ReservationStatus.CITA_EN_CURSO,
];

export interface AnonymizationResult {
  clientId: string;
  alreadyAnonymized: boolean;
  proofsDeleted: number;
}

@Injectable()
export class ClientAnonymizationService {
  private readonly logger = new Logger(ClientAnonymizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: DepositCreditService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async anonymize(clientId: string): Promise<AnonymizationResult> {
    const client = await this.prisma.client.client.findUnique({
      where: { id: clientId },
      select: { id: true, phone: true },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (isAnonymizedPhone(client.phone)) {
      return { clientId, alreadyAnonymized: true, proofsDeleted: 0 };
    }

    const active = await this.prisma.client.reservation.count({
      where: { clientId, status: { in: [...ACTIVE_STATUSES] } },
    });
    if (active > 0) throw new AppException('CLIENT_HAS_ACTIVE_RESERVATIONS');
    if ((await this.credits.findAvailableForClient(clientId)).length > 0) {
      throw new AppException('CLIENT_HAS_AVAILABLE_CREDIT');
    }

    const proofs = await this.prisma.client.depositRecord.findMany({
      where: {
        reservation: { clientId },
        imageCloudinaryId: { not: null },
      },
      select: { id: true, imageCloudinaryId: true },
    });

    await this.prisma.client.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: clientId },
        data: {
          name: ANONYMIZED_NAME,
          phone: anonymizedPhone(clientId),
          birthDate: ANONYMIZED_BIRTH_DATE,
          allergies: null,
          isPregnant: false,
          hairColor: null,
          hairLength: null,
          hairProfileUpdatedAt: null,
          whatsappJid: null,
        },
      });
      await tx.productViewLog.deleteMany({ where: { clientId } });
      await tx.consentRecord.updateMany({
        where: { clientId },
        data: { ipAddress: null, guardianName: null },
      });
      await tx.depositRecord.updateMany({
        where: { id: { in: proofs.map((proof) => proof.id) } },
        data: { imageUrl: null, imageCloudinaryId: null },
      });
    });

    let deleted = 0;
    for (const proof of proofs) {
      if (await this.destroyQuietly(proof.imageCloudinaryId as string)) {
        deleted += 1;
      }
    }
    this.logger.log(
      `Cliente ${clientId} anonimizado (${deleted}/${proofs.length} comprobantes borrados)`,
    );
    return { clientId, alreadyAnonymized: false, proofsDeleted: deleted };
  }

  private async destroyQuietly(publicId: string): Promise<boolean> {
    try {
      await this.cloudinary.destroyImage(publicId);
      return true;
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar el comprobante ${publicId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
