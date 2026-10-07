import { BadRequestException, type HttpException } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';
import { InsufficientCapacityException } from '../../common/exceptions/insufficient-capacity.exception';
import type { PlacementRejection } from './evaluate-placement';

export const PLACEMENT_ERROR_CODES: Record<PlacementRejection, string> = {
  INVALID_RANGE: 'PLACEMENT_INVALID_RANGE',
  IN_THE_PAST: 'PLACEMENT_IN_THE_PAST',
  OUTSIDE_OPERATING_HOURS: 'PLACEMENT_OUTSIDE_OPERATING_HOURS',
  CATEGORY_DAY_CONFLICT: 'PLACEMENT_CATEGORY_DAY_CONFLICT',
  CLIENT_OVERLAP: 'PLACEMENT_CLIENT_OVERLAP',
  NO_CAPACITY: 'PLACEMENT_NO_CAPACITY',
};

export function placementRejectionException(
  reason: PlacementRejection,
): HttpException {
  const code = PLACEMENT_ERROR_CODES[reason];

  switch (reason) {
    case 'INVALID_RANGE':
      return new BadRequestException({
        code,
        message: 'El rango de horas de la reserva no es válido',
      });
    case 'OUTSIDE_OPERATING_HOURS':
      return new BadRequestException({
        code,
        message:
          'El horario solicitado está fuera del horario de atención del spa',
      });
    case 'IN_THE_PAST':
      return new DomainException({
        code,
        message: 'La nueva fecha ya pasó. Elige un horario futuro.',
      });
    case 'CATEGORY_DAY_CONFLICT':
      return new DomainException({
        code,
        message: 'Ya hay otra reserva activa de esta categoría ese día.',
      });
    case 'CLIENT_OVERLAP':
      return new DomainException({
        code,
        message: 'Hay otra reserva del cliente que se cruza con este horario.',
      });
    case 'NO_CAPACITY':
      return new InsufficientCapacityException(
        'Ya no hay cupo disponible para ese horario',
      );
  }
}
