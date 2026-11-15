import {
  fromKurus,
  type EvaluatedItemLiability,
  type ItemLiabilityKind,
  type LiabilityReconcileBlocker,
} from './claim-liability.domain';

/**
 * SEÇİMLİK KALEM BAZLI BORÇLU SORUMLULUĞU — okuma modeli (saf; veritabanı erişimi YOK).
 *
 * Yanıt hiçbir saklanan borçlu bakiyesi taşımaz: bütün rakamlar çağrı anında kalem sayacı ve defter atıflarından
 * türetilmiş değerlendirmeden gelir.
 */
export type ClaimLiabilityKindLabel = 'BELIRLENMEDI' | 'KAYITTAN_KISITLI' | 'MUTESELSIL' | 'PAYLI' | 'TUTARLA_SINIRLI';

export const CLAIM_LIABILITY_KIND_LABEL: Record<ItemLiabilityKind, ClaimLiabilityKindLabel> = {
  UNDETERMINED: 'BELIRLENMEDI',
  LEGACY_RESTRICTED: 'KAYITTAN_KISITLI',
  JOINT_AND_SEVERAL: 'MUTESELSIL',
  PROPORTIONAL: 'PAYLI',
  CAPPED: 'TUTARLA_SINIRLI',
};

export interface ClaimLiabilityBlockerView {
  readonly kod: LiabilityReconcileBlocker['code'];
  readonly debtorId: string | null;
  readonly borcluAdi: string | null;
  readonly tutar: number | null;
  readonly sinir: number | null;
}

export interface ClaimLiabilityPartyView {
  readonly caseDebtorId: string;
  readonly debtorId: string;
  readonly ad: string;
  readonly pay: number | null;
  readonly payAgirligi: number | null;
  readonly tavan: number | null;
  readonly sinirsiz: boolean;
  readonly borcluHesabinaMahsup: number;
  readonly kalanSorumluluk: number | null;
}

export interface ClaimLiabilityItemView {
  readonly claimItemId: string;
  readonly kalemTuru: string;
  readonly aciklama: string | null;
  readonly paraBirimi: string;
  readonly kalemDurumu: string;
  readonly sorumlulukTuru: ClaimLiabilityKindLabel;
  readonly secimId: string | null;
  readonly secimSurumu: number | null;
  /** Tavan YALNIZ kalemin kayıtlı tutarını kapsar; yalnız tutarla sınırlıda dolu. */
  readonly tavanKapsami: 'ITEM_AMOUNT' | null;
  readonly tutar: number;
  readonly tahsilEdilen: number;
  /** Ortak kalan — kalemin tek sayacından. */
  readonly ortakKalan: number;
  readonly atifsizMahsup: number;
  readonly uzlasiyor: boolean;
  readonly engeller: readonly ClaimLiabilityBlockerView[];
  /** Tahsilatta "hesabına ödeme yapılan borçlu" bu kalem yüzünden zorunlu mu. */
  readonly borcluGerekli: boolean;
  readonly taraflar: readonly ClaimLiabilityPartyView[];
}

export interface ClaimLiabilityState {
  readonly kalemler: readonly ClaimLiabilityItemView[];
  readonly borclular: readonly { caseDebtorId: string; debtorId: string; ad: string; rol: string; etkin: boolean }[];
  /** Dosya kalanı: kalemlerin ortak kalanından; borçlu rakamları TOPLANMAZ. */
  readonly dosyaKalani: readonly { paraBirimi: string; kalan: number }[];
  /** Dosyada tahsilat için borçlu seçimi gerektiren etkin kalem var mı. */
  readonly borcluGerekli: boolean;
  /** Yeni seçim oluşturma açık mı (bayrak). Kapalıyken okuma, mevcut seçimler ve mahsup AYNEN çalışır. */
  readonly secimYazmaAcik: boolean;
  readonly aciklamalar: {
    readonly belirlenmedi: string;
    readonly tavanKapsami: string;
    readonly asanOdeme: string;
    readonly isleyenFaiz: string;
  };
}

