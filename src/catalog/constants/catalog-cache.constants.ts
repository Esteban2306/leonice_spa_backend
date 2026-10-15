export const CATALOG_CACHE_TTL_SECONDS = 300;

export const CATALOG_CACHE_KEYS = {
  categories: 'catalog:categories:list',
  treatments: 'catalog:treatments:list',
  products: 'catalog:products:list',
  showcase: 'catalog:showcase:tree',
  productCatalog: 'catalog:products:catalog',
  recommendation: (treatmentId: string) =>
    `catalog:recommendations:${treatmentId}`,
};
