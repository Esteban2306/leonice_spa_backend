import { ProductOrdersService } from '../product-orders/product-orders.service';
import { orderCode } from '../product-orders/domain/order-pricing';
import { formatPesos } from '../product-orders/domain/order-text';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { ConduitTool } from '../conduit/decorators/conduit-tool.decorator';
import { VerifiedPhone } from '../conduit/decorators/verified-phone.decorator';
import { PendingDepositLookupService } from './services/pending-deposit-lookup.service';
import { SubmitDepositProofOrchestrator } from './orchestrator/submit-deposit-proof.orchestrator';
import { ManualDepositVerificationStrategy } from './strategies/manual-deposit-verification.strategy';
import { CloudinaryService } from '../infrastructure/cloudinary/cloudinary.service';
import { SubmitConduitDepositDto } from './dto/submit-conduit-deposit.dto';
import { assertValidImageDataUri } from './validators/assert-valid-image-data-uri';
import { FindDepositsQueryDto } from './dto/find-deposits-query.dto';
import { DepositsRepository } from './repositories/deposits.repositories';
import { DepositCreditService } from 'src/reservations/service/deposit-credit.service';
import { FindClientCreditsQueryDto } from './dto/find-client-credits-query.dto';

@Controller({ path: 'deposits', version: '1' })
export class DepositsLookupController {
  constructor(
    private readonly lookupService: PendingDepositLookupService,
    private readonly submitOrchestrator: SubmitDepositProofOrchestrator,
    private readonly manualStrategy: ManualDepositVerificationStrategy,
    private readonly cloudinary: CloudinaryService,
    private readonly depositsRepository: DepositsRepository,
    private readonly depositCredit: DepositCreditService,
    private readonly productOrders: ProductOrdersService,
  ) {}

  @Get()
  findMany(@Query() query: FindDepositsQueryDto) {
    return this.depositsRepository.findMany(
      {
        status: query.status,
        method: query.method,
        reservationId: query.reservationId,
        clientId: query.clientId,
      },
      {
        page: query.page,
        pageSize: query.pageSize,
      },
    );
  }

  @Get('credits')
  findCredits(@Query() query: FindClientCreditsQueryDto) {
    return this.depositCredit.summarizeForClient(query.clientId);
  }

  @ConduitTool({ requiresVerifiedContact: true })
  @Get('pending')
  async findPending(@VerifiedPhone() phone: string) {
    const [deposits, order] = await Promise.all([
      this.lookupService.findCandidates(phone).catch((error: unknown) => {
        if (error instanceof NotFoundException) {
          return { clientName: null, candidates: [] };
        }
        throw error;
      }),
      this.productOrders.openOrderFor({ phone, lid: null }),
    ]);
    return {
      ...deposits,
      openProductOrder: order
        ? {
            orderCode: orderCode(order.number),
            status: order.status,
            total:
              order.total === null ? null : formatPesos(Number(order.total)),
          }
        : null,
    };
  }

  @ConduitTool({ requiresVerifiedContact: true })
  @Post('automatic')
  async submitAutomaticProof(
    @Body() dto: SubmitConduitDepositDto,
    @VerifiedPhone() phone: string,
  ) {
    const reservationId =
      dto.reservationId ?? (await this.lookupService.resolveSingle(phone));

    assertValidImageDataUri(dto.imageBase64);
    await this.submitOrchestrator.assertCanSubmit(reservationId, phone);
    const uploaded = await this.cloudinary.uploadDepositProofFromBase64(
      dto.imageBase64,
      reservationId,
    );

    return this.submitOrchestrator.execute({
      strategy: this.manualStrategy,
      reservationId,
      phone,
      preUploadedImage: uploaded,
    });
  }
}
