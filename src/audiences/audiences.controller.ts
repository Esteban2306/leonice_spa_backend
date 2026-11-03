import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AudiencesService } from './audiences.service';
import { PreviewAudienceDto } from './dto/audience-filter.dto';

@Controller({ path: 'audiences', version: '1' })
export class AudiencesController {
  constructor(private readonly audiences: AudiencesService) {}

  @HttpCode(HttpStatus.OK)
  @Post('preview')
  preview(@Body() dto: PreviewAudienceDto) {
    return this.audiences.preview(dto.filter, dto.marketing ?? true);
  }
}
