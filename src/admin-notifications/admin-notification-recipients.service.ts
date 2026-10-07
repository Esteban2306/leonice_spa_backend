import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizePhone } from '../clients/utils/normalize-phone.util';
import { AdminNotificationRecipientsRepository } from './repository/admin-notification-recipients.repository';
import { CreateAdminNotificationRecipientDto } from './dto/create-admin-notification-recipient.dto';
import { UpdateAdminNotificationRecipientDto } from './dto/update-admin-notification-recipient.dto';

@Injectable()
export class AdminNotificationRecipientsService {
  constructor(
    private readonly repository: AdminNotificationRecipientsRepository,
  ) {}

  findAll() {
    return this.repository.findAll();
  }

  async create(dto: CreateAdminNotificationRecipientDto) {
    try {
      return await this.repository.create({
        name: dto.name.trim(),
        phone: normalizePhone(dto.phone),
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe un destinatario con ese número');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateAdminNotificationRecipientDto) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Destinatario no encontrado');

    return this.repository.update(id, {
      name: dto.name?.trim(),
      isActive: dto.isActive,
    });
  }
}
