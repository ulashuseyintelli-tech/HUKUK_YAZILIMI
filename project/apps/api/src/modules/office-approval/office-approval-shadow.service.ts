// P4-2/P4-3A — OfficeApprovalShadowService (CHANGE_STATUS approval gate; tek flag, üç mod).
//
// CHANGE_STATUS için approval kararını HESAPLAR. Tek flag (OFFICE_APPROVAL_CHANGE_STATUS_GATE) üç mod:
//  - off  (varsayılan/unset/bilinmeyen) → NO-OP: hesap/audit/DB YOK; effectiveDecision DEĞİŞMEZ.
//  - observe (P4-2) → GÖLGE: kararı hesaplar + OFFICE_APPROVAL_SHADOW_EVALUATED audit yazar; OfficeApprovalRequest
//    OLUŞTURMAZ, statü/akış/response DEĞİŞTİRMEZ; hata best-effort yutulur (akış ASLA bozulmaz).
//  - create (P4-3A) → PERSIST-ONLY (BEST-EFFORT; BLOK YOK, API contract DEĞİŞMEZ):
//      * PARTNER (self-authority) → ALLOW: request YOK.
//      * non-PARTNER (avukat / delege / personel / linksiz / çözülemeyen) → OfficeApprovalRequest PENDING_APPROVAL
//        CREATE (idempotent). SADECE persist — controller dönüşü KULLANMAZ, statü yine değişir, response AYNI kalır.
//    Hata best-effort yutulur → mevcut CHANGE_STATUS akışı BOZULMAZ.
//
// KESİN FAZ SINIRI (Ulaş kilidi): bu faz BLOKLAMAZ ve typed APPROVAL_REQUIRED response DÖNDÜRMEZ. İşlemi durdurma +
//   typed response + fail-closed = 'enforce' (P4-6); 'enforce' adı/değeri BU FAZDA KULLANILMAZ (reserved). Approve/inbox/
//   executor/deferred-execution P4-4/P4-5. ClientApprovalRequest'e DOKUNMAZ; RBAC/PermissionCatalog'a DOKUNMAZ; migration YOK.
//
// Karar matrisi (computeDecision): PARTNER → ALLOW; diğer herkes → WOULD_REQUIRE_APPROVAL. Delege onaycı
// (canApproveOfficeActions) BAŞKASININ talebini onaylayabilir ama KENDİ talebini değil → o da WOULD_REQUIRE_APPROVAL.
//
// Multitenant: tüm okuma/yazma input.tenantId (truthful @CurrentUser) ile sınırlı; computeDecision actor'ı tenant-doğrular,
// createPendingRequest tenant-scoped kayıt açar → çapraz-tenant kaçak YOK.

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import {
  buildGuardedEdgeOutcome,
  type GuardedEdgeOutcomeEnvelope,
} from '../permission-diagnostics/guided-edge/guarded-edge-outcome.envelope';
import { GuidedOpenDecision } from '../policy-engine/types/effective-permission.types';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { OfficeApprovalService } from './office-approval.service';

export type OfficeApprovalShadowDecision = 'ALLOW' | 'WOULD_REQUIRE_APPROVAL';
export type OfficeApprovalGateMode = 'off' | 'observe' | 'create' | 'enforce';

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
  /** create + non-PARTNER: oluşturulan OfficeApprovalRequest.id (idempotent). create'te controller KULLANMAZ; enforce'ta DÖNER. */
  requestId?: string;
  /** P4-3B enforce + non-PARTNER → true: controller envelope'u DÖNDÜRÜR + changeStatus'u ÇAĞIRMAZ. off/observe/create → undefined. */
  block?: boolean;
  /** P4-3B enforce + non-PARTNER: typed APPROVAL_REQUIRED zarfı (structured-200). */
  envelope?: GuardedEdgeOutcomeEnvelope;
}

