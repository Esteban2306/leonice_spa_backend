import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { CATALOG_CACHE_KEYS } from '../src/catalog/constants/catalog-cache.constants';
import { slugify } from '../src/catalog/common/slugify';
import { COMBO_CATEGORY_SLUG } from '../src/products/constants/product-combo.constants';
import { ritualVariantLabels } from '../src/products/domain/ritual-pricing';
import { RITUALS, RitualContent } from './seed-data/product-rituals-content';

interface ResolvedItem {
  variantId: string;
  brand: string;
  quantity: number;
  unitPrice: number;
}

async function resolveItems(
  prisma: PrismaClient,
  ritual: RitualContent,
): Promise<ResolvedItem[]> {
  const resolved: ResolvedItem[] = [];
  for (const item of ritual.items) {
    const variant = await prisma.productVariant.findFirst({
      where: {
        presentation: item.presentation,
        isActive: true,
        product: { name: item.productName, kind: 'SINGLE', isActive: true },
      },
    });
    if (!variant) {
      throw new Error(
        `[rituales] "${ritual.name}": no existe el producto activo "${item.productName}" (${item.presentation})`,
      );
    }
    resolved.push({
      variantId: variant.id,
      brand: variant.brand,
      quantity: item.quantity,
      unitPrice: Number(variant.price),
    });
  }
  return resolved;
}

async function upsertRitual(
  prisma: PrismaClient,
  categoryId: string,
  ritual: RitualContent,
  displayOrder: number,
) {
  const items = await resolveItems(prisma, ritual);
  const labels = ritualVariantLabels(items);
  const pricePesos = items.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0,
  );
  const slug = slugify(ritual.name);

  const content = {
    name: ritual.name,
    slug,
    productCategoryId: categoryId,
    description: ritual.description,
    tagline: ritual.tagline,
    purpose: ritual.purpose,
    benefits: ritual.benefits,
    howToUse: ritual.howToUse,
    idealFor: ritual.idealFor,
    usageFrequency: ritual.usageFrequency,
    precautions: ritual.precautions,
    isActive: true,
    isFeatured: ritual.isFeatured,
    displayOrder,
  };

  const product = await prisma.product.upsert({
    where: { slug },
    update: content,
    create: { ...content, kind: 'COMBO' },
  });
  if (product.kind !== 'COMBO') {
    throw new Error(`[rituales] "${slug}" ya existe y no es un ritual`);
  }

  const existingVariant = await prisma.productVariant.findFirst({
    where: { productId: product.id },
  });
  const variantData = { ...labels, price: pricePesos, isActive: true };
  if (existingVariant) {
    await prisma.productVariant.update({
      where: { id: existingVariant.id },
      data: variantData,
    });
  } else {
    await prisma.productVariant.create({
      data: { productId: product.id, ...variantData },
    });
  }

  await prisma.productComboItem.deleteMany({
    where: { comboProductId: product.id },
  });
  await prisma.productComboItem.createMany({
    data: items.map((item, position) => ({
      comboProductId: product.id,
      variantId: item.variantId,
      quantity: item.quantity,
      position,
    })),
  });

  await prisma.productTagAssignment.deleteMany({
    where: { productId: product.id },
  });
  for (const tagName of ritual.tags) {
    const tag = await prisma.productTag.upsert({
      where: { name: tagName },
      update: { isActive: true },
      create: { name: tagName, slug: slugify(tagName) },
    });
    await prisma.productTagAssignment.create({
      data: { productId: product.id, tagId: tag.id },
    });
  }

  console.log(
    `[rituales] ${ritual.name}: ${items.length} productos, $${pricePesos.toLocaleString('es-CO')}`,
  );
}

async function invalidateCache() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log(
      '[rituales] REDIS_URL no definida: la caché de productos expira sola en 5 minutos.',
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
    console.log('[rituales] Caché de productos invalidada.');
  } catch (error) {
    console.log(
      `[rituales] No se pudo invalidar la caché: ${(error as Error).message}`,
    );
  } finally {
    redis.disconnect();
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const category = await prisma.productCategory.findUnique({
      where: { slug: COMBO_CATEGORY_SLUG },
    });
    if (!category) {
      throw new Error(
        `[rituales] Falta la categoría "${COMBO_CATEGORY_SLUG}": aplica las migraciones primero`,
      );
    }
    for (const [index, ritual] of RITUALS.entries()) {
      await prisma.$transaction(async (tx) => {
        await upsertRitual(tx as PrismaClient, category.id, ritual, index + 1);
      });
    }
    console.log(`[rituales] Rituales cargados: ${RITUALS.length}`);
  } finally {
    await prisma.$disconnect();
  }
  await invalidateCache();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
