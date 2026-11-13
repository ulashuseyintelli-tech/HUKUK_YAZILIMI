import type { CaseBalanceDisplay } from '../interest-engine/orchestration/case-balance-display';

/**
 * Anaparasız dosya (yalnız masraf / fer'i; örn. ilam vekâlet ücreti + yargılama gideri) için hesap özetine EKLEMELİ
 * açıklayıcı döküm. SAF.
 *
 * - Kaynak: kanonik görünüm (`NO_PRINCIPAL_BASIS` tanısı + ücret projeksiyonu). Kanonik otorite (SHADOW_ONLY /
 *   UNSAFE_FOR_PRIMARY_DISPLAY) YÜKSELTİLMEZ; döküm `ACIKLAYICI_DOKUM` olarak işaretlenir, nihai borç değildir.
 * - Tutarlar kayıtlı kalem tutarıdır; toplam sunucunun para birimi bazlı projeksiyon toplamıdır (istemci hesabı yok,
 *   çevirme yok). Birden çok para biriminde tek toplam ÜRETİLMEZ.
 * - Faiz: kalemin kaydı UNKNOWN / boşsa "BELIRLENEMEDI"; sıfır ya da "işlemez" kabulüne çevrilmez. Faiz durumu, kendi
 *   türü, başlangıcı ve başlangıç dayanağı AÇIKÇA kayıtlı kalemde faiz mevcut motorla AÇIKLAYICI olarak hesaplanır
 *   (D1, owner 13.11.2026): kalem bazında takip öncesi / sonrası; hesaplanamayan ACCRUES kalem "HESAPLANMADI" + neden.
 * - "Kalem tutarları + faiz" toplamı YALNIZ her kalemin faiz durumu belliyken (HESAPLANDI / ISLEMEZ_KAYITLI) dolar ve
 *   açıklayıcıdır: harç, masraf, takip vekâlet ücreti ve ödemeler dahil DEĞİLDİR; nihai borç olarak etiketlenmez (owner K3).
 *   Nihai borç toplamı her durumda `null`; kanonik otorite yükseltilmez (owner K2).
 * - Takip vekâlet ücreti (eski özetin tarife hesabı) bu dökümde YOKTUR; ilam / kayıtlı vekâlet ücretinin yerine geçmez.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - CaseService.getCalculationSummary() → GET /cases/:id/calculation-summary (`anaparasizKalemDokumu`, yalnız doluyken)
 * </remarks>
 */
export type AnaparasizKalemFaizDurumu = 'BELIRLENEMEDI' | 'HESAPLANMADI' | 'ISLEMEZ_KAYITLI' | 'HESAPLANDI';

/** Yalnız HESAPLANDI kalemde: motorun kalem bazında yuvarlanmış değerleri (takip tarihi yoksa öncesi / sonrası null). */
export interface AnaparasizKalemFaizi {
  takipOncesi: number | null;
  takipSonrasi: number | null;
  toplam: number;
  baslangic: string | null;
  baslangicDayanagi: string | null;
  faizTuru: string | null;
}

/** Vekâlet ücreti kaleminin kayıtlı hukuki kaynağı (owner K1); NULL kayıt → BILINMIYOR. Vekâlet ücreti dışı kalemde yok. */
export type AnaparasizVekaletUcretiKaynagi = 'ILAM' | 'TAKIP' | 'BILINMIYOR';

export interface AnaparasizKalemDokumuKalem {
  claimItemId: string;
  kod: string;
  kalemTuru: string;
  etiket: string;
  tutar: number | null;
  faizDurumu: AnaparasizKalemFaizDurumu;
  /** Yalnız vekâlet ücreti (ATTORNEY_FEE) kaleminde; açıklamadan ÇIKARILMAZ, yalnız kayıtlı alandan gelir. */
  vekaletUcretiKaynagi?: AnaparasizVekaletUcretiKaynagi;
  /** D1: yalnız HESAPLANDI kalemde. */
  faiz?: AnaparasizKalemFaizi;
  /** D1: faiz hesaplanmadıysa / belirlenemediyse sunucunun neden kodu (örn. START_DATE_PROVENANCE_MISSING). */
  faizNedeni?: string;
}

