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
import { CapacityPoolsService } from './capacity-pools.service';
import { CreateCapacityPoolDto } from './dto/create-capacity-pool.dto';
import { UpdateCapacityPoolDto } from './dto/update-capacity-pool.dto';
import { FindCapacityPoolsQueryDto } from './dto/find-capacity-pools-query.dto';

@Controller({ path: 'capacity-pools', version: '1' })
export class CapacityPoolsController {
  constructor(private readonly service: CapacityPoolsService) {}

  @Get()
  findByCategory(@Query() query: FindCapacityPoolsQueryDto) {
    return this.service.findByCategory(query.categoryId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCapacityPoolDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCapacityPoolDto,
  ) {
    return this.service.update(id, dto);
  }
}
