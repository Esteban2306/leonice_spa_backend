import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CLIENT_CANCELLATION_SCOPES,
  type ClientCancellationScope,
} from '../domain/client-cancellation';

export class CancelReservationDto {
  @IsString()
  @MinLength(10)
  phone: string;

  @IsOptional()
  @IsIn(CLIENT_CANCELLATION_SCOPES)
  scope?: ClientCancellationScope;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
