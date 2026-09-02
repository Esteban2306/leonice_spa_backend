import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CLOUDINARY } from './cloudinary.constants';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from './cloudinary.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CLOUDINARY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        cloudinary.config({
          cloud_name: config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
          api_key: config.getOrThrow<string>('CLOUDINARY_API_KEY'),
          api_secret: config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
        });
        return cloudinary;
      },
    },
    CloudinaryService,
  ],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
