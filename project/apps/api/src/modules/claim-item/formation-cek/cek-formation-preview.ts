import { Prisma } from '@prisma/client';
import { CHECK_PENALTY_ESTIMATE_BASIS_POINTS } from '../../case/check-penalty-summary';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import { decimalToMinor } from './case-instrument-exact-record.resolver';
import { CekLiabilityError, splitCekLiability, type CekCaseDebtorRoleRow } from './cek-liability-roles';
import { computeCheckPenaltyMinor } from './cek-penalty';

/**
 * K3-L Faz 2b (owner GO 2026-09-29 §4) — TASLAK çek tazminatı önizlemesi: SALT HESAP, yazma YOK, onay YOK.
 * Dosya henüz açılmamışken (sihirbaz) sunucu hesabıyla üretilir; K3 onay talebinin ve kesin ClaimItem'ın YERİNE GEÇMEZ.
 * Aynı saf parçalar kullanılır: kuruş kesinliği (decimalToMinor), yarıdan yukarı yuvarlama (computeCheckPenaltyMinor),
 * sorumlu kümesi (splitCekLiability: yalnız keşideci + keşideci lehine aval). Girdi eksikse "asıl alacak × %10" KÖR
 * hesabı yapılmaz → VERI_EKSIK, tutar üretilmez.
 *
 * previewHash: KANONİK girdi (sıradan bağımsız; tutar 2 ondalık, tarih YYYY-MM-DD, para birimi/rol büyük harf) + sonuç.
 * Dosya açılışında sunucu aynı fonksiyonu KALICI kayıtla yeniden çalıştırır; hash farklıysa (girdi değişmiş) K3 talebi
 * AÇILMAZ. Hash bağlayıcı bir onay DEĞİLDİR; onay yalnız K3 (ikinci avukat) akışındadır.
 */
export const CEK_FORMATION_PREVIEW_DRAFT_NOTICE = 'Taslak — onay bekliyor, gönderime hazır değil' as const;

export interface CekFormationPreviewInstrumentInput {
  readonly amount: number | string;
  readonly currency: string;
  readonly isBounced?: boolean;
  readonly bounceDate?: string | null;
}

export interface CekFormationPreviewDebtorInput {
  readonly tempId: string;
  readonly role: string;
  readonly avalForTempId?: string | null;
  /** false → takip edilmiyor (kümelere girmez); varsayılan true */
  readonly pursued?: boolean;
}

export interface CekFormationPreviewInput {
  readonly instruments: readonly CekFormationPreviewInstrumentInput[];
  readonly debtors: readonly CekFormationPreviewDebtorInput[];
}

export interface CekFormationPreviewResult {
  readonly taslak: true;
  readonly uyari: typeof CEK_FORMATION_PREVIEW_DRAFT_NOTICE;
  readonly durum: 'HESAPLANDI' | 'VERI_EKSIK';
  readonly kod: string | null;
  readonly aciklama: string;
  readonly tazminat: {
    readonly tutar: number;
    readonly paraBirimi: string;
    readonly basisPoints: number;
    /** Tazminattan sorumlu (keşideci + keşideci lehine aval) — istemci geçici kimlikleri */
    readonly sorumluTempIds: readonly string[];
    /** Bedelden sorumlu (keşideci, ciranta, aval) */
    readonly bedelSorumluTempIds: readonly string[];
  } | null;
  /** Kanonik girdi + sonuç hash'i (onay DEĞİL; talep ile önizlemenin aynı girdiye dayandığını izlemek için) */
  readonly previewHash: string;
  readonly girdiOzeti: {
    readonly cekSayisi: number;
    readonly karsiliksizCekSayisi: number;
    readonly takipEdilenBorcluSayisi: number;
  };
}

