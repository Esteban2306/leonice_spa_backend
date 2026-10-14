import { Inject, Injectable } from '@nestjs/common';
import type { UploadApiResponse, v2 as CloudinaryType } from 'cloudinary';
import { CLOUDINARY } from './cloudinary.constants';

export interface UploadedImage {
  url: string;
  publicId: string;
}

@Injectable()
export class CloudinaryService {
  constructor(
    @Inject(CLOUDINARY) private readonly cloudinary: typeof CloudinaryType,
  ) {}

  async uploadDepositProof(
    fileBuffer: Buffer,
    reservationId: string,
  ): Promise<UploadedImage> {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          folder: 'leonice-spa/deposit-proofs',
          public_id: `deposit-${reservationId}-${Date.now()}`,
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            console.error('\n========== CLOUDINARY UPLOAD ERROR ==========');

            if (error instanceof Error) {
              console.error({
                name: error.name,
                message: error.message,
                stack: error.stack,
              });
            } else {
              console.dir(error, {
                depth: null,
              });
            }

            console.error('============================================\n');

            return reject(
              error instanceof Error
                ? error
                : new Error(
                    error
                      ? error.message || JSON.stringify(error)
                      : 'Cloudinary no devolvió resultado',
                  ),
            );
          }

          resolve(result);
        },
      );

      uploadStream.end(fileBuffer);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  }

  productImagePublicId(variantId: string): string {
    return `leonice-spa/products/variant-${variantId}-${Date.now()}`;
  }

  async uploadProductImage(
    fileBuffer: Buffer,
    publicId: string,
  ): Promise<UploadedImage> {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: 'image',
        },
        (error, uploaded) => {
          if (error || !uploaded) {
            return reject(
              error instanceof Error
                ? error
                : new Error(
                    error?.message ?? 'Cloudinary no devolvió resultado',
                  ),
            );
          }
          resolve(uploaded);
        },
      );
      uploadStream.end(fileBuffer);
    });

    return { url: result.secure_url, publicId: result.public_id };
  }

  async destroyImage(publicId: string): Promise<void> {
    await this.cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      invalidate: true,
    });
  }

  async uploadDepositProofFromBase64(
    dataUri: string,
    reservationId: string,
  ): Promise<UploadedImage> {
    const result = await this.cloudinary.uploader.upload(dataUri, {
      folder: 'leonice-spa/deposit-proofs',
      public_id: `deposit-${reservationId}-${Date.now()}`,
      resource_type: 'image',
    });
    return { url: result.secure_url, publicId: result.public_id };
  }
}
