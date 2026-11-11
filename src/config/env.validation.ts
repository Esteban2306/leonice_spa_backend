import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  MinLength,
  IsUrl,
  validateSync,
} from 'class-validator';
import { encryptionKeyIssues, productionIssues } from './production-safety';

enum Environment {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}
class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  REDIS_URL: string;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  CORS_ORIGIN: string;

  @IsString()
  @IsOptional()
  COOKIE_DOMAIN?: string;

  @IsString()
  @IsOptional()
  CONDUIT_TOOL_API_KEY?: string;

  @IsString()
  @IsOptional()
  CONDUIT_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  CONDUIT_VERIFICATION_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  SIIGO_ENABLED?: string;

  @IsOptional()
  @IsString()
  SIIGO_BASE_URL?: string;

  @IsOptional()
  @IsString()
  SIIGO_USERNAME?: string;

  @IsOptional()
  @IsString()
  SIIGO_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  SIIGO_PARTNER_ID?: string;

  @IsOptional()
  @IsInt()
  @Min(5000)
  SIIGO_TIMEOUT_MS?: number;

  @IsOptional()
  @IsString()
  SIIGO_RECEIPT_DOCUMENT_ID?: string;

  @IsOptional()
  @IsString()
  SIIGO_INCOME_CONCEPT_ID?: string;

  @IsOptional()
  @IsString()
  SIIGO_PAYMENT_CASH_ID?: string;

  @IsOptional()
  @IsString()
  SIIGO_PAYMENT_TRANSFER_ID?: string;

  @IsOptional()
  @IsString()
  SIIGO_COST_CENTER_ID?: string;

  @IsOptional()
  @IsString()
  SIIGO_CUSTOMER_IDENTIFICATION?: string;

  @IsOptional()
  @IsString()
  SIIGO_CUSTOMER_BRANCH_OFFICE?: string;

  @IsOptional()
  @IsInt()
  THROTTLE_LIMIT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT_DEFAULT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT_AVAILABILITY?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT_RESERVATIONS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT_WEBHOOKS?: number;

  @IsString()
  @Length(64, 64)
  ENCRYPTION_KEY: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  CANCELLATION_LINK_SECRET?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  CLIENT_CANCELLATION_URL?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  const messages = [
    ...errors.map((error) => Object.values(error.constraints ?? {}).join(', ')),
    ...encryptionKeyIssues(config),
    ...productionIssues(config),
  ];
  if (messages.length > 0) {
    throw new Error(
      `Configuración de entorno inválida:\n${messages.join('\n')}`,
    );
  }

  return validatedConfig;
}
