"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Plus, Search, FileText, Loader2, Edit2, Trash2, Eye, 
  Download, Filter, X, ChevronDown, ChevronUp, RefreshCw,
  Mail, MessageSquare, Archive, Copy, AlertTriangle,
  Calendar, DollarSign, Star, MoreHorizontal, UserCheck,
  ChevronsUpDown, Users
} from "lucide-react";
import { Badge } from "@hukuk/ui";
import { api } from "@/lib/api";
import { buildBulkAssignPayload } from "@/lib/bulk-assign";
import { BulkDocumentGenerator } from "@/components/case";
import { ResponsibleCandidateSelect, type ResponsibleSelection } from "@/components/case/responsible-candidate-select";
import { MultiSelectDropdown, QuickFilterChip, ActiveFilterPill, QuickFilterHelpBanner, MissingBadge } from "@/components/ui";

interface CaseItem {
  id: string;
  fileNumber: string;
  executionFileNumber?: string;
  type: string;
  status: string;
  caseStatus?: string;
  client?: { id: string; name: string; displayName?: string };
  debtors: { debtor: { id: string; name: string; address?: string; identityNo?: string; phone?: string; email?: string } }[];
  lawyers?: { lawyer: { id: string; name: string; surname: string } }[];
  principalAmount?: number;
  currency?: string;
  createdAt: string;
  startDate?: string;
  executionOffice?: { id: string; name: string; city: string; uyapCode?: string };
  risk?: { id: string; name: string; color?: string };
  asama?: { id: string; name: string; code?: string };
  takipTuru?: { id: string; name: string };
  isAutomationEnabled?: boolean;
  isArchived?: boolean;
  hasArticle4Request?: boolean;
  uyapBirimKodu?: string;
  sorumluPersonel?: { id: string; name: string; surname: string };
  hasValidPoa?: boolean;
  // Yeni alanlar - hızlı filtreler için
  lastActionDate?: string;
  daysUntilPassive?: number;
  notificationStatus?: string;
  automationStatus?: string;
  lastCollectionDate?: string;
  // Masraf talebi alanları
  expenseRequestStatus?: string;
  latestExpenseRequest?: {
    id: string;
    status: string;
    totalAmount: number;
    dueDate?: string;
    sentAt?: string;
  };
}

interface FilterState {
  search: string;
  status: string[];
  caseType: string[];
  dateFrom: string;
  dateTo: string;
  city: string[];
  executionOfficeId: string[];
  clientId: string[];
  lawyerId: string[];
  staffId: string[];
  riskId: string[];
  asamaId: string[];
  amountMin: string;
  amountMax: string;
  currency: string;
  automationStatus: string;
  poaStatus: string;
  dataQuality: string[];
  includeArchived: boolean;
  expenseRequestStatus: string;
  noOwner: boolean; // SAHIPSIZ-DOSYALAR-G1b: sahipsiz (Dosya Sorumlusu yok) server-side filtre
}

// Hızlı filtre sayaçları için interface
interface FilterCounts {
  // Aksiyon
  active: number;
  noAction7: number;
  noAction30: number;
  notificationPending: number;
  seizureReady: number;
  saleReady: number;
  // Risk
  daysLeft30: number;
  daysLeft60: number;
  daysLeft180: number;
  highRisk: number;
  // Eksik Veri
  noPoa: number;
  noAddress: number;
  noIdentity: number;
  noContact: number;
  noUyap: number;
  noIban: number;
  // Para
  collection7d: number;
  noCollection90d: number;
  amount50k: number;
  amount250k: number;
  // Tür
  typeRental: number;
  typeCheck: number;
  typeBond: number;
  typeGeneral: number;
  multiDebtor: number;
  // Otomasyon
  automationOff: number;
  automationError: number;
  automationPending: number;
  // Masraf Talebi
  expensePending: number;
  expenseSent: number;
  expenseOverdue: number;
  expenseReceived: number;
}

interface SavedFilter {
  id: string;
  name: string;
  filters: Partial<FilterState>;
  isDefault?: boolean;
}

const caseTypeLabels: Record<string, string> = {
  GENERAL_EXECUTION: "Genel Haciz",
  MORTGAGE: "İpotekli",
  PLEDGE: "Rehinli",
  CHECK: "Çek",
  BOND: "Senet",
  RENTAL: "Kira",
  BANKRUPTCY: "İflas",
  OTHER: "Diğer",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Aktif",
  DERDEST: "Derdest",
  CLOSED: "Kapalı",
  KAPALI: "Kapalı",
  SUSPENDED: "Askıda",
  ASKIDA: "Askıda",
  ARCHIVED: "Arşiv",
  ARSIV: "Arşiv",
};

const statusColors: Record<string, "default" | "success" | "warning" | "destructive"> = {
  ACTIVE: "success",
  DERDEST: "success",
  CLOSED: "default",
  KAPALI: "default",
  SUSPENDED: "warning",
  ASKIDA: "warning",
  ARCHIVED: "default",
  ARSIV: "default",
};

const defaultFilters: FilterState = {
  search: "",
  status: [],
  caseType: [],
  dateFrom: "",
  dateTo: "",
  city: [],
  executionOfficeId: [],
  clientId: [],
  lawyerId: [],
  staffId: [],
  riskId: [],
  asamaId: [],
  amountMin: "",
  amountMax: "",
  currency: "all",
  automationStatus: "all",
  poaStatus: "all",
  dataQuality: [],
  includeArchived: false,
  expenseRequestStatus: "all",
  noOwner: false,
};

// Hızlı filtre kategorileri ve tanımları
interface QuickFilterHelpText {
  title: string;
  effect: string;
  solution: string;
  tip?: string;
}

interface QuickFilterFixTarget {
  key: string;
  section: string;
  field: string;
  expand?: string;
}

interface QuickFilter {
  id: string;
  label: string;
  color: "default" | "warning" | "danger" | "success" | "info" | "purple";
  category: "action" | "risk" | "data" | "money" | "type" | "automation" | "expense";
  filterKey: keyof FilterState | "custom";
  filterValue: any;
  countKey?: string;
  helpText?: QuickFilterHelpText;
  fixTarget?: QuickFilterFixTarget;
  hasFix?: boolean; // Düzelt butonu gösterilsin mi
}

interface QuickFilterCategory {
  id: string;
  label: string;
  icon: string;
  filters: QuickFilter[];
}

