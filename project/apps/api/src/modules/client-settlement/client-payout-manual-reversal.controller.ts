import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientPayoutManualReversalReadService } from './client-payout-manual-reversal-read.service';
import { ClientPayoutManualReversalService } from './client-payout-manual-reversal.service';
import { CloseClientPayoutManualReversalDto } from './dto/close-client-payout-manual-reversal.dto';
import { ListClientPayoutManualReversalsDto } from './dto/list-client-payout-manual-reversals.dto';

interface AuthRequest {
  user: { id: string; tenantId: string };
}

/**
 * TM47D-4/TM47D-5A - Client payout manual reversal endpoints.
 *
 * Actor and tenant are always taken from JWT request context, never from request body/query.
 * TM47D-5A endpoints are read-only operational projections.
 */
@Controller('client-payout-manual-reversals')
@UseGuards(JwtAuthGuard)
export class ClientPayoutManualReversalController {
  constructor(
    private readonly service: ClientPayoutManualReversalService,
    private readonly readService: ClientPayoutManualReversalReadService,
  ) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientPayoutManualReversalController.list() -> GET /client-payout-manual-reversals (manuel reversal operasyon listesi)
  /// </remarks>
  @Get()
  async list(@Request() req: AuthRequest, @Query() query: ListClientPayoutManualReversalsDto) {
    const data = await this.readService.list(req.user.tenantId, query ?? {});
    return { data };
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientPayoutManualReversalController.detail() -> GET /client-payout-manual-reversals/:id (manuel reversal operasyon detayi)
  /// </remarks>
  @Get(':id')
  async detail(@Request() req: AuthRequest, @Param('id') id: string) {
    const data = await this.readService.detail(req.user.tenantId, id);
    return { data };
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientPayoutManualReversalController.close() -> POST /client-payout-manual-reversals/:id/close (manuel reversal workflow kapatma)
  /// </remarks>
  @Post(':id/close')
  async close(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: CloseClientPayoutManualReversalDto) {
    const data = await this.service.close(req.user.tenantId, req.user.id, id, body);
    return { data };
  }
}