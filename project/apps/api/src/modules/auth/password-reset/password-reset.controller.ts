// OFFICE-AUTH-P02: office/staff credential-recovery uçları. Her ikisi de public (auth gerekmez),
// ayrı rate-limit guard'lara tabidir (request ve consume bucket'ları birbirini tüketmez).
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { PasswordResetService } from "./password-reset.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { OfficeForgotPasswordRateLimitGuard } from "../guards/office-forgot-password-rate-limit.guard";
import { OfficeResetPasswordRateLimitGuard } from "../guards/office-reset-password-rate-limit.guard";

@Controller("auth")
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  @Post("forgot-password")
  @UseGuards(OfficeForgotPasswordRateLimitGuard)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordReset.forgotPassword(dto);
  }

  @Post("reset-password")
  @UseGuards(OfficeResetPasswordRateLimitGuard)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.resetPassword(dto);
  }
}
