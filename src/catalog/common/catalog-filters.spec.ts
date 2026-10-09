import { CatalogStatusFilter, isActiveWhere } from './catalog-filters';

describe('isActiveWhere', () => {
  it('filters active records', () => {
    expect(isActiveWhere(CatalogStatusFilter.ACTIVE)).toEqual({
      isActive: true,
    });
  });

  it('filters inactive records', () => {
    expect(isActiveWhere(CatalogStatusFilter.INACTIVE)).toEqual({
      isActive: false,
    });
  });

  it('does not filter when all records are requested', () => {
    expect(isActiveWhere(CatalogStatusFilter.ALL)).toEqual({});
  });
});
