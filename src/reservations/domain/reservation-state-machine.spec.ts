import { ReservationStatus } from '@prisma/client';
import { InvalidTransitionException } from '../../common/exceptions/invalid-transition.exception';
import { ReservationStateMachine } from './reservation-state-machine';

const S = ReservationStatus;
const ALL = Object.values(S);

const ALLOWED: Record<ReservationStatus, ReservationStatus[]> = {
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

describe('ReservationStateMachine', () => {
  const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

  it.each(pairs)('%s → %s', (from, to) => {
    const allowed = ALLOWED[from].includes(to);
    expect(ReservationStateMachine.canTransition(from, to)).toBe(allowed);
    if (allowed) {
      expect(() =>
        ReservationStateMachine.assertTransition(from, to),
      ).not.toThrow();
    } else {
      expect(() => ReservationStateMachine.assertTransition(from, to)).toThrow(
        InvalidTransitionException,
      );
    }
  });

  it('ningún estado puede pasar a sí mismo', () => {
    for (const status of ALL) {
      expect(ReservationStateMachine.canTransition(status, status)).toBe(false);
    }
  });

  it('el mensaje de error nombra el estado de origen y el de destino', () => {
    expect(() =>
      ReservationStateMachine.assertTransition(S.COMPLETADA, S.CONFIRMADA),
    ).toThrow(/COMPLETADA.*CONFIRMADA/);
  });

  it('los estados terminales son los que no tienen salida', () => {
    const terminal = ALL.filter((s) => ReservationStateMachine.isTerminal(s));
    expect(terminal.sort()).toEqual(
      [S.CANCELADA, S.COMPLETADA, S.REPROGRAMADA].sort(),
    );
  });

  it('desde cualquier estado inicial se llega a un estado terminal sin ciclos infinitos', () => {
    const reachesTerminal = (start: ReservationStatus) => {
      const seen = new Set<ReservationStatus>();
      const stack = [start];
      while (stack.length > 0) {
        const current = stack.pop() as ReservationStatus;
        if (ReservationStateMachine.isTerminal(current)) return true;
        if (seen.has(current)) continue;
        seen.add(current);
        stack.push(...ALLOWED[current]);
      }
      return false;
    };
    for (const status of ALL) expect(reachesTerminal(status)).toBe(true);
  });

  it('una cita nunca se completa sin haber estado en curso, ni se confirma sin pasar por el depósito', () => {
    const into = (target: ReservationStatus) =>
      ALL.filter((from) => ReservationStateMachine.canTransition(from, target));
    expect(into(S.COMPLETADA)).toEqual([S.CITA_EN_CURSO]);
    expect(into(S.CONFIRMADA)).toEqual([S.PENDIENTE_DEPOSITO]);
  });
});
