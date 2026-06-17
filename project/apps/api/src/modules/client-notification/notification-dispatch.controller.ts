import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { NotificationDispatcherService } from './notification-dispatcher.service';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
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
  constructor(private readonly dispatcher: NotificationDispatcherService) {}

  /**
   * Manuel resend — POST /client-notifications/resend
   * SENT varsa göndermez (force=true ile açık tekrar gönderim).
   */
  @Post('resend')
  async resend(@Req() req: AuthRequest, @Body() dto: ResendNotificationDto) {
    return this.dispatcher.resend(req.user.tenantId, req.user.id, {
      clientId: dto.clientId,
      caseId: dto.caseId,
      templateCode: dto.templateCode,
      type: dto.type,
      tokens: dto.tokens ?? {},
      refType: dto.refType,
      refId: dto.refId,
      force: dto.force,
    });
  }
}
