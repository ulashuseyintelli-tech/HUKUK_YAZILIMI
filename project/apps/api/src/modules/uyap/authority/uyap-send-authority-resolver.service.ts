import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  AuthorityEvidenceRef,
  UyapAuthorityDecision,
  UyapAuthorityFailureCode,
  UyapSendAuthorityContext,
  UyapSendAuthorityOperation,
  UyapSendAuthorityOperationType,
  UYAP_SEND_AUTHORITY_VERSION,
} from "./uyap-send-authority.types";

/**
 * I15-D1 (OWNER LEGAL DECISION, RATIFIED — HMK m.73/m.74, İİK m.78): hangi POA
 * `scopeType` değerinin hangi operasyonu kapsadığının kanonik haritası. Bu harita
 * operasyon-BAĞIMSIZ tek bir kural DEĞİLDİR — her operasyon kendi ayrı, owner-onaylı
 * satırına sahiptir. Yeni bir operasyon eklerken bu haritaya SESSİZCE bir satır
 * eklenmez; owner'ın ayrı bir hukuki kapsam kararı vermesi gerekir.
 *
 * UYAP_SEND: mevcut, önceden ratifiye edilmiş davranış — DEĞİŞTİRİLMEDİ.
 * TRIGGER_HACIZ: İİK m.78 haciz isteme hakkı için ayrıca özel vekalet şartı
 *   getirmez; HMK m.74 yalnız "haczin kaldırılması" gibi tasarrufi işlemler için
 *   özel yetki arar — haciz TALEBİ bunların dışındadır. BU_DOSYA/OZEL için
 *   structured operation-coverage metadata'sı yoktur; isimden yetki türetilmez.
 */
const OPERATION_ALLOWED_POA_SCOPES: Readonly<
  Record<UyapSendAuthorityOperationType, ReadonlySet<string>>
> = {
  [UyapSendAuthorityOperation.UYAP_SEND]: new Set(["GENEL", "ICRA_TAKIP"]),
  [UyapSendAuthorityOperation.TRIGGER_HACIZ]: new Set(["GENEL", "ICRA_TAKIP"]),
};

/** Lifecycle/scope değerlendirmesinden geçen tek bir POA adayı. */
interface PoaCandidate {
  id: string;
  clientId: string;
  tenantId: string;
  status: string;
  isActive: boolean;
  dateIssued: Date | null;
  isLimited: boolean;
  validUntil: Date | null;
  scopeType: string;
  updatedAt: Date;
  poaLawyerId: string;
}

/**
 * UYAP_SEND için canonical yetki zinciri (MODEL B).
 *
 * ```
 * authenticated user + tenant
 *   → (I01) canonical actingLawyerId
 *   → tenant-scoped Case → CaseClient → tenant-scoped Client
 *   → ClientPowerOfAttorney ∋ PoaLawyer(actingLawyerId)   [POA actor'a EŞLEŞİR]
 *   → temporal + revocation + scope
 *   → UyapAuthorityDecision
 * ```
 *
 * **KONJONKTİF KURAL:** Repository'de "hangi client authority üretir" için canonical seçim kuralı
 * YOKTUR (`CaseClient.role` yalnız ALACAKLI/ORTAK_ALACAKLI ayrımıdır, öncelik taşımaz). Bu nedenle
 * seçim yapmak yerine **case'in HER client'ı** için acting lawyer'a ait geçerli POA aranır; biri
 * bile karşılanmazsa fail-closed. Tek client'lı case bu kuralın özel halidir.
 *
 * **ÇOKLU GEÇERLİ POA:** Aynı client için birden fazla geçerli POA hukuken aynı sonucu üretir;
 * hepsi `poaId` ASC sırayla evidence'a yazılır (deterministik immutable set). "Geçerli olanı seç,
 * ötekini yok say" biçiminde fail-open bir seçim YAPILMAZ.
 *
 * **ÇELİŞKİLİ KAYIT:** `status`/`isActive` kendi içinde tutarsız bir POA (ör. status ACTIVE ama
 * isActive=false) `AUTHORITY_RECORD_CONFLICT` ile fail-closed'dır — bu bir veri bütünlüğü
 * çelişkisidir ve sessizce yorumlanamaz. Süresi dolmuş/azledilmiş ESKİ bir POA'nın yanında
 * geçerli YENİ bir POA bulunması çelişki değil, olağan vekâlet ardıllığıdır.
 *
 * Bu servis **side-effect üretmez** (yalnız okuma) ve exception fırlatmaz; CPE fact üretimi
 * (I04) yapısal kararı tüketir.
 */
