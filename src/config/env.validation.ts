import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  validateSync,
} from 'class-validator';

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

  @IsOptional()
  @IsInt()
  THROTTLE_LIMIT?: number;

  @IsString()
  @Length(64, 64)
  ENCRYPTION_KEY: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${messages}`);
  }

  return validatedConfig;
}
