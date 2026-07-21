// OFFICE-AUTH-P02: office/staff credential-recovery (şifremi unuttum) servisi.
// Ham token asla DB/audit/log'a yazılmaz — yalnız SHA256 hash saklanır (UserInvite emsali,
// user-invite-token.util.ts'deki generateRawInviteToken/hashInviteToken tekrar kullanılır).
import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { EmailProviderService } from "../../notification/email-provider.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { generateRawInviteToken, hashInviteToken, redactEmail } from "../invite/user-invite-token.util";

const RESET_TOKEN_TTL_MS = 3600_000; // 1 saat
// OFFICE-AUTH-P02-HARDENING-R01: request-transaction Serializable çakışması (P2034) veya
// partial-index ihlali (P2002: tenantId+userId) için sınırlı yeniden deneme sayısı.
const REQUEST_TRANSACTION_MAX_ATTEMPTS = 3;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailProviderService,
    private readonly config: ConfigService,
  ) {}

  /**
   * OFFICE-AUTH-P02-HARDENING-R01: credential-recovery uçları bu flag arkasındadır
   * (default kapalı → canlı risk yok, ayrı bir OWNER GO-OPERATE ile açılır).
   *
   * Çağrıldığı yerler:
   * - PasswordResetService.forgotPassword()/resetPassword() -> fail-closed gate
   * - AuthController.capabilities() -> GET /api/auth/capabilities (web UI görünürlüğü)
   */
  isPasswordRecoveryEnabled(): boolean {
    return String(this.config.get("OFFICE_PASSWORD_RECOVERY_ENABLED") ?? "").toLowerCase() === "true";
  }

  private resetUrl(rawToken: string): string {
    const base = (this.config.get("WEB_BASE_URL") || this.config.get("APP_BASE_URL") || "")
      .toString()
      .replace(/\/+$/, "");
    // OFFICE-AUTH-P02-HARDENING-R01: fragment (#) — ham token sunucu access log'larına
    // (query string gibi) asla yazılmasın diye query yerine URL fragment'ında taşınır.
    return `${base}/auth/reset-password#token=${encodeURIComponent(rawToken)}`;
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
    // OFFICE-AUTH-P02-HARDENING-R01: flag kapalıyken generic yanıt dışında hiçbir şey yapılmaz
    // (fail-closed + enumeration-safe — "özellik kapalı" ile "kullanıcı yok" ayırt edilemez).
    if (!this.isPasswordRecoveryEnabled()) {
      return { success: true };
    }

    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, tenant: { slug: dto.tenantSlug } },
    });

    // Pasif veya henüz parolası belirlenmemiş (pending invite) kullanıcılar için de generic
    // yanıt dönülür; token üretilmez (login'in aynı null-guard/isActive mantığıyla tutarlı).
    if (user && user.isActive && user.passwordHash) {
      const { rawToken } = await this.createResetTokenWithRetry(user.id, user.tenantId, user.email);
      await this.dispatchResetEmailOrCompensate(user.tenantId, user.id, user.email, rawToken);
    }

    return { success: true };
  }

  /**
   * OFFICE-AUTH-P02-HARDENING-R01: token request'ini Serializable izolasyonla atomik kurar
   * (eski aktif tokenları revoke + yeni token create + PASSWORD_RESET_REQUESTED audit AYNI
   * transaction). Eşzamanlı iki forgot-password isteği aynı kullanıcı için yarışırsa Postgres/
   * Prisma bunu ya serialization failure (P2034) ya da partial-index ihlali (P2002:
   * tenantId+userId) ile işaretler — YALNIZ bu iki durum için sınırlı sayıda yeniden denenir;
   * her denemede taze ham token üretilir (eskisi asla yeniden kullanılmaz), sonuç transaction'ın
   * RETURN VALUE'sinden okunur (mutable closure değişkeni YOK — yarım kalan bir denemenin
   * değeri asla sızamaz).
   */
  private async createResetTokenWithRetry(
    userId: string,
    tenantId: string,
    userEmail: string,
  ): Promise<{ rawToken: string }> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= REQUEST_TRANSACTION_MAX_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const rawToken = generateRawInviteToken();
            const tokenHash = hashInviteToken(rawToken);
            const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

            // Aynı kullanıcıya ait önceki aktif tokenlar revoke edilir — aynı anda en fazla bir
            // geçerli reset linki bulunur (partial unique index ile DB seviyesinde de zorunlu).
            await tx.passwordResetToken.updateMany({
              where: { tenantId, userId, consumedAt: null, revokedAt: null },
              data: { revokedAt: new Date() },
            });
            await tx.passwordResetToken.create({
              data: { tenantId, userId, tokenHash, expiresAt },
            });
            // Ham token/hash ASLA audit metadata'ya yazılmaz.
            await this.audit.logInTransaction(tx, {
              tenantId,
              action: "PASSWORD_RESET_REQUESTED",
              entityType: "USER",
              entityId: userId,
              userId,
              metadata: { emailRedacted: redactEmail(userEmail) },
            });

            return { rawToken };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (e) {
        lastError = e;
        if (!this.isRetryableRequestConflict(e) || attempt === REQUEST_TRANSACTION_MAX_ATTEMPTS) {
          throw e;
        }
      }
    }
    throw lastError;
  }

  /**
   * YALNIZ (a) Prisma P2034 (serialization/write-conflict) veya (b) partial-index ("kullanıcı
   * başına en fazla bir çözülmemiş token") P2002 ihlali retry'e uygundur. tokenHash gibi
   * İLGİSİZ bir P2002 asla retry tetiklemez — gerçek disposable PostgreSQL üzerinde empirik
   * olarak karakterize edildi (target dizisi gerçek çakışan kolon adlarını taşır).
   */
  private isRetryableRequestConflict(error: unknown): boolean {
    const err = error as { code?: string; meta?: { target?: unknown } };
    if (err?.code === "P2034") return true;
    if (err?.code === "P2002" && Array.isArray(err.meta?.target)) {
      const target = err.meta!.target as unknown[];
      return target.includes("tenantId") && target.includes("userId");
    }
    return false;
  }

  /**
   * E-posta gönderimi transaction DIŞINDA denenir (ağ I/O ile DB lock/transaction süresini
   * uzatmamak için). Gönderim BAŞARISIZ olursa — dönen {success:false} veya THROW, ikisi de
   * AYNI yola girer — token atomik biçimde revoke edilir + azaltılmış (yalnız outcome) audit
   * metadata'sı ile PASSWORD_RESET_EMAIL_FAILED yazılır; secret-free bir alarm loglanır
   * (exception message/stack ASLA loglanmaz). Compensation'ın kendisi bile başarısız olursa
   * enumeration-safety bozulmasın diye forgotPassword() yine de generic {success:true} döner
   * (bu metod hiçbir durumda throw etmez).
   */
  private async dispatchResetEmailOrCompensate(
    tenantId: string,
    userId: string,
    userEmail: string,
    rawToken: string,
  ): Promise<void> {
    let emailSucceeded: boolean;
    try {
      const result = await this.sendResetEmail(userEmail, rawToken);
      emailSucceeded = result.success;
    } catch {
      emailSucceeded = false;
    }

    if (emailSucceeded) {
      // log() dahili try/catch ile hata yutar — burada asla throw etmez.
      await this.audit.log({
        tenantId,
        action: "PASSWORD_RESET_EMAIL_DISPATCHED",
        entityType: "USER",
        entityId: userId,
        userId,
        metadata: { outcome: "DISPATCHED" },
      });
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: { tenantId, userId, consumedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: "PASSWORD_RESET_EMAIL_FAILED",
          entityType: "USER",
          entityId: userId,
          userId,
          metadata: { outcome: "EMAIL_FAILED" },
        });
      });
      this.logger.error(
        `Parola sıfırlama e-postası gönderilemedi, token revoke edildi (tenantId=${tenantId}, userId=${userId})`,
      );
    } catch {
      this.logger.error(
        `Parola sıfırlama e-posta compensation BAŞARISIZ (tenantId=${tenantId}, userId=${userId}) — ` +
          `token revoke edilemedi, manuel müdahale gerekebilir.`,
      );
    }
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
    // OFFICE-AUTH-P02-HARDENING-R01: flag kapalıyken her token "geçersiz" sayılır — mevcut
    // enumeration-safe generic hata mesajıyla AYNI, ayırt edilemez davranış (fail-closed).
    if (!this.isPasswordRecoveryEnabled()) {
      throw new BadRequestException("Geçersiz veya süresi dolmuş token");
    }
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
