import { TestingModule } from '@nestjs/testing';
import { CancellationSource, ReservationStatus as S } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { ReservationStateMachine } from 'src/reservations/domain/reservation-state-machine';
import { CLIENT_CANCELLABLE_STATUSES } from 'src/reservations/domain/client-cancellation';
import { RESCHEDULABLE_STATUSES } from 'src/reservations/service/reservation-rescheduler.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { AdminCancelReservationOrchestrator } from 'src/reservations/orchestrators/admin-cancel-reservation.orchestrator';
import { ConfirmDepositOrchestrator } from 'src/reservations/orchestrators/confirm-deposit.orchestrator';
import { CheckInReservationOrchestrator } from 'src/reservations/orchestrators/check-in-reservation.orchestrator';
import { ReservationSettlementService } from 'src/reservations/service/reservation-settlement.service';
import { CompleteReservationOrchestrator } from 'src/reservations/orchestrators/complete-reservation.orchestrator';
import { MarkNoShowOrchestrator } from 'src/reservations/orchestrators/mark-no-show.orchestrator';
import { ConfirmValoracionOrchestrator } from 'src/reservations/orchestrators/confirm-valoracion.orchestrator';
import { ReviveReservationOrchestrator } from 'src/reservations/orchestrators/revive-reservation.orchestrator';
import { AdminRescheduleReservationOrchestrator } from 'src/reservations/orchestrators/admin-reservartion.orchestator';
import {
  createHarnessModule,
  futureSlot,
  newClientDto,
  resetDatabase,
  seedWorld,
  World,
} from './harness';

const ALL: S[] = [
  S.SOLICITUD_INICIADA,
  S.PENDIENTE_VALORACION,
  S.PENDIENTE_DEPOSITO,
  S.CONFIRMADA,
  S.CITA_EN_CURSO,
  S.COMPLETADA,
  S.CANCELADA,
  S.REPROGRAMADA,
  S.NO_SHOW,
];

const EXPECTED: Record<S, S[]> = {
  SOLICITUD_INICIADA: [
    S.PENDIENTE_VALORACION,
    S.PENDIENTE_DEPOSITO,
    S.CANCELADA,
  ],
  PENDIENTE_VALORACION: [S.PENDIENTE_DEPOSITO, S.CANCELADA, S.REPROGRAMADA],
  PENDIENTE_DEPOSITO: [S.CONFIRMADA, S.CANCELADA, S.REPROGRAMADA],
  CONFIRMADA: [S.CITA_EN_CURSO, S.CANCELADA, S.REPROGRAMADA, S.NO_SHOW],
  CITA_EN_CURSO: [S.COMPLETADA],
  COMPLETADA: [],
  CANCELADA: [],
  REPROGRAMADA: [],
  NO_SHOW: [S.CITA_EN_CURSO],
};

