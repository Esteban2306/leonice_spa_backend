import { AppException } from '../common/errors/app.exception';
import { CloudinaryService } from '../infrastructure/cloudinary/cloudinary.service';
import { SafeCacheService } from '../infrastructure/redis/safe-cache.service';
import { ClientsRepository } from '../clients/repositories/clients.repository';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

interface VariantRow {
  id: string;
  productId: string;
  brand: string;
  presentation: string;
  imageUrl: string | null;
  imagePublicId: string | null;
}

const buildFixture = (
  overrides: Partial<Record<keyof ProductsRepository, unknown>> = {},
) => {
  const calls: string[] = [];
  const destroyed: string[] = [];
  const deletedCacheKeys: string[] = [];

  const repository = {
    findProductBasic: (id: string) =>
      Promise.resolve(id === 'p1' ? { id: 'p1', isActive: true } : null),
    findCategoryById: (id: string) =>
      Promise.resolve(id === 'cat1' ? { id: 'cat1' } : null),
    countTagsByIds: (ids: string[]) =>
      Promise.resolve(ids.filter((id) => id.startsWith('tag')).length),
    findTreatmentIdsRecommending: () => Promise.resolve(['t1']),
    createProduct: () => {
      calls.push('createProduct');
      return Promise.resolve({ id: 'p1' });
    },
    countProductHistory: () =>
      Promise.resolve({ _count: { viewLogs: 0, recommendations: 0 } }),
    deleteProduct: () => {
      calls.push('deleteProduct');
      return Promise.resolve(['img-a', 'img-b']);
    },
    findVariantById: (id: string): Promise<VariantRow | null> =>
      Promise.resolve(
        id === 'v1'
          ? {
              id: 'v1',
              productId: 'p1',
              brand: 'MAIS',
              presentation: '250 ml',
              imageUrl: 'https://old',
              imagePublicId: 'old-img',
            }
          : null,
      ),
    findVariantByProductBrandPresentation: () => Promise.resolve(null),
    updateVariant: (_id: string, data: unknown) => {
      calls.push(`updateVariant:${JSON.stringify(data)}`);
      return Promise.resolve({ id: 'v1' });
    },
    setVariantImage: (_id: string, url: string | null) => {
      calls.push(`setVariantImage:${url}`);
      return Promise.resolve({ id: 'v1', imageUrl: url });
    },
    deleteVariant: () => {
      calls.push('deleteVariant');
      return Promise.resolve({ id: 'v1' });
    },
    replaceProductTags: () => {
      calls.push('replaceProductTags');
      return Promise.resolve([]);
    },
    findProductById: () =>
      Promise.resolve({ id: 'p1', isActive: false, variants: [] }),
    ...overrides,
  };

  const cloudinary = {
    productImagePublicId: () => 'pending-img',
    uploadProductImage: () =>
      Promise.resolve({ url: 'https://new', publicId: 'new-img' }),
    destroyImage: (publicId: string) => {
      destroyed.push(publicId);
      return Promise.resolve();
    },
  };

  const cache = {
    delete: (key: string) => {
      deletedCacheKeys.push(key);
      return Promise.resolve();
    },
  };

  const service = new ProductsService(
    repository as unknown as ProductsRepository,
    cache as unknown as SafeCacheService,
    {} as ClientsRepository,
    cloudinary as unknown as CloudinaryService,
  );

  return { service, calls, destroyed, deletedCacheKeys, cloudinary };
};

const expectCode = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toBeInstanceOf(AppException);
  await promise.catch((error: AppException) => expect(error.code).toBe(code));
};