// Tüm hızlı filtre tanımları - kategorize edilmiş + help text + fix target
const allQuickFilters: QuickFilter[] = [
  // === AKSİYON ODAKLI ===
  { 
    id: "active", 
    label: "Aktif Dosyalar", 
    color: "success", 
    category: "action", 
    filterKey: "status", 
    filterValue: ["DERDEST"], 
    countKey: "active",
    helpText: {
      title: "Aktif Dosyalar",
      effect: "Aktif statüdeki takipleri görüntülüyorsunuz.",
      solution: "Durum, tür ve risk filtreleriyle daraltarak günlük iş listenizi oluşturun.",
    },
    hasFix: false,
  },
  { 
    id: "no-action-7", 
    label: "7 Gündür İşlem Yok", 
    color: "warning", 
    category: "action", 
    filterKey: "custom", 
    filterValue: "no-action-7", 
    countKey: "noAction7",
    helpText: {
      title: "7 Gündür İşlem Yok",
      effect: "Bu dosyalarda 7 gündür hiçbir icraî işlem yapılmamış.",
      solution: "Dosyaya girerek yeni işlem başlatın veya hatırlatma kurun.",
      tip: "UYAP sorgusu veya tebligat talebi açabilirsiniz.",
    },
    fixTarget: { key: "lifecycle.addAction", section: "lifecycle", field: "addActionButton", expand: "lifecyclePanel" },
    hasFix: true,
  },
  { 
    id: "no-action-30", 
    label: "30 Gündür İşlem Yok", 
    color: "danger", 
    category: "action", 
    filterKey: "custom", 
    filterValue: "no-action-30", 
    countKey: "noAction30",
    helpText: {
      title: "30 Gündür İşlem Yok",
      effect: "Bu dosyalar 30 gündür bekliyor, pasifleşme riski var!",
      solution: "Acil olarak işlem yapın veya dosyayı inceleyin.",
      tip: "Kalan gün sayısını kontrol edin.",
    },
    fixTarget: { key: "lifecycle.addAction", section: "lifecycle", field: "addActionButton", expand: "lifecyclePanel" },
    hasFix: true,
  },
  { 
    id: "notification-pending", 
    label: "Tebligat Bekliyor", 
    color: "warning", 
    category: "action", 
    filterKey: "custom", 
    filterValue: "notification-pending", 
    countKey: "notificationPending",
    helpText: {
      title: "Tebligat Bekliyor",
      effect: "Tebligat süreci başlatılmış ama sonuçlanmamış.",
      solution: "Tebligat durumunu UYAP'tan sorgulayın veya takip edin.",
    },
    fixTarget: { key: "notification.status", section: "notifications", field: "checkStatus", expand: "notificationsPanel" },
    hasFix: true,
  },
  { 
    id: "seizure-ready", 
    label: "Haciz Talebi Açılabilir", 
    color: "info", 
    category: "action", 
    filterKey: "custom", 
    filterValue: "seizure-ready", 
    countKey: "seizureReady",
    helpText: {
      title: "Haciz Talebi Açılabilir",
      effect: "Takip kesinleşmiş, haciz talebi açılabilir durumda.",
      solution: "Haciz talebi oluşturun ve UYAP'a gönderin.",
    },
    fixTarget: { key: "enforcement.seizure", section: "enforcement", field: "createSeizure", expand: "enforcementPanel" },
    hasFix: true,
  },
  { 
    id: "sale-ready", 
    label: "Satış Talebi Açılabilir", 
    color: "info", 
    category: "action", 
    filterKey: "custom", 
    filterValue: "sale-ready", 
    countKey: "saleReady",
    helpText: {
      title: "Satış Talebi Açılabilir",
      effect: "Haciz ve kıymet takdiri tamamlanmış, satış talebi açılabilir.",
      solution: "Satış talebi oluşturun.",
    },
    fixTarget: { key: "enforcement.sale", section: "enforcement", field: "createSale", expand: "enforcementPanel" },
    hasFix: true,
  },
  
  // === RİSK & SÜRE ===
  { 
    id: "days-left-30", 
    label: "Kalan Gün < 30", 
    color: "danger", 
    category: "risk", 
    filterKey: "custom", 
    filterValue: "days-left-30", 
    countKey: "daysLeft30",
    helpText: {
      title: "Kalan Gün < 30 (KRİTİK)",
      effect: "Bu dosyalar 30 gün içinde pasifleşecek!",
      solution: "Acil olarak icraî işlem yapın.",
      tip: "Herhangi bir UYAP işlemi süreyi sıfırlar.",
    },
    fixTarget: { key: "risk.time.remainingDays", section: "lifecycle", field: "remainingDays", expand: "lifecycleCard" },
    hasFix: true,
  },
  { 
    id: "days-left-60", 
    label: "Kalan Gün < 60", 
    color: "warning", 
    category: "risk", 
    filterKey: "custom", 
    filterValue: "days-left-60", 
    countKey: "daysLeft60",
    helpText: {
      title: "Kalan Gün < 60",
      effect: "Bu dosyalar 60 gün içinde pasifleşme riski taşıyor.",
      solution: "Önümüzdeki haftalarda işlem planlayın.",
    },
    fixTarget: { key: "risk.time.remainingDays", section: "lifecycle", field: "remainingDays", expand: "lifecycleCard" },
    hasFix: true,
  },
  { 
    id: "days-left-180", 
    label: "Kalan Gün < 180", 
    color: "info", 
    category: "risk", 
    filterKey: "custom", 
    filterValue: "days-left-180", 
    countKey: "daysLeft180",
    helpText: {
      title: "Kalan Gün < 180",
      effect: "Bu dosyalar 6 ay içinde işlem gerektirecek.",
      solution: "Takvime not alın, planlı takip yapın.",
    },
    fixTarget: { key: "risk.time.remainingDays", section: "lifecycle", field: "remainingDays", expand: "lifecycleCard" },
    hasFix: false,
  },
  { 
    id: "high-risk", 
    label: "Yüksek Riskli", 
    color: "danger", 
    category: "risk", 
    filterKey: "riskId", 
    filterValue: ["high"], 
    countKey: "highRisk",
    helpText: {
      title: "Yüksek Riskli Dosyalar",
      effect: "Bu dosyalar risk sinyali veriyor (süre, eksik veri, otomasyon, tahsilat).",
      solution: "Dosyaya girince risk nedeni üstte gösterilir; ilgili alana yönlendirilirsiniz.",
    },
    fixTarget: { key: "risk.summary", section: "risk", field: "riskPanel", expand: "riskSummary" },
    hasFix: true,
  },
  
  // === EKSİK VERİ ===
  { 
    id: "no-poa", 
    label: "Vekalet Eksik", 
    color: "warning", 
    category: "data", 
    filterKey: "poaStatus", 
    filterValue: "missing", 
    countKey: "noPoa",
    helpText: {
      title: "Vekalet Eksik",
      effect: "Vekaletname olmadan evrak üretimi ve temsil doğrulaması risklidir.",
      solution: "Evraklar > Vekaletname yükleyin ve müvekkil ile eşleyin.",
      tip: "Vekalet süresi dolmuş olabilir, kontrol edin.",
    },
    fixTarget: { key: "case.documents.powerOfAttorney", section: "documents", field: "poaUpload", expand: "documentsTab" },
    hasFix: true,
  },
  { 
    id: "no-address", 
    label: "Adres Eksik", 
    color: "danger", 
    category: "data", 
    filterKey: "dataQuality", 
    filterValue: ["no-address"], 
    countKey: "noAddress",
    helpText: {
      title: "Adres Eksik",
      effect: "Borçlu adresi olmadığı için tebligat süreci başlatılamaz.",
      solution: "Borçlu > Adres alanını doldurun ve kaydedin.",
      tip: "UYAP/Mernis sorgusu varsa 'Adres Getir' kullanın.",
    },
    fixTarget: { key: "party.debtor.address", section: "parties.debtors", field: "debtorAddress", expand: "debtorsPanel" },
    hasFix: true,
  },
  { 
    id: "no-identity", 
    label: "TCKN/VKN Eksik", 
    color: "warning", 
    category: "data", 
    filterKey: "custom", 
    filterValue: "no-identity", 
    countKey: "noIdentity",
    helpText: {
      title: "TCKN/VKN Eksik",
      effect: "UYAP sorguları, tebligat ve taraf doğrulama zayıflar.",
      solution: "Borçlu/Müvekkil > Kimlik Bilgisi alanını doldurun.",
      tip: "Gerçek kişi için TCKN, tüzel kişi için VKN girin.",
    },
    fixTarget: { key: "party.identity", section: "parties", field: "identityNo", expand: "partiesPanel" },
    hasFix: true,
  },
  { 
    id: "no-contact", 
    label: "Telefon/E-posta Eksik", 
    color: "warning", 
    category: "data", 
    filterKey: "custom", 
    filterValue: "no-contact", 
    countKey: "noContact",
    helpText: {
      title: "Telefon/E-posta Eksik",
      effect: "Otomatik bildirim/SMS ve borçlu iletişimi aksar.",
      solution: "Borçlu > İletişim alanlarını doldurun.",
    },
    fixTarget: { key: "party.contact", section: "parties", field: "contactInfo", expand: "partiesPanel" },
    hasFix: true,
  },
  { 
    id: "no-uyap", 
    label: "UYAP Bağlı Değil", 
    color: "danger", 
    category: "data", 
    filterKey: "dataQuality", 
    filterValue: ["no-uyap"], 
    countKey: "noUyap",
    helpText: {
      title: "UYAP Bağlı Değil",
      effect: "UYAP'tan otomatik sorgu/işlem/senkron çalışmaz; manuel iş artar.",
      solution: "İcra Merci & Entegrasyon > UYAP Bağla butonunu kullanın.",
      tip: "İcra dairesi seçimini ve birim kodunu kontrol edin.",
    },
    fixTarget: { key: "enforcement.uyap.connect", section: "enforcement", field: "uyapConnect", expand: "enforcementDrawer" },
    hasFix: true,
  },
  { 
    id: "no-iban", 
    label: "IBAN Eksik", 
    color: "warning", 
    category: "data", 
    filterKey: "custom", 
    filterValue: "no-iban", 
    countKey: "noIban",
    helpText: {
      title: "IBAN Eksik",
      effect: "Borçlu 'icraya ödeyeceğim' dediğinde ödeme yönlendirmesi yapılamaz.",
      solution: "İcra Merci > Ödeme Bilgileri > IBAN girin.",
      tip: "TR ile başlayan 26 haneli IBAN formatını kullanın.",
    },
    fixTarget: { key: "enforcement.payment.iban", section: "enforcement", field: "iban", expand: "enforcementDrawer" },
    hasFix: true,
  },
  
  // === PARA / SONUÇ ===
  { 
    id: "collection-7d", 
    label: "Son 7 Gün Tahsilat", 
    color: "success", 
    category: "money", 
    filterKey: "custom", 
    filterValue: "collection-7d", 
    countKey: "collection7d",
    helpText: {
      title: "Son 7 Gün Tahsilat Yapılanlar",
      effect: "Bu dosyalarda son 7 günde tahsilat kaydedilmiş.",
      solution: "Tahsilat detaylarını ve kalan borcu kontrol edin.",
    },
    hasFix: false,
  },
  { 
    id: "no-collection-90d", 
    label: "90 Gündür Tahsilat Yok", 
    color: "danger", 
    category: "money", 
    filterKey: "custom", 
    filterValue: "no-collection-90d", 
    countKey: "noCollection90d",
    helpText: {
      title: "90 Gündür Tahsilat Yok",
      effect: "Bu dosyalarda 90 gündür hiç tahsilat yapılmamış.",
      solution: "Borçlu ile iletişime geçin veya haciz sürecini hızlandırın.",
    },
    fixTarget: { key: "finance.collection", section: "finance", field: "addCollection", expand: "financePanel" },
    hasFix: true,
  },
  { 
    id: "amount-50k", 
    label: "Tutar > 50.000₺", 
    color: "info", 
    category: "money", 
    filterKey: "custom", 
    filterValue: "amount-50k", 
    countKey: "amount50k",
    helpText: {
      title: "Yüksek Tutarlı Dosyalar (>50K)",
      effect: "50.000₺ üzeri alacaklı dosyalar.",
      solution: "Öncelikli takip için bu dosyaları değerlendirin.",
    },
    hasFix: false,
  },
  { 
    id: "amount-250k", 
    label: "Tutar > 250.000₺", 
    color: "purple", 
    category: "money", 
    filterKey: "custom", 
    filterValue: "amount-250k", 
    countKey: "amount250k",
    helpText: {
      title: "Çok Yüksek Tutarlı Dosyalar (>250K)",
      effect: "250.000₺ üzeri alacaklı dosyalar.",
      solution: "VIP takip listesine alın, özel ilgi gösterin.",
    },
    hasFix: false,
  },
  
  // === DOSYA TÜRÜ ===
  { id: "type-rental", label: "Kira Takipleri", color: "default", category: "type", filterKey: "caseType", filterValue: ["RENTAL"], countKey: "typeRental", hasFix: false },
  { id: "type-check", label: "Çek", color: "default", category: "type", filterKey: "caseType", filterValue: ["CHECK"], countKey: "typeCheck", hasFix: false },
  { id: "type-bond", label: "Senet", color: "default", category: "type", filterKey: "caseType", filterValue: ["BOND"], countKey: "typeBond", hasFix: false },
  { id: "type-general", label: "Genel Haciz", color: "default", category: "type", filterKey: "caseType", filterValue: ["GENERAL_EXECUTION"], countKey: "typeGeneral", hasFix: false },
  { id: "multi-debtor", label: "Çok Borçlulu (≥2)", color: "info", category: "type", filterKey: "custom", filterValue: "multi-debtor", countKey: "multiDebtor", hasFix: false },
  
  // === OTOMASYON ===
  { 
    id: "automation-off", 
    label: "Otomasyon Kapalı", 
    color: "warning", 
    category: "automation", 
    filterKey: "automationStatus", 
    filterValue: "disabled", 
    countKey: "automationOff",
    helpText: {
      title: "Otomasyon Kapalı",
      effect: "Hatırlatma ve otomatik adım önerileri çalışmıyor.",
      solution: "Otomasyon ayarlarını açın ve uygun şablonu seçin.",
    },
    fixTarget: { key: "automation.enable", section: "automation", field: "enableToggle", expand: "automationPanel" },
    hasFix: true,
  },
  { 
    id: "automation-error", 
    label: "Otomasyon Hata Verdi", 
    color: "danger", 
    category: "automation", 
    filterKey: "custom", 
    filterValue: "automation-error", 
    countKey: "automationError",
    helpText: {
      title: "Otomasyon Hata Verdi",
      effect: "Otomatik işlemler yarım kaldı; sistem güven kaybeder.",
      solution: "Hata detayını görüntüleyin ve 'Tekrar Dene' butonunu kullanın.",
      tip: "UYAP bağlantısı veya veri eksikliği olabilir.",
    },
    fixTarget: { key: "automation.errors", section: "automation", field: "lastError", expand: "automationPanel" },
    hasFix: true,
  },
  { 
    id: "automation-pending", 
    label: "Otomasyon Beklemede", 
    color: "info", 
    category: "automation", 
    filterKey: "custom", 
    filterValue: "automation-pending", 
    countKey: "automationPending",
    helpText: {
      title: "Otomasyon Beklemede",
      effect: "Otomatik işlem UYAP yanıtı bekliyor.",
      solution: "Bekleyin veya manuel olarak durumu kontrol edin.",
    },
    fixTarget: { key: "automation.pending", section: "automation", field: "pendingStatus", expand: "automationPanel" },
    hasFix: false,
  },
  
  // === MASRAF TALEBİ ===
  { 
    id: "expense-pending", 
    label: "Masraf Bekleniyor", 
    color: "warning", 
    category: "expense", 
    filterKey: "expenseRequestStatus", 
    filterValue: "PENDING", 
    countKey: "expensePending",
    helpText: {
      title: "Masraf Bekleniyor",
      effect: "Bu dosyalarda masraf talebi oluşturulmuş ama henüz gönderilmemiş.",
      solution: "Masraf talebini müvekkile gönderin.",
    },
    hasFix: false,
  },
  { 
    id: "expense-sent", 
    label: "Masraf Talebi Gönderildi", 
    color: "info", 
    category: "expense", 
    filterKey: "expenseRequestStatus", 
    filterValue: "SENT", 
    countKey: "expenseSent",
    helpText: {
      title: "Masraf Talebi Gönderildi",
      effect: "Müvekkile masraf talebi gönderilmiş, ödeme bekleniyor.",
      solution: "Ödeme geldiğinde durumu 'Alındı' olarak güncelleyin.",
    },
    hasFix: false,
  },
  { 
    id: "expense-overdue", 
    label: "Masraf Süresi Geçti", 
    color: "danger", 
    category: "expense", 
    filterKey: "expenseRequestStatus", 
    filterValue: "OVERDUE", 
    countKey: "expenseOverdue",
    helpText: {
      title: "Masraf Süresi Geçti",
      effect: "Masraf talebinin son ödeme tarihi geçmiş, ödeme alınamamış.",
      solution: "Müvekkile hatırlatma gönderin veya iletişime geçin.",
      tip: "Hatırlatma mesajı göndermek için dosyaya girin.",
    },
    hasFix: true,
  },
  { 
    id: "expense-received", 
    label: "Masraf Alındı", 
    color: "success", 
    category: "expense", 
    filterKey: "expenseRequestStatus", 
    filterValue: "RECEIVED", 
    countKey: "expenseReceived",
    helpText: {
      title: "Masraf Alındı",
      effect: "Müvekkilden masraf ödemesi alınmış.",
      solution: "Takip işlemlerine devam edebilirsiniz.",
    },
    hasFix: false,
  },
];

