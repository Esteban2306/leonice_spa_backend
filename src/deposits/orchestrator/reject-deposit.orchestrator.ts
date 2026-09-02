import { Injectable, NotFoundException } from '@nestjs/common';
import { DepositStatus } from '@prisma/client';
import { DepositsRepository } from '../repositories/deposits.repositories';
import { DomainException } from '../../common/exceptions/domain.exception';

@Injectable()
export class RejectDepositOrchestrator {
  constructor(private readonly repository: DepositsRepository) {}

  async execute(reservationId: string, adminUserId: string, reason: string) {
    const deposit =
      await this.repository.findLatestByReservationId(reservationId);
    if (!deposit)
      throw new NotFoundException(
        'No hay ningún comprobante registrado para esta reserva',
      );
    if (deposit.status !== DepositStatus.PENDIENTE) {
      throw new DomainException(
        `Este comprobante ya fue procesado (estado: ${deposit.status})`,
      );
    }

    return this.repository.markRejected(deposit.id, adminUserId, reason);
  }
}
