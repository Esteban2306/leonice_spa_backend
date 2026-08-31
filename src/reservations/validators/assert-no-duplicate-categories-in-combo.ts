import { BadRequestException } from '@nestjs/common';

export function assertNoDuplicateCategoriesInCombo(
  categoryIds: string[],
): void {
  const seen = new Set<string>();
  for (const id of categoryIds) {
    if (seen.has(id)) {
      throw new BadRequestException(
        'No puedes combinar dos tratamientos de la misma categoría en una sola reserva',
      );
    }
    seen.add(id);
  }
}
