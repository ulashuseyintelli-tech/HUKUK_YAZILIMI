import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { ClientStatementNativeService } from './client-statement-native.service';
import { ClientStatementNativeMonthlyService } from './client-statement-native-monthly.service';

class NativeStatementPeriodDto {
  @IsDateString() periodStart: string;
  @IsDateString() periodEnd: string;
}
class NativeStatementVoidDto {
  @IsString() @MinLength(1) @MaxLength(500) note: string;
}
interface NativeRequest { user: { id: string; tenantId: string; role: string } }

/** New E2 namespace; no arbitrary document path, recipient, currency subset or trusted-system selector. */
@Controller('client-statement-sets')
@UseGuards(AuthGuard('jwt'), ViewerWriteDenyGuard)
export class ClientStatementNativeController {
  constructor(private readonly native: ClientStatementNativeService, private readonly monthly: ClientStatementNativeMonthlyService) {}

  /** Caller: nativeStatementApi.create -> POST /client-statement-sets/client/:clientId. */
  @Post('client/:clientId')
  create(@Req() req: NativeRequest, @Param('clientId') clientId: string, @Body() dto: NativeStatementPeriodDto) {
    return this.native.create(req.user.tenantId, clientId, this.actor(req), dto);
  }

  /** Caller: nativeStatementApi.list -> GET /client-statement-sets/client/:clientId. */
  @Get('client/:clientId')
  list(@Req() req: NativeRequest, @Param('clientId') clientId: string) {
    return this.native.list(req.user.tenantId, clientId, this.actor(req));
  }

  /** Caller: bounded HTTP detail consumers -> GET /client-statement-sets/:id. */
  @Get(':id')
  get(@Req() req: NativeRequest, @Param('id') id: string) {
    return this.native.get(req.user.tenantId, id, this.actor(req));
  }

  /** Caller: nativeStatementApi.pdf -> GET /client-statement-sets/:id/pdf/:currency. */
  @Get(':id/pdf/:currency')
  async download(@Req() req: NativeRequest, @Param('id') id: string, @Param('currency') currency: string, @Res() res: Response) {
    const artifact = await this.native.download(req.user.tenantId, id, currency, this.actor(req));
    res.type('application/pdf').setHeader('Content-Disposition', `attachment; filename="ekstre-${artifact.currency}.pdf"`);
    res.setHeader('X-Content-SHA256', artifact.sha256);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(artifact.content);
  }

  /** Caller: nativeStatementApi.supersede -> POST /client-statement-sets/:id/supersede. */
  @Post(':id/supersede')
  supersede(@Req() req: NativeRequest, @Param('id') id: string) {
    return this.native.supersede(req.user.tenantId, id, this.actor(req));
  }

  /** Caller: nativeStatementApi.void -> POST /client-statement-sets/:id/void. */
  @Post(':id/void')
  void(@Req() req: NativeRequest, @Param('id') id: string, @Body() dto: NativeStatementVoidDto) {
    return this.native.void(req.user.tenantId, id, this.actor(req), dto.note);
  }

  /** Caller: nativeStatementApi.retry -> POST /client-statement-sets/:id/monthly-delivery/retry. */
  @Post(':id/monthly-delivery/retry')
  retry(@Req() req: NativeRequest, @Param('id') id: string) {
    return this.monthly.retry(req.user.tenantId, id, this.actor(req));
  }

  private actor(req: NativeRequest) { return { userId: req.user.id, role: req.user.role }; }
}
