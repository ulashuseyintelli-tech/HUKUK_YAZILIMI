import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationHistoryPermissionService } from './notification-history-permission.service';

@Controller('client-notifications/history-audit-permissions')
@UseGuards(JwtAuthGuard)
export class NotificationHistoryPermissionController {
  constructor(private readonly permissions: NotificationHistoryPermissionService) {}

  /** Caller: authenticated ADMIN API consumer; service rechecks the current DB role in the write transaction. */
  @Post(':subjectUserId')
  grant(@Req() req: { user: { tenantId: string; id: string } }, @Param('subjectUserId') subjectUserId: string, @Body() body: unknown) {
    return this.permissions.grant(req.user.tenantId, req.user.id, subjectUserId, body);
  }

  /** Caller: authenticated ADMIN API consumer; expires existing GLOBAL ALLOW records for this key only. */
  @Post(':subjectUserId/revoke')
  revoke(@Req() req: { user: { tenantId: string; id: string } }, @Param('subjectUserId') subjectUserId: string, @Body() body: unknown) {
    return this.permissions.revoke(req.user.tenantId, req.user.id, subjectUserId, body);
  }
}
