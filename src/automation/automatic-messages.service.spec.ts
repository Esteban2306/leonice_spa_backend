import { AutomationExecutionResult } from '@prisma/client';
import type { PrismaService } from '../infrastructure/database/prisma.service';
import { AutomaticMessagesService } from './automatic-messages.service';

const executedAt = new Date('2026-11-10T15:00:00Z');

function build() {
  const rows = [
    {
      id: 'e1',
      type: 'REACTIVATION',
      result: AutomationExecutionResult.SKIPPED,
      reason: 'Recibió otro mensaje de marketing',
      errorMessage: null,
      executedAt,
      clientId: 'c1',
      automationRuleId: 'r1',
    },
    {
      id: 'e2',
      type: 'RESERVATION_REMINDER',
      result: AutomationExecutionResult.EXECUTED,
      reason: null,
      errorMessage: null,
      executedAt,
      clientId: 'c2',
      automationRuleId: null,
    },
  ];
  const prisma = {
    client: {
      $transaction: jest.fn().mockResolvedValue([rows, 2]),
      automationExecution: { findMany: jest.fn(), count: jest.fn() },
      client: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', name: 'Ana' },
          { id: 'c2', name: 'Luz' },
        ]),
      },
      automationRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            templateCode: 'MAINTENANCE_REMINDER',
            treatment: { name: 'Alisado' },
            category: null,
          },
        ]),
      },
    },
  };
  return new AutomaticMessagesService(prisma as unknown as PrismaService);
}

describe('AutomaticMessagesService.list', () => {
  it('une cada envío con el nombre de la clienta y el tratamiento de su regla', async () => {
    const result = await build().list({ page: 1, pageSize: 25 });
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'e1',
        kind: 'FOLLOW_UP',
        clientName: 'Ana',
        target: 'Alisado',
        templateCode: 'MAINTENANCE_REMINDER',
        reason: 'Recibió otro mensaje de marketing',
      }),
      expect.objectContaining({
        id: 'e2',
        kind: 'REMINDER',
        clientName: 'Luz',
        target: null,
      }),
    ]);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 25,
      total: 2,
      totalPages: 1,
    });
  });
});
