import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { CATALOG_CACHE_KEYS } from '../src/catalog/constants/catalog-cache.constants';

const CATEGORY_SLUG = 'unas';
const APPLY_FLAG = '--apply';

async function main() {
  const apply = process.argv.includes(APPLY_FLAG);
  const prisma = new PrismaClient();
  try {
    const treatmentIds = await removeNails(prisma, apply);
    if (apply && treatmentIds.length > 0) await invalidateCache(treatmentIds);
  } finally {
    await prisma.$disconnect();
  }
}

async function removeNails(
  prisma: PrismaClient,
  apply: boolean,
): Promise<string[]> {
  const category = await prisma.category.findUnique({
    where: { slug: CATEGORY_SLUG },
    include: { treatments: { select: { id: true, name: true } } },
  });
  if (!category) {
    console.log('[uñas] La categoría no existe: no hay nada que borrar.');
    return [];
  }

  const treatmentIds = category.treatments.map((treatment) => treatment.id);
  const reservations = await prisma.reservation.count({
    where: {
      OR: [{ categoryId: category.id }, { treatmentId: { in: treatmentIds } }],
    },
  });
  if (reservations > 0) {
    throw new Error(
      `[uñas] Hay ${reservations} reservas de uñas: no se borra nada. Resuélvelas primero.`,
    );
  }

  const promotions = await prisma.promotion.findMany({
    where: {
      OR: [{ categoryId: category.id }, { treatmentId: { in: treatmentIds } }],
    },
    select: { id: true },
  });
  const promotionIds = promotions.map((promotion) => promotion.id);

  console.log(
    `[uñas] ${category.treatments.length} tratamientos, ${promotionIds.length} promociones. Sin reservas.`,
  );
  if (!apply) {
    console.log(
      `[uñas] Simulación: ejecuta de nuevo con ${APPLY_FLAG} para borrar.`,
    );
    return [];
  }

  await prisma.$transaction(async (tx) => {
    await tx.automationExecution.updateMany({
      where: { promotionId: { in: promotionIds } },
      data: { promotionId: null },
    });
    await tx.automationRule.deleteMany({
      where: {
        OR: [
          { categoryId: category.id },
          { treatmentId: { in: treatmentIds } },
          { promotionId: { in: promotionIds } },
        ],
      },
    });
    await tx.promotion.deleteMany({ where: { id: { in: promotionIds } } });
    await tx.treatmentProductRecommendation.deleteMany({
      where: { treatmentId: { in: treatmentIds } },
    });
    await tx.treatmentHairLengthPricing.deleteMany({
      where: { treatmentId: { in: treatmentIds } },
    });
    await tx.treatmentHairColorSurcharge.deleteMany({
      where: { treatmentId: { in: treatmentIds } },
    });
    await tx.treatmentStep.deleteMany({
      where: { treatmentId: { in: treatmentIds } },
    });
    await tx.treatment.deleteMany({ where: { id: { in: treatmentIds } } });
    await tx.capacityPool.deleteMany({ where: { categoryId: category.id } });
    await tx.scheduleException.deleteMany({
      where: { categoryId: category.id },
    });
    await tx.category.delete({ where: { id: category.id } });
  });
  console.log('[uñas] Categoría y tratamientos de uñas eliminados.');
  return treatmentIds;
}

async function invalidateCache(treatmentIds: string[]) {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log(
      '[uñas] REDIS_URL no definida: la caché del catálogo expira sola en 5 minutos.',
    );
    return;
  }
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.del(
      CATALOG_CACHE_KEYS.categories,
      CATALOG_CACHE_KEYS.treatments,
      CATALOG_CACHE_KEYS.showcase,
      ...treatmentIds.map((id) => CATALOG_CACHE_KEYS.recommendation(id)),
    );
    console.log('[uñas] Caché del catálogo invalidada.');
  } catch (error) {
    console.log(
      `[uñas] No se pudo invalidar la caché: ${(error as Error).message}`,
    );
  } finally {
    redis.disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
