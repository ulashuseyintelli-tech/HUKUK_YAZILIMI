import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { ClientIntakeReviewPermissionService } from './client-intake-review-permission.service';

type AuthRequest = { user: { id: string; tenantId: string } };

@Controller('client-intake-review-permissions')
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class ClientIntakeReviewPermissionController {
  constructor(private readonly permissions: ClientIntakeReviewPermissionService) {}

  @Get('subjects')
  listSubjects(@Req() req: AuthRequest, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.permissions.listSubjects(req.user.tenantId, req.user.id, cursor, limit);
  }

  @Get(':subjectUserId')
  getState(@Req() req: AuthRequest, @Param('subjectUserId') id: string) {
    return this.permissions.getState(req.user.tenantId, req.user.id, id);
  }

  @Post(':subjectUserId')
  grant(@Req() req: AuthRequest, @Param('subjectUserId') id: string, @Body() body: unknown) {
    return this.permissions.grant(req.user.tenantId, req.user.id, id, body);
  }

  @Post(':subjectUserId/revoke')
  revoke(@Req() req: AuthRequest, @Param('subjectUserId') id: string, @Body() body: unknown) {
    return this.permissions.revoke(req.user.tenantId, req.user.id, id, body);
  }
}
