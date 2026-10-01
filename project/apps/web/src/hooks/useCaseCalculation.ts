/**
 * useCaseCalculation Hook
 * 
 * Backend'den hesap özeti verilerini çeker.
 * UI'da hesaplama YAPMAZ - sadece backend'den gelen computed değerleri kullanır.
 * 
 * TEK KAYNAK PRENSİBİ:
 * - Faiz hesabı: interest-engine
 * - Masraf/harç: fee-engine
 * - Vekalet ücreti: fee-engine/attorney-fee
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api/client';

// ============================================
// TYPES
// ============================================

export interface FaizSegment {
  baslangic: string;
  bitis: string;
  gun: number;
  oran: number;
  faiz: number;
  matrah?: number;
}

export interface MahsupDetay {
  tarih: string;
  tahsilatTutar: number;
  mahsupMasraf: number;
  mahsupVekalet: number;
  mahsupTakipOncesiFaiz: number;
  mahsupFaiz: number;
  mahsupAnapara: number;
  kalanAnapara: number;
}

export interface CheckPenaltySummary {
  tutar: number;
  durum: 'KALEM_VAR' | 'ONAY_BEKLIYOR' | 'OLUSTURULMAMIS' | 'UYGULANMAZ';
  mesaj: string | null;
  kalemler: Array<{
    claimItemId: string;
    tutar: number;
    tahsilEdilen: number;
    kalan: number;
    paraBirimi: string;
    sorumluBorclular: Array<{ debtorId: string; ad: string }>;
    sorumlulukBelirsiz: boolean;
  }>;
  tahmin: { durum: 'HESAPLANDI' | 'VERI_EKSIK'; tutar: number | null; aciklama: string } | null;
}

export interface CaseCalculationResult {
  // Temel bilgiler
  caseId: string;
  hesapTarihi: string;
  takipTarihi: string;
  kalemTuru: string;
  
  // Tutarlar
  asilAlacak: number;
  /** K3-L: KESİN çek tazminatı = yalnız kesin CHECK_PENALTY kalemleri (kalem yoksa 0). */
  tazminat: number;
  /** K3-L: kalem bazlı sorumlular + durum + ayrı (bakiyeye dahil olmayan) bilgi tahmini. */
  tazminatDurumu?: CheckPenaltySummary;
  komisyon: number;
  takipOncesiFaiz: number;
  takipTutari: number;
  
  // Masraflar
  basvurmaHarci: number;
  vekaletHarci: number;
  pesinHarc: number;
  dosyaGideri: number;
  tebligatGideri: number;
  vekaletPulu: number;
  icraMasraflari: number;
  
  // Harçlar
  pesinHarcDahilTahsilHarci: number;
  pesinHarcHaricTahsilHarci: number;
  
  // Vekalet ve faiz
  vekaletUcreti: number;
  takipSonrasiFaiz: number;
  
  // Toplamlar
  toplamBorc: number;
  sonBorc: number;
  toplamTahsilat: number;
  /** K3-L KP-7: toplamTahsilat (tarih süzgeçsiz) içindeki hesap tarihinden SONRA tarihli kısım — sunucu hesabı, bilgi */
  hesapTarihindenSonrakiTahsilat?: number;
  hesapTarihindenSonrakiTahsilatAdedi?: number;
  /** K3-L: mahsubu bekletilen tahsilat — toplamTahsilat / kalanBorc içinde DEĞİL (sunucu hesabı) */
  mahsubuBekleyenTahsilat?: number;
  /** K3-L KP-3 / TK-7: talep edilmiş işlemiş faiz — hesaba DAHİL DEĞİL (kayıt yoksa null) */
  talepEdilenIslemisFaiz?: TalepEdilenIslemisFaiz | null;
  /**
   * K3-L KP-7: yalnız kanonik pilot (guarded primary) doldurur — Toplam tahsilat / Borca uygulanan / Dağıtım bekleyen,
   * hesap tarihi kapsamlı. Legacy yanıtta YOK (legacy panel "Tahsilat Düşümü" satırını gösterir).
   */
  tahsilatGosterimi?: TahsilatGosterimi;
  kalanBorc: number;
  kalanAnapara: number;
  
  // Detaylar
  mahsupDetaylari: MahsupDetay[];
  faizSegmentleri: {
    takipOncesi: FaizSegment[];
    takipSonrasi: FaizSegment[];
  };
  
  // Tahsil oranları
  tahsilOranlari: Array<{
    oran: number;
    label: string;
    tutar: number;
  }>;
}

/** K3-L KP-3 / TK-7 — talep edilmiş işlemiş faiz (sunucu: claimedInterestAmount kuralı; hesaba dahil DEĞİL). */
export interface TalepEdilenIslemisFaiz {
  hesabaDahil: false;
  gerekce: 'TALEP_EDILEN_ISLEMIS_FAIZ_HESAPLAMAYA_DAHIL_DEGIL';
  toplamParaBirimiBazinda: Record<string, number>;
  kalemler: Array<{ claimItemId: string; kalemTuru: string; paraBirimi: string; tutar: number }>;
}

