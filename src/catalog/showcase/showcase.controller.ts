import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { ShowcaseService } from './showcase.service';

@Public()
@Controller({ path: 'showcase', version: '1' })
export class ShowcaseController {
  constructor(private readonly service: ShowcaseService) {}

  @Get('categories')
  listCategories() {
    return this.service.listCategories();
  }

  @Get('categories/:categorySlug')
  getCategory(@Param('categorySlug') categorySlug: string) {
    return this.service.getCategory(categorySlug);
  }

  @Get('categories/:categorySlug/treatments/:treatmentSlug')
  getTreatment(
    @Param('categorySlug') categorySlug: string,
    @Param('treatmentSlug') treatmentSlug: string,
  ) {
    return this.service.getTreatment(categorySlug, treatmentSlug);
  }
}
