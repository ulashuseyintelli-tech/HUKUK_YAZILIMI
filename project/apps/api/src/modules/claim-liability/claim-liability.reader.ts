import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  EMPTY_ATTRIBUTION,
  evaluateItemLiability,
  kurusToFixed,
  resolveAttributedCaseDebtorId,
  resolveLiabilityAllocationScope,
  summarizeAttribution,
  toKurus,
  type AttributionSourceRow,
  type EvaluatedItemLiability,
  type ItemAttribution,
  type LiabilityAllocationScope,
  type LiabilitySetView,
  type MoneyInput,
  type SelectionCaseDebtor,
} from './claim-liability.domain';

/**
 * SEÇİMLİK KALEM BAZLI BORÇLU SORUMLULUĞU — veritabanı okuyucusu (YAZMAZ).
 *
 * Atıf yeni bir defter sütununa yazılmaz; her okumada mevcut kayıtlardan çözülür (defter dağıtım satırı → defter
 * kaydı → tahsilat → bekletme kaydı). Okuma kiracı + dosya kapsamlıdır.
 */
type LiabilityDb = Pick<
  Prisma.TransactionClient,
  'claimItemLiabilitySet' | 'caseDebtor' | 'ledgerAllocation' | 'claimItem'
>;

type ActiveLiabilitySetRow = Awaited<ReturnType<typeof findActiveLiabilitySets>>[number];

const LIABILITY_ITEM_SELECT = {
  id: true,
  itemType: true,
  description: true,
  currency: true,
  status: true,
  demandedAmount: true,
  amount: true,
  collectedAmount: true,
  isAllDebtorsLiable: true,
  liableDebtorIds: true,
} as const;

/**
 * Dosyanın kalem satırları — sorumluluk hesabının ihtiyaç duyduğu alanlarla (kiracı + dosya kapsamlı; sıra korunur).
 * Kalemin tek tahsilat sayacı YALNIZ bu okuyucuda okunur; tahsilat ve seçim servisleri sayacı doğrudan okumaz.
 */
export async function loadLiabilityItemRows(
  db: Pick<Prisma.TransactionClient, 'claimItem'>,
  input: { readonly tenantId: string; readonly caseId: string; readonly statuses: readonly ('ACTIVE' | 'COLLECTED')[] },
) {
  return db.claimItem.findMany({
    where: { tenantId: input.tenantId, caseId: input.caseId, status: { in: [...input.statuses] } },
    orderBy: { sortOrder: 'asc' },
    select: LIABILITY_ITEM_SELECT,
  });
}

export interface LiabilityItemRow {
  readonly id: string;
  readonly demandedAmount: MoneyInput;
  readonly amount?: MoneyInput;
  readonly collectedAmount: MoneyInput;
  readonly isAllDebtorsLiable: boolean;
  readonly liableDebtorIds: readonly string[] | null;
}

/** İşlem içinde henüz bekletme kaydına yazılmamış atıf (bekletilen mahsubun tamamlanması sırasında). */
export interface AttributionOverride {
  readonly collectionId: string;
  readonly caseDebtorId: string | null;
}

export interface CaseLiabilityContext {
  /** Dosyada "belirlenmedi" dışında etkin seçim var mı. Yoksa mevcut yol AYNEN çalışır. */
  readonly hasEffectiveSelection: boolean;
  readonly evaluations: ReadonlyMap<string, EvaluatedItemLiability>;
  readonly caseDebtors: readonly SelectionCaseDebtor[];
  readonly personByCaseDebtor: ReadonlyMap<string, string>;
  readonly activeSets: ReadonlyMap<string, LiabilitySetView>;
}

const UNKNOWN_CASE_DEBTOR_PREFIX = 'case-debtor:';

/**
 * Dosyanın etkin seçim sürümleri (kalem → seçim). "Belirlenmedi" modlu etkin kayıtlar dahildir.
 */
