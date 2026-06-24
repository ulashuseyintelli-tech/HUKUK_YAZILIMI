// WP-4e-1 — Phase 3 hard enforcement "bridge guard" (İLK GERÇEK 403).
// Permission store HENÜZ YOK → geçici köprü: yalnız role==='ADMIN' izinli; non-ADMIN → 403 PERMISSION_DENIED.
// WP-4f permission-store gelince gerçek per-permission (cases.delete@OFFICE) kontrolüne TERFİ edilecek.
// Sözleşme: docs/wp4e-hard-enforcement-contract.md. Yalnız seçili yıkıcı op'larda çağrılır (ör. cases.delete).

import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PERMISSION_DIAGNOSTICS_MAP } from "./permission-diagnostics-map";

export interface HardGuardContext {
  tenantId: string;
  actorUserId?: string | null;
  role?: string | null;
  entityId?: string | null;
  requestPath: string;
}

@Injectable()
export class PermissionHardGuardService {
  private readonly logger = new Logger(PermissionHardGuardService.name);

  constructor(private readonly audit: AuditService) {}

  /**
   * Geçici bridge guard: role==='ADMIN' → izinli (success path mevcut davranışla devam eder).
   * Aksi halde PERMISSION_DENIED audit'i (best-effort) yazılır ve ForbiddenException (403) atılır.
   * Audit hatası 403'ü 500'e ÇEVİRMEZ (best-effort; hata yutulur+loglanır), 403 yine korunur.
   */
  async assertBridgeAdmin(operation: string, ctx: HardGuardContext): Promise<void> {
    if (ctx.role === "ADMIN") return;
    await this.emitDenied(operation, ctx);
    throw new ForbiddenException(
      "Bu işlem için yetkiniz yok (geçici kural: yalnız yönetici/ADMIN).",
    );
  }

  private async emitDenied(operation: string, ctx: HardGuardContext): Promise<void> {
    const entry = PERMISSION_DIAGNOSTICS_MAP[operation];
    try {
      await this.audit.log({
        tenantId: ctx.tenantId,
        action: "PERMISSION_DENIED",
        entityType: "PERMISSION",
        entityId: ctx.entityId ?? operation,
        userId: ctx.actorUserId ?? undefined,
        metadata: {
          event: "PERMISSION_DENIED",
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId ?? null,
          operation,
          requiredPermission: entry?.requiredPermission ?? operation,
          requiredScope: entry?.requiredScope ?? "OFFICE",
          currentGuard: entry?.currentGuard ?? "TENANT_ONLY",
          enforcementPhase: "PHASE_3_HARD_ENFORCE",
          requestPath: ctx.requestPath,
          reason: `Missing required bridge authority for ${operation}.`,
          bridgeGuard: "ADMIN_ONLY",
        },
      });
    } catch (err) {
      this.logger.error(
        `PERMISSION_DENIED audit emit failed for '${operation}': ${(err as Error)?.message ?? err}`,
      );
    }
  }
}
