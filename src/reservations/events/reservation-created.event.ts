import { Reservation } from '@prisma/client';
export class ReservationCreatedEvent {
  constructor(public readonly reservation: Reservation) {}
}
