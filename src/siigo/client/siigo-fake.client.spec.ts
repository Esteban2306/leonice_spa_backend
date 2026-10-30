import { FakeSiigoClient } from './siigo-fake.client';
import { SiigoError } from './siigo.errors';

describe('FakeSiigoClient', () => {
  it('repetir la misma llave devuelve el recibo original sin crear otro', async () => {
    const siigo = new FakeSiigoClient();

    const first = await siigo.createVoucher({ a: 1 }, 'llave1');
    const again = await siigo.createVoucher({ a: 1 }, 'llave1');

    expect(again.id).toBe(first.id);
    expect(siigo.vouchers).toHaveLength(1);
  });

  it('llaves distintas crean recibos distintos', async () => {
    const siigo = new FakeSiigoClient();

    await siigo.createVoucher({}, 'k1');
    await siigo.createVoucher({}, 'k2');

    expect(siigo.vouchers).toHaveLength(2);
  });

  it('puede simular fallas consecutivas y luego recuperarse', async () => {
    const siigo = new FakeSiigoClient();
    siigo.failNext(new SiigoError('UNAVAILABLE', 'caído'), 2);

    await expect(siigo.createVoucher({}, 'k')).rejects.toThrow('caído');
    await expect(siigo.createVoucher({}, 'k')).rejects.toThrow('caído');
    await expect(siigo.createVoucher({}, 'k')).resolves.toBeDefined();
    expect(siigo.vouchers).toHaveLength(1);
  });

  it('busca productos por código', async () => {
    const siigo = new FakeSiigoClient();
    siigo.products = [
      { id: 1, name: 'Alisado', code: 'ALI', active: true, raw: {} },
    ];

    expect((await siigo.findProductByCode('ALI'))?.name).toBe('Alisado');
    expect(await siigo.findProductByCode('XX')).toBeNull();
  });
});
