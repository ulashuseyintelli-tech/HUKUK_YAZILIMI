import { Controller, Post, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientPayoutService } from './client-payout.service';
import { CreateClientPayoutDto } from './dto/create-client-payout.dto';

/** actor compile-time shape — req.user.id auth context (body'den ASLA). */
interface AuthRequest {
  user: { id: string; tenantId: string };
}

@Controller('client-payouts')
@UseGuards(JwtAuthGuard)
export class ClientPayoutController {
  constructor(private readonly service: ClientPayoutService) {}

  /** Müvekkile ödeme kaydet (CLIENT_PAYABLE settlement). actor = req.user.id; D1: BalanceLedger DEĞİL. */
  @Post()
  async create(@Request() req: AuthRequest, @Body() body: CreateClientPayoutDto) {
    const data = await this.service.create(req.user.tenantId, body, { userId: req.user.id });
    return { data };
  }
}
