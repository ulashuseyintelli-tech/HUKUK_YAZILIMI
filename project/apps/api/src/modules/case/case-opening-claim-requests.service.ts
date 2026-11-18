import { BadRequestException, ConflictException, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClaimItemService } from '../claim-item/claim-item.service';
import type { UpdateClaimItemDto } from '../claim-item/dto/claim-item.dto';
import { ClaimLiabilitySelectionService } from '../claim-liability/claim-liability-selection.service';
import { isClaimLiabilitySelectionEnabled } from '../claim-liability/claim-liability.flag';
import type { SelectionDraft } from '../claim-liability/claim-liability.domain';
import type { CreateCaseDto, OpeningClaimPreviewRequestDto } from './dto/case.dto';
import {
  OPENING_CLAIM_PREVIEW_NOTES,
  evaluateOpeningClaimRequests,
  hasOpeningClaimRequests,
  type OpeningClaimPlan,
  type OpeningClaimPreview,
} from './opening-claim-requests';

export type OpeningClaimRequestStatus = 'REQUESTED' | 'REJECTED' | 'SKIPPED';

export interface OpeningInterestAccrualOutcome {
  readonly dueIndex: number;
  readonly claimItemId: string | null;
  readonly status: OpeningClaimRequestStatus;
  readonly approvalRequestId?: string;
  readonly errorCode?: string;
  readonly message?: string;
}

export interface OpeningLiabilitySelectionOutcome {
  readonly status: OpeningClaimRequestStatus;
  readonly kalemSayisi: number;
  readonly approvalRequestId?: string;
  readonly errorCode?: string;
  readonly message?: string;
}

/** `POST /cases` yanıtındaki `openingClaimRequests` alanı: açılış beyanlarından hangi onay talepleri açıldı. */
export interface OpeningClaimRequestsOutcome {
  readonly requested: true;
  readonly previewHash: string;
  readonly faizBeyanlari: readonly OpeningInterestAccrualOutcome[];
  readonly sorumlulukSecimi: OpeningLiabilitySelectionOutcome | null;
  /** Bütün beyanlar onay talebine dönüştü mü. `false` ise açılamayanlar dosyanın kalem panelinden yeniden yapılır. */
  readonly tamami: boolean;
  /** Aynı kalemde hem faiz hem sorumluluk talebi açıldıysa onay sırası uyarısı; yoksa `null`. */
  readonly onaySirasiNotu: string | null;
  readonly aciklama: string;
}

export type OpeningClaimPreviewResponse = OpeningClaimPreview & {
  /** Yeni sorumluluk seçimi oluşturma açık mı (bayrak). Kapalıyken açılışta seçim gönderilemez. */
  readonly secimYazmaAcik: boolean;
};

const CLAIM_ITEM_WRITE_DENIED = /(?:ClaimItem write denied|Sorumluluk seçimi yetkisi yok):\s*([A-Z0-9_]+)/;

const WRITE_DENIED_MESSAGES: Readonly<Record<string, { code: string; message: string }>> = Object.freeze({
  OBJECT_PERMISSION_DENIED: {
    code: 'CASE_FINANCE_PERMISSION_REQUIRED',
    message: 'Dosyada mali düzenleme yetkiniz yok (dosya yetkileri ofis yönetimince verilir); onay talebi açılmadı.',
  },
  HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT: { code: 'ACTOR_NOT_ACTIVE', message: 'Kullanıcı bu büroda etkin değil; onay talebi açılmadı.' },
  HUMAN_ACTOR_PROFILE_INVALID: {
    code: 'ACTOR_PROFILE_INVALID',
    message: 'Kullanıcının avukat / personel profili geçersiz; onay talebi açılmadı.',
  },
});

/**
 * Mevcut yazma / onay kapılarının ret nedenini kararlı kod + Türkçe açıklamaya çevirir. Kapı burada ATLANMAZ; yalnız
 * neden söylenir. Mevcut kapıların (HTTP istisnası) kodu / iletisi olduğu gibi korunur; beklenmeyen iç hatanın ham metni
 * kullanıcıya TAŞINMAZ (genel ileti döner, ayrıntı sunucu günlüğünde kalır).
 */
