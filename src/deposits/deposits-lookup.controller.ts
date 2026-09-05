import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ConduitToolAuthGuard } from '../conduit/guards/conduit-tool-auth.guard';
import { PendingDepositLookupService } from './services/pending-deposit-lookup.service';
import { SubmitDepositProofOrchestrator } from './orchestrator/submit-deposit-proof.orchestrator';
import { AutomaticDepositVerificationStrategy } from './strategies/automatic-deposit-verification.strategy';
import { CloudinaryService } from '../infrastructure/cloudinary/cloudinary.service';
import { SubmitAutomaticDepositDto } from './dto/submit-automatic-deposit.dto';
import { assertValidImageDataUri } from './validators/assert-valid-image-data-uri';
import { FindDepositsQueryDto } from './dto/find-deposits-query.dto';
import { DepositsRepository } from './repositories/deposits.repositories';

@Controller({ path: 'deposits', version: '1' })
export class DepositsLookupController {
  constructor(
    private readonly lookupService: PendingDepositLookupService,
    private readonly submitOrchestrator: SubmitDepositProofOrchestrator,
    private readonly automaticStrategy: AutomaticDepositVerificationStrategy,
    private readonly cloudinary: CloudinaryService,
    private readonly depositsRepository: DepositsRepository,
  ) {}

  @Get()
  findMany(@Query() query: FindDepositsQueryDto) {
    return this.depositsRepository.findMany(query);
  }

  @UseGuards(ConduitToolAuthGuard)
  @Get('pending')
  findPending(@Query('phone') phone: string) {
    return this.lookupService.findCandidates(phone);
  }

  @UseGuards(ConduitToolAuthGuard)
  @Post('automatic')
  async submitAutomaticProof(@Body() dto: SubmitAutomaticDepositDto) {
    const reservationId =
      dto.reservationId ?? (await this.lookupService.resolveSingle(dto.phone));

    assertValidImageDataUri(dto.imageBase64);
    const uploaded = await this.cloudinary.uploadDepositProofFromBase64(
      dto.imageBase64,
      reservationId,
    );

    return this.submitOrchestrator.execute({
      strategy: this.automaticStrategy,
      reservationId,
      phone: dto.phone,
      coverage: dto.coverage,
      preUploadedImage: uploaded,
    });
  }
}
