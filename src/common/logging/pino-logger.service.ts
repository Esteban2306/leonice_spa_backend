import { Injectable, LoggerService } from '@nestjs/common';
import pino, { Logger as PinoLogger } from 'pino';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger: PinoLogger;
  private readonly isDevelopment = process.env.NODE_ENV === 'development';

  constructor(private readonly requestContext: RequestContextService) {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      formatters: {
        level: (label) => ({ level: label }),
      },
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname,req,res',
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          singleLine: false,
          hideObject: false,
          messageFormat: '{msg}',
          errorLikeObjectKeys: ['err', 'error'],
          customColors: {
            info: 'blue',
            error: 'red',
            warn: 'yellow',
            debug: 'green',
            trace: 'gray',
            fatal: 'bgRed white',
          },
          customLogs: {
            // level: (label) => ({ level: label.toUpperCase() }),
          },
          minimumSpace: 10,
        },
      },
    });
  }

  private getContextInfo() {
    const store = this.requestContext.get?.();
    return {
      correlationId: store?.correlationId,
      userId: store?.userId,
    };
  }

  private formatLogObject(
    level: string,
    message: unknown,
    context?: string,
    optionalParams?: unknown[],
  ) {
    const text =
      typeof message === 'string' ? message : JSON.stringify(message);
    let logContext = context;
    let details = optionalParams;

    if (optionalParams?.length === 1 && typeof optionalParams[0] === 'string') {
      logContext = optionalParams[0];
      details = undefined;
    } else if (optionalParams && optionalParams?.length > 1) {
      logContext = optionalParams[optionalParams.length - 1] as string;
      details = optionalParams?.slice(0, -1);
    }

    const logObj: Record<string, unknown> = {
      msg: text,
      ...this.getContextInfo(),
    };

    if (logContext) logObj.context = logContext;
    if (details?.length) logObj.details = details;

    return logObj;
  }

  log(message: string, ...optionalParams: unknown[]): void {
    const logObj = this.formatLogObject(
      'info',
      message,
      undefined,
      optionalParams,
    );
    this.logger.info(logObj);
  }

  error(message: string, ...optionalParams: unknown[]): void {
    const logObj = this.formatLogObject(
      'error',
      message,
      undefined,
      optionalParams,
    );
    this.logger.error(logObj);
  }

  warn(message: string, ...optionalParams: unknown[]): void {
    const logObj = this.formatLogObject(
      'warn',
      message,
      undefined,
      optionalParams,
    );
    this.logger.warn(logObj);
  }

  debug?(message: string, ...optionalParams: unknown[]): void {
    const logObj = this.formatLogObject(
      'debug',
      message,
      undefined,
      optionalParams,
    );
    this.logger.debug(logObj);
  }

  verbose?(message: string, ...optionalParams: unknown[]): void {
    const logObj = this.formatLogObject(
      'trace',
      message,
      undefined,
      optionalParams,
    );
    this.logger.trace(logObj);
  }

  fatal?(message: string, ...optionalParams: unknown[]): void {
    const logObj = this.formatLogObject(
      'fatal',
      message,
      undefined,
      optionalParams,
    );
    this.logger.fatal(logObj);
  }
}
