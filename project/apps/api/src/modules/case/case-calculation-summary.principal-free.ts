import type { CaseBalanceDisplay } from '../interest-engine/orchestration/case-balance-display';

/**
 * Anaparasız dosya (yalnız masraf / fer'i; örn. ilam vekâlet ücreti + yargılama gideri) için hesap özetine EKLEMELİ
 * açıklayıcı döküm. SAF.
 *
 * - Kaynak: kanonik görünüm (`NO_PRINCIPAL_BASIS` tanısı + ücret projeksiyonu). Kanonik otorite (SHADOW_ONLY /
 *   UNSAFE_FOR_PRIMARY_DISPLAY) YÜKSELTİLMEZ; döküm `ACIKLAYICI_DOKUM` olarak işaretlenir, nihai borç değildir.
 * - Tutarlar kayıtlı kalem tutarıdır; toplam sunucunun para birimi bazlı projeksiyon toplamıdır (istemci hesabı yok,
 *   çevirme yok). Birden çok para biriminde tek toplam ÜRETİLMEZ.
 * - Faiz: kalemin kaydı UNKNOWN / boşsa "BELIRLENEMEDI"; sıfır ya da "işlemez" kabulüne çevrilmez. Nihai borç toplamı
 *   her durumda `null` (hesaplanamadı).
 * - Takip vekâlet ücreti (eski özetin tarife hesabı) bu dökümde YOKTUR; ilam / kayıtlı vekâlet ücretinin yerine geçmez.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - CaseService.getCalculationSummary() → GET /cases/:id/calculation-summary (`anaparasizKalemDokumu`, yalnız doluyken)
 * </remarks>
 */
export type AnaparasizKalemFaizDurumu = 'BELIRLENEMEDI' | 'HESAPLANMADI' | 'ISLEMEZ_KAYITLI';

export interface AnaparasizKalemDokumuKalem {
  claimItemId: string;
  kod: string;
  kalemTuru: string;
  etiket: string;
  tutar: number | null;
  faizDurumu: AnaparasizKalemFaizDurumu;
}

export interface AnaparasizKalemDokumuParaBirimi {
  paraBirimi: string;
  kalemler: AnaparasizKalemDokumuKalem[];
  /** Sunucunun bu para birimindeki kaynak tutar toplamı; satırlardan biri kullanılamıyorsa null. */
  kalemTutarlariToplami: number | null;
}

export interface AnaparasizKalemDokumu {
  durum: 'NIHAI_TOPLAM_HESAPLANAMADI';
  otorite: 'ACIKLAYICI_DOKUM';
  kanonikOtorite: string;
  gerekce: 'NO_PRINCIPAL_BASIS';
  paraBirimleri: AnaparasizKalemDokumuParaBirimi[];
  faizDurumu: 'BELIRLENEMEDI' | 'HESAPLANMADI';
  nihaiBorcToplami: null;
  mesaj: string;
}

const KOD_ETIKET: Record<string, string> = {
  VEKALET_UCRETI: 'Vekâlet Ücreti (alacak kalemi)',
  YARGILAMA_GIDERI: 'Yargılama Gideri',
};

function faizDurumu(status: unknown): AnaparasizKalemFaizDurumu {
  if (status === 'NO_INTEREST') return 'ISLEMEZ_KAYITLI';
  if (status === 'ACCRUES') return 'HESAPLANMADI';
  return 'BELIRLENEMEDI';
}

function etiket(kod: string, description: unknown): string {
  const kayitli = typeof description === 'string' ? description.trim() : '';
  const temel = KOD_ETIKET[kod] ?? "Masraf / fer'i kalemi";
  return kayitli.length > 0 && kayitli.toLocaleUpperCase('tr-TR') !== temel.toLocaleUpperCase('tr-TR')
    ? `${temel} — ${kayitli}`
    : temel;
}

export function buildAnaparasizKalemDokumu(display: CaseBalanceDisplay | null): AnaparasizKalemDokumu | undefined {
  if (!display) return undefined;
  const tani = display.diagnostics.find((diagnostic) => diagnostic.code === 'NO_PRINCIPAL_BASIS');
  if (!tani) return undefined;
  const gozlemler = Array.isArray(tani.details?.observations)
    ? (tani.details?.observations as Array<Record<string, unknown>>)
    : [];
  const gozlemById = new Map(gozlemler.map((row) => [String(row.claimItemId), row]));

  const paraBirimleri: AnaparasizKalemDokumuParaBirimi[] = display.feeProjection.groups
    .filter((group) => gozlemler.some((row) => row.currency === group.currency))
    .map((group) => ({
      paraBirimi: group.currency,
      kalemler: group.lines.map((line) => {
        const gozlem = gozlemById.get(line.sourceItemId);
        return {
          claimItemId: line.sourceItemId,
          kod: line.code,
          kalemTuru: line.itemType,
          etiket: etiket(line.code, gozlem?.description),
          tutar: line.status === 'AVAILABLE' ? line.amount : null,
          faizDurumu: faizDurumu(gozlem?.interestAccrualStatus),
        };
      }),
      kalemTutarlariToplami: group.status === 'AVAILABLE' ? group.totalProjectedAmount : null,
    }));
  if (paraBirimleri.length === 0) return undefined;

  const belirsiz = paraBirimleri.some((pb) => pb.kalemler.some((kalem) => kalem.faizDurumu === 'BELIRLENEMEDI'));
  return {
    durum: 'NIHAI_TOPLAM_HESAPLANAMADI',
    otorite: 'ACIKLAYICI_DOKUM',
    kanonikOtorite: display.authority,
    gerekce: 'NO_PRINCIPAL_BASIS',
    paraBirimleri,
    faizDurumu: belirsiz ? 'BELIRLENEMEDI' : 'HESAPLANMADI',
    nihaiBorcToplami: null,
    mesaj:
      'Dosyada anapara kalemi yok. Kalem tutarları kayıtlı kaynak tutarlarıdır. ' +
      (belirsiz
        ? 'Kalemlerin faiz durumu belirlenmediği için faiz hesaplanmadı (sıfır sayılmadı); '
        : 'Kalemlerin faizi hesaplanmadı; ') +
      'nihai borç toplamı hesaplanamadı. Bu döküm açıklayıcıdır, nihai mali hesap değildir.',
  };
}
