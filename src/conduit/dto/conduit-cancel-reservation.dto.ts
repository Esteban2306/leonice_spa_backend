import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsZonedDateTime } from '../../common/validation/date-input.validators';
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

export class ConduitRescheduleReservationDto {
  /** Lo reemplaza Leonice por el teléfono verificado del chat. */
  @IsString()
  @MinLength(10)
  phone!: string;

  @IsUUID()
  reservationId!: string;

  /** ISO con zona, p. ej. 2026-10-15T08:00:00-05:00. */
  @IsZonedDateTime()
  newScheduledStart!: string;
}
