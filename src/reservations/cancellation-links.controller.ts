import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { CancellationLinkService } from './service/cancellation-link.service';
import {
  CancellationLinkTokenParamDto,
  CancelWithLinkDto,
} from './dto/cancellation-link.dto';

@Public()
@SkipCsrf()
@Controller({ path: 'cancellation-links', version: '1' })
export class CancellationLinksController {
  constructor(private readonly links: CancellationLinkService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  describe(@Param() params: CancellationLinkTokenParamDto) {
    return this.links.describe(params.token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post(':token/cancel')
  cancel(
    @Param() params: CancellationLinkTokenParamDto,
    @Body() dto: CancelWithLinkDto,
  ) {
    return this.links.cancel(params.token, {
      scope: dto.scope,
      reservationId: dto.reservationId,
      reason: dto.reason,
    });
  }
}
