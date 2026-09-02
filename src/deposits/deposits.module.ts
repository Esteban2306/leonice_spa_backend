import { Module } from '@nestjs/common';
import { DepositsController } from './deposits.controller';
import { DepositsRepository } from './repositories/deposits.repositories';
import { ManualDepositVerificationStrategy } from './strategies/manual-deposit-verification.strategy';
import { AutomaticDepositVerificationStrategy } from './strategies/automatic-deposit-verification.strategy';
import { SubmitDepositProofOrchestrator } from './orchestrator/submit-deposit-proof.orchestrator';
import { ApproveDepositOrchestrator } from './orchestrator/approve-deposit.orchestrator';
import { RejectDepositOrchestrator } from './orchestrator/reject-deposit.orchestrator';
import { ReservationsModule } from '../reservations/reservations.module';
import { DepositsLookupController } from './deposits-lookup.controller';
import { PendingDepositLookupService } from './services/pending-deposit-lookup.service';

@Module({
  imports: [ReservationsModule],
  controllers: [DepositsController, DepositsLookupController],
  providers: [
    DepositsRepository,
    ManualDepositVerificationStrategy,
    AutomaticDepositVerificationStrategy,
    SubmitDepositProofOrchestrator,
    ApproveDepositOrchestrator,
    RejectDepositOrchestrator,
    PendingDepositLookupService,
  ],
})
export class DepositsModule {}
