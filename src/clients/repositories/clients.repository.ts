import { Inject, Injectable } from '@nestjs/common';
import type { Client } from '@prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EncryptionService } from '../../infrastructure/encryption/encryption.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import {
  CreateClientData,
  UpdateClientData,
} from '../types/client-persistence.types';

const JID_CACHE_PREFIX = 'client:jid:';
const JID_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

interface DecryptableClient {
  allergies: string | null;
}

@Injectable()
export class ClientsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async findByPhone(phone: string) {
    const client = await this.prisma.client.client.findUnique({
      where: { phone },
    });
    return client ? this.decryptSensitive(client) : null;
  }

  async findByWhatsappJid(jid: string) {
    const cachedId = await this.redis.get(JID_CACHE_PREFIX + jid);
    if (cachedId) {
      const cached = await this.prisma.client.client.findUnique({
        where: { id: cachedId },
      });
      if (cached) return this.decryptSensitive(cached);
    }

    const client = await this.prisma.client.client.findUnique({
      where: { whatsappJid: jid },
    });
    if (client) {
      await this.redis.set(
        JID_CACHE_PREFIX + jid,
        client.id,
        'EX',
        JID_CACHE_TTL_SECONDS,
      );
      return this.decryptSensitive(client);
    }
    return null;
  }

  async findById(id: string) {
    const client = await this.prisma.client.client.findUnique({
      where: { id },
    });
    return client ? this.decryptSensitive(client) : null;
  }

  async searchByName(query: string, take = 20) {
    return this.prisma.client.client.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      take,
      select: { id: true, name: true, phone: true, createdAt: true },
    });
  }

  async create(data: CreateClientData) {
    const client = await this.prisma.client.client.create({
      data: {
        phone: data.phone,
        name: data.name,
        birthDate: data.birthDate,
        whatsappJid: data.whatsappJid,
        allergies: data.allergies
          ? this.encryption.encrypt(data.allergies)
          : null,
        isPregnant: data.isPregnant ?? false,
      },
    });

    if (client.whatsappJid) {
      await this.redis.set(
        JID_CACHE_PREFIX + client.whatsappJid,
        client.id,
        'EX',
        JID_CACHE_TTL_SECONDS,
      );
    }

    return this.decryptSensitive(client);
  }

  async fillMissingFields(
    current: Client,
    incoming: {
      whatsappJid?: string;
      allergies?: string;
      isPregnant?: boolean;
    },
  ): Promise<Client> {
    const data: Record<string, unknown> = {};

    if (!current.whatsappJid && incoming.whatsappJid) {
      data.whatsappJid = incoming.whatsappJid;
    }
    if (current.allergies === null && incoming.allergies) {
      data.allergies = this.encryption.encrypt(incoming.allergies);
    }
    if (incoming.isPregnant !== undefined) {
      data.isPregnant = incoming.isPregnant;
    }

    if (Object.keys(data).length === 0) {
      return current;
    }

    const updated = await this.prisma.client.client.update({
      where: { id: current.id },
      data,
    });

    if (typeof data.whatsappJid === 'string') {
      await this.redis.set(
        JID_CACHE_PREFIX + data.whatsappJid,
        current.id,
        'EX',
        JID_CACHE_TTL_SECONDS,
      );
    }

    return this.decryptSensitive(updated);
  }

  async update(id: string, data: UpdateClientData) {
    const client = await this.prisma.client.client.update({
      where: { id },
      data: {
        name: data.name,
        birthDate: data.birthDate,
        isPregnant: data.isPregnant,
        hairLength: data.hairLength,
        hairColor: data.hairColor,
        allergies:
          data.allergies !== undefined
            ? this.encryption.encrypt(data.allergies)
            : undefined,
        hairProfileUpdatedAt:
          data.hairLength || data.hairColor ? new Date() : undefined,
      },
    });
    return this.decryptSensitive(client);
  }

  private decryptSensitive<T extends DecryptableClient>(client: T): T {
    return {
      ...client,
      allergies: client.allergies
        ? this.encryption.decrypt(client.allergies)
        : null,
    };
  }
}
