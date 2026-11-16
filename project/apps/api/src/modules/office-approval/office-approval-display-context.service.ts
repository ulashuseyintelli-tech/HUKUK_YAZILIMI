import { Injectable, Optional } from '@nestjs/common';
import type { OfficeApprovalRequest } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CaseViewScopeService } from '../case/case-view-scope.service';
import { isCaseViewScopeEnabled } from '../case/case-view-scope';
import { CLAIM_ITEM_CASE_TARGET_TYPE, CLAIM_ITEM_TARGET_TYPE } from '../claim-item/claim-item-approval.constants';
import { FINANCIAL_CASE_CLOSE_TARGET_TYPE } from '../case-status/financial-case-close.constants';

/**
 * Onay Kutusu — talebin GÜNCEL dosya bağlamı ve kişi adları (yalnız okuma; karar / yürütme / yetki kurallarına dokunmaz).
 *
 * - `VISIBLE`: dosya aktörün kiracısında ve aktörün dosya görme kapsamında → dosya numarası (+ tek kalemde kalemin güncel adı).
 * - `NOT_VISIBLE`: dosya var ama aktör göremiyor ya da kapsam çözülemedi → dosya numarası / kalem adı VERİLMEZ (fail-closed).
 * - `NOT_FOUND`: hedef aktörün kiracısında bulunamadı (silinmiş / başka kiracı) → bilgi verilmez.
 * - `NOT_APPLICABLE`: bu hedef türü için dosya çözümlenmez.
 *
 * Kayıtlı niyet (savedIntent) talep anındaki kayıttır; buradaki bilgi GÜNCEL kayıttır. İkisi web'de ayrı gösterilir.
 * Kişi adları yalnız talebin kiracısındaki kullanıcılardan çözülür; bulunamazsa null (uydurulmaz).
 *
 * /// <remarks>
 * /// Çağrıldığı yerler: OfficeApprovalController.presentDetail() (GET /office-approvals/:id ve karar uçlarının yanıtı),
 * /// OfficeApprovalController.inbox() / mine() (yalnız talep eden adı).
 * /// </remarks>
 */
export type OfficeApprovalCaseContextStatus = 'VISIBLE' | 'NOT_VISIBLE' | 'NOT_FOUND' | 'NOT_APPLICABLE';

export interface OfficeApprovalCaseContextDto {
  status: OfficeApprovalCaseContextStatus;
  /** Yalnız VISIBLE iken dolu. */
  caseId: string | null;
  /** Yalnız VISIBLE iken dolu. */
  fileNumber: string | null;
  /** Yalnız VISIBLE + tek kalem hedefinde: kalemin GÜNCEL adı. */
  claimItemLabel: string | null;
  /**
   * Kayıtlı niyetteki dosya kimliği güncel hedefle aynı mı? Niyette dosya kimliği yoksa ya da dosya çözülemediyse null.
   * Değer kimlik içermez; yalnız eşleşme bilgisidir.
   */
  intentCaseMatches: boolean | null;
}

export interface OfficeApprovalDisplayContextDto {
  requesterName: string | null;
  approverName: string | null;
  case: OfficeApprovalCaseContextDto;
}

const CASE_TARGET_TYPES = new Set<string>([FINANCIAL_CASE_CLOSE_TARGET_TYPE, CLAIM_ITEM_CASE_TARGET_TYPE]);

const NOT_APPLICABLE: OfficeApprovalCaseContextDto = {
  status: 'NOT_APPLICABLE',
  caseId: null,
  fileNumber: null,
  claimItemLabel: null,
  intentCaseMatches: null,
};

@Injectable()
export class OfficeApprovalDisplayContextService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly caseViewScope?: CaseViewScopeService,
  ) {}

  async build(request: OfficeApprovalRequest, actorUserId: string): Promise<OfficeApprovalDisplayContextDto> {
    const names = await this.userNames(request.tenantId, [request.requesterUserId, request.approverUserId]);
    return {
      requesterName: names.get(request.requesterUserId) ?? null,
      approverName: request.approverUserId ? names.get(request.approverUserId) ?? null : null,
      case: await this.caseContext(request, actorUserId),
    };
  }

  /** Kiracıdaki kullanıcıların görünen adları (ad + soyad). Başka kiracının kullanıcısı haritaya GİRMEZ. */
  async userNames(tenantId: string, ids: ReadonlyArray<string | null | undefined>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
    const result = new Map<string, string>();
    if (!tenantId || unique.length === 0) return result;
    const rows = await this.prisma.user.findMany({
      where: { tenantId, id: { in: unique } },
      select: { id: true, name: true, surname: true },
    });
    for (const row of rows) {
      const display = [row.name, row.surname].map((part) => (part ?? '').trim()).filter(Boolean).join(' ');
      if (display) result.set(row.id, display);
    }
    return result;
  }

  private async caseContext(request: OfficeApprovalRequest, actorUserId: string): Promise<OfficeApprovalCaseContextDto> {
    const tenantId = request.tenantId;
    let caseId: string | null = null;
    let claimItemLabel: string | null = null;

    if (request.targetType === CLAIM_ITEM_TARGET_TYPE) {
      const item = await this.prisma.claimItem.findFirst({
        where: { id: request.targetRef, tenantId },
        select: { caseId: true, description: true, itemType: true },
      });
      if (!item) return { ...NOT_APPLICABLE, status: 'NOT_FOUND' };
      caseId = item.caseId;
      claimItemLabel = (item.description ?? '').trim() || String(item.itemType);
    } else if (CASE_TARGET_TYPES.has(request.targetType)) {
      caseId = request.targetRef;
    } else {
      return NOT_APPLICABLE;
    }

    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true, fileNumber: true },
    });
    if (!caseRow) return { ...NOT_APPLICABLE, status: 'NOT_FOUND' };

    const intentCaseId = intentCaseIdOf(request.savedIntent);
    const intentCaseMatches = intentCaseId === null ? null : intentCaseId === caseRow.id;

    if (!(await this.isVisible(tenantId, actorUserId, caseRow.id))) {
      return { status: 'NOT_VISIBLE', caseId: null, fileNumber: null, claimItemLabel: null, intentCaseMatches };
    }
    return {
      status: 'VISIBLE',
      caseId: caseRow.id,
      fileNumber: caseRow.fileNumber ?? null,
      claimItemLabel,
      intentCaseMatches,
    };
  }

  /** Dosya görme kapsamı mevcut tek kuraldan (F02 P3); servis yoksa ya da kapsam çözülemezse görünmez sayılır. */
  private async isVisible(tenantId: string, actorUserId: string, caseId: string): Promise<boolean> {
    if (!this.caseViewScope) return !isCaseViewScopeEnabled();
    try {
      return await this.caseViewScope.isCaseVisible(tenantId, actorUserId, caseId);
    } catch {
      return false;
    }
  }
}

function intentCaseIdOf(savedIntent: unknown): string | null {
  if (typeof savedIntent !== 'object' || savedIntent === null || Array.isArray(savedIntent)) return null;
  const value = (savedIntent as Record<string, unknown>).caseId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
