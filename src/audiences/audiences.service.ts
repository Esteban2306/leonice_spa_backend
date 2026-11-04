import { Injectable } from '@nestjs/common';
import { ConsentType, Prisma, ReservationStatus } from '@prisma/client';
import { ANONYMIZED_PHONE_PREFIX } from '../client-privacy/anonymized-client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { MarketingFrequencyService } from '../marketing/marketing-frequency.service';
import { AudienceFilterDto } from './dto/audience-filter.dto';

const DAY_MS = 86_400_000;
const SAMPLE_SIZE = 8;

export interface AudienceMember {
  id: string;
  name: string;
  phone: string;
  lastVisitAt: Date | null;
}

export interface AudiencePreview {
  total: number;
  excluded: {
    withoutWhatsapp: number;
    withoutConsent: number;
    recentlyMessaged: number;
  };
  sample: Array<{ id: string; name: string; phone: string }>;
}

const completedSince = (since: Date): Prisma.ReservationWhereInput => ({
  status: ReservationStatus.COMPLETADA,
  completedAt: { gte: since },
});

export function buildAudienceWhere(
  filter: AudienceFilterDto,
  now: Date,
): Prisma.ClientWhereInput {
  const and: Prisma.ClientWhereInput[] = [
    { phone: { not: { startsWith: ANONYMIZED_PHONE_PREFIX } } },
  ];

  for (const key of filter.tags ?? []) {
    and.push({ tags: { some: { key } } });
  }
  for (const key of filter.excludeTags ?? []) {
    and.push({ tags: { none: { key } } });
  }
  if (filter.categoryId) {
    and.push({
      reservations: {
        some: {
          status: ReservationStatus.COMPLETADA,
          categoryId: filter.categoryId,
        },
      },
    });
  }
  if (filter.treatmentId) {
    and.push({
      reservations: {
        some: {
          status: ReservationStatus.COMPLETADA,
          treatmentId: filter.treatmentId,
        },
      },
    });
  }
  if (filter.visitedWithinDays) {
    and.push({
      reservations: {
        some: completedSince(
          new Date(now.getTime() - filter.visitedWithinDays * DAY_MS),
        ),
      },
    });
  }
  if (filter.notVisitedForDays) {
    and.push({
      reservations: {
        none: completedSince(
          new Date(now.getTime() - filter.notVisitedForDays * DAY_MS),
        ),
      },
    });
  }
  return { AND: and };
}

@Injectable()
export class AudiencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly frequency: MarketingFrequencyService,
  ) {}

  async preview(
    filter: AudienceFilterDto,
    marketing: boolean,
    now: Date = new Date(),
  ): Promise<AudiencePreview> {
    const base = buildAudienceWhere(filter, now);
    const reachable = this.reachableWhere(base);
    const recent = marketing
      ? await this.frequency.recentlyContactedIds(now)
      : [];
    const consented: Prisma.ClientWhereInput = {
      AND: [reachable, { consentRecords: { some: this.consent() } }],
    };
    const eligible = this.withoutRecent(
      this.eligibleWhere(base, marketing),
      recent,
    );

    const [withoutWhatsapp, withoutConsent, recentlyMessaged, total, sample] =
      await Promise.all([
        this.prisma.client.client.count({
          where: { AND: [base, { whatsappJid: null }] },
        }),
        marketing
          ? this.prisma.client.client.count({
              where: {
                AND: [reachable, { consentRecords: { none: this.consent() } }],
              },
            })
          : Promise.resolve(0),
        recent.length > 0
          ? this.prisma.client.client.count({
              where: { AND: [consented, { id: { in: recent } }] },
            })
          : Promise.resolve(0),
        this.prisma.client.client.count({ where: eligible }),
        this.prisma.client.client.findMany({
          where: eligible,
          select: { id: true, name: true, phone: true },
          orderBy: { name: 'asc' },
          take: SAMPLE_SIZE,
        }),
      ]);

    return {
      total,
      excluded: { withoutWhatsapp, withoutConsent, recentlyMessaged },
      sample,
    };
  }

  async members(
    filter: AudienceFilterDto,
    marketing: boolean,
    now: Date = new Date(),
  ): Promise<AudienceMember[]> {
    const recent = marketing
      ? await this.frequency.recentlyContactedIds(now)
      : [];
    const rows = await this.prisma.client.client.findMany({
      where: this.withoutRecent(
        this.eligibleWhere(buildAudienceWhere(filter, now), marketing),
        recent,
      ),
      select: {
        id: true,
        name: true,
        phone: true,
        reservations: {
          where: { status: ReservationStatus.COMPLETADA },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { completedAt: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      lastVisitAt: row.reservations[0]?.completedAt ?? null,
    }));
  }

  private withoutRecent(
    where: Prisma.ClientWhereInput,
    recent: readonly string[],
  ): Prisma.ClientWhereInput {
    return recent.length > 0
      ? { AND: [where, { id: { notIn: [...recent] } }] }
      : where;
  }

  private consent(): Prisma.ConsentRecordWhereInput {
    return { type: ConsentType.MARKETING };
  }

  private reachableWhere(
    base: Prisma.ClientWhereInput,
  ): Prisma.ClientWhereInput {
    return { AND: [base, { whatsappJid: { not: null } }] };
  }

  private eligibleWhere(
    base: Prisma.ClientWhereInput,
    marketing: boolean,
  ): Prisma.ClientWhereInput {
    const reachable = this.reachableWhere(base);
    return marketing
      ? { AND: [reachable, { consentRecords: { some: this.consent() } }] }
      : reachable;
  }
}
