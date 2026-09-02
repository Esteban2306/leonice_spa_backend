import { Injectable } from '@nestjs/common';
import {
  AutomationExecutionResult,
  AutomationExecutionType,
} from '@prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';

interface LogExecutionParams {
  type: AutomationExecutionType;
  result: AutomationExecutionResult;
  reservationId?: string;
  clientId?: string;
  automationRuleId?: string;
  reason?: string;
  errorMessage?: string;
  promotionId?: string;
}

@Injectable()
export class AutomationExecutionRepository {
  constructor(private readonly prisma: PrismaService) {}

  log(params: LogExecutionParams) {
    return this.prisma.client.automationExecution.create({ data: params });
  }

  async hasExecuted(
    type: AutomationExecutionType,
    reservationId: string,
  ): Promise<boolean> {
    const count = await this.prisma.client.automationExecution.count({
      where: {
        type,
        reservationId,
        result: AutomationExecutionResult.EXECUTED,
      },
    });
    return count > 0;
  }

  async hasExecutedForRule(
    type: AutomationExecutionType,
    clientId: string,
    automationRuleId: string,
  ): Promise<boolean> {
    const count = await this.prisma.client.automationExecution.count({
      where: {
        type,
        clientId,
        automationRuleId,
        result: AutomationExecutionResult.EXECUTED,
      },
    });
    return count > 0;
  }
}
