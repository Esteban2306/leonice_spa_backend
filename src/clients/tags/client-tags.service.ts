import { Injectable, Logger } from '@nestjs/common';
import { ClientTagKey, Prisma } from '@prisma/client';
import { ANONYMIZED_PHONE_PREFIX } from '../../client-privacy/anonymized-client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DerivedTag, deriveClientTags } from './client-tag.rules';

const REFRESH_BATCH_SIZE = 200;

export interface ClientTagView {
  key: ClientTagKey;
  detail: string;
  assignedAt: Date;
}

export interface ClientTagCatalogEntry {
  key: ClientTagKey;
  clients: number;
}

export interface RefreshSummary {
  clients: number;
  tagged: number;
}

const clientTagInputSelect = {
  id: true,
  birthDate: true,
  reservations: {
    select: {
      status: true,
      scheduledStart: true,
      completedAt: true,
      category: { select: { name: true } },
      treatment: { select: { name: true } },
    },
  },
} satisfies Prisma.ClientSelect;

type ClientTagInputRow = Prisma.ClientGetPayload<{
  select: typeof clientTagInputSelect;
}>;

const tagId = (tag: DerivedTag) => `${tag.key}|${tag.detail}`;

@Injectable()
export class ClientTagsService {
  private readonly logger = new Logger(ClientTagsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async isEmpty(): Promise<boolean> {
    return (await this.prisma.client.clientTag.count({ take: 1 })) === 0;
  }

  async refreshAll(now: Date = new Date()): Promise<RefreshSummary> {
    let cursor: string | undefined;
    let clients = 0;
    let tagged = 0;

    for (;;) {
      const batch = await this.prisma.client.client.findMany({
        where: { phone: { not: { startsWith: ANONYMIZED_PHONE_PREFIX } } },
        select: clientTagInputSelect,
        orderBy: { id: 'asc' },
        take: REFRESH_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;

      tagged += await this.syncBatch(batch, now);
      clients += batch.length;
      cursor = batch[batch.length - 1].id;
      if (batch.length < REFRESH_BATCH_SIZE) break;
    }

    this.logger.log(
      `Etiquetas de clientas actualizadas: ${clients} clientas, ${tagged} etiquetas`,
    );
    return { clients, tagged };
  }

  async refreshClient(
    clientId: string,
    now: Date = new Date(),
  ): Promise<ClientTagView[]> {
    const row = await this.prisma.client.client.findUnique({
      where: { id: clientId },
      select: clientTagInputSelect,
    });
    if (!row) return [];
    await this.syncBatch([row], now);
    return (await this.tagsFor([clientId])).get(clientId) ?? [];
  }

  async tagsFor(clientIds: string[]): Promise<Map<string, ClientTagView[]>> {
    const result = new Map<string, ClientTagView[]>();
    if (clientIds.length === 0) return result;
    const rows = await this.prisma.client.clientTag.findMany({
      where: { clientId: { in: clientIds } },
      orderBy: [{ key: 'asc' }, { detail: 'asc' }],
    });
    for (const row of rows) {
      const list = result.get(row.clientId) ?? [];
      list.push({
        key: row.key,
        detail: row.detail,
        assignedAt: row.assignedAt,
      });
      result.set(row.clientId, list);
    }
    return result;
  }

  async catalog(): Promise<ClientTagCatalogEntry[]> {
    const rows = await this.prisma.client.$queryRaw<
      Array<{ key: ClientTagKey; clients: bigint }>
    >`SELECT "key", COUNT(DISTINCT "client_id") AS clients FROM "client_tags" GROUP BY "key"`;
    const counts = new Map(rows.map((row) => [row.key, Number(row.clients)]));
    return Object.values(ClientTagKey).map((key) => ({
      key,
      clients: counts.get(key) ?? 0,
    }));
  }

  private async syncBatch(
    batch: ClientTagInputRow[],
    now: Date,
  ): Promise<number> {
    const existing = await this.prisma.client.clientTag.findMany({
      where: { clientId: { in: batch.map((row) => row.id) } },
      select: { id: true, clientId: true, key: true, detail: true },
    });
    const existingByClient = new Map<string, typeof existing>();
    for (const tag of existing) {
      const list = existingByClient.get(tag.clientId) ?? [];
      list.push(tag);
      existingByClient.set(tag.clientId, list);
    }

    const staleIds: string[] = [];
    const created: Prisma.ClientTagCreateManyInput[] = [];
    let tagged = 0;

    for (const row of batch) {
      const derived = deriveClientTags(
        {
          birthDate: row.birthDate,
          reservations: row.reservations.map((reservation) => ({
            status: reservation.status,
            scheduledStart: reservation.scheduledStart,
            completedAt: reservation.completedAt,
            categoryName: reservation.category.name,
            treatmentName: reservation.treatment.name,
          })),
        },
        now,
      );
      tagged += derived.length;

      const wanted = new Set(derived.map(tagId));
      const current = existingByClient.get(row.id) ?? [];
      const kept = new Set(current.map(tagId));
      for (const tag of current) {
        if (!wanted.has(tagId(tag))) staleIds.push(tag.id);
      }
      for (const tag of derived) {
        if (!kept.has(tagId(tag))) {
          created.push({
            clientId: row.id,
            key: tag.key,
            detail: tag.detail,
            assignedAt: now,
          });
        }
      }
    }

    if (staleIds.length === 0 && created.length === 0) return tagged;
    await this.prisma.client.$transaction([
      this.prisma.client.clientTag.deleteMany({
        where: { id: { in: staleIds } },
      }),
      this.prisma.client.clientTag.createMany({
        data: created,
        skipDuplicates: true,
      }),
    ]);
    return tagged;
  }
}
