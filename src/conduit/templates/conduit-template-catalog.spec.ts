import { OPERATIONAL_TEMPLATE_ENV_KEYS } from '../../automation/domain/operational-notifications.constants';
import {
  CONDUIT_TEMPLATE_CATALOG,
  templateChannel,
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
  });

  it('no repite nombres, códigos ni variables de entorno', () => {
    for (const field of ['code', 'envKey', 'name'] as const) {
      const values = CONDUIT_TEMPLATE_CATALOG.map((t) => t[field]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('cabe en un mensaje de WhatsApp de Conduit', () => {
    for (const template of CONDUIT_TEMPLATE_CATALOG) {
      if (templateChannel(template) !== 'WHATSAPP') continue;
      expect(template.body.length).toBeLessThan(700);
    }
  });

  it('cada correo tiene asunto y sus variables coinciden con las del cuerpo', () => {
    const emails = CONDUIT_TEMPLATE_CATALOG.filter(
      (t) => templateChannel(t) === 'EMAIL',
    );
    expect(emails.map((t) => t.code).sort()).toEqual([
      'ADMIN_CLIENT_CANCELLED_EMAIL',
      'ADMIN_DEPOSIT_TIMEOUT_EMAIL',
      'ADMIN_HANDOFF_EMAIL',
      'ADMIN_RESCHEDULED_EMAIL',
    ]);
    for (const email of emails) {
      expect(email.subject).toBeTruthy();
      expect(email.audience).toBe('ADMIN');
      for (const used of templatePlaceholders(email.subject ?? '')) {
        expect(email.variables).toContain(used);
      }
    }
  });
});
