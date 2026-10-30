import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DisabledSiigoClient } from './client/siigo-disabled.client';
import { SiigoHttpClient } from './client/siigo-http.client';
import { SIIGO_CLIENT, SiigoClient } from './client/siigo.client';
import { SiigoModule } from './siigo.module';

async function resolveClient(values: Record<string, unknown>) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => values],
      }),
      SiigoModule,
    ],
  }).compile();
  return moduleRef.get<SiigoClient>(SIIGO_CLIENT);
}

describe('SiigoModule', () => {
  it('apagado entrega un cliente que rechaza con NOT_CONFIGURED', async () => {
    const client = await resolveClient({});

    expect(client).toBeInstanceOf(DisabledSiigoClient);
    await expect(client.createVoucher({}, 'k')).rejects.toMatchObject({
      kind: 'NOT_CONFIGURED',
    });
  });

  it('activo y completo entrega el cliente HTTP', async () => {
    const client = await resolveClient({
      SIIGO_ENABLED: 'true',
      SIIGO_USERNAME: 'u@x.test',
      SIIGO_ACCESS_KEY: 'k',
      SIIGO_PARTNER_ID: 'LeoniceSpa',
    });

    expect(client).toBeInstanceOf(SiigoHttpClient);
  });

  it('activo e incompleto impide arrancar', async () => {
    await expect(resolveClient({ SIIGO_ENABLED: 'true' })).rejects.toThrow(
      /SIIGO_USERNAME/,
    );
  });
});
