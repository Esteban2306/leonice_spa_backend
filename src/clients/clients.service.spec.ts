import { ClientsService } from './clients.service';
import { ClientsRepository } from './repositories/clients.repository';
import { clientsHistoryRepository } from './repositories/client-history.repository';
import { ConsentService } from './consent/consent.service';

const existing = {
  id: 'c1',
  phone: '+573001112233',
  name: 'Ana',
  whatsappJid: null,
  allergies: null,
  isPregnant: false,
};

const build = () => {
  const calls: string[] = [];
  const repository = {
    findByWhatsappJid: jest.fn((jid: string) => {
      calls.push(`jid:${jid}`);
      return Promise.resolve(
        jid === 'victima@s.whatsapp.net'
          ? { ...existing, id: 'victima' }
          : null,
      );
    }),
    findByPhone: jest.fn((phone: string) =>
      Promise.resolve(phone === existing.phone ? existing : null),
    ),
    fillMissingFields: jest.fn((client: unknown) => {
      calls.push('fill');
      return Promise.resolve(client);
    }),
    create: jest.fn((data: unknown) => {
      calls.push('create');
      return Promise.resolve({ id: 'nuevo', ...(data as object) });
    }),
  };
  const consent = {
    assertValidConsent: jest.fn(),
    recordHealthDataConsent: jest.fn().mockResolvedValue(undefined),
    ensureHealthDataConsent: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ClientsService(
    repository as unknown as ClientsRepository,
    {} as clientsHistoryRepository,
    consent as unknown as ConsentService,
  );
  return { service, repository, consent, calls };
};

describe('ClientsService.resolveOrCreateForBooking', () => {
  it('sin identidad verificada no busca por whatsappJid ni modifica la ficha existente', async () => {
    const { service, calls } = build();
    const result = await service.resolveOrCreateForBooking({
      phone: '3001112233',
      whatsappJid: 'atacante@s.whatsapp.net',
      allergies: 'x',
      isPregnant: true,
      consent: { healthDataConsent: true, policyVersion: 'v1' },
    });
    expect(result.id).toBe('c1');
    expect(calls).toEqual([]);
  });

  it('sin identidad verificada un jid ajeno no resuelve a la otra clienta', async () => {
    const { service } = build();
    const result = await service.resolveOrCreateForBooking({
      phone: '3009998877',
      name: 'Atacante',
      birthDate: '1990-01-01',
      whatsappJid: 'victima@s.whatsapp.net',
    });
    expect(result.id).toBe('nuevo');
    expect((result as { whatsappJid?: string }).whatsappJid).toBeUndefined();
  });

  it('con identidad verificada conserva el comportamiento: busca por jid y completa datos faltantes', async () => {
    const { service, calls } = build();
    await service.resolveOrCreateForBooking(
      { phone: '3001112233', whatsappJid: 'propio@s.whatsapp.net' },
      { trustedIdentity: true },
    );
    expect(calls).toEqual(['jid:propio@s.whatsapp.net', 'fill']);
  });

  it('una clienta nueva por el canal público se crea con sus datos y consentimiento, sin jid', async () => {
    const { service, repository, consent } = build();
    await service.resolveOrCreateForBooking({
      phone: '3007776655',
      name: 'Nueva',
      birthDate: '1990-01-01',
      allergies: 'polen',
      whatsappJid: 'x@s.whatsapp.net',
      consent: { healthDataConsent: true, policyVersion: 'v1' },
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ allergies: 'polen', whatsappJid: undefined }),
    );
    expect(consent.recordHealthDataConsent).toHaveBeenCalledWith('nuevo', 'v1');
  });
});
