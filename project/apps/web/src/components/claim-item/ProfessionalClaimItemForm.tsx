"use client";

import { useState } from "react";
import {
  Calculator,
  Receipt,
  FileText,
  CreditCard,
  Download,
  FileDown,
  Send,
  Shield,
  AlertTriangle,
  Plus,
  Trash2,
} from "lucide-react";
import { api, TemplateData } from "@/lib/api";

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
    tazminatOrani: 0.10,      // %10 çek tazminatı
    komisyonOrani: 0.003,     // %0.3 komisyon
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
    label: "İlamlı Takip",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: "ilamBilgileri"
  },
  FATURA: {
    label: "Fatura Alacağı",
    faizTuru: "TICARI",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: "faturaBilgileri"
  },
  NAFAKA: {
    label: "Nafaka",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null,
    donemsel: true
  },
  ASIL_ALACAK: {
    label: "Genel Alacak",
    faizTuru: "YASAL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: null
  },
  ISCI_ALACAGI: {
    label: "İşçi Alacağı",
    faizTuru: "BANKA_TL",
    tazminatOrani: 0,
    komisyonOrani: 0,
    zorunluAlanlar: ["tutar", "vadeTarihi"],
    ekBilgiler: "isciAlacagiBilgileri"
  }
};

// Para birimleri
const CURRENCY_OPTIONS = [
  { value: "TRY", label: "TL", symbol: "₺" },
  { value: "USD", label: "USD", symbol: "$" },
  { value: "EUR", label: "EUR", symbol: "€" },
  { value: "GBP", label: "GBP", symbol: "£" },
  { value: "CHF", label: "CHF", symbol: "CHF" },
];

// Faiz türleri
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
  toplamTutar: number;      // Evraktaki asıl tutar
  bakiyeTutar: number;      // Takipte istenen tutar
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
  };
  // Fatura bilgileri
  faturaBilgileri?: {
    faturaNo: string;
    faturaTarihi: string;
  };
}

// Hesap özeti satırı
interface HesapOzetiSatir {
  key: string;
  label: string;
  tutar: number;
  bold?: boolean;
  color?: string;
}

// İhtiyati Haciz Kararı
interface IhtiyatiHacizKarari {
  mahkemeAdi: string;
  kararTarihi: string;
  esasNo: string;
  kararNo: string;
  kapsadigiTutar: number;
  teminatVar: boolean;
  teminatTuru: "NAKIT" | "TEMINAT_MEKTUBU" | "";
  teminatTutari: number;
  durum: "DRAFT" | "DECIDED" | "APPLIED" | "LIFTED";
}

// İhtiyati Haciz Masrafı
interface IhtiyatiHacizMasrafi {
  id: string;
  tur: "HARC" | "POSTA" | "VEKALET" | "TEMINAT" | "YEDIEMIN" | "DIGER";
  aciklama: string;
  tutar: number;
}

const IHTIYATI_HACIZ_MASRAF_TURLERI = [
  { value: "HARC", label: "İhtiyati Haciz Harcı" },
  { value: "POSTA", label: "Tebligat/Posta Gideri" },
  { value: "VEKALET", label: "Vekalet Ücreti" },
  { value: "TEMINAT", label: "Teminat Masrafı" },
  { value: "YEDIEMIN", label: "Yediemin Ücreti" },
  { value: "DIGER", label: "Diğer" },
];

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
  // Belge oluşturma için gerekli veriler
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

