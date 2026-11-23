import { resolveProductPromotion } from './resolve-product-promotion';

const promo = (
  id: string,
  productId: string | null,
  productCategoryId: string | null,
) => ({ id, productId, productCategoryId });

describe('resolveProductPromotion', () => {
  const product = { id: 'kit-1', productCategoryId: 'rituales' };

  it('la promoción del producto gana a la de su categoría', () => {
    const found = resolveProductPromotion(
      [promo('cat', null, 'rituales'), promo('own', 'kit-1', null)],
      product,
    );
    expect(found?.id).toBe('own');
  });

  it('sin promoción propia usa la de su categoría de productos', () => {
    expect(
      resolveProductPromotion([promo('cat', null, 'rituales')], product)?.id,
    ).toBe('cat');
  });

  it('ignora promociones de otros productos y de servicios', () => {
    expect(
      resolveProductPromotion(
        [promo('otro', 'shampoo', null), promo('servicio', null, null)],
        product,
      ),
    ).toBeNull();
  });
});
