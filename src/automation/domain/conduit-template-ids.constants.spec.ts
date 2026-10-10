import { CONDUIT_TEMPLATE_IDS } from './conduit-template-ids.constants';

describe('CONDUIT_TEMPLATE_IDS', () => {
  const key = 'CONDUIT_TEMPLATE_RESERVATION_REMINDER';
  const original = process.env[key];
  afterEach(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });

  it('lee la variable al usarla, no al importar el módulo', () => {
    delete process.env[key];
    expect(CONDUIT_TEMPLATE_IDS.RESERVATION_REMINDER).toBe('');

    process.env[key] = 'cargada-despues-del-import';

    expect(CONDUIT_TEMPLATE_IDS.RESERVATION_REMINDER).toBe(
      'cargada-despues-del-import',
    );
  });
});
