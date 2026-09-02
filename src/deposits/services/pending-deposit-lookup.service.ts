import { Injectable, NotFoundException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { normalizePhone } from '../../clients/utils/normalize-phone.util';
import { DomainException } from '../../common/exceptions/domain.exception';

export interface PendingDepositCandidate {
  reservationId: string;
  treatmentName: string;
  scheduledStart: Date;
  finalPrice: string;
}

@Injectable()
export class PendingDepositLookupService {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly reservationsRepository: ReservationsRepository,
  ) {}

  async findCandidates(
    phone: string,
  ): Promise<{ clientName: string; candidates: PendingDepositCandidate[] }> {
    const client = await this.clientsRepository.findByPhone(
      normalizePhone(phone),
    );
    if (!client) {
      throw new NotFoundException(
        'No existe ningún cliente registrado con este número',
      );
    }

    const reservations = await this.reservationsRepository.findMany({
      clientId: client.id,
      status: ReservationStatus.PENDIENTE_DEPOSITO,
    });

    return {
      clientName: client.name,
      candidates: reservations.map((r) => ({
        reservationId: r.id,
        treatmentName: r.treatment.name,
        scheduledStart: r.scheduledStart,
        finalPrice: r.finalPrice.toString(),
      })),
    };
  }

  async resolveSingle(phone: string): Promise<string> {
    const { candidates } = await this.findCandidates(phone);

    if (candidates.length === 0) {
      throw new DomainException(
        'Este cliente no tiene ninguna reserva esperando depósito en este momento',
      );
    }
    if (candidates.length > 1) {
      throw new DomainException({
        message:
          'Hay más de una reserva esperando depósito — hace falta precisar cuál con reservationId',
        candidates,
      });
    }
    return candidates[0].reservationId;
  }
}
