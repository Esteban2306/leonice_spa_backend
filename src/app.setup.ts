import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import {
  json,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import helmet from 'helmet';
import { IDEMPOTENT_REPLAY_HEADER } from './common/idempotency/idempotency.interceptor';
import {
  isBodyParserError,
  normalizeBodyParserError,
  type ErrorResponseBody,
} from './common/errors/normalize-exception';
import { parseCorsOrigins } from './config/cors';

const DEVELOPMENT_CORS_ORIGINS = ['http://localhost:3000'];

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const DEFAULT_BODY_LIMIT = '256kb';
const IMAGE_BASE64_BODY_LIMIT = '12mb';
const IMAGE_BASE64_ROUTES =
  /^\/api\/v1\/(?:deposits|reservations\/[^/]+\/deposits)\/automatic\/?$/;

function configuredCorsOrigins(): string[] {
  const origins = parseCorsOrigins(process.env.CORS_ORIGIN);
  if (origins.length > 0 || process.env.NODE_ENV === 'production') {
    return origins;
  }
  return DEVELOPMENT_CORS_ORIGINS;
}

function trustReverseProxy(app: INestApplication): void {
  const hops = Number(
    process.env.TRUST_PROXY_HOPS ??
      (process.env.NODE_ENV === 'production' ? 1 : 0),
  );
  if (Number.isInteger(hops) && hops > 0) {
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', hops);
  }
}

function privateByDefault(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function configureApp(app: INestApplication): void {
  trustReverseProxy(app);
  app.use(cookieParser());
  app.use(helmet());
  app.use(privateByDefault);
  app.use(compression());

  app.enableCors({
    origin: configuredCorsOrigins(),
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

  const keepRawBody = (req: Request, _res: unknown, buf: Buffer) => {
    req.rawBody = buf;
  };
  app.use(
    IMAGE_BASE64_ROUTES,
    json({ limit: IMAGE_BASE64_BODY_LIMIT, verify: keepRawBody }),
  );
  app.use(json({ limit: DEFAULT_BODY_LIMIT, verify: keepRawBody }));
  app.use(
    (error: unknown, req: Request, res: Response, next: NextFunction): void => {
      if (!isBodyParserError(error)) {
        next(error);
        return;
      }
      const normalized = normalizeBodyParserError(error);
      const incoming = req.headers['x-correlation-id'];
      const body: ErrorResponseBody = {
        statusCode: normalized.status,
        code: normalized.code,
        message: normalized.message,
        correlationId:
          typeof incoming === 'string' && CORRELATION_ID_PATTERN.test(incoming)
            ? incoming
            : randomUUID(),
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      };
      res.status(normalized.status).json(body);
    },
  );

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
}
