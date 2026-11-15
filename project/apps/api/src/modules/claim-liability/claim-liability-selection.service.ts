import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OfficeApprovalStatus, type OfficeApprovalRequest, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { OfficeApprovalDomainSyncService } from '../office-approval/office-approval-domain-sync.service';
import { ClaimItemWriterRouterService } from '../claim-item/claim-item-writer-router.service';
import {
  CLAIM_ITEM_CASE_TARGET_TYPE,
  CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
  CLAIM_ITEM_LIABILITY_SELECTION_INTENT_VERSION,
  CLAIM_ITEM_LIABILITY_SELECTION_OPERATION,
  CLAIM_ITEM_TARGET_TYPE,
  type ClaimItemLiabilityProjection,
  type ClaimItemLiabilitySelectionIntentItem,
  type ClaimItemLiabilitySelectionSavedIntent,
} from '../claim-item/claim-item-approval.constants';
import {
  evaluateItemLiability,
  fromKurus,
  kurusToFixed,
  legacyProjection,
  normalizeSelectionDraft,
  toKurus,
  type EvaluatedItemLiability,
  type NormalizedSelection,
  type SelectionDraft,
  type SelectionError,
} from './claim-liability.domain';
import { loadCaseLiabilityContext, loadLiabilityItemRows, type CaseLiabilityContext } from './claim-liability.reader';
import { CLAIM_LIABILITY_KIND_LABEL, CLAIM_LIABILITY_NOTES, type ClaimLiabilityKindLabel } from './claim-liability.read-model';

import { isClaimLiabilitySelectionEnabled } from './claim-liability.flag';

const SELECTION_ITEM_STATUSES = ['ACTIVE', 'COLLECTED'] as const;
const MAX_BULK_SELECTIONS = 200;

type Db = PrismaService | Prisma.TransactionClient;

interface CaseSelectionState {
  readonly caseId: string;
  /** Tutarlar değerlendirmeden (`context.evaluations`) okunur; burada yalnız tanımlayıcı alanlar taşınır. */
  readonly items: ReadonlyArray<{
    id: string;
    itemType: string;
    description: string | null;
    currency: string;
    status: string;
    isAllDebtorsLiable: boolean;
    liableDebtorIds: string[];
  }>;
  readonly debtorNames: ReadonlyMap<string, string>;
  readonly context: CaseLiabilityContext;
}

export interface LiabilitySelectionPreviewParty {
  readonly caseDebtorId: string;
  readonly debtorId: string;
  readonly ad: string;
  readonly borcluHesabinaMahsup: number;
  readonly oncekiKalanSorumluluk: number | null;
  readonly sonrakiKalanSorumluluk: number | null;
  readonly sonrakiPay: number | null;
  readonly sonrakiTavan: number | null;
  readonly sonrakiSinirsiz: boolean;
}

export interface LiabilitySelectionPreviewItem {
  readonly claimItemId: string;
  readonly kalemTuru: string;
  readonly aciklama: string | null;
  readonly paraBirimi: string;
  readonly tutar: number;
  readonly tahsilEdilen: number;
  readonly ortakKalan: number;
  readonly oncekiTur: ClaimLiabilityKindLabel;
  readonly oncekiSecimSurumu: number | null;
  readonly sonrakiTur: ClaimLiabilityKindLabel | null;
  readonly girdiHatalari: readonly { kod: string; caseDebtorId: string | null }[];
  /** Geçmiş tahsilatla uzlaşmayan seçim — işlem DURUR; hiçbir geçmiş mahsup taşınmaz ya da yeniden atfedilmez. */
  readonly engeller: readonly { kod: string; debtorId: string | null; borcluAdi: string | null; tutar: number | null; sinir: number | null }[];
  readonly borclular: readonly LiabilitySelectionPreviewParty[];
  /** Seçim kalemin etkin seçimiyle aynı. Toplu uygulamada böyle kalem ATLANIR; talebe ve onaya girmez. */
  readonly degisiklikYok: boolean;
}

export interface LiabilitySelectionPreview {
  readonly caseId: string;
  readonly uygulamaTuru: 'SINGLE' | 'BULK';
  /** Girdi hatası ve engel yok VE en az bir kalemde değişiklik var. */
  readonly uygulanabilir: boolean;
  /** Onaya gidecek (değişen) kalem sayısı. */
  readonly uygulanacakKalemSayisi: number;
  /** Etkin seçimiyle aynı olduğu için atlanacak kalem sayısı. */
  readonly atlananKalemSayisi: number;
  readonly kalemler: readonly LiabilitySelectionPreviewItem[];
  /** Önizlenen durumun özeti; talep bu özetle gönderilir, arada değişiklik olduysa talep reddedilir. */
  readonly onizlemeOzeti: string;
  readonly aciklamalar: typeof CLAIM_LIABILITY_NOTES & { readonly kullaniciTercihi: string; readonly gecmisTahsilat: string };
}

