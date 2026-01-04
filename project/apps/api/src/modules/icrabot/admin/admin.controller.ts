/**
 * ADMIN CONTROLLER (v12)
 * 
 * Recipe, params, UI map, job monitor, audit API endpoints.
 */

import {
  Controller,
  Get,
  Put,
  Post,
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
import { AdminService } from './admin.service';
import { JobMonitorService } from './job-monitor.service';
import { AuditReportService } from './audit-report.service';
import { AdminRole } from '../config/admin-panel.config';
import { JobFilter, JobStatus } from '../config/job-monitor.config';
import { AuditExportOptions } from '../config/audit-report.config';

@Controller('icrabot/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private jobMonitorService: JobMonitorService,
    private auditReportService: AuditReportService,
  ) {}

  // ==================== RECIPES ====================

  @Get('recipes')
  async getRecipes(@Req() req: any) {
    const tenantId = req.user.tenantId;
    this.adminService.checkPermission(req.user.role as AdminRole, 'recipe.read');
    return this.adminService.getRecipes(tenantId);
  }

  @Get('recipes/:id')
  async getRecipe(@Param('id') recipeId: string, @Req() req: any) {
    const tenantId = req.user.tenantId;
    this.adminService.checkPermission(req.user.role as AdminRole, 'recipe.read');
    return this.adminService.getRecipe(recipeId, tenantId);
  }

  @Post('recipes/:id/enable')
  async enableRecipe(@Param('id') recipeId: string, @Req() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'recipe.enable');
    await this.adminService.enableRecipe(recipeId, tenantId, userId);
    return { success: true };
  }

  @Post('recipes/:id/disable')
  async disableRecipe(@Param('id') recipeId: string, @Req() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'recipe.disable');
    await this.adminService.disableRecipe(recipeId, tenantId, userId);
    return { success: true };
  }

  @Post('recipes/:id/rollback')
  async rollbackRecipe(
    @Param('id') recipeId: string,
    @Body('targetVersion') targetVersion: number,
    @Req() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'recipe.rollback');
    await this.adminService.rollbackRecipe(recipeId, targetVersion, tenantId, userId);
    return { success: true };
  }

  // ==================== PARAMS ====================

  @Get('params')
  async getParamsBundles(@Req() req: any) {
    const tenantId = req.user.tenantId;
    this.adminService.checkPermission(req.user.role as AdminRole, 'params.read');
    return this.adminService.getParamsBundles(tenantId);
  }

  @Put('params/:bundle')
  async updateParamsBundle(
    @Param('bundle') bundleId: string,
    @Body('content') content: Record<string, unknown>,
    @Req() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'params.write');
    await this.adminService.updateParamsBundle(bundleId, content, tenantId, userId);
    return { success: true };
  }

  @Post('params/:bundle/approve')
  async approveParamsBundle(@Param('bundle') bundleId: string, @Req() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'params.approve');
    await this.adminService.approveParamsBundle(bundleId, tenantId, userId);
    return { success: true };
  }

  @Post('params/:bundle/activate')
  async activateParamsBundle(@Param('bundle') bundleId: string, @Req() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'params.approve');
    await this.adminService.activateParamsBundle(bundleId, tenantId, userId);
    return { success: true };
  }

  // ==================== LOCKS ====================

  @Post('locks/:lockType/request-override')
  async requestLockOverride(
    @Param('lockType') lockType: string,
    @Body('caseId') caseId: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'lock.request_override');
    return this.adminService.requestLockOverride(lockType, caseId, reason, tenantId, userId);
  }

  @Post('locks/requests/:requestId/approve')
  async approveLockOverride(
    @Param('requestId') requestId: string,
    @Body('note') note: string,
    @Req() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'lock.approve_override');
    await this.adminService.approveLockOverride(requestId, tenantId, userId, note);
    return { success: true };
  }

  // ==================== JOBS ====================

  @Get('jobs')
  async getJobs(
    @Query('caseId') caseId: string,
    @Query('debtorId') debtorId: string,
    @Query('recipeId') recipeId: string,
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: any,
  ) {
    const tenantId = req.user.tenantId;
    this.adminService.checkPermission(req.user.role as AdminRole, 'job.read');

    const filter: JobFilter = {
      tenantId,
      ...(caseId && { caseId }),
      ...(debtorId && { debtorId }),
      ...(recipeId && { recipeId }),
      ...(status && { status: status.split(',') as JobStatus[] }),
    };

    return this.jobMonitorService.getJobs(
      filter,
      parseInt(page) || 1,
      parseInt(pageSize) || 50,
    );
  }

  @Get('jobs/:id')
  async getJob(@Param('id') jobId: string, @Req() req: any) {
    const tenantId = req.user.tenantId;
    this.adminService.checkPermission(req.user.role as AdminRole, 'job.read');
    return this.jobMonitorService.getJob(jobId, tenantId);
  }

  @Post('jobs/:id/retry')
  async retryJob(@Param('id') jobId: string, @Req() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'job.retry');
    await this.jobMonitorService.retryJob(jobId, tenantId, userId);
    return { success: true };
  }

  @Post('cases/:id/quarantine')
  async quarantineCase(
    @Param('id') caseId: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'job.quarantine');
    await this.jobMonitorService.quarantineCase(caseId, tenantId, userId, reason);
    return { success: true };
  }

  @Post('cases/:id/unquarantine')
  async unquarantineCase(@Param('id') caseId: string, @Req() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'job.quarantine');
    await this.jobMonitorService.unquarantineCase(caseId, tenantId, userId);
    return { success: true };
  }

  @Get('jobs/metrics')
  async getJobMetrics(@Query('hours') hours: string, @Req() req: any) {
    const tenantId = req.user.tenantId;
    this.adminService.checkPermission(req.user.role as AdminRole, 'job.read');
    return this.jobMonitorService.getJobMetrics(tenantId, parseInt(hours) || 24);
  }

  @Get('jobs/alerts')
  async getJobAlerts(@Req() req: any) {
    const tenantId = req.user.tenantId;
    this.adminService.checkPermission(req.user.role as AdminRole, 'job.read');
    return this.jobMonitorService.checkAlerts(tenantId);
  }

  // ==================== AUDIT ====================

  @Get('audit/:caseId')
  async getAudit(@Param('caseId') caseId: string, @Req() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'audit.read');
    return this.auditReportService.generateAuditPackage(caseId, tenantId, userId);
  }

  @Get('audit/:caseId/timeline')
  async getCaseTimeline(
    @Param('caseId') caseId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: any,
  ) {
    const tenantId = req.user.tenantId;
    this.adminService.checkPermission(req.user.role as AdminRole, 'audit.read');
    return this.auditReportService.getCaseTimeline(caseId, tenantId, {
      ...(from && { from: new Date(from) }),
      ...(to && { to: new Date(to) }),
    });
  }

  @Post('audit/:caseId/export')
  async exportAudit(
    @Param('caseId') caseId: string,
    @Body() options: AuditExportOptions,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    this.adminService.checkPermission(req.user.role as AdminRole, 'audit.export');

    const { data, filename, contentType } = await this.auditReportService.exportAuditPackage(
      caseId,
      tenantId,
      userId,
      options,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(HttpStatus.OK).send(data);
  }

  @Get('audit/:caseId/evidence')
  async getEvidence(
    @Param('caseId') caseId: string,
    @Query('snapshotId') snapshotId: string,
    @Req() req: any,
  ) {
    const tenantId = req.user.tenantId;
    this.adminService.checkPermission(req.user.role as AdminRole, 'audit.read');
    return this.auditReportService.getEvidence(caseId, tenantId, snapshotId);
  }

  // ==================== CHANGE LOG ====================

  @Get('changelog')
  async getChangeLog(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Query('performedBy') performedBy: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: any,
  ) {
    const tenantId = req.user.tenantId;
    this.adminService.checkPermission(req.user.role as AdminRole, 'audit.read');
    return this.adminService.getChangeLog(tenantId, {
      ...(entityType && { entityType }),
      ...(entityId && { entityId }),
      ...(performedBy && { performedBy }),
      ...(from && { from: new Date(from) }),
      ...(to && { to: new Date(to) }),
    });
  }
}
