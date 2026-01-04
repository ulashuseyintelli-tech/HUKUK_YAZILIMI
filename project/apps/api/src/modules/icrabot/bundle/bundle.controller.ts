/**
 * BUNDLE CONTROLLER (v14-v16)
 * 
 * Recipe/Params/UiMap bundle API endpoints.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BundleService, BundleType, BundleStatus } from './bundle.service';
import { AuditExportService } from '../export/audit-export.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { RecipeRunnerService } from '../runner/recipe-runner.service';

@Controller('icrabot/bundles')
@UseGuards(JwtAuthGuard)
export class BundleController {
  constructor(
    private bundleService: BundleService,
    private auditExportService: AuditExportService,
    private schedulerService: SchedulerService,
    private recipeRunnerService: RecipeRunnerService,
  ) {}

  // ==================== BUNDLE CRUD ====================

  @Get()
  async getBundles(
    @Query('type') type: BundleType,
    @Query('status') status: BundleStatus,
    @Req() req: any,
  ) {
    return this.bundleService.getBundles(req.user.tenantId, type, status);
  }

  @Get(':id')
  async getBundle(@Param('id') id: string, @Req() req: any) {
    return this.bundleService.getBundle(id, req.user.tenantId);
  }

  @Post()
  async createBundle(
    @Body('type') type: BundleType,
    @Body('name') name: string,
    @Body('content') content: string,
    @Body('notes') notes: string,
    @Req() req: any,
  ) {
    return this.bundleService.createBundle(
      type,
      name,
      content,
      req.user.tenantId,
      req.user.id,
      notes,
    );
  }

  @Put(':id')
  async updateBundle(
    @Param('id') id: string,
    @Body('content') content: string,
    @Body('notes') notes: string,
    @Req() req: any,
  ) {
    return this.bundleService.updateBundle(
      id,
      content,
      req.user.tenantId,
      req.user.id,
      notes,
    );
  }

  // ==================== BUNDLE LIFECYCLE ====================

  @Post(':id/approve')
  async approveBundle(@Param('id') id: string, @Req() req: any) {
    return this.bundleService.approveBundle(id, req.user.tenantId, req.user.id);
  }

  @Post(':id/promote')
  async promoteBundle(@Param('id') id: string, @Req() req: any) {
    return this.bundleService.promoteBundle(id, req.user.tenantId, req.user.id);
  }

  @Post(':id/archive')
  async archiveBundle(@Param('id') id: string, @Req() req: any) {
    return this.bundleService.archiveBundle(id, req.user.tenantId);
  }

  @Post(':id/clone')
  async cloneBundle(
    @Param('id') id: string,
    @Body('newName') newName: string,
    @Req() req: any,
  ) {
    return this.bundleService.cloneBundle(id, req.user.tenantId, req.user.id, newName);
  }

  // ==================== VALIDATION ====================

  @Post(':id/validate')
  async validateBundle(@Param('id') id: string, @Req() req: any) {
    const bundle = await this.bundleService.getBundle(id, req.user.tenantId);
    return this.bundleService.validateBundle(bundle.type, bundle.content);
  }

  @Get('validate/active')
  async validateActiveBundles(@Req() req: any) {
    return this.bundleService.validateAllActiveBundles(req.user.tenantId);
  }

  // ==================== AUDIT EXPORT ====================

  @Post('audit-export/:caseId/export')
  async exportCaseAudit(
    @Param('caseId') caseId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { buffer, result } = await this.auditExportService.exportCaseAudit(
      caseId,
      req.user.tenantId,
      req.user.id,
    );

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-Export-Hash', result.hash);
    res.status(HttpStatus.OK).send(buffer);
  }

  @Get('audit-export/:caseId/history')
  async getExportHistory(@Param('caseId') caseId: string, @Req() req: any) {
    return this.auditExportService.getExportHistory(caseId, req.user.tenantId);
  }

  // ==================== SCHEDULER ====================

  @Post('scheduler/tick')
  async triggerSchedulerTick(@Req() req: any) {
    return this.schedulerService.triggerTick(req.user.tenantId);
  }

  @Post('scheduler/process-queue')
  async processQueuedJobs(
    @Query('limit') limit: string,
    @Req() req: any,
  ) {
    const processed = await this.schedulerService.processQueuedJobs(
      req.user.tenantId,
      parseInt(limit) || 10,
    );
    return { processed };
  }

  // ==================== RUNNER ====================

  @Post('runner/run-job/:jobId')
  async runJob(@Param('jobId') jobId: string, @Req() req: any) {
    return this.recipeRunnerService.runJob(jobId, req.user.tenantId);
  }
}
