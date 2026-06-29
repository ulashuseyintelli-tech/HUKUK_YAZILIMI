import { Body, Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientPayoutManualReversalService } from './client-payout-manual-reversal.service';
import { CloseClientPayoutManualReversalDto } from './dto/close-client-payout-manual-reversal.dto';

interface AuthRequest {
  user: { id: string; tenantId: string };
}

/**
 * TM47D-4 — Client payout manual reversal closure endpoint.
 *
 * Actor and tenant are always taken from JWT request context, never from request body.
 */
@Controller('client-payout-manual-reversals')
@UseGuards(JwtAuthGuard)
export class ClientPayoutManualReversalController {
  constructor(private readonly service: ClientPayoutManualReversalService) {}

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
