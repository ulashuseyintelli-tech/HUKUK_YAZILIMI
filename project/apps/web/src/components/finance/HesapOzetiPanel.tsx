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
import { useCaseCalculation, formatTL, formatDate, CaseCalculationResult, FaizSegment, MahsupDetay } from "@/hooks/useCaseCalculation";
import { useBalanceShadowDiff } from "@/hooks/useBalanceShadowDiff";
import {
  buildGuardedPrimaryCalculationResult,
  evaluateGuardedPrimaryDisplayPilot,
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
  guardedPrimaryPilotEnabled = false,
  guardedPrimaryPilotAsOfDate,
}: Props) {
  const [hesapTarihi, setHesapTarihi] = useState(() => calculationDate || new Date().toISOString().split("T")[0]);
  const [faizDokumuVisible, setFaizDokumuVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Backend'den hesap özeti al
  const { data: hesap, loading, error, refetch } = useCaseCalculation({
    caseId,
    calculationDate: hesapTarihi,
    autoFetch: true,
  });
  const {
    data: guardedPrimaryReport,
    loading: guardedPrimaryLoading,
    error: guardedPrimaryError,
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
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate) {
      setHesapTarihi(newDate);
      refetch(newDate);
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
          onClick={() => refetch(hesapTarihi)}
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

  const guardedPrimaryDecision = guardedPrimaryPilotEnabled
    ? evaluateGuardedPrimaryDisplayPilot(guardedPrimaryReport, { featureFlagEnabled: true })
    : null;
  const guardedPrimaryHesap = guardedPrimaryDecision && guardedPrimaryReport
    ? buildGuardedPrimaryCalculationResult(hesap, guardedPrimaryReport, guardedPrimaryDecision)
    : null;
  const displayHesap = guardedPrimaryHesap ?? hesap;
  const guardedPrimarySelected = Boolean(guardedPrimaryHesap);
  
  const kalemLabel = displayHesap.kalemTuru === 'CEK' ? 'Çek' :
                     displayHesap.kalemTuru === 'SENET' ? 'Senet' :
                     displayHesap.kalemTuru === 'FATURA' ? 'Fatura' : 'Asıl Alacak';
  
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
          <button onClick={() => refetch(hesapTarihi)} className="p-1 hover:bg-gray-100 rounded">
            <RefreshCw className="h-3.5 w-3.5 text-gray-500" />
          </button>
        </div>
      </div>
      
      {/* Tarih bilgisi */}
      <div className="px-3 py-1 text-[10px] text-gray-400 border-b flex-shrink-0">
        Takip: {formatDate(displayHesap.takipTarihi)} → Hesap: {formatDate(displayHesap.hesapTarihi)}
      </div>

      {guardedPrimaryPilotEnabled && (
        <div
          data-testid="guarded-primary-display-pilot"
          className={`border-b px-3 py-1.5 text-[10px] ${
            guardedPrimarySelected
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          <div className="font-semibold">
            {guardedPrimarySelected
              ? "Guarded canonical primary candidate"
              : "Legacy calculation-summary fallback"}
          </div>
          <div data-testid="guarded-primary-display-reasons" className="mt-0.5">
            {guardedPrimaryLoading
              ? "SHADOW_OR_CANONICAL_SOURCE_PENDING"
              : guardedPrimaryError
                ? "SHADOW_OR_CANONICAL_SOURCE_FAILURE"
                : guardedPrimaryDecision?.reasonCodes.join(", ") || "ELIGIBLE"}
          </div>
        </div>
      )}
      
      {/* İçerik */}
      <div ref={scrollRef} className="px-3 py-2 space-y-0.5 text-xs">
        {/* Asıl Alacak */}
        <Row label={kalemLabel} value={displayHesap.asilAlacak} />
        
        {/* Tazminat ve Komisyon (Çek için) */}
        {displayHesap.tazminat > 0 && <Row label="Karşılıksız Çek Tazminatı (%10)" value={displayHesap.tazminat} />}
        {displayHesap.komisyon > 0 && <Row label="Komisyon" value={displayHesap.komisyon} />}
        
        {/* Takip Öncesi Faiz */}
        {displayHesap.takipOncesiFaiz > 0 && <Row label="Takip Öncesi Faiz" value={displayHesap.takipOncesiFaiz} />}
        
        {/* TAKİP TUTARI */}
        <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1.5 border-t-2 border-blue-300 bg-blue-50 rounded">
          <span className="font-semibold text-blue-800">TAKİP TUTARI</span>
          <span className="font-bold text-blue-700">{formatTL(displayHesap.takipTutari)}</span>
        </div>
        
        {/* İcra Masrafları Detay */}
        <Row label="Başvurma Harcı" value={displayHesap.basvurmaHarci} light />
        <Row label="Vekalet Harcı" value={displayHesap.vekaletHarci} light />
        <Row label="Peşin Harç" value={displayHesap.pesinHarc} light />
        <Row label="Dosya Gideri" value={displayHesap.dosyaGideri} light />
        <Row label={`Tebligat Gideri (${debtorCount} borçlu)`} value={displayHesap.tebligatGideri} light />
        <Row label="Vekalet Pulu" value={displayHesap.vekaletPulu} light />
        
        {/* İCRA MASRAFLARI */}
        <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1 border-t border-gray-300 bg-gray-100 rounded">
          <span className="font-semibold text-gray-700">İCRA MASRAFLARI</span>
          <span className="font-semibold text-gray-700">{formatTL(displayHesap.icraMasraflari)}</span>
        </div>
        
        {/* Tahsil Harçları */}
        <Row label="Peşin Harç Dahil Tahsil Harcı" value={displayHesap.pesinHarcDahilTahsilHarci} light muted />
        <Row label="Peşin Harç Hariç Tahsil Harcı" value={displayHesap.pesinHarcHaricTahsilHarci} light muted />
        
        {/* Vekalet Ücreti */}
        <div className="flex justify-between py-1 border-t border-gray-200 mt-1">
          <span className="font-medium text-gray-700">Vekalet Ücreti =</span>
          <span className="font-semibold">{formatTL(displayHesap.vekaletUcreti)}</span>
        </div>
        
        {/* Takip Sonrası Faiz */}
        <div className="flex justify-between py-1 border-t border-gray-200">
          <span className="font-medium text-gray-700">Takip Sonrası Faiz =</span>
          <span className="font-semibold">{formatTL(displayHesap.takipSonrasiFaiz)}</span>
        </div>
        
        {/* TOPLAM BORÇ */}
        <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1.5 border-t-2 border-blue-400 bg-blue-100 rounded">
          <span className="font-bold text-blue-900">TOPLAM BORÇ</span>
          <span className="font-bold text-blue-800">{formatTL(displayHesap.toplamBorc)}</span>
        </div>
        
        {/* SON BORÇ */}
        <div className="flex justify-between py-2.5 px-2 -mx-2 mt-1.5 border-t-2 border-green-400 bg-green-100 rounded">
          <span className="font-bold text-green-900">SON BORÇ</span>
          <span className="font-bold text-xl text-green-700">{formatTL(displayHesap.sonBorc)}</span>
        </div>
        
        {/* Tahsilat Düşümü ve Kalan Borç */}
        {displayHesap.toplamTahsilat > 0 && (
          <div className="pt-2 mt-2 border-t border-gray-200">
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Tahsilat Düşümü</span>
              <span className="text-red-600 font-medium">- {formatTL(displayHesap.toplamTahsilat)}</span>
            </div>
            
            {/* TBK m.100 Mahsup Detayları */}
            {displayHesap.mahsupDetaylari && displayHesap.mahsupDetaylari.length > 0 && (
              <MahsupDetayPanel 
                mahsupDetaylari={displayHesap.mahsupDetaylari}
                asilAlacak={displayHesap.asilAlacak}
                kalanAnapara={displayHesap.kalanAnapara}
              />
            )}
            
            <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1 border-t border-orange-300 bg-orange-50 rounded">
              <span className="font-bold text-orange-900">KALAN BORÇ</span>
              <span className="font-bold text-orange-700">{formatTL(displayHesap.kalanBorc)}</span>
            </div>
          </div>
        )}
        
        {/* Tahsil Harcı Oranlarına Göre Son Borç */}
        <div className="pt-2 mt-2 border-t-2 border-gray-300">
          <p className="text-[10px] font-medium text-gray-500 mb-1">Tahsil Harcı Oranlarına Göre Son Borç</p>
          {displayHesap.tahsilOranlari.map((t, i) => (
            <div key={i} className="flex justify-between py-0.5 text-gray-500">
              <span>%{t.label}</span>
              <span>{formatTL(t.tutar)}</span>
            </div>
          ))}
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
// HELPER COMPONENTS
// ============================================================================

function Row({ label, value, light, muted }: { label: string; value: number; light?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${light ? 'pl-2' : ''}`}>
      <span className={muted ? 'text-gray-400' : light ? 'text-gray-500' : 'text-gray-600'}>{label}</span>
      <span className={muted ? 'text-gray-400' : ''}>{formatTL(value)}</span>
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
