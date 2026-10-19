import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ClientAnonymizationService } from './client-anonymization.service';

@Controller({ path: 'clients', version: '1' })
export class ClientPrivacyController {
  constructor(private readonly anonymization: ClientAnonymizationService) {}

  @HttpCode(HttpStatus.OK)
  @Post(':id/anonymize')
  anonymize(@Param('id', ParseUUIDPipe) id: string) {
    return this.anonymization.anonymize(id);
  }
}
