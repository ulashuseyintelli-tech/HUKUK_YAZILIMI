import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get('logs')
  async getLogs(
    @Req() req: any,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.getLogs(
      req.user.tenantId,
      {
        action,
        entityType,
        entityId,
        userId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get('entity-history')
  async getEntityHistory(
    @Req() req: any,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.auditService.getEntityHistory(req.user.tenantId, entityType, entityId);
  }

  @Get('user-activity')
  async getUserActivity(
    @Req() req: any,
    @Query('userId') userId: string,
    @Query('days') days?: string,
  ) {
    return this.auditService.getUserActivity(
      req.user.tenantId,
      userId,
      days ? parseInt(days) : 30,
    );
  }
}
