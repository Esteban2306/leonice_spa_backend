import { ClientTagKey, ReservationStatus } from '@prisma/client';
import {
  deriveClientTags,
  TagClientInput,
  TagReservation,
} from './client-tag.rules';

const NOW = new Date('2026-11-10T15:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const daysAhead = (days: number) => daysAgo(-days);

function visit(
  days: number,
  overrides: Partial<TagReservation> = {},
): TagReservation {
  return {
    status: ReservationStatus.COMPLETADA,
    scheduledStart: daysAgo(days),
    completedAt: daysAgo(days),
    categoryName: 'Spa Capilar',
    treatmentName: 'Alisado',
    ...overrides,
  };
}

function client(
  reservations: TagReservation[],
  birthDate = new Date('1990-02-15T00:00:00Z'),
): TagClientInput {
  return { birthDate, reservations };
}

const keys = (input: TagClientInput) =>
  deriveClientTags(input, NOW).map((tag) => tag.key);

describe('deriveClientTags', () => {
  it('una clienta que nunca asistió queda sin visitas y sin etiquetas de recorrido', () => {
    const result = keys(
      client([
        {
          ...visit(3),
          status: ReservationStatus.CANCELADA,
          completedAt: null,
        },
      ]),
    );
    expect(result).toEqual([ClientTagKey.SIN_VISITAS]);
  });

  it('la primera visita reciente la marca como nueva y apta para promoción', () => {
    const result = keys(client([visit(20)]));
    expect(result).toEqual(
      expect.arrayContaining([ClientTagKey.NUEVA, ClientTagKey.APTA_PROMOCION]),
    );
    expect(result).not.toContain(ClientTagKey.SIN_VISITAS);
  });

  it('tres visitas en seis meses la hacen recurrente', () => {
    expect(keys(client([visit(10), visit(70), visit(150)]))).toContain(
      ClientTagKey.RECURRENTE,
    );
    expect(keys(client([visit(10), visit(70), visit(200)]))).not.toContain(
      ClientTagKey.RECURRENTE,
    );
  });

  it('pasa a en pausa tras 90 días y a inactiva tras un año, sin ser apta si lleva más de un año', () => {
    expect(keys(client([visit(120)]))).toEqual(
      expect.arrayContaining([ClientTagKey.EN_PAUSA]),
    );
    const inactive = keys(client([visit(400)]));
    expect(inactive).toContain(ClientTagKey.INACTIVA);
    expect(inactive).not.toContain(ClientTagKey.EN_PAUSA);
    expect(inactive).not.toContain(ClientTagKey.APTA_PROMOCION);
  });

  it('detecta la categoría y el servicio que más repite', () => {
    const tags = deriveClientTags(
      client([
        visit(10, { categoryName: 'Uñas', treatmentName: 'Semipermanente' }),
        visit(40, { categoryName: 'Uñas', treatmentName: 'Semipermanente' }),
        visit(80, { categoryName: 'Spa Capilar', treatmentName: 'Alisado' }),
      ]),
      NOW,
    );
    expect(tags).toContainEqual({
      key: ClientTagKey.FRECUENTA,
      detail: 'Uñas',
    });
    expect(tags).toContainEqual({
      key: ClientTagKey.REPITE_SERVICIO,
      detail: 'Semipermanente',
    });
    expect(
      tags.filter((tag) => tag.key === ClientTagKey.FRECUENTA),
    ).toHaveLength(1);
  });

  it('dos inasistencias en el año la marcan y le quitan la aptitud para promociones', () => {
    const noShow = (days: number): TagReservation => ({
      ...visit(days),
      status: ReservationStatus.NO_SHOW,
      completedAt: null,
    });
    const result = keys(client([visit(30), noShow(50), noShow(100)]));
    expect(result).toContain(ClientTagKey.NO_SHOW_REITERADO);
    expect(result).not.toContain(ClientTagKey.APTA_PROMOCION);
  });

  it('distingue cita confirmada próxima de reserva pendiente', () => {
    const confirmed: TagReservation = {
      ...visit(-5),
      status: ReservationStatus.CONFIRMADA,
      scheduledStart: daysAhead(5),
      completedAt: null,
    };
    const pending: TagReservation = {
      ...confirmed,
      status: ReservationStatus.PENDIENTE_DEPOSITO,
    };
    expect(keys(client([confirmed]))).toContain(ClientTagKey.CON_CITA_PROXIMA);
    expect(keys(client([pending]))).toContain(ClientTagKey.RESERVA_PENDIENTE);
    expect(keys(client([pending]))).not.toContain(
      ClientTagKey.CON_CITA_PROXIMA,
    );
  });

  it('avisa del cumpleaños en los próximos 30 días, también al cruzar el año', () => {
    expect(keys(client([], new Date('1990-11-25T00:00:00Z')))).toContain(
      ClientTagKey.CUMPLE_PRONTO,
    );
    expect(keys(client([], new Date('1990-05-25T00:00:00Z')))).not.toContain(
      ClientTagKey.CUMPLE_PRONTO,
    );
    expect(
      deriveClientTags(
        client([], new Date('1990-01-03T00:00:00Z')),
        new Date('2026-12-20T15:00:00Z'),
      ).map((tag) => tag.key),
    ).toContain(ClientTagKey.CUMPLE_PRONTO);
  });
});
