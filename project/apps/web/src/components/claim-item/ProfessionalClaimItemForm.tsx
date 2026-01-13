"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Calculator,
  Receipt,
  FileText,
  CreditCard,
  Shield,
  ChevronDown,
  ChevronRight,
  Check,
  AlertCircle,
  RefreshCw,
  Clock,
  Info,
} from "lucide-react";
import { api, TemplateData } from "@/lib/api";
import { LimitationBanner, LimitationStatus } from "@/components/limitation/LimitationWarningModal";
import { 
  resolveInterestType, 
  getDefaultCommercialStatus,
  InterestTypeCode,
  InterestTypeResult,
  INTEREST_TYPE_LABELS 
} from "@/lib/interest-type-resolver";

// ============================================================================
// TAKİP TİPİ KONFİGÜRASYONU
// ============================================================================
interface TakipTipiConfig {
  label: string;
  /** Varsayılan faiz türü - resolveInterestType ile override edilebilir */
  faizTuru: string;
  tazminatOrani: number;
  komisyonOrani: number;
  zorunluAlanlar: string[];
  ekBilgiler: string | null;
  donemsel?: boolean;
  /** Varsayılan olarak ticari iş mi? */
  defaultCommercial?: boolean;
  /** Faiz türü değiştirilebilir mi? (kambiyo için false) */
  canOverrideInterest?: boolean;
}

