import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CLIENT_CANCELLATION_SCOPES,
  type ClientCancellationScope,
} from '../../reservations/domain/client-cancellation';

export class ConduitUpcomingReservationsQueryDto {
  @IsString()
  @MinLength(10)
  phone!: string;
}

export class ConduitCancelReservationDto {
  @IsString()
  @MinLength(10)
  phone!: string;

  @IsUUID()
  reservationId!: string;

  @IsIn(CLIENT_CANCELLATION_SCOPES)
  scope!: ClientCancellationScope;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
