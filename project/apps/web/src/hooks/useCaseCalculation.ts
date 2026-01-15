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

import { useState, useEffect, useCallback } from 'react';
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

export interface CaseCalculationResult {
  // Temel bilgiler
  caseId: string;
  hesapTarihi: string;
  takipTarihi: string;
  kalemTuru: string;
  
  // Tutarlar
  asilAlacak: number;
  tazminat: number;
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

  const fetchCalculation = useCallback(async (date?: string) => {
    if (!caseId) {
      setError('Case ID gerekli');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const targetDate = date || calculationDate || new Date().toISOString().split('T')[0];
      
      // Backend'den hesap özeti al
      const response = await apiClient.get<CaseCalculationResult>(
        `/cases/${caseId}/calculation-summary?date=${targetDate}`
      );
      
      setData(response.data);
    } catch (err: any) {
      console.error('[useCaseCalculation] Error:', err);
      setError(err.message || 'Hesap özeti alınamadı');
      setData(null);
    } finally {
      setLoading(false);
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
