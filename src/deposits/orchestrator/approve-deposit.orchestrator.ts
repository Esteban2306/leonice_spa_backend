import { Injectable, NotFoundException } from '@nestjs/common';
import { DepositCoverage, DepositStatus } from '@prisma/client';
import { DepositsRepository } from '../repositories/deposits.repositories';
import { ConfirmDepositOrchestrator } from '../../reservations/orchestrators/confirm-deposit.orchestrator';
import { DomainException } from '../../common/exceptions/domain.exception';

@Injectable()
export class ApproveDepositOrchestrator {
  constructor(
    private readonly repository: DepositsRepository,
    private readonly confirmDepositOrchestrator: ConfirmDepositOrchestrator,
  ) {}

  async execute(
    reservationId: string,
    adminUserId: string,
    coverage: DepositCoverage,
  ) {
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

    const updated = await this.repository.markConfirmed(
      deposit.id,
      adminUserId,
      coverage,
    );
    await this.confirmDepositOrchestrator.execute(reservationId);
    return updated;
  }
}
