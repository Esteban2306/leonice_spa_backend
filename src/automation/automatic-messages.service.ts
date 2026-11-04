import { Injectable } from '@nestjs/common';
import {
  AutomationExecutionResult,
  AutomationExecutionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { ListAutomaticMessagesQueryDto } from './dto/list-automatic-messages-query.dto';

const KIND_TYPES = {
  REMINDER: AutomationExecutionType.RESERVATION_REMINDER,
  FOLLOW_UP: AutomationExecutionType.REACTIVATION,
} as const;

export interface AutomaticMessageView {
  id: string;
  kind: 'REMINDER' | 'FOLLOW_UP';
  result: AutomationExecutionResult;
  reason: string | null;
  errorMessage: string | null;
  executedAt: Date;
  clientId: string | null;
  clientName: string | null;
  target: string | null;
  templateCode: string | null;
}

@Injectable()
export class AutomaticMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAutomaticMessagesQueryDto) {
    const where: Prisma.AutomationExecutionWhereInput = {
      type: query.kind
        ? KIND_TYPES[query.kind]
        : { in: Object.values(KIND_TYPES) },
      ...(query.result && { result: query.result }),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.automationExecution.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.automationExecution.count({ where }),
    ]);

    const clientIds = [
      ...new Set(rows.map((row) => row.clientId).filter(Boolean)),
    ] as string[];
    const ruleIds = [
      ...new Set(rows.map((row) => row.automationRuleId).filter(Boolean)),
    ] as string[];
    const [clients, rules] = await Promise.all([
      this.prisma.client.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, name: true },
      }),
      this.prisma.client.automationRule.findMany({
        where: { id: { in: ruleIds } },
        select: {
          id: true,
          templateCode: true,
          treatment: { select: { name: true } },
          category: { select: { name: true } },
        },
      }),
    ]);
    const clientName = new Map(clients.map((item) => [item.id, item.name]));
    const ruleById = new Map(rules.map((item) => [item.id, item]));

    const data: AutomaticMessageView[] = rows.map((row) => {
      const rule = row.automationRuleId
        ? ruleById.get(row.automationRuleId)
        : undefined;
      return {
        id: row.id,
        kind:
          row.type === AutomationExecutionType.RESERVATION_REMINDER
            ? 'REMINDER'
            : 'FOLLOW_UP',
        result: row.result,
        reason: row.reason,
        errorMessage: row.errorMessage,
        executedAt: row.executedAt,
        clientId: row.clientId,
        clientName: row.clientId
          ? (clientName.get(row.clientId) ?? null)
          : null,
        target: rule?.treatment?.name ?? rule?.category?.name ?? null,
        templateCode: rule?.templateCode ?? null,
      };
    });

    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
