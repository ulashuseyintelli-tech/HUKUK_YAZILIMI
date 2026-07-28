import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DISCLOSURE_APPROVER_CANDIDATE_SELECT,
  isDisclosureApproverEligible,
} from '../client-financial-disclosure/client-financial-disclosure-approval-eligibility';
import { CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE } from '../client-financial-disclosure/client-financial-disclosure-approval.contract';
import { ActionCode } from '../policy-engine/types/action-code.enum';

/**
 * CLIENT-P2-U03-TRACK-B-I03 (charter §41, owner kararı PR #1761) —
 * `CLIENT_FINANCIAL_DISCLOSURE_APPROVE` için İZOLE approver yeterlilik politikası.
 *
 * `PayoutApprovalPolicy` (PAYOUT-APPROVAL-2) ile AYNI desendir: paylaşılan
 * `OfficeApprovalService.isApproverEligible()` KASITLI OLARAK DEĞİŞTİRİLMEZ — disposition ve
 * diğer her actionCode o metodun eski davranışını AYNEN kullanmaya devam eder (sıfır regresyon).
 * MANAGER'ı da kabul eden bu genişleme YALNIZ bu actionCode'a uygulanır ve başka hiçbir
 * actionCode'a SIZMAZ (§41.3).
 *
 * Kural: aktif + aynı tenant + linkli Lawyer + (lawyerRank IN (PARTNER, MANAGER) VEYA
 * canApproveOfficeActions=true). Staff DEĞİL (Lawyer linki yok). Predikatın kendisi saf
 * `isDisclosureApproverEligible()` içindedir — dormant approval servisiyle TEK KAYNAK, drift YOK.
 */
@Injectable()
export class ClientFinancialDisclosureApprovalPolicy {
  constructor(private readonly prisma: PrismaService) {}

  /** Bool predikat — THROW ETMEZ. `resolveApproverEligible()` dispatcher'ı bunu kullanır. */
  async isEligible(userId: string, tenantId: string): Promise<boolean> {
    const candidate = await this.prisma.user.findUnique({
      where: { id: userId },
      select: DISCLOSURE_APPROVER_CANDIDATE_SELECT,
    });
    return isDisclosureApproverEligible(candidate, tenantId);
  }

  /** Değilse 403. Finansal payload veya alıcı bilgisi hata gövdesine YAZILMAZ. */
  async assertEligible(userId: string, tenantId: string): Promise<void> {
    if (!(await this.isEligible(userId, tenantId))) {
      throw new ForbiddenException(
        'Müvekkil finansal bildirim onay yetkisi yok (aktif, aynı tenant, PARTNER/MANAGER veya yetkilendirilmiş avukat gerekir).',
      );
    }
  }
}

/**
 * Compile-time koruma: dormant servisin bağımsız sabiti ile canonical `ActionCode` üyesi
 * ayrışırsa build KIRILIR (string drift sessizce geçemez).
 */
const _actionCodeParity: `${ActionCode.CLIENT_FINANCIAL_DISCLOSURE_APPROVE}` =
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE;
void _actionCodeParity;
