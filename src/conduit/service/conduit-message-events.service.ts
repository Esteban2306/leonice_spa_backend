import { Injectable, Logger } from '@nestjs/common';
import { ConduitMessageDeliveryLogRepository } from '../repositories/conduit-message-delivery-log.repository';
import { ConduitMessageEventDto } from '../dto/conduit-message-event.dto';
import { ConduitMessageStatus } from '@prisma/client';

@Injectable()
export class ConduitMessageEventsService {
  private readonly logger = new Logger(ConduitMessageEventsService.name);

  constructor(
    private readonly repository: ConduitMessageDeliveryLogRepository,
  ) {}

  async handle(dto: ConduitMessageEventDto): Promise<void> {
    const wasNew = await this.repository.recordIfNew(dto);

    if (!wasNew) {
      this.logger.debug(
        `Evento duplicado ignorado: ${dto.data.messageId} / ${dto.data.status}`,
      );
      return;
    }

    if (dto.data.status === ConduitMessageStatus.DEAD) {
      this.logger.error(
        `Mensaje ${dto.data.messageId} a ${dto.data.recipient} marcado DEAD por Conduit: ${dto.data.error ?? 'sin detalle'}`,
      );
    }
  }
}
