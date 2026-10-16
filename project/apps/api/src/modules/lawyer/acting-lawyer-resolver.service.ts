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
 * **EK KOŞUL (owner Ek 94 karar a2 + Ek 95 K1 / K3, 16.10.2026 — güvenlik paketi 01 / P5):** onaylanan
 * UYAP gönderim ailesinde (document/submit, lawsuit/{criminal,civil}, xml/submit) aktör, MODEL B vekaletine
 * EK olarak dosyada GEÇERLİ avukat ataması taşımalıdır (`isAssignedToCase` — CaseLawyer; dosya ve avukat
 * kaydı aynı kiracı; avukat kaydı etkin; rol RESPONSIBLE / ASSIGNED; stajyer kaydı değil). Hazırlık ve
 * ödeme emri test ucu bu koşulu taşımaz (Ek 95 K1). İki koşul KONJONKTİFTİR: atama tek başına
 * yetki VERMEZ (yukarıdaki kural aynen geçerli), vekalet de tek başına artık yeterli DEĞİLDİR.
 * Dosyaya atanmamış aktör ve avukatsız dosya → RET (fail-closed). Personelin avukat adına gönderimi
 * AÇILMAZ (atama yalnız `Lawyer` kaydına bağlanır). Okuma uçları (ör. `validateCasePoaForUyap`)
 * bu koşuldan ETKİLENMEZ.
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
 * - `isAssignedToCase`: UyapAuthorityFactProvider.compute() → `actor.is_assigned_to_case` olgusu (P5).
 * </remarks>
 */
/**
 * UYAP-AUTHORITY-FRESHNESS-TX-I01: bu resolver'ın ihtiyaç duyduğu MİNİMUM okuma yüzeyi.
 * Hem `PrismaService` hem `Prisma.TransactionClient` bu şekle uyar; böylece aynı çözümleme
 * mantığı transaction içinde de çalıştırılabilir (kopyalama YOK).
 */
export type ActingLawyerReadClient = {
  lawyer: { findMany: PrismaService["lawyer"]["findMany"] };
};

/**
 * P5 (owner Ek 95 K3): geçerli avukat ataması sayılan `CaseLawyerRole` değerleri (izin listesi; kapalı küme).
 * RESPONSIBLE = "Sorumlu avukat", ASSIGNED = "Atanmış avukat" (schema.prisma). ASSISTANT / INTERN ve listede olmayan her değer SAYILMAZ.
 */
export const CASE_ASSIGNMENT_COUNTED_ROLES: ReadonlySet<string> = new Set(["RESPONSIBLE", "ASSIGNED"]);

/** P5 (owner Ek 94): dosya ataması denetiminin MİNİMUM okuma yüzeyi (PrismaService / TransactionClient). */
export type ActingLawyerAssignmentReadClient = {
  caseLawyer: { findMany: PrismaService["caseLawyer"]["findMany"] };
};

