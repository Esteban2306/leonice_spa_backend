import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../infrastructure/queue/queue.constants';
import { NOTICE_JOB_OPTIONS } from '../automation/domain/operational-notifications.constants';

interface CompletedVisit {
  id: string;
  clientId: string;
  comboGroupId: string | null;
}

@Injectable()
export class PromoEventTicketsService {
  private readonly logger = new Logger(PromoEventTicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.AUTOMATION_COMMUNICATIONS)
    private readonly queue: Queue,
  ) {}

  async issueForCompletedReservation(reservationId: string): Promise<number[]> {
    const reservation = await this.prisma.client.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        clientId: true,
        comboGroupId: true,
        status: true,
        completedAt: true,
      },
    });
    if (
      !reservation ||
      reservation.status !== ReservationStatus.COMPLETADA ||
      !reservation.completedAt
    ) {
      return [];
    }

    const events = await this.prisma.client.promoEvent.findMany({
      where: {
        isActive: true,
        ticketsEnabled: true,
        startsAt: { lte: reservation.completedAt },
        endsAt: { gte: reservation.completedAt },
      },
      select: { id: true },
    });

    const numbers: number[] = [];
    for (const event of events) {
      const ticket = await this.createTicket(event.id, reservation);
      if (!ticket) continue;
      numbers.push(ticket.number);
      await this.queue.add(
        JOB_NAMES.NOTIFY_CLIENT_EVENT_TICKET,
        { ticketId: ticket.id },
        { ...NOTICE_JOB_OPTIONS, jobId: `event-ticket-${ticket.id}` },
      );
    }
    return numbers;
  }

  private async createTicket(eventId: string, visit: CompletedVisit) {
    const visitKey = visit.comboGroupId ?? visit.id;
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const existing = await tx.eventTicket.findUnique({
          where: { eventId_visitKey: { eventId, visitKey } },
          select: { id: true },
        });
        if (existing) return null;
        const counter = await tx.promoEvent.update({
          where: { id: eventId },
          data: { nextTicketNumber: { increment: 1 } },
          select: { nextTicketNumber: true },
        });
        return tx.eventTicket.create({
          data: {
            eventId,
            clientId: visit.clientId,
            reservationId: visit.id,
            visitKey,
            number: counter.nextTicketNumber - 1,
          },
          select: { id: true, number: true },
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(
          `La visita ${visitKey} ya tenía boleta en el evento ${eventId}`,
        );
        return null;
      }
      throw error;
    }
  }
}
