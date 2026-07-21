// OFFICE-AUTH-P02: office/staff credential-recovery (şifremi unuttum) servisi.
// Ham token asla DB/audit/log'a yazılmaz — yalnız SHA256 hash saklanır (UserInvite emsali,
// user-invite-token.util.ts'deki generateRawInviteToken/hashInviteToken tekrar kullanılır).
import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { EmailProviderService } from "../../notification/email-provider.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { generateRawInviteToken, hashInviteToken, redactEmail } from "../invite/user-invite-token.util";

const RESET_TOKEN_TTL_MS = 3600_000; // 1 saat

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailProviderService,
    private readonly config: ConfigService,
  ) {}

  private resetUrl(rawToken: string): string {
    const base = (this.config.get("WEB_BASE_URL") || this.config.get("APP_BASE_URL") || "")
      .toString()
      .replace(/\/+$/, "");
    return `${base}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
  }

  /**
   * Public: şifremi unuttum isteği. Tenant/kullanıcı var olsun ya da olmasın HER ZAMAN aynı
   * generic yanıtı döner (enumeration-safe). tenantSlug zorunlu — AuthService.login() ile aynı
   * tenant-aware çözümleme deseni (@@unique([tenantId,email])).
   *
   * Çağrıldığı yerler:
   * - PasswordResetController.forgotPassword() -> POST /auth/forgot-password
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ success: true }> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, tenant: { slug: dto.tenantSlug } },
    });

    // Pasif veya henüz parolası belirlenmemiş (pending invite) kullanıcılar için de generic
    // yanıt dönülür; token üretilmez (login'in aynı null-guard/isActive mantığıyla tutarlı).
    if (user && user.isActive && user.passwordHash) {
      const rawToken = generateRawInviteToken();
      const tokenHash = hashInviteToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await this.prisma.$transaction(async (tx) => {
        // Aynı kullanıcıya ait önceki aktif tokenlar revoke edilir — aynı anda en fazla bir
        // geçerli reset linki bulunur.
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, consumedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.passwordResetToken.create({
          data: { tenantId: user.tenantId, userId: user.id, tokenHash, expiresAt },
        });
      });

      const emailResult = await this.sendResetEmail(user.email, rawToken);

      if (!emailResult.success) {
        // EMAIL FAILURE POLICY: e-posta gönderilemezse kullanılabilir token kalmaz.
        await this.prisma.passwordResetToken.updateMany({
          where: { tokenHash, consumedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await this.audit.log({
        tenantId: user.tenantId,
        action: "PASSWORD_RESET_REQUESTED",
        entityType: "USER",
        entityId: user.id,
        userId: user.id,
        // Ham token/hash ASLA metadata'ya yazılmaz.
        metadata: {
          emailRedacted: redactEmail(user.email),
          result: emailResult.success ? "ISSUED" : "EMAIL_FAILED",
        },
      });
    }

    return { success: true };
  }

  /**
   * Public: ham token + yeni parola → parola güncellenir. Tek atomik transaction: token consume,
   * User.passwordHash/tokenVersion/passwordChangedAt güncelleme, diğer aktif tokenların revoke'u
   * ve audit AYNI transaction içinde. Eşzamanlı iki istek aynı tokenla yarışırsa yalnız biri
   * başarılı olur (atomic updateMany + count guard — automation-toggle-tenant-guard emsaliyle
   * aynı desen).
   *
   * Çağrıldığı yerler:
   * - PasswordResetController.resetPassword() -> POST /auth/reset-password
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException("Yeni parola ve tekrarı eşleşmiyor");
    }
    // bcrypt 72 bayttan sonrasını sessizce keser; belirsizliğe izin verme (owner policy,
    // changeOwnPassword ile aynı kural).
    if (Buffer.byteLength(dto.password, "utf8") > 72) {
      throw new BadRequestException("Yeni parola en fazla 72 bayt (UTF-8) olabilir");
    }

    const tokenHash = hashInviteToken(dto.token);
    // Transaction dışında hesaplanır (invite.accept() ile aynı desen) — bcrypt maliyetli işlemi
    // açık transaction/lock süresini uzatmasın diye.
    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { tokenHash, consumedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      // count===0: token yok/expired/consumed/revoked — hepsi AYNI generic hata (enumeration-safe).
      // Throw → transaction rollback (yukarıdaki updateMany de geri alınır, kullanıcı alanı DEĞİŞMEZ).
      if (consumed.count === 0) {
        throw new BadRequestException("Geçersiz veya süresi dolmuş token");
      }

      const tokenRow = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash } });
      const user = await tx.user.findFirst({
        where: { id: tokenRow.userId, tenantId: tokenRow.tenantId },
      });
      if (!user || !user.isActive) {
        throw new BadRequestException("Geçersiz veya süresi dolmuş token");
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });

      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null, revokedAt: null, NOT: { id: tokenRow.id } },
        data: { revokedAt: new Date() },
      });

      // Ham/parola/hash/token ASLA audit metadata'ya yazılmaz.
      await this.audit.logInTransaction(tx, {
        tenantId: user.tenantId,
        action: "PASSWORD_RESET_COMPLETED",
        entityType: "USER",
        entityId: user.id,
        userId: user.id,
        metadata: { result: "RESET" },
      });
    });

    return { ok: true };
  }

  private async sendResetEmail(email: string, rawToken: string) {
    const url = this.resetUrl(rawToken);
    const result = await this.email.send({
      to: email,
      subject: "Parola sıfırlama talebi",
      text: `Parolanızı sıfırlamak için: ${url}\nBu bağlantı 1 saat geçerlidir ve tek kullanımlıktır. Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.`,
      html:
        `<p>Parolanızı sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>` +
        `<p><a href="${url}">Parolamı sıfırla</a></p>` +
        `<p>Bu bağlantı 1 saat geçerlidir ve tek kullanımlıktır. Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>`,
    });
    // Log'a e-posta (maskeli bile olsa) yazma → CI-2 PII log gate. errorCode teşhis için yeterli.
    if (!result.success) this.logger.warn(`Parola sıfırlama e-postası gönderilemedi: ${result.errorCode}`);
    return result;
  }
}
