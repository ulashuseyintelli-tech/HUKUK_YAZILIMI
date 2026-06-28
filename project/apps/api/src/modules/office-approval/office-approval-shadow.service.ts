// P4-2/P4-3 — OfficeApprovalShadowService (CHANGE_STATUS approval gate; tek flag, üç mod).
//
// CHANGE_STATUS için approval kararını HESAPLAR. Tek flag (OFFICE_APPROVAL_CHANGE_STATUS_GATE) üç mod:
//  - off  (varsayılan/unset/bilinmeyen) → NO-OP: hesap/audit/DB YOK; effectiveDecision DEĞİŞMEZ.
//  - observe (P4-2) → GÖLGE: kararı hesaplar + OFFICE_APPROVAL_SHADOW_EVALUATED audit yazar; OfficeApprovalRequest
//    OLUŞTURMAZ, statü/akış/response DEĞİŞTİRMEZ, enforce ETMEZ; hata best-effort yutulur (akış ASLA bozulmaz).
//  - enforce (P4-3) → CANLI GATE (FAIL-CLOSED; hata YUTULMAZ):
//      * PARTNER (self-authority) → ALLOW: request YOK, envelope YOK → caller mevcut akışı (P3 gate + changeStatus) sürdürür.
//      * non-PARTNER (avukat / delege / personel / linksiz / çözülemeyen) → OfficeApprovalRequest PENDING_APPROVAL
//        CREATE (idempotent) + APPROVAL_REQUIRED envelope → caller statüyü DEĞİŞTİRMEDEN bu zarfı döner (P3 confirm'e gidilmez).
//    Official statü mutasyonu BURADA YAPILMAZ. Executor/approve-endpoint/inbox/UYAP/banka YOK (P4-4+). ClientApprovalRequest'e DOKUNMAZ.
//
// Karar matrisi (computeDecision): PARTNER → ALLOW; diğer herkes → WOULD_REQUIRE_APPROVAL. Delege onaycı
// (canApproveOfficeActions) BAŞKASININ talebini onaylayabilir ama KENDİ talebini değil → o da WOULD_REQUIRE_APPROVAL.
//
// Multitenant: tüm okuma/yazma input.tenantId (truthful @CurrentUser) ile sınırlı; computeDecision actor'ı tenant-doğrular,
// createPendingRequest tenant-scoped kayıt açar → çapraz-tenant kaçak YOK.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import {
  buildGuardedEdgeOutcome,
  GuardedEdgeOutcomeEnvelope,
} from '../permission-diagnostics/guided-edge/guarded-edge-outcome.envelope';
import { GuidedOpenDecision } from '../policy-engine/types/effective-permission.types';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { OfficeApprovalService } from './office-approval.service';

export type OfficeApprovalShadowDecision = 'ALLOW' | 'WOULD_REQUIRE_APPROVAL';
export type OfficeApprovalGateMode = 'off' | 'observe' | 'enforce';

export interface OfficeApprovalShadowInput {
  actorUserId: string;
  tenantId: string;
  actionCode: string;
  targetType: string;
  targetRef: string;
  payload?: unknown; // confirm'in koruduğu alanlar; audit'e yalnız payloadHash olarak girer (ham değer SIZMAZ)
}

export interface OfficeApprovalShadowResult {
  flagMode: OfficeApprovalGateMode;
  evaluated: boolean;
  decision?: OfficeApprovalShadowDecision;
  reasonCode?: string;
  requesterCapacity?: string;
  /** enforce + non-PARTNER: oluşturulan OfficeApprovalRequest.id (idempotent). */
  requestId?: string;
  /** enforce + non-PARTNER: APPROVAL_REQUIRED zarfı. Caller bunu döner → statü DEĞİŞMEZ, P3 confirm'e gidilmez. */
  envelope?: GuardedEdgeOutcomeEnvelope;
}

