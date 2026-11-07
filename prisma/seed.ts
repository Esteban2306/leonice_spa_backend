import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { ARGON2_OPTIONS } from '../src/auth/constants/auth.constants';
import { DEFAULT_WEEKLY_WINDOWS } from '../src/reservations/domain/operating-hours';
import { seedConduitTemplates } from './seed-conduit-templates';
import { seedConduitTools } from './seed-conduit-tools';
import { seedConduitPrompt } from './seed-conduit-prompt';
import { seedConduitIntents } from './seed-conduit-intents';
import { slugify } from '../src/catalog/common/slugify';

const prisma = new PrismaClient();

const DEFAULT_ADMIN_EMAIL = 'spacapilarleonicearenas@gmail.com';
const MIN_PASSWORD_LENGTH = 8;

function resolveAdminCredentials() {
  const email = process.env.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      'SEED_ADMIN_PASSWORD es obligatoria para crear el administrador',
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_ADMIN_PASSWORD debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    );
  }
  return { email, password };
}

async function main() {
  const admin = resolveAdminCredentials();
  const adminPasswordHash = await argon2.hash(admin.password, ARGON2_OPTIONS);

  await prisma.user.upsert({
    where: { email: admin.email },
    update: {},
    create: {
      email: admin.email,
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
    },
  });

  for (const window of DEFAULT_WEEKLY_WINDOWS) {
    await prisma.operatingWindow.upsert({
      where: {
        dayOfWeek_startMinute: {
          dayOfWeek: window.dayOfWeek,
          startMinute: window.startMinute,
        },
      },
      update: {},
      create: window,
    });
  }

  const spaCapilar = await prisma.category.upsert({
    where: { name: 'Spa Capilar' },
    update: { tracksHairProfile: true },
    create: {
      name: 'Spa Capilar',
      slug: slugify('Spa Capilar'),
      isPrincipal: true,
      tracksHairProfile: true,
    },
  });

  const spaCoreano = await prisma.category.upsert({
    where: { name: 'Spa Coreano' },
    update: {},
    create: { name: 'Spa Coreano', slug: slugify('Spa Coreano') },
  });

  await prisma.capacityPool.upsert({
    where: {
      categoryId_name: {
        categoryId: spaCapilar.id,
        name: 'Sillas principales',
      },
    },
    update: {},
    create: {
      categoryId: spaCapilar.id,
      name: 'Sillas principales',
      maxConcurrent: 6,
    },
  });

  await prisma.capacityPool.upsert({
    where: {
      categoryId_name: { categoryId: spaCoreano.id, name: 'Sala spa coreano' },
    },
    update: {},
    create: {
      categoryId: spaCoreano.id,
      name: 'Sala spa coreano',
      maxConcurrent: 1,
    },
  });

  const spaCapilarTreatments = [
    {
      name: 'Alisado',
      requiresPriorAssessment: true,
      basePriceMin: 250,
      basePriceMax: 380,
      baseDurationMinMinutes: 180,
      baseDurationMaxMinutes: 240,
    },
    {
      name: 'Postalisado',
      requiresPriorAssessment: false,
      basePriceMin: 200,
      basePriceMax: 200,
      baseDurationMinMinutes: 150,
      baseDurationMaxMinutes: 150,
    },
    {
      name: 'Terapia de reparación',
      requiresPriorAssessment: true,
      basePriceMin: 300,
      basePriceMax: 350,
      baseDurationMinMinutes: 180,
      baseDurationMaxMinutes: 180,
    },
    {
      name: 'Terapia de hidratación',
      requiresPriorAssessment: false,
      basePriceMin: 200,
      basePriceMax: 200,
      baseDurationMinMinutes: 120,
      baseDurationMaxMinutes: 120,
    },
    {
      name: 'Terapia de rehabilitación',
      requiresPriorAssessment: false,
      basePriceMin: 300,
      basePriceMax: 300,
      baseDurationMinMinutes: 180,
      baseDurationMaxMinutes: 180,
    },
    {
      name: 'Terapia de nutrición',
      requiresPriorAssessment: false,
      basePriceMin: 200,
      basePriceMax: 200,
      baseDurationMinMinutes: 120,
      baseDurationMaxMinutes: 120,
    },
    {
      name: 'Terapia de control',
      requiresPriorAssessment: false,
      basePriceMin: 200,
      basePriceMax: 200,
      baseDurationMinMinutes: 120,
      baseDurationMaxMinutes: 120,
    },
    {
      name: 'Terapia antiácida',
      requiresPriorAssessment: false,
      basePriceMin: 250,
      basePriceMax: 250,
      baseDurationMinMinutes: 150,
      baseDurationMaxMinutes: 150,
    },
    {
      name: 'Termopurificación',
      requiresPriorAssessment: false,
      basePriceMin: 300,
      basePriceMax: 300,
      baseDurationMinMinutes: 120,
      baseDurationMaxMinutes: 120,
    },
    {
      name: 'Terapia kiss',
      requiresPriorAssessment: true,
      basePriceMin: 250,
      basePriceMax: 280,
      baseDurationMinMinutes: 150,
      baseDurationMaxMinutes: 150,
    },
    {
      name: 'Terapia baño de color',
      requiresPriorAssessment: false,
      basePriceMin: 200,
      basePriceMax: 200,
      baseDurationMinMinutes: 120,
      baseDurationMaxMinutes: 120,
    },
  ];

  for (const t of spaCapilarTreatments) {
    await prisma.treatment.upsert({
      where: { categoryId_name: { categoryId: spaCapilar.id, name: t.name } },
      update: {},
      create: { categoryId: spaCapilar.id, slug: slugify(t.name), ...t },
    });
  }

  await prisma.treatment.upsert({
    where: {
      categoryId_name: { categoryId: spaCoreano.id, name: 'Spa coreano' },
    },
    update: {},
    create: {
      categoryId: spaCoreano.id,
      name: 'Spa coreano',
      slug: slugify('Spa coreano'),
      requiresPriorAssessment: false,
      basePriceMin: 280,
      basePriceMax: 280,
      baseDurationMinMinutes: 180,
      baseDurationMaxMinutes: 180,
    },
  });

  console.log(
    'Seed completado: 2 categorías, 2 capacity pools, 12 tratamientos.',
  );

  try {
    await seedConduitTemplates();
  } catch (error) {
    console.warn(
      `[conduit] No se pudieron sembrar las plantillas: ${(error as Error).message}`,
    );
  }

  try {
    await seedConduitTools();
  } catch (error) {
    console.warn(
      `[conduit] No se pudieron sembrar las herramientas: ${(error as Error).message}`,
    );
  }

  try {
    await seedConduitPrompt();
  } catch (error) {
    console.warn(
      `[conduit] No se pudo sembrar el prompt: ${(error as Error).message}`,
    );
  }

  try {
    await seedConduitIntents();
  } catch (error) {
    console.warn(
      `[conduit] No se pudieron sembrar las intenciones: ${(error as Error).message}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
