import {
  Body,
  Controller,
  Get,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
  MaxFileSizeValidator,
  FileTypeValidator,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SubmitAutomaticDepositDto } from './dto/submit-automatic-deposit.dto';
import { ApproveDepositDto } from './dto/approve-deposit.dto';
import { RejectDepositDto } from './dto/reject-deposit.dto';
import { SubmitDepositProofOrchestrator } from './orchestrator/submit-deposit-proof.orchestrator';
import { ApproveDepositOrchestrator } from './orchestrator/approve-deposit.orchestrator';
import { RejectDepositOrchestrator } from './orchestrator/reject-deposit.orchestrator';
import { DepositsRepository } from './repositories/deposits.repositories';
import { ManualDepositVerificationStrategy } from './strategies/manual-deposit-verification.strategy';
import { AutomaticDepositVerificationStrategy } from './strategies/automatic-deposit-verification.strategy';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { ConduitToolAuthGuard } from './guards/conduit-tool-auth.guard';
import { SubmitDepositProofDto } from './dto/submit-deposit-proof.dto';
import { assertValidImageDataUri } from './validators/assert-valid-image-data-uri';

const IMAGE_UPLOAD_OPTIONS = {
  storage: memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
};

function imageFileValidationPipe() {
  return new ParseFilePipe({
    validators: [
      new MaxFileSizeValidator({ maxSize: 8 * 1024 * 1024 }),
      new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
    ],
  });
}

@Controller({ path: 'reservations/:id/deposits', version: '1' })
export class DepositsController {
  constructor(
    private readonly submitOrchestrator: SubmitDepositProofOrchestrator,
    private readonly approveOrchestrator: ApproveDepositOrchestrator,
    private readonly rejectOrchestrator: RejectDepositOrchestrator,
    private readonly depositsRepository: DepositsRepository,
    private readonly manualStrategy: ManualDepositVerificationStrategy,
    private readonly automaticStrategy: AutomaticDepositVerificationStrategy,
    private readonly cloudinary: CloudinaryService,
  ) {}
  @Get()
  findAll(@Param('id', ParseUUIDPipe) reservationId: string) {
    return this.depositsRepository.findMany({ reservationId });
  }

  @Get()
  findAllByReservationId(@Param('id', ParseUUIDPipe) reservationId: string) {
    return this.depositsRepository.findAllByReservationId(reservationId);
  }

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('image', IMAGE_UPLOAD_OPTIONS))
  @Post()
  submitProof(
    @Param('id', ParseUUIDPipe) reservationId: string,
    @Body() dto: SubmitDepositProofDto,
    @UploadedFile(imageFileValidationPipe()) file: Express.Multer.File,
  ) {
    return this.submitOrchestrator.execute({
      strategy: this.manualStrategy,
      reservationId,
      phone: dto.phone,
      fileBuffer: file.buffer,
    });
  }

  @UseGuards(ConduitToolAuthGuard)
  @Post('automatic')
  async submitAutomaticProof(
    @Param('id', ParseUUIDPipe) reservationId: string,
    @Body() dto: SubmitAutomaticDepositDto,
  ) {
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

  @Patch('approve')
  approve(
    @Param('id', ParseUUIDPipe) reservationId: string,
    @Body() dto: ApproveDepositDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.approveOrchestrator.execute(
      reservationId,
      user.id,
      dto.coverage,
    );
  }

  @Patch('reject')
  reject(
    @Param('id', ParseUUIDPipe) reservationId: string,
    @Body() dto: RejectDepositDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.rejectOrchestrator.execute(reservationId, user.id, dto.reason);
  }
}
