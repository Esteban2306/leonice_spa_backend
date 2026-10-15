import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { CATALOG_CACHE_KEYS } from '../src/catalog/constants/catalog-cache.constants';
import { slugify } from '../src/catalog/common/slugify';

const TEST_CATEGORY = 'Prueba landing';

interface SeedVariant {
  brand: string;
  presentation: string;
  price: number;
}

interface SeedProduct {
  name: string;
  description: string;
  tags: string[];
  variants: SeedVariant[];
}

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Shampoo reparador intensivo',
    description:
      'Limpieza suave que repara la fibra dañada por procesos químicos.',
    tags: ['Rehidratante', 'Reparación'],
    variants: [
      { brand: 'MAIS', presentation: '250 ml', price: 45000 },
      { brand: 'MAIS', presentation: '1 L', price: 118000 },
    ],
  },
  {
    name: 'Shampoo detox',
    description:
      'Equilibra el cuero cabelludo graso con extracto de menta y carbón activado.',
    tags: ['Cabello graso', 'Anticaspa'],
    variants: [{ brand: 'MAIS', presentation: '250 ml', price: 42000 }],
  },
  {
    name: 'Mascarilla de cuidado y nutrición',
    description: 'Nutrición profunda para medios y puntas resecos.',
    tags: ['Nutrición', 'Brillo'],
    variants: [
      { brand: 'MAIS', presentation: '250 g', price: 58000 },
      { brand: 'MAIS', presentation: '500 g', price: 96000 },
    ],
  },
  {
    name: 'Perfume capilar',
    description: 'Aroma duradero y brillo inmediato sin apelmazar.',
    tags: ['Brillo'],
    variants: [{ brand: 'MAIS', presentation: '100 ml', price: 39000 }],
  },
  {
    name: 'Aceite de vitaminas',
    description: 'Sella la cutícula y controla el frizz con vitaminas A y E.',
    tags: ['Control de frizz', 'Brillo'],
    variants: [{ brand: 'MAIS', presentation: '60 ml', price: 52000 }],
  },
  {
    name: 'Acondicionador hidratante',
    description: 'Desenreda y devuelve la suavidad desde el primer uso.',
    tags: ['Rehidratante'],
    variants: [
      { brand: 'MAIS', presentation: '250 ml', price: 44000 },
      { brand: 'MAIS', presentation: '1 L', price: 112000 },
    ],
  },
  {
    name: 'Protector térmico',
    description:
      'Protege la fibra del calor de secador y plancha hasta 230 °C.',
    tags: ['Protección térmica', 'Control de frizz'],
    variants: [{ brand: 'MAIS', presentation: '150 ml', price: 47000 }],
  },
  {
    name: 'Tónico anticaída',
    description: 'Estimula el cuero cabelludo y fortalece la raíz.',
    tags: ['Anticaída'],
    variants: [{ brand: 'MAIS', presentation: '120 ml', price: 65000 }],
  },
];

async function invalidateCache() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log(
      '[landing] REDIS_URL no definida: la caché de productos expira sola en 5 minutos.',
    );
    return;
  }
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.del(
      CATALOG_CACHE_KEYS.products,
      CATALOG_CACHE_KEYS.productCatalog,
    );
    console.log('[landing] Caché de productos invalidada.');
  } catch (error) {
    console.log(
      `[landing] No se pudo invalidar la caché: ${(error as Error).message}`,
    );
  } finally {
    redis.disconnect();
  }
}

async function seed(prisma: PrismaClient) {
  const category = await prisma.productCategory.upsert({
    where: { name: TEST_CATEGORY },
    update: { isActive: true },
    create: { name: TEST_CATEGORY, slug: slugify(TEST_CATEGORY) },
  });

  for (const item of PRODUCTS) {
    const existing = await prisma.product.findFirst({
      where: { name: item.name, productCategoryId: category.id },
    });
    const product = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: { description: item.description, isActive: true },
        })
      : await prisma.product.create({
          data: {
            name: item.name,
            slug: slugify(item.name),
            description: item.description,
            productCategoryId: category.id,
          },
        });

    for (const variant of item.variants) {
      await prisma.productVariant.upsert({
        where: {
          productId_brand_presentation: {
            productId: product.id,
            brand: variant.brand,
            presentation: variant.presentation,
          },
        },
        update: { price: variant.price, isActive: true },
        create: { ...variant, productId: product.id },
      });
    }

    for (const tagName of item.tags) {
      const tag = await prisma.productTag.upsert({
        where: { name: tagName },
        update: { isActive: true },
        create: { name: tagName, slug: slugify(tagName) },
      });
      await prisma.productTagAssignment.upsert({
        where: { productId_tagId: { productId: product.id, tagId: tag.id } },
        update: {},
        create: { productId: product.id, tagId: tag.id },
      });
    }
    console.log(
      `[landing] ${existing ? 'Actualizado' : 'Creado'}: ${item.name}`,
    );
  }
}

async function deactivate(prisma: PrismaClient) {
  const result = await prisma.product.updateMany({
    where: { category: { name: TEST_CATEGORY } },
    data: { isActive: false },
  });
  console.log(`[landing] Productos de prueba desactivados: ${result.count}`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    if (process.argv.includes('--deactivate')) await deactivate(prisma);
    else await seed(prisma);
    await invalidateCache();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