export function describeOpeningClaimRequestRejection(error: unknown): { errorCode: string; message: string } {
  const err = error as { getResponse?: () => unknown; response?: unknown; code?: unknown; message?: unknown } | null;
  const response = (typeof err?.getResponse === 'function' ? err.getResponse() : err?.response) as
    | { code?: unknown; message?: unknown }
    | string
    | undefined;
  const responseObject = typeof response === 'object' && response !== null ? response : undefined;
  const rawMessage = String(responseObject?.message ?? (typeof response === 'string' ? response : undefined) ?? err?.message ?? '');
  const denied = CLAIM_ITEM_WRITE_DENIED.exec(rawMessage);
  if (denied) {
    const known = WRITE_DENIED_MESSAGES[denied[1]];
    if (known) return { errorCode: known.code, message: known.message };
    return {
      errorCode: `CLAIM_ITEM_WRITE_DENIED:${denied[1]}`,
      message: `Alacak kalemi yazma kapısı talebi reddetti (${denied[1]}); onay talebi açılmadı.`,
    };
  }
  const isHttpRejection = typeof err?.getResponse === 'function';
  if (!isHttpRejection) {
    return { errorCode: 'OPENING_CLAIM_REQUEST_FAILED', message: 'Onay talebi beklenmeyen bir hata nedeniyle açılamadı; beyanı kalem panelinden yeniden girin.' };
  }
  const errorCode = String(responseObject?.code ?? 'OPENING_CLAIM_REQUEST_FAILED');
  return { errorCode, message: rawMessage || errorCode };
}

/**
 * DOSYA AÇILIŞINDA KALEM BEYANLARI — önizleme, açılış öncesi kabul ve kayıt sonrası onay talepleri.
 *
 * - Önizleme ve kabul SAFtır (`opening-claim-requests.ts`); veritabanına dokunmaz.
 * - Kabul, dosya transaction'ından ÖNCE çalışır: geçersiz beyan, gösterilmemiş / değişmiş girdi ya da kapalı seçim
 *   bayrağında istek bütün olarak reddedilir; dosya, taraf ve kalem HİÇ oluşmaz (kısmi kayıt yok).
 * - Talepler dosya commit edildikten SONRA, mevcut yollarla açılır:
 *     faiz işler beyanı  → `ClaimItemService.updateFromUser` (yüksek etkili kalem güncellemesi; iki kişi onayı),
 *     sorumluluk seçimi  → `ClaimLiabilitySelectionService.preview` + `request` (aynı işlem kodu; iki kişi onayı).
 *   Yeni yazma yolu, yeni yetki ya da paralel onay mekanizması YOKTUR; mevcut yetki kapıları atlanmaz. Kapının reddi
 *   dosya açılışını geri almaz: sonuç yanıtta ve denetim kaydında raporlanır, kullanıcı aynı beyanı dosyanın kalem
 *   panelinden yeniden yapabilir.
 * - Tekrar gönderim: aynı dosya numarası ikinci kez açılamaz (mevcut 409); talepler kalem / dosya başına sabit
 *   tekrarsızlık anahtarı taşır, aynı içerik ikinci talep üretmez.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseController.openingClaimPreview() → POST /cases/opening-claim-preview
 * ///  - CaseService.create() → POST /cases (kabul: transaction öncesi; talepler: commit sonrası)
 * /// </remarks>
 */
@Injectable()
export class CaseOpeningClaimRequestsService {
  private readonly logger = new Logger(CaseOpeningClaimRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly claimItems?: ClaimItemService,
    @Optional() private readonly liabilitySelection?: ClaimLiabilitySelectionService,
  ) {}

  preview(dto: OpeningClaimPreviewRequestDto): OpeningClaimPreviewResponse {
    const { preview } = evaluateOpeningClaimRequests({
      currency: dto.currency ?? 'TRY',
      dues: dto.dues ?? [],
      debtorIds: (dto.caseDebtors ?? []).map((row) => row.debtorId),
      requests: dto.openingClaimRequests,
    });
    return { ...preview, secimYazmaAcik: isClaimLiabilitySelectionEnabled() };
  }

