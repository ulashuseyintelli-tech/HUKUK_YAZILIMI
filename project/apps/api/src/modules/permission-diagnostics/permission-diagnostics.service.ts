// WP-4c-1 — Phase 1 permission diagnostics servisi (READ-ONLY, saf).
// Hiçbir prisma/DB/mutation bağımlılığı YOK → tasarım gereği yan etkisiz. Enforcement DEĞİL:
// "wouldDeny" diyebilir ama hiçbir işlemi engellemez (block yapan kapı bu servis değil).

import { Injectable } from "@nestjs/common";
import {
  PERMISSION_DIAGNOSTICS_MAP,
  type CurrentGuard,
  type DiagnosticMapEntry,
} from "./permission-diagnostics-map";

export interface DiagnosticContext {
  /** Mevcut/simüle edilen kullanıcı rolü (UserRole; ör. ADMIN/USER/VIEWER). */
  role?: string | null;
}

/** boolean = kesin; "DEPENDS" = guard role-dışı faktöre bağlı; null = bilinmiyor. */
export type Tri = boolean | "DEPENDS" | null;

export interface PermissionDiagnostic {
  operation: string;
  endpoint: string;
  requiredPermission: string;
  requiredScope: string;
  currentGuard: CurrentGuard;
  wouldAllow: Tri;
  wouldDeny: Tri;
  reason: string;
  enforcementPhase: "PHASE_1_DIAGNOSTICS";
  note: string;
}

@Injectable()
export class PermissionDiagnosticsService {
  private static readonly NOTE = "Diagnostic only; no blocking behavior.";

  /** Tek bir operasyon için tanı üretir. Bilinmeyen operasyon → UNKNOWN_NEEDS_REVIEW. */
  diagnose(operation: string, ctx: DiagnosticContext = {}): PermissionDiagnostic {
    const entry = PERMISSION_DIAGNOSTICS_MAP[operation];
    if (!entry) {
      return {
        operation,
        endpoint: "(unknown)",
        requiredPermission: "(unknown)",
        requiredScope: "N/A",
        currentGuard: "UNKNOWN_NEEDS_REVIEW",
        wouldAllow: null,
        wouldDeny: null,
        reason: "Operation diagnostics haritasında yok; gözden geçirilmeli.",
        enforcementPhase: "PHASE_1_DIAGNOSTICS",
        note: PermissionDiagnosticsService.NOTE,
      };
    }
    const { wouldAllow, reason } = this.evaluate(entry, ctx);
    const wouldDeny: Tri =
      wouldAllow === true ? false : wouldAllow === false ? true : wouldAllow; // "DEPENDS"/null passthrough
    return {
      operation: entry.operation,
      endpoint: entry.endpoint,
      requiredPermission: entry.requiredPermission,
      requiredScope: entry.requiredScope,
      currentGuard: entry.currentGuard,
      wouldAllow,
      wouldDeny,
      reason,
      enforcementPhase: "PHASE_1_DIAGNOSTICS",
      note: PermissionDiagnosticsService.NOTE,
    };
  }

  /** Haritadaki tüm operasyonlar için tanı listesi (verilen role bağlamıyla). */
  diagnoseAll(ctx: DiagnosticContext = {}): PermissionDiagnostic[] {
    return Object.keys(PERMISSION_DIAGNOSTICS_MAP).map((op) => this.diagnose(op, ctx));
  }

  // Gerçek permission-tree henüz yok → wouldAllow MEVCUT guard durumundan türetilir (role tahmini yapılmaz).
  private evaluate(
    entry: DiagnosticMapEntry,
    ctx: DiagnosticContext,
  ): { wouldAllow: Tri; reason: string } {
    const role = ctx.role ?? null;
    const isAdmin = role === "ADMIN";
    switch (entry.currentGuard) {
      case "ADMIN_HARD_GUARD":
        return isAdmin
          ? { wouldAllow: true, reason: "Current user has ADMIN role / current guard allows operation" }
          : { wouldAllow: false, reason: `Mevcut guard ADMIN gerektiriyor; kullanıcı rolü '${role ?? "bilinmiyor"}'` };
      case "TENANT_ONLY":
        return {
          wouldAllow: true,
          reason: "Bugün tenant-scoping dışında enforcement yok; tenant içindeki her kullanıcı izinli",
        };
      case "DECORATIVE_ONLY":
        return {
          wouldAllow: true,
          reason: "İzin alanı saklanıyor ama enforce edilmiyor; işlem bugün izinli",
        };
      case "CPE_GUARDED":
        return {
          wouldAllow: "DEPENDS",
          reason: "Case Policy Engine (fact+state) kapısına bağlı; role'e değil CPE değerlendirmesine bağlı",
        };
      case "HARD_LEGAL_GUARD_EXISTS":
        return {
          wouldAllow: "DEPENDS",
          reason: "Hukuki hard guard geçerli (ör. hukuki sorumlu yalnız avukat olabilir); hukuki bağlama bağlı",
        };
      case "UNKNOWN_NEEDS_REVIEW":
        return { wouldAllow: null, reason: "Canlı endpoint yok / mevcut guard bilinmiyor; gözden geçirilmeli" };
    }
  }
}
