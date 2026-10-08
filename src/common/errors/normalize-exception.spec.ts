import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { AppException } from './app.exception';
import { ERROR_CATALOG } from './error-catalog';
import { normalizeException } from './normalize-exception';
import { ReviveReservationException } from '../../reservations/domain/revive-reservation.exception';
import { placementRejectionException } from '../../reservations/domain/placement-rejection.exception';
import { InvalidTransitionException } from '../exceptions/invalid-transition.exception';
import { DomainException } from '../exceptions/domain.exception';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('db error', {
    code,
    clientVersion: 'test',
    meta,
  });

describe('normalizeException', () => {
  describe('AppException (catálogo)', () => {
    it('toma status y mensaje por defecto del catálogo', () => {
      expect(
        normalizeException(new AppException('PLACEMENT_NO_CAPACITY')),
      ).toEqual({
        status: HttpStatus.CONFLICT,
        code: 'PLACEMENT_NO_CAPACITY',
        message: ERROR_CATALOG.PLACEMENT_NO_CAPACITY.message,
        details: undefined,
      });
    });

    it('respeta un mensaje específico y los details', () => {
      const result = normalizeException(
        new AppException('RESERVATION_NOT_RESCHEDULABLE', {
          message: 'estado actual: CANCELADA',
          details: { reservationId: 'r1' },
        }),
      );
      expect(result).toMatchObject({
        code: 'RESERVATION_NOT_RESCHEDULABLE',
        message: 'estado actual: CANCELADA',
        details: { reservationId: 'r1' },
      });
    });

    it('las excepciones de dominio migradas exponen su code', () => {
      expect(
        normalizeException(
          new ReviveReservationException(
            'RESERVATION_NOT_REVIVABLE',
            'm',
            'r9',
          ),
        ),
      ).toMatchObject({
        status: 409,
        code: 'RESERVATION_NOT_REVIVABLE',
        details: { reservationId: 'r9' },
      });
      expect(
        normalizeException(placementRejectionException('NO_CAPACITY')).code,
      ).toBe('PLACEMENT_NO_CAPACITY');
      expect(
        normalizeException(
          placementRejectionException('OUTSIDE_OPERATING_HOURS'),
        ),
      ).toMatchObject({
        status: 400,
        code: 'PLACEMENT_OUTSIDE_OPERATING_HOURS',
      });
      expect(
        normalizeException(new InvalidTransitionException('x')),
      ).toMatchObject({
        status: 409,
        code: 'RESERVATION_INVALID_TRANSITION',
        message: 'x',
      });
    });
  });

  describe('excepciones de Nest sin code', () => {
    it.each([
      [
        new NotFoundException('Reserva no encontrada'),
        404,
        'NOT_FOUND',
        'Reserva no encontrada',
      ],
      [
        new UnauthorizedException('SESSION_EXPIRED'),
        401,
        'UNAUTHORIZED',
        'SESSION_EXPIRED',
      ],
      [new ForbiddenException(), 403, 'FORBIDDEN', 'Forbidden'],
      [
        new ConflictException('Ya existe la etiqueta'),
        409,
        'CONFLICT',
        'Ya existe la etiqueta',
      ],
      [
        new DomainException('Regla de dominio'),
        409,
        'CONFLICT',
        'Regla de dominio',
      ],
    ])('%s → %s %s', (exception, status, code, message) => {
      expect(normalizeException(exception)).toMatchObject({
        status,
        code,
        message,
      });
    });

    it('ValidationPipe → VALIDATION_FAILED con la lista de errores en details', () => {
      const exception = new BadRequestException({
        message: [
          'phone must be longer than 10',
          'treatments must be an array',
        ],
        error: 'Bad Request',
        statusCode: 400,
      });
      expect(normalizeException(exception)).toEqual({
        status: 400,
        code: 'VALIDATION_FAILED',
        message: ERROR_CATALOG.VALIDATION_FAILED.message,
        details: {
          errors: [
            'phone must be longer than 10',
            'treatments must be an array',
          ],
        },
      });
    });

    it('cuerpo legado con code del catálogo: aplana y mueve el resto a details', () => {
      const legacy = new ConflictException({
        code: 'RESERVATION_NOT_REVIVABLE',
        message: 'menor al mínimo',
        reservationId: 'r1',
        comboGroupId: 'c1',
      });
      expect(normalizeException(legacy)).toEqual({
        status: 409,
        code: 'RESERVATION_NOT_REVIVABLE',
        message: 'menor al mínimo',
        details: { reservationId: 'r1', comboGroupId: 'c1' },
      });
    });

    it('code fuera del catálogo: genérico por status y conserva el code original en details', () => {
      const unknown = new ConflictException({
        code: 'ALGO_RARO',
        message: 'm',
      });
      expect(normalizeException(unknown)).toEqual({
        status: 409,
        code: 'CONFLICT',
        message: 'm',
        details: { unknownCode: 'ALGO_RARO' },
      });
    });

    it('5xx no filtra el mensaje interno', () => {
      expect(
        normalizeException(
          new InternalServerErrorException('detalle sensible de SQL'),
        ),
      ).toEqual({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: ERROR_CATALOG.INTERNAL_ERROR.message,
      });
    });
  });

  describe('infraestructura', () => {
    it('ThrottlerException → RATE_LIMITED', () => {
      expect(normalizeException(new ThrottlerException())).toMatchObject({
        status: 429,
        code: 'RATE_LIMITED',
      });
    });

    it('Prisma P2002 → UNIQUE_CONSTRAINT_VIOLATION con los campos', () => {
      expect(
        normalizeException(prismaError('P2002', { target: ['phone'] })),
      ).toEqual({
        status: 409,
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        message: ERROR_CATALOG.UNIQUE_CONSTRAINT_VIOLATION.message,
        details: { fields: ['phone'] },
      });
    });

    it('Prisma P2025 → NOT_FOUND', () => {
      expect(normalizeException(prismaError('P2025'))).toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('error desconocido → INTERNAL_ERROR genérico', () => {
      expect(normalizeException(new Error('boom'))).toEqual({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: ERROR_CATALOG.INTERNAL_ERROR.message,
      });
      expect(normalizeException('texto suelto').code).toBe('INTERNAL_ERROR');
    });
  });
});
