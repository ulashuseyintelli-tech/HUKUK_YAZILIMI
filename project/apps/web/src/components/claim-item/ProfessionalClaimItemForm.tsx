"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { api, TemplateData } from "@/lib/api";
import { LimitationBanner, LimitationStatus } from "@/components/limitation/LimitationWarningModal";

// ============================================================================
// TAKİP TİPİ KONFİGÜRASYONU
// ============================================================================
interface TakipTipiConfig {
  label: string;
  faizTuru: string;
  tazminatOrani: number;
  komisyonOrani: number;
  zorunluAlanlar: string[];
  ekBilgiler: string | null;
  donemsel?: boolean;
}

const TAKIP_TIPI_CONFIG: Record<string, TakipTipiConfig> = {
  CEK: {
    label: "Çek",
    faizTuru: "TICARI",
    tazminatOrani: 0.10,
    komisyonOrani: 0.003,
    zorunluAlanlar: ["tutar", "vadeTarihi", "cekSeriNo", "bankaVeSube"],
    ekBilgiler: "cekBilgileri"
  },
  SENET: {
    label: "Senet/Bono",
    faizTuru: "TICARI",
    tazminatOrani: 0,
    komisyonOrani: 0.003,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: "senetBilgileri"
  },
  KIRA: {
    label: "Kira Alacağı",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null,
    donemsel: true
  },
  ILAM: {
    label: "İlam Asıl Alacağı",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: "ilamBilgileri"
  },
  // İLAM YAN ALACAK KALEMLERİ
  ILAM_ISLEMIS_FAIZ: {
    label: "İşlemiş Faiz (Dava-İlam Arası)",
    faizTuru: "YOK", // Kendi içinde faiz işlemez
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar"],
    ekBilgiler: null
  },
  ILAM_YARGILAMA_GIDERI: {
    label: "Yargılama Giderleri",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar"],
    ekBilgiler: null
  },
  ILAM_VEKALET_UCRETI: {
    label: "Karşı Taraf Vekalet Ücreti",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar"],
    ekBilgiler: null
  },
  // NAFAKA ÖZEL KALEMLERİ
  NAFAKA_BIRIKIMIS: {
    label: "Birikmiş Nafaka",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null,
    donemsel: true
  },
  NAFAKA_ISLEYECEK: {
    label: "İşleyecek Nafaka",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar"],
    ekBilgiler: null,
    donemsel: true
  },
  FATURA: {
    label: "Fatura Alacağı",
    faizTuru: "TICARI",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: "faturaBilgileri"
  },
  ASIL_ALACAK: {
    label: "Genel Alacak",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null
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
  { value: "YOK", label: "Faiz Yok", rate: 0 },
  { value: "TICARI", label: "Ticari (%48)", rate: 48 },
  { value: "YASAL", label: "Yasal (%24)", rate: 24 },
  { value: "BANKA_TL", label: "Banka TL (%50)", rate: 50 },
  { value: "KAMU_BANKA_TL", label: "Kamu Bankası TL (%45)", rate: 45 },
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
const hesaplaFaiz = (tutar: number, faizTuru: string, baslangic: string, bitis: string): number => {
  if (!tutar || !baslangic || !bitis || faizTuru === "YOK") return 0;
  const faizOption = FAIZ_TURU_OPTIONS.find(f => f.value === faizTuru);
  const rate = faizOption?.rate || 0;
  if (rate === 0) return 0;
  const startDate = new Date(baslangic);
  const endDate = new Date(bitis);
  const days = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
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
}: Props) {
  
  const getDefaultKalemTuru = () => {
    // Önce takipTuruCode'a göre kontrol et
    if (takipTuruCode === "KAMBIYO_CEK") return "CEK";
    if (takipTuruCode === "KAMBIYO_SENET") return "SENET";
    if (takipTuruCode === "ILAMSIZ_KIRA" || takipTuruCode === "KIRA") return "KIRA";
    if (takipTuruCode === "ILAMLI") return "ILAM";
    if (takipTuruCode === "NAFAKA") return "NAFAKA";
    if (takipTuruCode === "ILAMSIZ_GENEL" || takipTuruCode === "ILAMSIZ_FATURA") return "FATURA";
    
    // Sonra documentSource'a göre kontrol et
    if (documentSource === "KAMBIYO") return "CEK";
    if (documentSource === "ILAM") return "ILAM";
    if (documentSource === "SOZLESME") return "FATURA"; // Sözleşme/Fatura için FATURA döndür
    
    return "ASIL_ALACAK";
  };

  const [kalem, setKalem] = useState<AlacakKalemi>(() => createEmptyKalem(getDefaultKalemTuru(), currency));
  const [hesapOzeti, setHesapOzeti] = useState<HesapOzetiSatir[]>([]);
  const [isCalculated, setIsCalculated] = useState(false);
  const [hesapTarihi, setHesapTarihi] = useState<string>(new Date().toISOString().split("T")[0]);

  // Zamanaşımı durumu
  const [limitationStatus, setLimitationStatus] = useState<LimitationStatus | null>(null);
  const [checkingLimitation, setCheckingLimitation] = useState(false);

  // Faiz başlangıç tarihi seçimi (ilamsız takipler için)
  // "TAKIP" = Takip tarihi (varsayılan, güvenli), "VADE" = Vade tarihi (riskli ama mümkün)
  const [faizBaslangicTercih, setFaizBaslangicTercih] = useState<"TAKIP" | "VADE">("TAKIP");

  // İlamlı Takip Yan Alacak Kalemleri
  const [ilamYanAlacaklar, setIlamYanAlacaklar] = useState<IlamYanAlacak[]>([]);

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
    const isIlamsizTakip = ["FATURA", "ASIL_ALACAK", "KIRA"].includes(kalem.kalemTuru);
    let takipOncesiFaiz = 0;
    
    if (isIlamsizTakip && faizBaslangicTercih === "TAKIP") {
      // Takip tarihinden başlat - takip öncesi faiz yok
      takipOncesiFaiz = 0;
    } else {
      // Vade tarihinden başlat (veya ilamlı/kambiyo takipleri)
      takipOncesiFaiz = hesaplaFaiz(kalem.bakiyeTutar, kalem.takipOncesiFaiz, kalem.vadeTarihi, takipTarihi);
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
    const takipSonrasiFaiz = hesaplaFaiz(kalem.bakiyeTutar, kalem.takipSonrasiFaiz, takipTarihi, hesapTarihi);
    satirlar.push({ key: "takip_sonrasi_faiz", label: "Takip Sonrası Faiz", tutar: takipSonrasiFaiz, bold: true });

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
  }, [kalem.bakiyeTutar, kalem.vadeTarihi, kalem.takipOncesiFaiz, kalem.takipSonrasiFaiz, kalem.kalemTuru, hesapTarihi, kalem.cekBilgileri?.cekSeriNo, kalem.cekBilgileri?.bankaVeSube, faizBaslangicTercih, hesapla]);

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
    <div className="h-full flex gap-2">
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
                <option value="CEK">Çek</option>
                <option value="SENET">Senet / Bono</option>
                <option value="FATURA">Fatura</option>
                <option value="KIRA">Kira Alacağı</option>
                <option value="ILAM">İlam</option>
                <option value="NAFAKA">Nafaka</option>
                <option value="ASIL_ALACAK">Genel Alacak</option>
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
                onChange={(e) => setKalem(prev => ({ ...prev, vadeTarihi: e.target.value }))}
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
                <label className="block text-[10px] text-gray-500 mb-0.5">İbraz Tarihi</label>
                <input
                  type="date"
                  value={kalem.cekBilgileri.ibrazTarihi}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    cekBilgileri: { ...prev.cekBilgileri!, ibrazTarihi: e.target.value }
                  }))}
                  className="w-full border rounded px-1.5 py-0.5 text-xs"
                />
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
      <div className="w-72 border-l pl-2 flex flex-col">
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
              const isBolumBasligi = ["takip_tutari", "icra_masraflari", "ihtiyati_haciz_toplam", "vekalet_ucreti", "takip_sonrasi_faiz", "toplam_borc", "son_borc"].includes(satir.key);
              const isAltBaslik = ["pesin_harc_dahil_tahsil", "pesin_harc_haric_tahsil"].includes(satir.key);
              
              if (satir.key === "tahsil_0") {
                return (
                  <div key="tahsil_baslik" className="pt-1 mt-1 border-t border-gray-300">
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

              return (
                <div
                  key={satir.key}
                  className={`flex justify-between py-0 ${
                    isBolumBasligi ? "border-t border-gray-200 pt-0.5 mt-0.5" : ""
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

            {/* Kaydet Butonu */}
            <div className="pt-1.5 mt-1.5 border-t bg-white flex-shrink-0">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfessionalClaimItemForm;