describe('3. Transiciones de estado controladas', () => {
  describe('máquina de estados (matriz completa 9×9)', () => {
    const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

    it.each(pairs)('%s → %s', (from, to) => {
      const allowed = EXPECTED[from].includes(to);
      expect(ReservationStateMachine.canTransition(from, to)).toBe(allowed);
      if (allowed) {
        expect(() =>
          ReservationStateMachine.assertTransition(from, to),
        ).not.toThrow();
      } else {
        expect(() =>
          ReservationStateMachine.assertTransition(from, to),
        ).toThrow();
      }
    });

    it('los estados terminales son exactamente COMPLETADA, CANCELADA y REPROGRAMADA', () => {
      expect(
        ALL.filter((s) => ReservationStateMachine.isTerminal(s)).sort(),
      ).toEqual([S.COMPLETADA, S.CANCELADA, S.REPROGRAMADA].sort());
    });

    it('lo que el cliente puede cancelar y lo que se puede reagendar son subconjuntos coherentes con la máquina', () => {
      for (const status of CLIENT_CANCELLABLE_STATUSES) {
        expect(ReservationStateMachine.canTransition(status, S.CANCELADA)).toBe(
          true,
        );
      }
      for (const status of RESCHEDULABLE_STATUSES) {
        expect(
          ReservationStateMachine.canTransition(status, S.REPROGRAMADA),
        ).toBe(true);
      }
    });
  });

  describe('orquestadores contra la base real (cada operación desde cada estado)', () => {
    let moduleRef: TestingModule;
    let prisma: PrismaService;
    let world: World;
    let create: CreateReservationOrchestrator;
    let counter = 0;
    const nextSlot = (offsetDays = 0) => {
      const n = counter++;
      return futureSlot(
        3 + offsetDays + (n % 40),
        8 + (Math.floor(n / 40) % 9),
      );
    };

    beforeAll(async () => {
      moduleRef = await createHarnessModule();
      prisma = moduleRef.get(PrismaService);
      await resetDatabase(prisma.client);
      world = await seedWorld(prisma.client);
      create = moduleRef.get(CreateReservationOrchestrator);
    });

    afterAll(async () => {
      await moduleRef.close();
    });

    const reservationIn = async (status: S) => {
      const when = nextSlot();
      const { reservations } = await create.execute({
        client: newClientDto('estado'),
        treatments: [world.secondary.treatmentId],
        scheduledStart: when.toISOString(),
      });
      const id = reservations[0].id;
      await prisma.client.reservation.update({
        where: { id },
        data: {
          status,
          ...(status === S.CANCELADA
            ? {
                cancellationSource: CancellationSource.ADMIN,
                cancelledAt: new Date(),
              }
            : {}),
        },
      });
      return { id, when };
    };

    const statusOf = async (id: string) =>
      (await prisma.client.reservation.findUniqueOrThrow({ where: { id } }))
        .status;

    interface Operation {
      name: string;
      target: S;
      run: (id: string, when: Date) => Promise<unknown>;
      idempotentFrom?: S;
    }

    const operations = (): Operation[] => [
      {
        name: 'cancelar (admin)',
        target: S.CANCELADA,
        run: (id) =>
          moduleRef
            .get(AdminCancelReservationOrchestrator)
            .execute(id, 'x', false),
      },
      {
        name: 'confirmar depósito',
        target: S.CONFIRMADA,
        run: (id) => moduleRef.get(ConfirmDepositOrchestrator).execute(id),
      },
      {
        name: 'check-in',
        target: S.CITA_EN_CURSO,
        idempotentFrom: S.CITA_EN_CURSO,
        run: (id, when) =>
          moduleRef
            .get(CheckInReservationOrchestrator)
            .execute(id, new Date(when.getTime() + 60_000)),
      },
      {
        name: 'completar',
        target: S.COMPLETADA,
        idempotentFrom: S.COMPLETADA,
        run: async (id) => {
          const settlement = await moduleRef
            .get(ReservationSettlementService)
            .compute(id);
          return moduleRef.get(CompleteReservationOrchestrator).execute({
            reservationId: id,
            adminUserId: world.admin.id,
            cashAmount: settlement.balanceDue ?? settlement.price,
            transferAmount: 0,
          });
        },
      },
      {
        name: 'marcar no-show',
        target: S.NO_SHOW,
        run: async (id) => {
          const row = await moduleRef.get(MarkNoShowOrchestrator).execute(id);
          if (!row) throw new Error('no aplicado');
        },
      },
    ];

    it.each(ALL)(
      'desde %s solo se ejecutan las operaciones que la máquina permite y nada cambia al fallar',
      async (from) => {
        const violations: string[] = [];
        for (const op of operations()) {
          const { id, when } = await reservationIn(from);
          const allowed =
            ReservationStateMachine.canTransition(from, op.target) ||
            op.idempotentFrom === from;
          const outcome = await op.run(id, when).then(
            () => 'ok',
            () => 'error',
          );
          const after = await statusOf(id);

          if (allowed && outcome !== 'ok')
            violations.push(`${op.name}: debía permitirse desde ${from}`);
          if (!allowed && outcome === 'ok')
            violations.push(`${op.name}: se permitió desde ${from}`);
          if (!allowed && after !== from)
            violations.push(
              `${op.name}: cambió ${from} → ${after} pese a fallar`,
            );
          if (
            allowed &&
            outcome === 'ok' &&
            op.idempotentFrom !== from &&
            after !== op.target
          ) {
            violations.push(
              `${op.name}: terminó en ${after}, esperado ${op.target}`,
            );
          }
        }
        expect(violations).toEqual([]);
      },
    );

    it.each(ALL)(
      'reprogramar desde %s solo se permite en PENDIENTE_DEPOSITO y CONFIRMADA',
      async (from) => {
        const { id } = await reservationIn(from);
        const outcome = await moduleRef
          .get(AdminRescheduleReservationOrchestrator)
          .execute(id, nextSlot(40), false)
          .then(
            () => 'ok',
            () => 'error',
          );
        expect(outcome === 'ok').toBe(RESCHEDULABLE_STATUSES.includes(from));
        if (outcome !== 'ok') expect(await statusOf(id)).toBe(from);
      },
    );

    it.each(ALL)(
      'confirmar valoración desde %s no cambia el estado salvo que la máquina lo permita',
      async (from) => {
        const { id } = await reservationIn(from);
        const outcome = await moduleRef
          .get(ConfirmValoracionOrchestrator)
          .execute(id, 100000, 60)
          .then(
            () => 'ok',
            () => 'error',
          );
        if (outcome === 'ok') {
          expect(
            ReservationStateMachine.canTransition(from, S.PENDIENTE_DEPOSITO),
          ).toBe(true);
        } else {
          expect(await statusOf(id)).toBe(from);
        }
      },
    );

    describe('revivir (excepción deliberada a la terminalidad de CANCELADA)', () => {
      const revive = (id: string) =>
        moduleRef.get(ReviveReservationOrchestrator).execute(id);

      it('solo revive reservas canceladas por TIMEOUT', async () => {
        const sources: (CancellationSource | null)[] = [
          CancellationSource.ADMIN,
          CancellationSource.CLIENT,
          null,
        ];
        for (const source of sources) {
          const { id } = await reservationIn(S.CANCELADA);
          await prisma.client.reservation.update({
            where: { id },
            data: { cancellationSource: source },
          });
          await expect(revive(id)).rejects.toThrow();
          expect(await statusOf(id)).toBe(S.CANCELADA);
        }
        const { id } = await reservationIn(S.CANCELADA);
        await prisma.client.reservation.update({
          where: { id },
          data: { cancellationSource: CancellationSource.TIMEOUT },
        });
        await revive(id);
        expect(await statusOf(id)).toBe(S.PENDIENTE_DEPOSITO);
      });

      it('no revive estados que no son CANCELADA', async () => {
        for (const from of ALL.filter((s) => s !== S.CANCELADA)) {
          const { id } = await reservationIn(from);
          await expect(revive(id)).rejects.toThrow();
          expect(await statusOf(id)).toBe(from);
        }
      });

      it('revivir no puede ocupar un cupo que otra reserva tomó mientras tanto', async () => {
        const when = nextSlot();
        const lowCap = async () =>
          create.execute({
            client: newClientDto('revivir'),
            treatments: [world.lowCap.treatmentId],
            scheduledStart: when.toISOString(),
          });
        const first = (await lowCap()).reservations[0];
        await prisma.client.reservation.update({
          where: { id: first.id },
          data: {
            status: S.CANCELADA,
            cancellationSource: CancellationSource.TIMEOUT,
          },
        });
        const taker = (await lowCap()).reservations[0];
        expect(taker.scheduledStart.getTime()).toBe(when.getTime());

        await expect(revive(first.id)).rejects.toThrow();
        expect(await statusOf(first.id)).toBe(S.CANCELADA);
      });
    });

    it('dos operaciones contradictorias a la vez (cancelar y confirmar) dejan exactamente un resultado coherente (20 rondas)', async () => {
      const bad: string[] = [];
      for (let i = 0; i < 20; i++) {
        const { id } = await reservationIn(S.PENDIENTE_DEPOSITO);
        const results = await Promise.allSettled([
          moduleRef
            .get(AdminCancelReservationOrchestrator)
            .execute(id, 'x', false),
          moduleRef.get(ConfirmDepositOrchestrator).execute(id),
        ]);
        const final = await statusOf(id);
        const winners = results.filter((r) => r.status === 'fulfilled').length;
        if (winners !== 1)
          bad.push(`ronda ${i}: ${winners} ganadores, estado ${final}`);
        if (final !== S.CANCELADA && final !== S.CONFIRMADA)
          bad.push(`ronda ${i}: estado ${final}`);
      }
      expect(bad).toEqual([]);
    });

    it('confirmar valoración dos veces a la vez no deja el plazo de depósito ni el estado incoherentes', async () => {
      const { id } = await reservationIn(S.PENDIENTE_VALORACION);
      await prisma.client.treatment.update({
        where: { id: world.secondary.treatmentId },
        data: { requiresPriorAssessment: true },
      });
      const results = await Promise.allSettled([
        moduleRef.get(ConfirmValoracionOrchestrator).execute(id, 100000, 60),
        moduleRef.get(ConfirmValoracionOrchestrator).execute(id, 90000, 60),
      ]);
      await prisma.client.treatment.update({
        where: { id: world.secondary.treatmentId },
        data: { requiresPriorAssessment: false },
      });
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
  });
});
