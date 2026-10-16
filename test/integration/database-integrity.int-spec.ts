import { TestingModule } from '@nestjs/testing';
import { DepositStatus, ReservationStatus } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import {
  createHarnessModule,
  futureSlot,
  newClientDto,
  resetDatabase,
  seedWorld,
  World,
} from './harness';

describe('Integridad a nivel de base de datos (CHECK, únicos parciales y FK)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;
  let reservationId: string;
  let clientId: string;

  beforeAll(async () => {
    moduleRef = await createHarnessModule();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    const created = await moduleRef.get(CreateReservationOrchestrator).execute({
      client: newClientDto('integridad'),
      treatments: [world.secondary.treatmentId],
      scheduledStart: futureSlot(5, 10).toISOString(),
    });
    reservationId = created.reservations[0].id;
    clientId = created.reservations[0].clientId;
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const rejects = async (action: Promise<unknown>, constraint: string) => {
    const error: unknown = await action.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).not.toBeNull();
    expect(String((error as Error).message)).toContain(constraint);
  };

  const baseReservation = (overrides: Record<string, unknown> = {}) => ({
    clientId,
    categoryId: world.secondary.categoryId,
    treatmentId: world.secondary.treatmentId,
    status: ReservationStatus.CONFIRMADA,
    channel: 'WEB' as const,
    scheduledStart: futureSlot(9, 10),
    scheduledEnd: futureSlot(9, 11),
    finalPrice: 100,
    finalDurationMinutes: 60,
    ...overrides,
  });

  describe('reservas', () => {
    it('rechaza una reserva que termina antes o al mismo tiempo que empieza', async () => {
      await rejects(
        prisma.client.reservation.create({
          data: baseReservation({ scheduledEnd: futureSlot(9, 9) }),
        }),
        'reservations_time_range_chk',
      );
      await rejects(
        prisma.client.reservation.create({
          data: baseReservation({ scheduledEnd: futureSlot(9, 10) }),
        }),
        'reservations_time_range_chk',
      );
    });

    it('rechaza precios y duraciones negativos o cero', async () => {
      await rejects(
        prisma.client.reservation.create({
          data: baseReservation({ finalPrice: -1 }),
        }),
        'reservations_final_price_chk',
      );
      await rejects(
        prisma.client.reservation.create({
          data: baseReservation({ finalDurationMinutes: 0 }),
        }),
        'reservations_final_duration_chk',
      );
    });

    it('permite precio cero (cortesía) y una reserva válida', async () => {
      const row = await prisma.client.reservation.create({
        data: baseReservation({
          finalPrice: 0,
          scheduledStart: futureSlot(11, 10),
          scheduledEnd: futureSlot(11, 11),
        }),
      });
      expect(row.id).toBeDefined();
    });
  });

  describe('depósitos', () => {
    const deposit = (status: DepositStatus, amount?: number) =>
      prisma.client.depositRecord.create({
        data: { reservationId, status, method: 'MANUAL', amount },
      });

    it('rechaza montos negativos o cero y acepta montos positivos o sin monto', async () => {
      await rejects(
        deposit(DepositStatus.CONFIRMADO, -5),
        'deposit_records_amount_chk',
      );
      await rejects(
        deposit(DepositStatus.CONFIRMADO, 0),
        'deposit_records_amount_chk',
      );
      expect((await deposit(DepositStatus.CONFIRMADO, 25)).id).toBeDefined();
      expect((await deposit(DepositStatus.RECHAZADO)).id).toBeDefined();
    });

    it('solo permite un comprobante PENDIENTE por reserva, aunque haya varios históricos', async () => {
      const other = await moduleRef.get(CreateReservationOrchestrator).execute({
        client: newClientDto('pendiente'),
        treatments: [world.tertiary.treatmentId],
        scheduledStart: futureSlot(12, 10).toISOString(),
      });
      const id = other.reservations[0].id;
      const pending = () =>
        prisma.client.depositRecord.create({
          data: { reservationId: id, status: 'PENDIENTE', method: 'MANUAL' },
        });
      await pending();
      await rejects(
        pending(),
        'Unique constraint failed on the fields: (`reservation_id`)',
      );

      await prisma.client.depositRecord.updateMany({
        where: { reservationId: id, status: 'PENDIENTE' },
        data: { status: 'RECHAZADO' },
      });
      expect((await pending()).id).toBeDefined();
    });
  });

  describe('catálogo, horario y configuración', () => {
    it('rechaza capacidades menores a 1', async () => {
      await rejects(
        prisma.client.capacityPool.create({
          data: {
            categoryId: world.secondary.categoryId,
            name: 'Inválido',
            maxConcurrent: 0,
          },
        }),
        'capacity_pools_max_concurrent_chk',
      );
    });

    it('rechaza ventanas de atención con rango inválido o día fuera de 0–6', async () => {
      await rejects(
        prisma.client.operatingWindow.create({
          data: { dayOfWeek: 1, startMinute: 1200, endMinute: 480 },
        }),
        'operating_windows_range_chk',
      );
      await rejects(
        prisma.client.operatingWindow.create({
          data: { dayOfWeek: 9, startMinute: 60, endMinute: 120 },
        }),
        'operating_windows_day_chk',
      );
      await rejects(
        prisma.client.operatingWindow.create({
          data: { dayOfWeek: 1, startMinute: 60, endMinute: 1500 },
        }),
        'operating_windows_range_chk',
      );
    });

    it('rechaza excepciones de horario con minutos a medias o invertidos', async () => {
      const date = new Date('2031-05-05T00:00:00.000Z');
      await rejects(
        prisma.client.scheduleException.create({
          data: { date, type: 'BLOCK', startMinute: 600, endMinute: null },
        }),
        'schedule_exceptions_range_chk',
      );
      await rejects(
        prisma.client.scheduleException.create({
          data: { date, type: 'BLOCK', startMinute: 700, endMinute: 600 },
        }),
        'schedule_exceptions_range_chk',
      );
      expect(
        (
          await prisma.client.scheduleException.create({
            data: { date, type: 'BLOCK' },
          })
        ).id,
      ).toBeDefined();
    });

    it('rechaza tratamientos con precios o duraciones incoherentes', async () => {
      const base = {
        categoryId: world.secondary.categoryId,
        name: 'Inválido',
        slug: 'invalido',
      };
      await rejects(
        prisma.client.treatment.create({
          data: { ...base, basePriceMin: 100, basePriceMax: 50 },
        }),
        'treatments_price_chk',
      );
      await rejects(
        prisma.client.treatment.create({
          data: { ...base, basePriceMin: -1, basePriceMax: 50 },
        }),
        'treatments_price_chk',
      );
      await rejects(
        prisma.client.treatment.create({
          data: {
            ...base,
            baseDurationMinMinutes: 90,
            baseDurationMaxMinutes: 60,
          },
        }),
        'treatments_duration_chk',
      );
    });

    it('rechaza promociones con descuento fuera de (0,100] o periodo invertido', async () => {
      const now = new Date();
      await rejects(
        prisma.client.promotion.create({
          data: {
            name: 'X',
            discountPercentage: 150,
            startsAt: now,
            endsAt: new Date(now.getTime() + 1000),
          },
        }),
        'promotions_discount_chk',
      );
      await rejects(
        prisma.client.promotion.create({
          data: {
            name: 'X',
            discountPercentage: 10,
            startsAt: now,
            endsAt: new Date(now.getTime() - 1000),
          },
        }),
        'promotions_period_chk',
      );
    });

    it('rechaza precios de producto negativos y saldo de crédito negativo', async () => {
      const category = await prisma.client.productCategory.create({
        data: { name: `C ${Date.now()}`, slug: `c-${Date.now()}` },
      });
      const product = await prisma.client.product.create({
        data: {
          name: 'P',
          slug: `p-${Date.now()}`,
          productCategoryId: category.id,
        },
      });
      await rejects(
        prisma.client.productVariant.create({
          data: {
            productId: product.id,
            brand: 'M',
            presentation: '1',
            price: -1,
          },
        }),
        'product_variants_price_chk',
      );
      await rejects(
        prisma.client.client.update({
          where: { id: clientId },
          data: { creditBalance: -10 },
        }),
        'clients_credit_balance_chk',
      );
    });
  });

  describe('claves foráneas del historial', () => {
    it('no permite borrar un cliente, tratamiento o categoría con reservas', async () => {
      await rejects(
        prisma.client.client.delete({ where: { id: clientId } }),
        'violates RESTRICT setting of foreign key constraint',
      );
      await rejects(
        prisma.client.treatment.delete({
          where: { id: world.secondary.treatmentId },
        }),
        'violates RESTRICT setting of foreign key constraint',
      );
      await rejects(
        prisma.client.category.delete({
          where: { id: world.secondary.categoryId },
        }),
        'violates RESTRICT setting of foreign key constraint',
      );
    });

    it('no permite borrar una reserva con depósitos', async () => {
      await rejects(
        prisma.client.reservation.delete({ where: { id: reservationId } }),
        'violates RESTRICT setting of foreign key constraint',
      );
    });
  });
});
