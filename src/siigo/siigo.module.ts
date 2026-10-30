import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DisabledSiigoClient } from './client/siigo-disabled.client';
import { SiigoHttpClient } from './client/siigo-http.client';
import { SIIGO_CLIENT, SiigoClient } from './client/siigo.client';
import { readSiigoSettings } from './siigo.config';

@Module({
  providers: [
    {
      provide: SIIGO_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SiigoClient => {
        const settings = readSiigoSettings(config);
        return settings.enabled
          ? new SiigoHttpClient(settings)
          : new DisabledSiigoClient();
      },
    },
  ],
  exports: [SIIGO_CLIENT],
})
export class SiigoModule {}
