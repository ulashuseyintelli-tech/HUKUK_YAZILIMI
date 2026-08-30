import { Controller, Post, Body, Get, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RegisterDto, LoginDto, FindTenantsForEmailDto } from "./dto/auth.dto";
import { SmokeAllowed } from "./smoke/smoke-allowed.decorator";
import { SmokeOrJwtAuthGuard } from "./smoke/smoke-or-jwt-auth.guard";
import { LoginRateLimitGuard } from "./guards/login-rate-limit.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { PasswordResetService } from "./password-reset/password-reset.service";
import { AuthUserProjectionSource, toPublicAuthUser } from "./user-public-projection";

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  /**
   * OFFICE-AUTH-P02-HARDENING-R01: public capability query — web login sayfası
   * "Şifremi unuttum" linkini bu flag'e göre gösterir/gizler. Auth gerektirmez,
   * hassas veri döndürmez (yalnız statik bir feature-flag durumu).
   */
  @Get("capabilities")
  capabilities() {
    return { passwordRecoveryEnabled: this.passwordReset.isPasswordRecoveryEnabled() };
  }

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

  /**
   * C36: `@SmokeAllowed()` bu route'u SMOKE allowlist'ine alır (owner allowlist md.2) ve
   * `SmokeOrJwtAuthGuard` smoke token'ı kabul eder. NORMAL YOL DEĞİŞMEZ: smoke claim'i
   * yoksa guard aynen `JwtAuthGuard`'a devreder. Yanıt projeksiyonu (`toPublicAuthUser`)
   * her iki yolda da AYNIDIR → smoke doğrulaması gerçek production sözleşmesini ölçer.
   */
  @Get("me")
  @SmokeAllowed()
  @UseGuards(SmokeOrJwtAuthGuard)
  me(@CurrentUser() user: AuthUserProjectionSource) {
    // R02: `request.user` select'siz tam Prisma satırıdır (`include: { tenant: true }`).
    // register/login/me ÜÇÜ de AYNI merkezi allowlist projeksiyonundan geçer; Prisma
    // nesnesi yanıta doğrudan taşınmaz ve şemaya eklenen yeni alan kendiliğinden sızmaz.
    return { user: toPublicAuthUser(user) };
  }
}
