import { Injectable, LoggerService } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';

const COLORS: Record<string, string> = {
  log: '\x1b[32m',
  error: '\x1b[31m',
  warn: '\x1b[33m',
  debug: '\x1b[36m',
  verbose: '\x1b[90m',
  fatal: '\x1b[97;41m',
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private readonly isDevelopment = process.env.NODE_ENV === 'development';

  constructor(private readonly requestContext: RequestContextService) {}

  log(message: unknown, ...optionalParams: unknown[]) {
    this.write('log', message, optionalParams);
  }
  error(message: unknown, ...optionalParams: unknown[]) {
    this.write('error', message, optionalParams);
  }
  warn(message: unknown, ...optionalParams: unknown[]) {
    this.write('warn', message, optionalParams);
  }
  debug(message: unknown, ...optionalParams: unknown[]) {
    this.write('debug', message, optionalParams);
  }
  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.write('verbose', message, optionalParams);
  }
  fatal(message: unknown, ...optionalParams: unknown[]) {
    this.write('fatal', message, optionalParams);
  }

  private write(level: string, message: unknown, optionalParams: unknown[]) {
    const store = this.requestContext.get();
    const text =
      typeof message === 'string' ? message : JSON.stringify(message);

    let context: string | undefined;
    let details: unknown[] | undefined;
    if (optionalParams.length === 1 && typeof optionalParams[0] === 'string') {
      context = optionalParams[0];
    } else if (optionalParams.length > 1) {
      context = optionalParams[optionalParams.length - 1] as string;
      details = optionalParams.slice(0, -1);
    }

    const stream =
      level === 'error' || level === 'fatal' ? process.stderr : process.stdout;

    if (this.isDevelopment) {
      stream.write(
        this.formatPretty(level, text, context, details, store?.correlationId) +
          '\n',
      );
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: text,
      correlationId: store?.correlationId,
      userId: store?.userId,
      context,
      details,
    };
    stream.write(JSON.stringify(entry) + '\n');
  }

  private formatPretty(
    level: string,
    message: string,
    context: string | undefined,
    details: unknown[] | undefined,
    correlationId: string | undefined,
  ): string {
    const color = COLORS[level] ?? '';
    const shortId = correlationId ? correlationId.slice(0, 8) : '--------';
    const levelLabel = level.toUpperCase().padEnd(7);
    const contextLabel = context ? `${DIM}[${context}]${RESET} ` : '';
    const detailsText = details?.length
      ? `\n${DIM}${details.join(' ')}${RESET}`
      : '';

    return `${DIM}${shortId}${RESET} ${color}${levelLabel}${RESET} ${contextLabel}${message}${detailsText}`;
  }
}
