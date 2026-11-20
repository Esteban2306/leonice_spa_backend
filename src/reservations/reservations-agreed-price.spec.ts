import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsController } from './reservations.controller';

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';

function controller() {
  const execute = jest.fn((_dto: unknown, _options: unknown) =>
    Promise.resolve({ reservations: [] }),
  );
  const instance = Object.create(
    ReservationsController.prototype,
  ) as ReservationsController;
  Object.assign(instance, { createOrchestrator: { execute } });
  return { instance, execute };
}

const dto = (agreedPrices?: Array<{ treatmentId: string; price: number }>) =>
  ({
    client: { phone: '3001112233' },
    treatments: [T1],
    scheduledStart: '2026-12-19T10:00:00-05:00',
    ...(agreedPrices && { agreedPrices }),
  }) as CreateReservationDto;

describe('precio fijado al crear una reserva', () => {
  it('desde el panel se agenda con el precio que eligió el administrador', async () => {
    const { instance, execute } = controller();
    await instance.create(dto([{ treatmentId: T1, price: 350000 }]), {
      id: 'admin',
    } as never);
    const options = execute.mock.calls[0][1] as {
      priceOverrides: Map<string, number>;
      trustedIdentity: boolean;
    };
    expect(options.priceOverrides.get(T1)).toBe(350000);
    expect(options.trustedIdentity).toBe(true);
  });

  it('sin precio fijado se usa el del catálogo', async () => {
    const { instance, execute } = controller();
    await instance.create(dto(), { id: 'admin' } as never);
    const options = execute.mock.calls[0][1] as {
      priceOverrides: Map<string, number>;
    };
    expect(options.priceOverrides.size).toBe(0);
  });

  it('la web pública no puede fijar el precio', () => {
    const { instance, execute } = controller();
    expect(() =>
      instance.create(dto([{ treatmentId: T1, price: 1000 }]), undefined),
    ).toThrow(AppException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('no acepta un precio de un servicio que no está en la reserva', () => {
    const { instance, execute } = controller();
    expect(() =>
      instance.create(dto([{ treatmentId: T2, price: 350000 }]), {
        id: 'admin',
      } as never),
    ).toThrow(AppException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('el precio debe ser un entero en pesos dentro del límite', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const transform = (body: unknown) =>
      pipe.transform(body, { type: 'body', metatype: CreateReservationDto });
    await expect(
      transform(dto([{ treatmentId: T1, price: 350000 }])),
    ).resolves.toBeDefined();
    await expect(
      transform(dto([{ treatmentId: T1, price: 350000.5 }])),
    ).rejects.toBeDefined();
    await expect(
      transform(dto([{ treatmentId: T1, price: -1 }])),
    ).rejects.toBeDefined();
  });
});
