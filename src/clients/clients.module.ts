import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ClientsRepository } from './repositories/clients.repository';
import { clientsHistoryRepository } from './repositories/client-history.repository';
import { ConsentService } from './consent/consent.service';
import { ConsentRecordRepository } from './consent/consent-record.repository';
import { EncryptionModule } from '../infrastructure/encryption/encryption.module';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [EncryptionModule],
  controllers: [ClientsController],
  providers: [
    ClientsService,
    ClientsRepository,
    clientsHistoryRepository,
    ConsentService,
    ConsentRecordRepository,
    ConfigService,
  ],
})
export class ClientsModule {}
