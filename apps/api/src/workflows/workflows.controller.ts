import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { WorkflowsService, WorkflowListQuery } from './workflows.service';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  CreateWorkflowNodeDto,
  UpdateWorkflowNodeDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { User } from '../entities/user.entity';

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  create(@Body() createWorkflowDto: CreateWorkflowDto, @CurrentUser() user: User) {
    return this.workflowsService.create(createWorkflowDto, user);
  }

  @Get()
  findAll(@CurrentUser() user: User, @Query() query: WorkflowListQuery) {
    return this.workflowsService.findAll(user, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.workflowsService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
    @CurrentUser() user: User,
  ) {
    return this.workflowsService.update(id, updateWorkflowDto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.workflowsService.remove(id, user);
  }

  @Post(':id/duplicate')
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('name') name: string,
    @CurrentUser() user: User,
  ) {
    return this.workflowsService.duplicate(id, user, name);
  }

  @Post(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.workflowsService.activate(id, user);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.workflowsService.deactivate(id, user);
  }

  // Node management endpoints
  @Post(':id/nodes')
  addNode(
    @Param('id', ParseUUIDPipe) workflowId: string,
    @Body() createNodeDto: CreateWorkflowNodeDto,
    @CurrentUser() user: User,
  ) {
    return this.workflowsService.addNode(workflowId, createNodeDto, user);
  }

  @Patch(':id/nodes/:nodeId')
  updateNode(
    @Param('id', ParseUUIDPipe) workflowId: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @Body() updateNodeDto: UpdateWorkflowNodeDto,
    @CurrentUser() user: User,
  ) {
    return this.workflowsService.updateNode(workflowId, nodeId, updateNodeDto, user);
  }

  @Delete(':id/nodes/:nodeId')
  removeNode(
    @Param('id', ParseUUIDPipe) workflowId: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @CurrentUser() user: User,
  ) {
    return this.workflowsService.removeNode(workflowId, nodeId, user);
  }
}