const PREVIEW_NOTES = Object.freeze({
  ...CLAIM_LIABILITY_NOTES,
  kullaniciTercihi:
    'Bu seçim kullanıcı tercihidir. Yazılım ilam metninden, borçlu rolünden ya da borçlu sayısından sorumluluk türü çıkarmaz.',
  gecmisTahsilat:
    'Seçim geçmiş tahsilatları taşımaz ve yeniden atfetmez; paylar kalemin tam tutarından hesaplanır, oranlar yeniden ölçeklenmez. Geçmiş tahsilat yeni seçimle uzlaşmıyorsa işlem durur.',
});

/**
 * SEÇİMLİK KALEM BAZLI BORÇLU SORUMLULUĞU — seçim komutları.
 *
 * Karar: decision-log 2026-11-15, DEBTOR-OD07-CLAIM-LIABILITY-SELECTION-SA01.
 *
 * - Seçim mevcut "yüksek etkili kalem değişikliği" onay yolundan geçer (aynı işlem kodu, aynı iki kişi kuralı).
 * - Önizleme YAZMAZ. Talep yalnız onay kaydı açar. Seçim sürümü ONAY yürütmesinde, dosya kilidi altında ve durum
 *   özeti yeniden doğrulanarak yazılır; arada tahsilat ya da değişiklik olduysa yürütme reddedilir.
 * - Defter kayıtları, kalem sayacı ve atıflar DEĞİŞMEZ. Paylar tam tutardan hesaplanır; oranlar yeniden ölçeklenmez.
 * - Toplu uygulama ya hep ya hiçtir. Saklanan bir dosya varsayılanı yoktur.
 */