  /**
   * Açılış isteğindeki beyanları transaction ÖNCESİ doğrular. Beyan yoksa `null` (açılış bugünkü gibidir).
   * Geçersiz beyan → 400; önizleme özeti uyuşmuyor → 409; seçim bayrağı kapalıyken seçim → 409. Hiçbir kayıt yazılmaz.
   */
  assertAdmissible(dto: CreateCaseDto): OpeningClaimPlan | null {
    const requests = dto.openingClaimRequests;
    if (!requests || !hasOpeningClaimRequests(requests)) return null;
    const { preview, plan } = evaluateOpeningClaimRequests({
      currency: dto.currency ?? 'TRY',
      dues: dto.dues ?? [],
      // Sorumluluk seçimi yalnız yeni borçlu biçimiyle (caseDebtors) yapılır; eski `debtors[]` biçiminde seçim reddedilir.
      debtorIds: (dto.caseDebtors ?? []).map((row) => row.debtorId),
      requests,
    });
    if (!preview.uygulanabilir) {
      throw new BadRequestException({
        code: 'OPENING_CLAIM_REQUESTS_INVALID',
        message: 'Açılış beyanları geçersiz; dosya oluşturulmadı.',
        errors: preview.hatalar,
      });
    }
    if (requests.previewHash !== preview.onizlemeOzeti) {
      throw new ConflictException({
        code: 'OPENING_CLAIM_PREVIEW_STALE',
        message: 'Önizlemeden sonra kalemler, borçlular ya da beyanlar değişti; dosya oluşturulmadı. Yeni önizleme alın.',
      });
    }
    if (plan.liabilitySelections.length > 0 && !isClaimLiabilitySelectionEnabled()) {
      throw new ConflictException({
        code: 'CLAIM_LIABILITY_SELECTION_DISABLED',
        message: 'Borçlu sorumluluğu seçimi bu ortamda kapalı; dosya oluşturulmadı. Seçimi kaldırıp yeniden deneyin.',
      });
    }
    return plan;
  }