// Avukatlık Asgari Ücret Tarifesi 2025 - İcra Takipleri
const hesaplaVekaletUcreti = (takipTutari: number): number => {
  // Kademeli tarife
  const tarifeler = [
    { min: 0, max: 55000, fixed: 11000, rate: 0 },
    { min: 55000, max: 130000, fixed: 11000, rate: 0.14 },
    { min: 130000, max: 390000, fixed: 21500, rate: 0.12 },
    { min: 390000, max: 780000, fixed: 52700, rate: 0.08 },
    { min: 780000, max: 1950000, fixed: 83900, rate: 0.04 },
    { min: 1950000, max: Infinity, fixed: 130700, rate: 0.01 },
  ];
  
  // Minimum ücret
  const minimum = 11000;
  
  // Uygun kademeyi bul
  for (const tarife of tarifeler) {
    if (takipTutari <= tarife.max) {
      const ucret = tarife.fixed + ((takipTutari - tarife.min) * tarife.rate);
      return Math.max(ucret, minimum);
    }
  }
  
  // En yüksek kademe
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
  
  // Takip tipine göre varsayılan kalem türünü belirle
  const getDefaultKalemTuru = () => {
    if (takipTuruCode === "KAMBIYO_CEK") return "CEK";
    if (takipTuruCode === "KAMBIYO_SENET") return "SENET";
    if (takipTuruCode === "ILAMSIZ_KIRA" || takipTuruCode === "KIRA") return "KIRA";
    if (takipTuruCode === "ILAMLI") return "ILAM";
    if (takipTuruCode === "NAFAKA") return "NAFAKA";
    if (documentSource === "KAMBIYO") return "CEK";
    if (documentSource === "ILAM") return "ILAM";
    return "ASIL_ALACAK";
  };

  const [kalem, setKalem] = useState<AlacakKalemi>(() => 
    createEmptyKalem(getDefaultKalemTuru(), currency)
  );
  const [hesapOzeti, setHesapOzeti] = useState<HesapOzetiSatir[]>([]);
  const [isCalculated, setIsCalculated] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

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
    durum: "DRAFT",
  });
  const [ihtiyatiHacizMasraflari, setIhtiyatiHacizMasraflari] = useState<IhtiyatiHacizMasrafi[]>([]);

  // Template data oluştur
  const buildTemplateData = (): TemplateData => {
    const config = TAKIP_TIPI_CONFIG[kalem.kalemTuru] || TAKIP_TIPI_CONFIG.ASIL_ALACAK;
    const takipOncesiFaiz = hesaplaFaiz(kalem.bakiyeTutar, kalem.takipOncesiFaiz, kalem.vadeTarihi, takipTarihi);
    const tazminat = config.tazminatOrani > 0 ? kalem.bakiyeTutar * config.tazminatOrani : 0;
    const komisyon = config.komisyonOrani > 0 ? kalem.bakiyeTutar * config.komisyonOrani : 0;
    
    const claimItems = [
      { type: 'PRINCIPAL', description: config.label, amount: kalem.bakiyeTutar, currency: kalem.currency },
    ];
    
    if (tazminat > 0) {
      claimItems.push({ type: 'PENALTY', description: 'Karşılıksız Çek Tazminatı (%10)', amount: tazminat, currency: kalem.currency });
    }
    if (komisyon > 0) {
      claimItems.push({ type: 'COMMISSION', description: 'Komisyon', amount: komisyon, currency: kalem.currency });
    }
    if (takipOncesiFaiz > 0) {
      claimItems.push({ type: 'INTEREST', description: 'Takip Öncesi Faiz', amount: takipOncesiFaiz, currency: kalem.currency });
    }

    const principal = kalem.bakiyeTutar + tazminat + komisyon;
    const interest = takipOncesiFaiz;
    const fees = 615.40 + 87.50 + (principal * 0.005) + 2 + (15 * borcluSayisi) + 138;

    return {
      fileNumber: fileNumber || `DOSYA-${Date.now()}`,
      filingDate: takipTarihi,
      executionOffice: executionOffice || { name: 'İcra Müdürlüğü', city: 'İstanbul' },
      creditors: creditors.length > 0 ? creditors : [{ type: 'INDIVIDUAL', name: 'Alacaklı', address: '' }],
      lawyers: lawyers.length > 0 ? lawyers : [{ name: 'Avukat', barNumber: '', barCity: '' }],
      debtors: debtors.length > 0 ? debtors : [{ type: 'INDIVIDUAL', name: 'Borçlu', address: '' }],
      claimItems,
      totals: {
        principal,
        interest,
        fees,
        total: principal + interest + fees,
        currency: kalem.currency,
      },
      interestInfo: {
        type: config.faizTuru === 'TICARI' ? 'TICARI' : 'YASAL',
        description: config.faizTuru === 'TICARI' ? 'değişen oranlarda ticari faizi ile birlikte' : 'yasal faizi ile birlikte',
        variableRate: true,
      },
      caseType: takipTuruCode || 'ILAMSIZ',
      subCategory: kalem.kalemTuru,
      executionPath: 'HACIZ',
      sourceDocument: kalem.kalemTuru === 'CEK' && kalem.cekBilgileri ? {
        type: 'CEK',
        number: kalem.cekBilgileri.cekSeriNo,
        date: kalem.vadeTarihi,
        bank: kalem.cekBilgileri.bankaVeSube,
      } : undefined,
    };
  };

  // PDF indir
  const handleDownloadPdf = async () => {
    if (!isCalculated) {
      alert('Önce hesaplama yapın');
      return;
    }
    setDownloading('pdf');
    try {
      const templateData = buildTemplateData();
      const blob = await api.downloadTakipTalebiPdf(templateData);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `takip-talebi-${fileNumber || 'belge'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('PDF indirme hatası:', error);
      alert('PDF indirme hatası');
    } finally {
      setDownloading(null);
    }
  };

  // Word indir
  const handleDownloadWord = async () => {
    if (!isCalculated) {
      alert('Önce hesaplama yapın');
      return;
    }
    setDownloading('word');
    try {
      const templateData = buildTemplateData();
      const blob = await api.downloadTakipTalebiWord(templateData);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `takip-talebi-${fileNumber || 'belge'}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Word indirme hatası:', error);
      alert('Word indirme hatası');
    } finally {
      setDownloading(null);
    }
  };

  // UDF oluştur (UYAP için)
  const handleGenerateUdf = async () => {
    if (!isCalculated) {
      alert('Önce hesaplama yapın');
      return;
    }
    setDownloading('udf');
    try {
      const templateData = buildTemplateData();
      const udfDocument = await api.generateTakipTalebiUdf(templateData);
      // UDF dosyasını indir
      const blob = new Blob([JSON.stringify(udfDocument, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `takip-talebi-${fileNumber || 'belge'}.udf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      alert('UDF dosyası oluşturuldu. UYAP\'a yükleyebilirsiniz.');
    } catch (error) {
      console.error('UDF oluşturma hatası:', error);
      alert('UDF oluşturma hatası');
    } finally {
      setDownloading(null);
    }
  };

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

  // Zorunlu alanların dolu olup olmadığını kontrol et
  const checkZorunluAlanlar = (): { valid: boolean; eksikAlanlar: string[] } => {
    const config = TAKIP_TIPI_CONFIG[kalem.kalemTuru] || TAKIP_TIPI_CONFIG.ASIL_ALACAK;
    const eksikAlanlar: string[] = [];

    if (!kalem.bakiyeTutar || kalem.bakiyeTutar <= 0) eksikAlanlar.push("Bakiye Tutar");
    if (!kalem.vadeTarihi) eksikAlanlar.push("Vade Tarihi");

    if (kalem.kalemTuru === "CEK" && kalem.cekBilgileri) {
      if (!kalem.cekBilgileri.cekSeriNo) eksikAlanlar.push("Çek Seri No");
      if (!kalem.cekBilgileri.bankaVeSube) eksikAlanlar.push("Banka ve Şube");
    }

    return { valid: eksikAlanlar.length === 0, eksikAlanlar };
  };

  // Hesap özetini hesapla
  const hesapla = () => {
    const validation = checkZorunluAlanlar();
    if (!validation.valid) {
      alert(`Eksik alanlar: ${validation.eksikAlanlar.join(", ")}`);
      return;
    }

    const config = TAKIP_TIPI_CONFIG[kalem.kalemTuru] || TAKIP_TIPI_CONFIG.ASIL_ALACAK;
    const today = new Date().toISOString().split("T")[0];
    const satirlar: HesapOzetiSatir[] = [];

    // 1. Asıl Alacak
    satirlar.push({
      key: "asil_alacak",
      label: config.label,
      tutar: kalem.bakiyeTutar,
    });

    // 2. Çek Tazminatı (sadece çek için)
    if (config.tazminatOrani > 0) {
      const tazminat = kalem.bakiyeTutar * config.tazminatOrani;
      satirlar.push({
        key: "tazminat",
        label: "Karşılıksız Çek Tazminatı (%10)",
        tutar: tazminat,
      });
    }

    // 3. Komisyon
    if (config.komisyonOrani > 0) {
      const komisyon = kalem.bakiyeTutar * config.komisyonOrani;
      satirlar.push({
        key: "komisyon",
        label: "Komisyon",
        tutar: komisyon,
      });
    }

    // 4. Takip Öncesi Faiz
    const takipOncesiFaiz = hesaplaFaiz(
      kalem.bakiyeTutar,
      kalem.takipOncesiFaiz,
      kalem.vadeTarihi,
      takipTarihi
    );
    if (takipOncesiFaiz > 0) {
      satirlar.push({
        key: "takip_oncesi_faiz",
        label: "Takip Öncesi Faiz",
        tutar: takipOncesiFaiz,
      });
    }

    // 5. Takip Tutarı (ara toplam)
    const takipTutari = satirlar.reduce((sum, s) => sum + s.tutar, 0);
    satirlar.push({
      key: "takip_tutari",
      label: "TAKİP TUTARI",
      tutar: takipTutari,
      bold: true,
      color: "blue",
    });

    // 6. İcra Masrafları (Fee Engine'den gelecek - şimdilik sabit)
    const basvurmaHarci = 615.40;
    const vekaletHarci = 82.50;
    const pesinHarc = takipTutari * 0.005; // Binde 5
    const dosyaGideri = 2.00;
    const tebligatGideri = 15.00 * borcluSayisi; // Her borçlu için ayrı tebligat
    const pul = 130.00;
    const icraMasraflari = basvurmaHarci + vekaletHarci + pesinHarc + dosyaGideri + tebligatGideri + pul;

    satirlar.push({ key: "basvurma_harci", label: "Başvurma Harcı", tutar: basvurmaHarci });
    satirlar.push({ key: "vekalet_harci", label: "Vekalet Harcı", tutar: vekaletHarci });
    satirlar.push({ key: "pesin_harc", label: "Peşin Harç", tutar: pesinHarc });
    satirlar.push({ key: "dosya_gideri", label: "Dosya Gideri", tutar: dosyaGideri });
    satirlar.push({ key: "tebligat_gideri", label: `Tebligat Gideri (${borcluSayisi} borçlu)`, tutar: tebligatGideri });
    satirlar.push({ key: "pul", label: "Pul", tutar: pul });
    satirlar.push({
      key: "icra_masraflari",
      label: "İCRA MASRAFLARI",
      tutar: icraMasraflari,
      bold: true,
    });

    // 6.5 İhtiyati Haciz Masrafları (varsa)
    let ihtiyatiHacizToplam = 0;
    if (hasIhtiyatiHaciz && ihtiyatiHacizMasraflari.length > 0) {
      ihtiyatiHacizMasraflari.forEach((masraf, index) => {
        satirlar.push({
          key: `ihtiyati_haciz_${index}`,
          label: masraf.aciklama,
          tutar: masraf.tutar,
        });
        ihtiyatiHacizToplam += masraf.tutar;
      });
      satirlar.push({
        key: "ihtiyati_haciz_toplam",
        label: "İHTİYATİ HACİZ MASRAFLARI",
        tutar: ihtiyatiHacizToplam,
        bold: true,
        color: "orange",
      });
    }

    // 7. Vekalet Ücreti (2025 Avukatlık Asgari Ücret Tarifesi)
    const vekaletUcreti = hesaplaVekaletUcreti(takipTutari);
    satirlar.push({
      key: "vekalet_ucreti",
      label: "Vekalet Ücreti",
      tutar: vekaletUcreti,
    });

    // 8. Takip Sonrası Faiz
    const takipSonrasiFaiz = hesaplaFaiz(
      kalem.bakiyeTutar,
      kalem.takipSonrasiFaiz,
      takipTarihi,
      today
    );
    satirlar.push({
      key: "takip_sonrasi_faiz",
      label: "Takip Sonrası Faiz",
      tutar: takipSonrasiFaiz,
    });

    // 9. Toplam Borç (ihtiyati haciz masrafları dahil)
    const toplamBorc = takipTutari + icraMasraflari + ihtiyatiHacizToplam + vekaletUcreti + takipSonrasiFaiz;
    satirlar.push({
      key: "toplam_borc",
      label: "TOPLAM BORÇ TUTARI",
      tutar: toplamBorc,
      bold: true,
      color: "green",
    });

    // 10. Tahsil Harcı Oranlarına Göre
    const tahsilOranlari = [0, 0.0227, 0.0455, 0.0910, 0.1138];
    tahsilOranlari.forEach((oran, index) => {
      const sonBorc = toplamBorc * (1 + oran);
      satirlar.push({
        key: `tahsil_${index}`,
        label: `%${(oran * 100).toFixed(2)} Tahsil Harcı`,
        tutar: sonBorc,
        color: index === 0 ? undefined : "gray",
      });
    });

    setHesapOzeti(satirlar);
    setIsCalculated(true);

    // Parent'a bildir
    if (onItemsChange) {
      onItemsChange([{
        ...kalem,
        hesapOzeti: satirlar,
      }]);
    }
  };


  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="h-full flex gap-4">
      {/* SOL PANEL - Alacak Kalemi Formu */}
      <div className="flex-1 space-y-4 overflow-y-auto">
        {/* Borcun Sebebi */}
        <div className="border rounded-xl p-4 bg-white">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Alacak Bilgileri
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Borcun Sebebi */}
            <div>
              <label className="block text-sm font-medium mb-1">Borcun Sebebi</label>
              <select
                value={kalem.kalemTuru}
                onChange={(e) => handleKalemTuruChange(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 bg-yellow-50 font-medium"
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

            {/* Para Birimi */}
            <div>
              <label className="block text-sm font-medium mb-1">Para Birimi</label>
              <select
                value={kalem.currency}
                onChange={(e) => setKalem(prev => ({ ...prev, currency: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              >
                {CURRENCY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Vade/Keşide Tarihi */}
            <div>
              <label className="block text-sm font-medium mb-1">Vade/Keşide Tarihi *</label>
              <input
                type="date"
                value={kalem.vadeTarihi}
                onChange={(e) => {
                  setKalem(prev => ({ ...prev, vadeTarihi: e.target.value }));
                  setIsCalculated(false);
                }}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>

            {/* Boş alan */}
            <div></div>

            {/* Toplam Tutar */}
            <div>
              <label className="block text-sm font-medium mb-1">Toplam Tutar (Evraktaki)</label>
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
                  setIsCalculated(false);
                }}
                placeholder="0,00"
                className="w-full border rounded-lg px-3 py-2 text-right font-medium"
              />
            </div>

            {/* Bakiye Tutar */}
            <div>
              <label className="block text-sm font-medium mb-1">Bakiye Tutar (Takipte İstenen) *</label>
              <input
                type="number"
                step="0.01"
                value={kalem.bakiyeTutar || ""}
                onChange={(e) => {
                  setKalem(prev => ({ ...prev, bakiyeTutar: parseFloat(e.target.value) || 0 }));
                  setIsCalculated(false);
                }}
                placeholder="0,00"
                className="w-full border rounded-lg px-3 py-2 text-right font-medium bg-blue-50"
              />
              {kalem.toplamTutar > 0 && kalem.bakiyeTutar < kalem.toplamTutar && (
                <p className="text-xs text-orange-600 mt-1">
                  Kısmi takip: {formatCurrency(kalem.toplamTutar - kalem.bakiyeTutar)} tahsil edilmiş
                </p>
              )}
            </div>

            {/* Açıklama */}
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Açıklama</label>
              <textarea
                value={kalem.aciklama}
                onChange={(e) => setKalem(prev => ({ ...prev, aciklama: e.target.value }))}
                placeholder="Borç hakkında ek açıklama (opsiyonel)..."
                rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Örn: Kısmi ödeme yapıldı, bakiye alacak takibe konulmuştur.
              </p>
            </div>
          </div>

          {/* Faiz Ayarları */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Uygulanacak Faiz ve Ücretler</h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={kalem.hesaplanmisFaiz}
                  onChange={(e) => setKalem(prev => ({ ...prev, hesaplanmisFaiz: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">Hesaplanmış Faiz</span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Takip Öncesi Faiz</label>
                <select
                  value={kalem.takipOncesiFaiz}
                  onChange={(e) => {
                    setKalem(prev => ({ ...prev, takipOncesiFaiz: e.target.value }));
                    setIsCalculated(false);
                  }}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  {FAIZ_TURU_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Takip Sonrası Faiz</label>
                <select
                  value={kalem.takipSonrasiFaiz}
                  onChange={(e) => {
                    setKalem(prev => ({ ...prev, takipSonrasiFaiz: e.target.value }));
                    setIsCalculated(false);
                  }}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  {FAIZ_TURU_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Çek Bilgileri (sadece çek için) */}
        {kalem.kalemTuru === "CEK" && kalem.cekBilgileri && (
          <div className="border rounded-xl p-4 bg-white">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-green-600" />
              Çek Bilgileri
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">İbraz Tarihi</label>
                <input
                  type="date"
                  value={kalem.cekBilgileri.ibrazTarihi}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    cekBilgileri: { ...prev.cekBilgileri!, ibrazTarihi: e.target.value }
                  }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Düzenleme Yeri</label>
                <input
                  type="text"
                  value={kalem.cekBilgileri.duzenlemeYeri}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    cekBilgileri: { ...prev.cekBilgileri!, duzenlemeYeri: e.target.value }
                  }))}
                  placeholder="İstanbul"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Çek Seri No *</label>
                <input
                  type="text"
                  value={kalem.cekBilgileri.cekSeriNo}
                  onChange={(e) => {
                    setKalem(prev => ({
                      ...prev,
                      cekBilgileri: { ...prev.cekBilgileri!, cekSeriNo: e.target.value }
                    }));
                    setIsCalculated(false);
                  }}
                  placeholder="2068965"
                  className="w-full border rounded-lg px-3 py-2 bg-yellow-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Hesap No</label>
                <input
                  type="text"
                  value={kalem.cekBilgileri.hesapNo}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    cekBilgileri: { ...prev.cekBilgileri!, hesapNo: e.target.value }
                  }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Banka ve Şube *</label>
                <input
                  type="text"
                  value={kalem.cekBilgileri.bankaVeSube}
                  onChange={(e) => {
                    setKalem(prev => ({
                      ...prev,
                      cekBilgileri: { ...prev.cekBilgileri!, bankaVeSube: e.target.value }
                    }));
                    setIsCalculated(false);
                  }}
                  placeholder="Türkiye İş Bankası - Buca/İzmir Şubesi"
                  className="w-full border rounded-lg px-3 py-2 bg-yellow-50"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Çeki İmzalayanlar</label>
                <input
                  type="text"
                  value={kalem.cekBilgileri.cekiImzalayanlar}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    cekBilgileri: { ...prev.cekBilgileri!, cekiImzalayanlar: e.target.value }
                  }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            </div>
          </div>
        )}

        {/* Senet Bilgileri (sadece senet için) */}
        {kalem.kalemTuru === "SENET" && (
          <div className="border rounded-xl p-4 bg-white">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-600" />
              Senet / Bono Bilgileri
            </h3>
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded mb-4">
              ℹ️ Senet bilgileri dosya oluşturulduktan sonra detaylı olarak eklenebilir.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Düzenleme Yeri</label>
                <input
                  type="text"
                  value={kalem.senetBilgileri?.duzenlemeYeri || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    senetBilgileri: { ...prev.senetBilgileri, duzenlemeYeri: e.target.value, duzenlemeTarihi: prev.senetBilgileri?.duzenlemeTarihi || "" }
                  }))}
                  placeholder="İstanbul"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Düzenleme Tarihi</label>
                <input
                  type="date"
                  value={kalem.senetBilgileri?.duzenlemeTarihi || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    senetBilgileri: { ...prev.senetBilgileri, duzenlemeTarihi: e.target.value, duzenlemeYeri: prev.senetBilgileri?.duzenlemeYeri || "" }
                  }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            </div>
          </div>
        )}

        {/* Fatura Bilgileri (sadece fatura için) */}
        {kalem.kalemTuru === "FATURA" && (
          <div className="border rounded-xl p-4 bg-white">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-600" />
              Fatura Bilgileri
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Fatura No</label>
                <input
                  type="text"
                  value={kalem.faturaBilgileri?.faturaNo || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    faturaBilgileri: { ...prev.faturaBilgileri, faturaNo: e.target.value, faturaTarihi: prev.faturaBilgileri?.faturaTarihi || "" }
                  }))}
                  placeholder="FTR-2025-001"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fatura Tarihi</label>
                <input
                  type="date"
                  value={kalem.faturaBilgileri?.faturaTarihi || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    faturaBilgileri: { ...prev.faturaBilgileri, faturaTarihi: e.target.value, faturaNo: prev.faturaBilgileri?.faturaNo || "" }
                  }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            </div>
          </div>
        )}

        {/* İlam Bilgileri (sadece ilam için) */}
        {kalem.kalemTuru === "ILAM" && (
          <div className="border rounded-xl p-4 bg-white">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-red-600" />
              İlam Bilgileri
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Mahkeme Adı *</label>
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
                  className="w-full border rounded-lg px-3 py-2 bg-yellow-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Esas No *</label>
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
                  className="w-full border rounded-lg px-3 py-2 bg-yellow-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Karar No *</label>
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
                  className="w-full border rounded-lg px-3 py-2 bg-yellow-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">İlam Tarihi *</label>
                <input
                  type="date"
                  value={kalem.ilamBilgileri?.ilamTarihi || ""}
                  onChange={(e) => setKalem(prev => ({
                    ...prev,
                    ilamBilgileri: { 
                      ...prev.ilamBilgileri, 
                      ilamTarihi: e.target.value,
                      mahkemeAdi: prev.ilamBilgileri?.mahkemeAdi || "",
                      esasNo: prev.ilamBilgileri?.esasNo || "",
                      kararNo: prev.ilamBilgileri?.kararNo || ""
                    }
                  }))}
                  className="w-full border rounded-lg px-3 py-2 bg-yellow-50"
                />
              </div>
            </div>
          </div>
        )}

        {/* İHTİYATİ HACİZ BÖLÜMÜ */}
        <div className="border rounded-xl p-4 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-orange-600" />
              İhtiyati Haciz
            </h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasIhtiyatiHaciz}
                onChange={(e) => {
                  setHasIhtiyatiHaciz(e.target.checked);
                  if (!e.target.checked) {
                    setIhtiyatiHacizMasraflari([]);
                  }
                  if (onPrecautionaryChange) {
                    onPrecautionaryChange({
                      karar: e.target.checked ? ihtiyatiHacizKarari : null,
                      masraflar: e.target.checked ? ihtiyatiHacizMasraflari : [],
                    });
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm">Bu dosyada ihtiyati haciz kararı var</span>
            </label>
          </div>

          {hasIhtiyatiHaciz && (
            <div className="space-y-4">
              {/* İhtiyati Haciz Kararı Bilgileri */}
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <h4 className="text-sm font-medium text-orange-800 mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  İhtiyati Haciz Kararı
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">Mahkeme Adı *</label>
                    <input
                      type="text"
                      value={ihtiyatiHacizKarari.mahkemeAdi}
                      onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, mahkemeAdi: e.target.value }))}
                      placeholder="İstanbul 1. Asliye Ticaret Mahkemesi"
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Karar Tarihi *</label>
                    <input
                      type="date"
                      value={ihtiyatiHacizKarari.kararTarihi}
                      onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, kararTarihi: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Kapsadığı Tutar</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ihtiyatiHacizKarari.kapsadigiTutar || ""}
                      onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, kapsadigiTutar: parseFloat(e.target.value) || 0 }))}
                      placeholder="0,00"
                      className="w-full border rounded px-2 py-1.5 text-sm text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Esas No</label>
                    <input
                      type="text"
                      value={ihtiyatiHacizKarari.esasNo}
                      onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, esasNo: e.target.value }))}
                      placeholder="2025/123 D.İş"
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Karar No</label>
                    <input
                      type="text"
                      value={ihtiyatiHacizKarari.kararNo}
                      onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, kararNo: e.target.value }))}
                      placeholder="2025/456"
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-4 pt-2 border-t">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ihtiyatiHacizKarari.teminatVar}
                        onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, teminatVar: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm">Teminat yatırıldı</span>
                    </label>
                    {ihtiyatiHacizKarari.teminatVar && (
                      <>
                        <select
                          value={ihtiyatiHacizKarari.teminatTuru}
                          onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, teminatTuru: e.target.value as any }))}
                          className="border rounded px-2 py-1 text-sm"
                        >
                          <option value="">Tür seçin</option>
                          <option value="NAKIT">Nakit</option>
                          <option value="TEMINAT_MEKTUBU">Teminat Mektubu</option>
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          value={ihtiyatiHacizKarari.teminatTutari || ""}
                          onChange={(e) => setIhtiyatiHacizKarari(prev => ({ ...prev, teminatTutari: parseFloat(e.target.value) || 0 }))}
                          placeholder="Tutar"
                          className="w-32 border rounded px-2 py-1 text-sm text-right"
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* İhtiyati Haciz Masrafları */}
              <div className="bg-gray-50 rounded-lg p-4 border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-700">İhtiyati Haciz Masrafları</h4>
                  <button
                    type="button"
                    onClick={() => {
                      const yeniMasraf: IhtiyatiHacizMasrafi = {
                        id: `ihm_${Date.now()}`,
                        tur: "HARC",
                        aciklama: "İhtiyati Haciz Harcı",
                        tutar: 0,
                      };
                      setIhtiyatiHacizMasraflari(prev => [...prev, yeniMasraf]);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                  >
                    <Plus className="h-3 w-3" />
                    Masraf Ekle
                  </button>
                </div>

                {ihtiyatiHacizMasraflari.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">
                    Henüz masraf eklenmedi. "Masraf Ekle" butonuna tıklayın.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {ihtiyatiHacizMasraflari.map((masraf, index) => (
                      <div key={masraf.id} className="flex items-center gap-2 bg-white p-2 rounded border">
                        <select
                          value={masraf.tur}
                          onChange={(e) => {
                            const yeniTur = e.target.value as IhtiyatiHacizMasrafi["tur"];
                            const label = IHTIYATI_HACIZ_MASRAF_TURLERI.find(t => t.value === yeniTur)?.label || "";
                            setIhtiyatiHacizMasraflari(prev => prev.map((m, i) => 
                              i === index ? { ...m, tur: yeniTur, aciklama: label } : m
                            ));
                          }}
                          className="border rounded px-2 py-1 text-xs flex-1"
                        >
                          {IHTIYATI_HACIZ_MASRAF_TURLERI.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          value={masraf.tutar || ""}
                          onChange={(e) => {
                            setIhtiyatiHacizMasraflari(prev => prev.map((m, i) => 
                              i === index ? { ...m, tutar: parseFloat(e.target.value) || 0 } : m
                            ));
                          }}
                          placeholder="Tutar"
                          className="w-28 border rounded px-2 py-1 text-xs text-right"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIhtiyatiHacizMasraflari(prev => prev.filter((_, i) => i !== index));
                          }}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t text-sm font-medium">
                      <span>Toplam İhtiyati Haciz Masrafı:</span>
                      <span className="text-orange-600">
                        {formatCurrency(ihtiyatiHacizMasraflari.reduce((sum, m) => sum + m.tutar, 0), kalem.currency)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Hesapla Butonu */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={hesapla}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            <Calculator className="h-5 w-5" />
            Hesapla
          </button>
        </div>
      </div>


      {/* SAĞ PANEL - Hesap Özeti */}
      <div className="w-96 border-l pl-4 flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <div className="bg-white pb-2">
          <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
            <Receipt className="h-5 w-5 text-purple-600" />
            Hesap Özeti
          </h3>
        </div>

        {!isCalculated ? (
          <div className="text-center py-8 text-gray-500">
            <Calculator className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">Zorunlu alanları doldurup</p>
            <p className="text-sm">"Hesapla" butonuna basın</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1">
            {/* Hesap Özeti Satırları - Scroll edilebilir */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-2" style={{ maxHeight: '300px' }}>
            {hesapOzeti.map((satir) => {
              // Bölüm başlıkları
              const isBolumBasligi = ["takip_tutari", "icra_masraflari", "ihtiyati_haciz_toplam", "toplam_borc"].includes(satir.key);
              
              // Tahsil harcı bölümü başlığı
              if (satir.key === "tahsil_0") {
                return (
                  <div key="tahsil_baslik" className="pt-3 mt-3 border-t">
                    <p className="text-xs font-medium text-gray-500 mb-2">Tahsil Harcı Oranlarına Göre Son Borç:</p>
                    <div className={`flex justify-between py-1 ${satir.bold ? "font-bold" : ""}`}>
                      <span className="text-sm">{satir.label}</span>
                      <span className={`text-sm ${satir.color === "green" ? "text-green-600" : satir.color === "blue" ? "text-blue-600" : ""}`}>
                        {formatCurrency(satir.tutar, kalem.currency)}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={satir.key}
                  className={`flex justify-between py-1 ${
                    isBolumBasligi ? "border-t pt-2 mt-2" : ""
                  } ${satir.bold ? "font-bold" : ""} ${
                    satir.color === "gray" ? "text-gray-500" : ""
                  }`}
                >
                  <span className={`text-sm ${satir.bold ? "" : "text-gray-600"}`}>
                    {satir.label}
                  </span>
                  <span className={`text-sm ${
                    satir.color === "green" ? "text-green-600 font-bold" : 
                    satir.color === "blue" ? "text-blue-600" : 
                    satir.color === "orange" ? "text-orange-600" : ""
                  }`}>
                    {formatCurrency(satir.tutar, kalem.currency)}
                  </span>
                </div>
              );
            })}
            </div>

            {/* Kaydet ve Belge Butonları - Her zaman görünür */}
            <div className="pt-4 mt-4 border-t bg-white flex-shrink-0">
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
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-base"
              >
                <FileText className="h-5 w-5" />
                Kaydet
              </button>

              {/* Belge İndirme Butonları */}
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-medium text-gray-600 mb-2">Takip Talebi İndir:</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={downloading !== null}
                    className="flex flex-col items-center gap-1 px-2 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 text-xs"
                  >
                    <FileDown className="h-4 w-4 text-red-600" />
                    <span>{downloading === 'pdf' ? '...' : 'PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadWord}
                    disabled={downloading !== null}
                    className="flex flex-col items-center gap-1 px-2 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 text-xs"
                  >
                    <Download className="h-4 w-4 text-blue-600" />
                    <span>{downloading === 'word' ? '...' : 'Word'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateUdf}
                    disabled={downloading !== null}
                    className="flex flex-col items-center gap-1 px-2 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 text-xs"
                    title="UYAP'a gönderim için UDF formatı"
                  >
                    <Send className="h-4 w-4 text-purple-600" />
                    <span>{downloading === 'udf' ? '...' : 'UDF'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfessionalClaimItemForm;
