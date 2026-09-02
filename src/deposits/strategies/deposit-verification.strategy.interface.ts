import {
  DepositCoverage,
  DepositRecord,
  DepositVerificationMethod,
} from '@prisma/client';

export interface SubmitProofInput {
  reservationId: string;
  imageUrl?: string;
  imageCloudinaryId?: string;
  coverage?: DepositCoverage;
}

export interface DepositVerificationStrategy {
  readonly method: DepositVerificationMethod;
  submitProof(input: SubmitProofInput): Promise<DepositRecord>;
}
