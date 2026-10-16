import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { json, type Request } from 'express';
import helmet from 'helmet';
import { IDEMPOTENT_REPLAY_HEADER } from './common/idempotency/idempotency.interceptor';

export function configureApp(app: INestApplication): void {
  app.use(cookieParser());
  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'https://leonicespa.com',
      'https://admin.leonicespa.com',
      'http://localhost:3000',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    exposedHeaders: [IDEMPOTENT_REPLAY_HEADER],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(
    json({
      limit: '10mb',
      verify: (req: Request, _res, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
}
