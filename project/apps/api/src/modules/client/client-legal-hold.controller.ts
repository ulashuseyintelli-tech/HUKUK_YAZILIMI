import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { buildClientMutationActor } from './client.service';
import { ClientLegalHoldService } from './client-legal-hold.service';
import type { ClientLifecycleAssessment } from './client-data-lifecycle-gate';

/**
 * C3-B03 (§13/8) — legal hold + on-demand silme değerlendirmesi uçları.
 * Tüm yetki eşikleri servis katmanında (elevated + maker-checker) uygulanır.
 */
interface AuthRequest {
  user: { id: string; tenantId: string; role?: string };
}

const actorFrom = (req: AuthRequest) =>
  buildClientMutationActor({
    userId: req.user.id,
    tenantId: req.user.tenantId,
    role: req.user.role,
  });

class PlaceHoldDto {
  @IsIn(['CLIENT', 'CASE', 'RECORD_FAMILY'])
  scopeType!: 'CLIENT' | 'CASE' | 'RECORD_FAMILY';

  @IsString()
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  caseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recordFamily?: string;
}

class RequestReleaseDto {
  @IsString()
  @MaxLength(1000)
  releaseReason!: string;
}

class EvaluateDeletionDto {
  @IsObject()
  assessment!: ClientLifecycleAssessment;

  @IsOptional()
  @IsString()
  caseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recordFamily?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  requestNote?: string;
}

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientLegalHoldController {
  constructor(private readonly holds: ClientLegalHoldService) {}

  @Get('legal-holds')
  list(@Request() req: AuthRequest, @Query('clientId') clientId?: string) {
    return this.holds.listHolds(req.user.tenantId, clientId);
  }

  @Post(':id/legal-holds')
  place(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) body: PlaceHoldDto,
  ) {
    return this.holds.placeHold({
      tenantId: req.user.tenantId,
      clientId: id,
      scopeType: body.scopeType,
      reason: body.reason,
      actor: actorFrom(req),
      caseId: body.caseId,
      recordFamily: body.recordFamily,
    });
  }

  @Post('legal-holds/:holdId/request-release')
  requestRelease(
    @Request() req: AuthRequest,
    @Param('holdId') holdId: string,
    @Body(new ValidationPipe({ whitelist: true })) body: RequestReleaseDto,
  ) {
    return this.holds.requestRelease({
      tenantId: req.user.tenantId,
      holdId,
      releaseReason: body.releaseReason,
      actor: actorFrom(req),
    });
  }

  @Post('legal-holds/:holdId/approve-release')
  approveRelease(@Request() req: AuthRequest, @Param('holdId') holdId: string) {
    return this.holds.approveRelease({
      tenantId: req.user.tenantId,
      holdId,
      actor: actorFrom(req),
    });
  }

  /** Silme DEĞERLENDİRMESİ — hiçbir şey silmez; sonuç audit'e yazılır (K8.3/K8.5). */
  @Post(':id/deletion-evaluation')
  evaluate(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) body: EvaluateDeletionDto,
  ) {
    return this.holds.evaluateDeletionRequest({
      tenantId: req.user.tenantId,
      clientId: id,
      actor: actorFrom(req),
      assessment: body.assessment ?? {},
      caseId: body.caseId,
      recordFamily: body.recordFamily,
      requestNote: body.requestNote,
    });
  }
}
