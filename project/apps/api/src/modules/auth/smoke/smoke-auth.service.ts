import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";

import { PrismaService } from "@/prisma/prisma.service";
import { AuthUserProjectionSource } from "../user-public-projection";
import {
  SMOKE_AUTH_FAILED_MESSAGE,
  SMOKE_PRINCIPAL_MAX_LIFETIME_SECONDS,
  SMOKE_PROVISION_PUBLIC_KEY_ENV,
  SmokeTokenClaims,
} from "./smoke-principal.constants";
import { SmokeTokenService } from "./smoke-token.service";

/** Provisioning envelope'unun imzalanan gövdesi. Secret İÇERMEZ. */
export interface SmokeProvisionEnvelope {
  readonly operation: "SMOKE_PROVISION";
  readonly nonce: string;
  readonly notBeforeUtc: string;
  readonly notAfterUtc: string;
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly email: string;
  readonly name: string;
  readonly surname: string;
  /** R05 paket kimliği — envelope'u belirli bir qualified pakete bağlar. */
  readonly packageManifestSha256: string;
  /** Hedef runtime baseline kimliği. */
  readonly baselineSha256: string;
}

/** Provisioning sonucu — ham secret veya token TAŞIMAZ. */
export interface SmokeProvisionResult {
  readonly outcome: "PROVISIONED" | "ALREADY_PRESENT_NO_MUTATION";
  readonly smokePrincipalId: string;
  readonly userId: string;
  readonly tenantSlug: string;
  readonly provisionReceipt: string;
  readonly expiresAtUtc: string;
}

/**
 * C36 — smoke principal provisioning / login / revoke.
 *
 * ═══ SECRET SÖZLEŞMESİ ═══
 * Ham credential YALNIZ istek gövdesinden process memory'ye alınır; bcrypt hash'i
 * DB'ye yazılır. Ham değer log'a, yanıta, audit'e veya evidence'a ASLA çıkmaz.
 * Credential'ın yeniden kullanılabilir bir digest'i de (SHA-256 vb.) hiçbir yere
 * yazılmaz — bcrypt salt'lı ve tek yönlüdür, offline oracle üretmez.
 */
@Injectable()
export class SmokeAuthService {
  private readonly logger = new Logger(SmokeAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly smokeToken: SmokeTokenService,
  ) {}

  // ───────────────────────────── PROVISIONING (Faz D) ─────────────────────────────

  /**
   * İmzalı envelope'u doğrular. Doğrulama BAŞARISIZSA hiçbir yazma yapılmaz.
   *
   * Envelope YALNIZ bu tek operasyonu temsil eder: keyfi komut/path/payload yetkisi
   * ÜRETMEZ. Public verification key secret DEĞİLDİR; private signing material
   * repo/evidence dışında owner-controlled broker'da kalır.
   */
  verifyEnvelope(envelope: SmokeProvisionEnvelope, signatureBase64: string, nowUtc: Date): void {
    const publicKeyPem = this.config.get<string>(SMOKE_PROVISION_PUBLIC_KEY_ENV);
    if (!publicKeyPem || publicKeyPem.length === 0) {
      // Anahtar yoksa provisioning TAMAMEN kapalıdır (fail-closed).
      throw new ForbiddenException("Smoke provisioning bu runtime'da etkin değil");
    }

    if (envelope?.operation !== "SMOKE_PROVISION") {
      throw new ForbiddenException("Envelope operasyonu geçersiz");
    }

    const notBefore = new Date(envelope.notBeforeUtc);
    const notAfter = new Date(envelope.notAfterUtc);
    if (Number.isNaN(notBefore.getTime()) || Number.isNaN(notAfter.getTime())) {
      throw new ForbiddenException("Envelope penceresi geçersiz");
    }
    if (nowUtc < notBefore || nowUtc > notAfter) {
      throw new ForbiddenException("Envelope penceresi kapalı");
    }

    // Kanonik seri hâl: alan sırası SABİT, böylece imza doğrulaması deterministiktir.
    const canonical = SmokeAuthService.canonicalizeEnvelope(envelope);
    let ok = false;
    try {
      ok = crypto.verify(
        null, // ed25519 kendi hash'ini kullanır
        Buffer.from(canonical, "utf8"),
        crypto.createPublicKey(publicKeyPem),
        Buffer.from(signatureBase64, "base64"),
      );
    } catch {
      ok = false;
    }
    if (!ok) {
      throw new ForbiddenException("Envelope imzası doğrulanamadı");
    }
  }

