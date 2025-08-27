import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Execution, ExecutionData, Workflow, WorkflowNode } from '../entities';
import { QueueService } from './queue.service';
import { WorkflowProcessor } from './processors/workflow.processor';
import { NodeProcessor } from './processors/node.processor';
import { ExecutionProcessor } from './processors/execution.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Execution, ExecutionData, Workflow, WorkflowNode]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: 'workflow-execution' },
      { name: 'node-execution' },
      { name: 'scheduled-workflows' },
      { name: 'webhook-triggers' },
    ),
  ],
  providers: [
    QueueService,
    WorkflowProcessor,
    NodeProcessor,
    ExecutionProcessor,
  ],
  exports: [QueueService],
})
export class QueueModule {}