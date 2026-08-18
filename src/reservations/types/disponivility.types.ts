import { HeldInterval } from '../domain/availability-calculator';

export type AvailableSlotsType = {
  operatingWindows: { start: Date; end: Date }[];
  held: HeldInterval[];
  durationMinutes: number;
  capacity: number;
  stepMinutes?: number;
};
