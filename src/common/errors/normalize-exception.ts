import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { AppException, type ErrorDetails } from './app.exception';
import { ERROR_CATALOG, isErrorCode, type ErrorCode } from './error-catalog';

/** Contrato de error de la API (cuerpo de toda respuesta 4xx/5xx). */
export interface ErrorResponseBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
  correlationId: string;
  timestamp: string;
  path: string;
}

export interface NormalizedError {
  status: HttpStatus;
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
}

const RESERVED_KEYS = new Set([
  'code',
  'message',
  'statusCode',
  'error',
  'details',
]);

const GENERIC_BY_STATUS: Partial<Record<HttpStatus, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

function genericCodeFor(status: HttpStatus): ErrorCode {
  return (
    GENERIC_BY_STATUS[status] ??
    (status >= HttpStatus.INTERNAL_SERVER_ERROR
      ? 'INTERNAL_ERROR'
      : 'BAD_REQUEST')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Campos extra de un cuerpo legado ({code, message, reservationId…}) → details. */
function collectDetails(
  body: Record<string, unknown>,
): ErrorDetails | undefined {
  const extra: Record<string, unknown> = isRecord(body.details)
    ? { ...body.details }
    : {};
  for (const [key, value] of Object.entries(body)) {
    if (!RESERVED_KEYS.has(key) && value !== undefined) extra[key] = value;
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

function normalizeHttpException(exception: HttpException): NormalizedError {
  const status: HttpStatus = exception.getStatus();
  const body = exception.getResponse();

  // 5xx: nunca se filtra el mensaje interno al cliente.
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
    const code = genericCodeFor(status);
    return { status, code, message: ERROR_CATALOG[code].message };
  }

  if (typeof body === 'string') {
    return { status, code: genericCodeFor(status), message: body };
  }

  if (!isRecord(body)) {
    const code = genericCodeFor(status);
    return { status, code, message: ERROR_CATALOG[code].message };
  }

  // ValidationPipe (class-validator): message es la lista de violaciones.
  if (status === HttpStatus.BAD_REQUEST && Array.isArray(body.message)) {
    return {
      status,
      code: 'VALIDATION_FAILED',
      message: ERROR_CATALOG.VALIDATION_FAILED.message,
      details: { errors: body.message.map(String) },
    };
  }

  const details = collectDetails(body);
  const message = typeof body.message === 'string' ? body.message : undefined;

  if (isErrorCode(body.code)) {
    return {
      status,
      code: body.code,
      message: message ?? ERROR_CATALOG[body.code].message,
      details,
    };
  }

  // Código fuera del catálogo: se conserva como dato, el contrato sigue cerrado.
  const code = genericCodeFor(status);
  const unknownCode = typeof body.code === 'string' ? body.code : undefined;
  return {
    status,
    code,
    message: message ?? ERROR_CATALOG[code].message,
    details: unknownCode !== undefined ? { ...details, unknownCode } : details,
  };
}

function normalizePrismaError(
  error: Prisma.PrismaClientKnownRequestError,
): NormalizedError | null {
  switch (error.code) {
    case 'P2002': {
      const target = error.meta?.target;
      return {
        status: HttpStatus.CONFLICT,
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        message: ERROR_CATALOG.UNIQUE_CONSTRAINT_VIOLATION.message,
        details: Array.isArray(target)
          ? { fields: target.map(String) }
          : undefined,
      };
    }
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: ERROR_CATALOG.NOT_FOUND.message,
      };
    default:
      return null;
  }
}

/**
 * Traduce cualquier excepción al contrato único de errores. Pura: no loguea ni
 * conoce la request, para poder probarla de forma aislada.
 */
export function normalizeException(exception: unknown): NormalizedError {
  if (exception instanceof AppException) {
    const body = exception.getResponse() as { message: string };
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: body.message,
      details: exception.details,
    };
  }

  if (exception instanceof ThrottlerException) {
    return {
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: 'RATE_LIMITED',
      message: ERROR_CATALOG.RATE_LIMITED.message,
    };
  }

  if (exception instanceof HttpException) {
    return normalizeHttpException(exception);
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = normalizePrismaError(exception);
    if (mapped) return mapped;
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: ERROR_CATALOG.INTERNAL_ERROR.message,
  };
}
