import { Injectable } from '@nestjs/common';
import type { Client, HairColor, HairLength } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EncryptionService } from '../../infrastructure/encryption/encryption.service';
import {
  CreateClientData,
  UpdateClientData,
} from '../types/client-persistence.types';
import { SafeCacheService } from 'src/infrastructure/redis/safe-cache.service';
import { isHairProfileValid } from '../domain/hair-profile.util';

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
    private readonly cache: SafeCacheService,
  ) {}

  async findByPhone(phone: string) {
    const client = await this.prisma.client.client.findUnique({
      where: { phone },
    });
    return client ? this.decryptSensitive(client) : null;
  }

  async findByWhatsappJid(jid: string) {
    const cacheKey = JID_CACHE_PREFIX + jid;
    const cachedId = await this.cache.get<string>(cacheKey);
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
      void this.cache.set(cacheKey, client.id, JID_CACHE_TTL_SECONDS);
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
    const hasHairProfile = Boolean(data.hairLength && data.hairColor);

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
        hairLength: data.hairLength,
        hairColor: data.hairColor,
        hairProfileUpdatedAt: hasHairProfile ? new Date() : null,
      },
    });

    if (client.whatsappJid) {
      void this.cache.set(
        JID_CACHE_PREFIX + client.whatsappJid,
        client.id,
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
      hairLength?: HairLength;
      hairColor?: HairColor;
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

    if (
      incoming.hairLength &&
      incoming.hairColor &&
      !isHairProfileValid(current)
    ) {
      data.hairLength = incoming.hairLength;
      data.hairColor = incoming.hairColor;
      data.hairProfileUpdatedAt = new Date();
    }

    if (Object.keys(data).length === 0) {
      return current;
    }

    const updated = await this.prisma.client.client.update({
      where: { id: current.id },
      data,
    });

    if (typeof data.whatsappJid === 'string') {
      void this.cache.set(
        JID_CACHE_PREFIX + data.whatsappJid,
        current.id,
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
