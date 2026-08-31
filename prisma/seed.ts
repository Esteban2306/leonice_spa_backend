import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { ARGON2_OPTIONS } from '../src/auth/constants/auth.constants';

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await argon2.hash(
    process.env.SEED_ADMIN_PASSWORD!,
    ARGON2_OPTIONS,
  );

  await prisma.user.upsert({
    where: { email: 'spacapilarleonicearenas@gmail.com' },
    update: {},
    create: {
      email: 'spacapilarleonicearenas@gmail.com',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
    },
  });

  const spaCapilar = await prisma.category.upsert({
    where: { name: 'Spa Capilar' },
    update: {},
    create: { name: 'Spa Capilar', isPrincipal: true },
  });

  const spaCoreano = await prisma.category.upsert({
    where: { name: 'Spa Coreano' },
    update: {},
    create: { name: 'Spa Coreano' },
  });

  const unas = await prisma.category.upsert({
    where: { name: 'Uñas' },
    update: {},
    create: { name: 'Uñas' },
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

  await prisma.capacityPool.upsert({
    where: {
      categoryId_name: { categoryId: unas.id, name: 'Estación de uñas' },
    },
    update: {},
    create: { categoryId: unas.id, name: 'Estación de uñas', maxConcurrent: 1 },
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
      create: { categoryId: spaCapilar.id, ...t },
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
      requiresPriorAssessment: false,
      basePriceMin: 280,
      basePriceMax: 280,
      baseDurationMinMinutes: 180,
      baseDurationMaxMinutes: 180,
    },
  });

  const unasTreatments = [
    { name: 'Pedespa', baseDurationMinMinutes: 60, baseDurationMaxMinutes: 60 },
    {
      name: 'Permanente',
      baseDurationMinMinutes: 90,
      baseDurationMaxMinutes: 90,
    },
    {
      name: 'Tradicional',
      baseDurationMinMinutes: 60,
      baseDurationMaxMinutes: 60,
    },
  ];

  for (const t of unasTreatments) {
    await prisma.treatment.upsert({
      where: { categoryId_name: { categoryId: unas.id, name: t.name } },
      update: {},
      create: {
        categoryId: unas.id,
        name: t.name,
        requiresPriorAssessment: false,
        basePriceMin: null,
        basePriceMax: null,
        baseDurationMinMinutes: t.baseDurationMinMinutes,
        baseDurationMaxMinutes: t.baseDurationMaxMinutes,
      },
    });
  }

  console.log(
    'Seed completado: 3 categorías, 3 capacity pools, 15 tratamientos.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