  /**
   * Dosya commit edildikten SONRA beyanları mevcut onay yollarına talep olarak açar. Hata fırlatmaz: her beyanın sonucu
   * (açıldı / reddedildi / atlandı) döner ve denetim kaydına yazılır. Dosya açılışı geri alınmaz.
   */
  async requestAfterCommit(input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly caseId: string;
    readonly plan: OpeningClaimPlan;
    /** `dues[]` sırasıyla hizalı; alacak kalemi üretmeyen satırda `null`. */
    readonly claimItemIdByDueIndex: ReadonlyArray<string | null>;
  }): Promise<OpeningClaimRequestsOutcome> {
    const { tenantId, userId, caseId, plan, claimItemIdByDueIndex } = input;

    const faizBeyanlari: OpeningInterestAccrualOutcome[] = [];
    for (const accrual of plan.interestAccruals) {
      const claimItemId = claimItemIdByDueIndex[accrual.dueIndex] ?? null;
      if (!claimItemId) {
        faizBeyanlari.push({
          dueIndex: accrual.dueIndex,
          claimItemId: null,
          status: 'SKIPPED',
          errorCode: 'CLAIM_ITEM_NOT_CREATED',
          message: 'Bu satır için alacak kalemi oluşmadı; faiz talebi açılmadı.',
        });
        continue;
      }
      if (!this.claimItems) {
        faizBeyanlari.push({
          dueIndex: accrual.dueIndex,
          claimItemId,
          status: 'SKIPPED',
          errorCode: 'CLAIM_ITEM_SERVICE_UNAVAILABLE',
          message: 'Kalem güncelleme servisi bu ortamda bağlı değil; faiz talebi açılmadı.',
        });
        continue;
      }
      try {
        // Sonradan düzenlemeyle AYNI yol: yüksek etkili alan → onay kaydı; kalem onaylanana kadar değişmez.
        const patch = {
          interestAccrualStatus: 'ACCRUES',
          interestStartDateProvenance: accrual.interestStartDateProvenance,
          ...(accrual.interestStartDate ? { interestStartDate: accrual.interestStartDate } : {}),
        } as unknown as UpdateClaimItemDto;
        const result = await this.claimItems.updateFromUser(tenantId, userId, claimItemId, patch);
        if (!result.approvalRequired || !result.approvalRequestId) {
          faizBeyanlari.push({
            dueIndex: accrual.dueIndex,
            claimItemId,
            status: 'REJECTED',
            errorCode: 'APPROVAL_NOT_REQUIRED_UNEXPECTED',
            message: 'Faiz beyanı onay gerektiren işlem olarak sınıflandırılamadı; talep açılmadı.',
          });
          continue;
        }
        faizBeyanlari.push({ dueIndex: accrual.dueIndex, claimItemId, status: 'REQUESTED', approvalRequestId: result.approvalRequestId });
      } catch (error) {
        const { errorCode, message } = describeOpeningClaimRequestRejection(error);
        // Ayrıntı yalnız sunucu günlüğünde; kullanıcıya giden ileti `describeOpeningClaimRequestRejection` çıktısıdır.
        this.logger.warn(`Açılış faiz beyanı talebi reddedildi (case=${caseId}, claimItem=${claimItemId}): ${errorCode} — ${(error as Error)?.message ?? ''}`);
        faizBeyanlari.push({ dueIndex: accrual.dueIndex, claimItemId, status: 'REJECTED', errorCode, message });
      }
    }

    let sorumlulukSecimi: OpeningLiabilitySelectionOutcome | null = null;
    if (plan.liabilitySelections.length > 0) {
      sorumlulukSecimi = await this.requestLiabilitySelection(tenantId, userId, caseId, plan, claimItemIdByDueIndex);
    }

    const requestedAccrualItems = new Set(faizBeyanlari.filter((row) => row.status === 'REQUESTED').map((row) => row.claimItemId));
    const liabilityItems =
      sorumlulukSecimi?.status === 'REQUESTED'
        ? plan.liabilitySelections.map((selection) => claimItemIdByDueIndex[selection.dueIndex] ?? null)
        : [];
    const sameItemBoth = liabilityItems.some((id) => id !== null && requestedAccrualItems.has(id));
    const tamami =
      faizBeyanlari.every((row) => row.status === 'REQUESTED') && (sorumlulukSecimi === null || sorumlulukSecimi.status === 'REQUESTED');

    const outcome: OpeningClaimRequestsOutcome = {
      requested: true,
      previewHash: plan.previewHash,
      faizBeyanlari,
      sorumlulukSecimi,
      tamami,
      onaySirasiNotu: sameItemBoth ? OPENING_CLAIM_PREVIEW_NOTES.onaySirasi : null,
      aciklama: OPENING_CLAIM_PREVIEW_NOTES.onay,
    };

    // Önizleme ↔ talep ↔ onay bağı denetim kaydında (özet + onay talebi kimlikleri + açılamayanların nedeni).
    await this.auditService
      .log({
        tenantId,
        action: tamami ? 'CASE_OPEN_CLAIM_REQUESTS_REQUESTED' : 'CASE_OPEN_CLAIM_REQUESTS_INCOMPLETE',
        entityType: 'Case',
        entityId: caseId,
        userId,
        description: tamami
          ? 'Dosya açılışında kalem beyanları için onay talepleri açıldı'
          : 'Dosya açılışında kalem beyanlarının bir kısmı için onay talebi AÇILMADI',
        metadata: {
          previewHash: plan.previewHash,
          faizBeyanlari: faizBeyanlari.map((row) => ({
            dueIndex: row.dueIndex,
            claimItemId: row.claimItemId,
            status: row.status,
            approvalRequestId: row.approvalRequestId ?? null,
            errorCode: row.errorCode ?? null,
          })),
          sorumlulukSecimi: sorumlulukSecimi
            ? {
                status: sorumlulukSecimi.status,
                kalemSayisi: sorumlulukSecimi.kalemSayisi,
                approvalRequestId: sorumlulukSecimi.approvalRequestId ?? null,
                errorCode: sorumlulukSecimi.errorCode ?? null,
              }
            : null,
        },
      } as any)
      .catch((err: any) => this.logger.warn(`Açılış kalem talepleri denetim kaydı yazılamadı: ${err?.message ?? err}`));

    return outcome;
  }

  private async requestLiabilitySelection(
    tenantId: string,
    userId: string,
    caseId: string,
    plan: OpeningClaimPlan,
    claimItemIdByDueIndex: ReadonlyArray<string | null>,
  ): Promise<OpeningLiabilitySelectionOutcome> {
    const kalemSayisi = plan.liabilitySelections.length;
    const skip = (errorCode: string, message: string): OpeningLiabilitySelectionOutcome => ({ status: 'SKIPPED', kalemSayisi, errorCode, message });
    if (!this.liabilitySelection) {
      return skip('LIABILITY_SELECTION_SERVICE_UNAVAILABLE', 'Sorumluluk seçimi servisi bu ortamda bağlı değil; seçim talebi açılmadı.');
    }
    try {
      // Kişi (Debtor.id) → dosya borçlusu satırı (CaseDebtor.id). Aynı kişi birden çok rolle yer alıyorsa ilk satır
      // kullanılır; sorumluluk kişi düzeyinde okunur (seçim alanı aynı kişiyi iki kez kabul etmez).
      const caseDebtors = await this.prisma.caseDebtor.findMany({
        where: { caseId, case: { tenantId } },
        select: { id: true, debtorId: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const caseDebtorByPerson = new Map<string, string>();
      for (const row of caseDebtors) {
        if (!caseDebtorByPerson.has(row.debtorId)) caseDebtorByPerson.set(row.debtorId, row.id);
      }

      const drafts: SelectionDraft[] = [];
      for (const selection of plan.liabilitySelections) {
        const claimItemId = claimItemIdByDueIndex[selection.dueIndex] ?? null;
        if (!claimItemId) {
          return skip('CLAIM_ITEM_NOT_CREATED', 'Seçim yapılan satırlardan biri için alacak kalemi oluşmadı; seçim talebi açılmadı.');
        }
        const parties = [];
        for (const party of selection.parties) {
          const caseDebtorId = caseDebtorByPerson.get(party.debtorId);
          if (!caseDebtorId) {
            return skip('CASE_DEBTOR_NOT_CREATED', 'Seçimdeki borçlulardan biri dosya borçlusu olarak kaydedilmedi; seçim talebi açılmadı.');
          }
          parties.push({
            caseDebtorId,
            ...(party.shareWeight !== null ? { shareWeight: party.shareWeight } : {}),
            ...(party.limitAmount !== null ? { limitAmount: party.limitAmount } : {}),
            ...(party.unlimited ? { unlimited: true } : {}),
          });
        }
        drafts.push({ claimItemId, mode: selection.mode, basis: selection.basis, basisNote: selection.basisNote, parties });
      }

      // Mevcut seçim yolu: sunucu önizlemesi (kalıcı kayıtla) → aynı özetle talep. Yetki ve bayrak orada denetlenir.
      const preview = await this.liabilitySelection.preview(tenantId, userId, caseId, drafts);
      if (!preview.uygulanabilir) {
        return {
          status: 'REJECTED',
          kalemSayisi,
          errorCode: 'LIABILITY_SELECTION_NOT_APPLICABLE',
          message: 'Sorumluluk seçimi kayıtlı dosya durumuyla uygulanamıyor; seçim talebi açılmadı.',
        };
      }
      const result = await this.liabilitySelection.request(tenantId, userId, caseId, {
        selections: drafts,
        onizlemeOzeti: preview.onizlemeOzeti,
      });
      return { status: 'REQUESTED', kalemSayisi, approvalRequestId: result.approvalRequestId };
    } catch (error) {
      const { errorCode, message } = describeOpeningClaimRequestRejection(error);
      this.logger.warn(`Açılış sorumluluk seçimi talebi reddedildi (case=${caseId}): ${errorCode} — ${(error as Error)?.message ?? ''}`);
      return { status: 'REJECTED', kalemSayisi, errorCode, message };
    }
  }
}
