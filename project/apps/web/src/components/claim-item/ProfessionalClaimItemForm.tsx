"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Calculator,
  Percent,
  Receipt,
  FileText,
  Banknote,
  Building2,
  Calendar,
  CreditCard,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Upload,
  Wand2,
  Edit2,
  Users,
  Link2,
} from "lucide-react";

// Kalem türleri (tablo için)
const KALEM_TURU_OPTIONS = [
  { value: "ASIL_ALACAK", label: "Asıl Alacak", category: "PRINCIPAL" },
  { value: "CEK", label: "Asıl Alacak (Çek)", category: "PRINCIPAL" },
  { value: "SENET", label: "Asıl Alacak (Senet)", category: "PRINCIPAL" },
  { value: "FATURA", label: "Asıl Alacak (Fatura)", category: "PRINCIPAL" },
  { value: "KIRA", label: "Kira Alacağı", category: "PRINCIPAL" },
  { value: "ILAM", label: "İlam Alacağı", category: "PRINCIPAL" },
  { value: "NAFAKA", label: "Nafaka", category: "PRINCIPAL" },
  { value: "ISLEMIS_FAIZ", label: "İşlemiş Faiz", category: "INTEREST" },
  { value: "CEK_TAZMINATI", label: "Çek Tazminatı (%10)", category: "PENALTY" },
  { value: "KOMISYON", label: "Komisyon", category: "EXPENSE" },
  { value: "IHTIYATI_HACIZ_HARCI", label: "İhtiyati Haciz Harcı", category: "EXPENSE" },
  { value: "IHTIYATI_VEKALET", label: "İhtiyati Haciz Vekalet Ücreti", category: "FEE" },
  { value: "VEKALET_UCRETI", label: "Vekalet Ücreti", category: "FEE" },
  { value: "KDV", label: "KDV", category: "TAX" },
  { value: "BSMV", label: "BSMV", category: "TAX" },
  { value: "KKDF", label: "KKDF", category: "TAX" },
  { value: "DIGER", label: "Diğer", category: "OTHER" },
];

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
  { value: "YOK", label: "—", rate: 0, description: "Faiz yok" },
  { value: "TICARI", label: "Ticari", rate: 48, description: "Ticari işlerde uygulanan faiz" },
  { value: "YASAL", label: "Yasal", rate: 24, description: "Yasal faiz oranı" },
  { value: "BANKA_TL", label: "Banka (TL)", rate: 50, description: "TL mevduat faizi" },
  { value: "KAMU_BANKA_TL", label: "Kamu Bankası (TL)", rate: 45, description: "Kamu bankası TL faizi" },
  { value: "KAMU_BANKA_USD", label: "Kamu Bankası (USD)", rate: 5, description: "Kamu bankası USD faizi" },
  { value: "KAMU_BANKA_EUR", label: "Kamu Bankası (EUR)", rate: 4, description: "Kamu bankası EUR faizi" },
];

// Sorumlu borçlu seçenekleri
const SORUMLU_OPTIONS = [
  { value: "TUM_BORCLU", label: "Tüm Borçlular" },
  { value: "SECILI", label: "Seçili Borçlular" },
];

// Kur kuralı seçenekleri (döviz için)
const KUR_KURALI_OPTIONS = [
  { value: "TAKIP_TARIHI", label: "Takip Tarihindeki Kur" },
  { value: "FIILI_ODEME", label: "Fiili Ödeme Tarihindeki Kur" },
];

// Ay isimleri
const AY_ISIMLERI = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

interface ClaimItem {
  id: string;
  kalemTuru: string;
  tutar: number;
  currency: string;
  vadeTarihi: string;
  faizTuru: string;
  faizBaslangic: string;
  faizBitis: string;
  hesaplananFaiz: number;
  sorumluBorclular: string;
  kaynakEvrak: string;
  aciklama: string;
  // Dönem bilgisi (kira/nafaka için)
  donemAy?: number; // 0-11
  donemYil?: number;
  // Kur kuralı (döviz için)
  kurKurali?: string;
  // Çek bilgileri (sadece çek için)
  cekBilgileri?: {
    ibrazTarihi: string;
    duzenlemeYeri: string;
    cekSeriNo: string;
    hesapNo: string;
    bankaVeSube: string;
    cekiImzalayanlar: string;
  };
}

interface Props {
  caseType?: string;
  formCode?: string;
  currency?: string;
  takipTuruCode?: string;
  documentSource?: "ILAM" | "KAMBIYO" | "SOZLESME" | "VEKALETNAME" | null;
  onItemsChange?: (items: ClaimItem[]) => void;
  initialItems?: ClaimItem[];
}

