import { DomainException } from '../../common/exceptions/domain.exception';

export function assertNoSameDayCategoryConflict(
  categoryName: string,
  hasConflict: boolean,
): void {
  if (hasConflict) {
    throw new DomainException(
      `Ya tienes una reserva de ${categoryName} programada para ese mismo día. No se pueden agendar dos tratamientos de la misma categoría en un solo día.`,
    );
  }
}
