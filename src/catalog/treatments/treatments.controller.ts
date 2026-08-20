import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TreatmentsService } from './treatments.service';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import { FindTreatmentsQueryDto } from './dto/find-treatments-query.dto';
import { Public } from '../../auth/decorators/public.decorator';

@Controller({ path: 'treatments', version: '1' })
export class TreatmentsController {
  constructor(private readonly service: TreatmentsService) {}

  @Public()
  @Get()
  findAll(@Query() query: FindTreatmentsQueryDto) {
    return this.service.findAll(query.categoryId);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTreatmentDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTreatmentDto,
  ) {
    return this.service.update(id, dto);
  }
}
