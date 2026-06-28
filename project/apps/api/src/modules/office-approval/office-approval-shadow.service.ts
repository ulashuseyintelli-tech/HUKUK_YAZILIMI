// P4-2 — OfficeApprovalShadowService (CHANGE_STATUS approval SHADOW; observe-only).
//
// CHANGE_STATUS için approval kararını HESAPLAR ve OFFICE_APPROVAL_SHADOW_EVALUATED audit'i yazar.
// KESİN — P4-2 KAPSAMI (Ulaş kilidi):
//  - effectiveDecision DEĞİŞMEZ: bu yalnız GÖLGE hesap. Official statü değiştirmez, response/akış değiştirmez.
//  - OfficeApprovalRequest OLUŞTURMAZ (DB'ye approval kaydı yazmaz; prisma.officeApprovalRequest'e HİÇ dokunmaz).
//  - ENFORCE ETMEZ. Flag yalnız 'observe' iken aktif; 'off'/unset/'enforce'/diğer → no-op (enforce P4-3'te).
//  - Hata → best-effort yutulur (mutation/akış ASLA bozulmaz).
//
// Karar: PARTNER = self-authority → ALLOW (kendi işlemi için approval gerekmez). Diğer herkes (non-PARTNER avukat /
// delege onaycı / personel / linksiz / çözülemeyen) → WOULD_REQUIRE_APPROVAL. Delege onaycı (canApproveOfficeActions)
// BAŞKASININ talebini onaylayabilir ama KENDİ talebini değil → o da WOULD_REQUIRE_APPROVAL.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';

export type OfficeApprovalShadowDecision = 'ALLOW' | 'WOULD_REQUIRE_APPROVAL';

export interface OfficeApprovalShadowInput {
  actorUserId: string;
  tenantId: string;
  actionCode: string;
  targetType: string;
  targetRef: string;
  payload?: unknown; // confirm'in koruduğu alanlar; audit'e yalnız payloadHash olarak girer (ham değer SIZMAZ)
}

export interface OfficeApprovalShadowResult {
  flagMode: 'off' | 'observe';
  evaluated: boolean;
  decision?: OfficeApprovalShadowDecision;
  reasonCode?: string;
  requesterCapacity?: string;
}

@Injectable()
export class OfficeApprovalShadowService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Yalnız 'observe' aktif. 'off'/unset/'enforce'/diğer → no-op (enforce P4-3; P4-2'de davranış değişmez). */
  private flagMode(): 'off' | 'observe' {
    const v = String(this.config.get('OFFICE_APPROVAL_CHANGE_STATUS_GATE') ?? '').trim().toLowerCase();
    return v === 'observe' ? 'observe' : 'off';
  }

  async evaluate(input: OfficeApprovalShadowInput): Promise<OfficeApprovalShadowResult> {
    const flagMode = this.flagMode();
    if (flagMode === 'off') return { flagMode: 'off', evaluated: false }; // no-op: hesap/audit/DB YOK
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
