import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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

/** Talepler dosya açılış işleminin içinde açılır: ya hepsi açılmıştır ya da dosya oluşmamıştır. */
export type OpeningClaimRequestStatus = 'REQUESTED';

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
  /** Her zaman `true`: talepler dosyayla aynı işlemde açılır; biri açılamazsa dosya da oluşmaz. */
  readonly tamami: true;
  /** Onay sırası artık sonucu değiştirmez; alan geriye uyum için durur ve her zaman `null`dır. */
  readonly onaySirasiNotu: null;
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
   * Beyanları dosya açılış transaction'ı İÇİNDE mevcut onay yollarına talep olarak açar (owner talimatı 2026-11-18:
   * dosya kaydı ile talep açılışı arasında kesinti penceresi kalmasın). Dosya, taraflar, kalemler ve onay talepleri TEK
   * işlemdir: ya hepsi oluşur ya da bu yöntem hata fırlatır ve çağıranın transaction'ı geri alınır — beyan sessizce
   * kaybolamaz, talebi açılamamış "başarılı" açılış oluşamaz.
   *
   * Talep yolları sonradan düzenlemeyle AYNIDIR (`ClaimItemService.updateFromUser`, `ClaimLiabilitySelectionService`
   * `preview` + `request`); yazma kapıları, değişmezler ve talep içeriği değişmez — yalnız aynı transaction istemcisiyle
   * çalışırlar (henüz commit edilmemiş dosyayı ve dosya yetkilerini görebilmek için).
   *
   * <remarks>
   * Cagrildigi yerler:
   * - CaseService.create() → POST /cases (transaction'ın son adımı)
   * </remarks>
   */
  async requestInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      readonly tenantId: string;
      readonly userId: string;
      readonly caseId: string;
      readonly plan: OpeningClaimPlan;
      /** `dues[]` sırasıyla hizalı; alacak kalemi üretmeyen satırda `null`. */
      readonly claimItemIdByDueIndex: ReadonlyArray<string | null>;
    },
  ): Promise<OpeningClaimRequestsOutcome> {
    const { tenantId, userId, caseId, plan, claimItemIdByDueIndex } = input;

    const faizBeyanlari: OpeningInterestAccrualOutcome[] = [];
    for (const accrual of plan.interestAccruals) {
      const claimItemId = claimItemIdByDueIndex[accrual.dueIndex] ?? null;
      if (!claimItemId) {
        throw openingRequestsNotOpened('CLAIM_ITEM_NOT_CREATED', 'Faiz beyanı yapılan satır için alacak kalemi oluşmadı.', accrual.dueIndex);
      }
      if (!this.claimItems) {
        throw openingRequestsNotOpened('CLAIM_ITEM_SERVICE_UNAVAILABLE', 'Kalem güncelleme servisi bu ortamda bağlı değil.', accrual.dueIndex);
      }
      // Sonradan düzenlemeyle AYNI yol: yüksek etkili alan → onay kaydı; kalem onaylanana kadar değişmez.
      const patch = {
        interestAccrualStatus: 'ACCRUES',
        interestStartDateProvenance: accrual.interestStartDateProvenance,
        ...(accrual.interestStartDate ? { interestStartDate: accrual.interestStartDate } : {}),
      } as unknown as UpdateClaimItemDto;
      const result = await this.rethrowAsNotOpened(accrual.dueIndex, () => this.claimItems!.updateFromUser(tenantId, userId, claimItemId, patch, tx));
      if (!result.approvalRequired || !result.approvalRequestId) {
        throw openingRequestsNotOpened(
          'APPROVAL_NOT_REQUIRED_UNEXPECTED',
          'Faiz beyanı onay gerektiren işlem olarak sınıflandırılamadı.',
          accrual.dueIndex,
        );
      }
      faizBeyanlari.push({ dueIndex: accrual.dueIndex, claimItemId, status: 'REQUESTED', approvalRequestId: result.approvalRequestId });
    }

    let sorumlulukSecimi: OpeningLiabilitySelectionOutcome | null = null;
    if (plan.liabilitySelections.length > 0) {
      sorumlulukSecimi = await this.requestLiabilitySelectionInTransaction(tx, tenantId, userId, caseId, plan, claimItemIdByDueIndex);
    }

    const outcome: OpeningClaimRequestsOutcome = {
      requested: true,
      previewHash: plan.previewHash,
      faizBeyanlari,
      sorumlulukSecimi,
      tamami: true,
      onaySirasiNotu: null,
      aciklama: OPENING_CLAIM_PREVIEW_NOTES.onay,
    };

    // Önizleme ↔ talep ↔ onay bağı denetim kaydında; AYNI işlemde yazılır (dosya geri alınırsa kayıt da oluşmaz).
    await tx.auditLog.create({
      data: {
        tenantId,
        action: 'CASE_OPEN_CLAIM_REQUESTS_REQUESTED',
        entityType: 'Case',
        entityId: caseId,
        userId,
        description: 'Dosya açılışında kalem beyanları için onay talepleri açıldı',
        metadata: {
          previewHash: plan.previewHash,
          faizBeyanlari: faizBeyanlari.map((row) => ({
            dueIndex: row.dueIndex,
            claimItemId: row.claimItemId,
            approvalRequestId: row.approvalRequestId ?? null,
          })),
          sorumlulukSecimi: sorumlulukSecimi
            ? { kalemSayisi: sorumlulukSecimi.kalemSayisi, approvalRequestId: sorumlulukSecimi.approvalRequestId ?? null }
            : null,
        },
      },
    });

    return outcome;
  }

  private async requestLiabilitySelectionInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    caseId: string,
    plan: OpeningClaimPlan,
    claimItemIdByDueIndex: ReadonlyArray<string | null>,
  ): Promise<OpeningLiabilitySelectionOutcome> {
    const kalemSayisi = plan.liabilitySelections.length;
    if (!this.liabilitySelection) {
      throw openingRequestsNotOpened('LIABILITY_SELECTION_SERVICE_UNAVAILABLE', 'Sorumluluk seçimi servisi bu ortamda bağlı değil.');
    }
    // Kişi (Debtor.id) → dosya borçlusu satırı (CaseDebtor.id). Aynı kişi birden çok rolle yer alıyorsa ilk satır
    // kullanılır; sorumluluk kişi düzeyinde okunur (seçim alanı aynı kişiyi iki kez kabul etmez).
    const caseDebtors = await tx.caseDebtor.findMany({
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
        throw openingRequestsNotOpened('CLAIM_ITEM_NOT_CREATED', 'Seçim yapılan satır için alacak kalemi oluşmadı.', selection.dueIndex);
      }
      const parties = [];
      for (const party of selection.parties) {
        const caseDebtorId = caseDebtorByPerson.get(party.debtorId);
        if (!caseDebtorId) {
          throw openingRequestsNotOpened('CASE_DEBTOR_NOT_CREATED', 'Seçimdeki borçlulardan biri dosya borçlusu olarak kaydedilmedi.', selection.dueIndex);
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

    // Mevcut seçim yolu, aynı işlemde: sunucu önizlemesi (yazılmış kalemlerle) → aynı özetle talep. Yetki ve bayrak orada.
    const preview = await this.rethrowAsNotOpened(null, () => this.liabilitySelection!.preview(tenantId, userId, caseId, drafts, tx));
    if (!preview.uygulanabilir) {
      throw openingRequestsNotOpened('LIABILITY_SELECTION_NOT_APPLICABLE', 'Sorumluluk seçimi kayıtlı dosya durumuyla uygulanamıyor.');
    }
    const result = await this.rethrowAsNotOpened(null, () =>
      this.liabilitySelection!.request(tenantId, userId, caseId, { selections: drafts, onizlemeOzeti: preview.onizlemeOzeti }, tx),
    );
    return { status: 'REQUESTED', kalemSayisi, approvalRequestId: result.approvalRequestId };
  }

  /**
   * Mevcut kapıların reddini (HTTP istisnası) açılışın kendi hatasına çevirir: kod + okunur neden + hangi satır. Kapı
   * ATLANMAZ; ret dosyanın tamamını geri aldırır. Beklenmeyen iç hata olduğu gibi yükselir (işlem yine geri alınır).
   */
  private async rethrowAsNotOpened<T>(dueIndex: number | null, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (typeof (error as { getStatus?: unknown })?.getStatus !== 'function') throw error;
      const { errorCode, message } = describeOpeningClaimRequestRejection(error);
      this.logger.warn(`Açılış kalem talebi reddedildi; dosya oluşturulmayacak: ${errorCode} — ${(error as Error)?.message ?? ''}`);
      const status = (error as { getStatus: () => number }).getStatus();
      throw openingRequestsNotOpened(errorCode, message, dueIndex ?? undefined, status === 403 ? 403 : 409);
    }
  }
}

/**
 * Açılış beyanı için onay talebi açılamadı → dosya OLUŞTURULMAZ (transaction geri alınır). Kullanıcı taslağıyla kalır:
 * beyanı kaldırıp açabilir ya da engeli giderip yeniden deneyebilir.
 */
function openingRequestsNotOpened(reasonCode: string, reason: string, dueIndex?: number, status: 403 | 409 = 409) {
  const body = {
    code: 'OPENING_CLAIM_REQUESTS_NOT_OPENED',
    message: `Açılış beyanları için onay talebi açılamadı; dosya oluşturulmadı. ${reason}`,
    reasonCode,
    ...(dueIndex === undefined ? {} : { dueIndex }),
  };
  return status === 403 ? new ForbiddenException(body) : new ConflictException(body);
}
