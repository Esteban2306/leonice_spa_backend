import { BadRequestException } from '@nestjs/common';
import { ConduitBookingToolsController } from './conduit-booking-tools.controller';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const CATALOG = [
  { id: ID_A, name: 'Uñas Acrílicas', slug: 'unas-acrilicas' },
  { id: ID_B, name: 'Terapia de hidratación', slug: 'terapia-hidratacion' },
  { id: 'x3', name: 'Terapia de nutrición', slug: 'terapia-nutricion' },
];

function build() {
  const execute = jest.fn((_dto?: unknown, _opts?: unknown) =>
    Promise.resolve({ id: 'res-1' }),
  );
  const controller = new ConduitBookingToolsController(
    { findAll: jest.fn(() => Promise.resolve(CATALOG)) } as never,
    {} as never,
    { execute } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { controller, execute };
}

const base = {
  client: { phone: '573001112233' },
  scheduledStart: '2026-11-02T09:00:00-05:00',
};
const req = { conduitContact: { phone: '573001112233' } } as never;

describe('POST conduit/booking/reservations · servicios por nombre', () => {
  it('resuelve el nombre al id sin pedir que la IA consulte la lista', async () => {
    const { controller, execute } = build();
    await controller.create(
      { ...base, treatmentNames: ['uñas acrílicas'] },
      req,
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ treatments: [ID_A], channel: 'WHATSAPP' }),
      expect.anything(),
    );
  });

  it('acepta ids, mezcla ids y nombres y no repite', async () => {
    const { controller, execute } = build();
    await controller.create({ ...base, treatments: [ID_A] }, req);
    expect(execute.mock.calls[0][0]).toMatchObject({ treatments: [ID_A] });
    await controller.create(
      {
        ...base,
        treatments: [ID_A],
        treatmentNames: ['Uñas Acrílicas', 'hidratación'],
      },
      req,
    );
    expect(execute.mock.calls[1][0]).toMatchObject({
      treatments: [ID_A, ID_B],
    });
  });

  it('un nombre ambiguo o desconocido es un error de negocio que explica qué pasó', async () => {
    const { controller, execute } = build();
    await expect(
      controller.create({ ...base, treatmentNames: ['terapia'] }, req),
    ).rejects.toThrow(/varios.*Terapia de hidratación/);
    await expect(
      controller.create({ ...base, treatmentNames: ['masaje tailandés'] }, req),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.create({ ...base }, req)).rejects.toThrow(
      /treatments/,
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
