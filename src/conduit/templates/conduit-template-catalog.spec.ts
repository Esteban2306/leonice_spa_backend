import { OPERATIONAL_TEMPLATE_ENV_KEYS } from '../../automation/domain/operational-notifications.constants';
import { CONDUIT_TEMPLATE_IDS } from '../../automation/domain/conduit-template-ids.constants';
import {
  CONDUIT_TEMPLATE_CATALOG,
  templatePlaceholders,
} from './conduit-template-catalog';

describe('CONDUIT_TEMPLATE_CATALOG', () => {
  it.each(CONDUIT_TEMPLATE_CATALOG.map((t) => [t.code, t]))(
    '%s usa exactamente las variables que envía el backend',
    (_code, template) => {
      expect(templatePlaceholders(template.body).sort()).toEqual(
        [...template.variables].sort(),
      );
    },
  );

  it('cubre todas las plantillas operativas', () => {
    const envKeys = CONDUIT_TEMPLATE_CATALOG.map((t) => t.envKey);
    for (const envKey of Object.values(OPERATIONAL_TEMPLATE_ENV_KEYS)) {
      expect(envKeys).toContain(envKey);
    }
  });

  it('cubre recordatorio y reactivación', () => {
    const codes = CONDUIT_TEMPLATE_CATALOG.map((t) => t.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'RESERVATION_REMINDER',
        'REACTIVATION',
        'REACTIVATION_PROMO',
      ]),
    );
    expect(Object.keys(CONDUIT_TEMPLATE_IDS)).toHaveLength(3);
  });

  it('no repite nombres, códigos ni variables de entorno', () => {
    for (const field of ['code', 'envKey', 'name'] as const) {
      const values = CONDUIT_TEMPLATE_CATALOG.map((t) => t[field]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('cabe en un mensaje de WhatsApp de Conduit', () => {
    for (const template of CONDUIT_TEMPLATE_CATALOG) {
      expect(template.body.length).toBeLessThan(700);
    }
  });
});
