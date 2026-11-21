import {
  type AnaparasizKalemDokumuKalem,
  type AnaparasizKalemDokumuParaBirimi,
  type AnaparasizKalemFaizDurumu,
  vekaletUcretiKaynagi,
  VEKALET_KAYNAK_ETIKET,
} from './case-calculation-summary.principal-free';

/**
 * Anaparalı dosya (eski hesap yolu) için hesap özetine EKLEMELİ açıklayıcı kalem dökümü. SAF; hesap motoru DEĞİŞMEZ.
 *
 * F02 kabul K-1 (owner kararı 22.11.2026, seçenek A — "dürüst gösterim"):
 * - Eski yol (`CaseService.getCalculationSummary`) faizi HESAPLAMAZ (sabit 0 yer tutucusu) ve toplamı yalnız asıl alacak
 *   türü Due'lardan kurar; ilam vekâlet ücreti, yargılama gideri vb. kalemler toplama girmez.
 * - Bu döküm onaylı (kanonik) kalemlerin KAYITLI tutarlarını eksiksiz listeler; bilinen kalem toplamı para birimi bazında
 *   AYRI verilir; faiz tutarı ÜRETİLMEZ (bilinmeyen faiz sıfır sayılmaz). Nihai borç toplamı her durumda `null`.
 * - Ekran bu alan varken faizi ve ona bağlı nihai toplamları (takip tutarı, toplam / son borç, oranlı son borç)
 *   "hesaplanamadı" gösterir; eski alanların değerleri ve kanonik gölge DEĞİŞMEZ (D1 anaparasız dökümüyle aynı desen).
 * - Eski toplam güvenilirse (yalnız asıl alacak / çek tazminatı / talep edilmiş işlemiş faiz kalemi var ve her kalemin
 *   faizi kayıtlı olarak işlemez) döküm ÜRETİLMEZ; eski gösterim aynen sürer (gerçek sıfır korunur).
 * - Kalem kapsamı belge sözleşmesiyle aynı: iptal / feragat edilmiş ya da sanal kalem girmez; tahsil edilmiş kalem talep
 *   tutarıyla (demandedAmount) kalır.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - CaseService.getCalculationSummary() → GET /cases/:id/calculation-summary (`anaparaliKalemDokumu`, yalnız doluyken;
 *   anaparasız dökümle birlikte üretilmez)
 * </remarks>
 */
export interface AnaparaliKalemKaydi {
  id: string;
  itemType: string;
  status: string;
  isVirtual?: boolean | null;
  amount?: unknown;
  demandedAmount?: unknown;
  currency?: string | null;
  description?: string | null;
  interestAccrualStatus?: string | null;
  attorneyFeeBasis?: string | null;
}

export type AnaparaliDokumGerekcesi = 'ESKI_YOL_FAIZ_HESAPLAMAZ' | 'ESKI_YOL_KALEM_KAPSAMI_DISI';

export interface AnaparaliKalemDokumu {
  durum: 'NIHAI_TOPLAM_HESAPLANAMADI';
  otorite: 'ACIKLAYICI_DOKUM';
  kanonikOtorite: 'ESKI_HESAP_YOLU';
  gerekceler: AnaparaliDokumGerekcesi[];
  paraBirimleri: AnaparasizKalemDokumuParaBirimi[];
  faizDurumu: 'BELIRLENEMEDI' | 'HESAPLANMADI' | 'HESAPLANDI';
  nihaiBorcToplami: null;
  mesaj: string;
}

/** Eski yolun asıl alacak / tazminat olarak saydığı ya da ayrıca bildirdiği (talep edilmiş işlemiş faiz) kalem türleri. */
const ESKI_YOL_KAPSAMINDAKI_TURLER: ReadonlySet<string> = new Set([
  'PRINCIPAL', 'CHECK_PENALTY', 'INTEREST', 'PRE_INTEREST', 'POST_INTEREST',
]);
const DISLANAN_DURUMLAR: ReadonlySet<string> = new Set(['CANCELLED', 'WAIVED']);

const TUR_ETIKET: Readonly<Record<string, string>> = {
  PRINCIPAL: 'Asıl Alacak',
  INTEREST: 'İşlemiş Faiz (talep edilen kalem)',
  PRE_INTEREST: 'Takip Öncesi Faiz (talep edilen kalem)',
  POST_INTEREST: 'Takip Sonrası Faiz (talep edilen kalem)',
  EXPENSE: 'Masraf',
  FEE: 'Harç',
  PENALTY: 'Ceza / Tazminat',
  CHECK_PENALTY: 'Karşılıksız Çek Tazminatı',
  CONTRACTUAL_PENALTY: 'Cezai Şart',
  TAX_KDV: 'KDV',
  TAX_BSMV: 'BSMV',
  TAX_KKDF: 'KKDF',
  OTHER: 'Diğer',
  YARGILAMA_GIDERI: 'Yargılama Gideri',
};

const sayi = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
};

/** Kuruş hassasiyetinde toplam; biri null ise null (bilinmeyen sıfır SAYILMAZ). */
function topla(degerler: Array<number | null>): number | null {
  if (degerler.some((d) => d == null)) return null;
  return degerler.reduce<number>((s, d) => s + Math.round((d as number) * 100), 0) / 100;
}

function faizDurumu(status: string | null | undefined): AnaparasizKalemFaizDurumu {
  if (status === 'NO_INTEREST') return 'ISLEMEZ_KAYITLI';
  if (status === 'ACCRUES') return 'HESAPLANMADI';
  return 'BELIRLENEMEDI';
}

