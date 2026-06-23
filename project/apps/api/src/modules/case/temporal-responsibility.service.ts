import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * WP-1d-1 — Temporal sorumluluk sorgusu (READ-ONLY). Sözleşme: docs/wp1d-temporal-responsibility-query-contract.md.
 *
 * Bu PR YALNIZ operasyon owner sorusunu cevaplar: "X tarihinde (asOf) Dosya Operasyon Sorumlusu kimdi?"
 * Kaynak = AuditLog CASE event'leri (entityId=caseId; metadata.changeType ∈ OPERATION_OWNER*). AuditLog
 * TEK otorite (ayrı temporal tablo yok). Legal-responsible (CASE_LAWYER) BU PR'da YOK (WP-1d-2).
 *
 * Confidence (yanlış kesinlik YASAK):
 *  - EVENT_CONFIRMED        : asOf'tan önceki son owner event'inden kesin.
 *  - INFERRED_FROM_SNAPSHOT : event yok ama asOf ufuk-içi → current snapshot'tan çıkarım (geçmişe kesin değil).
 *  - UNKNOWN_BEFORE_HORIZON : asOf, enstrümantasyon ufku öncesi (veya hiç owner audit'i yok).
 *
 * Tenant-scoped: her sorgu tenantId ile; başka tenant'ın audit event'i ASLA okunmaz.
 */

export const OPERATION_OWNER_CHANGE_TYPES = ["OPERATION_OWNER", "OPERATION_OWNER_INITIALIZED"] as const;

export type ResponsibilityConfidence =
  | "EVENT_CONFIRMED"
  | "INFERRED_FROM_SNAPSHOT"
  | "UNKNOWN_BEFORE_HORIZON";

export type OperationOwnerTemporalResult = {
  caseId: string;
  asOf: string;
  operationOwner: {
    type: "LAWYER" | "STAFF" | "NONE" | "UNKNOWN";
    id: string | null;
    confidence: ResponsibilityConfidence;
    sourceEventId?: string;
    changedByUserId?: string | null;
    effectiveAt?: string;
  };
  horizon: { instrumentationStartedAt?: string; note?: string };
};

export type LegalResponsibleTemporalResult = {
  caseId: string;
  asOf: string;
  legalResponsibleLawyer: {
    lawyerId: string | null;
    confidence: ResponsibilityConfidence;
    sourceEventId?: string;
    changedByUserId?: string | null;
    effectiveAt?: string;
  };
  horizon: { instrumentationStartedAt?: string; note?: string };
};

// metadata.changeType ∈ {OPERATION_OWNER, OPERATION_OWNER_INITIALIZED} (Prisma JSON path filtresi).
// NOT: gerçek audit değerleri bunlar (WP-1a 'OPERATION_OWNER' · WP-1d-pre 'OPERATION_OWNER_INITIALIZED').
const OWNER_CHANGE_TYPE_FILTER = {
  OR: [
    { metadata: { path: ["changeType"], equals: "OPERATION_OWNER" } },
    { metadata: { path: ["changeType"], equals: "OPERATION_OWNER_INITIALIZED" } },
  ],
};

@Injectable()
export class TemporalResponsibilityService {
  constructor(private prisma: PrismaService) {}

  async getOperationOwnerAt(
    tenantId: string,
    caseId: string,
    asOf: Date,
  ): Promise<OperationOwnerTemporalResult> {
    // 1. asOf'tan önceki (≤) SON owner event'i — tenant+case scoped; future event'ler createdAt:lte ile dışlanır.
    const ownerEvent = await this.prisma.auditLog.findFirst({
      where: {
        tenantId,
        entityType: "CASE",
        entityId: caseId,
        createdAt: { lte: asOf },
        ...OWNER_CHANGE_TYPE_FILTER,
      },
      orderBy: { createdAt: "desc" },
    });

    if (ownerEvent) {
      const nv = (ownerEvent.newValues as any) ?? {};
      return {
        caseId,
        asOf: asOf.toISOString(),
        operationOwner: {
          ...this.resolveOwner(nv.responsibleLawyerId ?? null, nv.responsibleStaffId ?? null),
          confidence: "EVENT_CONFIRMED",
          sourceEventId: ownerEvent.id,
          changedByUserId: ownerEvent.userId ?? null,
          effectiveAt: ownerEvent.createdAt.toISOString(),
        },
        horizon: {},
      };
    }

    // 2. Event yok → tenant enstrümantasyon ufku (ilk owner audit'i).
    const firstOwnerEvent = await this.prisma.auditLog.findFirst({
      where: { tenantId, entityType: "CASE", ...OWNER_CHANGE_TYPE_FILTER },
      orderBy: { createdAt: "asc" },
    });
    const horizonAt = firstOwnerEvent?.createdAt;

    if (!horizonAt || asOf < horizonAt) {
      return {
        caseId,
        asOf: asOf.toISOString(),
        operationOwner: { type: "UNKNOWN", id: null, confidence: "UNKNOWN_BEFORE_HORIZON" },
        horizon: {
          instrumentationStartedAt: horizonAt?.toISOString(),
          note: "asOf enstrümantasyon ufkundan önce (veya hiç owner audit'i yok); kesin owner event'i yok.",
        },
      };
    }

    // 3. asOf ufuk-içi ama bu dosyanın owner event'i yok → current snapshot'tan çıkarım (geçmişe kesin DEĞİL).
    const kase = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { responsibleLawyerId: true, responsibleStaffId: true },
    });
    if (!kase) {
      return {
        caseId,
        asOf: asOf.toISOString(),
        operationOwner: { type: "UNKNOWN", id: null, confidence: "UNKNOWN_BEFORE_HORIZON" },
        horizon: { instrumentationStartedAt: horizonAt.toISOString(), note: "Dosya bu tenant'ta bulunamadı." },
      };
    }
    return {
      caseId,
      asOf: asOf.toISOString(),
      operationOwner: {
        ...this.resolveOwner(kase.responsibleLawyerId, kase.responsibleStaffId),
        confidence: "INFERRED_FROM_SNAPSHOT",
      },
      horizon: {
        instrumentationStartedAt: horizonAt.toISOString(),
        note: "Bu dosya için asOf'a kadar owner event'i yok; current snapshot kullanıldı (geçmişe kesin teşmil edilemez).",
      },
    };
  }

  /**
   * WP-1d-2 — "X tarihinde (asOf) Hukuki Sorumlu Avukat kimdi?" (READ-ONLY, best-effort).
   * Kaynak: AuditLog CASE_LAWYER event'leri (isResponsible geçişleri). caseId eşleme:
   *  - metadata.caseId === caseId (WP-1d-2-pre yeni event'ler) → reliable → EVENT_CONFIRMED.
   *  - metadata.caseId yok (eski event) → canlı CaseLawyer junction (entityId→caseId) → INFERRED_FROM_SNAPSHOT.
   *  - eşlenemeyen (silinmiş junction) → reconstruction'da YOK SAYILIR.
   * SINIR (audit shape): CASE_LAWYER event'leri lawyerId'yi YALNIZ CREATE(newValues)/DELETE(oldValues)'da
   * taşır; promote/update/auto-promote lawyerId TAŞIMAZ → caseLawyerId→lawyerId map (CREATE/DELETE) + canlı
   * junction fallback ile çözülür; çözülemezse confidence düşürülür (lawyerId null → INFERRED). Yanlış kesinlik YASAK.
   */
  async getLegalResponsibleLawyerAt(
    tenantId: string,
    caseId: string,
    asOf: Date,
  ): Promise<LegalResponsibleTemporalResult> {
    const events = await this.prisma.auditLog.findMany({
      where: { tenantId, entityType: "CASE_LAWYER", createdAt: { lte: asOf } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    // caseLawyerId → lawyerId (CREATE newValues.lawyerId · DELETE oldValues.lawyerId).
    const lawyerByCl = new Map<string, string>();
    for (const e of events) {
      const nv = e.newValues as any;
      const ov = e.oldValues as any;
      const clId = e.entityId as string;
      if (nv?.lawyerId) lawyerByCl.set(clId, nv.lawyerId);
      else if (ov?.lawyerId && !lawyerByCl.has(clId)) lawyerByCl.set(clId, ov.lawyerId);
    }

    // caseId eşleme: metadata.caseId varsa reliable; yoksa canlı junction (caseId+lawyerId). Cache'li.
    const matchCache = new Map<string, { belongs: boolean; reliable: boolean; lawyerId: string | null }>();
    const matchEvent = async (e: any) => {
      const meta = e.metadata as any;
      if (meta?.caseId !== undefined && meta?.caseId !== null) {
        return { belongs: meta.caseId === caseId, reliable: true, lawyerId: null as string | null };
      }
      const clId = e.entityId as string;
      if (matchCache.has(clId)) return matchCache.get(clId)!;
      const cl = await this.prisma.caseLawyer.findUnique({
        where: { id: clId },
        select: { caseId: true, lawyerId: true },
      });
      const res = { belongs: cl?.caseId === caseId, reliable: false, lawyerId: cl?.lawyerId ?? null };
      matchCache.set(clId, res);
      return res;
    };

    // Kronolojik replay → asOf'taki sorumlu (exactly-one invariant).
    let current: { lawyerId: string | null; event: any; reliable: boolean } | null = null;
    for (const e of events) {
      const m = await matchEvent(e);
      if (!m.belongs) continue;
      const nv = e.newValues as any;
      const ov = e.oldValues as any;
      const makesResponsible = nv?.isResponsible === true;
      const removesResponsible = (e.action === "DELETE" && ov?.isResponsible === true) || nv?.isResponsible === false;
      if (makesResponsible) {
        const lid = nv?.lawyerId ?? lawyerByCl.get(e.entityId as string) ?? m.lawyerId ?? null;
        current = { lawyerId: lid, event: e, reliable: m.reliable && !!lid };
      } else if (removesResponsible && (!current || e.entityId === current.event?.entityId)) {
        current = { lawyerId: null, event: e, reliable: m.reliable };
      }
    }

    if (current?.event) {
      return {
        caseId,
        asOf: asOf.toISOString(),
        legalResponsibleLawyer: {
          lawyerId: current.lawyerId,
          confidence: current.reliable ? "EVENT_CONFIRMED" : "INFERRED_FROM_SNAPSHOT",
          sourceEventId: current.event.id,
          changedByUserId: current.event.userId ?? null,
          effectiveAt: current.event.createdAt.toISOString(),
        },
        horizon: {},
      };
    }

    // Reliable/inferred event yok → horizon + current snapshot.
    const firstEvent = await this.prisma.auditLog.findFirst({
      where: { tenantId, entityType: "CASE_LAWYER" },
      orderBy: { createdAt: "asc" },
    });
    const horizonAt = firstEvent?.createdAt;
    if (!horizonAt || asOf < horizonAt) {
      return {
        caseId,
        asOf: asOf.toISOString(),
        legalResponsibleLawyer: { lawyerId: null, confidence: "UNKNOWN_BEFORE_HORIZON" },
        horizon: {
          instrumentationStartedAt: horizonAt?.toISOString(),
          note: "asOf ufuk öncesi (veya hiç CASE_LAWYER audit'i yok).",
        },
      };
    }
    // tenant-safe: dosya bu tenant'ta mı? (CaseLawyer'da tenantId yok → case üzerinden doğrula)
    const kase = await this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
    if (!kase) {
      return {
        caseId,
        asOf: asOf.toISOString(),
        legalResponsibleLawyer: { lawyerId: null, confidence: "UNKNOWN_BEFORE_HORIZON" },
        horizon: { instrumentationStartedAt: horizonAt.toISOString(), note: "Dosya bu tenant'ta bulunamadı." },
      };
    }
    const responsible = await this.prisma.caseLawyer.findFirst({
      where: { caseId, isResponsible: true },
      select: { lawyerId: true },
    });
    return {
      caseId,
      asOf: asOf.toISOString(),
      legalResponsibleLawyer: { lawyerId: responsible?.lawyerId ?? null, confidence: "INFERRED_FROM_SNAPSHOT" },
      horizon: {
        instrumentationStartedAt: horizonAt.toISOString(),
        note: "Bu dosya için reliable CASE_LAWYER event'i yok; current snapshot kullanıldı (geçmişe kesin teşmil edilemez).",
      },
    };
  }

  private resolveOwner(
    lawyerId: string | null,
    staffId: string | null,
  ): { type: "LAWYER" | "STAFF" | "NONE"; id: string | null } {
    if (lawyerId) return { type: "LAWYER", id: lawyerId };
    if (staffId) return { type: "STAFF", id: staffId };
    return { type: "NONE", id: null };
  }
}