const TAKIP_TIPI_CONFIG: Record<string, TakipTipiConfig> = {
  CEK: {
    label: "Çek",
    faizTuru: "TICARI_DEGISEN", // TTK gereği zorunlu
    tazminatOrani: 0.10,
    komisyonOrani: 0.003,
    zorunluAlanlar: ["tutar", "vadeTarihi", "cekSeriNo", "bankaVeSube"],
    ekBilgiler: "cekBilgileri",
    defaultCommercial: true,
    canOverrideInterest: false, // Kambiyo için değiştirilemez
  },
  SENET: {
    label: "Senet/Bono",
    faizTuru: "TICARI_DEGISEN", // TTK gereği zorunlu
    tazminatOrani: 0,
    komisyonOrani: 0.003,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: "senetBilgileri",
    defaultCommercial: true,
    canOverrideInterest: false, // Kambiyo için değiştirilemez
  },
  KIRA: {
    label: "Kira Alacağı",
    faizTuru: "YASAL", // Varsayılan yasal, tacir kira ilişkisinde avans faizi seçilebilir
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null,
    donemsel: true,
    defaultCommercial: false, // Kullanıcı belirler - tacir kira ilişkisinde ticari seçilebilir
    canOverrideInterest: true, // Tacir kira ilişkisinde avans faizi seçilebilir
  },
  ILAM: {
    label: "İlam Asıl Alacağı",
    faizTuru: "YASAL", // Varsayılan yasal, ticari iş ise kullanıcı değiştirebilir
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: "ilamBilgileri",
    defaultCommercial: false, // Kullanıcı belirler - ticari iş ise ticari faiz seçilebilir
    canOverrideInterest: true, // İlamlı takipte faiz türü değiştirilebilir
  },
  // İLAM YAN ALACAK KALEMLERİ
  ILAM_ISLEMIS_FAIZ: {
    label: "İşlemiş Faiz (Dava-İlam Arası)",
    faizTuru: "YOK", // Kendi içinde faiz işlemez
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar"],
    ekBilgiler: null,
    canOverrideInterest: false,
  },
  ILAM_YARGILAMA_GIDERI: {
    label: "Yargılama Giderleri",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar"],
    ekBilgiler: null,
    canOverrideInterest: true,
  },
  ILAM_VEKALET_UCRETI: {
    label: "Karşı Taraf Vekalet Ücreti",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar"],
    ekBilgiler: null,
    canOverrideInterest: true,
  },
  // NAFAKA ÖZEL KALEMLERİ
  NAFAKA_BIRIKIMIS: {
    label: "Birikmiş Nafaka",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null,
    donemsel: true,
    defaultCommercial: false,
    canOverrideInterest: false, // Nafaka için yasal faiz zorunlu
  },
  NAFAKA_ISLEYECEK: {
    label: "İşleyecek Nafaka",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar"],
    ekBilgiler: null,
    donemsel: true,
    defaultCommercial: false,
    canOverrideInterest: false,
  },
  FATURA: {
    label: "Fatura Alacağı",
    faizTuru: "TICARI_DEGISEN", // Varsayılan ticari, akdi oran varsa değişir
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: "faturaBilgileri",
    defaultCommercial: true,
    canOverrideInterest: true,
  },
  ASIL_ALACAK: {
    label: "Genel Alacak",
    faizTuru: "YASAL", // Varsayılan yasal, ticari iş ise kullanıcı değiştirebilir
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null,
    defaultCommercial: false, // Kullanıcı belirler - İflas Adi dahil
    canOverrideInterest: true,
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // EK KALEM TÜRLERİ
  // ═══════════════════════════════════════════════════════════════════════════
  AIDAT: {
    label: "Aidat / Site Gideri",
    faizTuru: "AKDI", // Kat Mülkiyeti Kanunu gereği aylık %5 (yıllık %60) uygulanabilir
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null,
    donemsel: true,
    defaultCommercial: false,
    canOverrideInterest: true, // Yasal faiz de seçilebilir
  },
  KREDI: {
    label: "Kredi Alacağı",
    faizTuru: "AKDI", // Kredi sözleşmesindeki oran
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null,
    defaultCommercial: true,
    canOverrideInterest: true,
  },
  BANKA: {
    label: "Banka Alacağı (İİK 68)",
    faizTuru: "AKDI", // Genel kredi sözleşmesindeki oran
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null,
    defaultCommercial: true,
    canOverrideInterest: true,
  },
  IPOTEK: {
    label: "İpotek Alacağı",
    faizTuru: "AKDI", // İpotek akit tablosundaki oran
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null,
    defaultCommercial: true,
    canOverrideInterest: true,
  },
  REHIN: {
    label: "Rehin Alacağı",
    faizTuru: "AKDI", // Rehin sözleşmesindeki oran
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null,
    defaultCommercial: true,
    canOverrideInterest: true,
  },
};

// İlamlı takipte eklenebilecek yan alacak kalemleri
const ILAM_YAN_ALACAK_TURLERI = [
  { value: "ILAM_ISLEMIS_FAIZ", label: "İşlemiş Faiz (Dava-İlam Arası)", zorunlu: false },
  { value: "ILAM_YARGILAMA_GIDERI", label: "Yargılama Giderleri", zorunlu: false },
  { value: "ILAM_VEKALET_UCRETI", label: "Karşı Taraf Vekalet Ücreti", zorunlu: false },
];

// Nafaka ilamında eklenebilecek kalemler
const NAFAKA_YAN_ALACAK_TURLERI = [
  { value: "NAFAKA_BIRIKIMIS", label: "Birikmiş Nafaka (Ödenmeyen Aylar)", zorunlu: false },
  { value: "NAFAKA_ISLEYECEK", label: "İşleyecek Nafaka", zorunlu: false },
];

const CURRENCY_OPTIONS = [
  { value: "TRY", label: "TL", symbol: "₺" },
  { value: "USD", label: "USD", symbol: "$" },
  { value: "EUR", label: "EUR", symbol: "€" },
  { value: "GBP", label: "GBP", symbol: "£" },
  { value: "CHF", label: "CHF", symbol: "CHF" },
];

const FAIZ_TURU_OPTIONS = [
  { value: "YOK", label: "Faiz Yok", rate: 0, variable: false },
  // ═══════════════════════════════════════════════════════════════════════════
  // TİCARİ FAİZ SEÇENEKLERİ
  // ═══════════════════════════════════════════════════════════════════════════
  { 
    value: "TICARI_DEGISEN", 
    label: "Ticari - TCMB Avans (Değişen Oran)", 
    rate: null, // TCMB tablosundan
    variable: true,
    description: "TCMB avans faiz oranı tablosuna göre dönemsel hesaplama"
  },
  { 
    value: "TICARI_SABIT", 
    label: "Ticari - Sabit Oran", 
    rate: 48, // Varsayılan, kullanıcı değiştirebilir
    variable: false,
    description: "Kullanıcının belirlediği sabit oran"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // YASAL FAİZ (3095 m.1)
  // Not: Yasal faiz nadiren değişir (2006: %9, 2024: %24)
  // Ticari temerrüt faizinden farklıdır!
  // ═══════════════════════════════════════════════════════════════════════════
  { 
    value: "YASAL", 
    label: "Yasal Faiz (%9 / %24)", 
    rate: null, // Dönemsel: 2006-2024: %9, 2024+: %24
    variable: true, // Dönemsel değişim var ama TCMB avans gibi sık değil
    description: "3095 sayılı Kanun m.1 - Adi alacaklar için (2024 öncesi %9, sonrası %24)"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // MEVDUAT FAİZLERİ (Döviz alacakları için)
  // ═══════════════════════════════════════════════════════════════════════════
  { 
    value: "BANKA_TL", 
    label: "Mevduat Faizi TL (Bankalar)", 
    rate: null, 
    variable: true,
    description: "Bankalarca uygulanan en yüksek mevduat faizi"
  },
  { 
    value: "KAMU_BANKA_TL", 
    label: "Mevduat Faizi TL (Kamu Bankaları)", 
    rate: null, 
    variable: true,
    description: "Kamu bankalarınca uygulanan en yüksek mevduat faizi"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // AKDİ FAİZ
  // ═══════════════════════════════════════════════════════════════════════════
  { 
    value: "AKDI", 
    label: "Akdi Faiz (Sözleşme)", 
    rate: null, // Kullanıcı girer
    variable: false,
    description: "Sözleşmede belirtilen faiz oranı"
  },
];

// ============================================================================
// INTERFACES
// ============================================================================
interface AlacakKalemi {
  id: string;
  kalemTuru: string;
  toplamTutar: number;
  bakiyeTutar: number;
  currency: string;
  vadeTarihi: string;
  takipOncesiFaiz: string;
  takipSonrasiFaiz: string;
  hesaplanmisFaiz: boolean;
  aciklama: string;
  // Çek bilgileri
  cekBilgileri?: {
    ibrazTarihi: string;
    duzenlemeYeri: string;
    cekSeriNo: string;
    hesapNo: string;
    bankaVeSube: string;
    cekiImzalayanlar: string;
  };
  // Senet bilgileri
  senetBilgileri?: {
    duzenlemeYeri: string;
    duzenlemeTarihi: string;
  };
  // İlam bilgileri
  ilamBilgileri?: {
    mahkemeAdi: string;
    esasNo: string;
    kararNo: string;
    ilamTarihi: string;
    davaTarihi?: string; // İşlemiş faiz hesabı için
    faizTuruIlamda?: string; // İlamda belirtilen faiz türü
  };
  // Fatura bilgileri
  faturaBilgileri?: {
    faturaNo: string;
    faturaTarihi: string;
  };
  // Nafaka bilgileri
  nafakaBilgileri?: {
    aylikTutar: number;
    baslangicAyi: string; // YYYY-MM formatında
    bitisAyi?: string; // Birikmiş nafaka için
  };
}

// İlamlı takip için yan alacak kalemi
interface IlamYanAlacak {
  id: string;
  tur: string; // ILAM_ISLEMIS_FAIZ | ILAM_YARGILAMA_GIDERI | ILAM_VEKALET_UCRETI
  tutar: number;
  aciklama: string;
  faizBaslangic?: string; // Faiz işleyecekse
}

interface HesapOzetiSatir {
  key: string;
  label: string;
  tutar: number;
  bold?: boolean;
  color?: string;
}

interface IhtiyatiHacizKarari {
  mahkemeAdi: string;
  kararTarihi: string;
  esasNo: string;
  kararNo: string;
  kapsadigiTutar: number;
  teminatVar: boolean;
  teminatTuru: "NAKIT" | "TEMINAT_MEKTUBU" | "";
  teminatTutari: number;
  teminatOrani: number;
  seciliBorclular: number[];
  durum: "DRAFT" | "DECIDED" | "APPLIED" | "LIFTED";
}

interface IhtiyatiHacizMasrafi {
  id: string;
  tur: "HARC" | "POSTA" | "VEKALET" | "TEMINAT" | "YEDIEMIN" | "DIGER";
  aciklama: string;
  tutar: number;
}

interface Props {
  caseType?: string;
  formCode?: string;
  currency?: string;
  takipTuruCode?: string;
  mahiyetKodu?: string; // Wizard'dan gelen mahiyet kodu (FATURA, KIRA, CEK, SENET, vb.)
  documentSource?: "ILAM" | "KAMBIYO" | "SOZLESME" | "VEKALETNAME" | null;
  onItemsChange?: (items: any[]) => void;
  onPrecautionaryChange?: (data: { karar: IhtiyatiHacizKarari | null; masraflar: IhtiyatiHacizMasrafi[] }) => void;
  initialItems?: any[];
  takipTarihi?: string;
  borcluSayisi?: number;
  fileNumber?: string;
  executionOffice?: { name: string; city: string; uyapCode?: string };
  creditors?: Array<{ type: 'INDIVIDUAL' | 'COMPANY'; name: string; identityNo?: string; taxNo?: string; address?: string }>;
  lawyers?: Array<{ name: string; barNumber: string; barCity: string; address?: string }>;
  debtors?: Array<{ type: 'INDIVIDUAL' | 'COMPANY'; name: string; identityNo?: string; taxNo?: string; address?: string; role?: string }>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * TCMB AVANS FAİZ ORANLARI (3095 sayılı Kanun m.2/2 - Ticari Temerrüt)
 * Kaynak: TCMB Reeskont ve Avans Faiz Oranları (Resmi Gazete)
 * 
 * ÖNEMLİ: Sadece validFrom kullanılır. Bir sonraki satırın validFrom'u
 * bu satırın bitiş tarihidir (exclusive).
 * 
 * Aralık semantiği: [validFrom, nextValidFrom) - başlangıç dahil, bitiş hariç
 */
const TCMB_AVANS_ORANLARI: Array<{ validFrom: string; rate: number }> = [
  // 2020
  { validFrom: '2020-01-01', rate: 11.75 },
  { validFrom: '2020-05-22', rate: 9.25 },
  { validFrom: '2020-06-13', rate: 8.25 },
  { validFrom: '2020-09-25', rate: 9.25 },
  { validFrom: '2020-11-20', rate: 14.25 },
  { validFrom: '2020-12-25', rate: 17.25 },
  // 2021
  { validFrom: '2021-03-19', rate: 19.25 },
  { validFrom: '2021-09-24', rate: 18.25 },
  { validFrom: '2021-10-22', rate: 16.25 },
  { validFrom: '2021-11-19', rate: 15.25 },
  { validFrom: '2021-12-17', rate: 14.25 },
  // 2022
  { validFrom: '2022-08-19', rate: 13.25 },
  { validFrom: '2022-09-23', rate: 12.25 },
  { validFrom: '2022-10-21', rate: 10.75 },
  { validFrom: '2022-11-25', rate: 9.50 },
  // 2023
  { validFrom: '2023-06-23', rate: 15.00 },
  { validFrom: '2023-07-21', rate: 17.50 },
  { validFrom: '2023-08-25', rate: 25.50 },
  { validFrom: '2023-09-22', rate: 30.50 },
  { validFrom: '2023-10-27', rate: 35.50 },
  { validFrom: '2023-11-24', rate: 40.50 },
  { validFrom: '2023-12-29', rate: 45.00 },
  // 2024
  { validFrom: '2024-01-26', rate: 46.00 },
  { validFrom: '2024-03-22', rate: 50.00 },
  { validFrom: '2024-12-28', rate: 49.25 }, // VergiNet doğrulamalı
  // 2025 (TCMB Resmi - VergiNet/ASMMMO doğrulamalı)
  { validFrom: '2025-03-08', rate: 44.25 }, // 08.03.2025'ten itibaren
  { validFrom: '2025-09-17', rate: 42.25 }, // 17.09.2025'ten itibaren
  { validFrom: '2025-12-20', rate: 39.75 }, // 20.12.2025'ten itibaren
];

/**
 * YASAL FAİZ ORANLARI (3095 sayılı Kanun m.1)
 * Aralık semantiği: [validFrom, nextValidFrom) - başlangıç dahil, bitiş hariç
 */
const YASAL_FAIZ_ORANLARI: Array<{ validFrom: string; rate: number }> = [
  { validFrom: '2006-01-01', rate: 9 },
  { validFrom: '2024-06-01', rate: 24 },
];

/**
 * Segmentli faiz hesaplama (değişen oranlar için)
 * 
 * Mimari: Sadece validFrom kullanılır, validTo yok.
 * Bir sonraki satırın validFrom'u bu satırın bitiş tarihidir.
 * Aralık: [segmentStart, segmentEnd) - başlangıç dahil, bitiş hariç
 */
const hesaplaSegmentliFaiz = (
  tutar: number, 
  baslangic: string, 
  bitis: string,
  oranlar: Array<{ validFrom: string; rate: number }>
): { toplam: number; segmentler: Array<{ baslangic: string; bitis: string; gun: number; oran: number; faiz: number }> } => {
  const startDate = new Date(baslangic);
  const endDate = new Date(bitis);
  
  if (startDate >= endDate || tutar <= 0) {
    return { toplam: 0, segmentler: [] };
  }
  
  // Oranları tarihe göre sırala
  const sortedRates = [...oranlar].sort((a, b) => 
    new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime()
  );
  
  let totalInterest = 0;
  const segmentler: Array<{ baslangic: string; bitis: string; gun: number; oran: number; faiz: number }> = [];
  
  for (let i = 0; i < sortedRates.length; i++) {
    const currentRate = sortedRates[i];
    const nextRate = sortedRates[i + 1];
    
    const rateStart = new Date(currentRate.validFrom);
    // Bir sonraki oranın başlangıcı bu oranın bitişi (veya sonsuz)
    const rateEnd = nextRate ? new Date(nextRate.validFrom) : new Date('2099-12-31');
    
    // Bu oran dönemi hesaplama aralığıyla kesişiyor mu?
    if (endDate <= rateStart || startDate >= rateEnd) continue;
    
    // Kesişim aralığını bul [segmentStart, segmentEnd)
    const segmentStart = startDate > rateStart ? startDate : rateStart;
    const segmentEnd = endDate < rateEnd ? endDate : rateEnd;
    
    // Gün sayısı: bitiş - başlangıç (başlangıç dahil, bitiş hariç)
    const days = Math.floor((segmentEnd.getTime() - segmentStart.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) continue;
    
    // Faiz hesabı: Anapara × (Yıllık Oran / 100) × Gün / 365
    const annualRate = currentRate.rate / 100;
    const segmentInterest = tutar * annualRate * days / 365;
    totalInterest += segmentInterest;
    
    // UI'da bitiş tarihini inclusive göster (1 gün geri)
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
  
  return {
    toplam: Math.round(totalInterest * 100) / 100,
    segmentler,
  };
};

const hesaplaYasalFaiz = (tutar: number, baslangic: string, bitis: string): number => {
  return hesaplaSegmentliFaiz(tutar, baslangic, bitis, YASAL_FAIZ_ORANLARI).toplam;
};

/**
 * TCMB Avans faizi hesaplama (segmentli)
 */
const hesaplaTicariFaiz = (tutar: number, baslangic: string, bitis: string): number => {
  return hesaplaSegmentliFaiz(tutar, baslangic, bitis, TCMB_AVANS_ORANLARI).toplam;
};

const hesaplaFaiz = (
  tutar: number, 
  faizTuru: string, 
  baslangic: string, 
  bitis: string,
  sabitOran?: number // Sabit oran için kullanıcının girdiği değer
): number => {
  if (!tutar || !baslangic || !bitis || faizTuru === "YOK") return 0;
  
  const faizOption = FAIZ_TURU_OPTIONS.find(f => f.value === faizTuru);
  if (!faizOption) return 0;

  const startDate = new Date(baslangic);
  const endDate = new Date(bitis);
  const days = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  
  if (days === 0) return 0;

  // YASAL FAİZ - Dönemsel hesaplama (2006: %9, 2024: %24)
  if (faizTuru === 'YASAL') {
    return hesaplaYasalFaiz(tutar, baslangic, bitis);
  }

  // TİCARİ TEMERRÜT FAİZİ (TCMB Avans) - Segmentli hesaplama
  if (faizTuru === 'TICARI_DEGISEN') {
    return hesaplaTicariFaiz(tutar, baslangic, bitis);
  }

  // Diğer değişen oran türleri için tahmini hesaplama
  if (faizOption.variable && faizTuru !== 'TICARI_DEGISEN') {
    const estimatedRates: Record<string, number> = {
      'BANKA_TL': 45, // Mevduat faizi tahmini
      'KAMU_BANKA_TL': 42, // Kamu bankası mevduat
    };
    const rate = estimatedRates[faizTuru] || 40;
    const dailyRate = rate / 365 / 100;
    return Math.round(tutar * dailyRate * days * 100) / 100;
  }

  // Sabit oran türleri
  let rate = sabitOran ?? faizOption.rate ?? 0;
  if (rate === 0) return 0;
  
  const dailyRate = rate / 365 / 100;
  return Math.round(tutar * dailyRate * days * 100) / 100;
};

const formatCurrency = (amount: number, curr = "TRY") => {
  const symbol = CURRENCY_OPTIONS.find(c => c.value === curr)?.symbol || "₺";
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
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
  const minimum = 11000;
  for (const tarife of tarifeler) {
    if (takipTutari <= tarife.max) {
      const ucret = tarife.fixed + ((takipTutari - tarife.min) * tarife.rate);
      return Math.max(ucret, minimum);
    }
  }
  const sonTarife = tarifeler[tarifeler.length - 1];
  return sonTarife.fixed + ((takipTutari - sonTarife.min) * sonTarife.rate);
};

const createEmptyKalem = (kalemTuru: string, currency = "TRY"): AlacakKalemi => {
  const config = TAKIP_TIPI_CONFIG[kalemTuru] || TAKIP_TIPI_CONFIG.ASIL_ALACAK;
  const today = new Date().toISOString().split("T")[0];
  return {
    id: `kalem_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    kalemTuru,
    toplamTutar: 0,
    bakiyeTutar: 0,
    currency,
    vadeTarihi: today,
    takipOncesiFaiz: config.faizTuru,
    takipSonrasiFaiz: config.faizTuru,
    hesaplanmisFaiz: false,
    aciklama: "",
    cekBilgileri: kalemTuru === "CEK" ? {
      ibrazTarihi: today,
      duzenlemeYeri: "",
      cekSeriNo: "",
      hesapNo: "",
      bankaVeSube: "",
      cekiImzalayanlar: "",
    } : undefined,
  };
};


// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function ProfessionalClaimItemForm({ 
  caseType: _caseType, 
  formCode: _formCode, 
  currency = "TRY", 
  takipTuruCode,
  documentSource,
  onItemsChange,
  onPrecautionaryChange,
  initialItems: _initialItems,
  takipTarihi = new Date().toISOString().split("T")[0],
  borcluSayisi = 1,
  fileNumber = "",
  executionOffice,
  creditors = [],
  lawyers = [],
  debtors = [],
  mahiyetKodu,
}: Props) {
  
  const getDefaultKalemTuru = () => {
    // 1. Önce mahiyetKodu'na göre kontrol et (wizard'dan gelen değer)
    if (mahiyetKodu) {
      // Mahiyet kodunu kalem türüne çevir
      const mahiyetToKalem: Record<string, string> = {
        'CEK': 'CEK',
        'SENET': 'SENET',
        'FATURA': 'FATURA',
        'KIRA': 'KIRA',
        'KIRA_FARK': 'KIRA',
        'AIDAT': 'AIDAT',
        'NAFAKA': 'NAFAKA',
        'KREDI': 'KREDI',
        'KREDI_KARTI': 'KREDI',
        'BANKA': 'BANKA',
        'TAZMINAT': 'ILAM',
        'ICRA_INKAR': 'ILAM',
        'ISCILIK': 'ILAM',
        'TAHLIYE': 'KIRA',
        'IPOTEK': 'IPOTEK', // Artık kendi kalem türü var
        'REHIN': 'REHIN',   // Artık kendi kalem türü var
        'PARA': 'ASIL_ALACAK',
        'DIGER': 'ASIL_ALACAK',
      };
      const kalemTuru = mahiyetToKalem[mahiyetKodu];
      if (kalemTuru && TAKIP_TIPI_CONFIG[kalemTuru]) {
        return kalemTuru;
      }
    }
    
    // 2. Sonra takipTuruCode'a göre kontrol et
    if (takipTuruCode === "KAMBIYO_CEK") return "CEK";
    if (takipTuruCode === "KAMBIYO_SENET") return "SENET";
    if (takipTuruCode === "ILAMSIZ_KIRA" || takipTuruCode === "KIRA") return "KIRA";
    if (takipTuruCode === "ILAMSIZ_TAHLIYE") return "KIRA";
    if (takipTuruCode === "ILAMLI") return "ILAM";
    if (takipTuruCode === "NAFAKA") return "NAFAKA";
    if (takipTuruCode === "ILAMSIZ_FATURA") return "FATURA";
    if (takipTuruCode === "ILAMSIZ_GENEL") return "ASIL_ALACAK";
    if (takipTuruCode === "REHIN_TASINIR") return "REHIN";
    if (takipTuruCode === "REHIN_TASINMAZ") return "IPOTEK";
    if (takipTuruCode === "IFLAS_ADI") return "ASIL_ALACAK";
    if (takipTuruCode === "IFLAS_KAMBIYO") return "CEK"; // veya SENET - kullanıcı seçer
    
    // 3. Sonra documentSource'a göre kontrol et
    if (documentSource === "KAMBIYO") return "CEK";
    if (documentSource === "ILAM") return "ILAM";
    if (documentSource === "SOZLESME") return "ASIL_ALACAK";
    
    return "ASIL_ALACAK";
  };

  const [kalem, setKalem] = useState<AlacakKalemi>(() => createEmptyKalem(getDefaultKalemTuru(), currency));
  const [hesapOzeti, setHesapOzeti] = useState<HesapOzetiSatir[]>([]);
  const [isCalculated, setIsCalculated] = useState(false);
  const [hesapTarihi, setHesapTarihi] = useState<string>(new Date().toISOString().split("T")[0]);

  // Faiz Dökümü Preview State
  const [faizDokumuVisible, setFaizDokumuVisible] = useState(false);
  const [faizSegmentleri, setFaizSegmentleri] = useState<{
    takipOncesi: Array<{ baslangic: string; bitis: string; gun: number; oran: number; faiz: number }>;
    takipSonrasi: Array<{ baslangic: string; bitis: string; gun: number; oran: number; faiz: number }>;
  }>({ takipOncesi: [], takipSonrasi: [] });

  // Zamanaşımı durumu
  const [limitationStatus, setLimitationStatus] = useState<LimitationStatus | null>(null);
  const [checkingLimitation, setCheckingLimitation] = useState(false);

  // Faiz başlangıç tarihi seçimi (ilamsız takipler için)
  // "TAKIP" = Takip tarihi (varsayılan, güvenli), "VADE" = Vade tarihi (riskli ama mümkün)
  const [faizBaslangicTercih, setFaizBaslangicTercih] = useState<"TAKIP" | "VADE">("TAKIP");

  // ═══════════════════════════════════════════════════════════════════════════
  // FAİZ TÜRÜ BELİRLEME STATE'LERİ
  // ═══════════════════════════════════════════════════════════════════════════
  // Ticari iş mi? (kullanıcı override edebilir)
  const [isCommercial, setIsCommercial] = useState<boolean | null>(null);
  // Sözleşmede belirtilen akdi faiz oranı
  const [contractInterestRate, setContractInterestRate] = useState<number | null>(null);
  // Faiz türü belirleme sonucu
  const [interestTypeResult, setInterestTypeResult] = useState<InterestTypeResult | null>(null);

  // İlamlı Takip Yan Alacak Kalemleri
  const [ilamYanAlacaklar, setIlamYanAlacaklar] = useState<IlamYanAlacak[]>([]);

  // Kalem türü değiştiğinde faiz türünü yeniden hesapla
  useEffect(() => {
    const config = TAKIP_TIPI_CONFIG[kalem.kalemTuru];
    
    // Varsayılan ticari durumunu ayarla (kullanıcı henüz seçmediyse)
    if (isCommercial === null && config) {
      setIsCommercial(config.defaultCommercial ?? getDefaultCommercialStatus(kalem.kalemTuru));
    }
    
    // Faiz türünü hesapla
    const result = resolveInterestType({
      kalemTuru: kalem.kalemTuru,
      contractInterestRate,
      isCommercial,
      documentSource,
    });
    
    setInterestTypeResult(result);
    
    // Faiz türünü kalem'e uygula (sadece değiştirilebilir ise veya ilk yüklemede)
    if (config?.canOverrideInterest !== false || kalem.takipOncesiFaiz === config?.faizTuru) {
      setKalem(prev => ({
        ...prev,
        takipOncesiFaiz: result.interestType,
        takipSonrasiFaiz: result.interestType,
      }));
    }
  }, [kalem.kalemTuru, isCommercial, contractInterestRate, documentSource]);

  // takipTuruCode veya documentSource değiştiğinde kalem türünü güncelle

  // takipTuruCode veya documentSource değiştiğinde kalem türünü güncelle
  useEffect(() => {
    const yeniKalemTuru = getDefaultKalemTuru();
    if (kalem.kalemTuru !== yeniKalemTuru && kalem.bakiyeTutar === 0) {
      // Sadece henüz veri girilmemişse otomatik değiştir
      const config = TAKIP_TIPI_CONFIG[yeniKalemTuru] || TAKIP_TIPI_CONFIG.ASIL_ALACAK;
      setKalem(prev => ({
        ...prev,
        kalemTuru: yeniKalemTuru,
        takipOncesiFaiz: config.faizTuru,
        takipSonrasiFaiz: config.faizTuru,
        cekBilgileri: yeniKalemTuru === "CEK" ? {
          ibrazTarihi: prev.vadeTarihi,
          duzenlemeYeri: "",
          cekSeriNo: "",
          hesapNo: "",
          bankaVeSube: "",
          cekiImzalayanlar: "",
        } : undefined,
        ilamBilgileri: yeniKalemTuru === "ILAM" ? {
          mahkemeAdi: "",
          esasNo: "",
          kararNo: "",
          ilamTarihi: "",
        } : undefined,
        faturaBilgileri: yeniKalemTuru === "FATURA" ? {
          faturaNo: "",
          faturaTarihi: "",
        } : undefined,
      }));
      setIsCalculated(false);
    }
  }, [takipTuruCode, documentSource]);

  // ÇEK: Vade tarihi değiştiğinde ibraz tarihini güncelle
  // Mantık: Vade tarihi değiştiğinde ibraz tarihini de vade tarihine eşitle
  // (Kullanıcı daha sonra manuel olarak değiştirebilir)
  const prevVadeTarihiRef = useRef(kalem.vadeTarihi);
  useEffect(() => {
    if (kalem.kalemTuru === "CEK" && kalem.cekBilgileri && kalem.vadeTarihi) {
      const vadeTarihi = kalem.vadeTarihi;
      const ibrazTarihi = kalem.cekBilgileri.ibrazTarihi;
      const prevVadeTarihi = prevVadeTarihiRef.current;
      
      // Vade tarihi değiştiyse ibraz tarihini de güncelle
      // VEYA ibraz tarihi yoksa/vade tarihinden küçükse güncelle
      const vadeTarihiDegisti = prevVadeTarihi !== vadeTarihi;
      const ibrazGecersiz = !ibrazTarihi || ibrazTarihi < vadeTarihi;
      
      if (vadeTarihiDegisti || ibrazGecersiz) {
        setKalem(prev => ({
          ...prev,
          cekBilgileri: {
            ...prev.cekBilgileri!,
            ibrazTarihi: vadeTarihi
          }
        }));
      }
      
      // Ref'i güncelle
      prevVadeTarihiRef.current = vadeTarihi;
    }
  }, [kalem.vadeTarihi, kalem.kalemTuru]);

  // İhtiyati Haciz State'leri
  const [hasIhtiyatiHaciz, setHasIhtiyatiHaciz] = useState(false);
  const [ihtiyatiHacizKarari, setIhtiyatiHacizKarari] = useState<IhtiyatiHacizKarari>({
    mahkemeAdi: "",
    kararTarihi: new Date().toISOString().split("T")[0],
    esasNo: "",
    kararNo: "",
    kapsadigiTutar: 0,
    teminatVar: false,
    teminatTuru: "",
    teminatTutari: 0,
    teminatOrani: 15,
    seciliBorclular: [],
    durum: "DRAFT",
  });
  const [ihtiyatiHacizMasraflari, setIhtiyatiHacizMasraflari] = useState<IhtiyatiHacizMasrafi[]>([]);

  // Zorunlu alan kontrolü
  const checkZorunluAlanlar = useCallback((): { valid: boolean; eksikAlanlar: string[] } => {
    const eksikAlanlar: string[] = [];
    if (!kalem.bakiyeTutar || kalem.bakiyeTutar <= 0) eksikAlanlar.push("Bakiye Tutar");
    if (!kalem.vadeTarihi) eksikAlanlar.push("Vade Tarihi");
    // Çek bilgileri artık zorunlu değil - hesap dökümü için sadece tutar yeterli
    // Çek bilgileri eksikse sadece uyarı gösterilecek, hesaplama engellenmiyor
    return { valid: eksikAlanlar.length === 0, eksikAlanlar };
  }, [kalem]);

  // Hesap özetini hesapla
  const hesapla = useCallback(() => {
    console.log('[ProfessionalClaimItemForm] hesapla() başladı');
    const validation = checkZorunluAlanlar();
    console.log('[ProfessionalClaimItemForm] Zorunlu alan kontrolü:', validation);
    if (!validation.valid) {
      console.log('[ProfessionalClaimItemForm] Zorunlu alanlar eksik:', validation.eksikAlanlar);
      return;
    }

    const config = TAKIP_TIPI_CONFIG[kalem.kalemTuru] || TAKIP_TIPI_CONFIG.ASIL_ALACAK;
    const satirlar: HesapOzetiSatir[] = [];

    // 1. Asıl Alacak
    satirlar.push({ key: "asil_alacak", label: config.label, tutar: kalem.bakiyeTutar });

    // 2. İlamlı Takip Yan Alacakları (varsa)
    let yanAlacakToplam = 0;
    if (kalem.kalemTuru === "ILAM" && ilamYanAlacaklar.length > 0) {
      ilamYanAlacaklar.forEach((yan, index) => {
        const yanConfig = TAKIP_TIPI_CONFIG[yan.tur];
        satirlar.push({ 
          key: `yan_alacak_${index}`, 
          label: yanConfig?.label || yan.aciklama, 
          tutar: yan.tutar 
        });
        yanAlacakToplam += yan.tutar;
      });
    }

    // 3. Çek Tazminatı
    let tazminat = 0;
    if (config.tazminatOrani > 0) {
      tazminat = kalem.bakiyeTutar * config.tazminatOrani;
      satirlar.push({ key: "tazminat", label: "Karşılıksız Çek Tazminatı (%10)", tutar: tazminat });
    }

    // 4. Komisyon
    let komisyon = 0;
    if (config.komisyonOrani > 0) {
      komisyon = kalem.bakiyeTutar * config.komisyonOrani;
      satirlar.push({ key: "komisyon", label: "Komisyon", tutar: komisyon });
    }

    // 5. Takip Öncesi Faiz
    // İlamsız takiplerde faiz başlangıç tercihi: TAKIP = takip tarihi, VADE = vade tarihi
    // ÇEK TAKİPLERİNDE: Faiz ibraz tarihinden başlar (vade tarihinden değil)
    const isIlamsizTakip = ["FATURA", "ASIL_ALACAK", "KIRA"].includes(kalem.kalemTuru);
    let takipOncesiFaiz = 0;
    let takipOncesiSegmentler: Array<{ baslangic: string; bitis: string; gun: number; oran: number; faiz: number }> = [];
    
    // Faiz türüne göre oran tablosunu seç
    const getOranTablosu = (faizTuru: string) => {
      if (faizTuru === 'TICARI_DEGISEN') return TCMB_AVANS_ORANLARI;
      if (faizTuru === 'YASAL') return YASAL_FAIZ_ORANLARI;
      return [];
    };
    
    if (isIlamsizTakip && faizBaslangicTercih === "TAKIP") {
      // Takip tarihinden başlat - takip öncesi faiz yok
      takipOncesiFaiz = 0;
    } else if (kalem.kalemTuru === "CEK" && kalem.cekBilgileri?.ibrazTarihi) {
      // ÇEK: Faiz ibraz tarihinden başlar
      const oranTablosu = getOranTablosu(kalem.takipOncesiFaiz);
      if (oranTablosu.length > 0 && (kalem.takipOncesiFaiz === 'TICARI_DEGISEN' || kalem.takipOncesiFaiz === 'YASAL')) {
        const sonuc = hesaplaSegmentliFaiz(kalem.bakiyeTutar, kalem.cekBilgileri.ibrazTarihi, takipTarihi, oranTablosu);
        takipOncesiFaiz = sonuc.toplam;
        takipOncesiSegmentler = sonuc.segmentler;
      } else {
        takipOncesiFaiz = hesaplaFaiz(kalem.bakiyeTutar, kalem.takipOncesiFaiz, kalem.cekBilgileri.ibrazTarihi, takipTarihi);
      }
    } else {
      // Vade tarihinden başlat (veya ilamlı/kambiyo takipleri)
      const oranTablosu = getOranTablosu(kalem.takipOncesiFaiz);
      if (oranTablosu.length > 0 && (kalem.takipOncesiFaiz === 'TICARI_DEGISEN' || kalem.takipOncesiFaiz === 'YASAL')) {
        const sonuc = hesaplaSegmentliFaiz(kalem.bakiyeTutar, kalem.vadeTarihi, takipTarihi, oranTablosu);
        takipOncesiFaiz = sonuc.toplam;
        takipOncesiSegmentler = sonuc.segmentler;
      } else {
        takipOncesiFaiz = hesaplaFaiz(kalem.bakiyeTutar, kalem.takipOncesiFaiz, kalem.vadeTarihi, takipTarihi);
      }
    }
    
    if (takipOncesiFaiz > 0) {
      satirlar.push({ key: "takip_oncesi_faiz", label: "Takip Öncesi Faiz", tutar: takipOncesiFaiz });
    }

    // 6. Takip Tutarı (asıl alacak + yan alacaklar + tazminat + komisyon + faiz)
    const takipTutari = kalem.bakiyeTutar + yanAlacakToplam + tazminat + komisyon + takipOncesiFaiz;
    satirlar.push({ key: "takip_tutari", label: "Takip Tutarı", tutar: takipTutari, bold: true, color: "blue" });

    // 7. İcra Masrafları
    const basvurmaHarci = 615.40;
    const vekaletHarci = 87.50;
    const pesinHarc = takipTutari * 0.005;
    const dosyaGideri = 2.00;
    const tebligatGideri = 15.00 * borcluSayisi;
    const vekaletPulu = 138.00;
    const icraMasraflari = basvurmaHarci + vekaletHarci + pesinHarc + dosyaGideri + tebligatGideri + vekaletPulu;

    satirlar.push({ key: "basvurma_harci", label: "Başvurma Harcı", tutar: basvurmaHarci });
    satirlar.push({ key: "vekalet_harci", label: "Vekalet Harcı", tutar: vekaletHarci });
    satirlar.push({ key: "pesin_harc", label: "Peşin Harç", tutar: pesinHarc });
    satirlar.push({ key: "dosya_gideri", label: "Dosya Gideri", tutar: dosyaGideri });
    satirlar.push({ key: "tebligat_gideri", label: `Tebligat Gideri (${borcluSayisi} borçlu)`, tutar: tebligatGideri });
    satirlar.push({ key: "vekalet_pulu", label: "Vekalet Pulu", tutar: vekaletPulu });
    satirlar.push({ key: "icra_masraflari", label: "İcra Masrafları", tutar: icraMasraflari, bold: true });

    // 8. İhtiyati Haciz Masrafları
    let ihtiyatiHacizToplam = 0;
    if (hasIhtiyatiHaciz && ihtiyatiHacizMasraflari.length > 0) {
      ihtiyatiHacizMasraflari.forEach((masraf, index) => {
        satirlar.push({ key: `ihtiyati_haciz_${index}`, label: masraf.aciklama, tutar: masraf.tutar });
        ihtiyatiHacizToplam += masraf.tutar;
      });
      satirlar.push({ key: "ihtiyati_haciz_toplam", label: "İHTİYATİ HACİZ MASRAFLARI", tutar: ihtiyatiHacizToplam, bold: true, color: "orange" });
    }

    // 9. Tahsil Harçları
    const pesinHarcDahilTahsilHarci = (takipTutari + icraMasraflari + ihtiyatiHacizToplam) * 0.0455;
    const pesinHarcHaricTahsilHarci = (takipTutari + icraMasraflari + ihtiyatiHacizToplam - pesinHarc) * 0.0455;
    satirlar.push({ key: "pesin_harc_dahil_tahsil", label: "Peşin Harç Dahil Tahsil Harcı", tutar: pesinHarcDahilTahsilHarci });
    satirlar.push({ key: "pesin_harc_haric_tahsil", label: "Peşin Harç Hariç Tahsil Harcı", tutar: pesinHarcHaricTahsilHarci });

    // 10. Vekalet Ücreti
    const vekaletUcreti = hesaplaVekaletUcreti(takipTutari);
    satirlar.push({ key: "vekalet_ucreti", label: "Vekalet Ücreti", tutar: vekaletUcreti, bold: true });

    // 11. Takip Sonrası Faiz
    let takipSonrasiFaiz = 0;
    let takipSonrasiSegmentler: Array<{ baslangic: string; bitis: string; gun: number; oran: number; faiz: number }> = [];
    
    const oranTablosuSonrasi = getOranTablosu(kalem.takipSonrasiFaiz);
    if (oranTablosuSonrasi.length > 0 && (kalem.takipSonrasiFaiz === 'TICARI_DEGISEN' || kalem.takipSonrasiFaiz === 'YASAL')) {
      const sonuc = hesaplaSegmentliFaiz(kalem.bakiyeTutar, takipTarihi, hesapTarihi, oranTablosuSonrasi);
      takipSonrasiFaiz = sonuc.toplam;
      takipSonrasiSegmentler = sonuc.segmentler;
    } else {
      takipSonrasiFaiz = hesaplaFaiz(kalem.bakiyeTutar, kalem.takipSonrasiFaiz, takipTarihi, hesapTarihi);
    }
    satirlar.push({ key: "takip_sonrasi_faiz", label: "Takip Sonrası Faiz", tutar: takipSonrasiFaiz, bold: true });
    
    // Faiz segmentlerini state'e kaydet
    setFaizSegmentleri({
      takipOncesi: takipOncesiSegmentler,
      takipSonrasi: takipSonrasiSegmentler,
    });

    // 12. Toplam Borç
    const toplamBorc = takipTutari + icraMasraflari + ihtiyatiHacizToplam + vekaletUcreti + takipSonrasiFaiz;
    satirlar.push({ key: "toplam_borc", label: "Toplam Borç Tutarı", tutar: toplamBorc, bold: true, color: "blue" });

    // 13. Son Borç
    const sonBorc = toplamBorc + pesinHarcHaricTahsilHarci;
    satirlar.push({ key: "son_borc", label: "Son Borç Tutarı", tutar: sonBorc, bold: true, color: "green" });

    // 14. Tahsil Oranları
    const tahsilOranlari = [
      { oran: 0, label: "0" },
      { oran: 0.0227, label: "2,27" },
      { oran: 0.0455, label: "4,55" },
      { oran: 0.0910, label: "9,10" },
      { oran: 0.1138, label: "11,38" },
    ];
    tahsilOranlari.forEach((t, index) => {
      const borcTutari = toplamBorc * (1 + t.oran);
      satirlar.push({ key: `tahsil_${index}`, label: `${t.label}`, tutar: borcTutari, color: "gray" });
    });

    setHesapOzeti(satirlar);
    setIsCalculated(true);

    if (onItemsChange) {
      onItemsChange([{ ...kalem, hesapOzeti: satirlar, ilamYanAlacaklar }]);
    }
  }, [kalem, takipTarihi, hesapTarihi, borcluSayisi, hasIhtiyatiHaciz, ihtiyatiHacizMasraflari, ilamYanAlacaklar, checkZorunluAlanlar, onItemsChange, faizBaslangicTercih]);

  // OTOMATİK HESAPLAMA - değişiklik olduğunda 500ms sonra hesapla
  useEffect(() => {
    console.log('[ProfessionalClaimItemForm] Otomatik hesaplama tetiklendi:', {
      bakiyeTutar: kalem.bakiyeTutar,
      vadeTarihi: kalem.vadeTarihi,
      kalemTuru: kalem.kalemTuru,
      cekSeriNo: kalem.cekBilgileri?.cekSeriNo,
      bankaVeSube: kalem.cekBilgileri?.bankaVeSube,
    });
    
    if (!kalem.bakiyeTutar || kalem.bakiyeTutar <= 0) {
      console.log('[ProfessionalClaimItemForm] bakiyeTutar eksik veya 0, hesaplama yapılmıyor');
      return;
    }
    
    const timer = setTimeout(() => {
      console.log('[ProfessionalClaimItemForm] hesapla() çağrılıyor...');
      hesapla();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [kalem.bakiyeTutar, kalem.vadeTarihi, kalem.takipOncesiFaiz, kalem.takipSonrasiFaiz, kalem.kalemTuru, hesapTarihi, kalem.cekBilgileri?.cekSeriNo, kalem.cekBilgileri?.bankaVeSube, kalem.cekBilgileri?.ibrazTarihi, faizBaslangicTercih, hesapla]);

  // ZAMANAŞIMI KONTROLÜ - vade tarihi değiştiğinde kontrol et
  useEffect(() => {
    if (!kalem.vadeTarihi) {
      setLimitationStatus(null);
      return;
    }

    const checkLimitation = async () => {
      setCheckingLimitation(true);
      try {
        // Kalem türünden takip türünü belirle
        let caseType = "ILAMSIZ";
        let instrumentType: string | null = null;
        
        if (kalem.kalemTuru === "CEK") {
          caseType = "KAMBIYO";
          instrumentType = "CEK";
        } else if (kalem.kalemTuru === "SENET") {
          caseType = "KAMBIYO";
          instrumentType = "BONO";
        } else if (kalem.kalemTuru === "ILAM") {
          caseType = "ILAMLI";
        } else if (kalem.kalemTuru === "KIRA") {
          caseType = "KIRA";
        } else if (kalem.kalemTuru === "FATURA") {
          caseType = "ILAMSIZ";
        } else if (kalem.kalemTuru === "ASIL_ALACAK") {
          caseType = "GENEL";
        } else if (kalem.kalemTuru === "NAFAKA" || kalem.kalemTuru === "NAFAKA_BIRIKIMIS" || kalem.kalemTuru === "NAFAKA_ISLEYECEK") {
          caseType = "NAFAKA";
        }

        // Request body - sadece tanımlı değerleri gönder
        const requestBody: Record<string, string> = {
          caseType,
          startDate: kalem.vadeTarihi,
        };
        
        // instrumentType sadece kambiyo için gerekli
        if (instrumentType) {
          requestBody.instrumentType = instrumentType;
        }

        console.log('[Zamanaşımı] Kontrol başlatılıyor:', requestBody);

        const response = await api.post<{
          status: LimitationStatus;
          shouldShowModal: boolean;
          modalType: 'YELLOW' | 'RED' | null;
        }>('/limitation-engine/check', requestBody);

        console.log('[Zamanaşımı] API yanıtı:', response.data);

        // response.data doğrudan LimitationCheckResult tipinde
        if (response.data?.status) {
          setLimitationStatus(response.data.status);
          console.log('[Zamanaşımı] Status ayarlandı:', response.data.status.level);
        } else {
          console.warn('[Zamanaşımı] Status bulunamadı:', response.data);
          setLimitationStatus(null);
        }
      } catch (error) {
        console.error('[Zamanaşımı] Kontrol hatası:', error);
        setLimitationStatus(null);
      } finally {
        setCheckingLimitation(false);
      }
    };

    // 300ms debounce
    const timer = setTimeout(checkLimitation, 300);
    return () => clearTimeout(timer);
  }, [kalem.vadeTarihi, kalem.kalemTuru]);

  // Kalem türü değiştiğinde
  const handleKalemTuruChange = (yeniTur: string) => {
    const config = TAKIP_TIPI_CONFIG[yeniTur] || TAKIP_TIPI_CONFIG.ASIL_ALACAK;
    setKalem(prev => ({
      ...prev,
      kalemTuru: yeniTur,
      takipOncesiFaiz: config.faizTuru,
      takipSonrasiFaiz: config.faizTuru,
      cekBilgileri: yeniTur === "CEK" ? {
        ibrazTarihi: prev.vadeTarihi,
        duzenlemeYeri: "",
        cekSeriNo: "",
        hesapNo: "",
        bankaVeSube: "",
        cekiImzalayanlar: "",
      } : undefined,
    }));
    setIsCalculated(false);
  };


  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="min-h-[550px] flex gap-2">
      {/* SOL PANEL - Alacak Kalemi Formu */}
      <div className="flex-1 space-y-1.5">
        {/* Alacak Bilgileri */}
        <div className="border rounded p-2 bg-white">
          <h3 className="font-medium text-xs mb-1.5 flex items-center gap-1">
            <FileText className="h-3 w-3 text-blue-600" />
            Alacak Bilgileri
          </h3>
          
          <div className="grid grid-cols-4 gap-1.5">
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Borcun Sebebi</label>
              <select
                value={kalem.kalemTuru}
                onChange={(e) => handleKalemTuruChange(e.target.value)}
                className="w-full border rounded px-1.5 py-0.5 text-xs bg-yellow-50"
              >
                <optgroup label="Kambiyo Senetleri">
                  <option value="CEK">Çek</option>
                  <option value="SENET">Senet / Bono</option>
                </optgroup>
                <optgroup label="İlamsız Alacaklar">
                  <option value="FATURA">Fatura Alacağı</option>
                  <option value="KIRA">Kira Alacağı</option>
                  <option value="AIDAT">Aidat / Site Gideri</option>
                  <option value="ASIL_ALACAK">Genel Alacak</option>
                </optgroup>
                <optgroup label="Banka / Kredi">
                  <option value="KREDI">Kredi Alacağı</option>
                  <option value="BANKA">Banka Alacağı (İİK 68)</option>
                </optgroup>
                <optgroup label="Rehin / İpotek">
                  <option value="IPOTEK">İpotek Alacağı</option>
                  <option value="REHIN">Rehin Alacağı</option>
                </optgroup>
                <optgroup label="İlamlı Alacaklar">
                  <option value="ILAM">İlam</option>
                  <option value="NAFAKA">Nafaka</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Para Birimi</label>
              <select
                value={kalem.currency}
                onChange={(e) => setKalem(prev => ({ ...prev, currency: e.target.value }))}
                className="w-full border rounded px-1.5 py-0.5 text-xs"
              >
                {CURRENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Vade/Keşide Tarihi *</label>
              {/* Debug: limitationStatus durumu */}
              {process.env.NODE_ENV === 'development' && limitationStatus && (
                <div className="text-[8px] text-purple-600 mb-0.5">
                  [DEBUG] Level: {limitationStatus.level}, Days: {limitationStatus.daysLeft}
                </div>
              )}
              <input
                type="date"
                value={kalem.vadeTarihi}
                onChange={(e) => {
                  const newValue = e.target.value;
                  if (newValue) {
                    setKalem(prev => ({ ...prev, vadeTarihi: newValue }));
                  }
                }}
                max="2100-12-31"
                min="1900-01-01"
                className={`w-full border rounded px-1.5 py-0.5 text-xs ${
                  limitationStatus?.level === 'RED' ? 'border-red-300 bg-red-50' :
                  limitationStatus?.level === 'YELLOW' ? 'border-yellow-300 bg-yellow-50' : ''
                }`}
              />
              {/* Zamanaşımı göstergesi */}
              {checkingLimitation && (
                <div className="mt-0.5 flex items-center gap-1 text-[9px] text-gray-400">
                  <Clock className="h-2.5 w-2.5 animate-spin" />
                  <span>Kontrol ediliyor...</span>
                </div>
              )}
              {!checkingLimitation && limitationStatus && limitationStatus.level !== 'GREEN' && (
                <div className={`mt-0.5 flex items-center gap-1 text-[9px] ${
                  limitationStatus.level === 'RED' ? 'text-red-600' :
                  limitationStatus.level === 'YELLOW' ? 'text-yellow-600' : 'text-gray-500'
                }`}>
                  <AlertCircle className="h-2.5 w-2.5" />
                  <span>
                    {limitationStatus.level === 'RED' && 'Zamanaşımı dolmuş!'}
                    {limitationStatus.level === 'YELLOW' && `${limitationStatus.daysLeft} gün kaldı`}
                    {limitationStatus.level === 'UNKNOWN' && 'Hesaplanamadı'}
                  </span>
                </div>
              )}
            </div>
            {/* İlamsız takiplerde faiz başlangıç seçimi - ayrı bir hücrede */}
            {["FATURA", "ASIL_ALACAK", "KIRA"].includes(kalem.kalemTuru) ? (
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Faiz Başlangıcı</label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setFaizBaslangicTercih("TAKIP")}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] border rounded transition-colors ${
                      faizBaslangicTercih === "TAKIP" 
                        ? "bg-green-100 border-green-500 text-green-700" 
                        : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                    }`}
                    title="Faiz takip tarihinden başlar (Önerilen)"
                  >
                    <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${faizBaslangicTercih === "TAKIP" ? "border-green-500" : "border-gray-400"}`}>
                      {faizBaslangicTercih === "TAKIP" && <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>}
                    </span>
                    Takip Tarihi
                  </button>
                  <button
                    type="button"
                    onClick={() => setFaizBaslangicTercih("VADE")}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] border rounded transition-colors ${
                      faizBaslangicTercih === "VADE" 
                        ? "bg-amber-100 border-amber-500 text-amber-700" 
                        : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                    }`}
                    title="Faiz vade tarihinden başlar"
                  >
                    <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${faizBaslangicTercih === "VADE" ? "border-amber-500" : "border-gray-400"}`}>
                      {faizBaslangicTercih === "VADE" && <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>}
                    </span>
                    Vade Tarihi
                  </button>
                </div>
              </div>
            ) : (
              <div></div>
            )}

            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Toplam Tutar (Evraktaki)</label>
              <input
                type="number"
                step="0.01"
                value={kalem.toplamTutar || ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setKalem(prev => ({ 
                    ...prev, 
                    toplamTutar: val,
                    bakiyeTutar: prev.bakiyeTutar === 0 || prev.bakiyeTutar === prev.toplamTutar ? val : prev.bakiyeTutar
                  }));
                }}
                placeholder="0,00"
                className="w-full border rounded px-1.5 py-0.5 text-xs text-right"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Bakiye Tutar (Takipte İstenen) *</label>
              <input
                type="number"
                step="0.01"
                value={kalem.bakiyeTutar || ""}
                onChange={(e) => setKalem(prev => ({ ...prev, bakiyeTutar: parseFloat(e.target.value) || 0 }))}
                placeholder="0,00"
                className="w-full border rounded px-1.5 py-0.5 text-xs text-right bg-blue-50"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-gray-500 mb-0.5">Açıklama</label>
              <input
                type="text"
                value={kalem.aciklama}
                onChange={(e) => setKalem(prev => ({ ...prev, aciklama: e.target.value }))}
                placeholder="Örn: Kısmi ödeme yapıldı, bakiye alacak takibe konulmuştur."
                className="w-full border rounded px-1.5 py-0.5 text-[10px]"
              />
            </div>
          </div>

          {/* Zamanaşımı Uyarısı - grid dışında */}
          {limitationStatus && limitationStatus.level !== 'GREEN' && (
            <div className={`mt-1.5 p-2 rounded text-[9px] ${
              limitationStatus.level === 'RED' 
                ? 'bg-red-50 border border-red-200 text-red-800' 
                : limitationStatus.level === 'YELLOW'
                  ? 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                  : 'bg-gray-50 border border-gray-200 text-gray-700'
            }`}>
              <div className="flex items-start gap-1.5">
                <Clock className={`h-3 w-3 mt-0.5 flex-shrink-0 ${
                  limitationStatus.level === 'RED' ? 'text-red-600' :
                  limitationStatus.level === 'YELLOW' ? 'text-yellow-600' : 'text-gray-500'
                }`} />
                <div>
                  <p className="font-medium">
                    {limitationStatus.level === 'RED' && '⚠️ Zamanaşımı Riski (Süre Dolmuş Görünüyor)'}
                    {limitationStatus.level === 'YELLOW' && `⏰ Zamanaşımı Yaklaşıyor (${limitationStatus.daysLeft} gün kaldı)`}
                    {limitationStatus.level === 'UNKNOWN' && 'ℹ️ Zamanaşımı Hesaplanamadı'}
                  </p>
                  <p className="mt-0.5">{limitationStatus.message}</p>
                  {limitationStatus.legalBasis && (
                    <p className="mt-0.5 text-[8px] opacity-75">Dayanak: {limitationStatus.legalBasis}</p>
                  )}
                  {limitationStatus.level === 'RED' && (
                    <p className="mt-1 font-medium text-red-700">
                      Borçlu itiraz ederse takip iptal edilebilir. Takip başlatılmasının sonuçları alacaklıya aittir.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Vade tarihi seçildiğinde uyarı - grid dışında */}
          {["FATURA", "ASIL_ALACAK", "KIRA"].includes(kalem.kalemTuru) && faizBaslangicTercih === "VADE" && (
            <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded text-[9px] text-amber-800">
              <div className="flex items-start gap-1.5">
                <AlertCircle className="h-3 w-3 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Dikkat: Vade tarihinden faiz başlatılıyor</p>
                  <p className="mt-0.5">Borçlu tarafından temerrüt itirazı yapılması halinde faiz takip tarihinden başlatılmak üzere düzeltilmesi gerekebilir. (TBK m.117)</p>
                </div>
              </div>
            </div>
          )}

          {/* Faiz Ayarları */}
          <div className="mt-1.5 pt-1.5 border-t flex flex-wrap items-center gap-3">
            <span className="text-[10px] text-gray-500">Uygulanacak Faiz:</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">Öncesi:</span>
              <select
                value={kalem.takipOncesiFaiz}
                onChange={(e) => setKalem(prev => ({ ...prev, takipOncesiFaiz: e.target.value }))}
                className="border rounded px-1 py-0.5 text-[10px]"
              >
                {FAIZ_TURU_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">Sonrası:</span>
              <select
                value={kalem.takipSonrasiFaiz}
                onChange={(e) => setKalem(prev => ({ ...prev, takipSonrasiFaiz: e.target.value }))}
                className="border rounded px-1 py-0.5 text-[10px]"
              >
                {FAIZ_TURU_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-1 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={kalem.hesaplanmisFaiz}
                onChange={(e) => setKalem(prev => ({ ...prev, hesaplanmisFaiz: e.target.checked }))}
                className="w-3 h-3 rounded border-gray-300"
              />
              <span className="text-[10px] text-gray-500">Hesaplanmış Faiz</span>
            </label>
          </div>

          {/* İLAM YAN ALACAK KALEMLERİ - Asıl alacağın hemen altında */}
          {kalem.kalemTuru === "ILAM" && (
            <div className="mt-1.5 pt-1.5 border-t">
              <div className="flex items-center justify-between mb-1">
                <select
                  className="border rounded px-1 py-0.5 text-[10px]"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      setIlamYanAlacaklar(prev => [...prev, {
                        id: `yan_${Date.now()}`,
                        tur: e.target.value,
                        tutar: 0,
                        aciklama: TAKIP_TIPI_CONFIG[e.target.value]?.label || ""
                      }]);
                    }
                  }}
                >
                  <option value="">+ Yan Alacak Ekle</option>
                  {ILAM_YAN_ALACAK_TURLERI.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <h4 className="text-[10px] font-medium text-gray-600">İlamda Hükmedilen Yan Alacaklar</h4>
              </div>
              
              {ilamYanAlacaklar.length > 0 && (
                <div className="space-y-1">
                  {ilamYanAlacaklar.map((yan, index) => (
                    <div key={yan.id} className="grid grid-cols-4 gap-1.5 items-center">
                      <div className="col-span-2">
                        <span className="text-[10px] text-gray-600">
                          {TAKIP_TIPI_CONFIG[yan.tur]?.label || yan.aciklama}
                        </span>
                      </div>
                      <div>
                        <input
                          type="number"
                          step="0.01"
                          value={yan.tutar || ""}
                          onChange={(e) => {
                            const newYanAlacaklar = [...ilamYanAlacaklar];
                            newYanAlacaklar[index].tutar = parseFloat(e.target.value) || 0;
                            setIlamYanAlacaklar(newYanAlacaklar);
                          }}
                          placeholder="0,00"
                          className="w-full border rounded px-1.5 py-0.5 text-xs text-right"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setIlamYanAlacaklar(prev => prev.filter((_, i) => i !== index))}
                          className="text-red-500 hover:text-red-700 text-xs px-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {ilamYanAlacaklar.length === 0 && (
                <p className="text-[9px] text-gray-400 italic">
                  İlamda yargılama gideri, vekalet ücreti veya işlemiş faiz varsa ekleyebilirsiniz.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Çek Bilgileri */}
        {kalem.kalemTuru === "CEK" && kalem.cekBilgileri && (
          <div className="border rounded p-2 bg-white">
            <h3 className="font-medium text-xs mb-1.5 flex items-center gap-1">
              <CreditCard className="h-3 w-3 text-green-600" />
              Çek Bilgileri
            </h3>
            <div className="grid grid-cols-4 gap-1.5">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">İbraz Tarihi *</label>
                <input
                  type="date"
                  value={kalem.cekBilgileri.ibrazTarihi}
                  min={kalem.vadeTarihi} // İbraz tarihi vade tarihinden önce olamaz
                  onChange={(e) => {
                    const yeniIbrazTarihi = e.target.value;
                    // Sadece geçerli bir tarih girildiğinde güncelle (YYYY-MM-DD formatı)
                    if (yeniIbrazTarihi && yeniIbrazTarihi.length === 10) {
                      setKalem(prev => ({
                        ...prev,
                        cekBilgileri: { ...prev.cekBilgileri!, ibrazTarihi: yeniIbrazTarihi }
                      }));
                    }
                  }}
                  onBlur={(e) => {
                    // Blur'da validasyon yap - kullanıcı input'tan çıktığında
                    const yeniIbrazTarihi = e.target.value;
                    if (yeniIbrazTarihi && yeniIbrazTarihi < kalem.vadeTarihi) {
                      alert("İbraz tarihi, keşide (vade) tarihinden önce olamaz!");
                      // Vade tarihine geri döndür
                      setKalem(prev => ({
                        ...prev,
                        cekBilgileri: { ...prev.cekBilgileri!, ibrazTarihi: prev.vadeTarihi }
                      }));
                    }
                  }}
                  className="w-full border rounded px-1.5 py-0.5 text-xs bg-blue-50"
                />
                {kalem.cekBilgileri.ibrazTarihi !== kalem.vadeTarihi && (
                  <p className="text-[8px] text-blue-600 mt-0.5">
                    Faiz ibraz tarihinden hesaplanacak
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Düzenleme Yeri</label>
                <input
                  type="text"
                  value={kalem.cekBilgileri.duzenlemeYeri}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    cekBilgileri: { ...prev.cekBilgileri!, duzenlemeYeri: e.target.value }
                  }))}
                  placeholder="İstanbul"
                  className="w-full border rounded px-1.5 py-0.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Çek Seri No *</label>
                <input
                  type="text"
                  value={kalem.cekBilgileri.cekSeriNo}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    cekBilgileri: { ...prev.cekBilgileri!, cekSeriNo: e.target.value }
                  }))}
                  placeholder="2068965"
                  className="w-full border rounded px-1.5 py-0.5 text-xs bg-yellow-50"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Hesap No</label>
                <input
                  type="text"
                  value={kalem.cekBilgileri.hesapNo}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    cekBilgileri: { ...prev.cekBilgileri!, hesapNo: e.target.value }
                  }))}
                  className="w-full border rounded px-1.5 py-0.5 text-xs"
                />
              </div>
              <div className="col-span-4">
                <label className="block text-[10px] text-gray-500 mb-0.5">Banka ve Şube *</label>
                <input
                  type="text"
                  value={kalem.cekBilgileri.bankaVeSube}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    cekBilgileri: { ...prev.cekBilgileri!, bankaVeSube: e.target.value }
                  }))}
                  placeholder="Türkiye İş Bankası - Buca/İzmir Şubesi"
                  className="w-full border rounded px-1.5 py-0.5 text-xs bg-yellow-50"
                />
              </div>
            </div>
          </div>
        )}

        {/* Senet Bilgileri */}
        {kalem.kalemTuru === "SENET" && (
          <div className="border rounded p-2 bg-white">
            <h3 className="font-medium text-xs mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3 text-purple-600" />
              Senet / Bono Bilgileri
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Düzenleme Yeri</label>
                <input
                  type="text"
                  value={kalem.senetBilgileri?.duzenlemeYeri || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    senetBilgileri: { ...prev.senetBilgileri, duzenlemeYeri: e.target.value, duzenlemeTarihi: prev.senetBilgileri?.duzenlemeTarihi || "" }
                  }))}
                  placeholder="İstanbul"
                  className="w-full border rounded px-1.5 py-0.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Düzenleme Tarihi</label>
                <input
                  type="date"
                  value={kalem.senetBilgileri?.duzenlemeTarihi || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    senetBilgileri: { ...prev.senetBilgileri, duzenlemeTarihi: e.target.value, duzenlemeYeri: prev.senetBilgileri?.duzenlemeYeri || "" }
                  }))}
                  className="w-full border rounded px-1.5 py-0.5 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* Fatura Bilgileri */}
        {kalem.kalemTuru === "FATURA" && (
          <div className="border rounded p-2 bg-white">
            <h3 className="font-medium text-xs mb-1 flex items-center gap-1">
              <Receipt className="h-3 w-3 text-blue-600" />
              Fatura Bilgileri
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Fatura No</label>
                <input
                  type="text"
                  value={kalem.faturaBilgileri?.faturaNo || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    faturaBilgileri: { ...prev.faturaBilgileri, faturaNo: e.target.value, faturaTarihi: prev.faturaBilgileri?.faturaTarihi || "" }
                  }))}
                  placeholder="FTR-2025-001"
                  className="w-full border rounded px-1.5 py-0.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Fatura Tarihi</label>
                <input
                  type="date"
                  value={kalem.faturaBilgileri?.faturaTarihi || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    faturaBilgileri: { ...prev.faturaBilgileri, faturaTarihi: e.target.value, faturaNo: prev.faturaBilgileri?.faturaNo || "" }
                  }))}
                  className="w-full border rounded px-1.5 py-0.5 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* İlam Bilgileri */}
        {kalem.kalemTuru === "ILAM" && (
          <div className="border rounded p-2 bg-white">
            <h3 className="font-medium text-xs mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3 text-red-600" />
              İlam Bilgileri
            </h3>
            <div className="grid grid-cols-4 gap-1.5">
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-500 mb-0.5">Mahkeme Adı *</label>
                <input
                  type="text"
                  value={kalem.ilamBilgileri?.mahkemeAdi || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    ilamBilgileri: { 
                      ...prev.ilamBilgileri, 
                      mahkemeAdi: e.target.value,
                      esasNo: prev.ilamBilgileri?.esasNo || "",
                      kararNo: prev.ilamBilgileri?.kararNo || "",
                      ilamTarihi: prev.ilamBilgileri?.ilamTarihi || ""
                    }
                  }))}
                  placeholder="İstanbul 1. Asliye Hukuk Mahkemesi"
                  className="w-full border rounded px-1.5 py-0.5 text-xs bg-yellow-50"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Esas No *</label>
                <input
                  type="text"
                  value={kalem.ilamBilgileri?.esasNo || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    ilamBilgileri: { 
                      ...prev.ilamBilgileri, 
                      esasNo: e.target.value,
                      mahkemeAdi: prev.ilamBilgileri?.mahkemeAdi || "",
                      kararNo: prev.ilamBilgileri?.kararNo || "",
                      ilamTarihi: prev.ilamBilgileri?.ilamTarihi || ""
                    }
                  }))}
                  placeholder="2024/123"
                  className="w-full border rounded px-1.5 py-0.5 text-xs bg-yellow-50"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Karar No *</label>
                <input
                  type="text"
                  value={kalem.ilamBilgileri?.kararNo || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    ilamBilgileri: { 
                      ...prev.ilamBilgileri, 
                      kararNo: e.target.value,
                      mahkemeAdi: prev.ilamBilgileri?.mahkemeAdi || "",
                      esasNo: prev.ilamBilgileri?.esasNo || "",
                      ilamTarihi: prev.ilamBilgileri?.ilamTarihi || ""
                    }
                  }))}
                  placeholder="2024/456"
                  className="w-full border rounded px-1.5 py-0.5 text-xs bg-yellow-50"
                />
              </div>
            </div>
          </div>
        )}


        {/* İHTİYATİ HACİZ */}
        <div className="border rounded p-2 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-xs flex items-center gap-1">
              <Shield className="h-3 w-3 text-orange-600" />
              İhtiyati Haciz
            </h3>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={hasIhtiyatiHaciz}
                onChange={(e) => {
                  setHasIhtiyatiHaciz(e.target.checked);
                  if (e.target.checked) {
                    const tumBorclular = debtors.map((_, i) => i);
                    setIhtiyatiHacizKarari(prev => ({ ...prev, seciliBorclular: tumBorclular }));
                  } else {
                    setIhtiyatiHacizMasraflari([]);
                  }
                  if (onPrecautionaryChange) {
                    onPrecautionaryChange({
                      karar: e.target.checked ? ihtiyatiHacizKarari : null,
                      masraflar: e.target.checked ? ihtiyatiHacizMasraflari : [],
                    });
                  }
                }}
                className="w-3 h-3 rounded border-gray-300 text-orange-600"
              />
              <span className="text-[10px] text-gray-500">Bu dosyada ihtiyati haciz kararı var</span>
            </label>
          </div>
          
          {hasIhtiyatiHaciz && (
            <div className="mt-2 pt-2 border-t space-y-1.5">
              <div className="grid grid-cols-5 gap-1.5">
                <div className="col-span-2">
                  <label className="block text-[10px] text-gray-500 mb-0.5">Mahkeme Adı</label>
                  <input
                    type="text"
                    value={ihtiyatiHacizKarari.mahkemeAdi}
                    onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, mahkemeAdi: e.target.value }))}
                    placeholder="İstanbul 1. Asliye Ticaret Mahkemesi"
                    className="w-full border rounded px-1.5 py-0.5 text-[10px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Esas No</label>
                  <input
                    type="text"
                    value={ihtiyatiHacizKarari.esasNo}
                    onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, esasNo: e.target.value }))}
                    placeholder="2025/123 D.İş"
                    className="w-full border rounded px-1.5 py-0.5 text-[10px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Karar No</label>
                  <input
                    type="text"
                    value={ihtiyatiHacizKarari.kararNo}
                    onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, kararNo: e.target.value }))}
                    placeholder="2025/456"
                    className="w-full border rounded px-1.5 py-0.5 text-[10px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Karar Tarihi</label>
                  <input
                    type="date"
                    value={ihtiyatiHacizKarari.kararTarihi}
                    onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, kararTarihi: e.target.value }))}
                    className="w-full border rounded px-1.5 py-0.5 text-[10px]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Kapsadığı Tutar</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ihtiyatiHacizKarari.kapsadigiTutar || ""}
                    onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, kapsadigiTutar: parseFloat(e.target.value) || 0 }))}
                    placeholder="0,00"
                    className="w-full border rounded px-1.5 py-0.5 text-[10px] text-right bg-orange-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Teminat Türü</label>
                  <select
                    value={ihtiyatiHacizKarari.teminatTuru}
                    onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, teminatTuru: e.target.value as any, teminatVar: e.target.value !== "" }))}
                    className="w-full border rounded px-1 py-0.5 text-[10px]"
                  >
                    <option value="">Teminat Yok</option>
                    <option value="NAKIT">Nakit</option>
                    <option value="TEMINAT_MEKTUBU">Teminat Mektubu</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Teminat Oranı (%)</label>
                  <input
                    type="number"
                    step="1"
                    value={ihtiyatiHacizKarari.teminatOrani || ""}
                    onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, teminatOrani: parseFloat(e.target.value) || 0 }))}
                    placeholder="15"
                    disabled={!ihtiyatiHacizKarari.teminatTuru}
                    className="w-full border rounded px-1.5 py-0.5 text-[10px] text-right disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Teminat Tutarı</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ihtiyatiHacizKarari.teminatTutari || ""}
                    onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, teminatTutari: parseFloat(e.target.value) || 0 }))}
                    placeholder="0,00"
                    disabled={!ihtiyatiHacizKarari.teminatTuru}
                    className="w-full border rounded px-1.5 py-0.5 text-[10px] text-right disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">
                    Borçlular {debtors.length > 1 && `(${ihtiyatiHacizKarari.seciliBorclular.length}/${debtors.length})`}
                  </label>
                  {debtors.length <= 1 ? (
                    <div className="text-[10px] text-gray-600 py-0.5 px-1.5 bg-gray-50 border rounded">
                      {debtors[0]?.name || "Borçlu"}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {debtors.map((borclu, index) => (
                        <label key={index} className="flex items-center gap-0.5 cursor-pointer bg-gray-50 px-1 py-0.5 rounded border text-[9px]">
                          <input
                            type="checkbox"
                            checked={ihtiyatiHacizKarari.seciliBorclular.includes(index)}
                            onChange={(e) => {
                              setIhtiyatiHacizKarari(prev => ({
                                ...prev,
                                seciliBorclular: e.target.checked
                                  ? [...prev.seciliBorclular, index]
                                  : prev.seciliBorclular.filter(i => i !== index)
                              }));
                            }}
                            className="w-2.5 h-2.5 rounded border-gray-300"
                          />
                          <span className="truncate max-w-[60px]" title={borclu.name}>
                            {borclu.name?.split(' ')[0] || `Borçlu ${index + 1}`}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SAĞ PANEL - Hesap Özeti */}
      <div className="w-72 border-l pl-2 flex flex-col min-h-[520px]">
        <div className="bg-white pb-1">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="font-medium text-xs flex items-center gap-1">
              <Receipt className="h-3 w-3 text-purple-600" />
              Hesap Özeti
            </h3>
            <input
              type="date"
              value={hesapTarihi}
              onChange={(e) => setHesapTarihi(e.target.value)}
              className="border rounded px-1 py-0.5 text-[10px]"
              title="Hesap Tarihi"
            />
          </div>
          {isCalculated && (
            <p className="text-[10px] text-gray-400">
              Takip: {new Date(takipTarihi).toLocaleDateString('tr-TR')} → Hesap: {new Date(hesapTarihi).toLocaleDateString('tr-TR')}
            </p>
          )}
        </div>

        {!isCalculated ? (
          <div className="flex-1 flex flex-col items-center justify-center py-3 text-gray-500">
            <Calculator className="h-6 w-6 mx-auto mb-1 text-gray-300" />
            <p className="text-[10px]">Tutar girin, otomatik hesaplanacak</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1">
            {/* Çek bilgileri eksikse uyarı */}
            {kalem.kalemTuru === "CEK" && kalem.cekBilgileri && (!kalem.cekBilgileri.cekSeriNo || !kalem.cekBilgileri.bankaVeSube) && (
              <div className="mb-1 p-1.5 bg-amber-50 border border-amber-200 rounded text-[9px] text-amber-700">
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  <span>Çek bilgileri eksik (seri no, banka). Takip talebi için gerekli.</span>
                </div>
              </div>
            )}
            {/* Hesap Özeti Satırları */}
            <div className="flex-1 space-y-0 pr-1 text-[10px]">
            {hesapOzeti.map((satir) => {
              // Bölüm başlıkları - üst çizgi ve arka plan ile vurgula
              const isTakipTutari = satir.key === "takip_tutari";
              const isIcraMasraflari = satir.key === "icra_masraflari";
              const isIhtiyatiHaciz = satir.key === "ihtiyati_haciz_toplam";
              const isToplamBorc = satir.key === "toplam_borc";
              const isSonBorc = satir.key === "son_borc";
              const isVekaletUcreti = satir.key === "vekalet_ucreti";
              const isTakipSonrasiFaiz = satir.key === "takip_sonrasi_faiz";
              
              const isBolumBasligi = isTakipTutari || isIcraMasraflari || isIhtiyatiHaciz || isVekaletUcreti || isTakipSonrasiFaiz || isToplamBorc || isSonBorc;
              const isAltBaslik = ["pesin_harc_dahil_tahsil", "pesin_harc_haric_tahsil"].includes(satir.key);
              
              if (satir.key === "tahsil_0") {
                return (
                  <div key="tahsil_baslik" className="pt-1.5 mt-1.5 border-t-2 border-gray-400">
                    <p className="text-[10px] font-medium text-gray-500 mb-0.5">Tahsil Harcı Oranlarına Göre Son Borç</p>
                    <div className="flex justify-between py-0 text-gray-500">
                      <span>{satir.label}</span>
                      <span>{formatCurrency(satir.tutar, kalem.currency)}</span>
                    </div>
                  </div>
                );
              }

              if (satir.key.startsWith("tahsil_")) {
                return (
                  <div key={satir.key} className="flex justify-between py-0 text-gray-500">
                    <span>{satir.label}</span>
                    <span>{formatCurrency(satir.tutar, kalem.currency)}</span>
                  </div>
                );
              }

              // Takip Tutarı - mavi arka plan
              if (isTakipTutari) {
                return (
                  <div
                    key={satir.key}
                    className="flex justify-between py-1 px-1.5 -mx-1.5 mt-1 border-t-2 border-blue-300 bg-blue-50 rounded"
                  >
                    <span className="font-semibold text-blue-800">TAKİP TUTARI</span>
                    <span className="font-bold text-blue-700">{formatCurrency(satir.tutar, kalem.currency)}</span>
                  </div>
                );
              }

              // İcra Masrafları - gri arka plan
              if (isIcraMasraflari) {
                return (
                  <div
                    key={satir.key}
                    className="flex justify-between py-1 px-1.5 -mx-1.5 mt-1 border-t border-gray-300 bg-gray-100 rounded"
                  >
                    <span className="font-semibold text-gray-700">İCRA MASRAFLARI</span>
                    <span className="font-semibold text-gray-700">{formatCurrency(satir.tutar, kalem.currency)}</span>
                  </div>
                );
              }

              // İhtiyati Haciz Toplam - turuncu arka plan
              if (isIhtiyatiHaciz) {
                return (
                  <div
                    key={satir.key}
                    className="flex justify-between py-1 px-1.5 -mx-1.5 mt-1 border-t border-orange-300 bg-orange-50 rounded"
                  >
                    <span className="font-semibold text-orange-700">İHTİYATİ HACİZ MASRAFLARI</span>
                    <span className="font-semibold text-orange-600">{formatCurrency(satir.tutar, kalem.currency)}</span>
                  </div>
                );
              }

              // Toplam Borç - koyu mavi arka plan
              if (isToplamBorc) {
                return (
                  <div
                    key={satir.key}
                    className="flex justify-between py-1.5 px-1.5 -mx-1.5 mt-1.5 border-t-2 border-blue-400 bg-blue-100 rounded"
                  >
                    <span className="font-bold text-blue-900">TOPLAM BORÇ</span>
                    <span className="font-bold text-blue-800">{formatCurrency(satir.tutar, kalem.currency)}</span>
                  </div>
                );
              }

              // Son Borç - yeşil arka plan (en önemli)
              if (isSonBorc) {
                return (
                  <div
                    key={satir.key}
                    className="flex justify-between py-2 px-1.5 -mx-1.5 mt-1.5 border-t-2 border-green-400 bg-green-100 rounded"
                  >
                    <span className="font-bold text-green-900">SON BORÇ</span>
                    <span className="font-bold text-lg text-green-700">{formatCurrency(satir.tutar, kalem.currency)}</span>
                  </div>
                );
              }

              return (
                <div
                  key={satir.key}
                  className={`flex justify-between py-0 ${
                    isVekaletUcreti || isTakipSonrasiFaiz ? "border-t border-gray-200 pt-0.5 mt-0.5" : ""
                  } ${isAltBaslik ? "text-gray-400" : ""}`}
                >
                  <span className={`${satir.bold ? "font-semibold" : "text-gray-600"}`}>
                    {satir.label} {satir.bold && !["son_borc", "toplam_borc"].includes(satir.key) ? "=" : ""}
                  </span>
                  <span className={`text-right ${
                    satir.color === "green" ? "text-green-600 font-bold" : 
                    satir.color === "blue" ? "text-blue-600 font-semibold" : 
                    satir.color === "orange" ? "text-orange-600 font-semibold" : 
                    satir.bold ? "font-semibold" : ""
                  }`}>
                    {formatCurrency(satir.tutar, kalem.currency)}
                  </span>
                </div>
              );
            })}
            </div>

            {/* FAİZ DÖKÜMÜ PREVIEW PANELİ */}
            {(faizSegmentleri.takipOncesi.length > 0 || faizSegmentleri.takipSonrasi.length > 0) && (
              <div className="mt-1.5 pt-1.5 border-t">
                <button
                  type="button"
                  onClick={() => setFaizDokumuVisible(!faizDokumuVisible)}
                  className="w-full flex items-center justify-between px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded text-[10px] text-blue-700 transition-colors"
                >
                  <span className="flex items-center gap-1">
                    <Calculator className="h-3 w-3" />
                    Faiz Dökümü (Segment Detayı)
                  </span>
                  {faizDokumuVisible ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
                
                {faizDokumuVisible && (
                  <div className="mt-1.5 space-y-2">
                    {/* Takip Öncesi Faiz Segmentleri */}
                    {faizSegmentleri.takipOncesi.length > 0 && (
                      <div className="bg-gray-50 rounded p-1.5">
                        <h5 className="text-[9px] font-medium text-gray-600 mb-1">
                          Takip Öncesi Faiz ({faizSegmentleri.takipOncesi.length} dönem)
                        </h5>
                        <div className="space-y-0.5">
                          {faizSegmentleri.takipOncesi.map((seg, idx) => (
                            <div key={idx} className="grid grid-cols-4 gap-1 text-[8px] text-gray-600 bg-white px-1 py-0.5 rounded">
                              <span>{new Date(seg.baslangic).toLocaleDateString('tr-TR')} - {new Date(seg.bitis).toLocaleDateString('tr-TR')}</span>
                              <span className="text-center">{seg.gun} gün</span>
                              <span className="text-center text-blue-600">%{seg.oran.toFixed(2)}</span>
                              <span className="text-right font-medium">{formatCurrency(seg.faiz, kalem.currency)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-[9px] font-medium text-gray-700 pt-0.5 border-t mt-0.5">
                            <span>Toplam:</span>
                            <span>{formatCurrency(faizSegmentleri.takipOncesi.reduce((t, s) => t + s.faiz, 0), kalem.currency)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Takip Sonrası Faiz Segmentleri */}
                    {faizSegmentleri.takipSonrasi.length > 0 && (
                      <div className="bg-green-50 rounded p-1.5">
                        <h5 className="text-[9px] font-medium text-green-700 mb-1">
                          Takip Sonrası Faiz ({faizSegmentleri.takipSonrasi.length} dönem)
                        </h5>
                        <div className="space-y-0.5">
                          {faizSegmentleri.takipSonrasi.map((seg, idx) => (
                            <div key={idx} className="grid grid-cols-4 gap-1 text-[8px] text-gray-600 bg-white px-1 py-0.5 rounded">
                              <span>{new Date(seg.baslangic).toLocaleDateString('tr-TR')} - {new Date(seg.bitis).toLocaleDateString('tr-TR')}</span>
                              <span className="text-center">{seg.gun} gün</span>
                              <span className="text-center text-green-600">%{seg.oran.toFixed(2)}</span>
                              <span className="text-right font-medium">{formatCurrency(seg.faiz, kalem.currency)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-[9px] font-medium text-green-800 pt-0.5 border-t mt-0.5">
                            <span>Toplam:</span>
                            <span>{formatCurrency(faizSegmentleri.takipSonrasi.reduce((t, s) => t + s.faiz, 0), kalem.currency)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <p className="text-[8px] text-gray-400 italic">
                      * Bu döküm frontend preview hesaplamasıdır. Kesin hesaplama için backend API kullanılır.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Kaydet ve İndirme Butonları */}
            <div className="pt-1.5 mt-1.5 border-t bg-white flex-shrink-0 space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  if (onItemsChange) {
                    onItemsChange([{
                      ...kalem,
                      hesapOzeti: hesapOzeti,
                      isCalculated: true,
                    }]);
                  }
                  alert("Alacak kalemi kaydedildi!");
                }}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 font-medium text-xs"
              >
                <FileText className="h-3 w-3" />
                Kaydet
              </button>
              
              {/* Takip Talebi İndirme Butonları */}
              {isCalculated && hesapOzeti.length > 0 && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem("token");
                        if (!token) {
                          alert('Oturum süresi dolmuş. Lütfen tekrar giriş yapın.');
                          return;
                        }
                        
                        // Creditors verisini düzgün formatla - type'a göre TC veya VKN
                        const formattedCreditors = (creditors || []).map((c: any) => {
                          const isCompany = c.type === 'COMPANY' || c.type === 'TUZEL';
                          return {
                            type: isCompany ? 'COMPANY' : 'INDIVIDUAL',
                            name: isCompany 
                              ? (c.companyName || c.name || c.displayName || '')
                              : (`${c.firstName || ''} ${c.lastName || ''}`.trim() || c.name || ''),
                            // Şahıs için TC, Kurum için VKN
                            identityNo: !isCompany ? (c.tckn || c.identityNo || '') : '',
                            taxNo: isCompany ? (c.vkn || c.taxNo || '') : '',
                            taxOffice: isCompany ? (c.taxOffice || c.vergiDairesi || '') : '',
                            address: c.address || '',
                            city: c.city || '',
                            district: c.district || '',
                          };
                        });
                        
                        // Lawyers verisini düzgün formatla
                        const formattedLawyers = (lawyers || []).map((l: any) => ({
                          name: l.name || `${l.firstName || ''} ${l.lastName || ''}`.trim(),
                          barNumber: l.barNumber || l.baroSicilNo || '',
                          barCity: l.barCity || l.baroIl || '',
                          address: l.address || '',
                          phone: l.phone || '',
                          fax: l.fax || '',
                          bankName: l.bankName || '',
                          branchName: l.branchName || '',
                          iban: l.iban || '',
                        }));
                        
                        // Debtors verisini düzgün formatla - type'a göre TC veya VKN
                        const formattedDebtors = (debtors || []).map((d: any) => {
                          const isCompany = d.type === 'COMPANY' || d.type === 'TUZEL';
                          return {
                            type: isCompany ? 'COMPANY' : 'INDIVIDUAL',
                            name: isCompany 
                              ? (d.companyName || d.name || d.displayName || '')
                              : (`${d.firstName || ''} ${d.lastName || ''}`.trim() || d.name || ''),
                            // Şahıs için TC, Kurum için VKN
                            identityNo: !isCompany ? (d.tckn || d.identityNo || '') : '',
                            taxNo: isCompany ? (d.vkn || d.taxNo || '') : '',
                            taxOffice: isCompany ? (d.taxOffice || d.vergiDairesi || '') : '',
                            address: d.address || '',
                            city: d.city || '',
                            district: d.district || '',
                            role: d.role || 'Borçlu',
                          };
                        });
                        
                        // HesapOzeti'nden claimItems oluştur
                        const claimItems: any[] = [];
                        
                        // Asıl alacak
                        const asilAlacak = hesapOzeti.find(h => h.key === 'asil_alacak');
                        if (asilAlacak && asilAlacak.tutar > 0) {
                          const kalemLabel = kalem.kalemTuru === 'CEK' ? 'Çek alacağı' : 
                                            kalem.kalemTuru === 'SENET' ? 'Senet alacağı' : 
                                            kalem.kalemTuru === 'KIRA' ? 'Kira alacağı' :
                                            kalem.kalemTuru === 'FATURA' ? 'Fatura alacağı' :
                                            kalem.kalemTuru === 'ILAM' ? 'İlam alacağı' :
                                            kalem.aciklama || 'Asıl Alacak';
                          claimItems.push({
                            type: 'PRINCIPAL',
                            description: kalemLabel,
                            amount: asilAlacak.tutar,
                            currency: kalem.currency || 'TRY',
                            dueDate: kalem.vadeTarihi,
                          });
                        }
                        
                        // Takip öncesi faiz
                        const takipOncesiFaiz = hesapOzeti.find(h => h.key === 'takip_oncesi_faiz');
                        if (takipOncesiFaiz && takipOncesiFaiz.tutar > 0) {
                          const faizTuruLabel = kalem.kalemTuru === 'CEK' || kalem.kalemTuru === 'SENET' ? 'TİCARİ' : 'YASAL';
                          claimItems.push({
                            type: 'INTEREST',
                            description: `İşlemiş Faiz (${faizTuruLabel})`,
                            amount: takipOncesiFaiz.tutar,
                            currency: kalem.currency || 'TRY',
                          });
                        }
                        
                        // Çek tazminatı (%10) - sadece çek için
                        const tazminat = hesapOzeti.find(h => h.key === 'tazminat');
                        if (tazminat && tazminat.tutar > 0 && kalem.kalemTuru === 'CEK') {
                          claimItems.push({
                            type: 'COMPENSATION',
                            description: 'Karşılıksız Çek Tazminatı alacağı',
                            amount: tazminat.tutar,
                            currency: kalem.currency || 'TRY',
                            dueDate: kalem.vadeTarihi,
                          });
                        }
                        
                        // Komisyon - çek ve senet için
                        const komisyon = hesapOzeti.find(h => h.key === 'komisyon');
                        if (komisyon && komisyon.tutar > 0) {
                          claimItems.push({
                            type: 'COMMISSION',
                            description: 'Komisyon alacağı',
                            amount: komisyon.tutar,
                            currency: kalem.currency || 'TRY',
                            dueDate: kalem.vadeTarihi,
                          });
                        }
                        
                        // İlamlı takip yan alacakları
                        if (kalem.kalemTuru === 'ILAM') {
                          hesapOzeti.filter(h => h.key.startsWith('yan_alacak_')).forEach(yan => {
                            if (yan.tutar > 0) {
                              claimItems.push({
                                type: 'EXPENSE',
                                description: yan.label,
                                amount: yan.tutar,
                                currency: kalem.currency || 'TRY',
                              });
                            }
                          });
                        }
                        
                        // Toplam
                        const takipTutari = hesapOzeti.find(h => h.key === 'takip_tutari');
                        const totalAmount = takipTutari?.tutar || claimItems.reduce((sum, item) => sum + item.amount, 0);
                        
                        // Faiz türü belirleme - takip tipine göre
                        const faizTuru = kalem.kalemTuru === 'CEK' || kalem.kalemTuru === 'SENET' ? 'TICARI' : 'YASAL';
                        const faizOrani = kalem.kalemTuru === 'CEK' || kalem.kalemTuru === 'SENET' ? 39.75 : 24.00;
                        
                        const templateData = {
                          fileNumber: fileNumber || '',
                          filingDate: takipTarihi,
                          executionOffice: executionOffice || { name: '', city: '' },
                          creditors: formattedCreditors,
                          lawyers: formattedLawyers,
                          debtors: formattedDebtors,
                          claimItems: claimItems,
                          totals: {
                            principal: asilAlacak?.tutar || kalem.bakiyeTutar || 0,
                            interest: takipOncesiFaiz?.tutar || 0,
                            fees: (tazminat?.tutar || 0) + (komisyon?.tutar || 0),
                            total: totalAmount,
                            currency: kalem.currency || 'TRY',
                          },
                          interestInfo: {
                            type: faizTuru,
                            rate: faizOrani,
                            description: `YILLIK %${faizOrani.toFixed(2).replace('.', ',')} (${faizTuru === 'TICARI' ? 'TİCARİ' : 'YASAL'}) değişen oranlarda`,
                            variableRate: true,
                          },
                          caseType: _caseType || 'ILAMSIZ',
                          subCategory: kalem.kalemTuru || 'GENEL',
                          executionPath: 'HACIZ',
                        };
                        
                        console.log('[Word] İstek gönderiliyor:', templateData);
                        
                        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/template-engine/takip-talebi/word`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          body: JSON.stringify(templateData),
                        });
                        
                        console.log('[Word] Response status:', response.status);
                        
                        if (!response.ok) {
                          const errorText = await response.text();
                          console.error('[Word] Hata:', errorText);
                          throw new Error(`Word oluşturulamadı: ${response.status} - ${errorText}`);
                        }
                        
                        const blob = await response.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `takip-talebi-${fileNumber || 'belge'}.docx`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch (err: any) {
                        console.error('Word indirme hatası:', err);
                        alert(`Word dosyası oluşturulamadı: ${err.message}`);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-[10px]"
                  >
                    <FileText className="h-3 w-3" />
                    Word
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem("token");
                        if (!token) {
                          alert('Oturum süresi dolmuş. Lütfen tekrar giriş yapın.');
                          return;
                        }
                        
                        // Creditors verisini düzgün formatla
                        const formattedCreditors = (creditors || []).map((c: any) => ({
                          type: c.type || 'COMPANY',
                          name: c.companyName || c.name || c.displayName || '',
                          identityNo: c.tckn || c.identityNo || '',
                          taxNo: c.vkn || c.taxNo || '',
                          address: c.address || '',
                          city: c.city || '',
                          district: c.district || '',
                        }));
                        
                        // Lawyers verisini düzgün formatla
                        const formattedLawyers = (lawyers || []).map((l: any) => ({
                          name: l.name || `${l.firstName || ''} ${l.lastName || ''}`.trim(),
                          barNumber: l.barNumber || l.baroSicilNo || '',
                          barCity: l.barCity || l.baroIl || '',
                          address: l.address || '',
                          phone: l.phone || '',
                          fax: l.fax || '',
                          bankName: l.bankName || '',
                          branchName: l.branchName || '',
                          iban: l.iban || '',
                        }));
                        
                        // Debtors verisini düzgün formatla
                        const formattedDebtors = (debtors || []).map((d: any) => ({
                          type: d.type || 'COMPANY',
                          name: d.companyName || d.name || d.displayName || `${d.firstName || ''} ${d.lastName || ''}`.trim(),
                          identityNo: d.tckn || d.identityNo || '',
                          taxNo: d.vkn || d.taxNo || '',
                          address: d.address || '',
                          city: d.city || '',
                          district: d.district || '',
                          role: d.role || 'Borçlu',
                        }));
                        
                        const templateData = {
                          fileNumber: fileNumber || '',
                          filingDate: takipTarihi,
                          executionOffice: executionOffice || { name: '', city: '' },
                          creditors: formattedCreditors,
                          lawyers: formattedLawyers,
                          debtors: formattedDebtors,
                          claimItems: [{
                            type: kalem.kalemTuru || 'PRINCIPAL',
                            description: kalem.aciklama || 'Asıl Alacak',
                            amount: kalem.bakiyeTutar || 0,
                            currency: kalem.currency || 'TRY',
                            dueDate: kalem.vadeTarihi,
                          }],
                          totals: {
                            principal: kalem.bakiyeTutar || 0,
                            interest: hesapOzeti.find(h => h.key === 'takip_oncesi_faiz')?.tutar || 0,
                            fees: hesapOzeti.find(h => h.key === 'icra_masraflari')?.tutar || 0,
                            total: hesapOzeti.find(h => h.key === 'son_borc')?.tutar || 0,
                            currency: kalem.currency || 'TRY',
                          },
                          interestInfo: {
                            type: 'YASAL',
                            description: 'Değişen oranlarda faiz',
                            variableRate: true,
                          },
                          caseType: _caseType || 'ILAMSIZ',
                          subCategory: kalem.kalemTuru || 'GENEL',
                          executionPath: 'HACIZ',
                        };
                        
                        console.log('[PDF] İstek gönderiliyor:', templateData);
                        
                        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/template-engine/takip-talebi/pdf`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          body: JSON.stringify(templateData),
                        });
                        
                        console.log('[PDF] Response status:', response.status);
                        
                        if (!response.ok) {
                          const errorText = await response.text();
                          console.error('[PDF] Hata:', errorText);
                          throw new Error(`PDF oluşturulamadı: ${response.status} - ${errorText}`);
                        }
                        
                        const blob = await response.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `takip-talebi-${fileNumber || 'belge'}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch (err: any) {
                        console.error('PDF indirme hatası:', err);
                        alert(`PDF dosyası oluşturulamadı: ${err.message}`);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-[10px]"
                  >
                    <FileText className="h-3 w-3" />
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem("token");
                        if (!token) {
                          alert('Oturum süresi dolmuş. Lütfen tekrar giriş yapın.');
                          return;
                        }
                        
                        // Creditors verisini düzgün formatla
                        const formattedCreditors = (creditors || []).map((c: any) => ({
                          type: c.type || 'COMPANY',
                          name: c.companyName || c.name || c.displayName || '',
                          identityNo: c.tckn || c.identityNo || '',
                          taxNo: c.vkn || c.taxNo || '',
                          address: c.address || '',
                          city: c.city || '',
                          district: c.district || '',
                        }));
                        
                        // Lawyers verisini düzgün formatla
                        const formattedLawyers = (lawyers || []).map((l: any) => ({
                          name: l.name || `${l.firstName || ''} ${l.lastName || ''}`.trim(),
                          barNumber: l.barNumber || l.baroSicilNo || '',
                          barCity: l.barCity || l.baroIl || '',
                          address: l.address || '',
                          phone: l.phone || '',
                          fax: l.fax || '',
                          bankName: l.bankName || '',
                          branchName: l.branchName || '',
                          iban: l.iban || '',
                        }));
                        
                        // Debtors verisini düzgün formatla
                        const formattedDebtors = (debtors || []).map((d: any) => ({
                          type: d.type || 'COMPANY',
                          name: d.companyName || d.name || d.displayName || `${d.firstName || ''} ${d.lastName || ''}`.trim(),
                          identityNo: d.tckn || d.identityNo || '',
                          taxNo: d.vkn || d.taxNo || '',
                          address: d.address || '',
                          city: d.city || '',
                          district: d.district || '',
                          role: d.role || 'Borçlu',
                        }));
                        
                        const templateData = {
                          fileNumber: fileNumber || '',
                          filingDate: takipTarihi,
                          executionOffice: executionOffice || { name: '', city: '' },
                          creditors: formattedCreditors,
                          lawyers: formattedLawyers,
                          debtors: formattedDebtors,
                          claimItems: [{
                            type: kalem.kalemTuru || 'PRINCIPAL',
                            description: kalem.aciklama || 'Asıl Alacak',
                            amount: kalem.bakiyeTutar || 0,
                            currency: kalem.currency || 'TRY',
                            dueDate: kalem.vadeTarihi,
                          }],
                          totals: {
                            principal: kalem.bakiyeTutar || 0,
                            interest: hesapOzeti.find(h => h.key === 'takip_oncesi_faiz')?.tutar || 0,
                            fees: hesapOzeti.find(h => h.key === 'icra_masraflari')?.tutar || 0,
                            total: hesapOzeti.find(h => h.key === 'son_borc')?.tutar || 0,
                            currency: kalem.currency || 'TRY',
                          },
                          interestInfo: {
                            type: 'YASAL',
                            description: 'Değişen oranlarda faiz',
                            variableRate: true,
                          },
                          caseType: _caseType || 'ILAMSIZ',
                          subCategory: kalem.kalemTuru || 'GENEL',
                          executionPath: 'HACIZ',
                        };
                        
                        console.log('[XML] İstek gönderiliyor:', templateData);
                        
                        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/template-engine/takip-talebi/xml`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          body: JSON.stringify(templateData),
                        });
                        
                        console.log('[XML] Response status:', response.status);
                        
                        if (!response.ok) {
                          const errorText = await response.text();
                          console.error('[XML] Hata:', errorText);
                          throw new Error(`XML oluşturulamadı: ${response.status} - ${errorText}`);
                        }
                        
                        const blob = await response.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `takip-talebi-${fileNumber || 'belge'}.xml`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch (err: any) {
                        console.error('XML indirme hatası:', err);
                        alert(`XML dosyası oluşturulamadı: ${err.message}`);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-[10px]"
                  >
                    <FileText className="h-3 w-3" />
                    XML
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfessionalClaimItemForm;
