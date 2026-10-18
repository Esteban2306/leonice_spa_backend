import { Module } from '@nestjs/common';
import { TestimonialsController } from './testimonials.controller';
import { TestimonialsService } from './testimonials.service';
import { TestimonialsRepository } from './repository/testimonials.repository';

@Module({
  controllers: [TestimonialsController],
  providers: [TestimonialsService, TestimonialsRepository],
})
export class TestimonialsModule {}