// Takip türüne göre varsayılan kalem seti
const TAKIP_TURU_DEFAULTS: Record<string, { kalemTuru: string; faizTuru: string; ekKalemler: string[] }> = {
  KAMBIYO_CEK: { kalemTuru: "CEK", faizTuru: "TICARI", ekKalemler: ["ISLEMIS_FAIZ", "CEK_TAZMINATI", "KOMISYON"] },
  KAMBIYO_SENET: { kalemTuru: "SENET", faizTuru: "TICARI", ekKalemler: ["ISLEMIS_FAIZ"] },
  ILAMSIZ_KAMBIYO: { kalemTuru: "SENET", faizTuru: "TICARI", ekKalemler: ["ISLEMIS_FAIZ"] },
  ILAMLI: { kalemTuru: "ILAM", faizTuru: "YASAL", ekKalemler: [] },
  ILAMSIZ_GENEL: { kalemTuru: "ASIL_ALACAK", faizTuru: "YASAL", ekKalemler: [] },
  ILAMSIZ_KIRA: { kalemTuru: "KIRA", faizTuru: "YASAL", ekKalemler: [] },
  KIRA: { kalemTuru: "KIRA", faizTuru: "YASAL", ekKalemler: [] },
  NAFAKA: { kalemTuru: "NAFAKA", faizTuru: "YASAL", ekKalemler: [] },
  REHIN_TASINIR: { kalemTuru: "ASIL_ALACAK", faizTuru: "TICARI", ekKalemler: [] },
  REHIN_TASINMAZ: { kalemTuru: "ASIL_ALACAK", faizTuru: "TICARI", ekKalemler: [] },
};

// Faiz hesaplama fonksiyonu
const hesaplaFaiz = (tutar: number, faizTuru: string, baslangic: string, bitis: string): number => {
  if (!tutar || !baslangic || faizTuru === "YOK") return 0;
  const faizOption = FAIZ_TURU_OPTIONS.find(f => f.value === faizTuru);
  const rate = faizOption?.rate || 0;
  if (rate === 0) return 0;
  const startDate = new Date(baslangic);
  const endDate = new Date(bitis || new Date());
  const days = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  const dailyRate = rate / 365 / 100;
  return Math.round(tutar * dailyRate * days * 100) / 100;
};

// Gün sayısı hesaplama
const hesaplaGunSayisi = (baslangic: string, bitis: string): number => {
  if (!baslangic || !bitis) return 0;
  const startDate = new Date(baslangic);
  const endDate = new Date(bitis);
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
};