@Injectable()
export class ActingLawyerResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fail-closed çözümleme. Exception fırlatmaz; CPE fact üretimi bu sonucu tüketir.
   *
   * @param client UYAP-AUTHORITY-FRESHNESS-TX-I01 — opsiyonel transaction client.
   *   Verilirse okuma ÇAĞIRANIN transaction'ı içinde yapılır; TX-1 revalidation aynı
   *   çözümleme mantığını kopyalamadan yeniden kullanabilsin diye. Verilmezse davranış
   *   ve sorgu şekli BİREBİR aynıdır.
   */
  async tryResolve(
    context: ActingLawyerContext,
    client: ActingLawyerReadClient = this.prisma,
  ): Promise<ActingLawyerResolution> {
    // Eksik/boş server-side context → authority üretilemez (fail-closed).
    if (!context?.userId || !context?.tenantId) {
      return { resolved: false, failureCode: "ACTING_LAWYER_NOT_RESOLVED" };
    }

    // `userId` ile sorgula (Lawyer.userId @unique). Tenant eşitliği AŞAĞIDA kendi kolonundan
    // doğrulanır; tenant'ı sorguya koyup cross-tenant bağı "bulunamadı"ya çevirmeyiz.
    const matches = await client.lawyer.findMany({
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
   * P5 (owner Ek 94, karar a2) — çözümlenmiş acting lawyer dosyaya ETKİN biçimde atanmış mı?
   *
   * `true` YALNIZ şu durumda: `CaseLawyer(caseId, lawyerId = actingLawyerId)` satırı TEK ve
   * dosyanın `tenantId`'si = kimliği doğrulanmış kiracı VE avukat kaydının `tenantId`'si = aynı kiracı
   * VE avukat kaydı `isActive = true`. `CaseLawyer` modelinde ayrı bir etkinlik / bitiş kolonu YOKTUR;
   * atamanın etkinliği satırın varlığıdır (atama kaldırma satırı siler).
   *
   * **Geçerli avukat ataması (owner Ek 95 K3):** `CaseLawyer.role` ∈ {RESPONSIBLE, ASSIGNED}
   * (`CASE_ASSIGNMENT_COUNTED_ROLES`) VE avukat kaydı stajyer DEĞİL (`Lawyer.lawyerRank !== INTERN` ve eski alan
   * `Lawyer.role !== INTERN`). ASSISTANT ("Yardımcı") ve INTERN ("Stajyer") dosya rolleri tek başına atama SAYILMAZ.
   * Bilinmeyen / ileride eklenecek rol değeri de sayılmaz (izin listesi; fail-closed).
   * BİLİNEN ANLAM BELİRSİZLİĞİ (uydurulmadı, PR'da raporlandı): dosya açılışında rütbesi LAWYER olan avukat
   * `CaseLawyerRole.ASSISTANT` alır (case.service.ts "Avukat → Yardımcı"); bu kayıt da sayılmaz.
   *
   * Fail-closed: eksik girdi, satır yok (avukatsız dosya dahil), birden fazla satır (`@@unique` ihlali),
   * kiracı uyuşmazlığı, pasif avukat, sayılmayan rol veya stajyer kaydı → `false`. Exception fırlatmaz; okuma yalnızca `select` ile
   * yapılır ve yabancı kiracıya ait hiçbir alan çağırana dönmez. Atama TEK BAŞINA yetki değildir:
   * çağıran (UyapAuthorityFactProvider) bunu MODEL B vekalet kararına EK koşul olarak kullanır.
   */
  async isAssignedToCase(
    params: { actingLawyerId: string; caseId: string; tenantId: string },
    client: ActingLawyerAssignmentReadClient = this.prisma,
  ): Promise<boolean> {
    if (!params?.actingLawyerId || !params?.caseId || !params?.tenantId) {
      return false;
    }
    const rows = await client.caseLawyer.findMany({
      where: { caseId: params.caseId, lawyerId: params.actingLawyerId },
      select: {
        id: true,
        role: true,
        case: { select: { tenantId: true } },
        lawyer: { select: { tenantId: true, isActive: true, lawyerRank: true, role: true } },
      },
      take: 2, // `@@unique([caseId, lawyerId])` ihlalini görmek için 2 yeterli
    });
    if (rows.length !== 1) {
      return false;
    }
    const row = rows[0];
    return (
      row.case?.tenantId === params.tenantId &&
      row.lawyer?.tenantId === params.tenantId &&
      row.lawyer?.isActive === true &&
      CASE_ASSIGNMENT_COUNTED_ROLES.has(String(row.role)) &&
      String(row.lawyer?.lawyerRank) !== "INTERN" &&
      String(row.lawyer?.role) !== "INTERN"
    );
  }

  /**
   * Doğrudan çağrı yolları için fail-closed varyant.
   * Dış mesaj GENERIC'tir (authority ilişkilerinin enumeration'ını önler); ayrıntı
   * yalnız `code` alanında taşınır ve decision-log/evidence tarafında kullanılır.
   */
  async resolveOrThrow(
    context: ActingLawyerContext,
    client: ActingLawyerReadClient = this.prisma,
  ): Promise<ResolvedActingLawyer> {
    const resolution = await this.tryResolve(context, client);
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
