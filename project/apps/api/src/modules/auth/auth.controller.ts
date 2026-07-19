import { Controller, Post, Body, Get, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RegisterDto, LoginDto, FindTenantsForEmailDto } from "./dto/auth.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { LoginRateLimitGuard } from "./guards/login-rate-limit.guard";
import { CurrentUser } from "./decorators/current-user.decorator";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  @UseGuards(LoginRateLimitGuard)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * AUTH-01 — Account/Tenant Recovery akışı. Normal login akışının parçası DEĞİLDİR,
   * yalnız kullanıcı "kurumumu bilmiyorum" dediğinde çağrılır. Brute-force/enumeration
   * korumasi için aynı rate-limit guard login ile paylaşılır.
   */
  @Post("account-recovery/find-tenants")
  @UseGuards(LoginRateLimitGuard)
  findTenantsForEmail(@Body() dto: FindTenantsForEmailDto) {
    return this.authService.findTenantsForEmail(dto.email);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return { user };
  }
}
