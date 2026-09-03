import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { CategoriesRepository } from './categories/categories.repository';
import { TreatmentsController } from './treatments/treatments.controller';
import { TreatmentsService } from './treatments/treatments.service';
import { TreatmentsRepository } from './treatments/treatments.repository';
import { CapacityPoolsController } from './capacity-pools/capacity-pools.controller';
import { CapacityPoolsService } from './capacity-pools/capacity-pools.service';
import { CapacityPoolsRepository } from './capacity-pools/capacity-pools.repository';
import { PromotionsModule } from 'src/promotions/promotions.module';

@Module({
  imports: [PromotionsModule],
  controllers: [
    CategoriesController,
    TreatmentsController,
    CapacityPoolsController,
  ],
  providers: [
    CategoriesService,
    CategoriesRepository,
    TreatmentsService,
    TreatmentsRepository,
    CapacityPoolsService,
    CapacityPoolsRepository,
  ],
  exports: [CategoriesService, TreatmentsService],
})
export class CatalogModule {}
