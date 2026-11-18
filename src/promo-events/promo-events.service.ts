import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { EventBusService } from '../common/events/event.service';
import { EVENT_TYPES } from '../common/events/constants/event.types';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../infrastructure/queue/queue.constants';
import { NOTICE_JOB_OPTIONS } from '../automation/domain/operational-notifications.constants';
import type {
  CreatePromoEventDto,
  UpdatePromoEventDto,
} from './dto/promo-event.dto';

@Injectable()
export class PromoEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    @InjectQueue(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
    private readonly queue: Queue,
  ) {}

  async findAll() {
    const events = await this.prisma.client.promoEvent.findMany({
      orderBy: { startsAt: 'desc' },
      include: {
        _count: { select: { tickets: true } },
        tickets: {
          where: { wonAt: { not: null } },
          select: { id: true },
        },
      },
    });
    return events.map(({ _count, tickets, ...event }) => ({
      ...event,
      ticketCount: _count.tickets,
      winnerCount: tickets.length,
    }));
  }

  async create(dto: CreatePromoEventDto) {
    const { startsAt, endsAt } = this.range(dto.startsAt, dto.endsAt);
    const event = await this.prisma.client.promoEvent.create({
      data: {
        name: dto.name.trim(),
        description: dto.description.trim(),
        prizes: dto.prizes?.trim() || null,
        startsAt,
        endsAt,
        ticketsEnabled: dto.ticketsEnabled ?? false,
      },
    });
    this.resyncBot();
    return event;
  }

  async update(id: string, dto: UpdatePromoEventDto) {
    const current = await this.require(id);
    const { startsAt, endsAt } = this.range(
      dto.startsAt ?? current.startsAt.toISOString(),
      dto.endsAt ?? current.endsAt.toISOString(),
    );
    const event = await this.prisma.client.promoEvent.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        prizes:
          dto.prizes === undefined ? undefined : dto.prizes.trim() || null,
        startsAt,
        endsAt,
        ticketsEnabled: dto.ticketsEnabled,
        isActive: dto.isActive,
      },
    });
    this.resyncBot();
    return event;
  }

  async remove(id: string): Promise<void> {
    const event = await this.prisma.client.promoEvent.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true, campaigns: true } } },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (event._count.tickets > 0 || event._count.campaigns > 0) {
      throw new ConflictException(
        'El evento ya tiene boletas o campañas: desactívalo en vez de borrarlo para conservar el registro',
      );
    }
    await this.prisma.client.promoEvent.delete({ where: { id } });
    this.resyncBot();
  }

  async tickets(id: string) {
    await this.require(id);
    return this.prisma.client.eventTicket.findMany({
      where: { eventId: id },
      orderBy: { number: 'asc' },
      select: {
        id: true,
        number: true,
        createdAt: true,
        wonAt: true,
        prize: true,
        reservationId: true,
        client: { select: { id: true, name: true, phone: true } },
      },
    });
  }

  async draw(id: string, prize: string, userId: string) {
    const winner = await this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM promo_events WHERE id = ${id} FOR UPDATE`;
      const event = await tx.promoEvent.findUnique({ where: { id } });
      if (!event) throw new NotFoundException('Evento no encontrado');

      const all = await tx.eventTicket.findMany({
        where: { eventId: id },
        select: { id: true, clientId: true, wonAt: true },
      });
      const alreadyWon = new Set(
        all.filter((t) => t.wonAt !== null).map((t) => t.clientId),
      );
      const eligible = all.filter(
        (t) => t.wonAt === null && !alreadyWon.has(t.clientId),
      );
      if (eligible.length === 0) {
        throw new BadRequestException(
          'No quedan boletas para sortear: cada clienta puede ganar una sola vez',
        );
      }

      const picked = eligible[randomInt(eligible.length)];
      return tx.eventTicket.update({
        where: { id: picked.id },
        data: {
          wonAt: new Date(),
          prize: prize.trim(),
          drawnByUserId: userId,
        },
        select: {
          id: true,
          number: true,
          prize: true,
          wonAt: true,
          client: { select: { id: true, name: true, phone: true } },
        },
      });
    });

    await this.queue.add(
      JOB_NAMES.NOTIFY_CLIENT_EVENT_WINNER,
      { ticketId: winner.id },
      { ...NOTICE_JOB_OPTIONS, jobId: `event-winner-${winner.id}` },
    );
    return winner;
  }

  private async require(id: string) {
    const event = await this.prisma.client.promoEvent.findUnique({
      where: { id },
    });
    if (!event) throw new NotFoundException('Evento no encontrado');
    return event;
  }

  private range(startsAtInput: string, endsAtInput: string) {
    const startsAt = new Date(startsAtInput);
    const endsAt = new Date(endsAtInput);
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        'La fecha de fin debe ser posterior a la de inicio',
      );
    }
    return { startsAt, endsAt };
  }

  private resyncBot(): void {
    this.eventBus.publish(EVENT_TYPES.BUSINESS_INFO_CHANGED, {
      source: 'events',
    });
  }
}
