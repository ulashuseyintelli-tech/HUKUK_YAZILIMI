import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  ActingLawyerContext,
  ActingLawyerResolution,
  ResolvedActingLawyer,
} from "./acting-lawyer-resolver.types";

/**
 * UYAP-ACTING-LAWYER-RESOLVER-I01 — authenticated user → canonical acting lawyer.
 *
 * Owner kararı (DECISION-1, RATIFIED): **MODEL B — ACTING-LAWYER MATCHED POA.**
 * Office membership, personnel status, case assignment, responsible-lawyer ataması,
 * admin/super-admin rolü, internal permission ve client-provided `lawyerId`
 * **tek başına execution authority DEĞİLDİR** (`UYAP-CONST-002`, `UYAP-BC-OFFICE-001`).
 *
 * Canonical kural:
 * ```
 * Lawyer WHERE userId = authenticated user id
 *              AND tenantId = authenticated tenant id
 *              AND isActive = true
 * ```
 * `Lawyer.userId` `@unique` olduğu için normalde en fazla 1 kayıt döner; buna rağmen
 * `findMany` + sayım ile **fail-closed ambiguity guard** uygulanır (veri bozulması sessizce
 * authority üretemez).
 *
 * Tenant doğrulaması **çocuğun kendi `tenantId` kolonundan** yapılır: sorgu `userId` ile
 * yapılır, tenant eşitliği sonradan karşılaştırılır. Böylece cross-tenant bir bağ
 * "kayıt yok" gibi sessizce yutulmaz, `LAWYER_TENANT_MISMATCH` ile fail-closed raporlanır.
 * Yabancı tenant'a ait hiçbir alan çağırana DÖNMEZ (yalnız hata kodu).
 *
 * <remarks>
 * Cagrildigi yerler:
 * - (I01) henüz UYAP çağrı zincirine bağlanmadı; bağlama UYAP-CPE-AUTHORITY-FACT-BRIDGE-I01'dedir.
 * - LawyerModule.exports üzerinden tüketiciler (UYAP authority resolver) enjekte eder.
 * </remarks>
 */
@Injectable()
export class ActingLawyerResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fail-closed çözümleme. Exception fırlatmaz; CPE fact üretimi bu sonucu tüketir.
   */
  async tryResolve(context: ActingLawyerContext): Promise<ActingLawyerResolution> {
    // Eksik/boş server-side context → authority üretilemez (fail-closed).
    if (!context?.userId || !context?.tenantId) {
      return { resolved: false, failureCode: "ACTING_LAWYER_NOT_RESOLVED" };
    }

    // `userId` ile sorgula (Lawyer.userId @unique). Tenant eşitliği AŞAĞIDA kendi kolonundan
    // doğrulanır; tenant'ı sorguya koyup cross-tenant bağı "bulunamadı"ya çevirmeyiz.
    const matches = await this.prisma.lawyer.findMany({
      where: { userId: context.userId },
      select: { id: true, tenantId: true, isActive: true },
      take: 2, // ambiguity tespiti için 2 yeterli; tüm tabloyu çekme
    });

    if (matches.length === 0) {
      return { resolved: false, failureCode: "ACTING_LAWYER_NOT_RESOLVED" };
    }
    if (matches.length > 1) {
      // `@unique` ihlali veya veri bozulması → sessiz seçim YASAK.
      return { resolved: false, failureCode: "ACTING_LAWYER_AMBIGUOUS" };
    }

    const candidate = matches[0];

    // INV-04: acting lawyer tenant'ı authenticated tenant ile AYNI olmalıdır.
    if (candidate.tenantId !== context.tenantId) {
      return { resolved: false, failureCode: "LAWYER_TENANT_MISMATCH" };
    }

    // Pasif avukat hukuki aktör olamaz.
    if (candidate.isActive !== true) {
      return { resolved: false, failureCode: "ACTING_LAWYER_NOT_RESOLVED" };
    }

    const actingLawyer: ResolvedActingLawyer = {
      lawyerId: candidate.id,
      userId: context.userId,
      tenantId: context.tenantId,
    };
    return { resolved: true, actingLawyer };
  }

  /**
   * Doğrudan çağrı yolları için fail-closed varyant.
   * Dış mesaj GENERIC'tir (authority ilişkilerinin enumeration'ını önler); ayrıntı
   * yalnız `code` alanında taşınır ve decision-log/evidence tarafında kullanılır.
   */
  async resolveOrThrow(context: ActingLawyerContext): Promise<ResolvedActingLawyer> {
    const resolution = await this.tryResolve(context);
    if (resolution.resolved) {
      return resolution.actingLawyer;
    }
    throw new ForbiddenException({
      code: resolution.failureCode,
      message: "İşlem yapılamaz: yetki doğrulanamadı",
      details: "Bu işlem için geçerli avukat yetkisi çözümlenemedi",
    });
  }
}
