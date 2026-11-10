import { Body, Controller, Get, Param, Post, Query, Request, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { K73_OPERATIONS } from './client-special-category-access';
import type { K73Operation } from './client-special-category-access';
import { ClientSpecialCategoryAccessService } from './client-special-category-access.service';

class ScopeQuery {
  @IsString() @MinLength(1) @MaxLength(100) clientId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) caseId?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
class GrantBody {
  @IsString() @MinLength(1) @MaxLength(100) clientId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) caseId?: string;
  @IsString() @MinLength(1) @MaxLength(100) subjectUserId!: string;
  @IsIn(K73_OPERATIONS) operation!: K73Operation;
  @IsISO8601({ strict: true }) validFrom!: string;
  @IsISO8601({ strict: true }) validUntil!: string;
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
class ReasonBody {
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
interface AuthRequest { user: { id: string; tenantId: string } }
const strict = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

// Separate prefix avoids the existing /clients/:id catch-all. Only this bounded
// controller consumes the management service; it never exposes protected content.
@Controller('client-special-category-access')
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class ClientSpecialCategoryAccessController {
  constructor(private readonly access: ClientSpecialCategoryAccessService) {}
  @Get('capabilities')
  capabilities(@Request() req: AuthRequest, @Query(strict) scope: ScopeQuery) {
    return this.access.capabilities(req.user.tenantId, req.user.id, scope);
  }
  @Get('candidates')
  candidates(@Request() req: AuthRequest, @Query(strict) scope: ScopeQuery) {
    return this.access.candidates(req.user.tenantId, req.user.id, scope, scope.q);
  }
  @Get('grants')
  list(@Request() req: AuthRequest, @Query(strict) scope: ScopeQuery) {
    return this.access.listGrants(req.user.tenantId, req.user.id, scope);
  }
  @Post('grants')
  grant(@Request() req: AuthRequest, @Body(strict) body: GrantBody) {
    return this.access.grant(req.user.tenantId, req.user.id, body);
  }
  @Post('grants/:id/revoke')
  revoke(@Request() req: AuthRequest, @Param('id') id: string, @Body(strict) body: ReasonBody) {
    return this.access.revoke(req.user.tenantId, req.user.id, id, body.reason);
  }
  @Post('subjects/:id/duty-change')
  dutyChange(@Request() req: AuthRequest, @Param('id') id: string, @Body(strict) body: ReasonBody) {
    return this.access.dutyChange(req.user.tenantId, req.user.id, id, body.reason);
  }
}
