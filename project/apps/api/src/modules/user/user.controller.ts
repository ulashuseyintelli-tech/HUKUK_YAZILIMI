import { Controller, Get, UseGuards } from "@nestjs/common";
import { UserService } from "./user.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

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
}