@Injectable()
export class ClaimLiabilitySelectionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainSync: OfficeApprovalDomainSyncService,
    @Optional() private readonly officeApproval?: OfficeApprovalService,
    @Optional() private readonly writerRouter?: ClaimItemWriterRouterService,
  ) {}

  /**
   * İşleyici her zaman kaydedilir; bayrak yürütme anında denetlenir (kapalıyken onay kapalı-hata verir, talep bekler).
   */
  onModuleInit(): void {
    this.domainSync.registerClaimItemLiabilitySelectionHandler((tx, req) => this.applyApprovedSelectionInTx(tx, req));
  }

  private assertSelectionWriteEnabled(): void {
    if (!isClaimLiabilitySelectionEnabled()) {
      throw new ConflictException({
        code: 'CLAIM_LIABILITY_SELECTION_DISABLED',
        message: 'Borçlu sorumluluğu seçimi bu ortamda kapalı. Mevcut seçimler ve okuma etkilenmez.',
      });
    }
  }

  /**
   * Önizleme — YAZMAZ. Her borçlu için önceki ve sonraki kalan sorumluluk, borçlu hesabına sayılan geçmiş mahsup ve
   * varsa engeller.
   */
  async preview(tenantId: string, actorUserId: string, caseId: string, drafts: readonly SelectionDraft[]): Promise<LiabilitySelectionPreview> {
    this.assertSelectionWriteEnabled();
    const state = await this.loadState(this.prisma, tenantId, caseId);
    await this.assertActorMayWrite(tenantId, actorUserId, caseId, drafts);
    return this.buildPreview(state, drafts).preview;
  }

  /**
   * Seçim talebi — yalnız ONAY KAYDI açar (mevcut yüksek etkili kalem değişikliği yolu). Seçim onaylanınca yazılır.
   */
  async request(
    tenantId: string,
    actorUserId: string,
    caseId: string,
    input: { readonly selections: readonly SelectionDraft[]; readonly onizlemeOzeti: string },
  ) {
    this.assertSelectionWriteEnabled();
    if (!this.officeApproval) throw new ConflictException('ClaimItem approval dependency is not available.');
    const state = await this.loadState(this.prisma, tenantId, caseId);
    await this.assertActorMayWrite(tenantId, actorUserId, caseId, input.selections);
    const { preview, normalized } = this.buildPreview(state, input.selections);

    const inputErrors = preview.kalemler.flatMap((kalem) => kalem.girdiHatalari.map((hata) => ({ claimItemId: kalem.claimItemId, ...hata })));
    if (inputErrors.length > 0) {
      throw new BadRequestException({ code: 'LIABILITY_SELECTION_INVALID', message: 'Seçim girdisi geçersiz.', errors: inputErrors });
    }
    const blockers = preview.kalemler.flatMap((kalem) => kalem.engeller.map((engel) => ({ claimItemId: kalem.claimItemId, ...engel })));
    if (blockers.length > 0) {
      throw new ConflictException({
        code: 'LIABILITY_SELECTION_BLOCKED',
        message: 'Seçim geçmiş tahsilatla uzlaşmıyor; işlem durdu. Hiçbir kaleme yazılmadı.',
        blockers,
      });
    }
    // Etkin seçimiyle aynı olan kalem talebe GİRMEZ (atlanır): toplu uygulama, bir kısmı zaten bu seçimde olan dosyada
    // kalan kalemler için kullanılabilsin. Girdi hatası ve engel yukarıda BÜTÜN kalemler için denetlendi; "ya hep ya
    // hiç" kuralı yazılacak kalemler için aynen geçerlidir. Hiçbir kalemde değişiklik yoksa talep açılmaz.
    const unchangedIds = new Set(preview.kalemler.filter((kalem) => kalem.degisiklikYok).map((kalem) => kalem.claimItemId));
    const changed = normalized.filter(({ selection }) => !unchangedIds.has(selection.claimItemId));
    if (changed.length === 0) {
      throw new BadRequestException({
        code: 'LIABILITY_SELECTION_NO_CHANGE',
        message: 'Seçim mevcut durumla aynı; değişiklik yok.',
        claimItemIds: [...unchangedIds],
      });
    }
    if (preview.onizlemeOzeti !== input.onizlemeOzeti) {
      throw new ConflictException({
        code: 'LIABILITY_SELECTION_STALE',
        message: 'Önizlemeden sonra dosyada değişiklik oldu; yeni önizleme alın.',
      });
    }

    // Tek / toplu ayrımı kullanıcının EYLEMİNE göredir: toplu uygulamada kalem atlanması talebi tek kalem talebine
    // çevirmez (hedef dosya, tek onay). Niyet yalnız yazılacak kalemleri taşır.
    const single = normalized.length === 1;
    const bulkOperationId = single ? null : randomUUID();
    const intent: ClaimItemLiabilitySelectionSavedIntent = {
      version: CLAIM_ITEM_LIABILITY_SELECTION_INTENT_VERSION,
      operation: CLAIM_ITEM_LIABILITY_SELECTION_OPERATION,
      caseId,
      appliedVia: single ? 'SINGLE' : 'BULK',
      bulkOperationId,
      selections: changed.map(({ selection, stateDigest }) => ({
        ...this.toIntentItem(selection, stateDigest),
        display: this.displaySummary(state, selection),
      })),
      reason: 'Borçlu sorumluluğu seçimi yüksek etkili kalem değişikliğidir; iki kişi onayı gerekir.',
    };
    const idempotencyKey = single
      ? `claim-item-liability:${normalized[0].selection.claimItemId}`
      : `claim-item-liability-case:${caseId}`;
    // Bekleyen farklı içerikli talep varken ikinci talep açılmaz (mevcut kalem değişikliği yoluyla aynı kural).
    const existing = await this.prisma.officeApprovalRequest.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
    // bulkOperationId her talepte yeniden üretilir; karşılaştırma onsuz yapılır.
    const comparable = (value: ClaimItemLiabilitySelectionSavedIntent) => stableJsonHash({ ...value, bulkOperationId: null });
    if (
      existing?.status === OfficeApprovalStatus.PENDING_APPROVAL &&
      comparable(existing.savedIntent as unknown as ClaimItemLiabilitySelectionSavedIntent) !== comparable(intent)
    ) {
      throw new ConflictException({
        code: 'LIABILITY_SELECTION_PENDING_CONFLICT',
        message: 'Bu kalem / dosya için farklı içerikli bekleyen bir sorumluluk seçimi talebi zaten var.',
      });
    }
    const requestRow = await this.officeApproval.createPendingRequest({
      tenantId,
      actionCode: CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
      targetType: single ? CLAIM_ITEM_TARGET_TYPE : CLAIM_ITEM_CASE_TARGET_TYPE,
      targetRef: single ? normalized[0].selection.claimItemId : caseId,
      requesterUserId: actorUserId,
      savedIntent: intent,
      idempotencyKey,
      reason: intent.reason,
    });
    return {
      applied: false as const,
      approvalRequired: true as const,
      approvalRequestId: requestRow.id,
      status: requestRow.status,
      uygulanacakKalemSayisi: changed.length,
      atlananKalemler: [...unchangedIds],
    };
  }

  /**
   * Seçim geçmişi (salt okuma; bayraktan bağımsız).
   */
  async history(tenantId: string, caseId: string, claimItemId?: string) {
    const caseRow = await this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
    if (!caseRow) throw new NotFoundException('Dosya bulunamadı');
    const [sets, caseDebtors] = await Promise.all([
      this.prisma.claimItemLiabilitySet.findMany({
        where: { tenantId, caseId, ...(claimItemId ? { claimItemId } : {}) },
        include: { parties: { orderBy: { sortOrder: 'asc' } } },
        orderBy: [{ claimItemId: 'asc' }, { version: 'desc' }],
      }),
      this.prisma.caseDebtor.findMany({
        where: { caseId, case: { tenantId } },
        select: { id: true, debtor: { select: { name: true } } },
      }),
    ]);
    const names = new Map(caseDebtors.map((row) => [row.id, String(row.debtor?.name ?? row.id)]));
    return {
      surumler: sets.map((set) => ({
        id: set.id,
        claimItemId: set.claimItemId,
        surum: set.version,
        tur: CLAIM_LIABILITY_KIND_LABEL[set.mode],
        durum: set.status,
        tavanKapsami: set.limitScope,
        dayanak: set.basis,
        dayanakNotu: set.basisNote,
        dayanakBelgeId: set.basisDocumentId,
        kararVerenKullaniciId: set.decidedByUserId,
        kararZamani: set.decidedAt.toISOString(),
        onayTalebiId: set.approvalRequestId,
        uygulamaTuru: set.appliedVia,
        topluIslemId: set.bulkOperationId,
        kapanmaZamani: set.supersededAt ? set.supersededAt.toISOString() : null,
        yerineGecenSurumId: set.supersededBySetId,
        taraflar: set.parties.map((party) => ({
          caseDebtorId: party.caseDebtorId,
          ad: names.get(party.caseDebtorId) ?? party.caseDebtorId,
          payAgirligi: party.shareWeight,
          tavan: party.limitAmount === null ? null : fromKurus(toKurus(party.limitAmount)),
          sinirsiz: party.unlimited,
        })),
      })),
    };
  }

  /**
   * ONAY YÜRÜTMESİ — karar transaction'ı içinde. Dosya kilidi (COL-LOCK-001) alınır, durum özeti yeniden hesaplanıp
   * niyetteki özetle karşılaştırılır (arada tahsilat / değişiklik → RED), seçim yeniden doğrulanır, eski etkin sürüm
   * kapanır ve yeni sürüm yazılır. Kalem satırının izdüşümü DÖNDÜRÜLÜR; onu onaylı kalem yazarı yazar.
   */
  async applyApprovedSelectionInTx(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<ClaimItemLiabilityProjection[]> {
    this.assertSelectionWriteEnabled();
    const intent = this.readIntent(req);
    const caseRow = await tx.case.findFirst({ where: { id: intent.caseId, tenantId: req.tenantId }, select: { id: true } });
    if (!caseRow) throw new ConflictException('Sorumluluk seçimi hedef dosyası bulunamadı.');

    // Tahsilat / mahsup ile aynı kilit: seçim yazımı ile tahsilat aynı dosyada sıraya girer.
    await tx.$executeRaw`
      /* COL-LOCK-001: canonical allocation lock */
      SELECT pg_advisory_xact_lock(hashtextextended(${intent.caseId}, 0))
    `;

    const state = await this.loadState(tx, req.tenantId, intent.caseId);
    const drafts: SelectionDraft[] = intent.selections.map((item) => ({
      claimItemId: item.claimItemId,
      mode: item.mode,
      basis: item.basis,
      basisNote: item.basisNote,
      basisDocumentId: item.basisDocumentId,
      parties: item.parties.map((party) => ({
        caseDebtorId: party.caseDebtorId,
        shareWeight: party.shareWeight,
        limitAmount: party.limitAmount,
        unlimited: party.unlimited,
      })),
    }));
    const { preview, normalized } = this.buildPreview(state, drafts);
    const stale = normalized.length !== intent.selections.length ||
      normalized.some(({ stateDigest }, index) => stateDigest !== intent.selections[index].stateDigest);
    if (stale) {
      throw new ConflictException({
        code: 'LIABILITY_SELECTION_STALE',
        message:
          'Talepten sonra dosyada tahsilat ya da değişiklik oldu; sorumluluk seçimi uygulanmadı. Yeni önizleme ile yeniden talep edin.',
      });
    }
    if (preview.kalemler.some((kalem) => kalem.girdiHatalari.length > 0 || kalem.engeller.length > 0)) {
      throw new ConflictException({
        code: 'LIABILITY_SELECTION_BLOCKED',
        message: 'Seçim artık uygulanamıyor (girdi ya da geçmiş tahsilat uyuşmazlığı); hiçbir kaleme yazılmadı.',
      });
    }

    const decidedAt = req.decidedAt ?? new Date();
    const projections: ClaimItemLiabilityProjection[] = [];
    for (const { selection } of normalized) {
      const currentActive = await tx.claimItemLiabilitySet.findFirst({
        where: { tenantId: req.tenantId, caseId: intent.caseId, claimItemId: selection.claimItemId, status: 'ACTIVE' },
        select: { id: true },
      });
      const latest = await tx.claimItemLiabilitySet.aggregate({
        where: { claimItemId: selection.claimItemId },
        _max: { version: true },
      });
      const newId = randomUUID();
      if (currentActive) {
        // Önce eski sürüm kapanır (kalem başına tek etkin sürüm); satır değişmez, yalnız kapanış izi yazılır.
        const closed = await tx.claimItemLiabilitySet.updateMany({
          where: { id: currentActive.id, status: 'ACTIVE' },
          data: { status: 'SUPERSEDED', supersededAt: decidedAt, supersededBySetId: newId },
        });
        if (closed.count !== 1) {
          throw new ConflictException({ code: 'LIABILITY_SELECTION_RACE', message: 'Etkin seçim eşzamanlı değişti; uygulanmadı.' });
        }
      }
      await tx.claimItemLiabilitySet.create({
        data: {
          id: newId,
          tenantId: req.tenantId,
          caseId: intent.caseId,
          claimItemId: selection.claimItemId,
          version: (latest._max.version ?? 0) + 1,
          mode: selection.mode,
          limitScope: selection.limitScope,
          status: 'ACTIVE',
          basis: selection.basis,
          basisNote: selection.basisNote,
          basisDocumentId: selection.basisDocumentId,
          decidedByUserId: req.requesterUserId,
          decidedAt,
          approvalRequestId: req.id,
          appliedVia: intent.appliedVia,
          bulkOperationId: intent.bulkOperationId,
          parties: {
            create: selection.parties.map((party) => ({
              caseDebtorId: party.caseDebtorId,
              shareWeight: party.shareWeight,
              limitAmount: party.limitKurus === null ? null : kurusToFixed(party.limitKurus),
              unlimited: party.unlimited,
              sortOrder: party.sortOrder,
            })),
          },
        },
      });
      projections.push({
        claimItemId: selection.claimItemId,
        ...legacyProjection(selection.mode, selection.parties.map((party) => party.debtorId)),
      });
    }
    return projections;
  }

  // ─────────────────────────────────────────── iç yardımcılar ───────────────────────────────────────────

  private readIntent(req: OfficeApprovalRequest): ClaimItemLiabilitySelectionSavedIntent {
    const value = req.savedIntent as Partial<ClaimItemLiabilitySelectionSavedIntent> | null;
    if (
      !value ||
      typeof value !== 'object' ||
      value.version !== CLAIM_ITEM_LIABILITY_SELECTION_INTENT_VERSION ||
      value.operation !== CLAIM_ITEM_LIABILITY_SELECTION_OPERATION
    ) {
      throw new ConflictException('Sorumluluk seçimi savedIntent geçersiz.');
    }
    if (!value.caseId || typeof value.caseId !== 'string') throw new ConflictException('Sorumluluk seçimi savedIntent caseId geçersiz.');
    if (!Array.isArray(value.selections) || value.selections.length === 0 || value.selections.length > MAX_BULK_SELECTIONS) {
      throw new ConflictException('Sorumluluk seçimi savedIntent selections geçersiz.');
    }
    const single = value.appliedVia === 'SINGLE';
    const targetOk = single
      ? req.targetType === CLAIM_ITEM_TARGET_TYPE && value.selections.length === 1 && value.selections[0].claimItemId === req.targetRef && !value.bulkOperationId
      : value.appliedVia === 'BULK' && req.targetType === CLAIM_ITEM_CASE_TARGET_TYPE && req.targetRef === value.caseId && Boolean(value.bulkOperationId);
    if (!targetOk) throw new ConflictException('Sorumluluk seçimi savedIntent hedef bilgisi geçersiz.');
    return value as ClaimItemLiabilitySelectionSavedIntent;
  }

  private toIntentItem(selection: NormalizedSelection, stateDigest: string): ClaimItemLiabilitySelectionIntentItem {
    return {
      claimItemId: selection.claimItemId,
      mode: selection.mode,
      limitScope: selection.limitScope,
      basis: selection.basis,
      basisNote: selection.basisNote,
      basisDocumentId: selection.basisDocumentId,
      parties: selection.parties.map((party) => ({
        caseDebtorId: party.caseDebtorId,
        shareWeight: party.shareWeight,
        limitAmount: party.limitKurus === null ? null : kurusToFixed(party.limitKurus),
        unlimited: party.unlimited,
        sortOrder: party.sortOrder,
      })),
      stateDigest,
    };
  }

  /**
   * Onay kutusunda gösterilecek okunur özet (onaylayan gördüğünü onaylar). Yalnız gösterim; yürütme bu metni okumaz.
   * Paylar burada HESAPLANMAZ: kullanıcının girdiği ağırlık / tavan aynen yazılır.
   */
  private displaySummary(
    state: CaseSelectionState,
    selection: NormalizedSelection,
  ): { kalem: string; tur: string; taraflar: string[]; dayanak: string | null } {
    const item = state.items.find((candidate) => candidate.id === selection.claimItemId);
    const weightSum = selection.parties.reduce((sum, party) => sum + (party.shareWeight ?? 0), 0);
    const kind = selection.mode === 'UNDETERMINED' ? 'UNDETERMINED' : selection.mode;
    return {
      kalem: item ? item.description || item.itemType : selection.claimItemId,
      tur: CLAIM_LIABILITY_KIND_LABEL[kind],
      taraflar: selection.parties.map((party) => {
        const name = state.debtorNames.get(party.caseDebtorId) ?? party.caseDebtorId;
        if (party.shareWeight !== null) return `${name}: pay ağırlığı ${party.shareWeight} / ${weightSum}`;
        if (party.unlimited) return `${name}: tavan yok`;
        if (party.limitKurus !== null) return `${name}: tavan ${kurusToFixed(party.limitKurus)} (yalnız bu kalemin tutarı)`;
        return name;
      }),
      dayanak: selection.basis,
    };
  }

  /** Mevcut kalem yazma kapısı: aktör etkin mi, dosya kapsamında mali yazma yetkisi var mı (yeni yetki modeli YOK). */
  private async assertActorMayWrite(
    tenantId: string,
    actorUserId: string,
    caseId: string,
    drafts: readonly SelectionDraft[],
  ): Promise<void> {
    if (!this.writerRouter) throw new ConflictException('ClaimItem writer boundary is not available.');
    const claimItemIds = [...new Set(drafts.map((draft) => draft.claimItemId))];
    for (const claimItemId of claimItemIds) {
      const result = await this.writerRouter.evaluateHuman({
        operation: 'UPDATE',
        tenantId,
        caseId,
        actorUserId,
        claimItemId,
        // İzdüşüm alanları yüksek etkili alanlardır → kapı onay gerektirir sonucunu verir.
        payload: { isAllDebtorsLiable: false, liableDebtorIds: [] },
      });
      if (result.outcome === 'DENIED') {
        throw new ForbiddenException({ code: 'CLAIM_LIABILITY_WRITE_DENIED', message: `Sorumluluk seçimi yetkisi yok: ${result.reasonCode}` });
      }
      if (result.outcome !== 'OFFICE_APPROVAL_REQUIRED') {
        throw new ConflictException('Sorumluluk seçimi onay gerektiren işlem olarak sınıflandırılamadı.');
      }
    }
  }

  private async loadState(db: Db, tenantId: string, caseId: string): Promise<CaseSelectionState> {
    const caseRow = await db.case.findFirst({
      where: { id: caseId, tenantId },
      select: {
        id: true,
        debtors: { select: { id: true, debtor: { select: { name: true } } } },
      },
    });
    if (!caseRow) throw new NotFoundException('Dosya bulunamadı');
    const rows = await loadLiabilityItemRows(db, { tenantId, caseId, statuses: SELECTION_ITEM_STATUSES });
    const context = await loadCaseLiabilityContext(db, { tenantId, caseId, items: rows, always: true });
    return {
      caseId,
      items: rows.map((item) => ({
        id: item.id,
        itemType: String(item.itemType),
        description: item.description,
        currency: String(item.currency || 'TRY'),
        status: String(item.status),
        isAllDebtorsLiable: item.isAllDebtorsLiable,
        liableDebtorIds: item.liableDebtorIds,
      })),
      debtorNames: new Map(caseRow.debtors.map((row) => [row.id, String(row.debtor?.name ?? row.id)])),
      context,
    };
  }

  /** Kalemin önizleme anındaki durumu: tutarlar, eski alanlar, etkin seçim, atıflar ve etkin borçlular. */
  private stateDigest(state: CaseSelectionState, itemId: string): string {
    const item = state.items.find((candidate) => candidate.id === itemId);
    const evaluation = state.context.evaluations.get(itemId);
    if (!item || !evaluation) return stableJsonHash({ v: 1, claimItemId: itemId, missing: true });
    return stableJsonHash({
      v: 1,
      claimItemId: itemId,
      status: item.status,
      demanded: kurusToFixed(evaluation.demandedKurus),
      collected: kurusToFixed(evaluation.collectedKurus),
      isAllDebtorsLiable: item.isAllDebtorsLiable,
      liableDebtorIds: [...item.liableDebtorIds].sort(),
      activeSet: evaluation.setId ? { id: evaluation.setId, version: evaluation.setVersion } : null,
      attribution: {
        byDebtor: [...evaluation.attribution.byDebtor.entries()]
          .filter(([, kurus]) => kurus !== 0n)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([debtorId, kurus]) => [debtorId, kurusToFixed(kurus)]),
        unattributed: kurusToFixed(evaluation.attribution.unattributedKurus),
      },
      activeCaseDebtorIds: state.context.caseDebtors.filter((row) => row.active).map((row) => row.caseDebtorId).sort(),
    });
  }

  private buildPreview(
    state: CaseSelectionState,
    drafts: readonly SelectionDraft[],
  ): { preview: LiabilitySelectionPreview; normalized: Array<{ selection: NormalizedSelection; stateDigest: string }> } {
    if (!Array.isArray(drafts) || drafts.length === 0 || drafts.length > MAX_BULK_SELECTIONS) {
      throw new BadRequestException({ code: 'LIABILITY_SELECTION_INVALID', message: 'En az bir, en çok 200 kalem seçimi gönderilmelidir.' });
    }
    const seen = new Set<string>();
    for (const draft of drafts) {
      if (!draft || typeof draft.claimItemId !== 'string' || !draft.claimItemId) {
        throw new BadRequestException({ code: 'LIABILITY_SELECTION_INVALID', message: 'Kalem kimliği zorunludur.' });
      }
      if (seen.has(draft.claimItemId)) {
        throw new BadRequestException({ code: 'LIABILITY_SELECTION_INVALID', message: 'Aynı kalem bir talepte iki kez yer alamaz.' });
      }
      seen.add(draft.claimItemId);
    }

    const activePersonIds = new Set(state.context.caseDebtors.filter((row) => row.active).map((row) => row.debtorId));
    const caseDebtorByPerson = new Map(state.context.caseDebtors.map((row) => [row.debtorId, row.caseDebtorId]));
    const nameOfPerson = (debtorId: string): string | null => {
      const caseDebtorId = caseDebtorByPerson.get(debtorId);
      return caseDebtorId ? state.debtorNames.get(caseDebtorId) ?? null : null;
    };

    const normalized: Array<{ selection: NormalizedSelection; stateDigest: string }> = [];
    const kalemler: LiabilitySelectionPreviewItem[] = [];
    const digestParts: unknown[] = [];

    for (const draft of drafts) {
      const item = state.items.find((candidate) => candidate.id === draft.claimItemId);
      const before = state.context.evaluations.get(draft.claimItemId);
      if (!item || !before) {
        // Başka dosyanın / kiracının kalemi ya da iptal edilmiş kalem: varlığı da açıklanmaz.
        throw new NotFoundException({ code: 'CLAIM_ITEM_NOT_FOUND', message: 'Alacak kalemi bu dosyada bulunamadı.' });
      }
      const { selection, errors } = normalizeSelectionDraft(draft, {
        caseDebtors: state.context.caseDebtors,
        claimItemActive: item.status === 'ACTIVE',
      });
      const digest = this.stateDigest(state, item.id);
      let after: EvaluatedItemLiability | null = null;
      let noChange = false;
      if (selection) {
        // "Sonraki" durum, onayda YAZILACAK kalem izdüşümüyle değerlendirilir — kalemin şimdiki kaydıyla değil. Aksi
        // hâlde seçili türden "belirlenmedi"ye dönüşte önizleme, eski kısıtlı izdüşümü görüp sonucu "kayıttan kısıtlı"
        // diye gösterir; onaydan sonra oluşan gerçek durum ise "belirlenmedi"dir.
        const projected = legacyProjection(selection.mode, selection.parties.map((party) => party.debtorId));
        after = evaluateItemLiability(
          {
            claimItemId: item.id,
            demandedKurus: before.demandedKurus,
            collectedKurus: before.collectedKurus,
            isAllDebtorsLiable: projected.isAllDebtorsLiable,
            liableDebtorIds: projected.liableDebtorIds,
            activeSet: { setId: null, version: (before.setVersion ?? 0) + 1, mode: selection.mode, parties: selection.parties },
            attribution: before.attribution,
          },
          activePersonIds,
        );
        noChange = this.isSameAsActive(state, item.id, selection);
        normalized.push({ selection, stateDigest: digest });
      }
      const personIds = new Set<string>([
        ...before.parties.map((party) => party.debtorId),
        ...(after?.parties.map((party) => party.debtorId) ?? []),
        ...[...before.attribution.byDebtor.entries()].filter(([, kurus]) => kurus !== 0n).map(([debtorId]) => debtorId),
      ]);
      const blockers = after && (after.kind === 'PROPORTIONAL' || after.kind === 'CAPPED') ? after.blockers : [];
      kalemler.push({
        claimItemId: item.id,
        kalemTuru: item.itemType,
        aciklama: item.description,
        paraBirimi: item.currency,
        tutar: fromKurus(before.demandedKurus),
        tahsilEdilen: fromKurus(before.collectedKurus),
        ortakKalan: fromKurus(before.remainingKurus),
        oncekiTur: CLAIM_LIABILITY_KIND_LABEL[before.kind],
        oncekiSecimSurumu: before.setVersion,
        sonrakiTur: after ? CLAIM_LIABILITY_KIND_LABEL[after.kind] : null,
        girdiHatalari: errors.map((error: SelectionError) => ({ kod: error.code, caseDebtorId: error.caseDebtorId ?? null })),
        engeller: blockers.map((blocker) => ({
          kod: blocker.code,
          debtorId: blocker.debtorId ?? null,
          borcluAdi: blocker.debtorId ? nameOfPerson(blocker.debtorId) : null,
          tutar: blocker.amountKurus === undefined ? null : fromKurus(blocker.amountKurus),
          sinir: blocker.boundKurus === undefined ? null : fromKurus(blocker.boundKurus),
        })),
        borclular: [...personIds].sort().map((debtorId) => {
          const beforeParty = before.parties.find((party) => party.debtorId === debtorId);
          const afterParty = after?.parties.find((party) => party.debtorId === debtorId);
          return {
            caseDebtorId: afterParty?.caseDebtorId ?? beforeParty?.caseDebtorId ?? caseDebtorByPerson.get(debtorId) ?? debtorId,
            debtorId,
            ad: nameOfPerson(debtorId) ?? debtorId,
            borcluHesabinaMahsup: fromKurus(before.attribution.byDebtor.get(debtorId) ?? 0n),
            oncekiKalanSorumluluk: beforeParty?.remainingLiabilityKurus == null ? null : fromKurus(beforeParty.remainingLiabilityKurus),
            sonrakiKalanSorumluluk: afterParty?.remainingLiabilityKurus == null ? null : fromKurus(afterParty.remainingLiabilityKurus),
            sonrakiPay: afterParty?.shareKurus == null ? null : fromKurus(afterParty.shareKurus),
            sonrakiTavan: afterParty?.limitKurus == null ? null : fromKurus(afterParty.limitKurus),
            sonrakiSinirsiz: afterParty?.unlimited ?? false,
          };
        }),
        degisiklikYok: noChange,
      });
      digestParts.push({ digest, selection: selection ? this.toIntentItem(selection, digest) : null });
    }

    // Değişmeyen kalem engel DEĞİLDİR (atlanır); ama en az bir kalemde değişiklik olmalıdır.
    const atlananKalemSayisi = kalemler.filter((kalem) => kalem.degisiklikYok).length;
    const uygulanacakKalemSayisi = kalemler.length - atlananKalemSayisi;
    const uygulanabilir =
      kalemler.every((kalem) => kalem.girdiHatalari.length === 0 && kalem.engeller.length === 0) && uygulanacakKalemSayisi > 0;
    return {
      preview: {
        caseId: state.caseId,
        uygulamaTuru: drafts.length === 1 ? 'SINGLE' : 'BULK',
        uygulanabilir,
        uygulanacakKalemSayisi,
        atlananKalemSayisi,
        kalemler,
        onizlemeOzeti: stableJsonHash({ v: 1, caseId: state.caseId, items: digestParts }),
        aciklamalar: PREVIEW_NOTES,
      },
      normalized,
    };
  }

  /** Taslak, kalemin etkin seçimiyle aynı mı (aynıysa talep açılmaz). Seçimi olmayan kalemde "belirlenmedi" değişiklik değildir. */
  private isSameAsActive(state: CaseSelectionState, claimItemId: string, selection: NormalizedSelection): boolean {
    const active = state.context.activeSets.get(claimItemId);
    if (!active) return selection.mode === 'UNDETERMINED';
    if (active.mode !== selection.mode) return false;
    const shape = (parties: NormalizedSelection['parties']) =>
      stableJsonHash(
        [...parties]
          .sort((a, b) => a.caseDebtorId.localeCompare(b.caseDebtorId))
          .map((party) => ({
            caseDebtorId: party.caseDebtorId,
            shareWeight: party.shareWeight,
            limit: party.limitKurus === null ? null : kurusToFixed(party.limitKurus),
            unlimited: party.unlimited,
          })),
      );
    return shape(active.parties) === shape(selection.parties);
  }
}