export interface AnaparasizKalemDokumuParaBirimi {
  paraBirimi: string;
  kalemler: AnaparasizKalemDokumuKalem[];
  /** Sunucunun bu para birimindeki kaynak tutar toplamı; satırlardan biri kullanılamıyorsa null. */
  kalemTutarlariToplami: number | null;
  /** D1: yalnız her kalemin faiz durumu belliyken (HESAPLANDI / ISLEMEZ_KAYITLI) dolu; aksi halde null (sıfır DEĞİL). */
  faizToplami: number | null;
  takipOncesiFaizToplami: number | null;
  takipSonrasiFaizToplami: number | null;
  /** D1: kalem tutarları + faiz — AÇIKLAYICI; harç / masraf / takip vekâlet ücreti / ödeme dahil değil; nihai borç DEĞİL. */
  kalemVeFaizToplami: number | null;
}

export interface AnaparasizKalemDokumu {
  durum: 'NIHAI_TOPLAM_HESAPLANAMADI';
  otorite: 'ACIKLAYICI_DOKUM';
  kanonikOtorite: string;
  gerekce: 'NO_PRINCIPAL_BASIS';
  paraBirimleri: AnaparasizKalemDokumuParaBirimi[];
  faizDurumu: 'BELIRLENEMEDI' | 'HESAPLANMADI' | 'HESAPLANDI';
  nihaiBorcToplami: null;
  mesaj: string;
}

const KOD_ETIKET: Record<string, string> = {
  VEKALET_UCRETI: 'Vekâlet Ücreti (alacak kalemi)',
  YARGILAMA_GIDERI: 'Yargılama Gideri',
};

function faizDurumu(gozlem: Record<string, unknown> | undefined): AnaparasizKalemFaizDurumu {
  const status = gozlem?.interestAccrualStatus;
  if (status === 'NO_INTEREST') return 'ISLEMEZ_KAYITLI';
  if (status === 'ACCRUES') {
    return gozlem?.interestStatus === 'COMPUTED' && typeof gozlem.accruedInterest === 'number' ? 'HESAPLANDI' : 'HESAPLANMADI';
  }
  return 'BELIRLENEMEDI';
}

const sayiYaDaNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const metinYaDaNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function kalemFaizi(gozlem: Record<string, unknown> | undefined): AnaparasizKalemFaizi | undefined {
  if (!gozlem || gozlem.interestStatus !== 'COMPUTED' || typeof gozlem.accruedInterest !== 'number') return undefined;
  return {
    takipOncesi: sayiYaDaNull(gozlem.preEnforcementInterest),
    takipSonrasi: sayiYaDaNull(gozlem.postEnforcementInterest),
    toplam: gozlem.accruedInterest,
    baslangic: metinYaDaNull(gozlem.interestStartDate),
    baslangicDayanagi: metinYaDaNull(gozlem.interestStartDateProvenance),
    faizTuru: metinYaDaNull(gozlem.interestTypeCode),
  };
}

/** Kuruş hassasiyetinde toplam; değerlerden biri null ise null (bilinmeyen sıfır SAYILMAZ). */
function topla(degerler: Array<number | null>): number | null {
  if (degerler.some((d) => d == null)) return null;
  return degerler.reduce<number>((s, d) => s + Math.round((d as number) * 100), 0) / 100;
}

/** Para birimi faiz toplamları: YALNIZ her kalemin durumu belliyken; işlemez (kayıtlı) kalemin faiz katkısı 0'dır. */
function faizToplamlari(kalemler: AnaparasizKalemDokumuKalem[]) {
  const belli = kalemler.every((k) => k.faizDurumu === 'HESAPLANDI' || k.faizDurumu === 'ISLEMEZ_KAYITLI');
  if (!belli) return { faizToplami: null, takipOncesiFaizToplami: null, takipSonrasiFaizToplami: null };
  const katki = (alan: 'toplam' | 'takipOncesi' | 'takipSonrasi') =>
    topla(kalemler.map((k) => (k.faizDurumu === 'ISLEMEZ_KAYITLI' ? 0 : k.faiz ? k.faiz[alan] : null)));
  return { faizToplami: katki('toplam'), takipOncesiFaizToplami: katki('takipOncesi'), takipSonrasiFaizToplami: katki('takipSonrasi') };
}

/** Kayıtlı `attorneyFeeBasis` → döküm değeri. Açıklama metnine BAKILMAZ (owner K1: çıkarım yok). */
function vekaletUcretiKaynagi(itemType: unknown, basis: unknown): AnaparasizVekaletUcretiKaynagi | undefined {
  if (itemType !== 'ATTORNEY_FEE') return undefined;
  if (basis === 'JUDGMENT_AWARDED') return 'ILAM';
  if (basis === 'ENFORCEMENT_TARIFF') return 'TAKIP';
  return 'BILINMIYOR';
}

