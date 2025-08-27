import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ExecutionData, Execution, Workflow, WorkflowNode } from '../entities';
import { ExecutionEngine } from './execution-engine.service';
import { NodeExecutorService } from './node-executor.service';
import { WorkflowValidatorService } from './workflow-validator.service';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([ExecutionData, Execution, Workflow, WorkflowNode]),
  ],
  providers: [
    ExecutionEngine,
    NodeExecutorService,
    WorkflowValidatorService,
  ],
  exports: [
    ExecutionEngine,
    NodeExecutorService,
    WorkflowValidatorService,
  ],
})
export class ExecutionEngineModule {}