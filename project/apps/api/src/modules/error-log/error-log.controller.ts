import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ErrorLogService } from './error-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { buildClientLogEntry } from './error-log.sanitize';
import { ResolveErrorLogDto } from './dto/resolve-error-log.dto';

@Controller('error-logs')
@UseGuards(JwtAuthGuard)
export class ErrorLogController {
  constructor(private readonly errorLogService: ErrorLogService) {}

  // PR-1: Hata logları + stack trace + metadata hassas → yalnız ADMIN okuyabilir.
  @Get()
  @UseGuards(AdminGuard)
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
  @UseGuards(AdminGuard)
  async getStats(@Request() req: any) {
    return this.errorLogService.getStats(req.user.tenantId);
  }

  @Post(':id/resolve')
  @UseGuards(AdminGuard)
  async resolve(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: ResolveErrorLogDto,
  ) {
    // PR-1: resolvedBy AUTH oturumundan alınır (spoof engeli).
    // PR-6A: resolution ZORUNLU + trim>=10 → DTO + global ValidationPipe (transform/validate).
    return this.errorLogService.resolve(id, req.user.id, dto.resolution);
  }

  // PR-1: Dış istemci/frontend endpoint'i — JwtAuthGuard yeterli (ADMIN gerekmez), AMA gövde
  // sertleştirilir: source DAİMA FRONTEND, level ERROR/WARN, tenantId/userId AUTH'tan,
  // metadata whitelist+sanitize, ham body YAZILMAZ. (buildClientLogEntry içinde.)
  @Post('log')
  async logError(@Request() req: any, @Body() body: any) {
    return this.errorLogService.log(
      buildClientLogEntry(body, { tenantId: req.user.tenantId, userId: req.user.id }),
    );
  }
}
