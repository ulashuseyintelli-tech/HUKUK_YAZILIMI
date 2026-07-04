// WP-4d-1 — Phase 2 warn-only audit emisyonu (READ-ONLY etki; BLOCK YOK).
// Seçili tenant-only operasyon çalıştığında, mevcut davranışı DEĞİŞTİRMEDEN, AuditLog'a bir
// PERMISSION_WOULD_DENY diagnostik event'i yazar. Sözleşme: docs/wp4d-warn-only-enforcement-contract.md
//
// DÜRÜSTLÜK: permission store YOK → bu event "bu kullanıcı kesin reddedilirdi" DEMEZ. Anlamı:
// "bu operasyon RBAC altında {requiredPermission}@{scope} gerektirecek; bugün tenant-only davranışıyla izin verildi".

import { Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PERMISSION_DIAGNOSTICS_MAP } from "./permission-diagnostics-map";

export interface WarnOnlyContext {
  tenantId: string;
  actorUserId?: string | null;
  /** İlgili kayıt id'si (varsa, ör. caseId); yoksa operation string'i kullanılır. */
  entityId?: string | null;
  requestPath: string;
}

@Injectable()
export class WarnOnlyAuditService {
  private readonly logger = new Logger(WarnOnlyAuditService.name);

  constructor(private readonly audit: AuditService) {}

  /**
   * Seçili operasyon için warn-only diagnostic event'i yazar. Best-effort:
   * - Operasyon haritada yoksa SESSİZCE atlar (kapsam dışı; event yazılmaz).
   * - Audit yazımı başarısız olsa bile ASLA throw etmez (asıl endpoint akışını bozmaz).
   * Hiçbir şeyi engellemez.
   */
  async recordWouldDeny(operation: string, ctx: WarnOnlyContext): Promise<void> {
    const entry = PERMISSION_DIAGNOSTICS_MAP[operation];
    if (!entry) return; // haritada yok → event yok
    // Sözleşme (WP-4d-0 §6): warn-only YALNIZ enforcement-bekleyen yumuşak guard'lar içindir.
    // ADMIN_HARD_GUARD / HARD_LEGAL_GUARD_EXISTS / CPE_GUARDED zaten serttir; UNKNOWN belirsiz → atla.
    if (entry.currentGuard !== "TENANT_ONLY" && entry.currentGuard !== "DECORATIVE_ONLY") return;
    try {
      await this.audit.log({
        tenantId: ctx.tenantId,
        action: "PERMISSION_WOULD_DENY",
        entityType: "PERMISSION",
        entityId: ctx.entityId ?? operation,
        userId: ctx.actorUserId ?? undefined,
        metadata: {
          event: "PERMISSION_WOULD_DENY",
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId ?? null,
          operation,
          requiredPermission: entry.requiredPermission,
          requiredScope: entry.requiredScope,
          currentGuard: entry.currentGuard,
          enforcementPhase: "PHASE_2_WARN_ONLY",
          allowedByCurrentBehavior: true,
          wouldBeRestrictedUnderRbac: true,
          requestPath: ctx.requestPath,
          note: "Diagnostic only; request was not blocked.",
        },
      });
    } catch (err) {
      // Warn-only diagnostic core response'u ASLA bozmaz (sessiz değil, loglu).
      this.logger.error(
        `warn-only audit emit failed for '${operation}': ${(err as Error)?.message ?? err}`,
      );
    }
  }
}
