import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsZonedDateTime } from '../../common/validation/date-input.validators';
import { ClientInputDto } from '../../reservations/dto/create-reservation.dto';

/**
 * Reserva desde el bot. Además de los ids acepta el nombre de los servicios:
 * la clienta confirma por nombre y el bot no tiene que volver a consultar
 * la lista solo para obtener un id.
 */
export class ConduitCreateReservationDto {
  @ValidateNested()
  @Type(() => ClientInputDto)
  client: ClientInputDto;

  @IsOptional()
  @ArrayMaxSize(10)
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  treatments?: string[];

  @IsOptional()
  @ArrayMaxSize(10)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(80, { each: true })
  treatmentNames?: string[];

  @IsZonedDateTime()
  scheduledStart: string;
}