export async function findActiveLiabilitySets(
  db: Pick<Prisma.TransactionClient, 'claimItemLiabilitySet'>,
  tenantId: string,
  caseId: string,
) {
  return db.claimItemLiabilitySet.findMany({
    where: { tenantId, caseId, status: 'ACTIVE' },
    include: { parties: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Kalemlerin net defter atıfları (kiracı + dosya kapsamlı; yalnız CONFIRMED defter kaydı — kalem sayacı mutabakatıyla
 * AYNI süzgeç). Atıf kuralı tek yerdedir: `resolveAttributedCaseDebtorId`.
 */
export async function readItemAttributions(
  db: Pick<Prisma.TransactionClient, 'ledgerAllocation'>,
  input: {
    readonly tenantId: string;
    readonly caseId: string;
    readonly claimItemIds: readonly string[];
    readonly personByCaseDebtor: ReadonlyMap<string, string>;
    readonly override?: AttributionOverride | null;
  },
): Promise<Map<string, ItemAttribution>> {
  if (input.claimItemIds.length === 0) return new Map();
  const rows = await db.ledgerAllocation.findMany({
    where: {
      claimItemId: { in: [...input.claimItemIds] },
      ledgerEntry: { tenantId: input.tenantId, caseId: input.caseId, status: 'CONFIRMED' },
    },
    select: {
      claimItemId: true,
      amount: true,
      ledgerEntry: {
        select: {
          collectionId: true,
          collection: {
            select: {
              caseDebtorId: true,
              allocationHold: { select: { releasedOnBehalfCaseDebtorId: true } },
            },
          },
        },
      },
    },
  });
  const sources: AttributionSourceRow[] = rows.map((row) => {
    const collectionId = row.ledgerEntry.collectionId;
    const caseDebtorId =
      input.override && collectionId && collectionId === input.override.collectionId
        ? input.override.caseDebtorId
        : resolveAttributedCaseDebtorId({
            releasedOnBehalfCaseDebtorId: row.ledgerEntry.collection?.allocationHold?.releasedOnBehalfCaseDebtorId,
            collectionCaseDebtorId: row.ledgerEntry.collection?.caseDebtorId,
          });
    return {
      claimItemId: row.claimItemId,
      amountKurus: toKurus(row.amount),
      // Bu dosyanın borçlusu olmayan bir bağ (olmamalı) sessizce "atıfsız" sayılmaz; taraf dışı atıf olarak görünür.
      debtorId: caseDebtorId ? input.personByCaseDebtor.get(caseDebtorId) ?? `${UNKNOWN_CASE_DEBTOR_PREFIX}${caseDebtorId}` : null,
    };
  });
  return summarizeAttribution(sources);
}

/**
 * Dosyanın sorumluluk bağlamı: etkin seçimler + atıflar + kalem değerlendirmeleri.
 * Etkin (belirlenmedi dışı) seçim yoksa atıf ve borçlu sorguları YAPILMAZ; `hasEffectiveSelection = false` döner ve
 * çağıran mevcut yolu aynen kullanır (seçimsiz dosyada tek ek sorgu).
 */
export async function loadCaseLiabilityContext(
  db: LiabilityDb,
  input: {
    readonly tenantId: string;
    readonly caseId: string;
    readonly items: readonly LiabilityItemRow[];
    readonly override?: AttributionOverride | null;
    /** true: etkin seçim olmasa da atıf ve değerlendirme üretilir (okuma / önizleme). */
    readonly always?: boolean;
    /** Çağıran etkin seçimleri zaten okuduysa (aynı işlem içinde) yeniden okunmaz. */
    readonly preloadedSets?: readonly ActiveLiabilitySetRow[];
  },
): Promise<CaseLiabilityContext> {
  const itemIds = new Set(input.items.map((item) => item.id));
  const sets = (input.preloadedSets ?? (await findActiveLiabilitySets(db, input.tenantId, input.caseId))).filter((set) =>
    itemIds.has(set.claimItemId),
  );
  const hasEffectiveSelection = sets.some((set) => set.mode !== 'UNDETERMINED');
  if (!hasEffectiveSelection && !input.always) {
    return { hasEffectiveSelection: false, evaluations: new Map(), caseDebtors: [], personByCaseDebtor: new Map(), activeSets: new Map() };
  }

  const caseDebtorRows = await db.caseDebtor.findMany({
    where: { caseId: input.caseId, case: { tenantId: input.tenantId } },
    select: { id: true, debtorId: true, lifecycleStatus: true },
  });
  const caseDebtors: SelectionCaseDebtor[] = caseDebtorRows.map((row) => ({
    caseDebtorId: row.id,
    debtorId: row.debtorId,
    active: String(row.lifecycleStatus) === 'ACTIVE',
  }));
  const personByCaseDebtor = new Map(caseDebtors.map((row) => [row.caseDebtorId, row.debtorId]));
  const activePersonIds = new Set(caseDebtors.filter((row) => row.active).map((row) => row.debtorId));

  const activeSets = new Map<string, LiabilitySetView>();
  for (const set of sets) {
    activeSets.set(set.claimItemId, {
      setId: set.id,
      version: set.version,
      mode: set.mode,
      parties: set.parties.map((party) => ({
        caseDebtorId: party.caseDebtorId,
        debtorId: personByCaseDebtor.get(party.caseDebtorId) ?? `${UNKNOWN_CASE_DEBTOR_PREFIX}${party.caseDebtorId}`,
        shareWeight: party.shareWeight,
        limitKurus: party.limitAmount === null ? null : toKurus(party.limitAmount),
        unlimited: party.unlimited,
        sortOrder: party.sortOrder,
      })),
    });
  }

  const attributions = await readItemAttributions(db, {
    tenantId: input.tenantId,
    caseId: input.caseId,
    claimItemIds: [...itemIds],
    personByCaseDebtor,
    override: input.override,
  });

  const evaluations = new Map<string, EvaluatedItemLiability>();
  for (const item of input.items) {
    evaluations.set(
      item.id,
      evaluateItemLiability(
        {
          claimItemId: item.id,
          demandedKurus: toKurus(item.demandedAmount ?? item.amount),
          collectedKurus: toKurus(item.collectedAmount),
          isAllDebtorsLiable: item.isAllDebtorsLiable,
          liableDebtorIds: item.liableDebtorIds ?? [],
          activeSet: activeSets.get(item.id) ?? null,
          attribution: attributions.get(item.id) ?? EMPTY_ATTRIBUTION,
        },
        activePersonIds,
      ),
    );
  }
  return { hasEffectiveSelection, evaluations, caseDebtors, personByCaseDebtor, activeSets };
}

export interface CaseLiabilityAllocationScope {
  readonly context: CaseLiabilityContext;
  readonly scope: LiabilityAllocationScope;
  /** Hesabına ödeme yapılan kişinin anahtarı (Debtor.id); borçlu yoksa null. */
  readonly onBehalfDebtorId: string | null;
}

/**
 * Tahsilatın mahsup kapsamı. Dosyada etkin seçim YOKSA `null` döner: çağıran mevcut kuralı (payer-liability-scope)
 * AYNEN uygular; davranış değişmez ve seçimsiz dosyada TEK ek sorgu (etkin seçim sorgusu) yapılır.
 *
 * Dosya kilidi (COL-LOCK-001) çağıranda alınmış olmalıdır: kapasite okuması ile yazım aynı kilit altındadır; ikinci
 * ödeme birincinin tükettiği kapasiteyi görür.
 */
export async function resolveCaseLiabilityAllocationScope(
  db: LiabilityDb,
  input: {
    readonly tenantId: string;
    readonly caseId: string;
    /** Dosyanın ETKİN kalemleri. Verilmezse (tahsilat yolu) yalnız etkin seçim varken okuyucu tarafından okunur. */
    readonly activeItems?: readonly LiabilityItemRow[];
    readonly onBehalfCaseDebtorId: string | null | undefined;
  },
): Promise<CaseLiabilityAllocationScope | null> {
  const sets = await findActiveLiabilitySets(db, input.tenantId, input.caseId);
  if (!sets.some((set) => set.mode !== 'UNDETERMINED')) return null;
  const activeItems: readonly LiabilityItemRow[] =
    input.activeItems ?? (await loadLiabilityItemRows(db, { tenantId: input.tenantId, caseId: input.caseId, statuses: ['ACTIVE'] }));
  const context = await loadCaseLiabilityContext(db, {
    tenantId: input.tenantId,
    caseId: input.caseId,
    items: activeItems,
    preloadedSets: sets,
  });
  // Etkin seçimler yalnız etkin olmayan (ör. tahsil edilmiş) kalemlerdeyse mahsup kapsamı mevcut kuralla çözülür.
  if (!context.hasEffectiveSelection) return null;
  const onBehalfDebtorId = input.onBehalfCaseDebtorId ? context.personByCaseDebtor.get(input.onBehalfCaseDebtorId) ?? null : null;
  const scope = resolveLiabilityAllocationScope(
    activeItems.map((item) => context.evaluations.get(item.id) as EvaluatedItemLiability),
    onBehalfDebtorId,
  );
  return { context, scope, onBehalfDebtorId };
}

/**
 * YAZIM ANI DENETİMİ — mahsup yazıldıktan sonra, aynı işlem içinde: dokunulan paylı / tutarla sınırlı kalemlerde
 * uzlaşma şartı hâlâ sağlanıyor mu (atıfsız mahsup yok, taraf dışı atıf yok, hiçbir borçlu payını / tavanını aşmıyor)?
 * Sağlanmıyorsa işlem geri alınır (fırlatır); sorumluluk sınırı hiçbir yoldan aşılamaz.
 */
export async function assertLiabilityReconciledAfterWriteInTx(
  tx: LiabilityDb,
  input: {
    readonly tenantId: string;
    readonly caseId: string;
    readonly claimItemIds: readonly string[];
    readonly override?: AttributionOverride | null;
  },
): Promise<void> {
  if (input.claimItemIds.length === 0) return;
  const items = await tx.claimItem.findMany({
    where: { id: { in: [...new Set(input.claimItemIds)] }, tenantId: input.tenantId, caseId: input.caseId },
    select: LIABILITY_ITEM_SELECT,
  });
  const context = await loadCaseLiabilityContext(tx, {
    tenantId: input.tenantId,
    caseId: input.caseId,
    items,
    override: input.override,
  });
  if (!context.hasEffectiveSelection) return;
  const failed = [...context.evaluations.values()].filter(
    (evaluation) => (evaluation.kind === 'PROPORTIONAL' || evaluation.kind === 'CAPPED') && !evaluation.reconciled,
  );
  if (failed.length === 0) return;
  throw new ConflictException({
    code: 'LIABILITY_RECONCILIATION_FAILED',
    message:
      'Mahsup, borçlu sorumluluk seçimiyle uzlaşmıyor; işlem geri alındı. Hiçbir kayıt yazılmadı.',
    items: failed.map((evaluation) => ({
      claimItemId: evaluation.claimItemId,
      blockers: evaluation.blockers.map((blocker) => ({
        code: blocker.code,
        ...(blocker.debtorId ? { debtorId: blocker.debtorId } : {}),
        ...(blocker.amountKurus === undefined ? {} : { amount: kurusToFixed(blocker.amountKurus) }),
        ...(blocker.boundKurus === undefined ? {} : { bound: kurusToFixed(blocker.boundKurus) }),
      })),
    })),
  });
}
