"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Calculator,
  Receipt,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface FaizSegment {
  baslangic: string;
  bitis: string;
  gun: number;
  oran: number;
  faiz: number;
}

interface ClaimItem {
  id?: string;
  type?: string;
  kalemTuru?: string;
  amount?: number;
  bakiyeTutar?: number;
  currency?: string;
  dueDate?: string;
  vadeTarihi?: string;
  interestType?: string;
  takipOncesiFaiz?: string;
  takipSonrasiFaiz?: string;
  ibrazTarihi?: string;
  cekBilgileri?: { ibrazTarihi?: string };
}

interface Instrument {
  id: string;
  instrumentType: 'CEK' | 'SENET' | 'BONO' | 'POLICE';
  serialNo?: string;
  amount?: number;
  issueDate?: string;
  maturityDate?: string; // Vade tarihi
  presentmentDate?: string; // İbraz tarihi
  isBounced?: boolean;
  bounceDate?: string;
  bankName?: string;
  bankBranch?: string;
}

interface Due {
  id: string;
  type: string;
  amount: number;
  description?: string;
}

interface Collection {
  id: string;
  amount: number;
  status?: string;
}

interface Props {
  caseId?: string;
  caseDate?: string;
  caseType?: string; // CHECK, BOND, GENERAL_EXECUTION, etc.
  principalAmount?: number;
  currency?: string;
  debtorCount?: number;
  instruments?: Instrument[];
  claimItems?: ClaimItem[];
  dues?: Due[];
  collections?: Collection[];
  calculationDate?: string;
  compact?: boolean;
  onRefresh?: () => void;
  loading?: boolean;
  error?: string;
  className?: string;
}

// ============================================================================
// TCMB AVANS FAİZ ORANLARI
// ============================================================================
const TCMB_AVANS_ORANLARI: Array<{ validFrom: string; rate: number }> = [
  { validFrom: '2020-01-01', rate: 11.75 },
  { validFrom: '2020-05-22', rate: 9.25 },
  { validFrom: '2020-06-13', rate: 8.25 },
  { validFrom: '2020-09-25', rate: 9.25 },
  { validFrom: '2020-11-20', rate: 14.25 },
  { validFrom: '2020-12-25', rate: 17.25 },
  { validFrom: '2021-03-19', rate: 19.25 },
  { validFrom: '2021-09-24', rate: 18.25 },
  { validFrom: '2021-10-22', rate: 16.25 },
  { validFrom: '2021-11-19', rate: 15.25 },
  { validFrom: '2021-12-17', rate: 14.25 },
  { validFrom: '2022-08-19', rate: 13.25 },
  { validFrom: '2022-09-23', rate: 12.25 },
  { validFrom: '2022-10-21', rate: 10.75 },
  { validFrom: '2022-11-25', rate: 9.50 },
  { validFrom: '2023-06-23', rate: 15.00 },
  { validFrom: '2023-07-21', rate: 17.50 },
  { validFrom: '2023-08-25', rate: 25.50 },
  { validFrom: '2023-09-22', rate: 30.50 },
  { validFrom: '2023-10-27', rate: 35.50 },
  { validFrom: '2023-11-24', rate: 40.50 },
  { validFrom: '2023-12-29', rate: 45.00 },
  { validFrom: '2024-01-26', rate: 46.00 },
  { validFrom: '2024-03-22', rate: 50.00 },
  { validFrom: '2024-12-28', rate: 49.25 },
  { validFrom: '2025-03-08', rate: 44.25 },
  { validFrom: '2025-09-17', rate: 42.25 },
  { validFrom: '2025-12-20', rate: 39.75 },
];

const YASAL_FAIZ_ORANLARI: Array<{ validFrom: string; rate: number }> = [
  { validFrom: '2006-01-01', rate: 9 },
  { validFrom: '2024-06-01', rate: 24 },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Decimal/string/number değerini güvenli şekilde number'a çevir
const toNumber = (value: any): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Prisma Decimal string formatı: "100000.00"
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object' && value.toNumber) {
    // Prisma Decimal object
    return value.toNumber();
  }
  return 0;
};

const formatTL = (amount: number) => {
  return amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('tr-TR');
};

