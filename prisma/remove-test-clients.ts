import { PrismaClient } from '@prisma/client';

const APPLY_FLAG = '--apply';
const PHONES_FLAG = '--phones=';
const MAX_CLIENTS = 5;

export interface TestClientsOutcome {
  clients: Array<{ id: string; name: string; phone: string }>;
  counts: Record<string, number>;
  deleted: boolean;
}

const digits = (value: string) => value.replace(/\D/g, '');

export async function listClients(prisma: PrismaClient) {
  const clients = await prisma.client.findMany({
    select: {
      name: true,
      phone: true,
      createdAt: true,
      _count: { select: { reservations: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return clients.map((client) => ({
    name: client.name,
    phone: client.phone,
    createdAt: client.createdAt,
    reservations: client._count.reservations,
  }));
}

async function teamQuotesTableExists(prisma: PrismaClient) {
  const [row] = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public.team_quotes') IS NOT NULL AS "exists"`;
  return row?.exists === true;
}

export async function removeTestClients(
  prisma: PrismaClient,
  options: { phones: string[]; apply: boolean },
): Promise<TestClientsOutcome> {
  const wanted = options.phones.map(digits).filter((p) => p.length >= 7);
  if (wanted.length === 0) throw new Error('No diste ningún teléfono válido.');
  if (wanted.length > MAX_CLIENTS) {
    throw new Error(`Por seguridad, máximo ${MAX_CLIENTS} clientas por vez.`);
  }

  const clients: TestClientsOutcome['clients'] = [];
  for (const phone of wanted) {
    const matches = await prisma.client.findMany({
      where: { phone: { endsWith: phone.slice(-10) } },
      select: { id: true, name: true, phone: true },
    });
    if (matches.length !== 1) {
      throw new Error(
        `El teléfono ${phone} coincide con ${matches.length} clientas: no se borra nada.`,
      );
    }
    clients.push(matches[0]);
  }

  const clientIds = clients.map((c) => c.id);
  const reservationIds = (
    await prisma.reservation.findMany({
      where: { clientId: { in: clientIds } },
      select: { id: true },
    })
  ).map((r) => r.id);
  const byReservation = { reservationId: { in: reservationIds } };
  const byClient = { clientId: { in: clientIds } };
  const quotes = await teamQuotesTableExists(prisma);
  const quoteWhere = {
    OR: [{ phone: { in: clients.map((c) => c.phone) } }, byReservation],
  };

  const counts: Record<string, number> = {
    reservas: reservationIds.length,
    anticipos: await prisma.depositRecord.count({ where: byReservation }),
    pagos: await prisma.reservationPayment.count({ where: byReservation }),
    facturasSiigo: await prisma.siigoSync.count({ where: byReservation }),
    boletas: await prisma.eventTicket.count({ where: byClient }),
    consentimientos: await prisma.consentRecord.count({ where: byClient }),
    vistasDeProductos: await prisma.productViewLog.count({ where: byClient }),
    automatizaciones: await prisma.automationExecution.count({
      where: { OR: [byClient, byReservation] },
    }),
    campañas: await prisma.campaignRecipient.count({ where: byClient }),
    preciosDelEquipo: quotes
      ? await prisma.teamQuote.count({ where: quoteWhere })
      : 0,
  };

  if (!options.apply) return { clients, counts, deleted: false };

  await prisma.$transaction(
    async (tx) => {
      await tx.reservationPayment.deleteMany({ where: byReservation });
      await tx.siigoSync.deleteMany({ where: byReservation });
      await tx.depositRecord.deleteMany({ where: byReservation });
      await tx.eventTicket.deleteMany({ where: byClient });
      await tx.automationExecution.deleteMany({
        where: { OR: [byClient, byReservation] },
      });
      await tx.campaignRecipient.deleteMany({ where: byClient });
      if (quotes) await tx.teamQuote.deleteMany({ where: quoteWhere });
      await tx.reservation.updateMany({
        where: { rescheduledFromId: { in: reservationIds } },
        data: { rescheduledFromId: null },
      });
      await tx.reservation.deleteMany({
        where: { id: { in: reservationIds } },
      });
      await tx.consentRecord.deleteMany({ where: byClient });
      await tx.productViewLog.deleteMany({ where: byClient });
      await tx.client.deleteMany({ where: { id: { in: clientIds } } });
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
  return { clients, counts, deleted: true };
}

async function main() {
  const apply = process.argv.includes(APPLY_FLAG);
  const phonesArg = process.argv.find((arg) => arg.startsWith(PHONES_FLAG));
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const target = new URL(process.env.DATABASE_URL ?? '');
    console.log(
      `[clientas] Base de datos: ${target.hostname}:${target.port}${target.pathname}`,
    );

    if (!phonesArg) {
      const clients = await listClients(prisma);
      console.log(`[clientas] Hay ${clients.length} clientas:`);
      for (const client of clients) {
        console.log(
          `  ${client.name} · ${client.phone} · ${client.reservations} reservas · desde ${client.createdAt.toISOString().slice(0, 10)}`,
        );
      }
      console.log(
        `[clientas] Para borrar: ${PHONES_FLAG}TEL1,TEL2 (simulación) y luego añade ${APPLY_FLAG}.`,
      );
      return;
    }

    const outcome = await removeTestClients(prisma, {
      phones: phonesArg.slice(PHONES_FLAG.length).split(','),
      apply,
    });
    for (const client of outcome.clients) {
      console.log(`[clientas] ${client.name} · ${client.phone}`);
    }
    console.log(
      `[clientas] Con ellas ${outcome.deleted ? 'se borró' : 'se borraría'}: ${Object.entries(
        outcome.counts,
      )
        .map(([name, count]) => `${name} ${count}`)
        .join(', ')}.`,
    );
    if (!outcome.deleted) {
      console.log(
        `[clientas] Simulación: añade ${APPLY_FLAG} para borrarlas. No se puede deshacer.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
