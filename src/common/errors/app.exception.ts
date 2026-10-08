import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG, type ErrorCode } from './error-catalog';

export type ErrorDetails = Readonly<Record<string, unknown>>;

export interface AppExceptionOptions {
  message?: string;
  details?: ErrorDetails;
  cause?: unknown;
}

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