const hesaplaSegmentliFaiz = (
  tutar: number, 
  baslangic: string, 
  bitis: string,
  oranlar: Array<{ validFrom: string; rate: number }>
): { toplam: number; segmentler: FaizSegment[] } => {
  const startDate = new Date(baslangic);
  const endDate = new Date(bitis);
  
  if (startDate >= endDate || tutar <= 0) return { toplam: 0, segmentler: [] };
  
  const sortedRates = [...oranlar].sort((a, b) => 
    new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime()
  );
  
  let totalInterest = 0;
  const segmentler: FaizSegment[] = [];
  
  for (let i = 0; i < sortedRates.length; i++) {
    const currentRate = sortedRates[i];
    const nextRate = sortedRates[i + 1];
    const rateStart = new Date(currentRate.validFrom);
    const rateEnd = nextRate ? new Date(nextRate.validFrom) : new Date('2099-12-31');
    
    if (endDate <= rateStart || startDate >= rateEnd) continue;
    
    const segmentStart = startDate > rateStart ? startDate : rateStart;
    const segmentEnd = endDate < rateEnd ? endDate : rateEnd;
    const days = Math.floor((segmentEnd.getTime() - segmentStart.getTime()) / (1000 * 60 * 60 * 24));
    
    if (days <= 0) continue;
    
    const segmentInterest = tutar * (currentRate.rate / 100) * days / 365;
    totalInterest += segmentInterest;
    
    const displayEnd = new Date(segmentEnd);
    displayEnd.setDate(displayEnd.getDate() - 1);
    
    segmentler.push({
      baslangic: segmentStart.toISOString().split('T')[0],
      bitis: displayEnd.toISOString().split('T')[0],
      gun: days,
      oran: currentRate.rate,
      faiz: Math.round(segmentInterest * 100) / 100,
    });
  }
  
  return { toplam: Math.round(totalInterest * 100) / 100, segmentler };
};

