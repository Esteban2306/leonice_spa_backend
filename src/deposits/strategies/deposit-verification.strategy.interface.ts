import {
  DepositCoverage,
  DepositRecord,
  DepositVerificationMethod,
  Prisma,
} from '@prisma/client';

export interface SubmitProofInput {
  reservationId: string;
  imageUrl?: string;
  imageCloudinaryId?: string;
  coverage?: DepositCoverage;
}

export interface DepositVerificationStrategy {
  readonly method: DepositVerificationMethod;
  submitProof(
    input: SubmitProofInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DepositRecord>;
}
