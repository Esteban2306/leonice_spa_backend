import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { StructuredLoggerService } from './common/logging/structured-logger.service';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  const port = config.get<number>('PORT', 3000);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  app.useLogger(app.get(StructuredLoggerService));
  app.use(cookieParser());
  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGIN', 'http://localhost:3001')
      .split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(json({ limit: '10mb' }));

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Leonice Spa API')
      .setDescription('API del backend de Leonice Spa')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((err) => {
  console.error('Error fatal al iniciar la aplicación', err);
  process.exit(1);
});