const hesaplaVekaletUcreti = (takipTutari: number): number => {
  const tarifeler = [
    { min: 0, max: 55000, fixed: 11000, rate: 0 },
    { min: 55000, max: 130000, fixed: 11000, rate: 0.14 },
    { min: 130000, max: 390000, fixed: 21500, rate: 0.12 },
    { min: 390000, max: 780000, fixed: 52700, rate: 0.08 },
    { min: 780000, max: 1950000, fixed: 83900, rate: 0.04 },
    { min: 1950000, max: Infinity, fixed: 130700, rate: 0.01 },
  ];
  for (const t of tarifeler) {
    if (takipTutari <= t.max) {
      return Math.max(t.fixed + ((takipTutari - t.min) * t.rate), 11000);
    }
  }
  return 130700 + ((takipTutari - 1950000) * 0.01);
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function HesapOzetiPanel({
  caseDate,
  caseType,
  principalAmount = 0,
  debtorCount = 1,
  instruments = [],
  claimItems = [],
  dues = [],
  collections = [],
  calculationDate,
  onRefresh,
  loading = false,
  error,
  className = "",
}: Props) {
  const [hesapTarihi, setHesapTarihi] = useState(calculationDate || new Date().toISOString().split("T")[0]);
  const [faizDokumuVisible, setFaizDokumuVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const takipTarihi = caseDate || new Date().toISOString().split("T")[0];
  
  // calculationDate prop değiştiğinde state'i güncelle
  useEffect(() => {
    if (calculationDate) {
      setHesapTarihi(calculationDate);
    }
  }, [calculationDate]);
  
  // Hesap değiştiğinde scroll'u en üste al
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [caseDate, principalAmount, instruments]);
  
  // Ana hesaplama
  const hesap = useMemo(() => {
    // 1. Asıl alacak ve kalem türü belirleme
    let asilAlacak = 0;
    let kalemTuru = 'ASIL_ALACAK';
    let vadeTarihi = takipTarihi;
    let ibrazTarihi = takipTarihi;
    let faizTuru = 'TICARI_DEGISEN';
    
    // Öncelik 1: Instruments (Çek/Senet) - en güvenilir kaynak
    if (instruments && instruments.length > 0) {
      const instrument = instruments[0];
      asilAlacak = toNumber(instrument.amount) || toNumber(principalAmount) || 0;
      kalemTuru = instrument.instrumentType === 'CEK' ? 'CEK' : 
                  instrument.instrumentType === 'SENET' ? 'SENET' : 
                  instrument.instrumentType === 'BONO' ? 'SENET' : 'ASIL_ALACAK';
      vadeTarihi = instrument.maturityDate?.split('T')[0] || takipTarihi;
      ibrazTarihi = instrument.presentmentDate?.split('T')[0] || vadeTarihi;
      faizTuru = 'TICARI_DEGISEN'; // Çek/Senet için TCMB Avans
    }
    // Öncelik 2: caseType'dan belirle
    else if (caseType === 'CHECK') {
      kalemTuru = 'CEK';
      asilAlacak = toNumber(principalAmount) || 0;
      faizTuru = 'TICARI_DEGISEN';
    }
    else if (caseType === 'BOND') {
      kalemTuru = 'SENET';
      asilAlacak = toNumber(principalAmount) || 0;
      faizTuru = 'TICARI_DEGISEN';
    }
    // Öncelik 3: Dues'dan al
    else if (dues.length > 0) {
      const principalDues = dues.filter(d => ['PRINCIPAL', 'ASIL_ALACAK', 'CEK', 'SENET'].includes(d.type));
      asilAlacak = principalDues.reduce((sum, d) => sum + toNumber(d.amount), 0);
      if (asilAlacak === 0) {
        asilAlacak = toNumber(principalAmount) || 0;
      }
    } 
    // Öncelik 4: ClaimItems'dan al (wizard'dan gelen veri)
    else if (claimItems.length > 0) {
      const item = claimItems[0];
      asilAlacak = toNumber(item.bakiyeTutar) || toNumber(item.amount) || 0;
      kalemTuru = item.kalemTuru || item.type || 'ASIL_ALACAK';
      vadeTarihi = item.vadeTarihi || item.dueDate || takipTarihi;
      ibrazTarihi = item.cekBilgileri?.ibrazTarihi || item.ibrazTarihi || vadeTarihi;
      faizTuru = item.takipOncesiFaiz || item.interestType || 'TICARI_DEGISEN';
    }
    // Fallback
    else if (principalAmount) {
      asilAlacak = toNumber(principalAmount);
    }
    
    if (asilAlacak <= 0) return null;
    
    // 2. Çek tazminatı ve komisyon
    const isCek = kalemTuru === 'CEK';
    const tazminat = isCek ? asilAlacak * 0.10 : 0;
    const komisyon = isCek ? asilAlacak * 0.003 : 0;
    
    // 3. Takip öncesi faiz
    const oranTablosu = faizTuru === 'YASAL' ? YASAL_FAIZ_ORANLARI : TCMB_AVANS_ORANLARI;
    const faizBaslangic = isCek ? ibrazTarihi : vadeTarihi;
    const oncesiFaizSonuc = hesaplaSegmentliFaiz(asilAlacak, faizBaslangic, takipTarihi, oranTablosu);
    const takipOncesiFaiz = oncesiFaizSonuc.toplam;
    
    // 4. Takip tutarı
    const takipTutari = asilAlacak + tazminat + komisyon + takipOncesiFaiz;
    
    // 5. İcra masrafları
    const basvurmaHarci = 615.40;
    const vekaletHarci = 87.50;
    const pesinHarc = Math.round(takipTutari * 0.005 * 100) / 100;
    const dosyaGideri = 2.00;
    const tebligatGideri = 15.00 * debtorCount;
    const vekaletPulu = 138.00;
    const icraMasraflari = basvurmaHarci + vekaletHarci + pesinHarc + dosyaGideri + tebligatGideri + vekaletPulu;
    
    // 6. Tahsil harçları
    const pesinHarcDahilTahsilHarci = Math.round((takipTutari + icraMasraflari) * 0.0455 * 100) / 100;
    const pesinHarcHaricTahsilHarci = Math.round((takipTutari + icraMasraflari - pesinHarc) * 0.0455 * 100) / 100;
    
    // 7. Vekalet ücreti
    const vekaletUcreti = Math.round(hesaplaVekaletUcreti(takipTutari) * 100) / 100;
    
    // 8. Takip sonrası faiz
    const sonrasiFaizSonuc = hesaplaSegmentliFaiz(asilAlacak, takipTarihi, hesapTarihi, oranTablosu);
    const takipSonrasiFaiz = sonrasiFaizSonuc.toplam;
    
    // 9. Toplam borç
    const toplamBorc = takipTutari + icraMasraflari + vekaletUcreti + takipSonrasiFaiz;
    
    // 10. Son borç (tahsil harcı dahil)
    const sonBorc = toplamBorc + pesinHarcHaricTahsilHarci;
    
    // 11. Tahsilat düşümü
    const toplamTahsilat = collections
      .filter(c => c.status !== 'CANCELLED')
      .reduce((sum, c) => sum + toNumber(c.amount), 0);
    
    // 12. Tahsil oranlarına göre son borç
    const tahsilOranlari = [
      { oran: 0, label: "0" },
      { oran: 0.0227, label: "2,27" },
      { oran: 0.0455, label: "4,55" },
      { oran: 0.0910, label: "9,10" },
      { oran: 0.1138, label: "11,38" },
    ].map(t => ({
      ...t,
      tutar: Math.round(toplamBorc * (1 + t.oran) * 100) / 100
    }));
    
    return {
      kalemTuru,
      asilAlacak,
      tazminat,
      komisyon,
      takipOncesiFaiz,
      takipTutari,
      basvurmaHarci,
      vekaletHarci,
      pesinHarc,
      dosyaGideri,
      tebligatGideri,
      vekaletPulu,
      icraMasraflari,
      pesinHarcDahilTahsilHarci,
      pesinHarcHaricTahsilHarci,
      vekaletUcreti,
      takipSonrasiFaiz,
      toplamBorc,
      sonBorc,
      toplamTahsilat,
      kalanBorc: sonBorc - toplamTahsilat,
      tahsilOranlari,
      faizSegmentleri: {
        takipOncesi: oncesiFaizSonuc.segmentler,
        takipSonrasi: sonrasiFaizSonuc.segmentler,
      },
    };
  }, [instruments, caseType, dues, claimItems, principalAmount, takipTarihi, hesapTarihi, debtorCount, collections]);

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
  
  const kalemLabel = hesap.kalemTuru === 'CEK' ? 'Çek' : 
                     hesap.kalemTuru === 'SENET' ? 'Senet' : 
                     hesap.kalemTuru === 'FATURA' ? 'Fatura' : 'Asıl Alacak';
  
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
            onChange={(e) => {
              const newDate = e.target.value;
              if (newDate) {
                setHesapTarihi(newDate);
              }
            }}
            className="border rounded px-2 py-1 text-xs w-32 cursor-pointer"
            style={{ colorScheme: 'light' }}
          />
          {onRefresh && (
            <button onClick={onRefresh} className="p-1 hover:bg-gray-100 rounded">
              <RefreshCw className="h-3.5 w-3.5 text-gray-500" />
            </button>
          )}
        </div>
      </div>
      
      {/* Tarih bilgisi */}
      <div className="px-3 py-1 text-[10px] text-gray-400 border-b flex-shrink-0">
        Takip: {formatDate(takipTarihi)} → Hesap: {formatDate(hesapTarihi)}
      </div>
      
      {/* İçerik - scroll kaldırıldı, tam uzunluk */}
      <div ref={scrollRef} className="px-3 py-2 space-y-0.5 text-xs">
        {/* Asıl Alacak */}
        <Row label={kalemLabel} value={hesap.asilAlacak} />
        
        {/* Tazminat ve Komisyon (Çek için) */}
        {hesap.tazminat > 0 && <Row label="Karşılıksız Çek Tazminatı (%10)" value={hesap.tazminat} />}
        {hesap.komisyon > 0 && <Row label="Komisyon" value={hesap.komisyon} />}
        
        {/* Takip Öncesi Faiz */}
        {hesap.takipOncesiFaiz > 0 && <Row label="Takip Öncesi Faiz" value={hesap.takipOncesiFaiz} />}
        
        {/* TAKİP TUTARI */}
        <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1.5 border-t-2 border-blue-300 bg-blue-50 rounded">
          <span className="font-semibold text-blue-800">TAKİP TUTARI</span>
          <span className="font-bold text-blue-700">{formatTL(hesap.takipTutari)}</span>
        </div>
        
        {/* İcra Masrafları Detay */}
        <Row label="Başvurma Harcı" value={hesap.basvurmaHarci} light />
        <Row label="Vekalet Harcı" value={hesap.vekaletHarci} light />
        <Row label="Peşin Harç" value={hesap.pesinHarc} light />
        <Row label="Dosya Gideri" value={hesap.dosyaGideri} light />
        <Row label={`Tebligat Gideri (${debtorCount} borçlu)`} value={hesap.tebligatGideri} light />
        <Row label="Vekalet Pulu" value={hesap.vekaletPulu} light />
        
        {/* İCRA MASRAFLARI */}
        <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1 border-t border-gray-300 bg-gray-100 rounded">
          <span className="font-semibold text-gray-700">İCRA MASRAFLARI</span>
          <span className="font-semibold text-gray-700">{formatTL(hesap.icraMasraflari)}</span>
        </div>
        
        {/* Tahsil Harçları */}
        <Row label="Peşin Harç Dahil Tahsil Harcı" value={hesap.pesinHarcDahilTahsilHarci} light muted />
        <Row label="Peşin Harç Hariç Tahsil Harcı" value={hesap.pesinHarcHaricTahsilHarci} light muted />
        
        {/* Vekalet Ücreti */}
        <div className="flex justify-between py-1 border-t border-gray-200 mt-1">
          <span className="font-medium text-gray-700">Vekalet Ücreti =</span>
          <span className="font-semibold">{formatTL(hesap.vekaletUcreti)}</span>
        </div>
        
        {/* Takip Sonrası Faiz */}
        <div className="flex justify-between py-1 border-t border-gray-200">
          <span className="font-medium text-gray-700">Takip Sonrası Faiz =</span>
          <span className="font-semibold">{formatTL(hesap.takipSonrasiFaiz)}</span>
        </div>
        
        {/* TOPLAM BORÇ */}
        <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1.5 border-t-2 border-blue-400 bg-blue-100 rounded">
          <span className="font-bold text-blue-900">TOPLAM BORÇ</span>
          <span className="font-bold text-blue-800">{formatTL(hesap.toplamBorc)}</span>
        </div>
        
        {/* SON BORÇ */}
        <div className="flex justify-between py-2.5 px-2 -mx-2 mt-1.5 border-t-2 border-green-400 bg-green-100 rounded">
          <span className="font-bold text-green-900">SON BORÇ</span>
          <span className="font-bold text-xl text-green-700">{formatTL(hesap.sonBorc)}</span>
        </div>
        
        {/* Tahsilat Düşümü ve Kalan Borç */}
        {hesap.toplamTahsilat > 0 && (
          <div className="pt-2 mt-2 border-t border-gray-200">
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Tahsilat Düşümü</span>
              <span className="text-red-600 font-medium">- {formatTL(hesap.toplamTahsilat)}</span>
            </div>
            <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1 border-t border-orange-300 bg-orange-50 rounded">
              <span className="font-bold text-orange-900">KALAN BORÇ</span>
              <span className="font-bold text-orange-700">{formatTL(hesap.kalanBorc)}</span>
            </div>
          </div>
        )}
        
        {/* Tahsil Harcı Oranlarına Göre Son Borç */}
        <div className="pt-2 mt-2 border-t-2 border-gray-300">
          <p className="text-[10px] font-medium text-gray-500 mb-1">Tahsil Harcı Oranlarına Göre Son Borç</p>
          {hesap.tahsilOranlari.map((t, i) => (
            <div key={i} className="flex justify-between py-0.5 text-gray-500">
              <span>%{t.label}</span>
              <span>{formatTL(t.tutar)}</span>
            </div>
          ))}
        </div>
        
        {/* Faiz Dökümü */}
        {(hesap.faizSegmentleri.takipOncesi.length > 0 || hesap.faizSegmentleri.takipSonrasi.length > 0) && (
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
                {hesap.faizSegmentleri.takipOncesi.length > 0 && (
                  <SegmentTable title="Takip Öncesi Faiz" segments={hesap.faizSegmentleri.takipOncesi} />
                )}
                {hesap.faizSegmentleri.takipSonrasi.length > 0 && (
                  <SegmentTable title="Takip Sonrası Faiz" segments={hesap.faizSegmentleri.takipSonrasi} color="orange" />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Components
function Row({ label, value, light, muted }: { label: string; value: number; light?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${light ? 'pl-2' : ''}`}>
      <span className={muted ? 'text-gray-400' : light ? 'text-gray-500' : 'text-gray-600'}>{label}</span>
      <span className={muted ? 'text-gray-400' : ''}>{formatTL(value)}</span>
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
