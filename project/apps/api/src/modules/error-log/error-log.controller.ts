import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ErrorLogService } from './error-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('error-logs')
@UseGuards(JwtAuthGuard)
export class ErrorLogController {
  constructor(private readonly errorLogService: ErrorLogService) {}

  @Get()
  async getLogs(
    @Request() req: any,
    @Query('level') level?: string,
    @Query('source') source?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.errorLogService.getLogs(req.user.tenantId, {
      level,
      source,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get('stats')
  async getStats(@Request() req: any) {
    return this.errorLogService.getStats(req.user.tenantId);
  }

  @Post(':id/resolve')
  async resolve(
    @Param('id') id: string,
    @Body() body: { userId: string; resolution: string },
  ) {
    return this.errorLogService.resolve(id, body.userId, body.resolution);
  }

  @Post('log')
  async logError(@Request() req: any, @Body() body: any) {
    return this.errorLogService.log({ ...body, tenantId: req.user.tenantId });
  }
}
