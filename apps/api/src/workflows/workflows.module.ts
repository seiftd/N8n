import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workflow } from '../entities/workflow.entity';
import { WorkflowNode } from '../entities/workflow-node.entity';
import { WorkflowConnection } from '../entities/workflow-connection.entity';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workflow,
      WorkflowNode,
      WorkflowConnection,
    ]),
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}