import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG, type ErrorCode } from './error-catalog';

export type ErrorDetails = Readonly<Record<string, unknown>>;

export interface AppExceptionOptions {
  /** Mensaje más específico que el del catálogo (mismo code, mismo status). */
  message?: string;
  /** Datos estructurados para el cliente (p. ej. reservationId, minimum). */
  details?: ErrorDetails;
  cause?: unknown;
}

/**
 * Excepción de la aplicación con código del catálogo. El status HTTP sale del
 * catálogo, así que un mismo `code` responde siempre igual en toda la API.
 */
export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details?: ErrorDetails;

  constructor(code: ErrorCode, options: AppExceptionOptions = {}) {
    const definition = ERROR_CATALOG[code];
    const message = options.message ?? definition.message;
    super({ code, message, details: options.details }, definition.status, {
      cause: options.cause,
    });
    this.code = code;
    this.details = options.details;
  }
}
