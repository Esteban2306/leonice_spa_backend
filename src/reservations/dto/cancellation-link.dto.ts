import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CLIENT_CANCELLATION_SCOPES,
  type ClientCancellationScope,
} from '../domain/client-cancellation';

export class CancellationLinkTokenParamDto {
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, {
    message: 'El enlace de cancelación no tiene un formato válido',
  })
  token!: string;
}

export class CancelWithLinkDto {
  @IsIn(CLIENT_CANCELLATION_SCOPES)
  scope!: ClientCancellationScope;

  @IsOptional()
  @IsUUID()
  reservationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class IssueCancellationLinkDto {
  @IsOptional()
  @IsBoolean()
  send?: boolean;
}
