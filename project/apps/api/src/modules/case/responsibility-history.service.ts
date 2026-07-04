// WP-1d-4c-1 — Sorumluluk DEĞİŞİM geçmişi (timeline) — READ-ONLY.
// Sözleşme: docs/wp1d4c-responsibility-history-endpoint-contract.md
// Mevcut point-in-time TemporalResponsibilityService DEĞİŞMEZ; bu ayrı bir okuma yoludur (findMany + replay).
// Kaynak: AuditLog (CASE owner event'leri + CASE_LAWYER isResponsible geçişleri). Yeni tablo/yazım YOK.
// Yanlış kesinlik YASAK: her olay kendi confidence'ı. Tenant-scoped; başka tenant event'i ASLA dönmez.

import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

// metadata.changeType ∈ {OPERATION_OWNER, OPERATION_OWNER_INITIALIZED} (temporal service ile aynı gerçek değerler).
const OWNER_CHANGE_TYPE_FILTER = {
  OR: [
    { metadata: { path: ["changeType"], equals: "OPERATION_OWNER" } },
    { metadata: { path: ["changeType"], equals: "OPERATION_OWNER_INITIALIZED" } },
  ],
};

export type PartyRef = { type: "LAWYER" | "STAFF" | "NONE" | "UNKNOWN"; id: string | null };
export type HistoryConfidence = "EVENT_CONFIRMED" | "INFERRED_FROM_SNAPSHOT" | "UNKNOWN_BEFORE_HORIZON";
export type HistoryEventType = "operationOwner" | "legalResponsibleLawyer";

export interface ResponsibilityHistoryEvent {
  id: string;
  type: HistoryEventType;
  effectiveAt: string;
  changedByUserId: string | null;
  confidence: HistoryConfidence;
  oldValue: PartyRef;
  newValue: PartyRef;
  sourceEventId: string;
  note?: string;
}

export interface ResponsibilityHistoryResult {
  caseId: string;
  from: string | null;
  to: string | null;
  events: ResponsibilityHistoryEvent[];
  horizon: { note?: string };
}

export interface ResponsibilityHistoryOptions {
  from?: Date;
  to?: Date;
  includeInferred?: boolean; // default true
  type?: HistoryEventType | "all"; // default "all"
}

function resolveOwner(lawyerId: any, staffId: any): PartyRef {
  if (lawyerId) return { type: "LAWYER", id: lawyerId };
  if (staffId) return { type: "STAFF", id: staffId };
  return { type: "NONE", id: null };
}

@Injectable()
export class ResponsibilityHistoryService {
  constructor(private prisma: PrismaService) {}

  async getResponsibilityHistory(
    tenantId: string,
    caseId: string,
    options: ResponsibilityHistoryOptions = {},
  ): Promise<ResponsibilityHistoryResult> {
    // Dosya bu tenant'ta mı? (event-yok ≠ dosya-yok; temporal service ile aynı davranış)
    const kase = await this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
    if (!kase) throw new NotFoundException("Dosya bulunamadı.");

    const includeInferred = options.includeInferred !== false; // default true
    const type = options.type ?? "all";
    const createdAtRange = this.buildCreatedAtRange(options.from, options.to);

    const events: ResponsibilityHistoryEvent[] = [];
    if (type === "all" || type === "operationOwner") {
      events.push(...(await this.operationOwnerEvents(tenantId, caseId, createdAtRange)));
    }
    if (type === "all" || type === "legalResponsibleLawyer") {
      events.push(...(await this.legalResponsibleEvents(tenantId, caseId, createdAtRange)));
    }

    // includeInferred=false → yalnız EVENT_CONFIRMED.
    const filtered = includeInferred ? events : events.filter((e) => e.confidence === "EVENT_CONFIRMED");
    // Kronolojik (artan effectiveAt; eşitlikte sourceEventId).
    filtered.sort((a, b) =>
      a.effectiveAt === b.effectiveAt ? a.sourceEventId.localeCompare(b.sourceEventId) : a.effectiveAt.localeCompare(b.effectiveAt),
    );

    return {
      caseId,
      from: options.from?.toISOString() ?? null,
      to: options.to?.toISOString() ?? null,
      events: filtered,
      horizon: {
        note:
          filtered.length === 0
            ? "Bu dosya için (verilen aralıkta) kayıtlı sorumluluk değişimi yok veya enstrümantasyon ufku öncesi."
            : undefined,
      },
    };
  }

  private buildCreatedAtRange(from?: Date, to?: Date): { createdAt?: { gte?: Date; lte?: Date } } {
    if (!from && !to) return {};
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    return { createdAt };
  }

