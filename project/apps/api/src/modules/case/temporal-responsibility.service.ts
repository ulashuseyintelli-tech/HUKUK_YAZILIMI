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

  private resolveOwner(
    lawyerId: string | null,
    staffId: string | null,
  ): { type: "LAWYER" | "STAFF" | "NONE"; id: string | null } {
    if (lawyerId) return { type: "LAWYER", id: lawyerId };
    if (staffId) return { type: "STAFF", id: staffId };
    return { type: "NONE", id: null };
  }
}
