// P2b-1 — Guided-Open observe ADAPTER (diagnostic; ENFORCEMENT YOK).
//
// KESİN KURAL (#503 / p2-guided-open-observe-mode-scope.md):
//   "P2 hiçbir kullanıcı aksiyonunu engellemez. P2 sadece resolver kararını hesaplar,
//    diagnostic/audit üretir ve mevcut davranışı korur."
//
// Bu servis, EffectivePermissionResolver'ı (policy-engine) çağırır (yalnız flag=observe iken)
// ve mevcut AuditLog hattına truthful bir PERMISSION_OBSERVED diagnostic'i yazar.
// Best-effort: warn-only-audit.service deseniyle birebir — ASLA throw etmez, akışı bozmaz.
// `enforced` daima false; hiçbir 403/deny/route/confirm/approval/hardware üretmez.

import { Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { EffectivePermissionResolver } from "../policy-engine/effective-permission-resolver.service";
import { EffectivePermissionInput } from "../policy-engine/types/effective-permission.types";

export type GuidedOpenAuthzMode = "off" | "observe";

@Injectable()
export class GuidedOpenObserveService {
  private readonly logger = new Logger(GuidedOpenObserveService.name);

  constructor(
    private readonly resolver: EffectivePermissionResolver,
    private readonly audit: AuditService,
  ) {}

  /**
   * Aktif mod (env GUIDED_OPEN_AUTHZ_MODE). Default 'off'.
   * Şimdilik yalnız off | observe; enforce/route/confirm değerleri P3+'a aittir (burada YOK).
   */
  mode(): GuidedOpenAuthzMode {
    return (process.env.GUIDED_OPEN_AUTHZ_MODE ?? "").toLowerCase() === "observe" ? "observe" : "off";
  }

  /**
   * Observe-mode: kararı HESAPLAR + diagnostic yazar. ENGELLEME YOK.
   *   - flag off  → erken döner; resolver ÇAĞRILMAZ, log YAZILMAZ, response/latency DEĞİŞMEZ.
   *   - flag observe → resolver.resolve + best-effort PERMISSION_OBSERVED audit; işlem ENGELLENMEZ.
   *   - resolver/audit hata verse bile ASLA throw etmez (asıl endpoint akışı korunur).
   * opts.targetRef (OPSİYONEL): caseId path'te OLMAYAN aksiyonlarda hedef referansı (ör. caseDebtorId).
   *   YALNIZ verilince audit'e eklenir; mevcut caseId'li pilotlar opts GEÇMEZ → audit şekli BİREBİR korunur.
   *
   * Çağrıldığı yerler:
   *  - notification/bank/uyap/office/case controller (P2b-1/P2b-2 observe pilotları; caseId'li, opts yok)
   *  - case-debtor.controller (P2b-2b-1 EDIT_PARTIES observe: add/bulk → caseId; update/remove → opts.targetRef=caseDebtorId)
   */
  async observe(input: EffectivePermissionInput, opts?: { targetRef?: string }): Promise<void> {
    if (this.mode() !== "observe") return; // off → no-op
    try {
      const d = await this.resolver.resolve(input);
      await this.audit.log({
        tenantId: input.tenantId,
        action: "PERMISSION_OBSERVED",
        entityType: "PERMISSION",
        entityId: input.caseId ?? opts?.targetRef ?? input.actionCode,
        userId: input.actorUserId,
        metadata: {
          event: "PERMISSION_OBSERVED",
          mode: "observe",
          enforced: false,
          // authz diagnostic — domain action audit DEĞİL. Business success/fail İDDİA ETMEZ.
          observePhase: "pre_action",
          // truthful: butona basan GERÇEK kullanıcı (iç tek-asıl felsefe kaydı değiştirmez)
          actorUserId: input.actorUserId,
          caseId: input.caseId ?? null,
          // opsiyonel hedef referansı (caseId path'te yokken ör. caseDebtorId); YALNIZ verilince eklenir →
          // mevcut pilotlar (caseId'li, opts geçmez) audit şekli BİREBİR korunur.
          ...(opts?.targetRef ? { targetRef: opts.targetRef } : {}),
          actionCode: input.actionCode,
          decision: d.decision,
          decisionSource: d.decisionSource,
          actionClass: d.actionClass,
          capacity: d.capacity,
          hasCaseMembership: d.hasCaseMembership,
          caseGrantPresent: d.caseGrantPresent,
          // ilerideki guarded-edge davranışını ölçer (P2'de yalnız ölçüm)
          wouldRequireConfirm: d.wouldRequireConfirm,
          wouldRequireRoute: d.wouldRequireRoute,
          wouldRequireApproval: d.wouldRequireApproval,
          wouldRequireHardware: d.wouldRequireHardware,
          wouldDenyTenantBoundary: d.wouldDenyTenantBoundary,
          note: "Diagnostic only; request was not blocked (Guided-Open observe).",
        },
      });
    } catch (err) {
      // observe core response'u ASLA bozmaz (sessiz değil, loglu).
      this.logger.error(
        `guided-open observe failed for '${input.actionCode}': ${(err as Error)?.message ?? err}`,
      );
    }
  }
}
