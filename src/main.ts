import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PinoLoggerService } from './common/logging/pino-logger.service';
import { assertBusinessTimezone } from './config/timezone';
import { configureApp } from './app.setup';

async function bootstrap() {
  assertBusinessTimezone();
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  const pinoLogger = app.get(PinoLoggerService);

  const port = config.get<number>('PORT', 3920);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  app.useLogger(pinoLogger);
  configureApp(app);

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
