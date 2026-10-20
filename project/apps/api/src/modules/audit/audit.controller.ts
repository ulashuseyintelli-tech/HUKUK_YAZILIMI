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
    return this.auditService.readStandard(
      req.user.tenantId, req.user.id, 'logs',
      {
        action,
        entityType,
        entityId,
        userId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        page: page ? Number(page) : 1, limit: limit ? Number(limit) : 50,
      },
    );
  }

  @Get('entity-history')
  async getEntityHistory(
    @Req() req: any,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    const result = await this.auditService.readStandard(req.user.tenantId, req.user.id, 'entity', { entityType, entityId });
    return result.logs;
  }

  @Get('user-activity')
  async getUserActivity(
    @Req() req: any,
    @Query('userId') userId: string,
    @Query('days') days?: string,
  ) {
    const result = await this.auditService.readStandard(req.user.tenantId, req.user.id, 'activity', { userId, days: days ? Number(days) : 30 });
    return result.logs;
  }
}