const createEmptyItem = (currency = "TRY", kalemTuru = "ASIL_ALACAK", faizTuru = "YASAL"): ClaimItem => {
  const today = new Date().toISOString().split("T")[0];
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    kalemTuru,
    tutar: 0,
    currency,
    vadeTarihi: today,
    faizTuru: kalemTuru === "ISLEMIS_FAIZ" ? faizTuru : "YOK",
    faizBaslangic: today,
    faizBitis: today,
    hesaplananFaiz: 0,
    sorumluBorclular: "TUM_BORCLU",
    kaynakEvrak: "",
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

// Varsayılan değerleri hesapla
function getDefaultsFromProps(
  takipTuruCode?: string,
  documentSource?: string | null,
  formCode?: string
): { kalemTuru: string; faizTuru: string; ekKalemler: string[] } {
  if (takipTuruCode && TAKIP_TURU_DEFAULTS[takipTuruCode]) {
    return TAKIP_TURU_DEFAULTS[takipTuruCode];
  }
  if (documentSource === "KAMBIYO") {
    return { kalemTuru: "SENET", faizTuru: "TICARI", ekKalemler: ["ISLEMIS_FAIZ"] };
  }
  if (documentSource === "ILAM") {
    return { kalemTuru: "ILAM", faizTuru: "YASAL", ekKalemler: [] };
  }
  return { kalemTuru: "ASIL_ALACAK", faizTuru: "YASAL", ekKalemler: [] };
}

export function ProfessionalClaimItemForm({ 
  caseType, 
  formCode, 
  currency = "TRY", 
  takipTuruCode,
  documentSource,
  onItemsChange, 
  initialItems 
}: Props) {
  const initialDefaults = getDefaultsFromProps(takipTuruCode, documentSource, formCode);
  
  const [items, setItems] = useState<ClaimItem[]>(
    initialItems || [createEmptyItem(currency, initialDefaults.kalemTuru, initialDefaults.faizTuru)]
  );
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showCekModal, setShowCekModal] = useState<string | null>(null);
  const [appliedTakipTuruCode, setAppliedTakipTuruCode] = useState<string | undefined>(takipTuruCode);
  
  // Takip sonrası faiz kuralı
  const [takipSonrasiFaiz, setTakipSonrasiFaiz] = useState({
    faizTuru: initialDefaults.faizTuru,
    degiskenOran: true,
    baslangic: new Date().toISOString().split("T")[0],
  });

  // takipTuruCode değiştiğinde güncelle
  useEffect(() => {
    if (!takipTuruCode || takipTuruCode === appliedTakipTuruCode) return;
    
    const hasUserData = items.length > 1 || (items.length === 1 && items[0].tutar > 0);
    if (hasUserData) {
      setAppliedTakipTuruCode(takipTuruCode);
      return;
    }

    const newDefaults = getDefaultsFromProps(takipTuruCode, documentSource, formCode);
    const newItem = createEmptyItem(currency, newDefaults.kalemTuru, newDefaults.faizTuru);
    setItems([newItem]);
    setTakipSonrasiFaiz(prev => ({ ...prev, faizTuru: newDefaults.faizTuru }));
    setAppliedTakipTuruCode(takipTuruCode);
  }, [takipTuruCode, appliedTakipTuruCode, documentSource, formCode, currency, items]);

  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  // Ana alacak toplamını hesapla (memo)
  const asilAlacakToplamMemo = items
    .filter(i => ["ASIL_ALACAK", "CEK", "SENET", "FATURA", "KIRA", "ILAM", "NAFAKA"].includes(i.kalemTuru))
    .reduce((sum, i) => sum + i.tutar, 0);

  // Faiz kalemlerini güncelle fonksiyonu
  const guncelleOtomatikFaizler = useCallback(() => {
    if (asilAlacakToplamMemo <= 0) return;
    
    setItems(prev => {
      let changed = false;
      const updated = prev.map(item => {
        if (item.kalemTuru === "ISLEMIS_FAIZ" && item.tutar === 0) {
          const yeniFaiz = hesaplaFaiz(asilAlacakToplamMemo, item.faizTuru, item.faizBaslangic, item.faizBitis);
          if (yeniFaiz !== item.hesaplananFaiz) {
            changed = true;
            return { ...item, hesaplananFaiz: yeniFaiz };
          }
        }
        return item;
      });
      return changed ? updated : prev;
    });
  }, [asilAlacakToplamMemo]);

  // Ana alacak değiştiğinde faizleri güncelle
  useEffect(() => {
    guncelleOtomatikFaizler();
  }, [guncelleOtomatikFaizler]);

  const updateItem = (id: string, updates: Partial<ClaimItem>) => {
    setItems(prev => {
      // Önce ana alacak toplamını hesapla (faiz hesabı için)
      const currentAsilAlacak = prev
        .filter(i => ["ASIL_ALACAK", "CEK", "SENET", "FATURA", "KIRA", "ILAM", "NAFAKA"].includes(i.kalemTuru))
        .reduce((sum, i) => sum + i.tutar, 0);
      
      return prev.map(item => {
        if (item.id !== id) return item;
        
        const newItem = { ...item, ...updates };
        
        // Vade tarihi değiştiğinde faiz başlangıcını güncelle
        if (updates.vadeTarihi && !updates.faizBaslangic) {
          newItem.faizBaslangic = updates.vadeTarihi;
        }
        
        // Faiz hesapla (faiz türü olan kalemler için)
        if (newItem.faizTuru !== "YOK" && newItem.kalemTuru === "ISLEMIS_FAIZ") {
          // Faiz kalemi için ana alacak üzerinden hesapla
          const bazTutar = newItem.tutar > 0 ? newItem.tutar : currentAsilAlacak;
          newItem.hesaplananFaiz = hesaplaFaiz(
            bazTutar,
            newItem.faizTuru,
            newItem.faizBaslangic,
            newItem.faizBitis
          );
        }
        
        // Çek seçildiğinde çek bilgilerini ekle
        if (updates.kalemTuru === "CEK" && !item.cekBilgileri) {
          newItem.cekBilgileri = {
            ibrazTarihi: newItem.vadeTarihi,
            duzenlemeYeri: "",
            cekSeriNo: "",
            hesapNo: "",
            bankaVeSube: "",
            cekiImzalayanlar: "",
          };
        }
        
        return newItem;
      });
    });
  };

  const addItem = (kalemTuru?: string) => {
    const defaults = getDefaultsFromProps(takipTuruCode, documentSource, formCode);
    const newItem = createEmptyItem(
      currency, 
      kalemTuru || defaults.kalemTuru, 
      kalemTuru === "ISLEMIS_FAIZ" ? defaults.faizTuru : "YOK"
    );
    
    // Çek tazminatı ekleniyorsa, mevcut çek tutarının %10'unu otomatik hesapla
    if (kalemTuru === "CEK_TAZMINATI") {
      const cekToplam = items
        .filter(i => i.kalemTuru === "CEK")
        .reduce((sum, i) => sum + i.tutar, 0);
      if (cekToplam > 0) {
        newItem.tutar = Math.round(cekToplam * 0.10 * 100) / 100;
        newItem.aciklama = "Karşılıksız çek tazminatı (%10)";
      }
    }
    
    setItems(prev => [...prev, newItem]);
    setEditingItemId(newItem.id);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(item => item.id !== id));
    if (editingItemId === id) setEditingItemId(null);
  };

  const duplicateItem = (id: string) => {
    const itemToDuplicate = items.find(item => item.id === id);
    if (!itemToDuplicate) return;
    const newItem: ClaimItem = {
      ...itemToDuplicate,
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    setItems(prev => [...prev, newItem]);
  };

  // Otomatik kalem oluştur (OCR sonrası)
  const otomatikKalemOlustur = () => {
    const defaults = getDefaultsFromProps(takipTuruCode, documentSource, formCode);
    const yeniKalemler: ClaimItem[] = [];
    
    // Ana alacak
    yeniKalemler.push(createEmptyItem(currency, defaults.kalemTuru, "YOK"));
    
    // Ek kalemler
    defaults.ekKalemler.forEach(ek => {
      const faiz = ek === "ISLEMIS_FAIZ" ? defaults.faizTuru : "YOK";
      yeniKalemler.push(createEmptyItem(currency, ek, faiz));
    });
    
    setItems(yeniKalemler);
  };

  // Kira/Nafaka dönemsel kalem üretici
  const [showDonemModal, setShowDonemModal] = useState(false);
  const [donemSecim, setDonemSecim] = useState({
    baslangicAy: new Date().getMonth(),
    baslangicYil: new Date().getFullYear(),
    bitisAy: new Date().getMonth(),
    bitisYil: new Date().getFullYear(),
    aylikTutar: 0,
    kalemTuru: takipTuruCode === "NAFAKA" ? "NAFAKA" : "KIRA",
  });

  const donemselKalemOlustur = () => {
    const yeniKalemler: ClaimItem[] = [];
    let ay = donemSecim.baslangicAy;
    let yil = donemSecim.baslangicYil;
    
    while (yil < donemSecim.bitisYil || (yil === donemSecim.bitisYil && ay <= donemSecim.bitisAy)) {
      const vadeTarihi = new Date(yil, ay, 1).toISOString().split("T")[0];
      const item = createEmptyItem(currency, donemSecim.kalemTuru, "YOK");
      item.tutar = donemSecim.aylikTutar;
      item.vadeTarihi = vadeTarihi;
      item.donemAy = ay;
      item.donemYil = yil;
      item.aciklama = `${AY_ISIMLERI[ay]} ${yil} ${donemSecim.kalemTuru === "NAFAKA" ? "Nafaka" : "Kira"}`;
      yeniKalemler.push(item);
      
      ay++;
      if (ay > 11) {
        ay = 0;
        yil++;
      }
    }
    
    setItems(prev => [...prev.filter(i => i.kalemTuru !== "KIRA" && i.kalemTuru !== "NAFAKA"), ...yeniKalemler]);
    setShowDonemModal(false);
  };

  // Döviz kontrolü
  const isDoviz = currency !== "TRY";
  const [kurKurali, setKurKurali] = useState("FIILI_ODEME");

  // Ana alacak toplamı (faiz hesabı için baz)
  const asilAlacakToplam = items
    .filter(i => ["ASIL_ALACAK", "CEK", "SENET", "FATURA", "KIRA", "ILAM", "NAFAKA"].includes(i.kalemTuru))
    .reduce((sum, i) => sum + i.tutar, 0);

  // Toplam hesaplamaları
  const toplamlar = {
    asilAlacak: asilAlacakToplam,
    islemisFaiz: items.filter(i => i.kalemTuru === "ISLEMIS_FAIZ").reduce((sum, i) => {
      // Faiz kaleminde tutar girilmişse onu kullan, yoksa hesaplanan faizi kullan
      return sum + (i.tutar > 0 ? i.tutar : i.hesaplananFaiz);
    }, 0),
    masraf: items.filter(i => ["KOMISYON", "IHTIYATI_HACIZ_HARCI"].includes(i.kalemTuru)).reduce((sum, i) => sum + i.tutar, 0),
    vekaletUcreti: items.filter(i => ["IHTIYATI_VEKALET", "VEKALET_UCRETI"].includes(i.kalemTuru)).reduce((sum, i) => sum + i.tutar, 0),
    diger: items.filter(i => ["CEK_TAZMINATI", "KDV", "BSMV", "KKDF", "DIGER"].includes(i.kalemTuru)).reduce((sum, i) => sum + i.tutar, 0),
  };
  const genelToplam = toplamlar.asilAlacak + toplamlar.islemisFaiz + toplamlar.masraf + toplamlar.vekaletUcreti + toplamlar.diger;

  const formatCurrency = (amount: number, curr = currency) => {
    const symbol = CURRENCY_OPTIONS.find(c => c.value === curr)?.symbol || "₺";
    return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
  };

  // Faiz gerektiren kalem mi?
  const isFaizKalemi = (kalemTuru: string) => kalemTuru === "ISLEMIS_FAIZ";

  return (
    <div className="space-y-4">
      {/* Üst Panel - Akıllı Sihirbaz */}
      <div className="border-2 border-dashed border-blue-300 rounded-xl p-4 bg-blue-50/50">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Wand2 className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900">Akıllı Alacak Kalemi Sihirbazı</h3>
            <p className="text-sm text-blue-700 mb-3">
              Borç evrakını yükleyin → tutar/vade/faizi otomatik oluşturalım.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-2 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 text-sm font-medium text-blue-700"
              >
                <Upload className="h-4 w-4" />
                Evrak Yükle
              </button>
              <button
                type="button"
                onClick={otomatikKalemOlustur}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <Wand2 className="h-4 w-4" />
                Otomatik Kalem Oluştur
              </button>
              <button
                type="button"
                onClick={() => addItem()}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Manuel Ekle
              </button>
              {(takipTuruCode === "KIRA" || takipTuruCode === "ILAMSIZ_KIRA" || takipTuruCode === "NAFAKA") && (
                <button
                  type="button"
                  onClick={() => setShowDonemModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                >
                  <Calendar className="h-4 w-4" />
                  Dönemsel Kalem Oluştur
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Algılanan bilgi (OCR sonrası gösterilecek) */}
        {takipTuruCode && (
          <div className="mt-3 pt-3 border-t border-blue-200">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Algılanan:</span>{" "}
              {KALEM_TURU_OPTIONS.find(k => k.value === getDefaultsFromProps(takipTuruCode).kalemTuru)?.label || "—"} |{" "}
              <span className="font-medium">Faiz:</span> {FAIZ_TURU_OPTIONS.find(f => f.value === getDefaultsFromProps(takipTuruCode).faizTuru)?.label || "—"}
            </p>
          </div>
        )}
        
        {/* Hızlı Kalem Ekleme Butonları */}
        <div className="mt-3 pt-3 border-t border-blue-200">
          <p className="text-xs text-blue-600 mb-2 font-medium">Hızlı Ekle:</p>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => addItem("ISLEMIS_FAIZ")} className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200">+ İşlemiş Faiz</button>
            {(takipTuruCode === "KAMBIYO_CEK" || items.some(i => i.kalemTuru === "CEK")) && (
              <button type="button" onClick={() => addItem("CEK_TAZMINATI")} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">+ Çek Tazminatı</button>
            )}
            <button type="button" onClick={() => addItem("KOMISYON")} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">+ Komisyon</button>
            <button type="button" onClick={() => addItem("IHTIYATI_HACIZ_HARCI")} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">+ İht. Haciz Harcı</button>
            <button type="button" onClick={() => addItem("IHTIYATI_VEKALET")} className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200">+ İht. Vekalet Ücreti</button>
            <button type="button" onClick={() => addItem("VEKALET_UCRETI")} className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200">+ Vekalet Ücreti</button>
          </div>
        </div>
      </div>

      {/* İlamlı Takip Kesinleşme Uyarısı */}
      {(takipTuruCode === "ILAMLI" || documentSource === "ILAM") && (
        <div className="border rounded-xl p-4 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-800">Kesinleşme Kontrolü</h4>
              <p className="text-sm text-amber-700 mt-1">
                İlamlı takiplerde, ilamın kesinleşmesi gerekip gerekmediğini kontrol ediniz.
              </p>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" className="rounded border-amber-400" />
                <span className="text-sm text-amber-800">İlam kesinleşmiştir / Kesinleşme gerekmemektedir</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Alacak Kalemleri Tablosu */}
      <div className="border rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-2 py-3 text-left font-medium text-gray-600 w-8">#</th>
                <th className="px-2 py-3 text-left font-medium text-gray-600 min-w-[160px]">Kalem Türü</th>
                <th className="px-2 py-3 text-right font-medium text-gray-600 min-w-[120px]">Tutar</th>
                <th className="px-2 py-3 text-center font-medium text-gray-600 w-16">PB</th>
                <th className="px-2 py-3 text-center font-medium text-gray-600 min-w-[110px]">Vade/Tarih</th>
                <th className="px-2 py-3 text-center font-medium text-gray-600 min-w-[100px]">Faiz Türü</th>
                <th className="px-2 py-3 text-center font-medium text-gray-600 min-w-[110px]">Faiz Başlangıç</th>
                <th className="px-2 py-3 text-right font-medium text-gray-600 min-w-[90px]">Hesaplanan</th>
                <th className="px-2 py-3 text-center font-medium text-gray-600 min-w-[80px]">Sorumlu</th>
                <th className="px-2 py-3 text-center font-medium text-gray-600 min-w-[80px]">Kaynak</th>
                <th className="px-2 py-3 text-left font-medium text-gray-600 min-w-[120px]">Açıklama</th>
                <th className="px-2 py-3 text-center font-medium text-gray-600 w-20">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, index) => (
                <tr key={item.id} className={`hover:bg-gray-50 ${editingItemId === item.id ? "bg-yellow-50" : ""}`}>
                  {/* # */}
                  <td className="px-2 py-2">
                    <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-medium">
                      {index + 1}
                    </span>
                  </td>
                  
                  {/* Kalem Türü */}
                  <td className="px-2 py-2">
                    <select
                      value={item.kalemTuru}
                      onChange={(e) => updateItem(item.id, { kalemTuru: e.target.value })}
                      className="w-full border rounded px-2 py-1.5 text-sm bg-yellow-50 font-medium"
                    >
                      {KALEM_TURU_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  
                  {/* Tutar */}
                  <td className="px-2 py-2">
                    {isFaizKalemi(item.kalemTuru) ? (
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={item.tutar || ""}
                          onChange={(e) => updateItem(item.id, { tutar: parseFloat(e.target.value) || 0 })}
                          placeholder={asilAlacakToplam > 0 ? `(${asilAlacakToplam.toLocaleString("tr-TR")})` : "0,00"}
                          className="w-full border rounded px-2 py-1.5 text-sm text-right font-medium bg-orange-50"
                          title="Boş bırakırsanız ana alacak üzerinden hesaplanır"
                        />
                        {item.tutar === 0 && asilAlacakToplam > 0 && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-orange-500">⚡</span>
                        )}
                      </div>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={item.tutar || ""}
                        onChange={(e) => updateItem(item.id, { tutar: parseFloat(e.target.value) || 0 })}
                        placeholder="0,00"
                        className="w-full border rounded px-2 py-1.5 text-sm text-right font-medium"
                      />
                    )}
                  </td>
                  
                  {/* Para Birimi */}
                  <td className="px-2 py-2">
                    <select
                      value={item.currency}
                      onChange={(e) => updateItem(item.id, { currency: e.target.value })}
                      className="w-full border rounded px-1 py-1.5 text-sm bg-gray-50"
                    >
                      {CURRENCY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  
                  {/* Vade/Tarih */}
                  <td className="px-2 py-2">
                    <input
                      type="date"
                      value={item.vadeTarihi}
                      onChange={(e) => updateItem(item.id, { vadeTarihi: e.target.value })}
                      className="w-full border rounded px-1 py-1.5 text-sm"
                    />
                  </td>
                  
                  {/* Faiz Türü */}
                  <td className="px-2 py-2">
                    {isFaizKalemi(item.kalemTuru) ? (
                      <select
                        value={item.faizTuru}
                        onChange={(e) => updateItem(item.id, { faizTuru: e.target.value })}
                        className="w-full border rounded px-1 py-1.5 text-sm bg-orange-50"
                      >
                        {FAIZ_TURU_OPTIONS.filter(f => f.value !== "YOK").map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-400 text-center block">—</span>
                    )}
                  </td>
                  
                  {/* Faiz Başlangıç */}
                  <td className="px-2 py-2">
                    {isFaizKalemi(item.kalemTuru) ? (
                      <input
                        type="date"
                        value={item.faizBaslangic}
                        onChange={(e) => updateItem(item.id, { faizBaslangic: e.target.value })}
                        className="w-full border rounded px-1 py-1.5 text-sm bg-orange-50"
                      />
                    ) : (
                      <span className="text-gray-400 text-center block">—</span>
                    )}
                  </td>
                  
                  {/* Hesaplanan Faiz */}
                  <td className="px-2 py-2 text-right">
                    {isFaizKalemi(item.kalemTuru) && item.hesaplananFaiz > 0 ? (
                      <div className="text-xs">
                        <span className="font-bold text-orange-600">{formatCurrency(item.hesaplananFaiz, item.currency)}</span>
                        <span className="text-gray-400 block">
                          {hesaplaGunSayisi(item.faizBaslangic, item.faizBitis)} gün
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-center block">—</span>
                    )}
                  </td>
                  
                  {/* Sorumlu Borçlular */}
                  <td className="px-2 py-2">
                    <select
                      value={item.sorumluBorclular}
                      onChange={(e) => updateItem(item.id, { sorumluBorclular: e.target.value })}
                      className="w-full border rounded px-1 py-1.5 text-xs"
                    >
                      {SORUMLU_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  
                  {/* Kaynak Evrak */}
                  <td className="px-2 py-2">
                    {item.kalemTuru === "CEK" ? (
                      <button
                        type="button"
                        onClick={() => setShowCekModal(item.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                      >
                        <CreditCard className="h-3 w-3" />
                        {item.cekBilgileri?.cekSeriNo || "Çek"}
                      </button>
                    ) : (
                      <input
                        type="text"
                        value={item.kaynakEvrak}
                        onChange={(e) => updateItem(item.id, { kaynakEvrak: e.target.value })}
                        placeholder="—"
                        className="w-full border rounded px-1 py-1.5 text-xs"
                      />
                    )}
                  </td>
                  
                  {/* Açıklama */}
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={item.aciklama}
                      onChange={(e) => updateItem(item.id, { aciklama: e.target.value })}
                      placeholder="Açıklama..."
                      className="w-full border rounded px-2 py-1.5 text-xs"
                    />
                  </td>
                  
                  {/* İşlem */}
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => duplicateItem(item.id)}
                        className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                        title="Kopyala"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                          title="Sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Tablo altı - Kalem Ekle */}
        <div className="p-2 border-t bg-gray-50 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => addItem()}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded border"
          >
            <Plus className="h-4 w-4" />
            Yeni Kalem
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-500">Hızlı:</span>
          <button type="button" onClick={() => addItem("ISLEMIS_FAIZ")} className="px-2 py-1 text-xs bg-orange-50 text-orange-600 rounded hover:bg-orange-100 border border-orange-200">Faiz</button>
          <button type="button" onClick={() => addItem("CEK_TAZMINATI")} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 border border-red-200">Tazminat</button>
          <button type="button" onClick={() => addItem("KOMISYON")} className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100 border border-gray-200">Komisyon</button>
          <button type="button" onClick={() => addItem("VEKALET_UCRETI")} className="px-2 py-1 text-xs bg-purple-50 text-purple-600 rounded hover:bg-purple-100 border border-purple-200">Vekalet</button>
        </div>
      </div>

      {/* Çek Bilgileri Modal */}
      {showCekModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Çek Bilgileri
            </h3>
            {(() => {
              const item = items.find(i => i.id === showCekModal);
              if (!item?.cekBilgileri) return null;
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">İbraz Tarihi</label>
                      <input
                        type="date"
                        value={item.cekBilgileri.ibrazTarihi}
                        onChange={(e) => updateItem(item.id, { 
                          cekBilgileri: { ...item.cekBilgileri!, ibrazTarihi: e.target.value } 
                        })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Çek Seri No</label>
                      <input
                        type="text"
                        value={item.cekBilgileri.cekSeriNo}
                        onChange={(e) => updateItem(item.id, { 
                          cekBilgileri: { ...item.cekBilgileri!, cekSeriNo: e.target.value } 
                        })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Düzenleme Yeri</label>
                      <input
                        type="text"
                        value={item.cekBilgileri.duzenlemeYeri}
                        onChange={(e) => updateItem(item.id, { 
                          cekBilgileri: { ...item.cekBilgileri!, duzenlemeYeri: e.target.value } 
                        })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Hesap No</label>
                      <input
                        type="text"
                        value={item.cekBilgileri.hesapNo}
                        onChange={(e) => updateItem(item.id, { 
                          cekBilgileri: { ...item.cekBilgileri!, hesapNo: e.target.value } 
                        })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium mb-1">Banka ve Şube</label>
                      <input
                        type="text"
                        value={item.cekBilgileri.bankaVeSube}
                        onChange={(e) => updateItem(item.id, { 
                          cekBilgileri: { ...item.cekBilgileri!, bankaVeSube: e.target.value } 
                        })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium mb-1">Çeki İmzalayanlar</label>
                      <input
                        type="text"
                        value={item.cekBilgileri.cekiImzalayanlar}
                        onChange={(e) => updateItem(item.id, { 
                          cekBilgileri: { ...item.cekBilgileri!, cekiImzalayanlar: e.target.value } 
                        })}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-3 border-t">
                    <button
                      type="button"
                      onClick={() => setShowCekModal(null)}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm"
                    >
                      Tamam
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Dönemsel Kalem Modal (Kira/Nafaka) */}
      {showDonemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-600" />
              Dönemsel Kalem Oluştur ({donemSecim.kalemTuru === "NAFAKA" ? "Nafaka" : "Kira"})
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Başlangıç Ay/Yıl</label>
                  <div className="flex gap-1">
                    <select
                      value={donemSecim.baslangicAy}
                      onChange={(e) => setDonemSecim(prev => ({ ...prev, baslangicAy: parseInt(e.target.value) }))}
                      className="flex-1 border rounded px-2 py-1.5 text-sm"
                    >
                      {AY_ISIMLERI.map((ay, i) => (
                        <option key={i} value={i}>{ay}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={donemSecim.baslangicYil}
                      onChange={(e) => setDonemSecim(prev => ({ ...prev, baslangicYil: parseInt(e.target.value) }))}
                      className="w-20 border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Bitiş Ay/Yıl</label>
                  <div className="flex gap-1">
                    <select
                      value={donemSecim.bitisAy}
                      onChange={(e) => setDonemSecim(prev => ({ ...prev, bitisAy: parseInt(e.target.value) }))}
                      className="flex-1 border rounded px-2 py-1.5 text-sm"
                    >
                      {AY_ISIMLERI.map((ay, i) => (
                        <option key={i} value={i}>{ay}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={donemSecim.bitisYil}
                      onChange={(e) => setDonemSecim(prev => ({ ...prev, bitisYil: parseInt(e.target.value) }))}
                      className="w-20 border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Aylık Tutar ({CURRENCY_OPTIONS.find(c => c.value === currency)?.symbol})</label>
                <input
                  type="number"
                  step="0.01"
                  value={donemSecim.aylikTutar || ""}
                  onChange={(e) => setDonemSecim(prev => ({ ...prev, aylikTutar: parseFloat(e.target.value) || 0 }))}
                  placeholder="0,00"
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              {donemSecim.kalemTuru === "NAFAKA" && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded border-blue-400" />
                    <span className="text-sm text-blue-800">Devam eden aylar (her ay otomatik yeni kalem eklensin)</span>
                  </label>
                  <p className="text-xs text-blue-600 mt-1 ml-6">Bu seçenek aktifken, her yeni ay başında otomatik nafaka kalemi oluşturulur.</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowDonemModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={donemselKalemOlustur}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  Kalemleri Oluştur
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Döviz Kur Kuralı (sadece döviz seçiliyse) */}
      {isDoviz && (
        <div className="border rounded-xl p-4 bg-yellow-50 border-yellow-200">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Banknote className="h-5 w-5 text-yellow-600" />
            Döviz Kur Kuralı ({CURRENCY_OPTIONS.find(c => c.value === currency)?.label})
          </h3>
          <div className="flex flex-wrap gap-4">
            {KUR_KURALI_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="kurKurali"
                  value={opt.value}
                  checked={kurKurali === opt.value}
                  onChange={(e) => setKurKurali(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-yellow-700 mt-2">
            {kurKurali === "FIILI_ODEME" 
              ? "Alacak, fiili ödeme tarihindeki TCMB döviz satış kuru üzerinden TL'ye çevrilecektir."
              : "Alacak, takip tarihindeki TCMB döviz satış kuru üzerinden TL'ye çevrilecektir."}
          </p>
        </div>
      )}

      {/* Özet Paneli */}
      <div className="border-2 border-primary/20 rounded-xl p-4 bg-primary/5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary" />
          ÖZET
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="text-center p-3 bg-white rounded-lg border">
            <p className="text-xs text-muted-foreground">Asıl Alacak Toplamı</p>
            <p className="text-lg font-bold">{formatCurrency(toplamlar.asilAlacak)}</p>
          </div>
          <div className="text-center p-3 bg-white rounded-lg border border-orange-200">
            <p className="text-xs text-orange-600 font-medium">İşlemiş Faiz</p>
            <p className="text-lg font-bold text-orange-600">{formatCurrency(toplamlar.islemisFaiz)}</p>
          </div>
          <div className="text-center p-3 bg-white rounded-lg border">
            <p className="text-xs text-muted-foreground">Masraf/Harç</p>
            <p className="text-lg font-bold">{formatCurrency(toplamlar.masraf)}</p>
          </div>
          <div className="text-center p-3 bg-white rounded-lg border">
            <p className="text-xs text-muted-foreground">Vekalet Ücreti</p>
            <p className="text-lg font-bold">{formatCurrency(toplamlar.vekaletUcreti)}</p>
          </div>
          <div className="text-center p-3 bg-white rounded-lg border">
            <p className="text-xs text-muted-foreground">Diğer (Tazminat vb.)</p>
            <p className="text-lg font-bold">{formatCurrency(toplamlar.diger)}</p>
          </div>
          <div className="text-center p-3 bg-primary/10 rounded-lg border-2 border-primary">
            <p className="text-xs text-primary font-medium">TAKİP TOPLAMI</p>
            <p className="text-xl font-bold text-primary">{formatCurrency(genelToplam)}</p>
          </div>
        </div>
      </div>

      {/* Takip Sonrası Faiz Kuralı */}
      <div className="border rounded-xl p-4 bg-gray-50">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Percent className="h-5 w-5 text-gray-600" />
          Takip Sonrası Faiz Kuralı
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Faiz Türü</label>
            <select
              value={takipSonrasiFaiz.faizTuru}
              onChange={(e) => setTakipSonrasiFaiz(prev => ({ ...prev, faizTuru: e.target.value }))}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              {FAIZ_TURU_OPTIONS.filter(f => f.value !== "YOK").map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label} (%{opt.rate})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Oran</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`%${FAIZ_TURU_OPTIONS.find(f => f.value === takipSonrasiFaiz.faizTuru)?.rate || 0}`}
                className="w-20 border rounded px-2 py-1.5 text-sm bg-gray-100 text-center font-medium"
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={takipSonrasiFaiz.degiskenOran}
                  onChange={(e) => setTakipSonrasiFaiz(prev => ({ ...prev, degiskenOran: e.target.checked }))}
                  className="rounded"
                />
                Değişken oranlara göre güncellenebilir
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Başlangıç (Takip Tarihi)</label>
            <input
              type="date"
              value={takipSonrasiFaiz.baslangic}
              onChange={(e) => setTakipSonrasiFaiz(prev => ({ ...prev, baslangic: e.target.value }))}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked className="rounded" />
              Bu metni Örnek 1'e ekle
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