  /** Envelope'un kanonik (deterministik) seri hâli — imza tabanı. */
  static canonicalizeEnvelope(e: SmokeProvisionEnvelope): string {
    return JSON.stringify({
      operation: e.operation,
      nonce: e.nonce,
      notBeforeUtc: e.notBeforeUtc,
      notAfterUtc: e.notAfterUtc,
      tenantName: e.tenantName,
      tenantSlug: e.tenantSlug,
      email: e.email,
      name: e.name,
      surname: e.surname,
      packageManifestSha256: e.packageManifestSha256,
      baselineSha256: e.baselineSha256,
    });
  }

  /**
   * Smoke principal'ı oluşturur. TEK mutation; kısmi durum yapısal olarak imkânsızdır.
   *
   * ROW BÜTÇESİ (exact): Tenant 1 · User 1 · SmokePrincipal 1 = 3 satır / 3 tablo.
   * Office, Lawyer, StaffMember, Client, Case, Task, AuditLog, lookup kataloğu ve
   * notification recipient: HİÇBİRİ oluşturulmaz.
   *
   * IDEMPOTENT: aynı nonce ikinci kez gelirse (lost-response senaryosu) mevcut kayıt
   * okunup `ALREADY_PRESENT_NO_MUTATION` döner; İKİNCİ INSERT YAPILMAZ.
   */
  async provision(
    envelope: SmokeProvisionEnvelope,
    credential: string,
    nowUtc: Date,
  ): Promise<SmokeProvisionResult> {
    // ── replay / lost-response reconciliation: nonce ZATEN kullanılmış mı? ──
    const existing = await this.prisma.smokePrincipal.findUnique({
      where: { provisionNonce: envelope.nonce },
      include: { user: { include: { tenant: true } } },
    });
    if (existing) {
      return {
        outcome: "ALREADY_PRESENT_NO_MUTATION",
        smokePrincipalId: existing.id,
        userId: existing.userId,
        tenantSlug: existing.user.tenant.slug,
        provisionReceipt: existing.provisionReceipt,
        expiresAtUtc: existing.expiresAt.toISOString(),
      };
    }

    if (!credential || credential.length < 16) {
      throw new BadRequestException("Smoke credential minimum uzunluk koşulunu sağlamıyor");
    }

    const credentialHash = await bcrypt.hash(credential, 10);
    const expiresAt = new Date(nowUtc.getTime() + SMOKE_PRINCIPAL_MAX_LIFETIME_SECONDS * 1000);
    // Receipt kimliği envelope KİMLİĞİNDEN türer; credential'dan DEĞİL.
    const provisionReceipt =
      "SMK-" +
      crypto
        .createHash("sha256")
        .update(`${envelope.nonce}|${envelope.packageManifestSha256}|${envelope.baselineSha256}`)
        .digest("hex")
        .slice(0, 16)
        .toUpperCase();

    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: envelope.tenantName, slug: envelope.tenantSlug },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: envelope.email,
          name: envelope.name,
          surname: envelope.surname,
          // Normal login yolu için parola YOKTUR: `login()` null-guard ile reddeder.
          passwordHash: null,
          // ÇEKİRDEK HÜKÜM: principal KALICI OLARAK pasiftir. RELEASE13'ün
          // `validateUser()`/`login()` fonksiyonları bunu her istekte reddeder.
          isActive: false,
        },
      });
      const principal = await tx.smokePrincipal.create({
        data: {
          userId: user.id,
          credentialHash,
          provisionNonce: envelope.nonce,
          provisionReceipt,
          expiresAt,
        },
      });
      return { tenant, user, principal };
    });

    return {
      outcome: "PROVISIONED",
      smokePrincipalId: created.principal.id,
      userId: created.user.id,
      tenantSlug: created.tenant.slug,
      provisionReceipt,
      expiresAtUtc: expiresAt.toISOString(),
    };
  }

  // ─────────────────────────────── SMOKE LOGIN (Faz B) ───────────────────────────────

  /**
   * Smoke login. Normal `/auth/login` bu principal'ı REDDEDER (isActive=false +
   * passwordHash null); bu uç TAMAMEN AYRIDIR ve yalnız smoke principal'a çalışır.
   *
   * Tüm başarısızlık dalları AYNI generic mesajı döner (enumeration-safe).
   */
  async login(email: string, tenantSlug: string, credential: string, nowUtc: Date): Promise<string> {
    if (!this.smokeToken.isEnabled()) {
      throw new UnauthorizedException(SMOKE_AUTH_FAILED_MESSAGE);
    }

    const principal = await this.prisma.smokePrincipal.findFirst({
      where: { user: { email, tenant: { slug: tenantSlug } } },
      include: { user: true },
    });

    // bcrypt maliyeti her dalda ÖDENİR ki "kayıt yok" ile "yanlış parola"
    // zamanlama üzerinden ayrışmasın.
    const hashToCompare =
      principal?.credentialHash ?? "$2b$10$0000000000000000000000000000000000000000000000000000";
    const credentialOk = await bcrypt.compare(credential ?? "", hashToCompare);

    if (!principal) throw new UnauthorizedException(SMOKE_AUTH_FAILED_MESSAGE);
    if (!credentialOk) throw new UnauthorizedException(SMOKE_AUTH_FAILED_MESSAGE);
    if (principal.status !== "ACTIVE") throw new UnauthorizedException(SMOKE_AUTH_FAILED_MESSAGE);
    if (principal.revokedAt !== null) throw new UnauthorizedException(SMOKE_AUTH_FAILED_MESSAGE);
    if (principal.expiresAt <= nowUtc) throw new UnauthorizedException(SMOKE_AUTH_FAILED_MESSAGE);
    // Fail-closed bütünlük kontrolü: bağlı User AKTİF OLMAMALIDIR. Aktifse veri
    // bütünlüğü bozulmuş demektir ve smoke yolu kapanır.
    if (principal.user.isActive) throw new UnauthorizedException(SMOKE_AUTH_FAILED_MESSAGE);

    const token = this.smokeToken.sign({
      userId: principal.userId,
      smokePrincipalId: principal.id,
      authGeneration: principal.authGeneration,
    });
    if (!token) throw new UnauthorizedException(SMOKE_AUTH_FAILED_MESSAGE);
    return token;
  }

  /**
   * Doğrulanmış smoke claim'lerinden kullanıcıyı ÇÖZER — her istekte DB'den
   * status/generation/expiry YENİDEN doğrulanır. Token'ın geçerli imzası TEK BAŞINA
   * yetmez (revoke ve generation artışı anında etkilidir).
   */
  async resolveActiveSmokeUser(claims: SmokeTokenClaims, nowUtc: Date): Promise<AuthUserProjectionSource> {
    const principal = await this.prisma.smokePrincipal.findUnique({
      where: { id: claims.spid },
      include: { user: { include: { tenant: true } } },
    });

    if (!principal) throw new UnauthorizedException();
    if (principal.userId !== claims.sub) throw new UnauthorizedException();
    if (principal.status !== "ACTIVE") throw new UnauthorizedException();
    if (principal.revokedAt !== null) throw new UnauthorizedException();
    if (principal.expiresAt <= nowUtc) throw new UnauthorizedException();
    if (principal.authGeneration !== claims.gen) throw new UnauthorizedException();
    if (principal.user.isActive) throw new UnauthorizedException();

    return principal.user;
  }

  // ─────────────────────────────── REVOKE (Faz E) ───────────────────────────────

  /**
   * Kanonik revoke. IDEMPOTENT: ikinci çağrı aynı sonucu döner, hata atmaz ve
   * ikinci bir mutation üretmez (lost-response sonrası güvenli tekrar).
   *
   * ÖNEMLİ SINIR: revoke bir TEMİZLİK işlemidir, rollback güvenlik sınırı DEĞİLDİR.
   * Revoke hiç çalışmasa bile principal RELEASE13 üzerinde kullanılamaz
   * (isActive=false + ayrı imza secret'ı + R13'te smoke route yokluğu).
   */
  async revoke(smokePrincipalId: string, nowUtc: Date): Promise<{
    outcome: "REVOKED" | "ALREADY_REVOKED_NO_MUTATION";
    smokePrincipalId: string;
    authGeneration: number;
  }> {
    const current = await this.prisma.smokePrincipal.findUnique({ where: { id: smokePrincipalId } });
    if (!current) throw new UnauthorizedException();

    if (current.status === "REVOKED" && current.revokedAt !== null) {
      return {
        outcome: "ALREADY_REVOKED_NO_MUTATION",
        smokePrincipalId: current.id,
        authGeneration: current.authGeneration,
      };
    }

    // Koşullu güncelleme: yalnız hâlâ ACTIVE ise yazar. Eşzamanlı ikinci revoke
    // `count === 0` görür ve mevcut durumu okur — kör ikinci yazma YOKTUR.
    const { count } = await this.prisma.smokePrincipal.updateMany({
      where: { id: smokePrincipalId, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: nowUtc,
        authGeneration: { increment: 1 },
      },
    });

    const after = await this.prisma.smokePrincipal.findUnique({ where: { id: smokePrincipalId } });
    if (!after) throw new UnauthorizedException();

    return {
      outcome: count === 1 ? "REVOKED" : "ALREADY_REVOKED_NO_MUTATION",
      smokePrincipalId: after.id,
      authGeneration: after.authGeneration,
    };
  }
}