export const CLAIM_LIABILITY_NOTES = Object.freeze({
  belirlenmedi:
    'Sorumluluk türü seçilmemiş kalem "Belirlenmedi" görünür. Ödeme bugünkü kurallarla kalemi azaltır; borçluya özgü kesin bakiye üretilmez.',
  tavanKapsami:
    'Tutarla sınırlı sorumlulukta tavan yalnız bu kalemin kayıtlı tutarını kapsar. Kaleme işleyen faiz ve dosyadaki diğer kalemler kapsam dışıdır; her kalemin sorumluluğu kendi seçimiyle belirlenir.',
  asanOdeme:
    'Borçlunun sorumluluğunu aşan ödeme başka borçluya aktarılmaz; borçlu adına fazla ödeme olarak izlenir ve tahsilat iptaliyle kapanır. İade ve başka borca mahsup komutları bu sürümde yoktur.',
  isleyenFaiz: 'İşleyen faiz borçlu bazında gösterilmez.',
});

/**
 */
export function buildClaimLiabilityState(input: {
  readonly items: readonly { id: string; itemType: string; description: string | null; currency: string; status: string }[];
  readonly caseDebtors: readonly { caseDebtorId: string; debtorId: string; name: string; role: string; active: boolean }[];
  readonly evaluations: ReadonlyMap<string, EvaluatedItemLiability>;
  readonly selectionWriteEnabled?: boolean;
}): ClaimLiabilityState {
  const nameByPerson = new Map(input.caseDebtors.map((row) => [row.debtorId, row.name]));
  const fileRemaining = new Map<string, bigint>();
  const kalemler: ClaimLiabilityItemView[] = [];
  for (const item of input.items) {
    const evaluation = input.evaluations.get(item.id);
    if (!evaluation) continue;
    fileRemaining.set(item.currency, (fileRemaining.get(item.currency) ?? 0n) + evaluation.remainingKurus);
    kalemler.push({
      claimItemId: item.id,
      kalemTuru: item.itemType,
      aciklama: item.description,
      paraBirimi: item.currency,
      kalemDurumu: item.status,
      sorumlulukTuru: CLAIM_LIABILITY_KIND_LABEL[evaluation.kind],
      secimId: evaluation.setId,
      secimSurumu: evaluation.setVersion,
      tavanKapsami: evaluation.kind === 'CAPPED' ? 'ITEM_AMOUNT' : null,
      tutar: fromKurus(evaluation.demandedKurus),
      tahsilEdilen: fromKurus(evaluation.collectedKurus),
      ortakKalan: fromKurus(evaluation.remainingKurus),
      atifsizMahsup: fromKurus(evaluation.attribution.unattributedKurus),
      uzlasiyor: evaluation.reconciled,
      engeller: evaluation.blockers.map((blocker) => ({
        kod: blocker.code,
        debtorId: blocker.debtorId ?? null,
        borcluAdi: blocker.debtorId ? nameByPerson.get(blocker.debtorId) ?? null : null,
        tutar: blocker.amountKurus === undefined ? null : fromKurus(blocker.amountKurus),
        sinir: blocker.boundKurus === undefined ? null : fromKurus(blocker.boundKurus),
      })),
      borcluGerekli: item.status === 'ACTIVE' && evaluation.requiresOnBehalfDebtor,
      taraflar: evaluation.parties.map((party) => ({
        caseDebtorId: party.caseDebtorId,
        debtorId: party.debtorId,
        ad: nameByPerson.get(party.debtorId) ?? party.debtorId,
        pay: party.shareKurus === null ? null : fromKurus(party.shareKurus),
        payAgirligi: party.shareWeight,
        tavan: party.limitKurus === null ? null : fromKurus(party.limitKurus),
        sinirsiz: party.unlimited,
        borcluHesabinaMahsup: fromKurus(party.attributedKurus),
        kalanSorumluluk: party.remainingLiabilityKurus === null ? null : fromKurus(party.remainingLiabilityKurus),
      })),
    });
  }
  return {
    kalemler,
    borclular: input.caseDebtors.map((row) => ({
      caseDebtorId: row.caseDebtorId,
      debtorId: row.debtorId,
      ad: row.name,
      rol: row.role,
      etkin: row.active,
    })),
    dosyaKalani: [...fileRemaining.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([paraBirimi, kalan]) => ({ paraBirimi, kalan: fromKurus(kalan) })),
    borcluGerekli: kalemler.some((kalem) => kalem.borcluGerekli),
    secimYazmaAcik: input.selectionWriteEnabled === true,
    aciklamalar: CLAIM_LIABILITY_NOTES,
  };
}
