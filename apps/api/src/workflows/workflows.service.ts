import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { Workflow, WorkflowStatus } from '../entities/workflow.entity';
import { WorkflowNode } from '../entities/workflow-node.entity';
import { WorkflowConnection } from '../entities/workflow-connection.entity';
import { User } from '../entities/user.entity';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  CreateWorkflowNodeDto,
  UpdateWorkflowNodeDto,
} from './dto';

export interface WorkflowListQuery {
  page?: number;
  limit?: number;
  status?: WorkflowStatus;
  search?: string;
  isTemplate?: boolean;
}

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
    @InjectRepository(WorkflowNode)
    private readonly workflowNodeRepository: Repository<WorkflowNode>,
    @InjectRepository(WorkflowConnection)
    private readonly workflowConnectionRepository: Repository<WorkflowConnection>,
  ) {}

  async create(createWorkflowDto: CreateWorkflowDto, user: User): Promise<Workflow> {
    const workflow = this.workflowRepository.create({
      ...createWorkflowDto,
      owner: user,
      ownerId: user.id,
      status: createWorkflowDto.status || WorkflowStatus.DRAFT,
    });

    return this.workflowRepository.save(workflow);
  }

  async findAll(user: User, query: WorkflowListQuery = {}): Promise<{
    workflows: Workflow[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      isTemplate,
    } = query;

    const queryBuilder = this.workflowRepository
      .createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.owner', 'owner')
      .where('workflow.ownerId = :userId', { userId: user.id });

    if (status) {
      queryBuilder.andWhere('workflow.status = :status', { status });
    }

    if (isTemplate !== undefined) {
      queryBuilder.andWhere('workflow.isTemplate = :isTemplate', { isTemplate });
    }

    if (search) {
      queryBuilder.andWhere(
        '(workflow.name ILIKE :search OR workflow.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    queryBuilder
      .orderBy('workflow.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [workflows, total] = await queryBuilder.getManyAndCount();

    return {
      workflows,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string, user: User): Promise<Workflow> {
    const workflow = await this.workflowRepository.findOne({
      where: { id, ownerId: user.id },
      relations: ['nodes', 'connections'],
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return workflow;
  }

  async update(id: string, updateWorkflowDto: UpdateWorkflowDto, user: User): Promise<Workflow> {
    const workflow = await this.findOne(id, user);

    Object.assign(workflow, updateWorkflowDto);
    workflow.version += 1;

    return this.workflowRepository.save(workflow);
  }

  async remove(id: string, user: User): Promise<void> {
    const workflow = await this.findOne(id, user);
    await this.workflowRepository.remove(workflow);
  }

  async duplicate(id: string, user: User, name?: string): Promise<Workflow> {
    const originalWorkflow = await this.workflowRepository.findOne({
      where: { id, ownerId: user.id },
      relations: ['nodes', 'connections'],
    });

    if (!originalWorkflow) {
      throw new NotFoundException('Workflow not found');
    }

    // Create new workflow
    const duplicatedWorkflow = this.workflowRepository.create({
      name: name || `${originalWorkflow.name} (Copy)`,
      description: originalWorkflow.description,
      settings: originalWorkflow.settings,
      staticData: originalWorkflow.staticData,
      tags: originalWorkflow.tags,
      status: WorkflowStatus.DRAFT,
      ownerId: user.id,
    });

    const savedWorkflow = await this.workflowRepository.save(duplicatedWorkflow);

    // Duplicate nodes
    if (originalWorkflow.nodes?.length) {
      const nodeMap = new Map<string, string>();
      
      for (const node of originalWorkflow.nodes) {
        const duplicatedNode = this.workflowNodeRepository.create({
          name: node.name,
          type: node.type,
          description: node.description,
          position: node.position,
          parameters: node.parameters,
          credentials: node.credentials,
          disabled: node.disabled,
          continueOnFail: node.continueOnFail,
          retryOnFail: node.retryOnFail,
          waitBetweenTries: node.waitBetweenTries,
          alwaysOutputData: node.alwaysOutputData,
          notes: node.notes,
          workflowId: savedWorkflow.id,
        });

        const savedNode = await this.workflowNodeRepository.save(duplicatedNode);
        nodeMap.set(node.id, savedNode.id);
      }

      // Duplicate connections
      if (originalWorkflow.connections?.length) {
        for (const connection of originalWorkflow.connections) {
          const newSourceNodeId = nodeMap.get(connection.sourceNodeId);
          const newTargetNodeId = nodeMap.get(connection.targetNodeId);

          if (newSourceNodeId && newTargetNodeId) {
            const duplicatedConnection = this.workflowConnectionRepository.create({
              sourceNodeId: newSourceNodeId,
              targetNodeId: newTargetNodeId,
              sourceOutputIndex: connection.sourceOutputIndex,
              targetInputIndex: connection.targetInputIndex,
              workflowId: savedWorkflow.id,
            });

            await this.workflowConnectionRepository.save(duplicatedConnection);
          }
        }
      }
    }

    return this.findOne(savedWorkflow.id, user);
  }

  async activate(id: string, user: User): Promise<Workflow> {
    const workflow = await this.findOne(id, user);
    
    // Validate workflow before activation
    await this.validateWorkflow(workflow);
    
    workflow.status = WorkflowStatus.ACTIVE;
    return this.workflowRepository.save(workflow);
  }

  async deactivate(id: string, user: User): Promise<Workflow> {
    const workflow = await this.findOne(id, user);
    workflow.status = WorkflowStatus.INACTIVE;
    return this.workflowRepository.save(workflow);
  }

  private async validateWorkflow(workflow: Workflow): Promise<void> {
    if (!workflow.nodes || workflow.nodes.length === 0) {
      throw new BadRequestException('Workflow must have at least one node');
    }

    // Check for trigger nodes
    const triggerNodes = workflow.nodes.filter(node => 
      node.type.endsWith('-trigger')
    );

    if (triggerNodes.length === 0) {
      throw new BadRequestException('Workflow must have at least one trigger node');
    }

    // Additional validation logic can be added here
  }

  // Node management methods
  async addNode(workflowId: string, createNodeDto: CreateWorkflowNodeDto, user: User): Promise<WorkflowNode> {
    const workflow = await this.findOne(workflowId, user);
    
    const node = this.workflowNodeRepository.create({
      ...createNodeDto,
      workflowId: workflow.id,
    });

    return this.workflowNodeRepository.save(node);
  }

  async updateNode(workflowId: string, nodeId: string, updateNodeDto: UpdateWorkflowNodeDto, user: User): Promise<WorkflowNode> {
    await this.findOne(workflowId, user); // Verify access

    const node = await this.workflowNodeRepository.findOne({
      where: { id: nodeId, workflowId },
    });

    if (!node) {
      throw new NotFoundException('Node not found');
    }

    Object.assign(node, updateNodeDto);
    return this.workflowNodeRepository.save(node);
  }

  async removeNode(workflowId: string, nodeId: string, user: User): Promise<void> {
    await this.findOne(workflowId, user); // Verify access

    const node = await this.workflowNodeRepository.findOne({
      where: { id: nodeId, workflowId },
    });

    if (!node) {
      throw new NotFoundException('Node not found');
    }

    // Remove connections involving this node
    await this.workflowConnectionRepository.delete({
      workflowId,
      sourceNodeId: nodeId,
    });

    await this.workflowConnectionRepository.delete({
      workflowId,
      targetNodeId: nodeId,
    });

    await this.workflowNodeRepository.remove(node);
  }
}