/**
 * UYAP-AUTHORITY-FRESHNESS-TX-I01: bu resolver'ın ihtiyaç duyduğu MİNİMUM okuma yüzeyi.
 * Hem `PrismaService` hem `Prisma.TransactionClient` bu şekle uyar → aynı yetki mantığı
 * TX-1 revalidation'da KOPYALANMADAN yeniden çalıştırılabilir.
 */
export type UyapSendAuthorityReadClient = {
  case: { findFirst: PrismaService["case"]["findFirst"]; count: PrismaService["case"]["count"] };
  clientPowerOfAttorney: {
    findMany: PrismaService["clientPowerOfAttorney"]["findMany"];
  };
};

@Injectable()
export class UyapSendAuthorityResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param client UYAP-AUTHORITY-FRESHNESS-TX-I01 — opsiyonel transaction client.
   *   Verilirse TÜM okumalar çağıranın transaction'ı içinde yapılır. Verilmezse
   *   davranış ve sorgu şekli BİREBİR aynıdır.
   */
  async resolve(
    context: UyapSendAuthorityContext,
    client: UyapSendAuthorityReadClient = this.prisma,
  ): Promise<UyapAuthorityDecision> {
    const base = {
      tenantId: context?.tenantId,
      userId: context?.authenticatedUserId,
      actingLawyerId: context?.actingLawyerId,
      caseId: context?.caseId,
      operationType: context?.operationType,
      evaluatedAt: context?.evaluatedAt,
      authorityVersion: UYAP_SEND_AUTHORITY_VERSION,
    };

    const deny = (failureCode: UyapAuthorityFailureCode, clientId?: string): UyapAuthorityDecision => ({
      ...(base as Omit<UyapAuthorityDecision, "allowed" | "authorityEvidence" | "failureCode" | "clientId">),
      allowed: false,
      clientId,
      authorityEvidence: [],
      failureCode,
    });

    // 0) Bağlam bütünlüğü — eksik server-side alan authority üretemez.
    // I15-D1: `operationType` ARTIK serbest string değil — yalnız OPERATION_ALLOWED_POA_SCOPES
    // içinde owner-ratifiye kanonik bir satırı olan değerler kabul edilir. Tanınmayan/bilinmeyen
    // bir operationType (teorik olarak yalnız runtime cast/bug ile ulaşılabilir; tip sistemi
    // derleme-zamanında zaten kısıtlar) GENEL/ICRA_TAKIP kuralından SESSİZCE geçemez.
    if (
      !context?.tenantId ||
      !context?.authenticatedUserId ||
      !context?.actingLawyerId ||
      !context?.caseId ||
      !context?.operationType ||
      !Object.prototype.hasOwnProperty.call(OPERATION_ALLOWED_POA_SCOPES, context.operationType) ||
      !(context?.evaluatedAt instanceof Date) ||
      Number.isNaN(context.evaluatedAt.getTime())
    ) {
      return deny("AUTHORITY_CONTEXT_INVALID");
    }

    // 1) Case tenant-scoped okunur. Cross-tenant caseId "bulunamadı"ya çevrilmez; varlık
    //    yalnız COUNT ile yoklanır (yabancı tenant satırından hiçbir alan okunmaz).
    const caseRow = await client.case.findFirst({
      where: { id: context.caseId, tenantId: context.tenantId },
      select: {
        id: true,
        tenantId: true,
        caseClients: { select: { clientId: true, client: { select: { id: true, tenantId: true } } } },
      },
    });

    if (!caseRow) {
      const existsElsewhere = await client.case.count({ where: { id: context.caseId } });
      return deny(existsElsewhere > 0 ? "CASE_TENANT_MISMATCH" : "CASE_NOT_FOUND");
    }

    // 2) Temsil zinciri: case → CaseClient → Client (hepsi aynı tenant).
    const caseClients = caseRow.caseClients ?? [];
    if (caseClients.length === 0) {
      return deny("CASE_CLIENT_MISMATCH");
    }
    const crossTenantClient = caseClients.find(
      (cc) => !cc.client || cc.client.tenantId !== context.tenantId,
    );
    if (crossTenantClient) {
      return deny("CLIENT_TENANT_MISMATCH", crossTenantClient.clientId);
    }

    const clientIds = [...new Set(caseClients.map((cc) => cc.clientId))].sort();
    const singleClientId = clientIds.length === 1 ? clientIds[0] : undefined;

    // 3) Acting lawyer'a EŞLEŞEN POA'lar (tenant her katmanda doğrulanır).
    const poaRows = await client.clientPowerOfAttorney.findMany({
      where: {
        tenantId: context.tenantId,
        clientId: { in: clientIds },
        lawyers: { some: { lawyerId: context.actingLawyerId, tenantId: context.tenantId } },
      },
      select: {
        id: true,
        clientId: true,
        tenantId: true,
        status: true,
        isActive: true,
        dateIssued: true,
        isLimited: true,
        validUntil: true,
        scopeType: true,
        updatedAt: true,
        lawyers: {
          where: { lawyerId: context.actingLawyerId, tenantId: context.tenantId },
          select: { id: true, lawyerId: true, tenantId: true },
        },
      },
      orderBy: { id: "asc" },
    });

    const candidates: PoaCandidate[] = poaRows
      .filter((p) => p.lawyers.length > 0)
      .map((p) => ({
        id: p.id,
        clientId: p.clientId,
        tenantId: p.tenantId,
        status: String(p.status),
        isActive: p.isActive,
        dateIssued: p.dateIssued,
        isLimited: p.isLimited,
        validUntil: p.validUntil,
        scopeType: String(p.scopeType),
        updatedAt: p.updatedAt,
        poaLawyerId: p.lawyers[0].id,
      }));

    // 4) HER client için ayrı ayrı değerlendirme (konjonktif).
    const evidence: AuthorityEvidenceRef[] = [];
    for (const clientId of clientIds) {
      const forClient = candidates.filter((c) => c.clientId === clientId);
      if (forClient.length === 0) {
        return deny("POWER_OF_ATTORNEY_MISSING", clientId);
      }

      // 4a) Kendi içinde çelişkili kayıt → sessiz yorum YASAK.
      const contradictory = forClient.find((c) => this.isContradictory(c));
      if (contradictory) {
        return deny("AUTHORITY_RECORD_CONFLICT", clientId);
      }

      const valid: PoaCandidate[] = [];
      const failures: UyapAuthorityFailureCode[] = [];
      for (const candidate of forClient) {
        const failure = this.evaluate(candidate, context.evaluatedAt, context.operationType);
        if (failure) failures.push(failure);
        else valid.push(candidate);
      }

      if (valid.length === 0) {
        return deny(this.mostSpecific(failures), clientId);
      }

      for (const v of valid) {
        evidence.push({
          poaId: v.id,
          clientId: v.clientId,
          tenantId: v.tenantId,
          poaLawyerId: v.poaLawyerId,
          poaUpdatedAt: v.updatedAt,
          poaStatus: v.status,
          poaScopeType: v.scopeType,
          // I05: semantik yürürlük alanları (updatedAt tek başına yeterli değil).
          poaIsActive: v.isActive,
          poaIsLimited: v.isLimited,
          poaDateIssued: v.dateIssued,
          poaValidUntil: v.validUntil,
        });
      }
    }

    // Deterministik immutable evidence seti.
    evidence.sort((a, b) => (a.poaId < b.poaId ? -1 : a.poaId > b.poaId ? 1 : 0));

    return {
      tenantId: context.tenantId,
      userId: context.authenticatedUserId,
      actingLawyerId: context.actingLawyerId,
      caseId: context.caseId,
      clientId: singleClientId,
      operationType: context.operationType,
      evaluatedAt: context.evaluatedAt,
      allowed: true,
      authorityEvidence: evidence,
      authorityVersion: UYAP_SEND_AUTHORITY_VERSION,
    };
  }

  /** `status` ile `isActive` birbirini yalanlıyorsa kayıt çelişkilidir. */
  private isContradictory(c: PoaCandidate): boolean {
    if (c.status === "ACTIVE" && c.isActive !== true) return true;
    if (c.status !== "ACTIVE" && c.isActive === true && c.status === "REVOKED") return true;
    return false;
  }

  /** Tek bir POA'nın lifecycle + scope değerlendirmesi. `undefined` = geçerli. */
  private evaluate(
    c: PoaCandidate,
    at: Date,
    operationType: UyapSendAuthorityOperationType,
  ): UyapAuthorityFailureCode | undefined {
    if (c.status === "REVOKED") return "POWER_OF_ATTORNEY_REVOKED";
    if (c.status === "EXPIRED") return "POWER_OF_ATTORNEY_EXPIRED";
    if (c.status !== "ACTIVE") return "POWER_OF_ATTORNEY_NOT_EFFECTIVE"; // PENDING vb.
    if (c.isActive !== true) return "POWER_OF_ATTORNEY_REVOKED"; // soft-delete eşdeğeri

    // Yürürlük: düzenleme tarihi zorunlu ve gelecekte olamaz.
    if (!c.dateIssued) return "POWER_OF_ATTORNEY_NOT_EFFECTIVE";
    if (c.dateIssued.getTime() > at.getTime()) return "POWER_OF_ATTORNEY_NOT_EFFECTIVE";

    // Süreli vekâlette bitiş tarihi ZORUNLU (belirsiz süre → fail-closed).
    if (c.isLimited) {
      if (!c.validUntil) return "POWER_OF_ATTORNEY_NOT_EFFECTIVE";
      if (c.validUntil.getTime() < at.getTime()) return "POWER_OF_ATTORNEY_EXPIRED";
    } else if (c.validUntil && c.validUntil.getTime() < at.getTime()) {
      // Süresiz işaretli olsa bile geçmiş bir bitiş tarihi taşıyorsa fail-closed.
      return "POWER_OF_ATTORNEY_EXPIRED";
    }

    // Kapsam: I15-D1 — operasyona özel, owner-ratifiye harita (OPERATION_ALLOWED_POA_SCOPES).
    // BU_DOSYA → canonical POA↔Case bağı şemada YOK (owner DECISION-2 ile eklenmedi) → RED.
    // OZEL     → makine-doğrulanabilir kapsam yok → RED.
    if (!OPERATION_ALLOWED_POA_SCOPES[operationType].has(c.scopeType)) {
      return "POWER_OF_ATTORNEY_SCOPE_MISMATCH";
    }

    return undefined;
  }

  /** Aynı client için birden çok ret nedeni varsa en belirleyici olanı raporla. */
  private mostSpecific(failures: UyapAuthorityFailureCode[]): UyapAuthorityFailureCode {
    const priority: UyapAuthorityFailureCode[] = [
      "AUTHORITY_RECORD_CONFLICT",
      "POWER_OF_ATTORNEY_REVOKED",
      "POWER_OF_ATTORNEY_EXPIRED",
      "POWER_OF_ATTORNEY_NOT_EFFECTIVE",
      "POWER_OF_ATTORNEY_SCOPE_MISMATCH",
    ];
    for (const code of priority) {
      if (failures.includes(code)) return code;
    }
    return "POWER_OF_ATTORNEY_MISSING";
  }
}
