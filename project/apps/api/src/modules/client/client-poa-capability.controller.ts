import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientPoaCapabilityService } from './client-poa-capability.service';

/**
 * C3-B05 (§13/9) — efektif capability görünürlüğü. Backend-derived: frontend politika
 * hesaplamaz, bu özeti tüketir (deriveClientMutationCapabilities deseniyle aynı ilke).
 */
interface AuthRequest {
  user: { id: string; tenantId: string; role?: string };
}

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientPoaCapabilityController {
  constructor(private readonly capabilities: ClientPoaCapabilityService) {}

  @Get(':id/effective-capabilities')
  get(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.capabilities.getEffectiveCapabilities(req.user.tenantId, id);
  }
}
