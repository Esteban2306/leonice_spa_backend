import { TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { AdminScheduleService } from 'src/admin/schedule/admin-schedule.service';
import { ReservationsService } from 'src/reservations/reservations.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { getCalendarDayKey } from 'src/reservations/domain/calendar-day-key';
import {
  createHarnessModuleWith,
  expectAppCode,
  futureSlot,
  newClientDto,
  resetDatabase,
  seedWorld,
  World,
} from './harness';

describe('Horario especial de una fecha (horarios de diciembre)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;
  let schedule: AdminScheduleService;
  let reservations: ReservationsService;
  let create: CreateReservationOrchestrator;

  const day = futureSlot(6, 0);
  const dayKey = getCalendarDayKey(day);
  const at = (hour: number, minute = 0) => {
    const d = new Date(day);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  beforeAll(async () => {
    moduleRef = await createHarnessModuleWith({
      providers: [AdminScheduleService],
    });
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    schedule = moduleRef.get(AdminScheduleService);
    reservations = moduleRef.get(ReservationsService);
    create = moduleRef.get(CreateReservationOrchestrator);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('con horas de inicio fijas solo se ofrecen esas horas, aunque abra más temprano', async () => {
    await schedule.setOverride(
      {
        from: dayKey,
        to: dayKey,
        windows: [{ startTime: '07:00', endTime: '19:00' }],
        startTimes: ['07:00', '10:00', '14:00'],
        reason: 'Horarios de diciembre',
      },
      world.admin.id,
    );

    const slots = await reservations.getAvailability(
      world.secondary.treatmentId,
      dayKey,
    );
    expect(slots.map((s) => new Date(s.iso).getHours())).toEqual([7, 10, 14]);

    const day = await schedule.getDay(dayKey);
    expect(day.override).toMatchObject({
      startTimes: ['07:00', '10:00', '14:00'],
      windows: [{ startTime: '07:00', endTime: '19:00' }],
    });
  });

  it('una reserva pedida a otra hora se mueve a la hora permitida más cercana', async () => {
    const { reservations: created } = await create.execute({
      client: newClientDto('diciembre'),
      treatments: [world.secondary.treatmentId],
      scheduledStart: at(9, 30).toISOString(),
    });
    expect(created[0].scheduledStart.getHours()).toBe(10);
    expect(created[0].scheduledStart.getMinutes()).toBe(0);
  });

  it('en un combo todos los servicios empiezan a la hora fija, al mismo tiempo', async () => {
    const { reservations: created } = await create.execute({
      client: newClientDto('combo'),
      treatments: [
        world.principal.simpleTreatmentId,
        world.tertiary.treatmentId,
      ],
      scheduledStart: at(14).toISOString(),
    });
    const starts = created
      .map((r) => r.scheduledStart)
      .sort((a, b) => a.getTime() - b.getTime())
      .map((d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
    expect(starts).toEqual(['14:00', '14:00']);
  });

  it('no deja cerrar una fecha que ya tiene reservas dentro', async () => {
    await expectAppCode(
      schedule.setOverride(
        { from: dayKey, to: dayKey, windows: [], startTimes: [] },
        world.admin.id,
      ),
      'SCHEDULE_CHANGE_HAS_RESERVATIONS',
    );
  });

  it('quitar el horario especial devuelve el horario semanal', async () => {
    const other = getCalendarDayKey(futureSlot(8, 0));
    await schedule.setOverride(
      {
        from: other,
        to: other,
        windows: [{ startTime: '09:00', endTime: '12:00' }],
      },
      world.admin.id,
    );
    expect(
      (await reservations.getAvailability(world.secondary.treatmentId, other))
        .length,
    ).toBe(9);

    await schedule.deleteOverride(other);
    const weekly = await reservations.getAvailability(
      world.secondary.treatmentId,
      other,
    );
    expect(new Date(weekly[0].iso).getHours()).toBe(8);
    expect(weekly.length).toBeGreaterThan(9);
  });

  it('se puede aplicar a varias fechas de una vez', async () => {
    const from = getCalendarDayKey(futureSlot(20, 0));
    const to = getCalendarDayKey(futureSlot(22, 0));
    const result = await schedule.setOverride(
      {
        from,
        to,
        windows: [{ startTime: '07:00', endTime: '18:00' }],
        startTimes: ['07:00', '10:00', '14:00'],
      },
      world.admin.id,
    );
    expect(result.overrides.map((o) => o.date)).toEqual([
      from,
      getCalendarDayKey(futureSlot(21, 0)),
      to,
    ]);
  });
});