  // --- Operation owner: CASE entityId=caseId, changeType OPERATION_OWNER* → EVENT_CONFIRMED ---
  private async operationOwnerEvents(
    tenantId: string,
    caseId: string,
    range: { createdAt?: { gte?: Date; lte?: Date } },
  ): Promise<ResponsibilityHistoryEvent[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { tenantId, entityType: "CASE", entityId: caseId, ...range, ...OWNER_CHANGE_TYPE_FILTER },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((e) => {
      const nv = (e.newValues as any) ?? {};
      const ov = (e.oldValues as any) ?? {};
      return {
        id: e.id,
        type: "operationOwner" as const,
        effectiveAt: e.createdAt.toISOString(),
        changedByUserId: e.userId ?? null,
        confidence: "EVENT_CONFIRMED" as const,
        oldValue: resolveOwner(ov.responsibleLawyerId, ov.responsibleStaffId),
        newValue: resolveOwner(nv.responsibleLawyerId, nv.responsibleStaffId),
        sourceEventId: e.id,
      };
    });
  }

  // --- Legal responsible: CASE_LAWYER isResponsible geçişleri (replay) ---
  // caseId eşleme: metadata.caseId===caseId → reliable (EVENT_CONFIRMED); yoksa canlı junction → INFERRED.
  private async legalResponsibleEvents(
    tenantId: string,
    caseId: string,
    range: { createdAt?: { gte?: Date; lte?: Date } },
  ): Promise<ResponsibilityHistoryEvent[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { tenantId, entityType: "CASE_LAWYER", ...range },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    // caseLawyerId → lawyerId (CREATE newValues.lawyerId / DELETE oldValues.lawyerId).
    const lawyerByCl = new Map<string, string>();
    for (const e of rows) {
      const nv = e.newValues as any;
      const ov = e.oldValues as any;
      const clId = e.entityId as string;
      if (nv?.lawyerId) lawyerByCl.set(clId, nv.lawyerId);
      else if (ov?.lawyerId && !lawyerByCl.has(clId)) lawyerByCl.set(clId, ov.lawyerId);
    }

    const matchCache = new Map<string, { belongs: boolean; reliable: boolean; lawyerId: string | null }>();
    const matchEvent = async (e: any) => {
      const meta = e.metadata as any;
      if (meta?.caseId !== undefined && meta?.caseId !== null) {
        return { belongs: meta.caseId === caseId, reliable: true, lawyerId: null as string | null };
      }
      const clId = e.entityId as string;
      if (matchCache.has(clId)) return matchCache.get(clId)!;
      const cl = await this.prisma.caseLawyer.findUnique({ where: { id: clId }, select: { caseId: true, lawyerId: true } });
      const res = { belongs: cl?.caseId === caseId, reliable: false, lawyerId: cl?.lawyerId ?? null };
      matchCache.set(clId, res);
      return res;
    };

    const out: ResponsibilityHistoryEvent[] = [];
    let currentLawyerId: string | null = null;
    for (const e of rows) {
      const m = await matchEvent(e);
      if (!m.belongs) continue;
      const nv = e.newValues as any;
      const ov = e.oldValues as any;
      const makesResponsible = nv?.isResponsible === true;
      const removesResponsible = (e.action === "DELETE" && ov?.isResponsible === true) || nv?.isResponsible === false;
      const inferredNote = m.reliable ? undefined : "caseId canlı junction'dan çıkarıldı (geçmişe kesin değil).";

      if (makesResponsible) {
        const lid = nv?.lawyerId ?? lawyerByCl.get(e.entityId as string) ?? m.lawyerId ?? null;
        out.push({
          id: e.id,
          type: "legalResponsibleLawyer",
          effectiveAt: e.createdAt.toISOString(),
          changedByUserId: e.userId ?? null,
          confidence: m.reliable && lid ? "EVENT_CONFIRMED" : "INFERRED_FROM_SNAPSHOT",
          oldValue: currentLawyerId ? { type: "LAWYER", id: currentLawyerId } : { type: "NONE", id: null },
          newValue: lid ? { type: "LAWYER", id: lid } : { type: "UNKNOWN", id: null },
          sourceEventId: e.id,
          note: inferredNote,
        });
        currentLawyerId = lid;
      } else if (removesResponsible) {
        out.push({
          id: e.id,
          type: "legalResponsibleLawyer",
          effectiveAt: e.createdAt.toISOString(),
          changedByUserId: e.userId ?? null,
          confidence: m.reliable ? "EVENT_CONFIRMED" : "INFERRED_FROM_SNAPSHOT",
          oldValue: currentLawyerId ? { type: "LAWYER", id: currentLawyerId } : { type: "UNKNOWN", id: null },
          newValue: { type: "NONE", id: null },
          sourceEventId: e.id,
          note: inferredNote,
        });
        currentLawyerId = null;
      }
    }
    return out;
  }
}
