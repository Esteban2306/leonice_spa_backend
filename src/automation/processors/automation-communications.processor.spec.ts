import type { Job } from 'bullmq';
import { AutomationExecutionResult } from '@prisma/client';
import { JOB_NAMES } from '../../infrastructure/queue/queue.constants';
import { AutomationCommunicationsProcessor } from './automation-communications.processor';

function build(paused: boolean) {
  const executions = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = {
    notifyClientRescheduled: jest.fn().mockResolvedValue(undefined),
    notifyClientReservationConfirmed: jest.fn().mockResolvedValue(undefined),
    notifyAdminHandoff: jest.fn().mockResolvedValue(undefined),
    notifyAdminReceiptIssue: jest.fn().mockResolvedValue(undefined),
  };
  const conduit = { sendWhatsappMessage: jest.fn() };
  const processor = new AutomationCommunicationsProcessor(
    {} as never,
    conduit as never,
    executions as never,
    {} as never,
    {} as never,
    notifications as never,
    {} as never,
    {} as never,
    {} as never,
    { isPaused: jest.fn().mockResolvedValue(paused) } as never,
  );
  return { processor, executions, notifications, conduit };
}

const job = (name: string, data: object = { reservationId: 'r1' }) =>
  ({ id: 'j1', name, data, timestamp: Date.now(), opts: {} }) as unknown as Job;

describe('AutomationCommunicationsProcessor con el sistema en pausa', () => {
  it('omite los avisos a clientas y lo deja registrado', async () => {
    const { processor, executions, notifications } = build(true);

    await processor.process(job(JOB_NAMES.NOTIFY_CLIENT_RESCHEDULED));
    await processor.process(job(JOB_NAMES.NOTIFY_CLIENT_RESERVATION_CONFIRMED));

    expect(notifications.notifyClientRescheduled).not.toHaveBeenCalled();
    expect(
      notifications.notifyClientReservationConfirmed,
    ).not.toHaveBeenCalled();
    expect(executions.log).toHaveBeenCalledTimes(2);
    expect(executions.log).toHaveBeenCalledWith(
      expect.objectContaining({
        result: AutomationExecutionResult.SKIPPED,
        reservationId: 'r1',
        reason: expect.stringContaining('pausa') as string,
      }),
    );
  });

  it('omite los recordatorios sin consultar la reserva ni enviar', async () => {
    const { processor, executions, conduit } = build(true);

    await processor.process(job(JOB_NAMES.RESERVATION_REMINDER_CHECK));

    expect(conduit.sendWhatsappMessage).not.toHaveBeenCalled();
    expect(executions.log).toHaveBeenCalledWith(
      expect.objectContaining({ result: AutomationExecutionResult.SKIPPED }),
    );
  });

  it('las alertas internas al equipo siguen saliendo', async () => {
    const { processor, executions, notifications } = build(true);

    await processor.process(job(JOB_NAMES.NOTIFY_ADMIN_HANDOFF));

    expect(notifications.notifyAdminHandoff).toHaveBeenCalledTimes(1);
    expect(executions.log).not.toHaveBeenCalled();
  });

  it('el aviso de comprobante al equipo sigue saliendo con el sistema en pausa', async () => {
    const { processor, executions, notifications } = build(true);

    await processor.process(job(JOB_NAMES.NOTIFY_ADMIN_RECEIPT_ISSUE));

    expect(notifications.notifyAdminReceiptIssue).toHaveBeenCalledTimes(1);
    expect(executions.log).not.toHaveBeenCalled();
  });

  it('sin pausa los avisos a clientas se procesan igual que antes', async () => {
    const { processor, notifications } = build(false);

    await processor.process(job(JOB_NAMES.NOTIFY_CLIENT_RESCHEDULED));

    expect(notifications.notifyClientRescheduled).toHaveBeenCalledTimes(1);
  });
});