const VEKALET_KAYNAK_ETIKET: Record<AnaparasizVekaletUcretiKaynagi, string> = {
  ILAM: 'İlam Vekâlet Ücreti (alacak kalemi)',
  TAKIP: 'Takip Vekâlet Ücreti (kayıtlı kalem)',
  BILINMIYOR: 'Vekâlet Ücreti (alacak kalemi; türü belirtilmemiş)',
};

function etiket(kod: string, description: unknown, kaynak: AnaparasizVekaletUcretiKaynagi | undefined): string {
  const kayitli = typeof description === 'string' ? description.trim() : '';
  const temel = (kaynak ? VEKALET_KAYNAK_ETIKET[kaynak] : undefined) ?? KOD_ETIKET[kod] ?? "Masraf / fer'i kalemi";
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
      kalemler: group.lines.map((line): AnaparasizKalemDokumuKalem => {
        const gozlem = gozlemById.get(line.sourceItemId);
        const kaynak = vekaletUcretiKaynagi(line.itemType, gozlem?.attorneyFeeBasis);
        const durum = faizDurumu(gozlem);
        const faiz = durum === 'HESAPLANDI' ? kalemFaizi(gozlem) : undefined;
        const neden = durum === 'HESAPLANMADI' || durum === 'BELIRLENEMEDI' ? metinYaDaNull(gozlem?.interestReasonCode) : null;
        return {
          claimItemId: line.sourceItemId,
          kod: line.code,
          kalemTuru: line.itemType,
          etiket: etiket(line.code, gozlem?.description, kaynak),
          tutar: line.status === 'AVAILABLE' ? line.amount : null,
          faizDurumu: durum,
          ...(kaynak ? { vekaletUcretiKaynagi: kaynak } : {}),
          ...(faiz ? { faiz } : {}),
          ...(neden ? { faizNedeni: neden } : {}),
        };
      }),
      kalemTutarlariToplami: group.status === 'AVAILABLE' ? group.totalProjectedAmount : null,
    }))
    .map((pb): AnaparasizKalemDokumuParaBirimi => {
      const toplamlar = faizToplamlari(pb.kalemler);
      return {
        ...pb,
        ...toplamlar,
        kalemVeFaizToplami: pb.kalemTutarlariToplami == null || toplamlar.faizToplami == null
          ? null
          : topla([pb.kalemTutarlariToplami, toplamlar.faizToplami]),
      };
    });
  if (paraBirimleri.length === 0) return undefined;

  const durumlar = paraBirimleri.flatMap((pb) => pb.kalemler.map((kalem) => kalem.faizDurumu));
  const belirsiz = durumlar.includes('BELIRLENEMEDI');
  const hesaplanmadi = durumlar.includes('HESAPLANMADI');
  const genelFaizDurumu: AnaparasizKalemDokumu['faizDurumu'] = belirsiz ? 'BELIRLENEMEDI' : hesaplanmadi ? 'HESAPLANMADI' : 'HESAPLANDI';
  const faizMetni = belirsiz
    ? 'Kalemlerin faiz durumu belirlenmediği için faiz hesaplanmadı (sıfır sayılmadı); '
    : hesaplanmadi
      ? 'Bazı kalemlerin faizi hesaplanamadı (sıfır sayılmadı); '
      : 'Faiz, durumu / türü / başlangıcı / başlangıç dayanağı kayıtlı kalemlerde açıklayıcı olarak hesaplandı; ' +
        'kalem ve faiz toplamına harç, masraf, takip vekâlet ücreti ve ödemeler dahil değildir; ';
  return {
    durum: 'NIHAI_TOPLAM_HESAPLANAMADI',
    otorite: 'ACIKLAYICI_DOKUM',
    kanonikOtorite: display.authority,
    gerekce: 'NO_PRINCIPAL_BASIS',
    paraBirimleri,
    faizDurumu: genelFaizDurumu,
    nihaiBorcToplami: null,
    mesaj:
      'Dosyada anapara kalemi yok. Kalem tutarları kayıtlı kaynak tutarlarıdır. ' +
      faizMetni +
      'nihai borç toplamı hesaplanamadı. Bu döküm açıklayıcıdır, nihai mali hesap değildir.',
  };
}
