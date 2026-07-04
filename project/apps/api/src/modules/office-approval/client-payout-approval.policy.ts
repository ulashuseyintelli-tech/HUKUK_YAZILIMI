import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Capacity } from '../policy-engine/types/effective-permission.types';

/**
 * PAYOUT-APPROVAL-2 (2026-07-04, owner kararı) — CLIENT_PAYOUT_POST için İZOLE approver yeterlilik
 * politikası. Paylaşılan OfficeApprovalService.isApproverEligible() KASITLI OLARAK DEĞİŞTİRİLMEDİ:
 * disposition ve gelecekteki her başka actionCode o metodu aynen kullanmaya devam eder — MANAGER'ı
 * yalnız money-out (payout) için yetkili sayan bu karar, OfficeApproval'daki HER onaya sızmaz.
 *
 * Kural: aktif + aynı tenant + linkli Lawyer + (lawyerRank IN (PARTNER, MANAGER) VEYA
 * canApproveOfficeActions=true). Staff DEĞİL (Lawyer linki yok — isApproverEligible ile aynı dışlama).
 */
@Injectable()
export class PayoutApprovalPolicy {
  constructor(private readonly prisma: PrismaService) {}

  /** Bool predikat — THROW ETMEZ. office-approval'ın generic approve()/reject() dispatcher'ı bunu kullanır. */
  async isEligible(userId: string, tenantId: string): Promise<boolean> {
    try {
      await this.assertEligible(userId, tenantId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Değilse 403 fırlatır; eligible ise yetkilendiren capacity'yi döner (audit izinde görünür olsun diye —
   * ClientPayoutService.assertOfficeAdmin() ile AYNI sözleşme).
   */
  async assertEligible(userId: string, tenantId: string): Promise<Capacity> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { lawyer: { select: { lawyerRank: true, canApproveOfficeActions: true } } },
    });
    const lw = user && user.isActive && user.tenantId === tenantId ? user.lawyer : null;
    const eligible = !!lw && (lw.lawyerRank === 'PARTNER' || lw.lawyerRank === 'MANAGER' || lw.canApproveOfficeActions === true);
    if (!eligible) {
      throw new ForbiddenException(
        'Payout onay yetkisi yok (aktif, aynı tenant, PARTNER/MANAGER veya yetkilendirilmiş avukat gerekir).',
      );
    }
    return lw!.lawyerRank as Capacity;
  }
}
