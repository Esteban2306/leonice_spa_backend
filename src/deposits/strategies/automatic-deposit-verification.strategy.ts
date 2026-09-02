import { BadRequestException, Injectable } from '@nestjs/common';
import { DepositStatus, DepositVerificationMethod } from '@prisma/client';
import {
  DepositVerificationStrategy,
  SubmitProofInput,
} from './deposit-verification.strategy.interface';
import { DepositsRepository } from '../repositories/deposits.repositories';

@Injectable()
export class AutomaticDepositVerificationStrategy implements DepositVerificationStrategy {
  readonly method = DepositVerificationMethod.AUTOMATICO;

  constructor(private readonly repository: DepositsRepository) {}

  async submitProof(input: SubmitProofInput) {
    if (!input.coverage) {
      throw new BadRequestException(
        'El canal automático debe indicar si es anticipo o pago completo',
      );
    }

    return this.repository.create({
      reservationId: input.reservationId,
      method: this.method,
      status: DepositStatus.CONFIRMADO,
      coverage: input.coverage,
      imageUrl: input?.imageUrl,
      imageCloudinaryId: input?.imageCloudinaryId,
      verifiedAt: new Date(),
    });
  }
}
