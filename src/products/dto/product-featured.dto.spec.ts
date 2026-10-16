import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { FindProductsQueryDto } from './find-products-query.dto';
import { UpdateProductDto } from './update-product.dto';

const errorsFor = async <T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
) => validate(plainToInstance(cls, plain), { whitelist: true });

describe('isFeatured en los DTOs de productos', () => {
  describe('FindProductsQueryDto', () => {
    it.each([
      ['true', true],
      ['false', false],
    ])('convierte el texto %s de la URL en booleano', async (raw, expected) => {
      const dto = plainToInstance(FindProductsQueryDto, { isFeatured: raw });
      expect(dto.isFeatured).toBe(expected);
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rechaza valores que no son booleanos', async () => {
      expect(
        await errorsFor(FindProductsQueryDto, { isFeatured: 'quizás' }),
      ).not.toHaveLength(0);
    });

    it('es opcional', async () => {
      expect(await errorsFor(FindProductsQueryDto, {})).toHaveLength(0);
    });
  });

  describe('CreateProductDto y UpdateProductDto', () => {
    const base = { productCategoryId: '0b7d7f3e-0a56-4c53-9a43-9bb8d93ef0a1' };

    it('aceptan isFeatured booleano y lo exigen como booleano', async () => {
      expect(
        await errorsFor(CreateProductDto, {
          ...base,
          name: 'Shampoo',
          isFeatured: true,
        }),
      ).toHaveLength(0);
      expect(
        await errorsFor(CreateProductDto, {
          ...base,
          name: 'Shampoo',
          isFeatured: 'sí',
        }),
      ).not.toHaveLength(0);
      expect(
        await errorsFor(UpdateProductDto, { isFeatured: false }),
      ).toHaveLength(0);
      expect(
        await errorsFor(UpdateProductDto, { isFeatured: 1 }),
      ).not.toHaveLength(0);
    });
  });
});
