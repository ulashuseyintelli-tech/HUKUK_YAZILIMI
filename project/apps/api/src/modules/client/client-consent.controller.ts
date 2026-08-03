import { Body, Controller, Get, Param, Post, Request, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { buildClientMutationActor } from './client.service';
import { ClientConsentService } from './client-consent.service';

/**
 * C3-B01 (§13/5) — KVKK açık rıza kayıt uçları (OFİS kanalı).
 * Yetki eşiği servis içinde mevcut D02 semantiğiyle uygulanır (eşik icat edilmez);
 * bilinmeyen/rıza-dışı faaliyet servis katmanında fail-closed RED'dir.
 */
interface AuthRequest {
  user: { id: string; tenantId: string; role?: string };
}

class ClientConsentMutationDto {
  @IsString()
  @MaxLength(100)
  activity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientConsentController {
  constructor(private readonly consent: ClientConsentService) {}

  @Get(':id/consents')
  list(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.consent.listConsents(req.user.tenantId, id);
  }

  @Post(':id/consents')
  grant(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) body: ClientConsentMutationDto,
  ) {
    const actor = buildClientMutationActor({
      userId: req.user.id,
      tenantId: req.user.tenantId,
      role: req.user.role,
    });
    return this.consent.grantConsent({
      tenantId: req.user.tenantId,
      clientId: id,
      activity: body.activity,
      actor,
      note: body.note,
      source: 'OFFICE',
    });
  }

  @Post(':id/consents/revoke')
  revoke(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) body: ClientConsentMutationDto,
  ) {
    const actor = buildClientMutationActor({
      userId: req.user.id,
      tenantId: req.user.tenantId,
      role: req.user.role,
    });
    return this.consent.revokeConsent({
      tenantId: req.user.tenantId,
      clientId: id,
      activity: body.activity,
      actor,
      note: body.note,
    });
  }
}
