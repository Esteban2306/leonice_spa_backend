import { Injectable } from '@nestjs/common';
import {
  DepositVerificationStrategy,
  SubmitProofInput,
} from './deposit-verification.strategy.interface';
import { DepositStatus, DepositVerificationMethod } from '@prisma/client';
import { DepositsRepository } from '../repositories/deposits.repositories';

@Injectable()
export class ManualDepositVerificationStrategy implements DepositVerificationStrategy {
  readonly method = DepositVerificationMethod.MANUAL;

  constructor(private readonly repository: DepositsRepository) {}

  async submitProof(input: SubmitProofInput) {
    return this.repository.create({
      reservationId: input.reservationId,
      method: this.method,
      status: DepositStatus.PENDIENTE,
      coverage: null,
      imageUrl: input.imageUrl,
      imageCloudinaryId: input.imageCloudinaryId,
    });
  }
}