interface NormalizedInstrument {
  readonly amount: string;
  readonly amountMinor: bigint | null;
  readonly currency: string;
  readonly isBounced: boolean;
  readonly bounceDate: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function normalizeInstrument(i: CekFormationPreviewInstrumentInput): NormalizedInstrument {
  const bounceDate =
    typeof i.bounceDate === 'string' && DATE_RE.test(i.bounceDate) && !Number.isNaN(new Date(i.bounceDate).getTime())
      ? i.bounceDate.slice(0, 10)
      : null;
  const raw = String(i.amount ?? '').trim();
  let amount = raw;
  let amountMinor: bigint | null = null;
  try {
    const decimal = new Prisma.Decimal(raw);
    if (decimal.isFinite() && decimal.gt(0)) {
      amountMinor = decimalToMinor(decimal);
      if (amountMinor !== null) amount = decimal.toFixed(2);
    }
  } catch {
    amountMinor = null;
  }
  return {
    amount,
    amountMinor,
    currency: String(i.currency ?? '').trim().toUpperCase(),
    isBounced: i.isBounced === true,
    bounceDate,
  };
}

function normalizeDebtor(d: CekFormationPreviewDebtorInput) {
  return {
    tempId: String(d.tempId ?? '').trim(),
    role: String(d.role ?? '').trim().toUpperCase(),
    avalForTempId: d.avalForTempId ? String(d.avalForTempId).trim() : null,
    pursued: d.pursued !== false,
  };
}

const byKey = <T>(key: (v: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);

/**
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - ClaimItemController.previewCekFormation() → POST /claim-items/cek-formation/preview (@AllowViewerReadOnlyPost)
 * ///  - CaseService.requestCheckPenaltyFormationAfterCommit() → POST /cases (kalıcı kayıtla yeniden hesap + hash eşleşmesi)
 * /// </remarks>
 */
export function previewCekFormation(input: CekFormationPreviewInput): CekFormationPreviewResult {
  const instruments = (input.instruments ?? [])
    .map(normalizeInstrument)
    .sort(byKey((i) => `${i.currency}|${i.amount}|${i.isBounced}|${i.bounceDate ?? ''}`));
  const debtors = (input.debtors ?? [])
    .map(normalizeDebtor)
    .filter((d) => d.tempId.length > 0)
    .sort(byKey((d) => d.tempId));
  // Aynı kişinin birden çok rolü olabilir; takip listesi TEKRARSIZ (talep servisi tekrarı reddeder)
  const pursued = [...new Set(debtors.filter((d) => d.pursued).map((d) => d.tempId))];
  const girdiOzeti = {
    cekSayisi: instruments.length,
    karsiliksizCekSayisi: instruments.filter((i) => i.isBounced && i.bounceDate !== null).length,
    takipEdilenBorcluSayisi: pursued.length,
  };
  const canonicalInstruments = instruments.map(({ amount, currency, isBounced, bounceDate }) => ({ amount, currency, isBounced, bounceDate }));
  const finish = (partial: Pick<CekFormationPreviewResult, 'durum' | 'kod' | 'aciklama' | 'tazminat'>): CekFormationPreviewResult => ({
    taslak: true,
    uyari: CEK_FORMATION_PREVIEW_DRAFT_NOTICE,
    ...partial,
    previewHash: stableJsonHash({
      v: 1,
      instruments: canonicalInstruments,
      debtors,
      result: { durum: partial.durum, kod: partial.kod, tazminat: partial.tazminat },
    }),
    girdiOzeti,
  });
  const missing = (kod: string, aciklama: string) =>
    finish({ durum: 'VERI_EKSIK', kod, aciklama: `Hesaplanamadı — veri eksik: ${aciklama}`, tazminat: null });

  if (instruments.length === 0) return missing('CHECK_RECORD_REQUIRED', 'çek kaydı yok.');
  const bounced = instruments.filter((i) => i.isBounced);
  if (bounced.length === 0) return missing('CHECK_NOT_DISHONOURED', 'karşılıksız işaretli çek yok.');
  if (bounced.some((i) => i.bounceDate === null)) return missing('CHECK_BOUNCE_DATE_REQUIRED', 'karşılıksız tarihi eksik.');
  const currencies = new Set(bounced.map((i) => i.currency));
  if (currencies.size !== 1 || !bounced[0].currency) return missing('CHECK_CURRENCY_MIXED', 'çek kayıtları tek para biriminde değil.');

  let totalMinor = 0n;
  for (const i of bounced) {
    if (i.amountMinor === null) return missing('CHECK_AMOUNT_NOT_EXACT', 'çek tutarı kuruşa kesin ve pozitif değil.');
    let penaltyMinor: bigint;
    try {
      penaltyMinor = computeCheckPenaltyMinor(i.amountMinor, CHECK_PENALTY_ESTIMATE_BASIS_POINTS);
    } catch (err) {
      // 0,01–0,04 TL çekte %10 kuruşa yuvarlanınca sıfır: tutar ÜRETİLMEZ (hata 500'e dönüşmez)
      if (err instanceof RangeError) {
        return missing('CHECK_PENALTY_ROUNDS_TO_ZERO', 'tazminat kuruşa yuvarlanınca sıfır çıkıyor; tutar üretilmedi.');
      }
      throw err;
    }
    totalMinor += penaltyMinor;
  }

  if (pursued.length === 0) return missing('LIABLE_DEBTORS_REQUIRED', 'takip edilen borçlu seçilmedi.');

  // Lehine aval tutarlılığı: dosya açılışındaki yazma öncesi kontrolle AYNI kurallar (bayat/geçersiz hedef sessizce
  // "yalnız bedel" sayılmaz)
  const tempIds = new Set(debtors.map((d) => d.tempId));
  for (const d of debtors) {
    if (!d.avalForTempId) continue;
    if (d.role !== 'AVAL') return missing('AVAL_BENEFICIARY_ROLE_INVALID', 'lehine aval yalnız aval veren borçluda belirtilebilir.');
    if (d.avalForTempId === d.tempId) return missing('AVAL_BENEFICIARY_SELF', 'aval veren kendi lehine aval veremez.');
    if (!tempIds.has(d.avalForTempId)) return missing('AVAL_BENEFICIARY_NOT_IN_CASE', 'lehine aval verilen borçlu bu dosyada yok.');
  }

  // K2 (owner): tazminattan yalnız O ÇEKİN keşidecisi + keşideci lehine aval sorumludur. Roller dosya düzeyinde
  // tutulduğundan birden çok çekte hangi keşidecinin / avalın hangi çeke ait olduğu bilinemez → birden çok keşideci ya da
  // lehine aval varsa tutar ÜRETİLMEZ (çek bazında ayrı talep gerekir). Tek keşideci ve avalsız çok çek: aynı kişi.
  const pursuedSet = new Set(pursued);
  const pursuedDrawers = new Set(debtors.filter((d) => pursuedSet.has(d.tempId) && d.role === 'KESIDECI').map((d) => d.tempId));
  const pursuedDrawerAvals = debtors.filter((d) => pursuedSet.has(d.tempId) && d.role === 'AVAL' && d.avalForTempId !== null);
  if (instruments.length > 1 && (pursuedDrawers.size > 1 || pursuedDrawerAvals.length > 0)) {
    return missing(
      'CHECK_DRAWER_AMBIGUOUS',
      'birden çok çek ve birden çok keşideci / lehine aval var; kimin hangi çekten sorumlu olduğu çek kaydında yok (çek bazında ayrı talep gerekir).',
    );
  }
  const rows: CekCaseDebtorRoleRow[] = debtors.map((d) => ({
    debtorId: d.tempId,
    role: d.role,
    avalForDebtorId: d.avalForTempId,
    lifecycleStatus: 'ACTIVE',
  }));
  let split;
  try {
    split = splitCekLiability(rows, pursued);
  } catch (err) {
    if (err instanceof CekLiabilityError) {
      const message = (err.getResponse() as { message?: string })?.message ?? err.code;
      return missing(err.code, message);
    }
    throw err;
  }

  return finish({
    durum: 'HESAPLANDI',
    kod: null,
    aciklama:
      'Sunucu hesabı (karşılıksız çek tutarı × taslak oran %10, kuruşta yarıdan yukarı yuvarlama). TASLAK: kesin borca, ' +
      'bakiyeye, mahsuba ve gönderime hazır belgeye DAHİL DEĞİL; kesin kalem yalnız K3 onayıyla oluşur.',
    tazminat: {
      tutar: Number(totalMinor) / 100,
      paraBirimi: bounced[0].currency,
      basisPoints: CHECK_PENALTY_ESTIMATE_BASIS_POINTS,
      sorumluTempIds: [...split.penaltyDebtorIds],
      bedelSorumluTempIds: [...split.principalDebtorIds],
    },
  });
}
