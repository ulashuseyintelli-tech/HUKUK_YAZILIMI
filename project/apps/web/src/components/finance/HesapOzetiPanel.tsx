"use client";

/**
 * HesapOzetiPanel - Hesap Özeti Paneli
 * 
 * ✅ REFACTORED: Backend API kullanıyor
 * Tüm hesaplamalar backend'den gelir, frontend sadece görüntüler.
 * 
 * TEK KAYNAK PRENSİBİ:
 * - Faiz hesabı: interest-engine
 * - Masraf/harç: fee-engine
 * - Vekalet ücreti: fee-engine/attorney-fee
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 * @see hooks/useCaseCalculation.ts
 */

import { useState, useRef, useEffect } from "react";
import {
  Calculator,
  Receipt,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useCaseCalculation, formatTL, formatDate, CaseCalculationResult, CheckPenaltySummary, FaizSegment, MahsupDetay, ParaBirimiAlani, TahsilatGosterimi, TalepEdilenIslemisFaiz } from "@/hooks/useCaseCalculation";
import { useBalanceShadowDiff } from "@/hooks/useBalanceShadowDiff";
import { turkeyToday } from "@/lib/turkey-calendar";
import { OpeningExpenseNotice } from "@/components/expense/OpeningExpenseNotice";
import {
  buildGuardedPrimaryCalculationResult,
  evaluateGuardedPrimaryDisplayPilot,
  getGuardedPrimaryAuthorityCopy,
} from "@/lib/guarded-primary-display";

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  caseId: string;
  calculationDate?: string;
  debtorCount?: number;
  compact?: boolean;
  className?: string;
  refreshKey?: number | string;
  guardedPrimaryPilotEnabled?: boolean;
  guardedPrimaryPilotAsOfDate?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function HesapOzetiPanel({
  caseId,
  calculationDate,
  debtorCount = 1,
  compact = false,
  className = "",
  refreshKey,
  guardedPrimaryPilotEnabled = false,
  guardedPrimaryPilotAsOfDate,
}: Props) {
  // K3-L KP-11: yeni hesapta varsayılan hesap tarihi Türkiye takvimine göre bugün (UTC günü değil); kullanıcı değiştirebilir
  const [hesapTarihi, setHesapTarihi] = useState(() => calculationDate || turkeyToday());
  const [faizDokumuVisible, setFaizDokumuVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastRefreshKeyRef = useRef<Props["refreshKey"]>(refreshKey);
  
  // Backend'den hesap özeti al
  const { data: hesap, loading, error, refetch: refetchCalculation } = useCaseCalculation({
    caseId,
    calculationDate: hesapTarihi,
    autoFetch: true,
  });
  const {
    data: guardedPrimaryReport,
    loading: guardedPrimaryLoading,
    error: guardedPrimaryError,
    refetch: refetchGuardedPrimaryReport,
  } = useBalanceShadowDiff({
    caseId,
    asOfDate: guardedPrimaryPilotAsOfDate ?? hesapTarihi,
    enabled: guardedPrimaryPilotEnabled,
  });
  
  // calculationDate prop değiştiğinde state'i güncelle
  useEffect(() => {
    if (calculationDate) {
      setHesapTarihi(calculationDate);
    }
  }, [calculationDate]);
  
  // Tarih değişikliğinde yeniden hesapla
  useEffect(() => {
    if (refreshKey === undefined) return;
    if (lastRefreshKeyRef.current === refreshKey) return;

    lastRefreshKeyRef.current = refreshKey;
    refetchCalculation(hesapTarihi);
    if (guardedPrimaryPilotEnabled) {
      refetchGuardedPrimaryReport();
    }
  }, [
    guardedPrimaryPilotEnabled,
    hesapTarihi,
    refetchCalculation,
    refetchGuardedPrimaryReport,
    refreshKey,
  ]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate) {
      setHesapTarihi(newDate);
      refetchCalculation(newDate);
    }
  };
  
  // Hesap değiştiğinde scroll'u en üste al
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [hesap]);

  // Loading state
  if (loading) {
    return (
      <div className={`bg-white border rounded-lg p-4 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Hesaplanıyor...</span>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className={`bg-white border rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
        <button 
          onClick={() => refetchCalculation(hesapTarihi)}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Tekrar Dene
        </button>
      </div>
    );
  }
  
  // No data state
  if (!hesap) {
    return (
      <div className={`bg-white border rounded-lg p-4 ${className}`}>
        <div className="flex flex-col items-center justify-center py-6 text-gray-500">
          <Calculator className="h-8 w-8 mb-2 text-gray-300" />
          <p className="text-sm">Hesap özeti için alacak bilgisi gerekli</p>
        </div>
      </div>
    );
  }

  // K3-L KP-7: kanonik rapor yalnız AYNI hesap tarihli legacy özetle birleştirilir (farklı tarih kapsamı mutabık gösterilmez)
  const guardedPrimaryDecision = guardedPrimaryPilotEnabled
    ? evaluateGuardedPrimaryDisplayPilot(guardedPrimaryReport, { featureFlagEnabled: true, legacyAsOfDate: hesap.hesapTarihi })
    : null;
  const guardedPrimaryHesap = guardedPrimaryDecision && guardedPrimaryReport
    ? buildGuardedPrimaryCalculationResult(hesap, guardedPrimaryReport, guardedPrimaryDecision)
    : null;
  const displayHesap = guardedPrimaryHesap ?? hesap;
  const guardedPrimarySelected = Boolean(guardedPrimaryHesap);
  // ALC-AUTH-4A-IMPL: primarySource -- guardedPrimarySelected (yukarida) hem CANONICAL hem
  // PARTIAL_CANONICAL_LEGACY_TOTALS icin true'dur (ikisi de bir sonuc uretir); asagidaki banner
  // ve satir-bazli etiketler bu ikisini ayirt etmek icin primarySource'un kendisini kullanir.
  const guardedPrimarySource = guardedPrimaryDecision?.primarySource;
  const guardedPrimaryPartial = guardedPrimarySource === "PARTIAL_CANONICAL_LEGACY_TOTALS";
  const guardedPrimaryAuthorityCopy = guardedPrimaryDecision
    ? getGuardedPrimaryAuthorityCopy(guardedPrimaryDecision)
    : null;

  const kalemLabel = displayHesap.kalemTuru === 'CEK' ? 'Çek' :
                     displayHesap.kalemTuru === 'SENET' ? 'Senet' :
                     displayHesap.kalemTuru === 'FATURA' ? 'Fatura' : 'Asıl Alacak';
  
  // Para birimi bağlamı (sunucu kararı; istemci hesabı ve çevirme YOK): alacak dövizli ya da karma ise TL tarifesi oranlı
  // kalemler "hesaplanamadı", farklı para birimlerini toplayan satırlar "gösterilemez" yazılır; bilinen tutarlar kendi para
  // birimiyle kalır. Karar yoksa (TL dosya ya da eski sunucu yanıtı) gösterim aynen sürer.
  const paraBirimiDurumu = hesap.paraBirimiDurumu;
  const paraBirimiKisitli = paraBirimiDurumu ? !paraBirimiDurumu.toplamGosterilebilir : false;
  const alan = (ad: string): ParaBirimiAlani | undefined =>
    paraBirimiKisitli ? paraBirimiDurumu?.alanlar?.[ad] ?? GOSTERILEMEZ_ALAN : undefined;
  const tutar = (ad: string, deger: number): string => formatAlanTutari(deger, alan(ad));
  const asilAlacakAyrik = paraBirimiKisitli && alan('asilAlacak')?.durum !== 'GECERLI';
  const tahsilatAyrik = paraBirimiKisitli && alan('toplamTahsilat')?.durum !== 'GECERLI';
  const tahsilOranlariGecerli = !paraBirimiKisitli || alan('tahsilOranlari')?.durum === 'GECERLI';
  // Tutar yerine "gösterilemez" yazılan toplam satırı vurgulu tutar biçimiyle (büyük, renkli) basılmaz
  const toplamSinifi = (ad: string, vurgulu: string): string =>
    paraBirimiKisitli && alan(ad)?.durum !== 'GECERLI' ? 'font-medium text-gray-500' : vurgulu;

  return (
    <div className={`bg-white border rounded-lg flex flex-col ${className}`}>
      {/* Header */}
      <div className="px-3 py-2 border-b flex items-center justify-between flex-shrink-0">
        <h3 className="font-medium text-sm flex items-center gap-1.5">
          <Receipt className="h-4 w-4 text-purple-600" />
          Hesap Özeti
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={hesapTarihi}
            onChange={handleDateChange}
            className="border rounded px-2 py-1 text-xs w-32 cursor-pointer"
            style={{ colorScheme: 'light' }}
          />
          <button onClick={() => refetchCalculation(hesapTarihi)} className="p-1 hover:bg-gray-100 rounded">
            <RefreshCw className="h-3.5 w-3.5 text-gray-500" />
          </button>
        </div>
      </div>
      
      {/* K3-L KP-2: kaynağı doğrulanamayan dosya faiz türü (eski varsayılan olabilir) — uyarı; tür değiştirilmedi */}
      {hesap?.dosyaFaizTuru?.uyari && (
        <div data-testid="hesap-dosya-faiz-turu-uyari" className="px-3 py-1 text-[10px] text-amber-800 bg-amber-50 border-b border-amber-200 flex-shrink-0">
          {hesap.dosyaFaizTuru.uyari}
        </div>
      )}

      {/* Para birimi bağlamı: dövizli / karma dosyada oranlı kalemler hesaplanmadı, tek toplam gösterilmedi (sunucu metni) */}
      {paraBirimiKisitli && paraBirimiDurumu?.mesaj && (
        <div data-testid="hesap-para-birimi-uyari" className="px-3 py-1 text-[10px] text-amber-800 bg-amber-50 border-b border-amber-200 flex-shrink-0">
          {paraBirimiDurumu.mesaj}
        </div>
      )}

      {/* Dövizli / karma dosyada otomatik açılış masraf talebi oluşturulmaz: neden ve gereken bilgi (sunucu kararı).
          TL dosyada sorgu yapılmaz; gösterim aynen sürer. */}
      {paraBirimiKisitli && <OpeningExpenseNotice caseId={caseId} refreshKey={refreshKey} />}

      {/* Tarih bilgisi */}
      <div className="px-3 py-1 text-[10px] text-gray-400 border-b flex-shrink-0">
        Takip: {formatDate(displayHesap.takipTarihi)} → Hesap: {formatDate(displayHesap.hesapTarihi)}
      </div>

      {guardedPrimaryPilotEnabled && (
        <div
          data-testid="guarded-primary-display-pilot"
          className={`border-b px-3 py-1.5 text-[10px] ${
            guardedPrimaryPartial
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : guardedPrimarySelected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          <div className="font-semibold">
            {guardedPrimarySelected
              ? "Guarded canonical primary candidate"
              : "Legacy calculation-summary fallback"}
          </div>
          {/* Ham diagnostic kod satırı -- QA/dev icin korunur, DEGISTIRILMEDI (Fork 2, additive). */}
          <div data-testid="guarded-primary-display-reasons" className="mt-0.5">
            {guardedPrimaryLoading
              ? "SHADOW_OR_CANONICAL_SOURCE_PENDING"
              : guardedPrimaryError
                ? "SHADOW_OR_CANONICAL_SOURCE_FAILURE"
                : guardedPrimaryDecision?.reasonCodes.join(", ") || "ELIGIBLE"}
          </div>
          {/* ALC-AUTH-4A-IMPL: avukat-facing Turkce authority copy -- YENI, ayri element (additive). */}
          <div data-testid="guarded-primary-display-authority-copy" className="mt-1 font-medium not-italic">
            {guardedPrimaryLoading
              ? "Yeni hesaplama kontrol ediliyor; mevcut hesaplama gösterilmektedir."
              : guardedPrimaryError
                ? "Yeni hesaplama bilgisi şu an alınamıyor; mevcut hesaplama gösterilmektedir."
                : guardedPrimaryAuthorityCopy?.headline}
          </div>
        </div>
      )}
      
      {/* İçerik */}
      <div ref={scrollRef} className="px-3 py-2 space-y-0.5 text-xs">
        {/* Asıl Alacak — birden fazla para birimindeyse tek sayıya toplanmaz; para birimi bazında ayrı satır (sunucu değerleri) */}
        {asilAlacakAyrik
          ? paraBirimiDurumu?.asilAlacakParaBirimiBazinda.map((kalem) => (
              <Row
                key={kalem.paraBirimi}
                label={`${kalemLabel} (${kalem.paraBirimi})`}
                value={kalem.tutar}
                text={formatParaBirimli(kalem.tutar, kalem.paraBirimi)}
              />
            ))
          : <Row label={kalemLabel} value={displayHesap.asilAlacak} text={tutar('asilAlacak', displayHesap.asilAlacak)} />}
        
        {/* Tazminat ve Komisyon (Çek için) */}
        {/* K3-L: kesin tazminat YALNIZ kesin kalemden; sorumlular kalem kaydından (dosyanın tüm borçlularına yayılmaz). */}
        {displayHesap.tazminat > 0 && <Row label="Karşılıksız Çek Tazminatı" value={displayHesap.tazminat} text={tutar('tazminat', displayHesap.tazminat)} />}
        <CheckPenaltyInfo summary={hesap?.tazminatDurumu} />
        {displayHesap.komisyon > 0 && <Row label="Komisyon" value={displayHesap.komisyon} text={tutar('komisyon', displayHesap.komisyon)} />}
        
        {/* Takip Öncesi Faiz */}
        {displayHesap.takipOncesiFaiz > 0 && <Row label="Takip Öncesi Faiz" value={displayHesap.takipOncesiFaiz} text={tutar('takipOncesiFaiz', displayHesap.takipOncesiFaiz)} />}

        {/* K3-L KP-3 / TK-7: talep edilmiş işlemiş faiz — varlığı ve tutarı açık; hesaba DAHİL EDİLMEDİ (sunucu değeri) */}
        <ClaimedInterestInfo info={hesap?.talepEdilenIslemisFaiz} />
        
        {/* TAKİP TUTARI */}
        <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1.5 border-t-2 border-blue-300 bg-blue-50 rounded">
          <span className="font-semibold text-blue-800">TAKİP TUTARI</span>
          <span data-testid="hesap-deger-takipTutari" className={toplamSinifi('takipTutari', 'font-bold text-blue-700')}>{tutar('takipTutari', displayHesap.takipTutari)}</span>
        </div>
        
        {/* İcra Masrafları Detay */}
        <Row label="Başvurma Harcı" value={displayHesap.basvurmaHarci} text={tutar('basvurmaHarci', displayHesap.basvurmaHarci)} light />
        <Row label="Vekalet Harcı" value={displayHesap.vekaletHarci} text={tutar('vekaletHarci', displayHesap.vekaletHarci)} light />
        <Row label="Peşin Harç" value={displayHesap.pesinHarc} text={tutar('pesinHarc', displayHesap.pesinHarc)} light />
        <Row label="Dosya Gideri" value={displayHesap.dosyaGideri} text={tutar('dosyaGideri', displayHesap.dosyaGideri)} light />
        <Row label={`Tebligat Gideri (${debtorCount} borçlu)`} value={displayHesap.tebligatGideri} text={tutar('tebligatGideri', displayHesap.tebligatGideri)} light />
        <Row label="Vekalet Pulu" value={displayHesap.vekaletPulu} text={tutar('vekaletPulu', displayHesap.vekaletPulu)} light />
        
        {/* İCRA MASRAFLARI */}
        <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1 border-t border-gray-300 bg-gray-100 rounded">
          <span className="font-semibold text-gray-700">İCRA MASRAFLARI</span>
          <span data-testid="hesap-deger-icraMasraflari" className="font-semibold text-gray-700">{tutar('icraMasraflari', displayHesap.icraMasraflari)}</span>
        </div>
        
        {/* Tahsil Harçları */}
        <Row label="Peşin Harç Dahil Tahsil Harcı" value={displayHesap.pesinHarcDahilTahsilHarci} text={tutar('pesinHarcDahilTahsilHarci', displayHesap.pesinHarcDahilTahsilHarci)} light muted />
        <Row label="Peşin Harç Hariç Tahsil Harcı" value={displayHesap.pesinHarcHaricTahsilHarci} text={tutar('pesinHarcHaricTahsilHarci', displayHesap.pesinHarcHaricTahsilHarci)} light muted />
        
        {/* Vekalet Ücreti */}
        <div className="flex justify-between py-1 border-t border-gray-200 mt-1">
          <span className="font-medium text-gray-700">Vekalet Ücreti =</span>
          <span data-testid="hesap-deger-vekaletUcreti" className="font-semibold">{tutar('vekaletUcreti', displayHesap.vekaletUcreti)}</span>
        </div>
        
        {/* Takip Sonrası Faiz */}
        <div className="flex justify-between py-1 border-t border-gray-200">
          <span className="font-medium text-gray-700">Takip Sonrası Faiz =</span>
          <span className="font-semibold">{tutar('takipSonrasiFaiz', displayHesap.takipSonrasiFaiz)}</span>
        </div>
        
        {/* TOPLAM BORÇ */}
        <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1.5 border-t-2 border-blue-400 bg-blue-100 rounded">
          <span className="font-bold text-blue-900">
            TOPLAM BORÇ
            {guardedPrimaryPartial && (
              <span data-testid="guarded-primary-partial-label-toplam-borc" className="ml-1 font-normal text-[9px] text-blue-700">
                (mevcut hesaplama)
              </span>
            )}
          </span>
          <span data-testid="hesap-deger-toplamBorc" className={toplamSinifi('toplamBorc', 'font-bold text-blue-800')}>{tutar('toplamBorc', displayHesap.toplamBorc)}</span>
        </div>

        {/* SON BORÇ */}
        <div className="flex justify-between py-2.5 px-2 -mx-2 mt-1.5 border-t-2 border-green-400 bg-green-100 rounded">
          <span className="font-bold text-green-900">
            SON BORÇ
            {guardedPrimaryPartial && (
              <span data-testid="guarded-primary-partial-label-son-borc" className="ml-1 font-normal text-[9px] text-green-700">
                (mevcut hesaplama)
              </span>
            )}
          </span>
          <span data-testid="hesap-deger-sonBorc" className={toplamSinifi('sonBorc', 'font-bold text-xl text-green-700')}>{tutar('sonBorc', displayHesap.sonBorc)}</span>
        </div>
        
        {/* K3-L KP-7: kanonik pilotta Toplam tahsilat / Borca uygulanan / Dağıtım bekleyen (hesap tarihi kapsamlı) */}
        {displayHesap.tahsilatGosterimi
          && (displayHesap.tahsilatGosterimi.toplamTahsilat > 0 || displayHesap.tahsilatGosterimi.hesapTarihindenSonra > 0) && (
          <TahsilatGosterimiPanel
            gosterim={displayHesap.tahsilatGosterimi}
            kalanBorc={displayHesap.kalanBorc}
            kalanBorcMetni={tutar('kalanBorc', displayHesap.kalanBorc)}
            partial={guardedPrimaryPartial}
          >
            {/* TBK m.100 Mahsup Detayları (legacy diagnostic; mevcut davranış korunur) */}
            {displayHesap.mahsupDetaylari && displayHesap.mahsupDetaylari.length > 0 && (
              <MahsupDetayPanel
                mahsupDetaylari={displayHesap.mahsupDetaylari}
                asilAlacak={displayHesap.asilAlacak}
                kalanAnapara={displayHesap.kalanAnapara}
              />
            )}
          </TahsilatGosterimiPanel>
        )}

        {/* Tahsilat Düşümü ve Kalan Borç (legacy) */}
        {!displayHesap.tahsilatGosterimi && displayHesap.toplamTahsilat > 0 && (
          <div className="pt-2 mt-2 border-t border-gray-200">
            {/* Tahsilat birden fazla para birimindeyse tek sayıya toplanmaz; para birimi bazında ayrı satır (sunucu değerleri) */}
            {tahsilatAyrik
              ? paraBirimiDurumu?.tahsilatParaBirimiBazinda.map((kalem) => (
                  <div key={kalem.paraBirimi} className="flex justify-between py-1">
                    <span className="text-gray-600">Tahsilat Düşümü ({kalem.paraBirimi})</span>
                    <span className="text-red-600 font-medium">- {formatParaBirimli(kalem.tutar, kalem.paraBirimi)}</span>
                  </div>
                ))
              : (
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Tahsilat Düşümü</span>
                  <span data-testid="hesap-deger-toplamTahsilat" className="text-red-600 font-medium">- {tutar('toplamTahsilat', displayHesap.toplamTahsilat)}</span>
                </div>
              )}
            {/* K3-L KP-7: tarih kapsamı açık — bu satır tarih süzgeçsizdir; hesap tarihinden sonraki kısım ayrıca yazılır */}
            {Number(hesap?.hesapTarihindenSonrakiTahsilat ?? 0) > 0 && (
              <div data-testid="hesap-tahsilat-tarih-kapsami" className="pb-1 text-[10px] text-amber-700">
                {tahsilatAyrik
                  ? <>Tahsilatın bir kısmı hesap tarihinden ({formatDate(displayHesap.hesapTarihi)}) sonra tarihlidir.</>
                  : <>
                      Bu tutarın {tutar('hesapTarihindenSonrakiTahsilat', Number(hesap?.hesapTarihindenSonrakiTahsilat ?? 0))} kadarı hesap tarihinden
                      ({formatDate(displayHesap.hesapTarihi)}) sonra tarihli tahsilattır.
                    </>}
              </div>
            )}
            
            {/* TBK m.100 Mahsup Detayları */}
            {displayHesap.mahsupDetaylari && displayHesap.mahsupDetaylari.length > 0 && (
              <MahsupDetayPanel 
                mahsupDetaylari={displayHesap.mahsupDetaylari}
                asilAlacak={displayHesap.asilAlacak}
                kalanAnapara={displayHesap.kalanAnapara}
              />
            )}
            
            <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1 border-t border-orange-300 bg-orange-50 rounded">
              <span className="font-bold text-orange-900">
                KALAN BORÇ
                {guardedPrimaryPartial && (
                  <span data-testid="guarded-primary-partial-label-kalan-borc" className="ml-1 font-normal text-[9px] text-orange-700">
                    (mevcut hesaplama)
                  </span>
                )}
              </span>
              <span data-testid="hesap-deger-kalanBorc" className={toplamSinifi('kalanBorc', 'font-bold text-orange-700')}>{tutar('kalanBorc', displayHesap.kalanBorc)}</span>
            </div>
          </div>
        )}
        
        {/* K3-L: mahsubu bekleyen tahsilat — borçtan düşülmedi; sunucu değeri, istemci hesabı YOK.
            K3-L KP-7: kanonik tahsilat gösterimi varken bekletme orada (hesap tarihi kapsamlı) gösterilir; iki kapsam yan yana konmaz. */}
        {!displayHesap.tahsilatGosterimi && Number(hesap?.mahsubuBekleyenTahsilat ?? 0) > 0 && (
          <div
            data-testid="hesap-mahsubu-bekleyen-tahsilat"
            className="mt-2 flex justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900"
          >
            <span>
              Mahsubu bekleyen tahsilat
              <span className="ml-1 text-[10px] font-normal text-amber-700">(kalan borçtan düşülmedi)</span>
            </span>
            <span className="font-medium">{tutar('mahsubuBekleyenTahsilat', Number(hesap?.mahsubuBekleyenTahsilat ?? 0))}</span>
          </div>
        )}

        {/* Tahsil Harcı Oranlarına Göre Son Borç */}
        <div className="pt-2 mt-2 border-t-2 border-gray-300">
          <p className="text-[10px] font-medium text-gray-500 mb-1">Tahsil Harcı Oranlarına Göre Son Borç</p>
          {tahsilOranlariGecerli
            ? displayHesap.tahsilOranlari.map((t, i) => (
                <div key={i} className="flex justify-between py-0.5 text-gray-500">
                  <span>%{t.label}</span>
                  <span>{formatTL(t.tutar)}</span>
                </div>
              ))
            : (
              <div data-testid="hesap-tahsil-oranlari-durum" className="py-0.5 text-gray-500">
                {alan('tahsilOranlari')?.durum === 'HESAPLANAMADI' ? 'hesaplanamadı' : 'gösterilemez'}
              </div>
            )}
        </div>
        
        {/* Faiz Dökümü */}
        {(displayHesap.faizSegmentleri.takipOncesi.length > 0 || displayHesap.faizSegmentleri.takipSonrasi.length > 0) && (
          <div className="pt-2 mt-2 border-t">
            <button
              onClick={() => setFaizDokumuVisible(!faizDokumuVisible)}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-blue-50 hover:bg-blue-100 rounded text-xs text-blue-700"
            >
              <span className="flex items-center gap-1">
                <Calculator className="h-3.5 w-3.5" />
                Faiz Dökümü (Segment Detayı)
              </span>
              {faizDokumuVisible ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            
            {faizDokumuVisible && (
              <div className="mt-2 space-y-2">
                {displayHesap.faizSegmentleri.takipOncesi.length > 0 && (
                  <SegmentTable title="Takip Öncesi Faiz" segments={displayHesap.faizSegmentleri.takipOncesi} />
                )}
                {displayHesap.faizSegmentleri.takipSonrasi.length > 0 && (
                  <SegmentTable title="Takip Sonrası Faiz" segments={displayHesap.faizSegmentleri.takipSonrasi} color="orange" />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PARA BİRİMİ GÖSTERİMİ (sunucu kararına göre; hesap ve çevirme YOK)
// ============================================================================

/** Kısıtlı durumda sunucunun karar vermediği alan: tutar güvenle etiketlenemez → gösterilmez (fail-closed). */
const GOSTERILEMEZ_ALAN: ParaBirimiAlani = { paraBirimi: null, durum: 'GOSTERILEMEZ' };

/** Tutarı bildirilen para birimiyle yazar; TL'de (ya da para birimi bildirilmemişse) formatTL ile birebir aynıdır. */
function formatParaBirimli(deger: number, paraBirimi?: string | null): string {
  if (!paraBirimi || paraBirimi === 'TRY') return formatTL(deger);
  return `${deger.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${paraBirimi}`;
}

/** Alanın gösterim metni: karar yoksa bugünkü gösterim; geçerliyse kendi para birimiyle tutar; değilse nedeni. */
function formatAlanTutari(deger: number, alan?: ParaBirimiAlani): string {
  if (!alan) return formatTL(deger);
  if (alan.durum === 'HESAPLANAMADI') return 'hesaplanamadı';
  if (alan.durum !== 'GECERLI' || !alan.paraBirimi) return 'gösterilemez';
  return formatParaBirimli(deger, alan.paraBirimi);
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

/**
 * K3-L (owner kararı 2026-09-28) — çek tazminatı bilgi kutusu. Kalem varsa kalem bazlı sorumlu borçlular; kalem
 * yoksa durum mesajı ve AYRI bilgi tahmini (hiçbir toplama/bakiyeye girmez).
 */
export function CheckPenaltyInfo({ summary }: { summary?: CheckPenaltySummary }) {
  if (!summary || summary.durum === "UYGULANMAZ") return null;
  return (
    <div data-testid="check-penalty-info" className="my-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900 space-y-0.5">
      {summary.kalemler.map((kalem) => (
        <div key={kalem.claimItemId} data-testid="check-penalty-item">
          Tazminat {formatParaBirimli(kalem.tutar, kalem.paraBirimi)} · kalan {formatParaBirimli(kalem.kalan, kalem.paraBirimi)} ·{" "}
          {kalem.sorumlulukBelirsiz
            ? "sorumlu borçlular belirlenmemiş"
            : `sorumlu: ${kalem.sorumluBorclular.map((b) => b.ad).join(", ")}`}
        </div>
      ))}
      {summary.mesaj && <div data-testid="check-penalty-status">{summary.mesaj}</div>}
      {summary.tahmin && (
        <div data-testid="check-penalty-estimate" className="italic text-amber-800">
          {summary.tahmin.durum === "HESAPLANDI" && summary.tahmin.tutar !== null
            ? `Bilgi (borca dahil değil): tahmini tazminat ${formatTL(summary.tahmin.tutar)}. ${summary.tahmin.aciklama}`
            : summary.tahmin.aciklama}
        </div>
      )}
    </div>
  );
}

/**
 * K3-L KP-3 / TK-7 (owner kararı 2026-10-01) — talep edilmiş işlemiş faiz: kaydın varlığı, tutarı ve mevcut hesaba DAHİL
 * EDİLMEDİĞİ açıkça yazılır (genel uyarı içinde kaybolmaz). Hiçbir toplama eklenmez; tutarlar sunucudan.
 */
export function ClaimedInterestInfo({ info }: { info?: TalepEdilenIslemisFaiz | null }) {
  if (!info || info.kalemler.length === 0) return null;
  const toplamlar = Object.entries(info.toplamParaBirimiBazinda).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div data-testid="claimed-interest-info" className="my-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
      <div className="flex justify-between">
        <span>Talep edilmiş işlemiş faiz ({info.kalemler.length} kayıt)</span>
        <span data-testid="claimed-interest-amount">
          {toplamlar.map(([paraBirimi, tutar]) => (paraBirimi === "TRY" ? formatTL(tutar) : `${tutar.toFixed(2)} ${paraBirimi}`)).join(" + ")}
        </span>
      </div>
      <div data-testid="claimed-interest-status" className="italic text-amber-800">
        Bu tutar mevcut hesaba dahil edilmedi; toplam borca eklenmedi.
      </div>
    </div>
  );
}

/**
 * K3-L KP-7 (owner kararı 2026-10-01) — kanonik pilotta tahsilat gösterimi: Toplam tahsilat = dosyaya fiilen giren netleşmiş
 * para; Borca uygulanan ve Dağıtım bekleyen ayrı satır; aynı para iki kez sayılmaz (Toplam = Uygulanan + Bekleyen, sunucu
 * doğrular). Kullanılan hesap tarihi açıkça yazılır. Tüm değerler sunucudan; istemci hesabı YOK.
 */
export function TahsilatGosterimiPanel({
  gosterim,
  kalanBorc,
  kalanBorcMetni,
  partial,
  children,
}: {
  gosterim: TahsilatGosterimi;
  kalanBorc: number;
  /** Kalan borcun gösterim metni (dövizli / karma dosyada "gösterilemez"); verilmezse TL biçimi. */
  kalanBorcMetni?: string;
  partial?: boolean;
  children?: React.ReactNode;
}) {
  // Tahsilat tutarları kanonik tahsilat bloğunun kendi para birimiyle yazılır (TL'de gösterim aynen)
  const tahsilatTutari = (deger: number) => formatParaBirimli(deger, gosterim.paraBirimi);
  return (
    <div data-testid="tahsilat-gosterimi" className="pt-2 mt-2 border-t border-gray-200">
      <p data-testid="tahsilat-gosterimi-kapsam" className="text-[10px] text-gray-500 mb-0.5">
        Tahsilat — hesap tarihine ({formatDate(gosterim.hesapTarihi)}) kadar
      </p>
      <div className="flex justify-between py-0.5">
        <span className="text-gray-600">Toplam tahsilat</span>
        <span data-testid="tahsilat-toplam" className="font-medium">{tahsilatTutari(gosterim.toplamTahsilat)}</span>
      </div>
      <div className="flex justify-between py-0.5">
        <span className="text-gray-600">Borca uygulanan</span>
        <span data-testid="tahsilat-borca-uygulanan" className="text-red-600 font-medium">- {tahsilatTutari(gosterim.borcaUygulanan)}</span>
      </div>
      <div className="flex justify-between py-0.5">
        <span className="text-gray-600">
          Dağıtım bekleyen
          <span className="ml-1 text-[10px] font-normal text-gray-400">(borca uygulanmadı)</span>
        </span>
        <span data-testid="tahsilat-dagitim-bekleyen" className="font-medium">{tahsilatTutari(gosterim.dagitimBekleyen)}</span>
      </div>
      {gosterim.mahsubuBekleyen > 0 && (
        <div data-testid="tahsilat-mahsubu-bekleyen" className="flex justify-between pl-2 py-0.5 text-amber-800">
          <span>
            Mahsubu bekleyen tahsilat
            <span className="ml-1 text-[10px] font-normal text-amber-700">(borçtan düşülmedi, dağıtıma kapalı)</span>
          </span>
          <span>{tahsilatTutari(gosterim.mahsubuBekleyen)}</span>
        </div>
      )}
      {children}
      {gosterim.masrafFeriUyarisi && (
        <div data-testid="tahsilat-masraf-feri-uyarisi" className="py-0.5 text-[10px] text-amber-700">
          Dosyada masraf/fer&apos;i var; bu hesap henüz masraf ve fer&apos;iyi mahsuba almadığı için borca uygulanmayan tutarın bir kısmı masraf/fer&apos;iye ait olabilir.
        </div>
      )}
      {gosterim.hesapTarihindenSonra > 0 && (
        <div data-testid="tahsilat-tarih-sonrasi" className="py-0.5 text-[10px] text-gray-500">
          Hesap tarihinden sonra tarihli {tahsilatTutari(gosterim.hesapTarihindenSonra)} bu toplamlara dahil edilmedi.
        </div>
      )}
      <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1 border-t border-orange-300 bg-orange-50 rounded">
        <span className="font-bold text-orange-900">
          KALAN BORÇ
          {partial && (
            <span data-testid="guarded-primary-partial-label-kalan-borc" className="ml-1 font-normal text-[9px] text-orange-700">
              (mevcut hesaplama)
            </span>
          )}
        </span>
        <span className="font-bold text-orange-700">{kalanBorcMetni ?? formatTL(kalanBorc)}</span>
      </div>
    </div>
  );
}

/** `text` verilirse (para birimi kararına göre hazırlanmış metin) o yazılır; verilmezse tutar TL biçimiyle. */
function Row({ label, value, text, light, muted }: { label: string; value: number; text?: string; light?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${light ? 'pl-2' : ''}`}>
      <span className={muted ? 'text-gray-400' : light ? 'text-gray-500' : 'text-gray-600'}>{label}</span>
      <span className={muted ? 'text-gray-400' : ''}>{text ?? formatTL(value)}</span>
    </div>
  );
}

function MahsupDetayPanel({ 
  mahsupDetaylari, 
  asilAlacak, 
  kalanAnapara 
}: { 
  mahsupDetaylari: MahsupDetay[]; 
  asilAlacak: number; 
  kalanAnapara: number;
}) {
  return (
    <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded">
      <p className="text-[10px] font-medium text-purple-700 mb-1">TBK m.100 Mahsup Dağılımı</p>
      {mahsupDetaylari.map((m, i) => (
        <div key={i} className="text-[9px] text-purple-600 border-b border-purple-100 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0">
          <div className="font-medium">{formatDate(m.tarih)} - {formatTL(m.tahsilatTutar)}</div>
          <div className="grid grid-cols-2 gap-x-2 mt-0.5 text-purple-500">
            {m.mahsupMasraf > 0 && <span>Masraf: {formatTL(m.mahsupMasraf)}</span>}
            {m.mahsupVekalet > 0 && <span>Vekalet: {formatTL(m.mahsupVekalet)}</span>}
            {m.mahsupTakipOncesiFaiz > 0 && <span>T.Ö.Faiz: {formatTL(m.mahsupTakipOncesiFaiz)}</span>}
            {m.mahsupFaiz > 0 && <span>T.S.Faiz: {formatTL(m.mahsupFaiz)}</span>}
            {m.mahsupAnapara > 0 && <span className="font-medium text-purple-700">Anapara: {formatTL(m.mahsupAnapara)}</span>}
          </div>
          <div className="text-[8px] text-purple-400 mt-0.5">Kalan Anapara: {formatTL(m.kalanAnapara)}</div>
        </div>
      ))}
      {kalanAnapara < asilAlacak && (
        <div className="mt-1 pt-1 border-t border-purple-200 text-[9px] font-medium text-purple-700">
          Faiz Matrahı: {formatTL(asilAlacak)} → {formatTL(kalanAnapara)}
        </div>
      )}
    </div>
  );
}

function SegmentTable({ title, segments, color = 'blue' }: { title: string; segments: FaizSegment[]; color?: string }) {
  const bgColor = color === 'orange' ? 'bg-orange-50' : 'bg-gray-50';
  const textColor = color === 'orange' ? 'text-orange-700' : 'text-gray-600';
  const rateColor = color === 'orange' ? 'text-orange-600' : 'text-blue-600';
  
  return (
    <div className={`${bgColor} rounded p-2`}>
      <h5 className={`text-[10px] font-medium ${textColor} mb-1`}>{title} ({segments.length} dönem)</h5>
      <div className="space-y-0.5">
        {segments.map((seg, idx) => (
          <div key={idx} className="grid grid-cols-4 gap-1 text-[9px] text-gray-600 bg-white px-2 py-1 rounded">
            <span>{formatDate(seg.baslangic)} - {formatDate(seg.bitis)}</span>
            <span className="text-center">{seg.gun} gün</span>
            <span className={`text-center ${rateColor}`}>%{seg.oran.toFixed(2)}</span>
            <span className="text-right font-medium">{formatTL(seg.faiz)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HesapOzetiPanel;
