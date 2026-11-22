import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { CATALOG_CACHE_KEYS } from '../src/catalog/constants/catalog-cache.constants';
import {
  HAIR_SERVICES,
  HAIR_SERVICES_CATEGORY_SLUG,
  HairService,
} from './seed-data/hair-services';

const APPLY_FLAG = '--apply';

export interface HairServicesOutcome {
  created: string[];
  existing: string[];
}

export async function addHairServices(
  prisma: PrismaClient,
  options: {
    apply: boolean;
    categorySlug?: string;
    services?: HairService[];
    log?: (line: string) => void;
  },
): Promise<HairServicesOutcome> {
  const log = options.log ?? console.log;
  const categorySlug = options.categorySlug ?? HAIR_SERVICES_CATEGORY_SLUG;
  const services = options.services ?? HAIR_SERVICES;
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
  });
  if (!category) {
    throw new Error(`[servicios] No existe la categoría ${categorySlug}.`);
  }

  const outcome: HairServicesOutcome = { created: [], existing: [] };
  for (const service of services) {
    const found = await prisma.treatment.findFirst({
      where: {
        categoryId: category.id,
        OR: [{ slug: service.slug }, { name: service.name }],
      },
      select: { id: true },
    });
    if (found) {
      outcome.existing.push(service.name);
      log(`[servicios] ${service.name}: ya existe, no se toca.`);
      continue;
    }
    outcome.created.push(service.name);
    if (!options.apply) {
      log(`[servicios] ${service.name}: se crearía.`);
      continue;
    }
    const { steps, ...fields } = service;
    await prisma.treatment.create({
      data: {
        ...fields,
        categoryId: category.id,
        steps: {
          create: steps.map((step, index) => ({
            position: index + 1,
            title: step.title,
            description: step.description,
          })),
        },
      },
    });
    log(`[servicios] ${service.name}: creado.`);
  }

  if (!options.apply && outcome.created.length > 0) {
    log(
      `[servicios] Simulación: ejecuta de nuevo con ${APPLY_FLAG} para crearlos.`,
    );
  }
  return outcome;
}

async function invalidateCache() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log(
      '[servicios] REDIS_URL no definida: la caché del catálogo expira sola en 5 minutos.',
    );
    return;
  }
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.del(CATALOG_CACHE_KEYS.showcase, CATALOG_CACHE_KEYS.treatments);
    console.log('[servicios] Caché del catálogo invalidada.');
  } catch (error) {
    console.log(
      `[servicios] No se pudo invalidar la caché: ${(error as Error).message}`,
    );
  } finally {
    redis.disconnect();
  }
}

async function main() {
  const apply = process.argv.includes(APPLY_FLAG);
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const target = new URL(process.env.DATABASE_URL ?? '');
    console.log(
      `[servicios] Base de datos: ${target.hostname}:${target.port}${target.pathname}`,
    );
    const outcome = await addHairServices(prisma, { apply });
    if (apply && outcome.created.length > 0) await invalidateCache();
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