describe('ProductsService', () => {
  describe('remove', () => {
    it('rechaza borrar un producto con historial y no toca la base', async () => {
      const { service, calls } = buildFixture({
        countProductHistory: () =>
          Promise.resolve({ _count: { viewLogs: 3, recommendations: 0 } }),
      });

      await expectCode(service.remove('p1'), 'PRODUCT_HAS_HISTORY');
      expect(calls).not.toContain('deleteProduct');
    });

    it('borra un producto sin historial y elimina sus imágenes de Cloudinary', async () => {
      const { service, calls, destroyed } = buildFixture();

      await service.remove('p1');

      expect(calls).toContain('deleteProduct');
      expect(destroyed).toEqual(['img-a', 'img-b']);
    });

    it('responde PRODUCT_NOT_FOUND si el producto no existe', async () => {
      const { service } = buildFixture({
        countProductHistory: () => Promise.resolve(null),
      });

      await expectCode(service.remove('nope'), 'PRODUCT_NOT_FOUND');
    });
  });

  describe('create', () => {
    it('rechaza variantes repetidas en el mismo producto ignorando mayúsculas', async () => {
      const { service, calls } = buildFixture();

      await expectCode(
        service.create({
          productCategoryId: 'cat1',
          name: 'Shampoo',
          variants: [
            { brand: 'MAIS', presentation: '250 ml', price: 45000 },
            { brand: 'mais', presentation: '250 ML', price: 47000 },
          ],
        }),
        'PRODUCT_VARIANT_ALREADY_EXISTS',
      );
      expect(calls).not.toContain('createProduct');
    });

    it('rechaza etiquetas inexistentes', async () => {
      const { service } = buildFixture();

      await expectCode(
        service.create({
          productCategoryId: 'cat1',
          name: 'Shampoo',
          tagIds: ['tag-1', 'missing'],
        }),
        'PRODUCT_TAG_NOT_FOUND',
      );
    });

    it('rechaza una categoría inexistente', async () => {
      const { service } = buildFixture();

      await expectCode(
        service.create({ productCategoryId: 'nope', name: 'Shampoo' }),
        'PRODUCT_CATEGORY_NOT_FOUND',
      );
    });
  });

  describe('imágenes de variante', () => {
    it('al subir una imagen nueva guarda la URL y borra la anterior', async () => {
      const { service, calls, destroyed } = buildFixture();

      await service.uploadVariantImage('v1', Buffer.from('x'));

      expect(calls).toContain('setVariantImage:https://new');
      expect(destroyed).toEqual(['old-img']);
    });

    it('si Cloudinary falla responde PRODUCT_IMAGE_UPLOAD_FAILED, no toca la base y limpia un posible huérfano', async () => {
      const fixture = buildFixture();
      fixture.cloudinary.uploadProductImage = () =>
        Promise.reject(new Error('timeout'));

      await expectCode(
        fixture.service.uploadVariantImage('v1', Buffer.from('x')),
        'PRODUCT_IMAGE_UPLOAD_FAILED',
      );
      expect(fixture.calls).toEqual([]);
      expect(fixture.destroyed).toEqual(['pending-img']);
    });

    it('si falla la base tras subir, borra la imagen recién subida', async () => {
      const { service, destroyed } = buildFixture({
        setVariantImage: () => Promise.reject(new Error('db down')),
      });

      await expect(
        service.uploadVariantImage('v1', Buffer.from('x')),
      ).rejects.toThrow('db down');
      expect(destroyed).toEqual(['new-img']);
    });

    it('quitar la imagen limpia la URL y la borra de Cloudinary', async () => {
      const { service, calls, destroyed } = buildFixture();

      await service.removeVariantImage('v1');

      expect(calls).toContain('setVariantImage:null');
      expect(destroyed).toEqual(['old-img']);
    });

    it('un fallo al borrar en Cloudinary no rompe la operación', async () => {
      const fixture = buildFixture();
      fixture.cloudinary.destroyImage = () => Promise.reject(new Error('x'));

      await expect(
        fixture.service.removeVariant('v1'),
      ).resolves.toBeUndefined();
      expect(fixture.calls).toContain('deleteVariant');
    });
  });

  describe('updateVariant', () => {
    it('rechaza renombrar a una marca y presentación que ya existe en otra variante', async () => {
      const { service, calls } = buildFixture({
        findVariantByProductBrandPresentation: () =>
          Promise.resolve({ id: 'v2' }),
      });

      await expectCode(
        service.updateVariant('v1', { presentation: '1 L' }),
        'PRODUCT_VARIANT_ALREADY_EXISTS',
      );
      expect(calls.some((c) => c.startsWith('updateVariant'))).toBe(false);
    });

    it('cambiar la URL a mano olvida el publicId anterior y borra esa imagen', async () => {
      const { service, calls, destroyed } = buildFixture();

      await service.updateVariant('v1', { imageUrl: 'https://otra' });

      expect(calls).toContain(
        'updateVariant:{"imageUrl":"https://otra","imagePublicId":null}',
      );
      expect(destroyed).toEqual(['old-img']);
    });

    it('invalida el catálogo y las recomendaciones de los servicios que lo usan', async () => {
      const { service, deletedCacheKeys } = buildFixture();

      await service.updateVariant('v1', { price: 50000 });

      expect(deletedCacheKeys).toEqual([
        'catalog:products:list',
        'catalog:recommendations:t1',
      ]);
    });
  });

  it('assignTags rechaza etiquetas inexistentes antes de reemplazar', async () => {
    const { service, calls } = buildFixture();

    await expectCode(
      service.assignTags('p1', ['tag-1', 'missing']),
      'PRODUCT_TAG_NOT_FOUND',
    );
    expect(calls).not.toContain('replaceProductTags');
  });

  it('el detalle público oculta productos desactivados', async () => {
    const { service } = buildFixture();

    await expectCode(service.findOnePublic('p1'), 'PRODUCT_NOT_FOUND');
  });
});