@Injectable()
export class OfficeApprovalShadowService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // P4-3A: 'create' modunda OfficeApprovalRequest oluşturmak için (P4-1 substrate; idempotency + savedIntent + leak-free audit hazır).
    private readonly officeApproval: OfficeApprovalService,
  ) {}

  /**
   * off (varsayılan) | observe (P4-2 gölge) | create (P4-3A persist-only) | enforce (P4-3B blok + typed APPROVAL_REQUIRED).
   * Bunların dışındaki her şey (unset/bilinmeyen/'on'/…) → off (fail-safe dormant; default DEĞİŞMEZ).
   */
  private flagMode(): OfficeApprovalGateMode {
    const v = String(this.config.get('OFFICE_APPROVAL_CHANGE_STATUS_GATE') ?? '').trim().toLowerCase();
    if (v === 'observe') return 'observe';
    if (v === 'create') return 'create';
    if (v === 'enforce') return 'enforce';
    return 'off';
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  ///  - CaseStatusController.changeStatus() → POST /case-status/:caseId/change (observe hook'tan SONRA, P3 confirm gate ÖNCESİ).
  ///    Controller dönüş değerini KULLANMAZ (await edip discard eder) → 'create' modunda request persist edilir ama
  ///    response/akış/statü DEĞİŞMEZ. (Bloklama + typed response P4-6.)
  /// </remarks>
  async evaluate(input: OfficeApprovalShadowInput): Promise<OfficeApprovalShadowResult> {
    const flagMode = this.flagMode();
    if (flagMode === 'off') return { flagMode: 'off', evaluated: false }; // no-op: hesap/audit/DB YOK

    if (flagMode === 'observe') {
      // P4-2 — GÖLGE: best-effort. OfficeApprovalRequest OLUŞTURMAZ, akış/statü DEĞİŞMEZ.
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

    if (flagMode === 'enforce') {
      // P4-3B — ENFORCE: BLOK + typed APPROVAL_REQUIRED + FAIL-CLOSED. PARTNER → ALLOW (PROCEED); non-PARTNER → request CREATE
      //   + block (controller envelope döner, changeStatus ÇAĞIRMAZ). FAIL-CLOSED: create/compute throw → typed 5xx propagate
      //   (changeStatus'a DÜŞMEZ; statü DEĞİŞMEZ) — P4-3A best-effort SWALLOW'u enforce'ta MİRAS ALINMAZ.
      // ⚠️ Acceptance#10 — ENFORCE YALNIZ CHANGE_STATUS: başka actionCode (POST_DISPOSITION/CLIENT_PAYOUT/…) flag açık olsa bile
      //   enforce EDİLMEZ → no-op (eski davranış). (evaluate zaten yalnız CHANGE_STATUS controller'ından çağrılır; bu defansif guard.)
      if (input.actionCode !== ActionCode.CHANGE_STATUS) {
        return { flagMode, evaluated: false }; // CHANGE_STATUS dışı → enforce kapsamı DIŞI, akış DEĞİŞMEZ
      }
      let computed;
      try {
        computed = await this.computeDecision(input.actorUserId, input.tenantId);
      } catch {
        throw new ServiceUnavailableException('Onay değerlendirmesi başarısız; statü değiştirilmedi.');
      }
      const { decision, reasonCode, capacity } = computed;
      if (decision === 'ALLOW') {
        // PARTNER self-authority → ALLOW: controller normal changeStatus'u çalıştırır, request YOK.
        return { flagMode, evaluated: true, decision, reasonCode, requesterCapacity: capacity };
      }
      // non-PARTNER → request CREATE (idempotent) + BLOCK + typed APPROVAL_REQUIRED. Hata YUTULMAZ (fail-closed → typed 5xx).
      const savedIntent = input.payload ?? null;
      const idempotencyKey = `${input.actionCode}|${input.targetRef}|${input.actorUserId}|${stableJsonHash(savedIntent)}`;
      let request;
      try {
        request = await this.officeApproval.createPendingRequest({
          tenantId: input.tenantId,
          actionCode: input.actionCode,
          targetType: input.targetType,
          targetRef: input.targetRef,
          requesterUserId: input.actorUserId,
          savedIntent,
          idempotencyKey,
        });
      } catch {
        throw new ServiceUnavailableException('Onay talebi oluşturulamadı; statü değiştirilmedi.');
      }
      // typed APPROVAL_REQUIRED zarfı (structured-200): yalnız requestId+PENDING_APPROVAL (ham savedIntent YOK — leak-free).
      const envelope = buildGuardedEdgeOutcome({
        outcome: GuidedOpenDecision.APPROVAL_REQUIRED,
        actionCode: ActionCode.CHANGE_STATUS,
        target: { resourceType: input.targetType, caseId: input.targetRef },
        reasonCode,
        message: 'Onay talebi oluşturuldu, yetkili onayı bekleniyor.',
        approval: { requestId: request.id, status: 'PENDING_APPROVAL' },
      });
      return { flagMode, evaluated: true, decision, reasonCode, requesterCapacity: capacity, requestId: request.id, block: true, envelope };
    }

    // flagMode === 'create' — P4-3A PERSIST-ONLY. BEST-EFFORT: hata YUTULUR → mevcut CHANGE_STATUS akışı BOZULMAZ.
    // (Controller sonucu zaten discard ediyor; burada da throw etmeyiz → response/statü davranışı AYNEN.)
    try {
      const { decision, reasonCode, capacity } = await this.computeDecision(input.actorUserId, input.tenantId);
      if (decision === 'ALLOW') {
        // PARTNER self-authority → kendi işlemi için approval gerekmez → request OLUŞTURULMAZ.
        return { flagMode, evaluated: true, decision, reasonCode, requesterCapacity: capacity };
      }
      // non-PARTNER → OfficeApprovalRequest PENDING_APPROVAL create (idempotent). savedIntent = ham CHANGE_STATUS niyeti
      // (P4-5 deferred-exec için saklanır). idempotencyKey deterministik: aynı (aksiyon+hedef+aktör+niyet) tekrarı
      // YENİ talep ÜRETMEZ (createPendingRequest mevcut PENDING'i döner; P2002-race güvenli). Audit yalnız payloadHash.
      const savedIntent = input.payload ?? null;
      const idempotencyKey = `${input.actionCode}|${input.targetRef}|${input.actorUserId}|${stableJsonHash(savedIntent)}`;
      const request = await this.officeApproval.createPendingRequest({
        tenantId: input.tenantId,
        actionCode: input.actionCode,
        targetType: input.targetType,
        targetRef: input.targetRef,
        requesterUserId: input.actorUserId,
        savedIntent,
        idempotencyKey,
      });
      return { flagMode, evaluated: true, decision, reasonCode, requesterCapacity: capacity, requestId: request.id };
    } catch {
      // P4-3A BLOKLAMAZ: persist hatası mevcut akışı BOZMAZ (fail-closed P4-6'da, bloklama ile birlikte gelir).
      return { flagMode, evaluated: false };
    }
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