function etiket(kayit: AnaparaliKalemKaydi): string {
  const kaynak = vekaletUcretiKaynagi(kayit.itemType, kayit.attorneyFeeBasis);
  const temel = kaynak ? VEKALET_KAYNAK_ETIKET[kaynak] : TUR_ETIKET[kayit.itemType] ?? 'Diğer kalem';
  const kayitli = typeof kayit.description === 'string' ? kayit.description.trim() : '';
  return kayitli.length > 0 && kayitli.toLocaleUpperCase('tr-TR') !== temel.toLocaleUpperCase('tr-TR')
    ? `${temel} — ${kayitli}`
    : temel;
}

export function buildAnaparaliKalemDokumu(input: {
  items: ReadonlyArray<AnaparaliKalemKaydi>;
  caseCurrency: string;
}): AnaparaliKalemDokumu | undefined {
  const kalemler = input.items.filter(
    (k) => !DISLANAN_DURUMLAR.has(String(k.status).toUpperCase()) && k.isVirtual !== true,
  );
  if (kalemler.length === 0) return undefined;

  const kapsamDisi = kalemler.some((k) => !ESKI_YOL_KAPSAMINDAKI_TURLER.has(k.itemType));
  const faizBilinmiyor = kalemler.some((k) => faizDurumu(k.interestAccrualStatus) !== 'ISLEMEZ_KAYITLI');
  if (!kapsamDisi && !faizBilinmiyor) return undefined;

  const gruplar = new Map<string, AnaparaliKalemKaydi[]>();
  for (const k of kalemler) {
    const pb = k.currency || input.caseCurrency || 'TRY';
    gruplar.set(pb, [...(gruplar.get(pb) ?? []), k]);
  }

  const paraBirimleri: AnaparasizKalemDokumuParaBirimi[] = Array.from(gruplar.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([paraBirimi, grup]) => {
      const satirlar = grup.map((k): AnaparasizKalemDokumuKalem => {
        const kaynak = vekaletUcretiKaynagi(k.itemType, k.attorneyFeeBasis);
        const durum = faizDurumu(k.interestAccrualStatus);
        return {
          claimItemId: k.id,
          kod: k.itemType,
          kalemTuru: k.itemType,
          etiket: etiket(k),
          tutar: sayi(k.demandedAmount) ?? sayi(k.amount),
          faizDurumu: durum,
          ...(kaynak ? { vekaletUcretiKaynagi: kaynak } : {}),
          ...(durum === 'HESAPLANMADI' ? { faizNedeni: 'ESKI_HESAP_YOLU_FAIZ_HESAPLAMAZ' } : {}),
        };
      });
      const faizIslemez = satirlar.every((s) => s.faizDurumu === 'ISLEMEZ_KAYITLI');
      const kalemTutarlariToplami = topla(satirlar.map((s) => s.tutar));
      return {
        paraBirimi,
        kalemler: satirlar,
        kalemTutarlariToplami,
        // Faiz tutarı yalnız her kalemin faizi kayıtlı olarak işlemezken bellidir (gerçek sıfır); aksi halde null.
        faizToplami: faizIslemez ? 0 : null,
        takipOncesiFaizToplami: faizIslemez ? 0 : null,
        takipSonrasiFaizToplami: faizIslemez ? 0 : null,
        kalemVeFaizToplami: faizIslemez ? kalemTutarlariToplami : null,
      };
    });

  const durumlar = paraBirimleri.flatMap((pb) => pb.kalemler.map((k) => k.faizDurumu));
  const genelFaizDurumu: AnaparaliKalemDokumu['faizDurumu'] = durumlar.includes('BELIRLENEMEDI')
    ? 'BELIRLENEMEDI'
    : durumlar.includes('HESAPLANMADI')
      ? 'HESAPLANMADI'
      : 'HESAPLANDI';
  const gerekceler: AnaparaliDokumGerekcesi[] = [
    ...(faizBilinmiyor ? (['ESKI_YOL_FAIZ_HESAPLAMAZ'] as const) : []),
    ...(kapsamDisi ? (['ESKI_YOL_KALEM_KAPSAMI_DISI'] as const) : []),
  ];
  const parcalar = [
    'Kalem tutarları onaylı kalemlerin kayıtlı tutarlarıdır.',
    faizBilinmiyor
      ? 'Bu hesap yolu faizi hesaplamaz: faizi işleyen ya da faiz durumu belirlenmemiş kalemlerin faizi hesaplanamadı (sıfır sayılmadı).'
      : 'Kalemlerin faizi kayıtlı olarak işlemez.',
    kapsamDisi ? 'Asıl alacak dışındaki kalemler eski özet toplamlarına dahil değildir.' : null,
    'Takip tutarı, toplam borç ve son borç hesaplanamadı. Bu döküm açıklayıcıdır, nihai mali hesap değildir.',
  ].filter((p): p is string => Boolean(p));

  return {
    durum: 'NIHAI_TOPLAM_HESAPLANAMADI',
    otorite: 'ACIKLAYICI_DOKUM',
    kanonikOtorite: 'ESKI_HESAP_YOLU',
    gerekceler,
    paraBirimleri,
    faizDurumu: genelFaizDurumu,
    nihaiBorcToplami: null,
    mesaj: parcalar.join(' '),
  };
}

/** Döküm okuması için kalem alanları (servis bu seçimle okur). */
export const ANAPARALI_DOKUM_KALEM_SELECT = {
  id: true,
  itemType: true,
  status: true,
  isVirtual: true,
  amount: true,
  demandedAmount: true,
  currency: true,
  description: true,
  interestAccrualStatus: true,
  attorneyFeeBasis: true,
} as const;