@Injectable()
export class OfficeApprovalShadowService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // P4-3: enforce modunda OfficeApprovalRequest oluşturmak için (P4-1 substrate; idempotency + savedIntent + leak-free audit hazır).
    private readonly officeApproval: OfficeApprovalService,
  ) {}

  /** off (varsayılan) | observe (P4-2 gölge) | enforce (P4-3 canlı gate). 'observe'/'enforce' dışındaki her şey → off. */
  private flagMode(): OfficeApprovalGateMode {
    const v = String(this.config.get('OFFICE_APPROVAL_CHANGE_STATUS_GATE') ?? '').trim().toLowerCase();
    if (v === 'observe') return 'observe';
    if (v === 'enforce') return 'enforce';
    return 'off';
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  ///  - CaseStatusController.changeStatus() → POST /case-status/:caseId/change (observe hook'tan SONRA, P3 confirm gate ÖNCESİ).
  ///    Dönüş `envelope` doluysa (yalnız enforce + non-PARTNER) controller onu döner ve changeStatus'a GİTMEZ.
  /// </remarks>
  async evaluate(input: OfficeApprovalShadowInput): Promise<OfficeApprovalShadowResult> {
    const flagMode = this.flagMode();
    if (flagMode === 'off') return { flagMode: 'off', evaluated: false }; // no-op: hesap/audit/DB YOK

    if (flagMode === 'observe') {
      // P4-2 — GÖLGE: best-effort. OfficeApprovalRequest OLUŞTURMAZ, envelope YOK, akış/statü DEĞİŞMEZ.
      try {
        const { decision, reasonCode, capacity } = await this.computeDecision(input.actorUserId, input.tenantId);
        await this.audit.log({
          tenantId: input.tenantId,
          action: 'OFFICE_APPROVAL_SHADOW_EVALUATED',
          entityType: 'OFFICE_APPROVAL_SHADOW',
          entityId: input.targetRef,
          userId: input.actorUserId, // truthful requester (system/unknown DEĞİL)
          metadata: {
            actionCode: input.actionCode,
            targetType: input.targetType,
            targetRef: input.targetRef,
            requesterUserId: input.actorUserId,
            requesterCapacity: capacity,
            decision,
            reasonCode,
            flagMode,
            // GİZLİLİK: ham payload (status/reason) audit'e YAZILMAZ; yalnız payloadHash.
            ...(input.payload !== undefined ? { payloadHash: stableJsonHash(input.payload) } : {}),
          },
        });
        return { flagMode, evaluated: true, decision, reasonCode, requesterCapacity: capacity };
      } catch {
        // observe ASLA akışı/mutation'ı bozmaz (best-effort)
        return { flagMode, evaluated: false };
      }
    }

    // flagMode === 'enforce' — P4-3 CANLI GATE. FAIL-CLOSED: hata YUTULMAZ. (non-PARTNER için request oluşturulamazsa
    // sessizce mutasyona DÜŞÜLMEZ; exception caller'a propagate olur → official changeStatus çalışmaz.)
    const { decision, reasonCode, capacity } = await this.computeDecision(input.actorUserId, input.tenantId);
    if (decision === 'ALLOW') {
      // PARTNER self-authority → approval gerekmez. Envelope YOK → caller mevcut akışı (P3 gate + changeStatus) sürdürür.
      return { flagMode, evaluated: true, decision, reasonCode, requesterCapacity: capacity };
    }

    // non-PARTNER → OfficeApprovalRequest PENDING_APPROVAL create (idempotent). savedIntent = ham CHANGE_STATUS niyeti
    // (onaylanınca yürütülecek — deferred exec P4-4). idempotencyKey deterministik: aynı (aksiyon+hedef+aktör+niyet)
    // tekrarı YENİ talep ÜRETMEZ (createPendingRequest mevcut PENDING'i döner; P2002-race güvenli).
    const savedIntent = input.payload ?? null;
    const idempotencyKey = `${input.actionCode}|${input.targetRef}|${input.actorUserId}|${stableJsonHash(savedIntent)}`;
    const request = await this.officeApproval.createPendingRequest({
      tenantId: input.tenantId,
      actionCode: input.actionCode,
      targetType: input.targetType,
      targetRef: input.targetRef,
      requesterUserId: input.actorUserId,
      savedIntent, // ham niyet DB'de (deferred-exec için); audit yalnız payloadHash (createPendingRequest leak-free)
      idempotencyKey,
    });

    // typed APPROVAL_REQUIRED zarfı (GuidedOpenDecision'ın HTTP projeksiyonu). Ham savedIntent/payload İÇERMEZ.
    const envelope = buildGuardedEdgeOutcome({
      outcome: GuidedOpenDecision.APPROVAL_REQUIRED,
      actionCode: input.actionCode as ActionCode,
      target: { resourceType: input.targetType, caseId: input.targetRef },
      reasonCode,
      message: 'Bu statü değişikliği için yetkili onayı gerekiyor; talep onaya gönderildi.',
      approval: { requestId: request.id, status: request.status },
    });
    return {
      flagMode,
      evaluated: true,
      decision,
      reasonCode,
      requesterCapacity: capacity,
      requestId: request.id,
      envelope,
    };
  }

  private async computeDecision(
    actorUserId: string,
    tenantId: string,
  ): Promise<{ decision: OfficeApprovalShadowDecision; reasonCode: string; capacity: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      include: {
        lawyer: { select: { lawyerRank: true, canApproveOfficeActions: true } },
        staffMember: { select: { staffType: true } },
      },
    });
    if (!user || !user.isActive || user.tenantId !== tenantId) {
      return { decision: 'WOULD_REQUIRE_APPROVAL', reasonCode: 'ACTOR_NOT_RESOLVABLE', capacity: 'UNKNOWN' };
    }
    const lw = user.lawyer;
    if (lw && lw.lawyerRank === 'PARTNER') {
      return { decision: 'ALLOW', reasonCode: 'PARTNER_SELF_AUTHORITY', capacity: 'PARTNER' };
    }
    if (lw) {
      // non-PARTNER avukat: delege olsa bile KENDİ talebini onaylayamaz → approval gerekir
      return {
        decision: 'WOULD_REQUIRE_APPROVAL',
        reasonCode: lw.canApproveOfficeActions ? 'DELEGATED_NO_SELF_APPROVE' : 'NON_AUTHORITY_LAWYER',
        capacity: lw.lawyerRank,
      };
    }
    if (user.staffMember) {
      return { decision: 'WOULD_REQUIRE_APPROVAL', reasonCode: 'STAFF_NOT_APPROVER', capacity: user.staffMember.staffType };
    }
    return { decision: 'WOULD_REQUIRE_APPROVAL', reasonCode: 'UNLINKED', capacity: 'UNKNOWN' };
  }
}
