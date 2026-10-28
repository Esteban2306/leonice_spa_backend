import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  UploadApiOptions,
  UploadApiResponse,
  v2 as CloudinaryType,
} from 'cloudinary';
import { CLOUDINARY } from './cloudinary.constants';
import { withUploadRetry } from './upload-retry';

const AUTHENTICATED_URL =
  /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/authenticated\/(?:s--[^/]+--\/)?(?:v(\d+)\/)?([^?]+)(?:\?.*)?$/;

const AUTHENTICATED_FOLDERS = ['leonice-spa/deposit-proofs/'];

function isAuthenticatedAssetId(publicId: string): boolean {
  return AUTHENTICATED_FOLDERS.some((folder) => publicId.startsWith(folder));
}

export const TESTIMONIAL_IMAGE_WIDTH = 800;
export const TESTIMONIAL_IMAGE_HEIGHT = 1000;

export interface UploadedImage {
  url: string;
  publicId: string;
}

export interface UploadedVideo {
  url: string;
  posterUrl: string;
  publicId: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(
    @Inject(CLOUDINARY) private readonly cloudinary: typeof CloudinaryType,
  ) {}

  private uploadBuffer(
    fileBuffer: Buffer,
    options: UploadApiOptions,
  ): Promise<UploadApiResponse> {
    return withUploadRetry(
      () =>
        new Promise<UploadApiResponse>((resolve, reject) => {
          const uploadStream = this.cloudinary.uploader.upload_stream(
            options,
            (error, uploaded) => {
              if (error || !uploaded) {
                return reject(
                  error instanceof Error
                    ? error
                    : Object.assign(
                        new Error(
                          error?.message ?? 'Cloudinary no devolvió resultado',
                        ),
                        error ?? {},
                      ),
                );
              }
              resolve(uploaded);
            },
          );
          uploadStream.end(fileBuffer);
        }),
      {
        onRetry: (error, attempt) =>
          this.logger.warn(
            `Reintentando subida a Cloudinary (${options.public_id ?? 'sin id'}) tras intento ${attempt}: ${error instanceof Error ? error.message : String(error)}`,
          ),
      },
    );
  }

  async uploadDepositProof(
    fileBuffer: Buffer,
    reservationId: string,
  ): Promise<UploadedImage> {
    const result = await this.uploadBuffer(fileBuffer, {
      folder: 'leonice-spa/deposit-proofs',
      public_id: `deposit-${reservationId}-${Date.now()}`,
      resource_type: 'image',
      type: 'authenticated',
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
    const result = await this.uploadBuffer(fileBuffer, {
      public_id: publicId,
      resource_type: 'image',
    });

    return { url: result.secure_url, publicId: result.public_id };
  }

  testimonialImagePublicId(testimonialId: string, slot: string): string {
    return `leonice-spa/testimonials/${testimonialId}-${slot}-${Date.now()}`;
  }

  async uploadTestimonialImage(
    fileBuffer: Buffer,
    publicId: string,
  ): Promise<UploadedImage> {
    const result = await this.uploadBuffer(fileBuffer, {
      public_id: publicId,
      resource_type: 'image',
      transformation: [
        {
          width: TESTIMONIAL_IMAGE_WIDTH,
          height: TESTIMONIAL_IMAGE_HEIGHT,
          crop: 'fill',
          gravity: 'auto',
        },
        { quality: 'auto:good' },
      ],
    });

    return { url: result.secure_url, publicId: result.public_id };
  }

  async destroyImage(publicId: string): Promise<void> {
    await this.cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      invalidate: true,
      type: isAuthenticatedAssetId(publicId) ? 'authenticated' : 'upload',
    });
  }

  signAuthenticatedUrl(url: string): string {
    const match = AUTHENTICATED_URL.exec(url);
    if (!match) return url;
    const [, version, path] = match;
    const extension = path.lastIndexOf('.');
    const publicId = extension === -1 ? path : path.slice(0, extension);
    const format = extension === -1 ? undefined : path.slice(extension + 1);
    return this.cloudinary.url(publicId, {
      resource_type: 'image',
      type: 'authenticated',
      sign_url: true,
      secure: true,
      ...(version ? { version } : {}),
      ...(format ? { format } : {}),
    });
  }

  treatmentVideoPublicId(treatmentId: string): string {
    return `leonice-spa/treatments/video-${treatmentId}-${Date.now()}`;
  }

  async uploadTreatmentVideo(
    fileBuffer: Buffer,
    publicId: string,
  ): Promise<UploadedVideo> {
    const result = await this.uploadBuffer(fileBuffer, {
      public_id: publicId,
      resource_type: 'video',
    });

    return {
      url: this.cloudinary.url(result.public_id, {
        resource_type: 'video',
        secure: true,
        format: 'mp4',
        transformation: [{ quality: 'auto', width: 1280, crop: 'limit' }],
      }),
      posterUrl: this.cloudinary.url(result.public_id, {
        resource_type: 'video',
        secure: true,
        format: 'jpg',
        transformation: [
          { start_offset: 'auto' },
          { quality: 'auto', width: 1280, crop: 'limit' },
        ],
      }),
      publicId: result.public_id,
    };
  }

  async destroyVideo(publicId: string): Promise<void> {
    await this.cloudinary.uploader.destroy(publicId, {
      resource_type: 'video',
      invalidate: true,
    });
  }

  async uploadDepositProofFromBase64(
    dataUri: string,
    reservationId: string,
  ): Promise<UploadedImage> {
    const publicId = `deposit-${reservationId}-${Date.now()}`;
    const result = await withUploadRetry(() =>
      this.cloudinary.uploader.upload(dataUri, {
        folder: 'leonice-spa/deposit-proofs',
        public_id: publicId,
        resource_type: 'image',
        type: 'authenticated',
      }),
    );
    return { url: result.secure_url, publicId: result.public_id };
  }
}
