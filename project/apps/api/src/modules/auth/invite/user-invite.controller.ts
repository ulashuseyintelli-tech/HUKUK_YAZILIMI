// K1-7: Güvenli login provisioning uçları.
// Admin write uçları: JwtAuthGuard + AdminGuard (+ servis feature-flag). accept: public, rate-limited.
import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { AdminGuard } from "../guards/admin.guard";
import { LoginRateLimitGuard } from "../guards/login-rate-limit.guard";
import { CurrentUser } from "../decorators/current-user.decorator";
import { UserInviteService } from "./user-invite.service";
import { CreateInviteDto, AcceptInviteDto } from "./dto/user-invite.dto";

@Controller("auth")
export class UserInviteController {
  constructor(private readonly invites: UserInviteService) {}

  @Post("invites")
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(
    @CurrentUser("id") actorUserId: string,
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("role") role: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invites.issue({ id: actorUserId, tenantId, role }, dto);
  }

  @Get("invites")
  @UseGuards(JwtAuthGuard, AdminGuard)
  list(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") actorUserId: string,
    @Query("status") status?: string,
  ) {
    return this.invites.list({ id: actorUserId, tenantId }, status);
  }

  @Post("invites/:id/resend")
  @UseGuards(JwtAuthGuard, AdminGuard)
  resend(
    @CurrentUser("id") actorUserId: string,
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
  ) {
    return this.invites.resend({ id: actorUserId, tenantId }, id);
  }

  @Post("invites/:id/revoke")
  @UseGuards(JwtAuthGuard, AdminGuard)
  revoke(
    @CurrentUser("id") actorUserId: string,
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
  ) {
    return this.invites.revoke({ id: actorUserId, tenantId }, id);
  }

  // Public: davet kabul (token + kullanıcı parolası). Auth gerekmez; rate-limited.
  @Post("accept-invite")
  @UseGuards(LoginRateLimitGuard)
  accept(@Body() dto: AcceptInviteDto) {
    return this.invites.accept(dto.token, dto.password);
  }
}
