import { Transform } from 'class-transformer';

export enum CatalogStatusFilter {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ALL = 'ALL',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export function isActiveWhere(
  status: CatalogStatusFilter,
): { isActive: boolean } | Record<string, never> {
  if (status === CatalogStatusFilter.ACTIVE) return { isActive: true };
  if (status === CatalogStatusFilter.INACTIVE) return { isActive: false };
  return {};
}

export function TransformBooleanQuery() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  });
}

export function TransformNumberQuery() {
  return Transform(({ value }: { value: unknown }) =>
    value === '' || value == null ? undefined : Number(value),
  );
}

export function TransformTrimmedQuery() {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  );
}
