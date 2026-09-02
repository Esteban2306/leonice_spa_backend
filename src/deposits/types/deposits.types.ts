import {
  DepositCoverage,
  DepositStatus,
  DepositVerificationMethod,
} from '@prisma/client';
import { DepositVerificationStrategy } from '../strategies/deposit-verification.strategy.interface';
import { UploadedImage } from 'src/infrastructure/cloudinary/cloudinary.service';

export interface CreateDepositData {
  reservationId: string;
  method: DepositVerificationMethod;
  status: DepositStatus;
  coverage: DepositCoverage | null;
  imageUrl?: string;
  imageCloudinaryId?: string;
  verifiedAt?: Date;
}

export interface SubmitParams {
  strategy: DepositVerificationStrategy;
  reservationId: string;
  phone: string;
  fileBuffer?: Buffer;
  coverage?: DepositCoverage;
  preUploadedImage?: UploadedImage;
}
