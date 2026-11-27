import { TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { AdminScheduleService } from 'src/admin/schedule/admin-schedule.service';
import { ReservationsService } from 'src/reservations/reservations.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { ReservationRescheduler } from 'src/reservations/service/reservation-rescheduler.service';
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

const hhmm = (d: Date) =>
  `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('Reglas de tiempo al agendar', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let world: World;
  let schedule: AdminScheduleService;
  let reservations: ReservationsService;
  let create: CreateReservationOrchestrator;
  let rescheduler: ReservationRescheduler;

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
    rescheduler = moduleRef.get(ReservationRescheduler);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  describe('agendar para hoy', () => {
    const today = getCalendarDayKey(new Date());
    const quarter = 15 * 60_000;
    const soon = new Date(
      Math.ceil((Date.now() + 45 * 60_000) / quarter) * quarter,
    );
    const lastStart = new Date();
    lastStart.setHours(22, 45, 0, 0);
    const fitsToday = soon.getTime() <= lastStart.getTime();

    beforeAll(async () => {
      if (!fitsToday) return;
      await schedule.setOverride(
        {
          from: today,
          to: today,
          windows: [{ startTime: '00:00', endTime: '23:45' }],
        },
        world.admin.id,
      );
    });

    it('si hay cupo hoy se puede agendar para dentro de un rato', async () => {
      if (!fitsToday) return;
      const { reservations: created } = await create.execute({
        client: newClientDto('hoy'),
        treatments: [world.secondary.treatmentId],
        scheduledStart: soon.toISOString(),
      });
      expect(created[0].scheduledStart.getTime()).toBe(soon.getTime());
    });

    it('los horarios de hoy que ya pasaron o son en menos de 30 minutos no se ofrecen', async () => {
      if (!fitsToday) return;
      const limit = Date.now() + 30 * 60_000;
      const slots = await reservations.getAvailability(
        world.tertiary.treatmentId,
        today,
      );
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((s) => new Date(s.iso).getTime() >= limit)).toBe(true);

      const calendar = await reservations.getAvailabilityCalendar({
        treatmentIds: [world.tertiary.treatmentId],
        from: today,
        to: today,
      });
      expect(calendar.days[0].available).toBe(true);
      expect(
        calendar.days[0].slots.every((s) => new Date(s.iso).getTime() >= limit),
      ).toBe(true);
    });

    it('no se puede agendar para dentro de menos de 30 minutos', async () => {
      await expect(
        create.execute({
          client: newClientDto('ya'),
          treatments: [world.tertiary.treatmentId],
          scheduledStart: new Date(Date.now() + 10 * 60_000).toISOString(),
        }),
      ).rejects.toThrow('30 minutos');
    });
  });

  describe('combos: los servicios se hacen al mismo tiempo', () => {
    const day = futureSlot(5, 0);
    const dayKey = getCalendarDayKey(day);
    const at = (hour: number, minute = 0) => {
      const d = new Date(day);
      d.setHours(hour, minute, 0, 0);
      return d;
    };

    it('todos los servicios del combo empiezan a la misma hora', async () => {
      const { reservations: created, summary } = await create.execute({
        client: newClientDto('combo'),
        treatments: [
          world.principal.simpleTreatmentId,
          world.tertiary.treatmentId,
        ],
        scheduledStart: at(10).toISOString(),
      });
      expect(created.map((r) => hhmm(r.scheduledStart))).toEqual([
        '10:00',
        '10:00',
      ]);
      expect(
        created
          .map((r) => hhmm(r.scheduledEnd))
          .sort((a, b) => a.localeCompare(b)),
      ).toEqual(['10:30', '11:00']);
      expect(summary).toContain('al mismo tiempo');
    });

    it('el combo cabe al final del día si cabe el servicio más largo, sin sumar duraciones', async () => {
      const calendar = await reservations.getAvailabilityCalendar({
        treatmentIds: [
          world.principal.simpleTreatmentId,
          world.secondary.treatmentId,
        ],
        from: dayKey,
        to: dayKey,
      });
      const times = calendar.days[0].slots.map((s) => hhmm(new Date(s.iso)));
      expect(times).toContain('17:00');
      expect(times).not.toContain('17:15');
    });

    it('si un servicio del combo no tiene cupo a esa hora, no se ofrece y no se agenda partido', async () => {
      await create.execute({
        client: newClientDto('ocupa'),
        treatments: [world.lowCap.treatmentId],
        scheduledStart: at(14).toISOString(),
      });

      const calendar = await reservations.getAvailabilityCalendar({
        treatmentIds: [
          world.principal.simpleTreatmentId,
          world.lowCap.treatmentId,
        ],
        from: dayKey,
        to: dayKey,
      });
      const times = calendar.days[0].slots.map((s) => hhmm(new Date(s.iso)));
      expect(times).not.toContain('14:00');
      expect(times).not.toContain('13:15');
      expect(times).toContain('15:00');

      const client = newClientDto('partido');
      await expectAppCode(
        create.execute({
          client,
          treatments: [
            world.principal.simpleTreatmentId,
            world.lowCap.treatmentId,
          ],
          scheduledStart: at(14).toISOString(),
        }),
        'PLACEMENT_NO_SLOT_THAT_DAY',
      );
      expect(
        await prisma.client.reservation.count({
          where: { client: { phone: client.phone } },
        }),
      ).toBe(0);
    });

    it('un servicio del combo se puede mover sin chocar con su propio combo', async () => {
      const { reservations: created } = await create.execute({
        client: newClientDto('mover'),
        treatments: [
          world.principal.simpleTreatmentId,
          world.tertiary.treatmentId,
        ],
        scheduledStart: at(11).toISOString(),
      });
      const short = created.find(
        (r) => r.treatmentId === world.tertiary.treatmentId,
      )!;
      const { reservation } = await rescheduler.execute(short.id, at(11, 30));
      expect(hhmm(reservation.scheduledStart)).toBe('11:30');
    });

    it('un combo puede cruzarse con otra cita de la misma clienta', async () => {
      const client = newClientDto('otra-cita');
      await create.execute({
        client,
        treatments: [world.secondary.treatmentId],
        scheduledStart: at(8).toISOString(),
      });
      const { reservations: created } = await create.execute({
        client,
        treatments: [
          world.principal.simpleTreatmentId,
          world.tertiary.treatmentId,
        ],
        scheduledStart: at(8, 30).toISOString(),
      });
      expect(created.map((r) => hhmm(r.scheduledStart))).toEqual([
        '8:30',
        '8:30',
      ]);
    });
  });

  describe('el cupo se respeta durante toda la cita', () => {
    const day = futureSlot(7, 0);
    const at = (hour: number, minute = 0) => {
      const d = new Date(day);
      d.setHours(hour, minute, 0, 0);
      return d;
    };

    it('con el cupo lleno a las 9:00, quien pide 9:15 queda después de que termine la cita', async () => {
      await create.execute({
        client: newClientDto('primera'),
        treatments: [world.lowCap.treatmentId],
        scheduledStart: at(9).toISOString(),
      });
      const { reservations: created } = await create.execute({
        client: newClientDto('segunda'),
        treatments: [world.lowCap.treatmentId],
        scheduledStart: at(9, 15).toISOString(),
      });
      expect(created[0].scheduledStart.getTime()).toBeGreaterThanOrEqual(
        at(10).getTime(),
      );

      const slots = await reservations.getAvailability(
        world.lowCap.treatmentId,
        getCalendarDayKey(day),
      );
      const times = slots.map((s) => hhmm(new Date(s.iso)));
      for (const blocked of ['8:15', '9:00', '9:15', '9:45']) {
        expect(times).not.toContain(blocked);
      }
    });
  });
});
