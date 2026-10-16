import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { CATALOG_CACHE_KEYS } from '../src/catalog/constants/catalog-cache.constants';

const FEATURED_NAMES = ['Shampoo reparador intensivo MAIS'];

async function invalidateCache() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log(
      '[featured] REDIS_URL no definida: la caché de productos expira sola en 5 minutos.',
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
    console.log('[featured] Caché de productos invalidada.');
  } catch (error) {
    console.log(
      `[featured] No se pudo invalidar la caché: ${(error as Error).message}`,
    );
  } finally {
    redis.disconnect();
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const found = await prisma.product.findMany({
      where: { name: { in: FEATURED_NAMES } },
      select: { id: true, name: true },
    });
    const missing = FEATURED_NAMES.filter(
      (name) => !found.some((product) => product.name === name),
    );
    if (missing.length > 0) {
      throw new Error(`No existen estos productos: ${missing.join(', ')}`);
    }

    const ids = found.map((product) => product.id);
    const [cleared, marked] = await prisma.$transaction([
      prisma.product.updateMany({
        where: { isFeatured: true, id: { notIn: ids } },
        data: { isFeatured: false },
      }),
      prisma.product.updateMany({
        where: { id: { in: ids } },
        data: { isFeatured: true },
      }),
    ]);
    console.log(
      `[featured] Destacados: ${marked.count}. Quitados de otros productos: ${cleared.count}.`,
    );
    await invalidateCache();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
