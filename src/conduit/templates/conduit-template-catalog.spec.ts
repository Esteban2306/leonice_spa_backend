import { OPERATIONAL_TEMPLATE_ENV_KEYS } from '../../automation/domain/operational-notifications.constants';
import {
  BROADCAST_TEMPLATES,
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

  it('las plantillas difundibles solo usan datos que se conocen sin una reserva y las de marketing están marcadas', () => {
    expect(BROADCAST_TEMPLATES.map((t) => t.code).sort()).toEqual([
      'BIRTHDAY_GREETING',
      'BIRTHDAY_PROMO',
      'BLACK_FRIDAY',
      'BONUS_SEASON',
      'BOOK_AHEAD',
      'CARE_REMINDER',
      'HOME_CARE',
      'LAST_DAYS',
      'LOVE_FRIENDSHIP',
      'MOTHERS_DAY',
      'PROMOTION_BROADCAST',
      'REACTIVATION',
      'REACTIVATION_PROMO',
      'REFERRAL',
      'WOMENS_DAY',
      'YEAR_END',
    ]);
    for (const template of BROADCAST_TEMPLATES) {
      expect(template.marketing).toBe(true);
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

  it('los mensajes proactivos a muchas clientas tienen variantes con las mismas variables', () => {
    const withVariants = CONDUIT_TEMPLATE_CATALOG.filter((t) => t.variants);
    expect(withVariants.map((t) => t.code).sort()).toEqual(
      [
        'RESERVATION_REMINDER',
        ...BROADCAST_TEMPLATES.map((t) => t.code),
      ].sort(),
    );
    for (const template of withVariants) {
      const variants = template.variants ?? [];
      expect(variants.length).toBeGreaterThanOrEqual(2);
      expect(variants.length).toBeLessThanOrEqual(3);
      expect(new Set([template.body, ...variants]).size).toBe(
        variants.length + 1,
      );
      for (const variant of variants) {
        expect(templatePlaceholders(variant).sort()).toEqual(
          [...template.variables].sort(),
        );
        expect(variant.length).toBeLessThan(700);
      }
    }
  });
});
