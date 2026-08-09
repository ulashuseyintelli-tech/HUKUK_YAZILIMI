import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Request } from 'express';
import { AdminGuard } from '@/modules/auth/guards/admin.guard';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { CLIENT_WORKSPACE_COMMAND } from '../client/client-workspace-command-authority';
import { ClientNotificationAuthorityAdapter } from './client-notification-authority.adapter';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string; role?: string };
}

/** C1-B05-B — QUEUED intent drain gövdesi (ADMIN). */
class ProcessQueuedDto {
  @IsInt() @Min(1) @Max(50) @IsOptional() limit?: number;
}

/** Manuel resend gövdesi. tokens çağıran tarafından doldurulur (m3a-4). */
class ResendNotificationDto {
  @IsString() @MinLength(1) clientId: string;
  @IsString() @IsOptional() caseId?: string;
  @IsString() @MinLength(1) templateCode: string;
  @IsString() @MinLength(1) type: string;
  @IsString() @MinLength(1) refType: string;
  @IsString() @MinLength(1) refId: string;
  @IsObject() @IsOptional() tokens?: Record<string, string>;
  @IsBoolean() @IsOptional() force?: boolean;
}

/**
 * Mail dispatch — manuel resend (Faz 3 alt-faz 3.3).
 * Best-effort: state değiştirmez, idempotency dedupeKey üzerinden.
 */
@Controller('client-notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationDispatchController {
  constructor(
    private readonly dispatcher: NotificationDispatcherService,
    private readonly authority: ClientNotificationAuthorityAdapter,
  ) {}

  /**
   * Manuel resend — POST /client-notifications/resend
   * SENT varsa göndermez (force=true ile açık tekrar gönderim).
   */
  /**
   * C1-B05-B — QUEUED intent kurtarma (ADMIN). Yalnız QUEUED satırlar işlenir;
   * PENDING (belirsiz) OTOMATİK yeniden gönderilmez, SENT/FAILED dokunulmaz.
   * POST /client-notifications/process-queued
   */
  @Post('process-queued')
  @UseGuards(AdminGuard)
  async processQueued(@Req() req: AuthRequest, @Body() dto: ProcessQueuedDto) {
    return this.dispatcher.drainQueuedNotifications(req.user.tenantId, req.user.id, dto.limit ?? 10);
  }

  @Post('resend')
  async resend(@Req() req: AuthRequest, @Body() dto: ResendNotificationDto) {
    return this.authority.run(
      {
        userId: req.user.id,
        tenantId: req.user.tenantId,
        role: req.user.role,
      },
      dto.clientId,
      CLIENT_WORKSPACE_COMMAND.NOTIFICATION_RESEND,
      () =>
        this.dispatcher.resend(req.user.tenantId, req.user.id, {
          clientId: dto.clientId,
          caseId: dto.caseId,
          templateCode: dto.templateCode,
          type: dto.type,
          tokens: dto.tokens ?? {},
          refType: dto.refType,
          refId: dto.refId,
          force: dto.force,
        }),
      (result) => ({ status: result.status }),
    );
  }
}
