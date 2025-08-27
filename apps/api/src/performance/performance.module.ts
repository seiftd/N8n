import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Execution, ExecutionData, Workflow } from '../entities';
import { CachingService } from './caching.service';
import { PerformanceService } from './performance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Execution, ExecutionData, Workflow]),
  ],
  providers: [
    CachingService,
    PerformanceService,
  ],
  exports: [
    CachingService,
    PerformanceService,
  ],
})
export class PerformanceModule {}