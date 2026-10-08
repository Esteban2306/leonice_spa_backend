import { Injectable } from '@nestjs/common';
import type { Client, HairColor, HairLength } from '@prisma/client';
import { Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EncryptionService } from '../../infrastructure/encryption/encryption.service';
import {
  CreateClientData,
  UpdateClientData,
} from '../types/client-persistence.types';
import { SafeCacheService } from 'src/infrastructure/redis/safe-cache.service';

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

  async search(
    params: { name?: string; phoneDigits?: string },
    page = 1,
    pageSize = 20,
  ) {
    const conditions: Prisma.ClientWhereInput[] = [
      ...(params.name
        ? [{ name: { contains: params.name, mode: 'insensitive' as const } }]
        : []),
      ...(params.phoneDigits
        ? [{ phone: { contains: params.phoneDigits } }]
        : []),
    ];
    const where: Prisma.ClientWhereInput =
      conditions.length > 0 ? { OR: conditions } : {};

    const skip = (page - 1) * pageSize;

    const [clients, total] = await this.prisma.client.$transaction([
      this.prisma.client.client.findMany({
        where,
        orderBy: {
          name: 'asc',
        },
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          phone: true,
          createdAt: true,
          hairLength: true,
          hairColor: true,
          hairProfileUpdatedAt: true,
          _count: { select: { reservations: true } },
          reservations: {
            orderBy: { scheduledStart: 'desc' },
            take: 1,
            select: { scheduledStart: true, status: true },
          },
        },
      }),

      this.prisma.client.client.count({
        where,
      }),
    ]);

    return {
      data: clients,

      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
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
        allergies:
          data.allergies !== undefined
            ? this.encryption.encrypt(data.allergies)
            : undefined,
      },
    });
    return this.decryptSensitive(client);
  }

  async setHairProfile(
    id: string,
    profile: { hairLength: HairLength; hairColor: HairColor },
    at: Date,
  ) {
    const client = await this.prisma.client.client.update({
      where: { id },
      data: { ...profile, hairProfileUpdatedAt: at },
    });
    return this.decryptSensitive(client);
  }

  async renewHairProfileIfComplete(id: string, at: Date): Promise<boolean> {
    const result = await this.prisma.client.client.updateMany({
      where: { id, hairLength: { not: null }, hairColor: { not: null } },
      data: { hairProfileUpdatedAt: at },
    });
    return result.count === 1;
  }

  async findPendingHairProfiles(params: {
    upcomingFrom: Date;
    expiredBefore: Date;
    page: number;
    pageSize: number;
  }) {
    const upcomingHairReservation = {
      status: {
        in: [
          ReservationStatus.PENDIENTE_DEPOSITO,
          ReservationStatus.CONFIRMADA,
        ],
      },
      scheduledStart: { gte: params.upcomingFrom },
      category: { tracksHairProfile: true },
    };
    const where = {
      reservations: { some: upcomingHairReservation },
      OR: [
        { hairLength: null },
        { hairColor: null },
        { hairProfileUpdatedAt: null },
        { hairProfileUpdatedAt: { lt: params.expiredBefore } },
      ],
    };

    const [clients, total] = await this.prisma.client.$transaction([
      this.prisma.client.client.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          id: true,
          name: true,
          phone: true,
          hairLength: true,
          hairColor: true,
          hairProfileUpdatedAt: true,
          reservations: {
            where: upcomingHairReservation,
            orderBy: { scheduledStart: 'asc' },
            take: 1,
            select: {
              id: true,
              scheduledStart: true,
              status: true,
              treatment: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.client.client.count({ where }),
    ]);

    return { clients, total };
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