/** K3-L KP-7 — kanonik tahsilat gösterimi (sunucu değerleri; istemci hesabı YOK). */
export interface TahsilatGosterimi {
  hesapTarihi: string;
  paraBirimi: string;
  toplamTahsilat: number;
  borcaUygulanan: number;
  dagitimBekleyen: number;
  /** K3-L D1: mahsubu bekletilen (borçtan düşülmedi) — dağıtım bekleyenin parçası */
  mahsubuBekleyen: number;
  /** Hesap tarihinden sonra tarihli; bu toplamlara girmedi */
  hesapTarihindenSonra: number;
  /** Masraf/fer'i kanonik mahsupta yokken borca uygulanmayan ödeme var (bir kısmı masraf/fer'iye ait olabilir) */
  masrafFeriUyarisi: boolean;
}

export interface UseCaseCalculationOptions {
  caseId: string;
  calculationDate?: string;
  autoFetch?: boolean;
}

export interface UseCaseCalculationReturn {
  data: CaseCalculationResult | null;
  loading: boolean;
  error: string | null;
  refetch: (date?: string) => Promise<void>;
}

// ============================================
// HOOK
// ============================================

export function useCaseCalculation({
  caseId,
  calculationDate,
  autoFetch = true,
}: UseCaseCalculationOptions): UseCaseCalculationReturn {
  const [data, setData] = useState<CaseCalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WSMR-A4-AB-3: bu hook eskiden hicbir iptal/bayatlik korumasi TASIMIYORDU —
  // `await` sonrasi (basari VEYA hata dalinda) dogrudan setState cagriliyordu.
  // Component GERCEKTEN unmount olmussa (rota degisimi, StrictMode'un simule
  // ettigi mount->cleanup->remount gecisi DEGIL — o SENKRON, asagida ayrica
  // aciklaniyor) veya `caseId`/`calculationDate` degisip YENI bir istek zaten
  // baslatilmissa (hizli caseId degisimi), ESKI (bayat) istegin GEC gelen
  // yaniti/reddi hala state'e YAZILIYORDU. Test ortaminda bu, cevre (jsdom/
  // React) test dosyalari arasi teardown SIRASINDA gerceklesirse `window is
  // not defined` unhandled rejection'ina yol aciyordu (React'in state-guncelleme
  // zamanlamasi `window` global'ine erisir). Bu SESSIZCE yutulan bir hata
  // DEGIL, GERCEK bir kusurdu — component/istek artik GECERSIZKEN state
  // yazilmasi PRODUCTION'da da yanlis: kullanici baska bir dosyaya gecmisse
  // eski dosyanin hesap ozeti YANLISLIKLA yeni ekrana yazilabilirdi.
  //
  // isMountedRef: GERCEK unmount korumasi (component omru boyunca gecerli).
  // fetchTokenRef: jenerasyon sayaci — her fetchCalculation cagrisi kendi
  // token'ini alir; yalniz EN SON baslatilan istegin sonucu state'e yazilir.
  // StrictMode'un mount->cleanup->remount dongusu TAMAMEN SENKRONDUR (aralarinda
  // await/microtask YOK) — bu yuzden isMountedRef bu gecis sirasinda YANLIS
  // false TAKILI KALMAZ (bkz. a4-ab-2-preflight-strictmode-ismounted.spec.tsx'te
  // AYNI desen icin zaten kanitlanan analiz).
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const fetchTokenRef = useRef(0);

  const fetchCalculation = useCallback(async (date?: string) => {
    if (!caseId) {
      setError('Case ID gerekli');
      return;
    }

    const token = ++fetchTokenRef.current;
    setLoading(true);
    setError(null);

    try {
      const targetDate = date || calculationDate || new Date().toISOString().split('T')[0];

      // Backend'den hesap özeti al
      const response = await apiClient.get<CaseCalculationResult>(
        `/cases/${caseId}/calculation-summary?date=${targetDate}`
      );

      if (!isMountedRef.current || token !== fetchTokenRef.current) return; // unmount/bayat istek
      setData(response.data);
    } catch (err: any) {
      if (!isMountedRef.current || token !== fetchTokenRef.current) return; // unmount/bayat istek
      console.error('[useCaseCalculation] Error:', err);
      setError(err.message || 'Hesap özeti alınamadı');
      setData(null);
    } finally {
      if (isMountedRef.current && token === fetchTokenRef.current) setLoading(false);
    }
  }, [caseId, calculationDate]);

  // Auto fetch on mount and when dependencies change
  useEffect(() => {
    if (autoFetch && caseId) {
      fetchCalculation();
    }
  }, [autoFetch, caseId, calculationDate, fetchCalculation]);

  return {
    data,
    loading,
    error,
    refetch: fetchCalculation,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Para formatla (TL)
 */
export function formatTL(amount: number): string {
  return amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ₺';
}

/**
 * Tarih formatla
 */
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('tr-TR');
}

/**
 * Kalem türü label'ı
 */
export function getKalemLabel(kalemTuru: string): string {
  const labels: Record<string, string> = {
    CEK: 'Çek',
    SENET: 'Senet',
    FATURA: 'Fatura',
    ASIL_ALACAK: 'Asıl Alacak',
    PRINCIPAL: 'Asıl Alacak',
  };
  return labels[kalemTuru] || 'Asıl Alacak';
}

export default useCaseCalculation;
