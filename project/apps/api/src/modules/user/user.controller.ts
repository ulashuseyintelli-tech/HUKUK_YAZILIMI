import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { UserService } from "./user.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ChangePasswordDto } from "./dto/change-password.dto";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  async findAll(@CurrentUser("tenantId") tenantId: string) {
    // Tüm /users tüketicileri (cases/new sihirbazı, görev atama, yorum @bahsetme,
    // raporlar) yanıtı `{ data: [...] }` zarfı bekliyor (res.data.data). Kardeş
    // uçlarla (clients/lookups) tutarlı olması için diziyi zarfla.
    const data = await this.userService.findByTenant(tenantId);
    return { data };
  }

  /**
   * OFFICE-AUTH-P01: self-service parola değiştirme. Yalnız JWT'deki kendi kimlik
   * (userId+tenantId) çözümlenir — targetUserId gövdeden ASLA alınmaz.
   */
  @Patch("me/password")
  async changeMyPassword(
    @CurrentUser("id") userId: string,
    @CurrentUser("tenantId") tenantId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changeOwnPassword(userId, tenantId, dto);
  }
}