// Kategori tanımları
const quickFilterCategories: QuickFilterCategory[] = [
  { id: "action", label: "Aksiyon", icon: "⚡", filters: allQuickFilters.filter(f => f.category === "action") },
  { id: "risk", label: "Risk & Süre", icon: "⏰", filters: allQuickFilters.filter(f => f.category === "risk") },
  { id: "data", label: "Eksik Veri", icon: "📋", filters: allQuickFilters.filter(f => f.category === "data") },
  { id: "money", label: "Para / Sonuç", icon: "💰", filters: allQuickFilters.filter(f => f.category === "money") },
  { id: "expense", label: "Masraf Talebi", icon: "📨", filters: allQuickFilters.filter(f => f.category === "expense") },
  { id: "type", label: "Dosya Türü", icon: "📁", filters: allQuickFilters.filter(f => f.category === "type") },
  { id: "automation", label: "Otomasyon", icon: "🤖", filters: allQuickFilters.filter(f => f.category === "automation") },
];

// Varsayılan görünür filtreler (en çok kullanılan 8)
const defaultVisibleFilterIds = [
  "active",
  "days-left-60",
  "no-action-30",
  "notification-pending",
  "no-poa",
  "no-address",
  "no-uyap",
  "automation-error",
];

export default function CasesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlStatus = searchParams.get("status");
  const urlClientId = searchParams.get("clientId");
  const urlFilter = searchParams.get("filter"); // expiring, notification, stale gibi özel filtreler
  
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [showBulkDocModal, setShowBulkDocModal] = useState(false);
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showBulkActionConfirm, setShowBulkActionConfirm] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [newFilterName, setNewFilterName] = useState("");
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  
  // Sıralama state'leri
  type CaseSortField = "fileNumber" | "client" | "debtor" | "type" | "status" | "amount" | "date";
  type SortDirection = "asc" | "desc" | null;
  const [sortField, setSortField] = useState<CaseSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  // Lookup data
  const [clients, setClients] = useState<any[]>([]);
  const [lawyers, setLawyers] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [asamalar, setAsamalar] = useState<any[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [executionOffices, setExecutionOffices] = useState<any[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeQuickFilters, setActiveQuickFilters] = useState<string[]>([]);
  const [visibleFilterIds, setVisibleFilterIds] = useState<string[]>(defaultVisibleFilterIds);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [filterCounts, setFilterCounts] = useState<FilterCounts>({
    // Aksiyon
    active: 0,
    noAction7: 0,
    noAction30: 0,
    notificationPending: 0,
    seizureReady: 0,
    saleReady: 0,
    // Risk
    daysLeft30: 0,
    daysLeft60: 0,
    daysLeft180: 0,
    highRisk: 0,
    // Eksik Veri
    noPoa: 0,
    noAddress: 0,
    noIdentity: 0,
    noContact: 0,
    noUyap: 0,
    noIban: 0,
    // Para
    collection7d: 0,
    noCollection90d: 0,
    amount50k: 0,
    amount250k: 0,
    // Tür
    typeRental: 0,
    typeCheck: 0,
    typeBond: 0,
    typeGeneral: 0,
    multiDebtor: 0,
    // Otomasyon
    automationOff: 0,
    automationError: 0,
    automationPending: 0,
    // Masraf Talebi
    expensePending: 0,
    expenseSent: 0,
    expenseOverdue: 0,
    expenseReceived: 0,
  });
  
  const [filters, setFilters] = useState<FilterState>({
    ...defaultFilters,
    status: urlStatus ? [urlStatus] : [],
  });
  // M2-G5d-1b: "Dosya Sorumlusu" filtresi gerçek kişi (server-side responsibleLawyerId/StaffId).
  // Legacy client-side staffId[] (sorumluPersonel.id) filtresi kaldırıldı; staffId FilterState'te atıl bırakıldı.
  const [ownerFilter, setOwnerFilter] = useState<ResponsibleSelection | null>(null);

  // URL'den gelen clientId için müvekkil adı
  const [urlClientName, setUrlClientName] = useState<string | null>(null);

  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState({ type: "", id: "" });
  const [exportingCases, setExportingCases] = useState(false);
  const [ownerlessCount, setOwnerlessCount] = useState(0); // SAHIPSIZ-DOSYALAR-G1b: getStats.ownerless

  useEffect(() => {
    loadLookupData();
    loadSavedFilters();
  }, []);

  // Sayaçları hesapla - cases değiştiğinde
  useEffect(() => {
    if (cases.length > 0) {
      calculateFilterCounts(cases);
    }
  }, [cases]);

  const calculateFilterCounts = (allCases: CaseItem[]) => {
    const now = new Date();
    const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const day90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    const counts: FilterCounts = {
      active: 0, noAction7: 0, noAction30: 0, notificationPending: 0, seizureReady: 0, saleReady: 0,
      daysLeft30: 0, daysLeft60: 0, daysLeft180: 0, highRisk: 0,
      noPoa: 0, noAddress: 0, noIdentity: 0, noContact: 0, noUyap: 0, noIban: 0,
      collection7d: 0, noCollection90d: 0, amount50k: 0, amount250k: 0,
      typeRental: 0, typeCheck: 0, typeBond: 0, typeGeneral: 0, multiDebtor: 0,
      automationOff: 0, automationError: 0, automationPending: 0,
      expensePending: 0, expenseSent: 0, expenseOverdue: 0, expenseReceived: 0,
    };

    allCases.forEach((c: any) => {
      // === AKSİYON ===
      if (c.caseStatus === "DERDEST" || c.status === "DERDEST") counts.active++;
      
      const lastActionDate = c.lastActionDate ? new Date(c.lastActionDate) : null;
      if (lastActionDate) {
        if (lastActionDate < day7Ago) counts.noAction7++;
        if (lastActionDate < day30Ago) counts.noAction30++;
      } else if (c.createdAt) {
        const createdDate = new Date(c.createdAt);
        if (createdDate < day7Ago) counts.noAction7++;
        if (createdDate < day30Ago) counts.noAction30++;
      }
      
      if (c.notificationStatus === "PENDING" || c.asama?.code === "TEBLIGAT_BEKLIYOR") counts.notificationPending++;
      
      // === RİSK & SÜRE ===
      if (c.daysUntilPassive !== undefined && c.daysUntilPassive !== null) {
        if (c.daysUntilPassive < 30) counts.daysLeft30++;
        if (c.daysUntilPassive < 60) counts.daysLeft60++;
        if (c.daysUntilPassive < 180) counts.daysLeft180++;
      }
      if (c.risk?.name?.toLowerCase().includes('yüksek') || c.risk?.name?.toLowerCase().includes('kritik')) counts.highRisk++;
      
      // === EKSİK VERİ ===
      if (c.client && c.lawyers && c.lawyers.length > 0 && c.hasValidPoa === false) counts.noPoa++;
      
      // Adres kontrolü: selectedAddress, debtor.addresses (JSON) veya debtor.address alanı
      const hasAddress = c.debtors?.some((d: any) => {
        // CaseDebtor'da seçili adres var mı?
        if (d.selectedAddress) return true;
        
        const debtor = d.debtor;
        // JSON addresses alanı
        if (debtor.addresses && typeof debtor.addresses === 'object') {
          const addr = debtor.addresses as any;
          if (addr.primary || addr.notification || addr.home || addr.work || Object.keys(addr).length > 0) {
            return true;
          }
        }
        // Eski address string alanı
        if (debtor.address) return true;
        return false;
      });
      if (!hasAddress) counts.noAddress++;
      
      const hasIdentity = c.debtors?.every((d: any) => d.debtor.identityNo);
      if (!hasIdentity) counts.noIdentity++;
      
      const hasContact = c.debtors?.some((d: any) => d.debtor.phone || d.debtor.email);
      if (!hasContact) counts.noContact++;
      
      if (!c.uyapBirimKodu && !c.executionOffice?.uyapCode) counts.noUyap++;
      
      // === PARA ===
      if (c.lastCollectionDate) {
        const collDate = new Date(c.lastCollectionDate);
        if (collDate >= day7Ago) counts.collection7d++;
        if (collDate < day90Ago) counts.noCollection90d++;
      }
      if ((c.principalAmount || 0) > 50000) counts.amount50k++;
      if ((c.principalAmount || 0) > 250000) counts.amount250k++;
      
      // === TÜR ===
      if (c.type === "RENTAL") counts.typeRental++;
      if (c.type === "CHECK") counts.typeCheck++;
      if (c.type === "BOND") counts.typeBond++;
      if (c.type === "GENERAL_EXECUTION") counts.typeGeneral++;
      if (c.debtors && c.debtors.length >= 2) counts.multiDebtor++;
      
      // === OTOMASYON ===
      if (!c.isAutomationEnabled) counts.automationOff++;
      if (c.automationStatus === "ERROR") counts.automationError++;
      if (c.automationStatus === "PENDING") counts.automationPending++;
      
      // === MASRAF TALEBİ ===
      if (c.expenseRequestStatus === "PENDING") counts.expensePending++;
      if (c.expenseRequestStatus === "SENT" || c.expenseRequestStatus === "REMINDED") counts.expenseSent++;
      if (c.expenseRequestStatus === "OVERDUE") counts.expenseOverdue++;
      if (c.expenseRequestStatus === "RECEIVED") counts.expenseReceived++;
    });

    setFilterCounts(counts);
  };

  // Hızlı filtre toggle
  const toggleQuickFilter = (filterId: string) => {
    const filterDef = allQuickFilters.find(f => f.id === filterId);
    if (!filterDef) return;

    setActiveQuickFilters(prev => {
      const isActive = prev.includes(filterId);
      if (isActive) {
        // Filtreyi kaldır
        const newFilters = { ...filters };
        if (filterDef.filterKey !== "custom") {
          if (Array.isArray(filterDef.filterValue)) {
            (newFilters[filterDef.filterKey] as string[]) = [];
          } else if (filterDef.filterKey === 'automationStatus' || filterDef.filterKey === 'poaStatus' || filterDef.filterKey === 'expenseRequestStatus') {
            (newFilters[filterDef.filterKey] as string) = 'all';
          }
          setFilters(newFilters);
        }
        return prev.filter(id => id !== filterId);
      } else {
        // Filtreyi ekle
        const newFilters = { ...filters };
        if (filterDef.filterKey !== "custom") {
          if (Array.isArray(filterDef.filterValue)) {
            (newFilters[filterDef.filterKey] as string[]) = filterDef.filterValue;
          } else {
            (newFilters[filterDef.filterKey] as string) = filterDef.filterValue;
          }
          setFilters(newFilters);
        }
        return [...prev, filterId];
      }
    });
  };

  const getQuickFilterCount = (filterId: string): number => {
    const filter = allQuickFilters.find(f => f.id === filterId);
    if (!filter?.countKey) return 0;
    return (filterCounts as any)[filter.countKey] || 0;
  };

  // Görünür filtre toggle (seçim panelinden)
  const toggleVisibleFilter = (filterId: string) => {
    setVisibleFilterIds(prev => {
      if (prev.includes(filterId)) {
        // Aktif filtreyse önce onu da kaldır
        if (activeQuickFilters.includes(filterId)) {
          toggleQuickFilter(filterId);
        }
        return prev.filter(id => id !== filterId);
      } else {
        return [...prev, filterId];
      }
    });
  };

  // Görünür filtreleri localStorage'a kaydet
  useEffect(() => {
    localStorage.setItem('visible_quick_filters', JSON.stringify(visibleFilterIds));
  }, [visibleFilterIds]);

  // Görünür filtreleri localStorage'dan yükle
  useEffect(() => {
    const saved = localStorage.getItem('visible_quick_filters');
    if (saved) {
      try {
        setVisibleFilterIds(JSON.parse(saved));
      } catch (e) {
        console.error("Görünür filtreler yüklenemedi:", e);
      }
    }
  }, []);

  const loadLookupData = async () => {
    try {
      const [clientsRes, lawyersRes, staffRes, lookupsRes, officesRes] = await Promise.all([
        api.get('/clients').catch(() => ({ data: { data: [] } })),
        api.getLawyers().catch(() => []),
        api.get('/staff').catch(() => ({ data: { data: [] } })),
        api.get('/lookups').catch(() => ({ data: { data: { risk: [], asama: [] } } })),
        api.get('/execution-offices').catch(() => ({ data: { data: [] } })),
      ]);
      
      setClients(clientsRes.data?.data || []);
      setLawyers(lawyersRes || []);
      setStaff(staffRes.data?.data || []);
      setRisks(lookupsRes.data?.data?.risk || []);
      setAsamalar(lookupsRes.data?.data?.asama || []);
      
      const offices = officesRes.data?.data || [];
      setExecutionOffices(offices);
      const uniqueCities = [...new Set(offices.map((o: any) => o.city))].sort() as string[];
      setCities(uniqueCities);
    } catch (error) {
      console.error("Lookup verileri yüklenemedi:", error);
    }
  };

  const loadSavedFilters = () => {
    try {
      const saved = localStorage.getItem('case_saved_filters');
      if (saved) {
        setSavedFilters(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Kayıtlı filtreler yüklenemedi:", e);
    }
  };

  const saveFilter = () => {
    if (!newFilterName.trim()) return;
    const newFilter: SavedFilter = {
      id: `custom_${Date.now()}`,
      name: newFilterName,
      filters: { ...filters },
    };
    const updatedFilters = [...savedFilters, newFilter];
    localStorage.setItem('case_saved_filters', JSON.stringify(updatedFilters));
    setSavedFilters(updatedFilters);
    setNewFilterName("");
    setShowSaveFilterModal(false);
  };

  const applySavedFilter = (filter: SavedFilter) => {
    setFilters({ ...defaultFilters, ...filter.filters });
  };

  const deleteSavedFilter = (filterId: string) => {
    const updatedFilters = savedFilters.filter(f => f.id !== filterId);
    localStorage.setItem('case_saved_filters', JSON.stringify(updatedFilters));
    setSavedFilters(updatedFilters);
  };

  const fetchCases = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (filters.status.length > 0) params.status = filters.status.join(',');
      if (filters.caseType.length > 0) params.type = filters.caseType.join(',');
      if (filters.includeArchived) params.includeArchived = true;
      if (filters.noOwner) params.noOwner = true; // SAHIPSIZ-DOSYALAR-G1b: server-side sahipsiz filtre
      // M2-G5d-1b: gerçek kişi owner filtresi (server-side; G5a). Tipine göre KENDİ kolonu.
      if (ownerFilter?.type === "LAWYER") params.responsibleLawyerId = ownerFilter.id;
      else if (ownerFilter?.type === "STAFF") params.responsibleStaffId = ownerFilter.id;
      // URL'den gelen clientId varsa API'ye gönder
      if (urlClientId) params.clientId = urlClientId;

      const response = await api.getCases(params);
      setCases(response.data || []);
      // SAHIPSIZ-DOSYALAR-G1b: doğru sahipsiz toplamı (server-side; chip rozeti). Best-effort.
      api.get('/cases/stats').then((r: any) => setOwnerlessCount(r?.data?.ownerless ?? 0)).catch(() => {});
    } catch (error) {
      console.error("Takipler yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (urlStatus) {
      setFilters(prev => ({ ...prev, status: [urlStatus] }));
    }
  }, [urlStatus]);

  // URL'den clientId geldiğinde filtreye ekle
  useEffect(() => {
    if (urlClientId) {
      setFilters(prev => ({ ...prev, clientId: [urlClientId] }));
    }
  }, [urlClientId]);

  // URL'den gelen clientId için müvekkil adını bul
  useEffect(() => {
    if (urlClientId && clients.length > 0) {
      const client = clients.find((c: any) => c.id === urlClientId);
      setUrlClientName(client?.displayName || client?.name || null);
    } else if (!urlClientId) {
      setUrlClientName(null);
    }
  }, [urlClientId, clients]);

  useEffect(() => {
    fetchCases();
  }, [filters.status, filters.caseType, filters.includeArchived, filters.noOwner, ownerFilter, urlClientId]);

  const filteredCases = cases.filter((c) => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = 
        c.fileNumber.toLowerCase().includes(searchLower) ||
        c.executionFileNumber?.toLowerCase().includes(searchLower) ||
        c.client?.name?.toLowerCase().includes(searchLower) ||
        c.client?.displayName?.toLowerCase().includes(searchLower) ||
        c.debtors?.some((d) => d.debtor.name.toLowerCase().includes(searchLower));
      if (!matchesSearch) return false;
    }
    if (filters.city.length > 0 && !filters.city.includes(c.executionOffice?.city || '')) return false;
    if (filters.executionOfficeId.length > 0 && !filters.executionOfficeId.includes(c.executionOffice?.id || '')) return false;
    if (filters.clientId.length > 0 && !filters.clientId.includes(c.client?.id || '')) return false;
    if (filters.lawyerId.length > 0 && !c.lawyers?.some(l => filters.lawyerId.includes(l.lawyer.id))) return false;
    // M2-G5d-1b: "Dosya Sorumlusu" filtresi server-side'a taşındı (responsibleLawyerId/StaffId); client-side staffId filtresi kaldırıldı.
    
    // Risk filtresi
    if (filters.riskId.length > 0) {
      if (filters.riskId.includes('high')) {
        const highRiskIds = risks.filter((r: any) => 
          r.name?.toLowerCase().includes('yüksek') || r.name?.toLowerCase().includes('kritik')
        ).map((r: any) => r.id);
        if (!highRiskIds.includes(c.risk?.id)) return false;
      } else if (!filters.riskId.includes(c.risk?.id || '')) {
        return false;
      }
    }
    
    if (filters.asamaId.length > 0 && !filters.asamaId.includes(c.asama?.id || '')) return false;
    if (filters.dateFrom) {
      const caseDate = new Date(c.startDate || c.createdAt);
      if (caseDate < new Date(filters.dateFrom)) return false;
    }
    if (filters.dateTo) {
      const caseDate = new Date(c.startDate || c.createdAt);
      if (caseDate > new Date(filters.dateTo)) return false;
    }
    if (filters.amountMin && (c.principalAmount || 0) < parseFloat(filters.amountMin)) return false;
    if (filters.amountMax && (c.principalAmount || 0) > parseFloat(filters.amountMax)) return false;
    if (filters.currency !== "all" && c.currency !== filters.currency) return false;
    if (filters.automationStatus === "enabled" && !c.isAutomationEnabled) return false;
    if (filters.automationStatus === "disabled" && c.isAutomationEnabled) return false;
    
    // Vekalet durumu filtresi
    if (filters.poaStatus === "missing" && c.hasValidPoa !== false) return false;
    if (filters.poaStatus === "valid" && c.hasValidPoa === false) return false;
    
    // Veri kalitesi filtreleri (çoklu seçim)
    if (filters.dataQuality.length > 0) {
      if (filters.dataQuality.includes("no-address")) {
        const hasAddress = c.debtors?.some(d => d.debtor.address);
        if (hasAddress) return false;
      }
      if (filters.dataQuality.includes("no-uyap")) {
        if (c.uyapBirimKodu || c.executionOffice?.uyapCode) return false;
      }
      if (filters.dataQuality.includes("no-article4")) {
        if (c.hasArticle4Request) return false;
      }
    }
    
    // Custom hızlı filtreler (activeQuickFilters üzerinden)
    const now = new Date();
    const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const day90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    for (const filterId of activeQuickFilters) {
      const filterDef = allQuickFilters.find(f => f.id === filterId);
      if (!filterDef || filterDef.filterKey !== "custom") continue;
      
      const caseAny = c as any;
      
      switch (filterDef.filterValue) {
        case "no-action-7": {
          const lastAction = caseAny.lastActionDate ? new Date(caseAny.lastActionDate) : new Date(c.createdAt);
          if (lastAction >= day7Ago) return false;
          break;
        }
        case "no-action-30": {
          const lastAction = caseAny.lastActionDate ? new Date(caseAny.lastActionDate) : new Date(c.createdAt);
          if (lastAction >= day30Ago) return false;
          break;
        }
        case "notification-pending":
          if (caseAny.notificationStatus !== "PENDING" && caseAny.asama?.code !== "TEBLIGAT_BEKLIYOR") return false;
          break;
        case "days-left-30":
          if (caseAny.daysUntilPassive === undefined || caseAny.daysUntilPassive >= 30) return false;
          break;
        case "days-left-60":
          if (caseAny.daysUntilPassive === undefined || caseAny.daysUntilPassive >= 60) return false;
          break;
        case "days-left-180":
          if (caseAny.daysUntilPassive === undefined || caseAny.daysUntilPassive >= 180) return false;
          break;
        case "no-identity": {
          const hasIdentity = c.debtors?.every(d => (d.debtor as any).identityNo);
          if (hasIdentity) return false;
          break;
        }
        case "no-contact": {
          const hasContact = c.debtors?.some(d => (d.debtor as any).phone || (d.debtor as any).email);
          if (hasContact) return false;
          break;
        }
        case "no-iban":
          // IBAN kontrolü - şimdilik skip
          break;
        case "collection-7d": {
          if (!caseAny.lastCollectionDate) return false;
          const collDate = new Date(caseAny.lastCollectionDate);
          if (collDate < day7Ago) return false;
          break;
        }
        case "no-collection-90d": {
          if (caseAny.lastCollectionDate) {
            const collDate = new Date(caseAny.lastCollectionDate);
            if (collDate >= day90Ago) return false;
          }
          break;
        }
        case "amount-50k":
          if ((c.principalAmount || 0) <= 50000) return false;
          break;
        case "amount-250k":
          if ((c.principalAmount || 0) <= 250000) return false;
          break;
        case "multi-debtor":
          if (!c.debtors || c.debtors.length < 2) return false;
          break;
        case "automation-error":
          if (caseAny.automationStatus !== "ERROR") return false;
          break;
        case "automation-pending":
          if (caseAny.automationStatus !== "PENDING") return false;
          break;
      }
    }
    
    return true;
  });

  // Sıralama fonksiyonu
  const handleSort = (field: CaseSortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortField(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Sıralanmış liste
  const sortedCases = [...filteredCases].sort((a, b) => {
    if (!sortField || !sortDirection) return 0;
    
    let aValue: any, bValue: any;
    
    switch (sortField) {
      case "fileNumber":
        aValue = a.fileNumber || "";
        bValue = b.fileNumber || "";
        break;
      case "client":
        aValue = a.client?.name || a.client?.displayName || "";
        bValue = b.client?.name || b.client?.displayName || "";
        break;
      case "debtor":
        aValue = a.debtors?.[0]?.debtor?.name || "";
        bValue = b.debtors?.[0]?.debtor?.name || "";
        break;
      case "type":
        aValue = caseTypeLabels[a.type] || a.type || "";
        bValue = caseTypeLabels[b.type] || b.type || "";
        break;
      case "status":
        aValue = statusLabels[a.caseStatus || a.status] || a.caseStatus || a.status || "";
        bValue = statusLabels[b.caseStatus || b.status] || b.caseStatus || b.status || "";
        break;
      case "amount":
        aValue = a.principalAmount || 0;
        bValue = b.principalAmount || 0;
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      case "date":
        aValue = new Date(a.startDate || a.createdAt).getTime();
        bValue = new Date(b.startDate || b.createdAt).getTime();
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      default:
        return 0;
    }
    
    if (sortDirection === "asc") {
      return aValue.toString().localeCompare(bValue.toString(), "tr");
    } else {
      return bValue.toString().localeCompare(aValue.toString(), "tr");
    }
  });

  // Sıralama ikonu
  const SortIcon = ({ field }: { field: CaseSortField }) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="h-3 w-3 text-gray-400 ml-1" />;
    }
    if (sortDirection === "asc") {
      return <ChevronUp className="h-3 w-3 text-primary ml-1" />;
    }
    return <ChevronDown className="h-3 w-3 text-primary ml-1" />;
  };

  const toggleSelectCase = (caseId: string) => {
    setSelectedCases(prev => 
      prev.includes(caseId) ? prev.filter(id => id !== caseId) : [...prev, caseId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCases.length === sortedCases.length) {
      setSelectedCases([]);
    } else {
      setSelectedCases(sortedCases.map(c => c.id));
    }
  };

  const handleArchive = async (caseId: string) => {
    try {
      setProcessingIds(prev => [...prev, caseId]);
      await api.patch(`/cases/${caseId}`, { isArchived: true });
      fetchCases();
      setShowDeleteConfirm(null);
    } catch (error: any) {
      alert(error.message || 'Arşivleme başarısız');
    } finally {
      setProcessingIds(prev => prev.filter(id => id !== caseId));
    }
  };

  const handleHardDelete = async (caseId: string) => {
    try {
      setProcessingIds(prev => [...prev, caseId]);
      await api.delete(`/cases/${caseId}`);
      setCases(prev => prev.filter(c => c.id !== caseId));
      setSelectedCases(prev => prev.filter(id => id !== caseId));
      setShowDeleteConfirm(null);
    } catch (error: any) {
      alert(error.message || 'Silme işlemi başarısız');
    } finally {
      setProcessingIds(prev => prev.filter(id => id !== caseId));
    }
  };

  const handleBulkArchive = async () => {
    if (selectedCases.length === 0) return;
    try {
      setProcessingIds(selectedCases);
      for (const caseId of selectedCases) {
        await api.patch(`/cases/${caseId}`, { isArchived: true });
      }
      fetchCases();
      setSelectedCases([]);
      setShowBulkActionConfirm(null);
    } catch (error: any) {
      alert(error.message || 'Toplu arşivleme başarısız');
    } finally {
      setProcessingIds([]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCases.length === 0) return;
    try {
      setProcessingIds(selectedCases);
      for (const caseId of selectedCases) {
        await api.delete(`/cases/${caseId}`);
      }
      setCases(prev => prev.filter(c => !selectedCases.includes(c.id)));
      setSelectedCases([]);
      setShowBulkActionConfirm(null);
    } catch (error: any) {
      alert(error.message || 'Toplu silme başarısız');
    } finally {
      setProcessingIds([]);
    }
  };

  const handleBulkStatusChange = async () => {
    if (selectedCases.length === 0 || !bulkStatus) return;
    try {
      setProcessingIds(selectedCases);
      for (const caseId of selectedCases) {
        await api.patch(`/cases/${caseId}`, { caseStatus: bulkStatus });
      }
      fetchCases();
      setSelectedCases([]);
      setShowBulkStatusModal(false);
      setBulkStatus("");
    } catch (error: any) {
      alert(error.message || 'Toplu statü değiştirme başarısız');
    } finally {
      setProcessingIds([]);
    }
  };

  const handleBulkAssign = async () => {
    // ASSIGN-4a: yalnız PERSONEL toplu ataması; tek `POST /cases/batch-update` çağrısı
    // (per-case PATCH döngüsü YOK). Avukat ('lawyer') geçici devre dışı → payload null → no-op.
    const payload = buildBulkAssignPayload(bulkAssignee.type, selectedCases, bulkAssignee.id);
    if (!payload) return;
    try {
      setProcessingIds(selectedCases);
      await api.post('/cases/batch-update', payload);
      fetchCases();
      setSelectedCases([]);
      setShowBulkAssignModal(false);
      setBulkAssignee({ type: "", id: "" });
    } catch (error: any) {
      alert(error.message || 'Toplu atama başarısız');
    } finally {
      setProcessingIds([]);
    }
  };

  const handleCopyCase = async (caseId: string) => {
    try {
      setProcessingIds(prev => [...prev, caseId]);
      alert('Dosya kopyalama özelliği yakında eklenecek');
    } finally {
      setProcessingIds(prev => prev.filter(id => id !== caseId));
    }
  };

  // Doküman indirme fonksiyonu - Eski Takipler için
  const handleDownloadDocument = async (caseId: string, format: 'docx' | 'pdf' | 'xml') => {
    const processingKey = `${caseId}-${format}`;
    try {
      setProcessingIds(prev => [...prev, processingKey]);
      
      // Doğrudan fetch kullan (blob response için)
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/template-engine/cases/${caseId}/documents/${format}?type=takip-talebi`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Doküman oluşturulamadı');
      }
      
      // Dosyayı indir
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `takip-talebi-${caseId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Doküman indirme hatası:', error);
      alert(error.message || 'Doküman indirilemedi');
    } finally {
      setProcessingIds(prev => prev.filter(id => id !== processingKey));
    }
  };

  // Seçili takipleri gerçek backend ucundan (ids filtresiyle) Excel/PDF indir.
  const exportCases = async (format: 'excel' | 'pdf', ids: string[]) => {
    if (ids.length === 0) return;
    setExportingCases(true);
    try {
      const params = new URLSearchParams();
      params.append('ids', ids.join(','));
      const res = await api.get(`/export-import/cases/${format}?${params.toString()}`, { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: format === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `takipler_${Date.now()}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e: any) {
      alert('Dışa aktarma hatası: ' + (e?.message || 'Bilinmeyen hata'));
    } finally {
      setExportingCases(false);
    }
  };

  // Üst toolbar: seçili takip yoksa uyar, varsa seçilenleri indir.
  const handleBulkExport = async (format: 'excel' | 'pdf') => {
    if (selectedCases.length === 0) {
      alert('Lütfen en az bir takip seçin');
      return;
    }
    await exportCases(format, selectedCases);
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
    setActiveQuickFilters([]);
    setOwnerFilter(null);
  };

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'search') return false;
    if (key === 'status' && (value as string[]).length === 0) return false;
    if (key === 'caseType' && (value as string[]).length === 0) return false;
    if (key === 'city' && (value as string[]).length === 0) return false;
    if (key === 'executionOfficeId' && (value as string[]).length === 0) return false;
    if (key === 'clientId' && (value as string[]).length === 0) return false;
    if (key === 'lawyerId' && (value as string[]).length === 0) return false;
    if (key === 'staffId' && (value as string[]).length === 0) return false;
    if (key === 'riskId' && (value as string[]).length === 0) return false;
    if (key === 'asamaId' && (value as string[]).length === 0) return false;
    if (key === 'dataQuality' && (value as string[]).length === 0) return false;
    if (key === 'currency' && value === 'all') return false;
    if (key === 'automationStatus' && value === 'all') return false;
    if (key === 'poaStatus' && value === 'all') return false;
    if (key === 'includeArchived' && !value) return false;
    if (key === 'dateFrom' && value === '') return false;
    if (key === 'dateTo' && value === '') return false;
    if (key === 'amountMin' && value === '') return false;
    if (key === 'amountMax' && value === '') return false;
    return Array.isArray(value) ? value.length > 0 : value !== "" && value !== false;
  }).length;

  const filteredOffices = filters.city.length > 0
    ? executionOffices.filter((o: any) => filters.city.includes(o.city))
    : executionOffices;

  const formatCurrency = (amount?: number, currency?: string) => {
    if (!amount) return "-";
    return new Intl.NumberFormat('tr-TR', { 
      style: 'currency', 
      currency: currency || 'TRY',
      minimumFractionDigits: 2 
    }).format(amount);
  };

  const formatDate = (date?: string) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString('tr-TR');
  };


  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-bold">Takip Yönetimi</h1>
          <p className="text-xs text-muted-foreground">
            {filteredCases.length} takip {selectedCases.length > 0 && `• ${selectedCases.length} seçili`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCases}
            className="p-2 hover:bg-muted rounded-lg"
            title="Yenile"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
              showAdvancedFilters ? 'bg-primary text-white border-primary' : 'hover:bg-muted'
            }`}
          >
            <Filter className="h-4 w-4" />
            Gelişmiş
            {activeFilterCount > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                showAdvancedFilters ? 'bg-white text-primary' : 'bg-primary text-white'
              }`}>
                {activeFilterCount}
              </span>
            )}
          </button>
          <Link
            href="/cases/new?new=true"
            className="inline-flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 text-sm rounded-lg hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Yeni Takip
          </Link>
        </div>
      </div>

      {/* Müvekkil Filtre Banner - URL'den clientId geldiğinde */}
      {urlClientId && urlClientName && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-800">
              <span className="font-medium">{urlClientName}</span> müvekkilinin dosyaları gösteriliyor
            </span>
            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
              {filteredCases.length} dosya
            </span>
          </div>
          <button
            onClick={() => {
              router.push('/cases');
              setFilters(prev => ({ ...prev, clientId: [] }));
              setUrlClientName(null);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 rounded transition-colors"
          >
            <X className="h-3 w-3" />
            Filtreyi Kaldır
          </button>
        </div>
      )}

      {/* Hızlı Filtre Chip'leri - Seçimlik Panel ile */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground flex-shrink-0">Hızlı Filtreler:</span>
        {/* SAHIPSIZ-DOSYALAR-G1b: izole "Sahipsiz" chip (generic smart-filter sisteminden bağımsız);
            sayı=getStats.ownerless (server-side doğru toplam); tık→server-side noOwner filtresi. Atama=mevcut toplu modal. */}
        <QuickFilterChip
          label="Sahipsiz"
          count={ownerlessCount}
          isActive={filters.noOwner}
          onClick={() => setFilters(prev => ({ ...prev, noOwner: !prev.noOwner }))}
          color="warning"
        />
        {visibleFilterIds.map((filterId) => {
          const qf = allQuickFilters.find(f => f.id === filterId);
          if (!qf) return null;
          return (
            <QuickFilterChip
              key={qf.id}
              label={qf.label}
              count={getQuickFilterCount(qf.id)}
              isActive={activeQuickFilters.includes(qf.id)}
              onClick={() => toggleQuickFilter(qf.id)}
              color={qf.color}
            />
          );
        })}
        
        {/* Filtre Seçim Butonu */}
        <div className="relative">
          <button
            onClick={() => setShowFilterPicker(!showFilterPicker)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-dashed rounded-full hover:bg-muted whitespace-nowrap"
          >
            <Plus className="h-3 w-3" />
            Filtre Ekle
          </button>
          
          {/* Filtre Seçim Paneli */}
          {showFilterPicker && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowFilterPicker(false)} 
              />
              <div className="fixed right-4 top-[180px] z-50 bg-white border rounded-lg shadow-xl p-4 w-[600px] max-h-[500px] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">Hızlı Filtre Seç</h3>
                  <button 
                    onClick={() => setShowFilterPicker(false)}
                    className="p-1 hover:bg-muted rounded"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Seçtiğiniz filtreler üst barda görünür. Tıklayarak aktif/pasif yapabilirsiniz.
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  {quickFilterCategories.map((category) => (
                    <div key={category.id} className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <span>{category.icon}</span>
                        {category.label}
                      </h4>
                      <div className="space-y-1">
                        {category.filters.map((filter) => {
                          const isVisible = visibleFilterIds.includes(filter.id);
                          const count = getQuickFilterCount(filter.id);
                          return (
                            <label
                              key={filter.id}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                                isVisible ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={() => toggleVisibleFilter(filter.id)}
                                className="rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span className="text-xs flex-1">{filter.label}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                count > 0 
                                  ? filter.color === 'danger' ? 'bg-red-100 text-red-700'
                                    : filter.color === 'warning' ? 'bg-yellow-100 text-yellow-700'
                                    : filter.color === 'success' ? 'bg-green-100 text-green-700'
                                    : filter.color === 'info' ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {count}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 pt-3 border-t flex items-center justify-between">
                  <button
                    onClick={() => setVisibleFilterIds(defaultVisibleFilterIds)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Varsayılana Dön
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {visibleFilterIds.length} filtre seçili
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
        
        <div className="h-4 w-px bg-border mx-2" />
        
        {/* Kayıtlı Görünümler */}
        {savedFilters.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground flex-shrink-0">Kayıtlı:</span>
            {savedFilters.map((sf) => (
              <button
                key={sf.id}
                onClick={() => applySavedFilter(sf)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-full hover:bg-muted whitespace-nowrap"
              >
                <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                {sf.name}
                <X 
                  className="h-3 w-3 hover:text-red-500" 
                  onClick={(e) => { e.stopPropagation(); deleteSavedFilter(sf.id); }}
                />
              </button>
            ))}
          </>
        )}
        <button
          onClick={() => setShowSaveFilterModal(true)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-dashed rounded-full hover:bg-muted whitespace-nowrap"
        >
          <Plus className="h-3 w-3" />
          Görünüm Kaydet
        </button>
      </div>

      {/* Aktif Hızlı Filtre Help Banner */}
      {activeQuickFilters.length > 0 && (() => {
        const activeFilter = allQuickFilters.find(f => f.id === activeQuickFilters[0]);
        if (!activeFilter?.helpText) return null;
        return (
          <QuickFilterHelpBanner
            filterId={activeFilter.id}
            filterLabel={activeFilter.label}
            count={getQuickFilterCount(activeFilter.id)}
            helpText={activeFilter.helpText}
            color={activeFilter.color}
            onClose={() => {
              // İlk aktif filtreyi kapat
              toggleQuickFilter(activeFilter.id);
            }}
          />
        );
      })()}

      {/* Aktif Filtre Pills */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">Aktif Filtreler:</span>
          {filters.status.length > 0 && (
            <ActiveFilterPill
              label="Durum"
              value={filters.status.map(s => statusLabels[s] || s).join(', ')}
              onRemove={() => setFilters(prev => ({ ...prev, status: [] }))}
            />
          )}
          {filters.caseType.length > 0 && (
            <ActiveFilterPill
              label="Tür"
              value={filters.caseType.map(t => caseTypeLabels[t] || t).join(', ')}
              onRemove={() => setFilters(prev => ({ ...prev, caseType: [] }))}
            />
          )}
          {filters.city.length > 0 && (
            <ActiveFilterPill
              label="İl"
              value={filters.city.join(', ')}
              onRemove={() => setFilters(prev => ({ ...prev, city: [], executionOfficeId: [] }))}
            />
          )}
          {filters.clientId.length > 0 && (
            <ActiveFilterPill
              label="Müvekkil"
              value={`${filters.clientId.length} seçili`}
              onRemove={() => setFilters(prev => ({ ...prev, clientId: [] }))}
            />
          )}
          {filters.lawyerId.length > 0 && (
            <ActiveFilterPill
              label="Avukat"
              value={`${filters.lawyerId.length} seçili`}
              onRemove={() => setFilters(prev => ({ ...prev, lawyerId: [] }))}
            />
          )}
          {filters.dataQuality.length > 0 && (
            <ActiveFilterPill
              label="Eksik Veri"
              value={filters.dataQuality.length.toString()}
              onRemove={() => setFilters(prev => ({ ...prev, dataQuality: [] }))}
            />
          )}
          {(filters.dateFrom || filters.dateTo) && (
            <ActiveFilterPill
              label="Tarih"
              value={`${filters.dateFrom || '...'} - ${filters.dateTo || '...'}`}
              onRemove={() => setFilters(prev => ({ ...prev, dateFrom: '', dateTo: '' }))}
            />
          )}
          <button
            onClick={clearFilters}
            className="text-xs text-red-600 hover:underline ml-2"
          >
            Tümünü Temizle
          </button>
        </div>
      )}

      {/* Hızlı Filtreler (Üst Satır) */}
      <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-muted/30 rounded-lg">
        {/* Arama */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Dosya no, borçlu, müvekkil ara..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Statü - MultiSelect */}
        <MultiSelectDropdown
          options={[
            { value: "DERDEST", label: "Derdest" },
            { value: "KAPALI", label: "Kapalı" },
            { value: "ASKIDA", label: "Askıda" },
            { value: "ARSIV", label: "Arşiv" },
          ]}
          selected={filters.status}
          onChange={(selected) => setFilters(prev => ({ ...prev, status: selected }))}
          placeholder="Tüm Durumlar"
          className="min-w-[140px]"
          enableSearch={false}
        />

        {/* Takip Türü - MultiSelect */}
        <MultiSelectDropdown
          options={Object.entries(caseTypeLabels).map(([key, label]) => ({ value: key, label }))}
          selected={filters.caseType}
          onChange={(selected) => setFilters(prev => ({ ...prev, caseType: selected }))}
          placeholder="Tüm Türler"
          className="min-w-[140px]"
          enableSearch={false}
        />

        {/* Tarih Aralığı */}
        <div className="flex items-center gap-1">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            className="px-2 py-2 text-sm border rounded-lg w-32"
            placeholder="Başlangıç"
          />
          <span className="text-muted-foreground">-</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            className="px-2 py-2 text-sm border rounded-lg w-32"
            placeholder="Bitiş"
          />
        </div>

        {/* Tutar Aralığı */}
        <div className="flex items-center gap-1">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <input
            type="number"
            value={filters.amountMin}
            onChange={(e) => setFilters(prev => ({ ...prev, amountMin: e.target.value }))}
            className="px-2 py-2 text-sm border rounded-lg w-24"
            placeholder="Min"
          />
          <span className="text-muted-foreground">-</span>
          <input
            type="number"
            value={filters.amountMax}
            onChange={(e) => setFilters(prev => ({ ...prev, amountMax: e.target.value }))}
            className="px-2 py-2 text-sm border rounded-lg w-24"
            placeholder="Max"
          />
        </div>

        {/* Arşiv Dahil */}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={filters.includeArchived}
            onChange={(e) => setFilters(prev => ({ ...prev, includeArchived: e.target.checked }))}
            className="rounded"
          />
          Arşiv dahil
        </label>

        {/* Temizle */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
          >
            <X className="h-3 w-3" />
            Temizle
          </button>
        )}
      </div>

      {/* Gelişmiş Filtreler Paneli */}
      {showAdvancedFilters && (
        <div className="mb-3 p-4 border rounded-lg bg-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">Gelişmiş Filtreler</h3>
            <button onClick={() => setShowAdvancedFilters(false)} className="p-1 hover:bg-muted rounded">
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {/* İl - MultiSelect */}
            <MultiSelectDropdown
              label="İl"
              options={cities.map(city => ({ value: city, label: city }))}
              selected={filters.city}
              onChange={(selected) => setFilters(prev => ({ ...prev, city: selected, executionOfficeId: [] }))}
              placeholder="Tümü"
              searchPlaceholder="İl ara..."
            />

            {/* İcra Dairesi - MultiSelect */}
            <MultiSelectDropdown
              label="İcra Dairesi"
              options={filteredOffices.map((office: any) => ({ 
                value: office.id, 
                label: office.name 
              }))}
              selected={filters.executionOfficeId}
              onChange={(selected) => setFilters(prev => ({ ...prev, executionOfficeId: selected }))}
              placeholder="Tümü"
              searchPlaceholder="İcra dairesi ara..."
            />

            {/* Müvekkil - MultiSelect */}
            <MultiSelectDropdown
              label="Müvekkil"
              options={clients.map((client: any) => ({ 
                value: client.id, 
                label: client.displayName || client.name 
              }))}
              selected={filters.clientId}
              onChange={(selected) => setFilters(prev => ({ ...prev, clientId: selected }))}
              placeholder="Tümü"
              searchPlaceholder="Müvekkil ara..."
            />

            {/* Avukat - MultiSelect */}
            <MultiSelectDropdown
              label="Avukat"
              options={lawyers.map((lawyer: any) => ({ 
                value: lawyer.id, 
                label: `${lawyer.name} ${lawyer.surname}` 
              }))}
              selected={filters.lawyerId}
              onChange={(selected) => setFilters(prev => ({ ...prev, lawyerId: selected }))}
              placeholder="Tümü"
              searchPlaceholder="Avukat ara..."
            />

            {/* M2-G5d-1b: "Dosya Sorumlusu" filtresi = gerçek kişi (server-side responsibleLawyerId/StaffId). */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dosya Sorumlusu</label>
              <ResponsibleCandidateSelect
                value={ownerFilter}
                onChange={setOwnerFilter}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>

            {/* Risk - MultiSelect */}
            <MultiSelectDropdown
              label="Risk"
              options={[
                { value: "high", label: "Yüksek Riskli" },
                ...risks.map((risk: any) => ({ value: risk.id, label: risk.name }))
              ]}
              selected={filters.riskId}
              onChange={(selected) => setFilters(prev => ({ ...prev, riskId: selected }))}
              placeholder="Tümü"
              enableSearch={false}
            />

            {/* Aşama - MultiSelect */}
            <MultiSelectDropdown
              label="Aşama"
              options={asamalar.map((asama: any) => ({ value: asama.id, label: asama.name }))}
              selected={filters.asamaId}
              onChange={(selected) => setFilters(prev => ({ ...prev, asamaId: selected }))}
              placeholder="Tümü"
              searchPlaceholder="Aşama ara..."
            />

            {/* Para Birimi */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Para Birimi</label>
              <select
                value={filters.currency}
                onChange={(e) => setFilters(prev => ({ ...prev, currency: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded"
              >
                <option value="all">Tümü</option>
                <option value="TRY">TL</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            {/* Otomasyon */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Otomasyon</label>
              <select
                value={filters.automationStatus}
                onChange={(e) => setFilters(prev => ({ ...prev, automationStatus: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded"
              >
                <option value="all">Tümü</option>
                <option value="enabled">Açık</option>
                <option value="disabled">Kapalı</option>
              </select>
            </div>

            {/* Vekalet Durumu */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Vekalet</label>
              <select
                value={filters.poaStatus}
                onChange={(e) => setFilters(prev => ({ ...prev, poaStatus: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border rounded"
              >
                <option value="all">Tümü</option>
                <option value="valid">Geçerli</option>
                <option value="expiring">30 Gün İçinde Bitecek</option>
                <option value="expired">Süresi Dolmuş</option>
                <option value="missing">Eksik</option>
              </select>
            </div>

            {/* Veri Kalitesi - MultiSelect */}
            <MultiSelectDropdown
              label="Eksik Veri"
              options={[
                { value: "no-address", label: "Adres Eksik" },
                { value: "no-uyap", label: "UYAP Kodu Eksik" },
                { value: "no-article4", label: "4. Madde Eksik" },
              ]}
              selected={filters.dataQuality}
              onChange={(selected) => setFilters(prev => ({ ...prev, dataQuality: selected }))}
              placeholder="Tümü"
              enableSearch={false}
            />
          </div>
        </div>
      )}

      {/* Toplu İşlem Toolbar */}
      {selectedCases.length > 0 && (
        <div className="mb-3 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{selectedCases.length} dosya seçili</span>
            <button
              onClick={() => setSelectedCases([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Seçimi Temizle
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Toplu Belge */}
            <button
              onClick={() => setShowBulkDocModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-muted"
            >
              <FileText className="h-4 w-4" />
              Belge Oluştur
            </button>

            {/* Excel İndir */}
            <button
              onClick={() => handleBulkExport('excel')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Excel
            </button>

            {/* PDF İndir */}
            <button
              onClick={() => handleBulkExport('pdf')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              PDF
            </button>

            {/* Statü Ata */}
            <button
              onClick={() => setShowBulkStatusModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-muted"
            >
              <UserCheck className="h-4 w-4" />
              Statü Ata
            </button>

            {/* Sorumlu Ata */}
            <button
              onClick={() => setShowBulkAssignModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-muted"
            >
              <UserCheck className="h-4 w-4" />
              Dosya Sorumlusu Ata
            </button>

            {/* SMS Gönder */}
            <button
              onClick={() => alert('SMS gönderme özelliği yakında eklenecek')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-muted"
            >
              <MessageSquare className="h-4 w-4" />
              SMS
            </button>

            {/* E-posta Gönder */}
            <button
              onClick={() => alert('E-posta gönderme özelliği yakında eklenecek')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-muted"
            >
              <Mail className="h-4 w-4" />
              E-posta
            </button>

            {/* Arşivle */}
            <button
              onClick={() => setShowBulkActionConfirm('archive')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg hover:bg-yellow-100"
            >
              <Archive className="h-4 w-4" />
              Arşivle
            </button>
          </div>
        </div>
      )}

      {/* Tablo */}
      <div className="flex-1 overflow-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0 z-10 shadow-sm">
            <tr className="border-b">
              <th className="p-3 text-left w-10 bg-muted">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedCases.length === sortedCases.length && sortedCases.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                  {/* Seçim varsa mini toolbar göster */}
                  {selectedCases.length > 0 && (
                    <div className="flex items-center gap-1 ml-2">
                      <span className="text-xs font-medium text-primary whitespace-nowrap">
                        {selectedCases.length} seçili
                      </span>
                      <button
                        onClick={() => setSelectedCases([])}
                        title="Seçimi Temizle"
                        className="p-1 hover:bg-muted rounded"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </th>
              {/* 1. DOSYA TAKİP NO */}
              <th 
                className="p-3 text-left bg-muted cursor-pointer hover:bg-gray-200 select-none"
                onClick={() => handleSort("fileNumber")}
              >
                <div className="flex items-center">Takip No <SortIcon field="fileNumber" /></div>
              </th>
              {/* 2. TARİH */}
              <th 
                className="p-3 text-left bg-muted cursor-pointer hover:bg-gray-200 select-none"
                onClick={() => handleSort("date")}
              >
                <div className="flex items-center">Tarih <SortIcon field="date" /></div>
              </th>
              {/* 3. İCRA MERCİİ */}
              <th className="p-3 text-left bg-muted">
                <div className="flex items-center">İcra Mercii</div>
              </th>
              {/* 4. İCRA DOSYA NO */}
              <th className="p-3 text-left bg-muted">
                <div className="flex items-center">İcra Dosya No</div>
              </th>
              {/* 5. MÜVEKKİL */}
              <th 
                className="p-3 text-left bg-muted cursor-pointer hover:bg-gray-200 select-none"
                onClick={() => handleSort("client")}
              >
                <div className="flex items-center">Müvekkil <SortIcon field="client" /></div>
              </th>
              {/* 6. BORÇLU */}
              <th 
                className="p-3 text-left bg-muted cursor-pointer hover:bg-gray-200 select-none"
                onClick={() => handleSort("debtor")}
              >
                <div className="flex items-center">Borçlu <SortIcon field="debtor" /></div>
              </th>
              {/* 7. TAKİP BİLGİ (Tür + Yol) */}
              <th 
                className="p-3 text-left bg-muted cursor-pointer hover:bg-gray-200 select-none"
                onClick={() => handleSort("type")}
              >
                <div className="flex items-center">Takip Bilgi <SortIcon field="type" /></div>
              </th>
              {/* 8. FİNANS */}
              <th 
                className="p-3 text-right bg-muted cursor-pointer hover:bg-gray-200 select-none"
                onClick={() => handleSort("amount")}
              >
                <div className="flex items-center justify-end">Finans <SortIcon field="amount" /></div>
              </th>
              {/* 9. DURUM */}
              <th 
                className="p-3 text-left bg-muted cursor-pointer hover:bg-gray-200 select-none"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center">Durum <SortIcon field="status" /></div>
              </th>
              {/* 10. EKİP */}
              <th className="p-3 text-left bg-muted">
                <div className="flex items-center">Ekip</div>
              </th>
              {/* 11. İŞLEMLER */}
              <th className="p-3 text-center w-24 bg-muted">
                {selectedCases.length > 0 ? (
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => setShowBulkDocModal(true)}
                      title="Belge Oluştur"
                      className="p-1.5 hover:bg-primary/10 rounded text-primary"
                    >
                      <FileText className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleBulkExport('excel')}
                      title="Excel İndir"
                      className="p-1.5 hover:bg-green-100 rounded text-green-600"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => alert('E-posta gönderme özelliği yakında')}
                      title="E-posta Gönder"
                      className="p-1.5 hover:bg-blue-100 rounded text-blue-600"
                    >
                      <Mail className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setShowBulkActionConfirm('archive')}
                      title="Arşivle"
                      className="p-1.5 hover:bg-yellow-100 rounded text-yellow-600"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setShowBulkActionConfirm('delete')}
                      title="Sil"
                      className="p-1.5 hover:bg-red-100 rounded text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  "İşlemler"
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="p-8 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  <p className="text-muted-foreground">Yükleniyor...</p>
                </td>
              </tr>
            ) : sortedCases.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-8 text-center text-muted-foreground">
                  Takip bulunamadı
                </td>
              </tr>
            ) : (
              sortedCases.map((c) => (
                <tr 
                  key={c.id} 
                  onClick={() => router.push(`/cases/${c.id}`)}
                  className={`border-t hover:bg-muted/30 cursor-pointer ${selectedCases.includes(c.id) ? 'bg-primary/5' : ''} ${c.isArchived ? 'opacity-60' : ''}`}
                >
                  {/* Checkbox */}
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedCases.includes(c.id)}
                      onChange={() => toggleSelectCase(c.id)}
                      className="rounded"
                    />
                  </td>
                  {/* 1. Takip No */}
                  <td className="p-3">
                    <span className="font-medium text-muted-foreground">{c.fileNumber}</span>
                    {c.isArchived && (
                      <Badge variant="default" className="ml-1 text-xs">Arşiv</Badge>
                    )}
                  </td>
                  {/* 2. Tarih */}
                  <td className="p-3 text-muted-foreground">
                    {formatDate(c.startDate || c.createdAt)}
                  </td>
                  {/* 3. İcra Mercii */}
                  <td className="p-3 text-sm">
                    {c.executionOffice?.name || "-"}
                  </td>
                  {/* 4. İcra Dosya No */}
                  <td className="p-3">
                    <span className="font-medium text-primary">{c.executionFileNumber || "-"}</span>
                  </td>
                  {/* 5. Müvekkil */}
                  <td className="p-3">
                    {c.client?.displayName || c.client?.name || "-"}
                  </td>
                  {/* 6. Borçlu */}
                  <td className="p-3">
                    {c.debtors?.[0]?.debtor?.name || "-"}
                    {(c.debtors?.length ?? 0) > 1 && (
                      <span className="text-xs text-muted-foreground ml-1">+{(c.debtors?.length ?? 0) - 1}</span>
                    )}
                  </td>
                  {/* 7. Takip Bilgi (Tür) */}
                  <td className="p-3">
                    <Badge variant="default" className="w-[72px] h-[40px] justify-center items-center text-center leading-tight">
                      {caseTypeLabels[c.type] || c.type}
                    </Badge>
                  </td>
                  {/* 8. Finans */}
                  <td className="p-3 text-right font-mono">
                    {formatCurrency(c.principalAmount, c.currency)}
                  </td>
                  {/* 9. Durum */}
                  <td className="p-3">
                    <Badge variant={statusColors[c.caseStatus || c.status] || "default"}>
                      {statusLabels[c.caseStatus || c.status] || c.caseStatus || c.status}
                    </Badge>
                    {/* Eksiklik rozetleri - aktif filtre varsa göster */}
                    {activeQuickFilters.length > 0 && (() => {
                      const activeFilter = allQuickFilters.find(f => f.id === activeQuickFilters[0]);
                      if (!activeFilter?.hasFix || !activeFilter?.fixTarget) return null;
                      
                      const hasIssue = (() => {
                        switch (activeFilter.id) {
                          case "no-address":
                            return !c.debtors?.some(d => d.debtor.address);
                          case "no-poa":
                            return c.hasValidPoa === false;
                          case "no-uyap":
                            return !c.uyapBirimKodu && !c.executionOffice?.uyapCode;
                          case "no-identity":
                            return !c.debtors?.every(d => d.debtor.identityNo);
                          case "no-contact":
                            return !c.debtors?.some(d => d.debtor.phone || d.debtor.email);
                          case "automation-off":
                            return !c.isAutomationEnabled;
                          case "automation-error":
                            return c.automationStatus === "ERROR";
                          default:
                            return true;
                        }
                      })();
                      
                      if (!hasIssue) return null;
                      
                      return (
                        <MissingBadge
                          label={activeFilter.label}
                          color={activeFilter.color === "danger" ? "danger" : activeFilter.color === "warning" ? "warning" : "info"}
                          onFix={() => {
                            router.push(`/cases/${c.id}?fix=${activeFilter.fixTarget?.key}&fromFilter=${activeFilter.id}`);
                          }}
                        />
                      );
                    })()}
                  </td>
                  {/* 10. Ekip */}
                  <td className="p-3">
                    {(c.lawyers?.length ?? 0) > 0 ? (
                      <div className="flex -space-x-1">
                        {c.lawyers?.slice(0, 3).map((l: any, i: number) => (
                          <div
                            key={i}
                            className="w-6 h-6 rounded-full bg-primary/10 border border-white flex items-center justify-center text-xs font-medium text-primary"
                            title={l.lawyer?.name || l.name}
                          >
                            {(l.lawyer?.name || l.name || "?").charAt(0)}
                          </div>
                        ))}
                        {(c.lawyers?.length ?? 0) > 3 && (
                          <div className="w-6 h-6 rounded-full bg-muted border border-white flex items-center justify-center text-xs">
                            +{(c.lawyers?.length ?? 0) - 3}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                  {/* 10. İşlemler */}
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        onClick={() => setActionMenuOpen(actionMenuOpen === c.id ? null : c.id)}
                        className="p-1.5 hover:bg-muted rounded"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {actionMenuOpen === c.id && (
                        <div className="absolute right-0 top-full mt-1 w-56 bg-white border rounded-lg shadow-lg z-10">
                          <Link
                            href={`/cases/${c.id}`}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                          >
                            <Eye className="h-4 w-4" />
                            Görüntüle
                          </Link>
                          <Link
                            href={`/cases/${c.id}/edit`}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                          >
                            <Edit2 className="h-4 w-4" />
                            Düzenle
                          </Link>
                          <button
                            onClick={() => { handleCopyCase(c.id); setActionMenuOpen(null); }}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted w-full text-left"
                          >
                            <Copy className="h-4 w-4" />
                            Kopyala
                          </button>
                          <hr className="my-1" />
                          {/* Doküman İndirme Butonları */}
                          <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium">
                            Takip Talebi İndir
                          </div>
                          <button
                            onClick={() => { handleDownloadDocument(c.id, 'docx'); setActionMenuOpen(null); }}
                            disabled={processingIds.includes(`${c.id}-docx`)}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-blue-50 w-full text-left text-blue-600"
                          >
                            <FileText className="h-4 w-4" />
                            {processingIds.includes(`${c.id}-docx`) ? 'İndiriliyor...' : 'Word (.docx)'}
                          </button>
                          <button
                            onClick={() => { handleDownloadDocument(c.id, 'pdf'); setActionMenuOpen(null); }}
                            disabled={processingIds.includes(`${c.id}-pdf`)}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 w-full text-left text-red-600"
                          >
                            <FileText className="h-4 w-4" />
                            {processingIds.includes(`${c.id}-pdf`) ? 'İndiriliyor...' : 'PDF (.pdf)'}
                          </button>
                          <button
                            onClick={() => { handleDownloadDocument(c.id, 'xml'); setActionMenuOpen(null); }}
                            disabled={processingIds.includes(`${c.id}-xml`)}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-green-50 w-full text-left text-green-600"
                          >
                            <FileText className="h-4 w-4" />
                            {processingIds.includes(`${c.id}-xml`) ? 'İndiriliyor...' : 'XML (.xml)'}
                          </button>
                          {/* Tek takibi liste olarak (Excel/PDF) indir - /export-import/cases ids filtresi */}
                          <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium">
                            Liste Olarak İndir
                          </div>
                          <button
                            onClick={() => { exportCases('excel', [c.id]); setActionMenuOpen(null); }}
                            disabled={exportingCases}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-green-50 w-full text-left text-green-600 disabled:opacity-50"
                          >
                            <Download className="h-4 w-4" />
                            Excel (.xlsx)
                          </button>
                          <button
                            onClick={() => { exportCases('pdf', [c.id]); setActionMenuOpen(null); }}
                            disabled={exportingCases}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 w-full text-left text-red-600 disabled:opacity-50"
                          >
                            <Download className="h-4 w-4" />
                            PDF (.pdf)
                          </button>
                          <hr className="my-1" />
                          <button
                            onClick={() => { setShowDeleteConfirm(c.id); setActionMenuOpen(null); }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                          >
                            <Trash2 className="h-4 w-4" />
                            Sil / Arşivle
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Silme/Arşivleme Onay Modalı */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-yellow-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold">Dosya İşlemi</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              Bu dosyayı arşivlemek mi yoksa kalıcı olarak silmek mi istiyorsunuz?
              <br /><br />
              <strong>Arşivleme:</strong> Dosya gizlenir ama geri alınabilir.
              <br />
              <strong>Kalıcı Silme:</strong> Dosya tamamen silinir, geri alınamaz.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
              >
                İptal
              </button>
              <button
                onClick={() => handleArchive(showDeleteConfirm)}
                disabled={processingIds.includes(showDeleteConfirm)}
                className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
              >
                {processingIds.includes(showDeleteConfirm) ? 'İşleniyor...' : 'Arşivle'}
              </button>
              <button
                onClick={() => handleHardDelete(showDeleteConfirm)}
                disabled={processingIds.includes(showDeleteConfirm)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {processingIds.includes(showDeleteConfirm) ? 'İşleniyor...' : 'Kalıcı Sil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toplu Arşivleme Onay Modalı */}
      {showBulkActionConfirm === 'archive' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-yellow-100 rounded-full">
                <Archive className="h-6 w-6 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold">Toplu Arşivleme</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              <strong>{selectedCases.length}</strong> dosyayı arşivlemek istediğinize emin misiniz?
              <br /><br />
              Arşivlenen dosyalar "Arşiv dahil" filtresi ile görüntülenebilir ve geri alınabilir.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBulkActionConfirm(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
              >
                İptal
              </button>
              <button
                onClick={handleBulkArchive}
                disabled={processingIds.length > 0}
                className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
              >
                {processingIds.length > 0 ? 'İşleniyor...' : `${selectedCases.length} Dosyayı Arşivle`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toplu Silme Onay Modalı */}
      {showBulkActionConfirm === 'delete' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold">Toplu Silme</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              <strong className="text-red-600">{selectedCases.length}</strong> dosyayı kalıcı olarak silmek istediğinize emin misiniz?
              <br /><br />
              <span className="text-red-600 font-medium">⚠️ Bu işlem geri alınamaz!</span>
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBulkActionConfirm(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
              >
                İptal
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={processingIds.length > 0}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {processingIds.length > 0 ? 'İşleniyor...' : `${selectedCases.length} Dosyayı Sil`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toplu Statü Atama Modalı */}
      {showBulkStatusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Toplu Statü Atama</h3>
            <p className="text-muted-foreground mb-4">
              <strong>{selectedCases.length}</strong> dosyaya yeni statü atayın:
            </p>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg mb-4"
            >
              <option value="">Statü Seçin</option>
              <option value="DERDEST">Derdest</option>
              <option value="KAPALI">Kapalı</option>
              <option value="ASKIDA">Askıda</option>
              <option value="ARSIV">Arşiv</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowBulkStatusModal(false); setBulkStatus(""); }}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
              >
                İptal
              </button>
              <button
                onClick={handleBulkStatusChange}
                disabled={!bulkStatus || processingIds.length > 0}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {processingIds.length > 0 ? 'İşleniyor...' : 'Uygula'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toplu Sorumlu Atama Modalı */}
      {showBulkAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Toplu Dosya Sorumlusu Atama</h3>
            <p className="text-muted-foreground mb-4">
              <strong>{selectedCases.length}</strong> dosyaya Dosya Sorumlusu atayın:
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Atama Türü</label>
                <select
                  value={bulkAssignee.type}
                  onChange={(e) => setBulkAssignee({ type: e.target.value, id: "" })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Seçin</option>
                  <option value="lawyer" disabled>Avukat (yakında)</option>
                  <option value="staff">Personel</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Avukat toplu atama, sorumlu-avukat modeli ile gelecek.
              </p>
              {bulkAssignee.type === 'staff' && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Personel</label>
                  <select
                    value={bulkAssignee.id}
                    onChange={(e) => setBulkAssignee(prev => ({ ...prev, id: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Personel Seçin</option>
                    {staff.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} {s.surname}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowBulkAssignModal(false); setBulkAssignee({ type: "", id: "" }); }}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
              >
                İptal
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={!bulkAssignee.id || processingIds.length > 0}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {processingIds.length > 0 ? 'İşleniyor...' : 'Uygula'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtre Kaydetme Modalı */}
      {showSaveFilterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Filtreyi Kaydet</h3>
            <p className="text-muted-foreground mb-4">
              Mevcut filtre ayarlarını kaydedin ve hızlıca erişin.
            </p>
            <input
              type="text"
              value={newFilterName}
              onChange={(e) => setNewFilterName(e.target.value)}
              placeholder="Filtre adı (örn: UETS Bekleyenler)"
              className="w-full px-3 py-2 border rounded-lg mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowSaveFilterModal(false); setNewFilterName(""); }}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
              >
                İptal
              </button>
              <button
                onClick={saveFilter}
                disabled={!newFilterName.trim()}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toplu Belge Oluşturma Modalı */}
      <BulkDocumentGenerator
        selectedCaseIds={selectedCases}
        isOpen={showBulkDocModal}
        onClose={() => {
          setShowBulkDocModal(false);
          setSelectedCases([]);
        }}
      />

      {/* Click outside to close action menu */}
      {actionMenuOpen && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setActionMenuOpen(null)}
        />
      )}
    </div>
  );
}
