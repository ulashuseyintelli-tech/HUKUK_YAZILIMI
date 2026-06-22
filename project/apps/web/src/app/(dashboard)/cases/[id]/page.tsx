"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Edit,
  Share2,
  Trash2,
  RefreshCw,
  Save,
  X,
  AlertTriangle,
  Link2,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Building2,
  CreditCard,
  Copy,
  Info,
  User,
  Shield,
  Bell,
  FileText,
  Eye,
  Settings,
  Phone,
  Mail,
  MapPin,
  Users,
  Receipt,
  Clock,
  FolderOpen,
  MessageSquare,
  PlusCircle,
  PauseCircle,
  Search,
} from "lucide-react";
import { api, DebtorListItemDTO, DebtorsSummaryDTO, DebtorDetailDTO } from "@/lib/api";
import { caseStaffEditFields, buildCaseStaffPatch } from "@/lib/case-staff-edit";
import { useAuth } from "@/lib/auth-context";
import { PaymentInstructionModal } from "@/components/payment/PaymentInstructionModal";
import { ExpenseRequestModal, BalanceWidget, ExpenseRequestList } from "@/components/expense";
import { SendMessageModal } from "@/components/message/SendMessageModal";
import { DebtorsSummaryBar, DebtorRow, ServiceStatusBadge, AlertBadge, DebtorDetailDrawer } from "@/components/debtor";
import { UyapExportButton } from "@/components/uyap-export/UyapExportButton";
import { DueModal, CollectionModal, HesapOzetiPanel } from "@/components/finance";
import { FaizDokumuPanel } from "@/components/interest";
import { OperationDeck } from "@/components/case-detail";
import IntakeLinksCard from "@/components/case/IntakeLinksCard";
import { ClaimItemPanel } from "@/components/claim-item";
import { ResponsiblePersonPicker } from "@/components/case/responsible-person-picker";

// ============================================
// TİPLER
// ============================================

interface BankAccount {
  id: string;
  bankName: string;
  branchName?: string;
  iban: string;
  accountHolder?: string;
  isPrimary?: boolean;
}

interface CaseDetail {
  id: string;
  fileNumber: string;
  executionFileNumber?: string;
  type: string;
  subType?: string;
  status: string;
  caseStatus: string;
  executionPath: string;
  caseDate: string;
  principalAmount?: number;
  currency?: string;
  uyapBirimKodu?: string;
  createdAt: string;
  workflowStage?: string;
  subCategory?: string;
  sorumluPersonel?: { id: string; name: string; surname: string }; // Dosya Sorumlusu (Case.sorumluPersonelId → User; koordinatör)
  lastAutoActionAt?: string; // Son işlem tarihi (eski alan)
  lastEnforcementActionAt?: string; // Son icrai işlem tarihi (İİK 78 için)
  executionOffice?: {
    id: string;
    name: string;
    city: string;
    uyapCode?: string;
    bankName?: string;
    branchName?: string;
    iban?: string;
  };
  client?: {
    id: string;
    name: string;
    displayName?: string;
    type?: 'INDIVIDUAL' | 'COMPANY' | 'PUBLIC';
    tckn?: string;
    vkn?: string;
    taxOffice?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    district?: string;
    bankAccounts?: BankAccount[];
    isActive?: boolean; // RFA-010: pasif müvekkil [Pasif] etiketi için
  };
  caseClients?: {
    id: string;
    role?: string;
    client: {
      id: string;
      name: string;
      displayName?: string;
      type?: 'INDIVIDUAL' | 'COMPANY' | 'PUBLIC';
      tckn?: string;
      vkn?: string;
      taxOffice?: string;
      phone?: string;
      email?: string;
      address?: string;
      city?: string;
      district?: string;
      bankAccounts?: BankAccount[];
      isActive?: boolean; // RFA-010: pasif müvekkil [Pasif] etiketi için
    };
  }[];
  debtors: {
    id: string;
    role: string;
    debtor: {
      id: string;
      name: string;
      displayName?: string;
      tckn?: string;
    };
  }[];
  lawyers?: {
    id: string;
    canSign: boolean;
    role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
    caseRole?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN'; // alias for role
    isResponsible?: boolean;
    casePermissions?: {
      canEditCase?: boolean;
      canGenerateDocs?: boolean;
      canSyncUYAP?: boolean;
      canViewFinance?: boolean;
      canEditFinance?: boolean;
      canChangeStatus?: boolean;
      canEditParties?: boolean;
    };
    receiveNotifications?: boolean;
    permissions?: {
      canEditCase?: boolean;
      canGenerateDocs?: boolean;
      canSyncUYAP?: boolean;
      canViewFinance?: boolean;
      canEditFinance?: boolean;
      canChangeStatus?: boolean;
      canEditParties?: boolean;
      receivesNotifications?: boolean;
    };
    lawyer: {
      id: string;
      name: string;
      surname: string;
      barNumber?: string;
      phone?: string;
      email?: string;
      address?: string;
      bankName?: string;
      branchName?: string;
      iban?: string;
      lawyerRank?: 'PARTNER' | 'MANAGER' | 'AUTHORIZED' | 'LAWYER' | 'INTERN';
      defaultPermissions?: {
        canEditCase?: boolean;
        canGenerateDocs?: boolean;
        canSyncUYAP?: boolean;
        canViewFinance?: boolean;
        canEditFinance?: boolean;
        canChangeStatus?: boolean;
        canEditParties?: boolean;
      };
      isActive?: boolean; // RFA-010: pasif avukat [Pasif] etiketi için
    };
  }[];
  staff?: {
    id: string;
    // PR-ASSIGN-3c: CaseStaff model alanları (getCaseStaff tüm CaseStaff scalar'larını döndürür).
    // Bayat `canSign` KALDIRILDI — lawyer-kopyasıydı, CaseStaff modelinde yok (bkz. case-staff-edit.ts).
    roleOnCase?: string;
    canEdit?: boolean;
    canApprove?: boolean;
    canView?: boolean;
    receiveNotifications?: boolean;
    staffMember: {
      id: string;
      firstName: string;
      lastName: string;
      staffType?: string;
      phone?: string;
      email?: string;
      isActive?: boolean; // RFA-010: pasif personel [Pasif] etiketi için
    };
  }[];
  claimItems?: any[];
  instruments?: any[];
  formType?: { id: string; name: string; code: string };
}

// Avukat Drawer için tip
interface SelectedLawyer {
  caseLawyerId: string;
  lawyerId: string;
  name: string;
  surname: string;
  barNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  bankName?: string;
  branchName?: string;
  iban?: string;
  canSign: boolean;
  caseRole?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
  lawyerRank?: 'PARTNER' | 'MANAGER' | 'AUTHORIZED' | 'LAWYER' | 'INTERN';
  permissions?: {
    canEditCase?: boolean;
    canGenerateDocs?: boolean;
    canSyncUYAP?: boolean;
    canViewFinance?: boolean;
    canEditFinance?: boolean;
    canChangeStatus?: boolean;
    canEditParties?: boolean;
    receivesNotifications?: boolean;
  };
}

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

const formatDate = (date: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('tr-TR');
};

const formatDateTime = (date: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('tr-TR', { 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const calculateDayCount = (startDate: string): number => {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getDayCountStyle = (days: number) => {
  if (days <= 180) return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' };
  if (days <= 720) return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' };
  return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' };
};

// Kalan gün hesaplama (son icrai işlem tarihinden 365 gün - İİK 78)
const INACTIVITY_THRESHOLD_DAYS = 365; // Büro ayarından alınabilir

const calculateRemainingDays = (caseDate: string, lastEnforcementDate?: string): number => {
  // Son icrai işlem tarihi varsa onu kullan, yoksa takip açılış tarihini
  const baseDate = lastEnforcementDate ? new Date(lastEnforcementDate) : new Date(caseDate);
  const now = new Date();
  const daysPassed = Math.ceil((now.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
  return INACTIVITY_THRESHOLD_DAYS - daysPassed;
};

// Kalan gün renk skalası ve etiket - rafine renkler
const getRemainingDaysStyle = (days: number) => {
  if (days <= 0) return { text: 'text-white', bg: 'bg-black', border: 'border-black', label: 'Kritik' };
  if (days <= 60) return { text: 'text-red-600', bg: 'bg-red-100', border: 'border-red-300', label: 'Riskli' };
  if (days <= 180) return { text: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-300', label: 'Dikkat' };
  return { text: 'text-[#1E8E5A]', bg: 'bg-[#E6F6EC]', border: 'border-[#BFE6CF]', label: 'Güvenli' };
};

// IBAN maskeleme
const maskIban = (iban: string) => {
  if (!iban || iban.length < 10) return iban;
  return `${iban.slice(0, 4)}...${iban.slice(-4)}`;
};

// Panoya kopyalama
const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    // Toast notification yerine basit alert (sonra toast eklenebilir)
    console.log(`${label} kopyalandı: ${text}`);
    return true;
  } catch (err) {
    console.error('Kopyalama hatası:', err);
    return false;
  }
};

const caseTypeLabels: Record<string, string> = {
  GENERAL_EXECUTION: "Genel Haciz Yoluyla Takip",
  MORTGAGE: "İpotekli Takip",
  PLEDGE: "Rehinli Takip",
  CHECK: "Kambiyo Senetleri (Çek)",
  BOND: "Kambiyo Senetleri (Senet)",
  RENTAL: "Kira Takibi",
  BANKRUPTCY: "İflas Takibi",
  OTHER: "Diğer",
};

const caseTypeShort: Record<string, string> = {
  GENERAL_EXECUTION: "Genel Haciz",
  MORTGAGE: "İpotekli",
  PLEDGE: "Rehinli",
  CHECK: "Çek (Kambiyo)",
  BOND: "Senet (Kambiyo)",
  RENTAL: "Kira",
  BANKRUPTCY: "İflas",
  OTHER: "Diğer",
};

const statusOptions = [
  { value: 'DERDEST', label: 'Derdest', color: 'text-blue-600', description: 'Aktif takip' },
  { value: 'ISLEMDE', label: 'İşlemde', color: 'text-blue-500', description: 'İşlem yapılıyor' },
  { value: 'DERKENAR', label: 'Derkenar', color: 'text-amber-600', description: 'Beklemede' },
  { value: 'HITAM', label: 'Hitam', color: 'text-green-600', description: 'Sonuçlandı' },
  { value: 'INFAZ', label: 'İnfaz', color: 'text-green-700', description: 'İnfaz edildi' },
  { value: 'MUVEKKILE_IADE', label: 'Müvekkile İade', color: 'text-purple-600', description: 'Müvekkile iade edildi' },
  { value: 'ACIZ', label: 'Aciz', color: 'text-red-600', description: 'Aciz vesikası' },
  { value: 'BATAK', label: 'Batak', color: 'text-red-700', description: 'Tahsil imkansız' },
  { value: 'MAHSUP', label: 'Mahsup', color: 'text-gray-600', description: 'Mahsup edildi' },
  { value: 'TEMLIK', label: 'Temlik', color: 'text-indigo-600', description: 'Temlik edildi' },
  { value: 'AZIL', label: 'Azil', color: 'text-orange-600', description: 'Vekalet sona erdi' },
  { value: 'FERAGAT', label: 'Feragat', color: 'text-gray-500', description: 'Alacaklı vazgeçti' },
  { value: 'SULH', label: 'Sulh', color: 'text-teal-600', description: 'Taraflar anlaştı' },
];

const executionPathOptions = [
  { value: 'HACIZ', label: 'HACİZ' },
  { value: 'IFLAS', label: 'İFLAS' },
  { value: 'REHIN', label: 'REHİN' },
  { value: 'TAHLIYE', label: 'TAHLİYE' },
];

const subCategoryOptions = [
  { value: 'GENEL', label: 'GENEL' },
  { value: 'NAFAKA', label: 'NAFAKA' },
  { value: 'DOVIZ', label: 'DÖVİZ' },
  { value: 'KIRA', label: 'KİRA' },
];

// ============================================
// BLOCK FIELD COMPONENT
// ============================================

interface BlockFieldProps {
  label: string;
  value: string | number | undefined;
  editable?: boolean;
  editMode?: boolean;
  type?: 'text' | 'select';
  options?: { value: string; label: string }[];
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
  large?: boolean;
  placeholder?: string;
}

function BlockField({ label, value, editable = false, editMode = false, type = 'text', options = [], onChange, onSave, large = false, placeholder }: BlockFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value?.toString() || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  
  // value prop değiştiğinde localValue'yu güncelle
  useEffect(() => {
    setLocalValue(value?.toString() || '');
  }, [value]);

  // Edit moduna girince input'a focus
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  const doSave = () => {
    console.log('BlockField doSave called:', label, 'value:', localValue, 'original:', value);
    setIsEditing(false);
    if (onSave && localValue !== (value?.toString() || '')) {
      console.log('BlockField calling onSave:', label, localValue);
      onSave(localValue);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Eğer kaydet butonuna tıklandıysa, blur'u yoksay (buton kendi save'ini yapacak)
    if (saveButtonRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    doSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      doSave();
    } else if (e.key === 'Escape') {
      setLocalValue(value?.toString() || '');
      setIsEditing(false);
    }
  };
  
  const displayValue = value || '';
  const isEmpty = !displayValue;
  const defaultPlaceholder = placeholder || (large ? 'Dosya no girin' : 'Girin');

  // Global editMode aktifse veya local edit modundaysa
  const showInput = editable && (editMode || isEditing);
  
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      {showInput ? (
        <div className="flex gap-1">
          {type === 'select' ? (
            <select 
              value={localValue} 
              onChange={(e) => setLocalValue(e.target.value)} 
              onBlur={handleBlur}
              className={`flex-1 bg-white border border-blue-400 rounded px-2 py-1.5 ${large ? 'text-lg font-bold' : 'text-sm font-semibold'} focus:ring-2 focus:ring-blue-200 focus:outline-none`}
            >
              {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          ) : (
            <input 
              ref={inputRef}
              type="text" 
              value={localValue} 
              onChange={(e) => setLocalValue(e.target.value)} 
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={defaultPlaceholder}
              className={`flex-1 bg-white border border-blue-400 rounded px-2 py-1.5 ${large ? 'text-lg font-bold' : 'text-sm font-semibold'} focus:ring-2 focus:ring-blue-200 focus:outline-none`} 
            />
          )}
          <button 
            ref={saveButtonRef}
            onClick={doSave}
            className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
            title="Kaydet"
          >
            <Save className="h-3 w-3" />
          </button>
        </div>
      ) : isEmpty && editable ? (
        // Boş ve düzenlenebilir - soft çerçeveli kutu + edit butonu
        <div className="flex items-center gap-2">
          <div className="flex-1 border border-dashed border-amber-300 bg-amber-50/50 rounded px-3 py-2">
            <span className={`text-amber-600/70 italic ${large ? 'text-base' : 'text-sm'}`}>
              {defaultPlaceholder}
            </span>
          </div>
          <button 
            onClick={() => setIsEditing(true)}
            className="p-2 border border-purple-300 bg-purple-50 rounded hover:bg-purple-100 transition-colors"
            title="Düzenle"
          >
            <Edit className="h-4 w-4 text-purple-600" />
          </button>
        </div>
      ) : (
        // Değer var veya düzenlenemez
        <div className="flex items-center gap-2">
          <span className={`flex-1 ${large ? 'text-lg font-bold text-blue-700' : 'text-sm font-semibold text-gray-900'}`}>
            {displayValue || '—'}
          </span>
          {editable && (
            <button 
              onClick={() => setIsEditing(true)}
              className="p-1.5 border border-gray-200 bg-gray-50 rounded hover:bg-gray-100 hover:border-purple-300 transition-colors"
              title="Düzenle"
            >
              <Edit className="h-3 w-3 text-gray-500 hover:text-purple-600" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// EXECUTION OFFICE SELECT COMPONENT
// ============================================

interface ExecutionOfficeSelectProps {
  value: string;
  offices: any[];
  loading: boolean;
  saving: boolean;
  onChange: (officeId: string) => void;
  currentOfficeName?: string;
}

function ExecutionOfficeSelect({ value, offices, loading, saving, onChange, currentOfficeName }: ExecutionOfficeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Dışarı tıklandığında kapat
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtreleme
  const filteredOffices = offices.filter((office: any) => {
    const searchLower = search.toLowerCase();
    return (
      office.name?.toLowerCase().includes(searchLower) ||
      office.city?.toLowerCase().includes(searchLower) ||
      office.district?.toLowerCase().includes(searchLower)
    );
  });

  const handleSelect = (officeId: string) => {
    onChange(officeId);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Seçili değer veya input */}
      <div
        onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={`w-full border rounded-lg px-3 py-2 text-sm bg-white cursor-pointer flex items-center justify-between ${
          isOpen ? 'border-purple-400 ring-2 ring-purple-200' : 'border-purple-300 hover:border-purple-400'
        } ${(saving || loading) ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <span className={currentOfficeName ? 'text-gray-900' : 'text-gray-400'}>
          {loading ? 'Yükleniyor...' : (currentOfficeName || '— Seçiniz —')}
        </span>
        <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden">
          {/* Arama */}
          <div className="p-2 border-b sticky top-0 bg-white">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İcra dairesi ara... (il, ilçe veya ad)"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
              autoFocus
            />
          </div>

          {/* Liste */}
          <div className="max-h-52 overflow-y-auto">
            {/* Seçimi kaldır seçeneği */}
            {value && (
              <div
                onClick={() => handleSelect('')}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer border-b flex items-center gap-2"
              >
                <X className="h-3 w-3" /> Seçimi Kaldır
              </div>
            )}

            {filteredOffices.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                {search ? 'Sonuç bulunamadı' : 'İcra dairesi yok'}
              </div>
            ) : (
              filteredOffices.map((office: any) => (
                <div
                  key={office.id}
                  onClick={() => handleSelect(office.id)}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-purple-50 ${
                    office.id === value ? 'bg-purple-100 text-purple-800' : 'text-gray-700'
                  }`}
                >
                  <div className="font-medium">{office.name}</div>
                  {(office.city || office.district) && (
                    <div className="text-xs text-gray-500">
                      {[office.district, office.city].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// DRAWER COMPONENT
// ============================================

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function Drawer({ isOpen, onClose, title, children }: DrawerProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="ml-auto w-[480px] bg-white h-full shadow-xl flex flex-col relative">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// ============================================
// ANA COMPONENT
// ============================================

export default function CaseDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const fixParam = searchParams.get('fix');
  const fromFilter = searchParams.get('fromFilter');
  
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedData, setEditedData] = useState<Partial<CaseDetail>>({});
  const [financeDrawerOpen, setFinanceDrawerOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [lawyerDrawerOpen, setLawyerDrawerOpen] = useState(false);
  const [selectedLawyer, setSelectedLawyer] = useState<SelectedLawyer | null>(null);
  const [lawyerDrawerTab, setLawyerDrawerTab] = useState<'permissions' | 'profile'>('permissions');
  const [lawyerPermissions, setLawyerPermissions] = useState({
    canEditCase: false,
    canGenerateDocs: false,
    canSyncUYAP: false,
    canViewFinance: false,
    canEditFinance: false,
    canChangeStatus: false,
    canEditParties: false,
    receivesNotifications: true,
  });
  const [lawyerProfile, setLawyerProfile] = useState({
    phone: '',
    email: '',
    address: '',
    bankName: '',
    branchName: '',
    iban: '',
  });
  
  // Müvekkil Drawer State
  const [clientDrawerOpen, setClientDrawerOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseClientId, setExpenseClientId] = useState<string>('');
  const [expenseClientName, setExpenseClientName] = useState<string>('');
  const [expensePackageCode, setExpensePackageCode] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<{
    id: string;
    name: string;
    displayName?: string;
    type?: 'INDIVIDUAL' | 'COMPANY' | 'PUBLIC';
    tckn?: string;
    vkn?: string;
    taxOffice?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    district?: string;
    bankAccounts?: BankAccount[];
    role?: string;
  } | null>(null);
  
  // Client Stats for Work Card
  const [clientStats, setClientStats] = useState<{
    activeCases: number;
    totalCases: number;
    last30dActions: number;
    byCurrency: Record<string, { totalClaim: number; totalCollected: number; totalExpense: number; expenseCollected: number }>;
    totalReceivable: number;
    totalCollected: number;
    totalExpense: number;
    expenseCollected: number;
    nearExpiryCases: number;
    pendingNotifications: number;
    staleCases30d: number;
    suspendedCases: number;
  } | null>(null);
  const [loadingClientStats, setLoadingClientStats] = useState(false);
  
  // Mesaj Gönder Modal State
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  
  // Ekip Ekleme Modal State
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [availableLawyers, setAvailableLawyers] = useState<any[]>([]);
  const [availableStaff, setAvailableStaff] = useState<any[]>([]);
  
  // Personel Drawer State
  const [staffDrawerOpen, setStaffDrawerOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<{
    caseStaffId: string;
    staffId: string;
    firstName: string;
    lastName: string;
    staffType?: string;
    roleOnCase?: string;
    phone?: string;
    email?: string;
    canEdit?: boolean;
    canApprove?: boolean;
    canView?: boolean;
    receiveNotifications?: boolean;
  } | null>(null);
  const [teamModalTab, setTeamModalTab] = useState<'lawyers' | 'staff'>('lawyers');
  const [addingTeamMember, setAddingTeamMember] = useState(false);
  
  // Borçlu Drawer State
  const [debtorDrawerOpen, setDebtorDrawerOpen] = useState(false);
  const [selectedDebtor, setSelectedDebtor] = useState<{
    caseDebtorId: string;
    debtorId: string;
    name: string;
    displayName?: string;
    tckn?: string;
    vkn?: string;
    type?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    district?: string;
    role?: string;
  } | null>(null);
  
  // Case Debtors State (FAZ 1 - Borçlu Modülü)
  const [caseDebtors, setCaseDebtors] = useState<DebtorListItemDTO[]>([]);
  const [debtorsSummary, setDebtorsSummary] = useState<DebtorsSummaryDTO | null>(null);
  const [loadingDebtors, setLoadingDebtors] = useState(false);
  const [selectedDebtorDetail, setSelectedDebtorDetail] = useState<DebtorDetailDTO | null>(null);
  const [loadingDebtorDetail, setLoadingDebtorDetail] = useState(false);
  
  // İcra Dairesi Seçimi State
  const [executionOffices, setExecutionOffices] = useState<any[]>([]);
  const [loadingOffices, setLoadingOffices] = useState(false);
  const [savingOffice, setSavingOffice] = useState(false);
  
  // Takip Tarihi (caseDate) Düzenleme State
  const [editingCaseDate, setEditingCaseDate] = useState(false);
  const [caseDateValue, setCaseDateValue] = useState('');
  const [savingCaseDate, setSavingCaseDate] = useState(false);
  
  // Takip Statüsü (caseStatus) Düzenleme State
  const [editingCaseStatus, setEditingCaseStatus] = useState(false);
  const [caseStatusValue, setCaseStatusValue] = useState('');
  const [savingCaseStatus, setSavingCaseStatus] = useState(false);
  
  // Alacak Kalemleri ve Tahsilatlar State
  const [dues, setDues] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [loadingFinance, setLoadingFinance] = useState(false);
  
  // Due Modal State
  const [dueModalOpen, setDueModalOpen] = useState(false);
  // PR-5a: kanonik ClaimItem paneli collapsible + lazy (yalnız açılınca mount → GET /claim-items).
  const [showCanonicalClaims, setShowCanonicalClaims] = useState(false);
  const [editingDue, setEditingDue] = useState<any>(null);
  
  // Doküman İndirme State
  const [downloadingDoc, setDownloadingDoc] = useState<'docx' | 'pdf' | 'xml' | null>(null);
  
  // Address Workflow Loading State
  const [addressWorkflowLoading, setAddressWorkflowLoading] = useState(false);
  
  // Collection Modal State
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<any>(null);
  
  // Address Task State (Yapılacaklar ve Notlar için)
  const [addressTasks, setAddressTasks] = useState<any[]>([]);
  const [addressNotes, setAddressNotes] = useState<any[]>([]);
  const [loadingAddressTasks, setLoadingAddressTasks] = useState(false);
  
  // Expense Three-View State (OperationDeck entegrasyonu)
  const [expenseThreeViewData, setExpenseThreeViewData] = useState<Array<{
    task: any;
    finance: any;
    clientRequest: any;
  }>>([]);
  const [loadingExpenseData, setLoadingExpenseData] = useState(false);
  
  // Fix highlight state
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  
  // Fix Registry - hangi fix key hangi section'a gider
  const fixRegistry: Record<string, { section: string; field: string; expand?: string }> = {
    "case.documents.powerOfAttorney": { section: "documents", field: "poaUpload", expand: "documentsTab" },
    "party.debtor.address": { section: "parties.debtors", field: "debtorAddress", expand: "debtorsPanel" },
    "party.identity": { section: "parties", field: "identityNo", expand: "partiesPanel" },
    "party.contact": { section: "parties", field: "contactInfo", expand: "partiesPanel" },
    "enforcement.uyap.connect": { section: "enforcement", field: "uyapConnect", expand: "enforcementDrawer" },
    "enforcement.payment.iban": { section: "enforcement", field: "iban", expand: "enforcementDrawer" },
    "automation.enable": { section: "automation", field: "enableToggle", expand: "automationPanel" },
    "automation.errors": { section: "automation", field: "lastError", expand: "automationPanel" },
    "risk.time.remainingDays": { section: "lifecycle", field: "remainingDays", expand: "lifecycleCard" },
    "lifecycle.addAction": { section: "lifecycle", field: "addActionButton", expand: "lifecyclePanel" },
    "finance.collection": { section: "finance", field: "addCollection", expand: "financePanel" },
    "finance.summary": { section: "finance", field: "recalcButton", expand: "financePanel" },
  };
  
  // Fix parametresi varsa ilgili section'ı highlight et
  useEffect(() => {
    if (fixParam && !loading) {
      const fixConfig = fixRegistry[fixParam];
      if (fixConfig) {
        setHighlightedSection(fixConfig.section);
        
        // 3 saniye sonra highlight'ı kaldır
        const timer = setTimeout(() => {
          setHighlightedSection(null);
        }, 3000);
        
        // İlgili element'e scroll
        setTimeout(() => {
          const element = document.querySelector(`[data-fix-section="${fixConfig.section}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 500);
        
        return () => clearTimeout(timer);
      }
    }
  }, [fixParam, loading]);

  const fetchCase = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getCase(params.id as string);
      console.log('[CaseDetail] API response:', data);
      console.log('[CaseDetail] claimItems:', data?.claimItems);
      setCaseData(data);
      setEditedData({});
    } catch (error) {
      console.error("Takip yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  // Takip tarihi (caseDate) kaydetme
  const handleSaveCaseDate = useCallback(async () => {
    if (!caseDateValue || !params.id) return;
    try {
      setSavingCaseDate(true);
      await api.updateCase(params.id as string, { caseDate: caseDateValue });
      // Veriyi yenile
      await fetchCase();
      setEditingCaseDate(false);
    } catch (error) {
      console.error("Takip tarihi güncellenemedi:", error);
      alert("Takip tarihi güncellenirken bir hata oluştu");
    } finally {
      setSavingCaseDate(false);
    }
  }, [caseDateValue, params.id, fetchCase]);

  // Takip statüsü (caseStatus) kaydetme
  const handleSaveCaseStatus = useCallback(async () => {
    if (!caseStatusValue || !params.id) return;
    try {
      setSavingCaseStatus(true);
      await api.updateCase(params.id as string, { caseStatus: caseStatusValue });
      // Veriyi yenile
      await fetchCase();
      setEditingCaseStatus(false);
    } catch (error) {
      console.error("Takip statüsü güncellenemedi:", error);
      alert("Takip statüsü güncellenirken bir hata oluştu");
    } finally {
      setSavingCaseStatus(false);
    }
  }, [caseStatusValue, params.id, fetchCase]);

  // Fetch case debtors with summary (FAZ 1)
  const fetchCaseDebtors = useCallback(async () => {
    if (!params.id) return;
    try {
      setLoadingDebtors(true);
      const response = await api.getCaseDebtors(params.id as string, { includePassive: true });
      setCaseDebtors(response.items);
      setDebtorsSummary(response.summary);
    } catch (error) {
      console.error("Borçlular yüklenemedi:", error);
    } finally {
      setLoadingDebtors(false);
    }
  }, [params.id]);

  // Fetch dues and collections
  const fetchFinanceData = useCallback(async () => {
    if (!params.id) return;
    try {
      setLoadingFinance(true);
      const [duesRes, collectionsRes] = await Promise.all([
        api.getCaseDues(params.id as string),
        api.getCaseCollections(params.id as string),
      ]);
      setDues(duesRes || []);
      setCollections(collectionsRes || []);
    } catch (error) {
      console.error("Finans verileri yüklenemedi:", error);
    } finally {
      setLoadingFinance(false);
    }
  }, [params.id]);

  // Fetch address tasks and notes for OperationDeck
  const fetchAddressTasksAndNotes = useCallback(async () => {
    if (!params.id) return;
    try {
      setLoadingAddressTasks(true);
      const [tasksRes, notesRes] = await Promise.all([
        api.getAddressTasksForCase(params.id as string),
        api.getAddressNotesForCase(params.id as string),
      ]);
      
      // AddressTask'ları OperationDeck formatına dönüştür
      const formattedTasks = (tasksRes?.tasks || []).map((task: any) => ({
        id: task.id,
        title: task.title || task.taskType,
        description: task.description,
        source: 'SISTEM' as const,
        basis: task.taskType,
        taskType: task.taskType, // Backend task type
        status: task.status === 'DONE' || task.status === 'RESOLVED' ? 'YAPILDI' as const :
                task.status === 'CANCELLED' || task.status === 'FAILED' ? 'IPTAL' as const : 'BEKLIYOR' as const,
        dueDate: task.dueAt,
        priority: task.status === 'OVERDUE' ? 'HIGH' as const : 'MEDIUM' as const,
        category: 'SURE_BAGLI' as const,
      }));
      
      setAddressTasks(formattedTasks);
      setAddressNotes(notesRes?.notes || []);
    } catch (error) {
      console.error("Adres görevleri yüklenemedi:", error);
    } finally {
      setLoadingAddressTasks(false);
    }
  }, [params.id]);

  // Fetch expense three-view data for OperationDeck
  const fetchExpenseThreeViewData = useCallback(async () => {
    if (!params.id) return;
    try {
      setLoadingExpenseData(true);
      const data = await api.getExpenseThreeViewForCase(params.id as string);
      setExpenseThreeViewData(data || []);
    } catch (error) {
      console.error("Masraf verileri yüklenemedi:", error);
      setExpenseThreeViewData([]);
    } finally {
      setLoadingExpenseData(false);
    }
  }, [params.id]);

  // Fetch debtor detail for drawer
  const fetchDebtorDetail = useCallback(async (caseDebtorId: string) => {
    if (!params.id) return;
    try {
      setLoadingDebtorDetail(true);
      const detail = await api.getCaseDebtorDetail(params.id as string, caseDebtorId);
      setSelectedDebtorDetail(detail);
    } catch (error) {
      console.error("Borçlu detayı yüklenemedi:", error);
    } finally {
      setLoadingDebtorDetail(false);
    }
  }, [params.id]);

  // Handle debtor row click
  const handleDebtorClick = useCallback((debtor: DebtorListItemDTO) => {
    // Set basic info immediately for drawer header
    setSelectedDebtor({
      caseDebtorId: debtor.caseDebtorId,
      debtorId: debtor.id,
      name: debtor.displayName,
      displayName: debtor.displayName,
      role: debtor.role,
    });
    setDebtorDrawerOpen(true);
    // Fetch full detail
    fetchDebtorDetail(debtor.caseDebtorId);
  }, [fetchDebtorDetail]);

  useEffect(() => {
    if (params.id) fetchCase();
  }, [params.id, fetchCase]);

  // Fetch debtors when case is loaded
  useEffect(() => {
    if (params.id && !loading) {
      fetchCaseDebtors();
    }
  }, [params.id, loading, fetchCaseDebtors]);

  // Fetch finance data (dues & collections) when case is loaded
  useEffect(() => {
    if (params.id && !loading) {
      fetchFinanceData();
    }
  }, [params.id, loading, fetchFinanceData]);

  // Fetch address tasks and notes when case is loaded
  useEffect(() => {
    if (params.id && !loading) {
      fetchAddressTasksAndNotes();
    }
  }, [params.id, loading, fetchAddressTasksAndNotes]);

  // Fetch expense three-view data when case is loaded
  useEffect(() => {
    if (params.id && !loading) {
      fetchExpenseThreeViewData();
    }
  }, [params.id, loading, fetchExpenseThreeViewData]);

  const dayCount = useMemo(() => {
    if (!caseData?.caseDate) return 0;
    return calculateDayCount(caseData.caseDate);
  }, [caseData?.caseDate]);

  const dayStyle = useMemo(() => getDayCountStyle(dayCount), [dayCount]);

  // Kalan gün hesaplama (İİK 78 - son icrai işlemden itibaren)
  const remainingDays = useMemo(() => {
    if (!caseData?.caseDate) return 365;
    // Öncelik: lastEnforcementActionAt > lastAutoActionAt > caseDate
    const lastAction = caseData.lastEnforcementActionAt || caseData.lastAutoActionAt;
    return calculateRemainingDays(caseData.caseDate, lastAction);
  }, [caseData?.caseDate, caseData?.lastEnforcementActionAt, caseData?.lastAutoActionAt]);

  const remainingStyle = useMemo(() => getRemainingDaysStyle(remainingDays), [remainingDays]);

  const handleFieldChange = (field: string, value: string) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
  };

  // Tek alan için otomatik kaydetme - değeri doğrudan al
  const handleAutoSave = async (field: string, value: string) => {
    if (!caseData) return;
    // Boş string de geçerli bir değer olabilir (silme işlemi için)
    if (value === undefined || value === null) return;
    try {
      console.log('Auto-saving:', field, '=', value, 'for case:', caseData.id);
      const response = await api.patch(`/cases/${caseData.id}`, { [field]: value });
      console.log('Auto-save response:', response);
      await fetchCase();
    } catch (error: any) {
      console.error("Kaydetme hatası:", error);
      console.error("Error details:", error?.response?.data || error?.message);
      alert(`Kaydetme başarısız: ${error?.message || 'Bilinmeyen hata'}`);
    }
  };

  // İcra dairesi banka bilgilerini kaydet
  const handleExecutionOfficeBankSave = async (field: string, value: string) => {
    if (!caseData?.executionOffice?.id) return;
    try {
      console.log('Saving execution office bank:', field, value);
      await api.put(`/execution-offices/${caseData.executionOffice.id}`, { [field]: value });
      await fetchCase();
    } catch (error) {
      console.error("İcra dairesi kaydetme hatası:", error);
    }
  };

  const handleSave = async () => {
    if (!caseData || Object.keys(editedData).length === 0) {
      setEditMode(false);
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/cases/${caseData.id}`, editedData);
      await fetchCase();
      setEditMode(false);
    } catch (error) {
      console.error("Kaydetme hatası:", error);
      alert("Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedData({});
    setEditMode(false);
  };

  // Doküman indirme fonksiyonu
  const handleDownloadDocument = async (format: 'docx' | 'pdf' | 'xml') => {
    if (!caseData?.id) return;
    try {
      setDownloadingDoc(format);
      
      // Doğrudan fetch kullan (blob response için)
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/template-engine/cases/${caseData.id}/documents/${format}?type=takip-talebi`,
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
      a.download = `takip-talebi-${caseData.fileNumber}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Doküman indirme hatası:', error);
      alert(error.message || 'Doküman indirilemedi');
    } finally {
      setDownloadingDoc(null);
    }
  };

  // Ekip modal açıldığında avukat ve personel listesini yükle
  const loadTeamOptions = async () => {
    try {
      const [lawyersRes, staffRes] = await Promise.all([
        api.getLawyers(),
        api.getStaffMembers(),
      ]);
      
      // API response { data: [...] } formatında dönüyor
      const lawyers = (lawyersRes as any)?.data || lawyersRes || [];
      const staff = (staffRes as any)?.data || staffRes || [];
      
      // Zaten dosyada olan avukatları filtrele
      const existingLawyerIds = caseData?.lawyers?.map(l => l.lawyer.id) || [];
      const filteredLawyers = (Array.isArray(lawyers) ? lawyers : []).filter((l: any) => !existingLawyerIds.includes(l.id));
      setAvailableLawyers(filteredLawyers);
      
      // Zaten dosyada olan personelleri filtrele
      const existingStaffIds = caseData?.staff?.map(s => s.staffMember.id) || [];
      const filteredStaff = (Array.isArray(staff) ? staff : []).filter((s: any) => !existingStaffIds.includes(s.id));
      setAvailableStaff(filteredStaff);
    } catch (error) {
      console.error('Ekip listesi yüklenemedi:', error);
    }
  };

  // Client stats fetch for work card
  const fetchClientStats = async (clientId: string) => {
    setLoadingClientStats(true);
    try {
      const response = await api.getCases({ clientId, limit: 500 });
      const cases = response?.data || response || [];
      
      // Calculate remaining days for each case
      const calculateRemaining = (caseDate: string, lastAction?: string) => {
        const baseDate = lastAction ? new Date(lastAction) : new Date(caseDate);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
        return 365 - diffDays;
      };
      
      // Check if case had action in last 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Group by currency
      const byCurrency: Record<string, { totalClaim: number; totalCollected: number; totalExpense: number; expenseCollected: number }> = {};
      
      cases.forEach((c: any) => {
        const currency = c.currency || 'TRY';
        if (!byCurrency[currency]) {
          byCurrency[currency] = { totalClaim: 0, totalCollected: 0, totalExpense: 0, expenseCollected: 0 };
        }
        byCurrency[currency].totalClaim += Number(c.totalClaim) || Number(c.principalAmount) || 0;
        byCurrency[currency].totalCollected += Number(c.totalCollected) || 0;
        byCurrency[currency].totalExpense += Number(c.totalExpense) || 0;
        byCurrency[currency].expenseCollected += Number(c.expenseCollected) || 0;
      });
      
      const stats = {
        activeCases: cases.filter((c: any) => c.status === 'ACTIVE').length,
        totalCases: cases.length,
        last30dActions: cases.filter((c: any) => {
          const lastAction = c.lastEnforcementActionAt || c.lastAutoActionAt || c.lastActionDate || c.updatedAt;
          return lastAction && new Date(lastAction) >= thirtyDaysAgo;
        }).length,
        // Finansal veriler para birimine göre gruplu
        byCurrency,
        // TRY toplamları (geriye uyumluluk)
        totalReceivable: byCurrency['TRY']?.totalClaim || 0,
        totalCollected: byCurrency['TRY']?.totalCollected || 0,
        totalExpense: byCurrency['TRY']?.totalExpense || 0,
        expenseCollected: byCurrency['TRY']?.expenseCollected || 0,
        nearExpiryCases: cases.filter((c: any) => {
          if (c.status !== 'ACTIVE') return false;
          const remaining = c.daysUntilPassive ?? calculateRemaining(c.caseDate, c.lastEnforcementActionAt || c.lastAutoActionAt);
          return remaining > 0 && remaining < 60;
        }).length,
        pendingNotifications: cases.filter((c: any) => c.hasPendingNotification).length,
        staleCases30d: cases.filter((c: any) => {
          if (c.status !== 'ACTIVE') return false;
          const lastAction = c.lastActionDate || c.lastEnforcementActionAt || c.lastAutoActionAt || c.updatedAt;
          return !lastAction || new Date(lastAction) < thirtyDaysAgo;
        }).length,
        suspendedCases: cases.filter((c: any) => c.status === 'SUSPENDED').length,
      };
      setClientStats(stats);
    } catch (error) {
      console.error('Client stats yüklenemedi:', error);
    } finally {
      setLoadingClientStats(false);
    }
  };

  // Client drawer açıldığında stats fetch et
  useEffect(() => {
    if (clientDrawerOpen && selectedClient?.id) {
      fetchClientStats(selectedClient.id);
    } else {
      setClientStats(null);
    }
  }, [clientDrawerOpen, selectedClient?.id]);

  // Ekip modal açıldığında
  useEffect(() => {
    if (teamModalOpen) {
      loadTeamOptions();
    }
  }, [teamModalOpen, caseData]);

  // Avukat ekle
  const handleAddLawyer = async (lawyerId: string) => {
    if (!caseData) return;
    setAddingTeamMember(true);
    try {
      await api.addCaseLawyer(caseData.id, { lawyerId });
      await fetchCase();
      await loadTeamOptions();
    } catch (error: any) {
      alert(error.message || 'Avukat eklenemedi');
    } finally {
      setAddingTeamMember(false);
    }
  };

  // Personel ekle
  const handleAddStaff = async (staffMemberId: string) => {
    if (!caseData) return;
    setAddingTeamMember(true);
    try {
      await api.addCaseStaff(caseData.id, { staffMemberId });
      await fetchCase();
      await loadTeamOptions();
    } catch (error: any) {
      alert(error.message || 'Personel eklenemedi');
    } finally {
      setAddingTeamMember(false);
    }
  };

  // İcra dairelerini yükle
  const loadExecutionOffices = async () => {
    setLoadingOffices(true);
    try {
      const res = await api.getExecutionOffices();
      const offices = (res as any)?.data || res || [];
      setExecutionOffices(Array.isArray(offices) ? offices : []);
    } catch (error) {
      console.error('İcra daireleri yüklenemedi:', error);
    } finally {
      setLoadingOffices(false);
    }
  };

  // Finance drawer açıldığında icra dairelerini yükle
  useEffect(() => {
    if (financeDrawerOpen && executionOffices.length === 0) {
      loadExecutionOffices();
    }
  }, [financeDrawerOpen]);

  // İcra dairesi değiştir
  const handleExecutionOfficeChange = async (officeId: string) => {
    if (!caseData) return;
    setSavingOffice(true);
    try {
      await api.patch(`/cases/${caseData.id}`, { executionOfficeId: officeId || null });
      await fetchCase();
    } catch (error: any) {
      alert(error.message || 'İcra dairesi güncellenemedi');
    } finally {
      setSavingOffice(false);
    }
  };

  // Avukat satırına tıklama
  const handleLawyerClick = (le: NonNullable<CaseDetail['lawyers']>[0]) => {
    // Öncelik sırası: 1) casePermissions (dosyaya özel), 2) lawyer.defaultPermissions (büro ayarları), 3) varsayılan true
    const storedCasePermissions = le.casePermissions || le.permissions;
    const lawyerDefaultPermissions = le.lawyer.defaultPermissions;
    const hasCasePermissions = storedCasePermissions && Object.keys(storedCasePermissions).length > 0;
    const hasLawyerDefaults = lawyerDefaultPermissions && Object.keys(lawyerDefaultPermissions).length > 0;
    
    // Yetkileri belirle
    let permissions: typeof lawyerPermissions;
    if (hasCasePermissions) {
      // Dosyaya özel yetkiler var
      permissions = {
        canEditCase: storedCasePermissions?.canEditCase || false,
        canGenerateDocs: storedCasePermissions?.canGenerateDocs || false,
        canSyncUYAP: storedCasePermissions?.canSyncUYAP || false,
        canViewFinance: storedCasePermissions?.canViewFinance || false,
        canEditFinance: storedCasePermissions?.canEditFinance || false,
        canChangeStatus: storedCasePermissions?.canChangeStatus || false,
        canEditParties: storedCasePermissions?.canEditParties || false,
        receivesNotifications: le.receiveNotifications ?? (le.permissions as any)?.receivesNotifications ?? true,
      };
    } else if (hasLawyerDefaults) {
      // Büro ayarlarındaki varsayılan yetkiler
      permissions = {
        canEditCase: lawyerDefaultPermissions?.canEditCase ?? true,
        canGenerateDocs: lawyerDefaultPermissions?.canGenerateDocs ?? true,
        canSyncUYAP: lawyerDefaultPermissions?.canSyncUYAP ?? true,
        canViewFinance: lawyerDefaultPermissions?.canViewFinance ?? true,
        canEditFinance: lawyerDefaultPermissions?.canEditFinance ?? true,
        canChangeStatus: lawyerDefaultPermissions?.canChangeStatus ?? true,
        canEditParties: lawyerDefaultPermissions?.canEditParties ?? true,
        receivesNotifications: le.receiveNotifications ?? true,
      };
    } else {
      // Hiçbir yetki tanımlı değil - varsayılan olarak tümü açık
      permissions = {
        canEditCase: true,
        canGenerateDocs: true,
        canSyncUYAP: true,
        canViewFinance: true,
        canEditFinance: true,
        canChangeStatus: true,
        canEditParties: true,
        receivesNotifications: true,
      };
    }
    
    // role alanını oku (API'den role olarak geliyor)
    const caseRole = le.role || le.caseRole || 'ASSIGNED';
    
    setSelectedLawyer({
      caseLawyerId: le.id,
      lawyerId: le.lawyer.id,
      name: le.lawyer.name,
      surname: le.lawyer.surname,
      barNumber: le.lawyer.barNumber,
      phone: le.lawyer.phone,
      email: le.lawyer.email,
      address: le.lawyer.address,
      bankName: le.lawyer.bankName,
      branchName: le.lawyer.branchName,
      iban: le.lawyer.iban,
      canSign: le.canSign,
      caseRole: caseRole,
      lawyerRank: le.lawyer.lawyerRank,
      permissions: permissions,
    });
    setLawyerPermissions(permissions);
    setLawyerProfile({
      phone: le.lawyer.phone || '',
      email: le.lawyer.email || '',
      address: le.lawyer.address || '',
      bankName: le.lawyer.bankName || '',
      branchName: le.lawyer.branchName || '',
      iban: le.lawyer.iban || '',
    });
    setLawyerDrawerTab('permissions');
    setLawyerDrawerOpen(true);
  };

  // Personel satırına tıklama
  const handleStaffClick = (se: NonNullable<CaseDetail['staff']>[0]) => {
    setSelectedStaff({
      caseStaffId: se.id,
      staffId: se.staffMember.id,
      firstName: se.staffMember.firstName,
      lastName: se.staffMember.lastName,
      staffType: se.staffMember.staffType,
      phone: se.staffMember.phone,
      email: se.staffMember.email,
      // PR-ASSIGN-3b: CaseStaff modeli alanları (roleOnCase/canEdit/canApprove/canView/receiveNotifications).
      // Eski canSign + permissions{5} (lawyer drawer'ından sızmış, CaseStaff'ta yok) KALDIRILDI.
      // PR-ASSIGN-3c: `se` tipi artık CaseStaff alanlarını taşıyor → `as any` kaldırıldı (tsc-denetimli).
      ...caseStaffEditFields(se),
    });
    setStaffDrawerOpen(true);
  };

  // Dosya yetkileri kaydet
  const handleSaveCasePermissions = async () => {
    if (!selectedLawyer || !caseData) return;
    try {
      await api.updateCaseLawyer(caseData.id, selectedLawyer.caseLawyerId, {
        role: selectedLawyer.caseRole,
        canSign: selectedLawyer.canSign,
        casePermissions: lawyerPermissions,
        receiveNotifications: lawyerPermissions.receivesNotifications,
      });
      await fetchCase();
      setLawyerDrawerOpen(false);
    } catch (error) {
      console.error('Yetki kaydetme hatası:', error);
      alert('Yetki kaydetme başarısız');
    }
  };

  // Avukat profili kaydet (global)
  const handleSaveLawyerProfile = async () => {
    if (!selectedLawyer) return;
    const confirmed = window.confirm('Bu değişiklikler avukatın TÜM dosyalarında görünecek. Devam etmek istiyor musunuz?');
    if (!confirmed) return;
    try {
      await api.updateLawyer(selectedLawyer.lawyerId, lawyerProfile);
      await fetchCase();
      setLawyerDrawerOpen(false);
    } catch (error) {
      console.error('Profil kaydetme hatası:', error);
      alert('Profil güncelleme başarısız');
    }
  };

  // UYAP'a gönderim hazırlığı - masraf kontrolü
  const handlePrepareForUyap = async () => {
    if (!caseData) return;
    try {
      const result = await api.prepareForUyap(caseData.id);
      
      if (result.action === 'READY') {
        // Masraf ödendi, UYAP'a gönderime hazır
        alert('Dosya UYAP\'a gönderime hazır!');
        // TODO: UYAP gönderim işlemini başlat
      } else if (result.action === 'OPEN_EXPENSE_MODAL') {
        // Masraf talebi gerekiyor
        const client = caseData.caseClients?.[0]?.client || caseData.client;
        if (client) {
          setExpenseClientId(client.id);
          setExpenseClientName(client.displayName || client.name || '');
          setExpensePackageCode('UYAP_PRE');
          setExpenseModalOpen(true);
        }
      } else if (result.action === 'BLOCKED') {
        // Masraf ödenmemiş, engellendi
        alert(result.blockReason || 'Masraf avansı ödenmeden UYAP\'a gönderim yapılamaz.');
      }
    } catch (error: any) {
      console.error('UYAP hazırlık hatası:', error);
      alert(error.message || 'UYAP hazırlık işlemi başarısız');
    }
  };

  // Masraf talebi oluştur (paket ile)
  const handleCreateExpenseRequest = (packageCode?: string) => {
    if (!caseData) return;
    const client = caseData.caseClients?.[0]?.client || caseData.client;
    if (client) {
      setExpenseClientId(client.id);
      setExpenseClientName(client.displayName || client.name || '');
      setExpensePackageCode(packageCode || '');
      setExpenseModalOpen(true);
    }
  };

  const getValue = (field: keyof CaseDetail) => {
    return editedData[field] !== undefined ? editedData[field] : caseData?.[field];
  };

  // Müvekkil banka hesabı
  const clientBankAccount = useMemo(() => {
    const client = caseData?.caseClients?.[0]?.client || caseData?.client;
    return client?.bankAccounts?.find(b => b.isPrimary) || client?.bankAccounts?.[0];
  }, [caseData]);

  // Avukat banka hesabı (imza yetkili avukat öncelikli)
  const lawyerBankAccount = useMemo(() => {
    if (!caseData?.lawyers?.length) return null;
    const signingLawyer = caseData.lawyers.find(l => l.canSign)?.lawyer;
    const firstLawyer = caseData.lawyers[0]?.lawyer;
    const lawyer = signingLawyer || firstLawyer;
    if (!lawyer) return null;
    return { 
      bankName: lawyer.bankName || null, 
      branchName: lawyer.branchName || null, 
      iban: lawyer.iban || null, 
      name: `Av. ${lawyer.name} ${lawyer.surname}` 
    };
  }, [caseData?.lawyers]);

  // Avukatlı takip mi? (en az bir avukat atanmış)
  const isLawyerCase = (caseData?.lawyers?.length || 0) > 0;

  // İcra dairesi banka bilgileri
  const executionOfficeBankInfo = useMemo(() => ({
    bankName: caseData?.executionOffice?.bankName,
    branchName: caseData?.executionOffice?.branchName,
    iban: caseData?.executionOffice?.iban,
  }), [caseData?.executionOffice]);

  const hasUyap = !!caseData?.uyapBirimKodu || !!caseData?.executionOffice?.uyapCode;
  const hasExecutionOfficeBank = !!executionOfficeBankInfo.bankName && !!executionOfficeBankInfo.iban;
  // Avukatlı takipte avukat bankası, avukatsız takipte müvekkil bankası kontrol edilir
  const hasPaymentBank = isLawyerCase ? !!lawyerBankAccount?.iban : !!clientBankAccount?.iban;

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!caseData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Takip bulunamadı</p>
        <Link href="/cases" className="text-primary hover:underline mt-2 inline-block">Takiplere dön</Link>
      </div>
    );
  }

  const caseDebtorLinks = caseData.debtors || [];

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F3F6]">
      
      {/* FIX MODE BANNER - Eksiklik giderme modunda göster */}
      {fixParam && fromFilter && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-amber-100 rounded-full">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <span className="text-sm font-medium text-amber-900">Eksiklik Giderme Modu</span>
                <span className="text-xs text-amber-700 ml-2">
                  İlgili alan aşağıda vurgulanmıştır
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/cases?quickFilter=${fromFilter}`}
                className="text-xs px-3 py-1.5 bg-amber-100 text-amber-800 rounded hover:bg-amber-200 transition-colors"
              >
                ← Listeye Dön
              </Link>
            </div>
          </div>
        </div>
      )}
      
      {/* HEADER */}
      <div className="bg-white border-b px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/cases" className="text-gray-500 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
            <span className="text-sm text-gray-500">TAKİP:</span>
            <span className="font-bold text-gray-700">{caseData.fileNumber}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              caseData.caseStatus === 'DERDEST' ? 'bg-blue-100 text-blue-800' :
              caseData.caseStatus === 'KAPALI' ? 'bg-gray-200 text-gray-700' :
              caseData.caseStatus === 'TAHSILAT' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>{caseData.caseStatus}</span>
            <span className="text-sm text-gray-500">{caseTypeShort[caseData.type] || caseData.type} • {caseData.executionPath || 'HACİZ'}</span>
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button onClick={handleCancel} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 flex items-center gap-1"><X className="h-4 w-4" /> İptal</button>
                <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Kaydet
                </button>
              </>
            ) : (
              <>
                <button onClick={fetchCase} className="p-2 hover:bg-gray-100 rounded" title="Yenile"><RefreshCw className="h-4 w-4" /></button>
                <button 
                  onClick={() => setPaymentModalOpen(true)} 
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                  title="Ödeme Talimatı"
                >
                  <CreditCard className="h-4 w-4" /> Ödeme Talimatı
                </button>
                {/* Doküman İndirme Butonları */}
                <button 
                  onClick={() => handleDownloadDocument('docx')} 
                  disabled={downloadingDoc === 'docx'}
                  className="p-2 hover:bg-blue-50 rounded text-blue-600" 
                  title="Word İndir"
                >
                  {downloadingDoc === 'docx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                </button>
                <button 
                  onClick={() => handleDownloadDocument('pdf')} 
                  disabled={downloadingDoc === 'pdf'}
                  className="p-2 hover:bg-red-50 rounded text-red-600" 
                  title="PDF İndir"
                >
                  {downloadingDoc === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                </button>
                <button 
                  onClick={() => handleDownloadDocument('xml')} 
                  disabled={downloadingDoc === 'xml'}
                  className="p-2 hover:bg-green-50 rounded text-green-700" 
                  title="XML İndir"
                >
                  {downloadingDoc === 'xml' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                </button>
                <UyapExportButton caseId={caseData.id} fileNumber={caseData.fileNumber} variant="icon" />
                <button onClick={() => setEditMode(true)} className="p-2 hover:bg-gray-100 rounded" title="Düzenle"><Edit className="h-4 w-4" /></button>
                <button className="p-2 hover:bg-gray-100 rounded" title="Paylaş"><Share2 className="h-4 w-4" /></button>
                <button className="p-2 hover:bg-red-50 rounded text-red-600" title="Sil"><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ANA PANEL - 3 BLOK KOMPAKT */}
      <div className="bg-white border-b px-3 py-2 flex-shrink-0">
        <div className="grid grid-cols-12 gap-2">
          
          {/* KART A: İCRA MERCİİ & ENTEGRASYON (5/12) - Bulut Mavisi */}
          <div className="col-span-5 bg-[#EEF4FB] border border-[#DCE6F2] rounded-lg p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-1.5 border-b pb-1">
              <h4 className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">İcra Mercii & Entegrasyon</h4>
              <button onClick={() => setFinanceDrawerOpen(true)} className="text-blue-600 hover:text-blue-800 text-[9px] flex items-center gap-0.5">
                Detaylar <ChevronRight className="h-2.5 w-2.5" />
              </button>
            </div>
            <div className="space-y-1">
              {/* İcra Dosya No - kompakt */}
              <BlockField 
                label="İcra Dosya No" 
                value={getValue('executionFileNumber') as string || ''} 
                editable={true}
                large={true}
                onSave={(v) => handleAutoSave('executionFileNumber', v)}
                placeholder="2025/12345 E."
              />
              
              {/* İcra Dairesi - tek satır */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[9px] text-gray-500 uppercase">İcra Dairesi</span>
                <div className="flex items-center gap-1">
                  <span className="font-medium text-gray-900 text-[11px]">
                    {caseData.executionOffice?.name || '— Seçilmemiş'}
                  </span>
                  <button 
                    onClick={() => setFinanceDrawerOpen(true)}
                    className="p-1 hover:bg-purple-100 rounded"
                    title="Detaylar"
                  >
                    <Edit className="h-2.5 w-2.5 text-purple-500" />
                  </button>
                </div>
              </div>
              
              {/* Entegrasyon - sıkı grid */}
              <div className="pt-1 border-t space-y-0.5 text-[11px]">
                {/* UYAP + Kod tek satırda */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">UYAP</span>
                  <span className={`font-medium flex items-center gap-1 ${hasUyap ? 'text-green-600' : 'text-red-500'}`}>
                    {hasUyap ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Bağlı 
                        <span className="text-gray-500 font-mono text-[10px]">({caseData.uyapBirimKodu || caseData.executionOffice?.uyapCode})</span>
                        <button className="text-blue-500 hover:text-blue-700 ml-1" title="Senkronize Et">
                          <RefreshCw className="h-2.5 w-2.5" />
                        </button>
                      </>
                    ) : (
                      <><XCircle className="h-3 w-3" /> Bağlı Değil</>
                    )}
                  </span>
                </div>
                {/* UYAP'a Gönder Butonu */}
                <button
                  onClick={handlePrepareForUyap}
                  disabled={!hasUyap}
                  className={`w-full mt-1 py-1 px-2 text-[10px] font-medium rounded flex items-center justify-center gap-1 transition-colors ${
                    hasUyap 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                  title={hasUyap ? 'UYAP\'a gönderim hazırlığı başlat' : 'UYAP bağlantısı gerekli'}
                >
                  <FileText className="h-3 w-3" />
                  UYAP'a Gönder
                </button>
                {/* Banka */}
                <div className="flex items-center justify-between group">
                  <span className="text-gray-500">Banka</span>
                  <div className="flex items-center gap-1">
                    <span 
                      className={`font-medium cursor-pointer hover:underline ${caseData.executionOffice?.bankName ? 'text-green-600' : 'text-orange-500'}`}
                      onClick={() => setFinanceDrawerOpen(true)}
                    >
                      {caseData.executionOffice?.bankName || '— Tanımsız'}
                    </span>
                    {caseData.executionOffice?.bankName && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(caseData.executionOffice?.bankName || '', 'Banka'); }}
                        className="opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded p-0.5"
                      >
                        <Copy className="h-2.5 w-2.5 text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>
                {/* IBAN */}
                <div className="flex items-center justify-between group">
                  <span className="text-gray-500">IBAN</span>
                  <div className="flex items-center gap-1">
                    <span 
                      className={`font-medium font-mono text-[10px] cursor-pointer hover:underline ${caseData.executionOffice?.iban ? 'text-green-600' : 'text-orange-500'}`}
                      onClick={() => setFinanceDrawerOpen(true)}
                      title={caseData.executionOffice?.iban || ''}
                    >
                      {caseData.executionOffice?.iban ? maskIban(caseData.executionOffice.iban) : '— Tanımsız'}
                    </span>
                    {caseData.executionOffice?.iban && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(caseData.executionOffice?.iban || '', 'IBAN'); }}
                        className="opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded p-0.5"
                      >
                        <Copy className="h-2.5 w-2.5 text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* KART B: TAKİBİN YAŞAMI (3/12) - Açık Yeşil (risk durumuna göre değişir) */}
          <div className={`col-span-3 rounded-lg p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${remainingDays <= 60 ? 'bg-red-50 border border-red-200' : remainingDays <= 180 ? 'bg-yellow-50 border border-yellow-200' : 'bg-[#EDF8F1] border border-[#D7EFE2]'}`}>
            <h4 className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 border-b pb-1">Takibin Yaşamı</h4>
            <div className="space-y-1">
              {/* Açılış tarihi - düzenlenebilir */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-500">Açılış</span>
                <div className="flex items-center gap-1">
                  {editingCaseDate ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={caseDateValue}
                        onChange={(e) => setCaseDateValue(e.target.value)}
                        className="border border-blue-400 rounded px-1.5 py-0.5 text-[11px] w-28 focus:ring-1 focus:ring-blue-300"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveCaseDate}
                        disabled={savingCaseDate}
                        className="p-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        title="Kaydet"
                      >
                        {savingCaseDate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => { setEditingCaseDate(false); setCaseDateValue(caseData.caseDate?.split('T')[0] || ''); }}
                        className="p-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                        title="İptal"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium">{formatDate(caseData.caseDate)}</span>
                      <button
                        onClick={() => { setEditingCaseDate(true); setCaseDateValue(caseData.caseDate?.split('T')[0] || ''); }}
                        className="p-1 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 hover:border-purple-300 transition-colors"
                        title="Tarihi Düzenle"
                      >
                        <Edit className="h-3 w-3 text-purple-500" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Geçen / Kalan - inline metrikler */}
              <div className="flex items-center justify-between py-1">
                <div className="text-center">
                  <span className="text-[9px] text-gray-500 uppercase block">Geçen</span>
                  <span className="text-lg font-bold text-slate-600">{dayCount}</span>
                  <span className="text-[9px] text-gray-400 ml-0.5">gün</span>
                </div>
                <div className="text-gray-300">|</div>
                <div className="text-center">
                  <span className={`text-[9px] uppercase block ${remainingStyle.text}`}>Kalan</span>
                  <span className={`text-lg font-bold ${remainingStyle.text}`}>{remainingDays}</span>
                  <span className={`text-[9px] ml-0.5 ${remainingStyle.text}`}>gün</span>
                  {remainingDays <= 60 && <AlertTriangle className={`h-3 w-3 inline ml-1 ${remainingStyle.text}`} />}
                </div>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${remainingStyle.bg} ${remainingStyle.text}`}>
                  {remainingStyle.label}
                </span>
              </div>
              
              {/* Son İşlem + Statü - sıkı */}
              <div className="pt-1 border-t space-y-0.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Son İşlem</span>
                  <span className="text-gray-600">
                    {caseData.lastEnforcementActionAt || caseData.lastAutoActionAt 
                      ? formatDate(caseData.lastEnforcementActionAt || caseData.lastAutoActionAt || '')
                      : <span className="text-gray-400 italic">—</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Statü</span>
                  <div className="flex items-center gap-1">
                    {editingCaseStatus ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={caseStatusValue}
                          onChange={(e) => setCaseStatusValue(e.target.value)}
                          className="border border-blue-400 rounded px-1.5 py-0.5 text-[10px] w-32 focus:ring-1 focus:ring-blue-300"
                          autoFocus
                        >
                          {statusOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleSaveCaseStatus}
                          disabled={savingCaseStatus}
                          className="p-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                          title="Kaydet"
                        >
                          {savingCaseStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={() => { setEditingCaseStatus(false); setCaseStatusValue(caseData.caseStatus || ''); }}
                          className="p-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                          title="İptal"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className={`font-medium ${statusOptions.find(s => s.value === caseData.caseStatus)?.color || (caseData.caseStatus === 'DERDEST' ? 'text-blue-600' : 'text-gray-600')}`}>
                          {statusOptions.find(s => s.value === caseData.caseStatus)?.label || caseData.caseStatus}
                        </span>
                        <button
                          onClick={() => { setEditingCaseStatus(true); setCaseStatusValue(caseData.caseStatus || ''); }}
                          className="p-1 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 hover:border-purple-300 transition-colors"
                          title="Statüyü Değiştir"
                        >
                          <Edit className="h-3 w-3 text-purple-500" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* KART C: TAKİP TÜRÜ (4/12) - Bulut Mavisi */}
          <div className="col-span-4 bg-[#EEF4FB] border border-[#DCE6F2] rounded-lg p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h4 className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 border-b pb-1">Takip Türü</h4>
            <div className="space-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Tip</span>
                <span className="font-medium text-gray-900">{caseTypeShort[caseData.type] || caseData.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Yol</span>
                <span className="font-medium text-gray-900" title={
                  (getValue('executionPath') as string) === 'HACIZ' ? 'Haciz yoluyla takip işlemleri için geçerlidir.' :
                  (getValue('executionPath') as string) === 'IFLAS' ? 'İflas yoluyla takip işlemleri için geçerlidir.' :
                  (getValue('executionPath') as string) === 'REHIN' ? 'Rehin paraya çevirme işlemleri için geçerlidir.' :
                  'Tahliye işlemleri için geçerlidir.'
                }>
                  {(getValue('executionPath') as string) || 'HACİZ'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Alt Tip</span>
                <span className="font-medium text-gray-900">{(getValue('subCategory') as string) || 'GENEL'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* DURUM ÖZETİ - kompakt */}
        <div className="mt-1.5 pt-1.5 border-t flex items-center justify-between text-[9px]">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">📌</span>
            <span className={caseData.caseStatus === 'DERDEST' ? 'text-blue-600' : 'text-gray-500'}>
              {caseData.caseStatus === 'DERDEST' ? 'Aktif' : caseData.caseStatus}
            </span>
            <span className="text-gray-300">•</span>
            <span className={hasUyap ? 'text-green-600' : 'text-red-500'}>
              UYAP {hasUyap ? '✓' : '✗'}
            </span>
            <span className="text-gray-300">•</span>
            <span className={hasExecutionOfficeBank ? 'text-green-600' : 'text-orange-500'}>
              Banka {hasExecutionOfficeBank ? '✓' : '✗'}
            </span>
            <span className="text-gray-300">•</span>
            <span className={remainingStyle.text}>{remainingStyle.label}</span>
          </div>
          <span className="text-gray-400">{caseData.fileNumber}</span>
        </div>
      </div>

      {/* ANA İÇERİK */}
      <div className="flex-1 flex flex-col bg-[#F1F3F6]">
        
        {/* DOSYA TARAFLARI - Yatay 3 Sütun */}
        <div className="mx-3 mt-3 bg-[#EDF8F1] border border-[#D7EFE2] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] px-3 py-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Dosya Tarafları</h4>
            <Link href={`/cases/${caseData.id}/edit?tab=parties`} className="text-[10px] text-blue-600 hover:underline">Düzenle</Link>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {/* Yetkili Avukatlar + Stj. Avukatlar + Personel */}
            <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-2 py-1 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                <span className="font-semibold text-blue-800 text-[11px]">Dosya Ekibi</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setTeamModalOpen(true)}
                    className="text-[9px] text-blue-600 hover:text-blue-700 hover:bg-blue-100 px-1.5 py-0.5 rounded flex items-center gap-0.5"
                    title="Ekip Üyesi Ekle"
                  >
                    <Users className="h-3 w-3" />
                    + Ekle
                  </button>
                  <span className="text-[9px] text-blue-600">{(caseData.lawyers?.length || 0) + (caseData.staff?.length || 0)}</span>
                </div>
              </div>
              <div className="divide-y max-h-48 overflow-y-auto">
                {/* M2-G3b: Dosya Sorumlusu = gerçek kişi seçici (aday GET + mevcut GET + PATCH). A3 statik satırının yerine. */}
                <ResponsiblePersonPicker caseId={caseData.id} />
                {/* Yetkili Avukatlar Başlık */}
                {(caseData.lawyers?.filter(le => le.lawyer.lawyerRank !== 'INTERN' && !le.lawyer.barNumber?.startsWith('STJ'))?.length || 0) > 0 && (
                  <div className="px-2 py-1 bg-blue-50/50">
                    <span className="text-[9px] font-semibold text-blue-600 uppercase">Yetkili Avukatlar</span>
                  </div>
                )}
                {/* Avukatlar */}
                {caseData.lawyers?.filter(le => le.lawyer.lawyerRank !== 'INTERN' && !le.lawyer.barNumber?.startsWith('STJ')).map((le) => {
                  const lawyerRank = le.lawyer.lawyerRank || 'LAWYER';
                  const rankLabel = lawyerRank === 'PARTNER' ? 'Ortak' : 
                                   lawyerRank === 'MANAGER' ? 'Yönetici' : 
                                   lawyerRank === 'AUTHORIZED' ? 'Yetkili' : 'Avukat';
                  const rankColor = lawyerRank === 'PARTNER' ? 'bg-purple-100 text-purple-700' : 
                                   lawyerRank === 'MANAGER' ? 'bg-blue-100 text-blue-700' : 
                                   lawyerRank === 'AUTHORIZED' ? 'bg-green-100 text-green-700' : 
                                   'bg-gray-100 text-gray-700';
                  return (
                  <div 
                    key={le.id} 
                    className="px-2 py-1.5 hover:bg-blue-50 cursor-pointer transition-colors group"
                    onClick={() => handleLawyerClick(le)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[11px] truncate group-hover:text-blue-700">Av. {le.lawyer.name} {le.lawyer.surname}{le.lawyer.isActive === false && <span className="ml-1 px-1 rounded bg-gray-200 text-gray-600 text-[9px] font-normal align-middle">Pasif</span>}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-[8px] ${rankColor} px-1 py-0.5 rounded font-medium`}>{rankLabel}</span>
                        {le.canSign && <span className="text-[8px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-medium">İmza</span>}
                        <ChevronRight className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                      </div>
                    </div>
                  </div>
                  );
                })}
                
                {/* Stajyer Avukatlar Başlık */}
                {(caseData.lawyers?.filter(le => le.lawyer.lawyerRank === 'INTERN' || le.lawyer.barNumber?.startsWith('STJ'))?.length || 0) > 0 && (
                  <div className="px-2 py-1 bg-orange-50/50">
                    <span className="text-[9px] font-semibold text-orange-600 uppercase">Stajyer Avukatlar</span>
                  </div>
                )}
                {/* Stajyer Avukatlar */}
                {caseData.lawyers?.filter(le => le.lawyer.lawyerRank === 'INTERN' || le.lawyer.barNumber?.startsWith('STJ')).map((le) => (
                  <div 
                    key={le.id} 
                    className="px-2 py-1.5 hover:bg-orange-50 cursor-pointer transition-colors group"
                    onClick={() => handleLawyerClick(le)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[11px] truncate group-hover:text-orange-700">Stj. Av. {le.lawyer.name} {le.lawyer.surname}{le.lawyer.isActive === false && <span className="ml-1 px-1 rounded bg-gray-200 text-gray-600 text-[9px] font-normal align-middle">Pasif</span>}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded font-medium">Stajyer</span>
                        <ChevronRight className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Yetkili Personel Başlık */}
                {(caseData.staff?.length || 0) > 0 && (
                  <div className="px-2 py-1 bg-purple-50/50">
                    <span className="text-[9px] font-semibold text-purple-600 uppercase">Yetkili Personel</span>
                  </div>
                )}
                {/* Adli Personel */}
                {caseData.staff?.map((se) => (
                  <div 
                    key={se.id} 
                    className="px-2 py-1.5 hover:bg-purple-50 cursor-pointer transition-colors group"
                    onClick={() => handleStaffClick(se)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[11px] truncate group-hover:text-purple-700">{se.staffMember.firstName} {se.staffMember.lastName}{se.staffMember.isActive === false && <span className="ml-1 px-1 rounded bg-gray-200 text-gray-600 text-[9px] font-normal align-middle">Pasif</span>}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded font-medium">{se.roleOnCase || se.staffMember.staffType || 'Personel'}</span>
                        <ChevronRight className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                      </div>
                    </div>
                  </div>
                ))}
                {!caseData.lawyers?.length && !caseData.staff?.length && (
                  <p className="text-[10px] text-gray-400 text-center py-2">—</p>
                )}
              </div>
            </div>

            {/* Müvekkiller */}
            <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-2 py-1 bg-green-50 border-b border-green-100 flex items-center justify-between">
                <span className="font-semibold text-green-800 text-[11px]">Müvekkiller</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const firstClient = caseData.caseClients?.[0]?.client || caseData.client;
                      if (firstClient) {
                        setExpenseClientId(firstClient.id);
                        setExpenseClientName(firstClient.displayName || firstClient.name || '');
                        setExpenseModalOpen(true);
                      }
                    }}
                    className="text-[9px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-0.5"
                    title="Masraf Talebi Oluştur"
                  >
                    <Receipt className="h-3 w-3" />
                    Masraf
                  </button>
                  <span className="text-[9px] text-green-600">{caseData.caseClients?.length || (caseData.client ? 1 : 0)}</span>
                </div>
              </div>
              <div className="divide-y max-h-32 overflow-y-auto">
                {caseData.caseClients?.length ? caseData.caseClients.map((cc) => {
                  const client = cc.client;
                  // type PERSON veya INDIVIDUAL olabilir, COMPANY ve PUBLIC dışındaki her şey şahıs
                  const isIndividual = client.type !== 'COMPANY' && client.type !== 'PUBLIC';
                  const identityNo = isIndividual ? client.tckn : client.vkn;
                  const hasContact = client.phone || client.email;
                  const hasAddress = client.address || client.city;
                  return (
                    <div 
                      key={cc.id} 
                      className="px-2 py-1.5 hover:bg-green-50 cursor-pointer transition-colors group"
                      onClick={() => {
                        setSelectedClient({ ...client, role: cc.role });
                        setClientDrawerOpen(true);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[11px] truncate group-hover:text-green-700">
                            {client.displayName || client.name}
                            {client.isActive === false && <span className="ml-1 px-1 rounded bg-gray-200 text-gray-600 text-[9px] font-normal align-middle">Pasif</span>}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {identityNo && (
                              <span className="text-[9px] text-gray-500">
                                {isIndividual ? 'TC' : 'VKN'}: {identityNo}
                              </span>
                            )}
                            {client.phone && (
                              <span className="text-[9px] text-gray-400">📞 {client.phone.slice(0, 7)}...</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {!identityNo && <span className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">Kimlik Eksik</span>}
                          {!hasContact && <span className="text-[8px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded">İletişim Eksik</span>}
                          <ChevronRight className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                        </div>
                      </div>
                    </div>
                  );
                }) : caseData.client ? (
                  <div 
                    className="px-2 py-1.5 hover:bg-green-50 cursor-pointer transition-colors group"
                    onClick={() => {
                      setSelectedClient(caseData.client!);
                      setClientDrawerOpen(true);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[11px] truncate group-hover:text-green-700">
                          {caseData.client.displayName || caseData.client.name}
                          {caseData.client.isActive === false && <span className="ml-1 px-1 rounded bg-gray-200 text-gray-600 text-[9px] font-normal align-middle">Pasif</span>}
                        </p>
                      </div>
                      <ChevronRight className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                    </div>
                  </div>
                ) : <p className="text-[10px] text-gray-400 text-center py-2">—</p>}
              </div>
            </div>

            {/* Borçlular - Yeni Tasarım (FAZ 1) */}
            <div className="bg-red-50/50 border border-red-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-2 py-1.5 bg-red-100 border-b border-red-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-red-800 text-[11px]">Borçlular</span>
                  {debtorsSummary && debtorsSummary.danger > 0 && (
                    <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">
                      {debtorsSummary.danger} Riskli
                    </span>
                  )}
                </div>
                {debtorsSummary && (
                  <DebtorsSummaryBar summary={debtorsSummary} isLoading={loadingDebtors} />
                )}
              </div>
              <div className="p-2 space-y-2 max-h-48 overflow-y-auto">
                {loadingDebtors ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-red-400" />
                  </div>
                ) : caseDebtors.length > 0 ? (
                  caseDebtors.map((debtor) => (
                    <DebtorRow
                      key={debtor.caseDebtorId}
                      debtor={debtor}
                      onClick={() => handleDebtorClick(debtor)}
                    />
                  ))
                ) : caseDebtorLinks.length ? (
                  // Fallback to old data if new API not available
                  caseDebtorLinks.map((de) => (
                    <div 
                      key={de.id} 
                      className="px-2 py-1.5 hover:bg-red-100 cursor-pointer transition-colors group border-l-2 border-red-400 rounded"
                      onClick={() => {
                        setSelectedDebtor({
                          caseDebtorId: de.id,
                          debtorId: de.debtor.id,
                          name: de.debtor.name,
                          displayName: de.debtor.displayName,
                          tckn: de.debtor.tckn,
                          vkn: (de.debtor as any).vkn,
                          type: (de.debtor as any).type,
                          phone: (de.debtor as any).phone,
                          email: (de.debtor as any).email,
                          address: (de.debtor as any).address,
                          city: (de.debtor as any).city,
                          district: (de.debtor as any).district,
                          role: de.role,
                        });
                        setDebtorDrawerOpen(true);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[11px] text-gray-900 group-hover:text-red-700">
                            {de.debtor.displayName || de.debtor.name}
                            {(de as any).lifecycleStatus === "PASSIVE" && (
                              <span className="ml-1 px-1 rounded bg-gray-200 text-gray-600 text-[9px] font-normal align-middle">Pasif</span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {de.debtor.tckn && <span className="text-[9px] text-gray-500">TCKN: {de.debtor.tckn}</span>}
                            <span className="text-[8px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-medium">{de.role === 'ASIL_BORCLU' ? 'Asıl' : de.role}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-gray-400 text-center py-2">—</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Müvekkil Bilgi Formu Linki (Faz 4.7 PR-B) — link üret/listele/iptal */}
        <div className="px-3 pt-3">
          <IntakeLinksCard
            caseId={caseData.id}
            client={caseData.client}
            caseClients={caseData.caseClients}
          />
        </div>

        {/* ALT İÇERİK - 2 Panel */}
        <div className="flex gap-3 p-3 min-h-[900px]">
          {/* SOL - Finans + Notlar */}
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            {/* Finans Paneli - 2 Sütun */}
            <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3">
              <div className="flex gap-4">
                {/* Sol Sütun - Alacak Kalemleri */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-semibold text-gray-700">Alacak Kalemleri</h4>
                    <button 
                      className="text-[9px] text-blue-600 hover:text-blue-800 hover:underline"
                      onClick={() => { setEditingDue(null); setDueModalOpen(true); }}
                    >
                      + Düzenle
                    </button>
                  </div>
                  <div className="bg-[#FAFAFB] border border-[#E5E7EB] rounded-lg p-2 min-h-[80px] max-h-[150px] overflow-y-auto">
                    {loadingFinance ? (
                      <p className="text-[9px] text-gray-400 text-center py-2">Yükleniyor...</p>
                    ) : dues.length > 0 ? (
                      <div className="space-y-1">
                        {dues.map((due: any) => {
                          // Type'ı Türkçe'ye çevir
                          const typeLabels: Record<string, string> = {
                            PRINCIPAL: 'Asıl Alacak',
                            INTEREST: 'Faiz',
                            EXPENSE: 'Masraf',
                            VEKALET_UCRETI: 'Vekalet Ücreti',
                            HARC: 'Harç',
                            TAZMINAT: 'Tazminat',
                            CEZAI_SART: 'Cezai Şart',
                            NAFAKA: 'Nafaka',
                            KIRA: 'Kira Alacağı',
                            AIDAT: 'Aidat',
                            KOMISYON: 'Komisyon',
                            PRIM: 'Prim/İkramiye',
                            OTHER: 'Diğer',
                          };
                          const displayName = due.description || typeLabels[due.type] || due.type;
                          
                          return (
                          <div 
                            key={due.id} 
                            className="flex justify-between text-[10px] group hover:bg-blue-50 rounded px-1 -mx-1 py-0.5 cursor-pointer"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingDue(due); setDueModalOpen(true); }}
                          >
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-gray-600 truncate" title={displayName}>
                                {displayName}
                              </span>
                              {due.dueDate && (
                                <span className="text-[9px] text-gray-400">
                                  Vade: {new Date(due.dueDate).toLocaleDateString('tr-TR')}
                                </span>
                              )}
                              {/* Faiz türü bilgisi - sadece PRINCIPAL için göster */}
                              {due.type === 'PRINCIPAL' && (
                                <span className="text-[9px] text-purple-500 italic">
                                  Faiz: {due.interestType === 'YASAL' ? 'Yasal Faiz' : 
                                         due.interestType === 'TICARI_DEGISEN' ? 'Ticari (TCMB Avans)' :
                                         due.interestType === 'TICARI_SABIT' ? 'Ticari (Sabit)' :
                                         due.interestType ? due.interestType :
                                         (caseData.type === 'CHECK' || caseData.type === 'BOND') ? 'Ticari (TCMB Avans)' : 'Yasal Faiz'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-right min-w-[90px]">{Number(due.amount || 0).toLocaleString('tr-TR')} ₺</span>
                              <button 
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (confirm('Bu alacak kalemini silmek istediğinize emin misiniz?')) {
                                    try {
                                      await api.deleteDue(caseData.id, due.id);
                                      fetchFinanceData();
                                    } catch (err) {
                                      console.error('Silme hatası:', err);
                                      alert('Silme işlemi başarısız oldu');
                                    }
                                  }
                                }}
                                title="Sil"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          );
                        })}
                        <div className="flex justify-between pt-1 mt-1 border-t border-dashed text-[10px] font-semibold text-blue-700">
                          <span>Toplam</span>
                          <div className="flex items-center gap-1">
                            <span className="text-right min-w-[90px]">{dues.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0).toLocaleString('tr-TR')} ₺</span>
                            <span className="w-3"></span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-600">Asıl Alacak</span>
                          <span className="font-medium">{Number(caseData.principalAmount || 0).toLocaleString('tr-TR')} ₺</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sağ Sütun - Ödemeler/Tahsilatlar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-semibold text-gray-700">Ödemeler</h4>
                    <button 
                      className="text-[9px] text-green-600 hover:text-green-800 hover:underline"
                      onClick={() => { setEditingCollection(null); setCollectionModalOpen(true); }}
                    >
                      + Düzenle
                    </button>
                  </div>
                  <div className="bg-[#FAFAFB] border border-[#E5E7EB] rounded-lg p-2 min-h-[80px] max-h-[150px] overflow-y-auto">
                    {loadingFinance ? (
                      <p className="text-[9px] text-gray-400 text-center py-2">Yükleniyor...</p>
                    ) : collections.filter((c: any) => c.status !== 'CANCELLED').length > 0 ? (
                      <div className="space-y-1">
                        {collections
                          .filter((c: any) => c.status !== 'CANCELLED')
                          .sort((a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
                          .map((col: any) => {
                          const typeLabels: Record<string, string> = {
                            TAHSILAT: 'Tahsilat',
                            FERAGAT: 'Feragat',
                            MAHSUP: 'Mahsup',
                            SULH: 'Sulh',
                            IADE: 'İade',
                            CASH: 'Nakit',
                            BANK_TRANSFER: 'Havale',
                            CHECK: 'Çek',
                          };
                          const colDate = col.date ? new Date(col.date).toLocaleDateString('tr-TR') : '';
                          return (
                          <div 
                            key={col.id} 
                            className="flex justify-between items-center text-[10px] group hover:bg-green-50 rounded px-1 -mx-1 py-0.5"
                          >
                            <div 
                              className="flex flex-col min-w-0 flex-1 cursor-pointer"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingCollection(col); setCollectionModalOpen(true); }}
                            >
                              <span className="text-gray-600 truncate">
                                {typeLabels[col.type] || col.type}
                              </span>
                              <span className="text-[9px] text-gray-400">{colDate}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-green-700 flex-shrink-0">+{Number(col.amount || 0).toLocaleString('tr-TR')} ₺</span>
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!confirm('Bu tahsilatı silmek istediğinize emin misiniz?')) return;
                                  try {
                                    await api.deleteCollection(caseData.id, col.id);
                                    fetchFinanceData();
                                  } catch (err: any) {
                                    alert(`Silme hatası: ${err?.message || 'Bilinmeyen hata'}`);
                                  }
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-opacity"
                                title="Sil"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    ) : (
                      <p className="text-[9px] text-gray-400 text-center py-2">Henüz ödeme yok</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* PR-5a: Alacak Kalemleri (Kanonik) — salt görüntüleme · collapsible + lazy (kapalı gelir) */}
            <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3">
              <button
                type="button"
                onClick={() => setShowCanonicalClaims((v) => !v)}
                className="w-full flex items-center justify-between gap-2"
              >
                <div className="text-left">
                  <h4 className="text-[11px] font-semibold text-gray-700">Alacak Kalemleri (Kanonik)</h4>
                  <p className="text-[9px] text-gray-400">Tahsilat ve TBK100 dağıtımında kullanılan kanonik alacak kalemleri. Metadata düzenlenebilir; tutar ve kalem tipi bakiye cutover tamamlanana kadar kilitlidir.</p>
                </div>
                <span className="text-[10px] text-blue-600 whitespace-nowrap">{showCanonicalClaims ? "▲ Gizle" : "▼ Göster"}</span>
              </button>
              {showCanonicalClaims && (
                <div className="mt-2">
                  <ClaimItemPanel caseId={caseData.id} readOnly metadataEdit />
                </div>
              )}
            </div>

            {/* Operasyon Masası - Accordion Paneller */}
            <div className="flex-1 overflow-hidden flex flex-col bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <OperationDeck
                caseId={caseData.id}
                // Müvekkil Talepleri - AddressAuditLog + Expense Requests
                muvekkilTalepleri={[
                  // Adres talepleri
                  ...addressNotes
                    .filter((note: any) => note.action === 'CLIENT_NOTIFICATION_SENT' || note.action === 'ADDRESS_WORKFLOW_TRIGGERED')
                    .map((note: any) => ({
                      id: note.id,
                      type: 'EVRAK_TALEBI' as const,
                      content: note.content || 'Müvekkile adres bilgisi talebi gönderildi',
                      status: 'BEKLIYOR' as const,
                      createdAt: note.createdAt,
                      createdBy: note.createdBy,
                    })),
                  // Masraf talepleri (expense three-view'dan)
                  ...expenseThreeViewData.map((item) => ({
                    id: item.clientRequest.id,
                    type: 'MASRAF_TALEBI' as const,
                    content: item.clientRequest.content,
                    amount: item.clientRequest.amount,
                    status: item.clientRequest.status === 'TAMAMLANDI' ? 'TAMAMLANDI' as const : 'BEKLIYOR' as const,
                    createdAt: item.clientRequest.createdAt,
                  })),
                ]}
                // İcra Notları - Diğer sistem notları
                icraNotlar={addressNotes
                  .filter((note: any) => note.action !== 'CLIENT_NOTIFICATION_SENT' && note.action !== 'ADDRESS_WORKFLOW_TRIGGERED')
                  .map((note: any) => ({
                    id: note.id,
                    content: note.content,
                    createdAt: note.createdAt,
                    createdBy: note.createdBy,
                  }))}
                tasks={[
                  // Adres görevleri (API'den)
                  ...addressTasks,
                  // Masraf görevleri (expense three-view'dan)
                  ...expenseThreeViewData
                    .filter((item) => item.task.status !== 'YAPILDI')
                    .map((item) => ({
                      id: item.task.id,
                      title: item.task.title,
                      description: item.task.description,
                      source: 'SISTEM' as const,
                      basis: 'MASRAF_TALEBI',
                      taskType: 'EXPENSE_REQUEST',
                      status: item.task.status,
                      dueDate: item.task.dueDate,
                      priority: item.task.priority,
                      category: 'SURE_BAGLI' as const,
                    })),
                  // Örnek sistem önerisi - workflowStage'e göre
                  ...(caseData.workflowStage === 'ODEME_EMRI' ? [{
                    id: 'sys-1',
                    title: 'Tebligat sonucunu kontrol et',
                    description: 'Ödeme emri tebliğ edildi mi?',
                    source: 'SISTEM' as const,
                    basis: 'İİK m.60',
                    status: 'BEKLIYOR' as const,
                    category: 'SONRAKI_HAMLE' as const,
                    priority: 'HIGH' as const,
                  }] : []),
                ]}
                financeItems={[
                  // Tahsilatlar
                  ...collections.filter((c: any) => c.status !== 'CANCELLED').map((c: any) => ({
                    id: c.id,
                    type: 'TAHSILAT' as const,
                    amount: Number(c.amount || 0),
                    date: c.date || c.createdAt,
                    description: c.description || 'Tahsilat',
                  })),
                  // Masraf talepleri (expense three-view'dan)
                  ...expenseThreeViewData.map((item) => ({
                    id: item.finance.id,
                    type: 'MASRAF_TALEP' as const,
                    amount: item.finance.totalAmount,
                    date: item.finance.date,
                    description: item.finance.description,
                    status: item.finance.status,
                    paidAmount: item.finance.paidAmount,
                    remainingAmount: item.finance.remainingAmount,
                    items: item.finance.items,
                  })),
                ]}
                uyapQueries={[]}
                relatedCases={[]}
                clientBalance={0}
                onOpenChat={() => setMessageModalOpen(true)}
                onAddNote={() => {
                  // Not ekleme modalı açılacak
                  console.log('Not ekle');
                }}
                onAddTask={() => {
                  // Görev ekleme modalı açılacak
                  console.log('Görev ekle');
                }}
                onTaskAction={async (taskId, action) => {
                  // Görev tamamla veya iptal et
                  try {
                    if (action === 'complete') {
                      await api.completeAddressTask(taskId, { resultType: 'POSITIVE' });
                    } else {
                      await api.cancelAddressTask(taskId, 'USER_CANCELLED');
                    }
                    // Görevleri yenile
                    fetchAddressTasksAndNotes();
                  } catch (error) {
                    console.error('Görev işlemi başarısız:', error);
                  }
                }}
                onConfirmReceived={async (taskId) => {
                  // "Zaten aldık" - Adresler zaten alınmış, görevi kapat
                  try {
                    await api.confirmAddressTaskReceived(taskId, user?.id);
                    // Görevleri yenile
                    fetchAddressTasksAndNotes();
                    alert('Görev tamamlandı - adresler zaten alınmış olarak işaretlendi');
                  } catch (error) {
                    console.error('Görev tamamlama başarısız:', error);
                    alert('Görev tamamlanırken bir hata oluştu');
                  }
                }}
                onTriggerAddressWorkflow={async () => {
                  // Adres iş akışını başlat
                  if (addressWorkflowLoading) return; // Çift tıklama koruması
                  
                  try {
                    setAddressWorkflowLoading(true);
                    // tenantId'yi user context'inden al
                    const tenantId = user?.tenantId;
                    if (!tenantId) {
                      alert('Kullanıcı bilgisi bulunamadı');
                      return;
                    }
                    const result = await api.triggerAddressWorkflow(caseData.id, tenantId);
                    console.log('Adres iş akışı başlatıldı:', result);
                    
                    // Duplicate kontrolü
                    if (result.skippedDuplicate) {
                      alert('Son 5 dakika içinde zaten e-posta gönderilmiş. Lütfen bekleyin.');
                      return;
                    }
                    
                    alert(`Adres iş akışı başlatıldı: ${result.tasksCreated} görev oluşturuldu`);
                    
                    // Görevleri ve notları yenile
                    fetchAddressTasksAndNotes();
                  } catch (error) {
                    console.error('Adres iş akışı başlatılamadı:', error);
                    alert('Adres iş akışı başlatılırken bir hata oluştu');
                  } finally {
                    setAddressWorkflowLoading(false);
                  }
                }}
                addressWorkflowLoading={addressWorkflowLoading}
              />
            </div>
          </div>

          {/* SAĞ - Hesap Özeti */}
          <div className="w-80 flex-shrink-0 sticky top-4">
            <HesapOzetiPanel
              caseId={caseData.id}
              debtorCount={caseData.debtors?.length || 1}
            />
          </div>
        </div>
      </div>

      {/* AVUKAT DETAY DRAWER */}
      <Drawer isOpen={lawyerDrawerOpen} onClose={() => setLawyerDrawerOpen(false)} title={selectedLawyer ? `Av. ${selectedLawyer.name} ${selectedLawyer.surname}` : 'Avukat Detayı'}>
        {selectedLawyer && (
          <div className="space-y-4">
            {/* Sekme Başlıkları */}
            <div className="flex border-b">
              <button
                onClick={() => setLawyerDrawerTab('permissions')}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  lawyerDrawerTab === 'permissions' 
                    ? 'border-blue-600 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Shield className="h-4 w-4 inline mr-1" />
                Dosya Yetkileri
              </button>
              <button
                onClick={() => setLawyerDrawerTab('profile')}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  lawyerDrawerTab === 'profile' 
                    ? 'border-purple-600 text-purple-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <User className="h-4 w-4 inline mr-1" />
                Avukat Profili
              </button>
            </div>

            {/* Kapsam Etiketi */}
            <div className={`text-xs px-2 py-1 rounded ${
              lawyerDrawerTab === 'permissions' 
                ? 'bg-blue-50 text-blue-700' 
                : 'bg-purple-50 text-purple-700'
            }`}>
              📌 Kapsam: {lawyerDrawerTab === 'permissions' ? 'Bu dosya' : 'Büro genel (tüm dosyalar)'}
            </div>

            {/* SEKME A: DOSYA YETKİLERİ */}
            {lawyerDrawerTab === 'permissions' && (
              <div className="space-y-4">
                {/* Büro Ayarlarındaki Rank - Bilgi Amaçlı */}
                {selectedLawyer.lawyerRank && (
                  <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Büro Ayarlarındaki Yetki Durumu:</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        selectedLawyer.lawyerRank === 'PARTNER' ? 'bg-purple-100 text-purple-700' :
                        selectedLawyer.lawyerRank === 'MANAGER' ? 'bg-blue-100 text-blue-700' :
                        selectedLawyer.lawyerRank === 'AUTHORIZED' ? 'bg-green-100 text-green-700' :
                        selectedLawyer.lawyerRank === 'LAWYER' ? 'bg-gray-100 text-gray-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {selectedLawyer.lawyerRank === 'PARTNER' ? 'Ortak Avukat' :
                         selectedLawyer.lawyerRank === 'MANAGER' ? 'Yönetici Avukat' :
                         selectedLawyer.lawyerRank === 'AUTHORIZED' ? 'Yetkili Avukat' :
                         selectedLawyer.lawyerRank === 'LAWYER' ? 'Avukat' :
                         selectedLawyer.lawyerRank === 'INTERN' ? 'Stajyer' : selectedLawyer.lawyerRank}
                      </span>
                    </div>
                  </div>
                )}

                {/* Rol Seçimi */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Bu Dosyadaki Rol</label>
                  <select 
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={selectedLawyer.caseRole || 'ASSIGNED'}
                    onChange={(e) => {
                      const newRole = e.target.value as 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
                      setSelectedLawyer({...selectedLawyer, caseRole: newRole});
                      
                      // Rol değiştiğinde varsayılan yetkileri ayarla
                      // Önce büro ayarlarındaki defaultPermissions'ı kontrol et
                      const lawyerDefaults = selectedLawyer.permissions;
                      
                      let newPermissions = { ...lawyerPermissions };
                      switch (newRole) {
                        case 'RESPONSIBLE':
                          // Sorumlu avukat - tüm yetkiler açık
                          newPermissions = {
                            canEditCase: true,
                            canGenerateDocs: true,
                            canSyncUYAP: true,
                            canViewFinance: true,
                            canEditFinance: true,
                            canChangeStatus: true,
                            canEditParties: true,
                            receivesNotifications: true,
                          };
                          break;
                        case 'ASSIGNED':
                          // Yetkili avukat - büro ayarlarından veya geniş yetkiler
                          newPermissions = lawyerDefaults ? {
                            canEditCase: lawyerDefaults.canEditCase ?? true,
                            canGenerateDocs: lawyerDefaults.canGenerateDocs ?? true,
                            canSyncUYAP: lawyerDefaults.canSyncUYAP ?? true,
                            canViewFinance: lawyerDefaults.canViewFinance ?? true,
                            canEditFinance: lawyerDefaults.canEditFinance ?? false,
                            canChangeStatus: lawyerDefaults.canChangeStatus ?? false,
                            canEditParties: lawyerDefaults.canEditParties ?? false,
                            receivesNotifications: lawyerPermissions.receivesNotifications,
                          } : {
                            canEditCase: true,
                            canGenerateDocs: true,
                            canSyncUYAP: true,
                            canViewFinance: true,
                            canEditFinance: false,
                            canChangeStatus: false,
                            canEditParties: false,
                            receivesNotifications: true,
                          };
                          break;
                        case 'ASSISTANT':
                          // Yardımcı avukat - temel yetkiler
                          newPermissions = {
                            canEditCase: true,
                            canGenerateDocs: true,
                            canSyncUYAP: false,
                            canViewFinance: true,
                            canEditFinance: false,
                            canChangeStatus: false,
                            canEditParties: false,
                            receivesNotifications: true,
                          };
                          break;
                        case 'INTERN':
                          // Stajyer - kısıtlı yetkiler
                          newPermissions = {
                            canEditCase: false,
                            canGenerateDocs: true,
                            canSyncUYAP: false,
                            canViewFinance: true,
                            canEditFinance: false,
                            canChangeStatus: false,
                            canEditParties: false,
                            receivesNotifications: true,
                          };
                          break;
                      }
                      setLawyerPermissions(newPermissions);
                    }}
                  >
                    <option value="RESPONSIBLE">Sorumlu Avukat</option>
                    <option value="ASSIGNED">Yetkili Avukat</option>
                    <option value="ASSISTANT">Yardımcı Avukat</option>
                    <option value="INTERN">Stajyer Avukat</option>
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Rol değiştiğinde yetkiler otomatik ayarlanır. Manuel olarak da değiştirebilirsiniz.
                  </p>
                </div>

                {/* Yetkiler */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Yetkiler</label>
                  <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                    {[
                      { key: 'canEditCase', label: 'Dosyayı düzenleme', icon: Edit },
                      { key: 'canGenerateDocs', label: 'Evrak oluşturma', icon: FileText },
                      { key: 'canSyncUYAP', label: 'UYAP senkron başlatma', icon: RefreshCw },
                      { key: 'canViewFinance', label: 'Hesap özeti görme', icon: Eye },
                      { key: 'canEditFinance', label: 'Masraf/harç düzenleme', icon: CreditCard },
                      { key: 'canChangeStatus', label: 'Statü değiştirme', icon: Settings },
                      { key: 'canEditParties', label: 'Tarafları düzenleme', icon: Users },
                    ].map(({ key, label, icon: Icon }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded">
                        <input
                          type="checkbox"
                          checked={lawyerPermissions[key as keyof typeof lawyerPermissions]}
                          onChange={(e) => setLawyerPermissions({...lawyerPermissions, [key]: e.target.checked})}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <Icon className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* İmza Yetkisi */}
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Edit className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">Bu dosyada imza yetkisi</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedLawyer.canSign}
                      onChange={(e) => setSelectedLawyer({...selectedLawyer, canSign: e.target.checked})}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Bildirim */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-700">Bildirim alsın</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={lawyerPermissions.receivesNotifications}
                      onChange={(e) => setLawyerPermissions({...lawyerPermissions, receivesNotifications: e.target.checked})}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Kaydet Butonu */}
                <button
                  onClick={handleSaveCasePermissions}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center justify-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Bu dosya için kaydet
                </button>
              </div>
            )}

            {/* SEKME B: AVUKAT PROFİLİ */}
            {lawyerDrawerTab === 'profile' && (
              <div className="space-y-4">
                {/* Uyarı */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  ⚠️ Burada yaptığınız değişiklikler bu avukatın <strong>tüm dosyalarında</strong> görünür.
                </div>

                {/* Temel Bilgiler */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Ad Soyad</label>
                    <p className="text-sm font-semibold text-gray-900">Av. {selectedLawyer.name} {selectedLawyer.surname}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Baro / Sicil No</label>
                    <p className="text-sm text-gray-900">{selectedLawyer.barNumber || '—'}</p>
                  </div>
                </div>

                {/* İletişim Bilgileri */}
                <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-gray-600 uppercase">İletişim</h4>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Telefon
                    </label>
                    <input
                      type="text"
                      value={lawyerProfile.phone}
                      onChange={(e) => setLawyerProfile({...lawyerProfile, phone: e.target.value})}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                      placeholder="0532 xxx xx xx"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                      <Mail className="h-3 w-3" /> E-posta
                    </label>
                    <input
                      type="email"
                      value={lawyerProfile.email}
                      onChange={(e) => setLawyerProfile({...lawyerProfile, email: e.target.value})}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                      placeholder="avukat@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Adres
                    </label>
                    <textarea
                      value={lawyerProfile.address}
                      onChange={(e) => setLawyerProfile({...lawyerProfile, address: e.target.value})}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                      rows={2}
                      placeholder="Büro adresi"
                    />
                  </div>
                </div>

                {/* Banka Bilgileri */}
                <div className="space-y-3 bg-purple-50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-purple-700 uppercase">Banka Bilgileri</h4>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Banka Adı</label>
                    <input
                      type="text"
                      value={lawyerProfile.bankName}
                      onChange={(e) => setLawyerProfile({...lawyerProfile, bankName: e.target.value})}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Şube</label>
                    <input
                      type="text"
                      value={lawyerProfile.branchName}
                      onChange={(e) => setLawyerProfile({...lawyerProfile, branchName: e.target.value})}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">IBAN</label>
                    <input
                      type="text"
                      value={lawyerProfile.iban}
                      onChange={(e) => setLawyerProfile({...lawyerProfile, iban: e.target.value})}
                      className="w-full border rounded px-2 py-1.5 text-sm font-mono"
                      placeholder="TR00 0000 0000 0000 0000 0000 00"
                    />
                  </div>
                </div>

                {/* Kaydet Butonu */}
                <button
                  onClick={handleSaveLawyerProfile}
                  className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm flex items-center justify-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Profili güncelle (Büro genel)
                </button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* PERSONEL DETAY DRAWER */}
      <Drawer isOpen={staffDrawerOpen} onClose={() => setStaffDrawerOpen(false)} title={selectedStaff ? `${selectedStaff.firstName} ${selectedStaff.lastName}` : 'Personel Detayı'}>
        {selectedStaff && (
          <div className="space-y-4">
            {/* Personel Bilgileri */}
            <div className="space-y-3 bg-purple-50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
                  <User className="h-6 w-6 text-purple-700" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{selectedStaff.firstName} {selectedStaff.lastName}</p>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                    {selectedStaff.staffType || 'Personel'}
                  </span>
                </div>
              </div>
            </div>

            {/* Dosyadaki Rol */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-600 uppercase">Bu Dosyadaki Bilgiler</h4>
              <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Dosyadaki Rol</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={selectedStaff.roleOnCase || ''}
                    onChange={(e) => setSelectedStaff({...selectedStaff, roleOnCase: e.target.value})}
                  >
                    <option value="">Belirtilmemiş</option>
                    <option value="SORUMLU">Sorumlu Personel</option>
                    <option value="YARDIMCI">Yardımcı Personel</option>
                    <option value="TAKIPCI">Takipçi</option>
                  </select>
                </div>
                {/* PR-ASSIGN-3b: "İmza Yetkisi" (canSign) toggle KALDIRILDI — personel imzacı değil
                    (avukat kavramı; CaseStaff modelinde alan yok). */}
              </div>
            </div>

            {/* Dosya Yetkileri */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-600 uppercase">Dosya Yetkileri</h4>
              <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                {/* PR-ASSIGN-3b: CaseStaff modelinin 3 yetki bool'u (canEdit/canApprove/canView).
                    Eski 5 ince-taneli permissions{} (lawyer-kopyası, CaseStaff'ta yok) kaldırıldı. */}
                {([
                  { key: 'canEdit', label: 'Düzenleme', icon: Edit },
                  { key: 'canApprove', label: 'Onaylama', icon: FileText },
                  { key: 'canView', label: 'Görüntüleme', icon: Eye },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded">
                    <input
                      type="checkbox"
                      checked={selectedStaff[key] ?? (key === 'canView')}
                      onChange={(e) => setSelectedStaff({ ...selectedStaff, [key]: e.target.checked })}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <Icon className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Bildirim */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-gray-600" />
                <span className="text-sm text-gray-700">Bildirim alsın</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedStaff.receiveNotifications ?? true}
                  onChange={(e) => setSelectedStaff({...selectedStaff, receiveNotifications: e.target.checked})}
                  className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {/* İletişim Bilgileri */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-600 uppercase">İletişim</h4>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span className="text-sm">{selectedStaff.phone || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span className="text-sm">{selectedStaff.email || '—'}</span>
                </div>
              </div>
            </div>

            {/* Kaydet Butonu */}
            <button
              onClick={async () => {
                if (!caseData || !selectedStaff) return;
                try {
                  // PR-ASSIGN-3b: yalnız CaseStaff alanları (canSign/permissions GÖNDERİLMEZ).
                  await api.patch(`/cases/${caseData.id}/staff/${selectedStaff.caseStaffId}`, buildCaseStaffPatch(selectedStaff));
                  await fetchCase();
                  setStaffDrawerOpen(false);
                } catch (error) {
                  console.error('Personel güncelleme hatası:', error);
                  alert('Personel bilgileri güncellenemedi');
                }
              }}
              className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm flex items-center justify-center gap-2"
            >
              <Save className="h-4 w-4" />
              Bu dosya için kaydet
            </button>

            {/* Düzenle Linki */}
            <Link 
              href={`/settings/office?tab=staff&edit=${selectedStaff.staffId}`}
              className="w-full py-2 px-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center justify-center gap-1"
            >
              <Edit className="h-4 w-4" />
              Genel Bilgileri Düzenle
            </Link>
          </div>
        )}
      </Drawer>

      {/* BANKA & ENTEGRASYON DRAWER */}
      <Drawer isOpen={financeDrawerOpen} onClose={() => setFinanceDrawerOpen(false)} title="Banka & Entegrasyon Detayı">
        <div className="space-y-6">
          
          {/* İCRA DAİRESİ BANKA BİLGİLERİ */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-600" /> İcra Dairesi Hesap Bilgileri
            </h3>
            <div className="space-y-3 bg-purple-50 p-3 rounded-lg border border-purple-200">
              <div>
                <label className="block text-xs text-gray-500 mb-1">İcra Dairesi</label>
                <ExecutionOfficeSelect
                  value={caseData.executionOffice?.id || ''}
                  offices={executionOffices}
                  loading={loadingOffices}
                  saving={savingOffice}
                  onChange={handleExecutionOfficeChange}
                  currentOfficeName={caseData.executionOffice?.name}
                />
                {savingOffice && <p className="text-xs text-purple-600 mt-1">Kaydediliyor...</p>}
              </div>
              <BlockField 
                label="Banka Adı" 
                value={caseData.executionOffice?.bankName || ''} 
                editable={!!caseData.executionOffice?.id}
                onSave={(v) => handleExecutionOfficeBankSave('bankName', v)}
                placeholder="Banka adı girin"
              />
              <BlockField 
                label="Şube" 
                value={caseData.executionOffice?.branchName || ''} 
                editable={!!caseData.executionOffice?.id}
                onSave={(v) => handleExecutionOfficeBankSave('branchName', v)}
                placeholder="Şube adı girin"
              />
              <BlockField 
                label="IBAN" 
                value={caseData.executionOffice?.iban || ''} 
                editable={!!caseData.executionOffice?.id}
                onSave={(v) => handleExecutionOfficeBankSave('iban', v)}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
              />
            </div>
          </div>

          {/* MÜVEKKİL BANKA BİLGİLERİ */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" /> Müvekkil Banka Hesabı
            </h3>
            <div className="space-y-3 bg-gray-50 p-3 rounded-lg border">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Banka Adı</label>
                <p className="text-sm font-medium">{clientBankAccount?.bankName || '— Kayıtlı Değil'}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Şube</label>
                <p className="text-sm font-medium">{clientBankAccount?.branchName || '—'}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">IBAN</label>
                <p className="text-sm font-medium font-mono">{clientBankAccount?.iban || '— Kayıtlı Değil'}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hesap Sahibi</label>
                <p className="text-sm font-medium">{clientBankAccount?.accountHolder || '—'}</p>
              </div>
              {!clientBankAccount && !isLawyerCase && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  ⚠️ Avukatsız takipte müvekkil banka hesabı zorunludur.
                </div>
              )}
              {isLawyerCase && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                  ℹ️ Avukatlı takip - tahsilat avukat hesabına yapılacak.
                </div>
              )}
            </div>
          </div>

          {/* UYAP BİLGİLERİ */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-600" /> UYAP & Senkron
            </h3>
            <div className="space-y-3 bg-gray-50 p-3 rounded-lg border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">UYAP Bağlantısı</span>
                <span className={`text-sm font-medium ${hasUyap ? 'text-green-600' : 'text-red-500'}`}>
                  {hasUyap ? <><CheckCircle2 className="h-4 w-4 inline mr-1" /> Bağlı</> : <><XCircle className="h-4 w-4 inline mr-1" /> Bağlı Değil</>}
                </span>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">UYAP Birim Kodu</label>
                <p className="text-sm font-medium font-mono">{caseData.uyapBirimKodu || caseData.executionOffice?.uyapCode || '—'}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">İcra Dairesi</label>
                <p className="text-sm font-medium">{caseData.executionOffice?.name || '—'}</p>
              </div>
            </div>
          </div>

          {/* TAHSİLAT BİLGİLERİ */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600" /> Tahsilat Özeti
            </h3>
            <div className="space-y-3 bg-gray-50 p-3 rounded-lg border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Tahsilat Türü</span>
                <span className="text-sm font-medium">{isLawyerCase ? 'Avukat Hesabına' : 'Müvekkil Hesabına'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Tahsilat Hesabı</span>
                <span className={`text-sm font-medium ${hasPaymentBank ? 'text-green-600' : 'text-red-500'}`}>
                  {hasPaymentBank ? '✔ Tanımlı' : '— Eksik'}
                </span>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Banka Dosya No</label>
                <p className="text-sm font-medium">—</p>
              </div>
              {/* Ödeme Talimatı Butonu */}
              <button
                onClick={() => setPaymentModalOpen(true)}
                className="w-full mt-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <CreditCard className="h-4 w-4" />
                Ödeme Talimatı Oluştur
              </button>
            </div>
          </div>

          {/* UYARI */}
          {(!hasExecutionOfficeBank || !hasPaymentBank) && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm font-medium text-orange-700 mb-1">⚠️ Eksik Bilgiler</p>
              <ul className="text-xs text-orange-600 space-y-1">
                {!hasExecutionOfficeBank && (
                  <li>• İcra dairesi banka bilgileri eksik - <Link href="/settings/office" className="underline">Büro Ayarları</Link>'ndan düzenleyin</li>
                )}
                {!hasPaymentBank && isLawyerCase && (
                  <li>• Avukat banka bilgileri eksik - <Link href="/settings/office" className="underline">Büro Ayarları</Link>'ndan düzenleyin</li>
                )}
                {!hasPaymentBank && !isLawyerCase && (
                  <li>• Müvekkil banka bilgileri eksik - <Link href="/settings/clients" className="underline">Müvekkil Ayarları</Link>'ndan düzenleyin</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </Drawer>

      {/* Payment Instruction Modal */}
      {caseData && (
        <PaymentInstructionModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          caseId={caseData.id}
          executionOfficeName={caseData.executionOffice?.name}
          executionFileNumber={caseData.executionFileNumber}
          debtorName={caseData.debtors?.[0]?.debtor?.name}
        />
      )}

      {/* MÜVEKKİL DETAY DRAWER - Work Card */}
      <Drawer isOpen={clientDrawerOpen} onClose={() => setClientDrawerOpen(false)} title={selectedClient?.displayName || selectedClient?.name || 'Müvekkil'}>
        {selectedClient && (
          <div className="space-y-4">
            {/* 1️⃣ HEADER: İsim + Statü + Kimlik */}
            <div className="pb-3 border-b">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{selectedClient.displayName || selectedClient.name}</h3>
                    {/* Müvekkil Statüsü - otomatik hesaplama */}
                    {clientStats && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        clientStats.staleCases30d > 0 || clientStats.nearExpiryCases > 0 
                          ? 'bg-red-100 text-red-700' 
                          : clientStats.activeCases === 0 
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-green-100 text-green-700'
                      }`}>
                        {clientStats.staleCases30d > 0 || clientStats.nearExpiryCases > 0 
                          ? '🔴 Dikkat' 
                          : clientStats.activeCases === 0 
                            ? '🟡 Pasif'
                            : '🟢 Aktif'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      selectedClient.type !== 'COMPANY' && selectedClient.type !== 'PUBLIC' ? 'bg-blue-50 text-blue-600' :
                      selectedClient.type === 'COMPANY' ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-600'
                    }`}>
                      {selectedClient.type !== 'COMPANY' && selectedClient.type !== 'PUBLIC' ? 'Gerçek Kişi' :
                       selectedClient.type === 'COMPANY' ? 'Tüzel Kişi' : 'Kamu'}
                    </span>
                    {selectedClient.role && (
                      <span className="text-[10px] text-gray-500">• {selectedClient.role === 'ALACAKLI' ? 'Alacaklı' : selectedClient.role}</span>
                    )}
                  </div>
                </div>
                <Link 
                  href={`/settings/clients?edit=${selectedClient.id}`}
                  className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                  title="Düzenle"
                >
                  <Edit className="h-4 w-4" />
                </Link>
              </div>
              <p className="text-xs text-gray-500 font-mono">
                {selectedClient.type !== 'COMPANY' && selectedClient.type !== 'PUBLIC' 
                  ? `TCKN: ${selectedClient.tckn || '—'}` 
                  : `VKN: ${selectedClient.vkn || '—'}`}
                {selectedClient.phone && <span className="ml-3">📞 {selectedClient.phone}</span>}
              </p>
            </div>

            {/* DOSYA YOĞUNLUĞU - 3 sütun */}
            <div className="bg-slate-50 rounded-lg p-3">
              <h4 className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                <FolderOpen className="h-3 w-3" /> Dosya Yoğunluğu
              </h4>
              {loadingClientStats ? (
                <div className="flex items-center justify-center py-3">
                  <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : clientStats ? (
                <div className="grid grid-cols-3 gap-2">
                  <Link 
                    href={`/cases?clientId=${selectedClient.id}&status=ACTIVE`}
                    className="bg-white rounded-lg p-2.5 text-center hover:ring-2 hover:ring-blue-200 transition-all border border-slate-100"
                  >
                    <p className="text-2xl font-bold text-blue-600">{clientStats.activeCases}</p>
                    <p className="text-[10px] text-gray-500">Aktif</p>
                  </Link>
                  <Link 
                    href={`/cases?clientId=${selectedClient.id}`}
                    className="bg-white rounded-lg p-2.5 text-center hover:ring-2 hover:ring-gray-200 transition-all border border-slate-100"
                  >
                    <p className="text-2xl font-bold text-gray-700">{clientStats.totalCases}</p>
                    <p className="text-[10px] text-gray-500">Toplam</p>
                  </Link>
                  <div className="bg-white rounded-lg p-2.5 text-center border border-slate-100">
                    <p className="text-2xl font-bold text-indigo-600">{clientStats.last30dActions}</p>
                    <p className="text-[10px] text-gray-500">Son 30g</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-2">Veri yüklenemedi</p>
              )}
            </div>

            {/* FİNANSAL DURUM - Para birimine göre gruplu */}
            <div className="bg-emerald-50/50 rounded-lg p-3 border border-emerald-100">
              <h4 className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-2">💰 Finansal Durum</h4>
              {loadingClientStats ? (
                <div className="flex items-center justify-center py-3">
                  <div className="h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : clientStats ? (
                <div className="space-y-3">
                  {Object.entries(clientStats.byCurrency).map(([currency, data]) => {
                    const formatCurrency = (val: number) => new Intl.NumberFormat('tr-TR', { 
                      style: 'currency', 
                      currency: currency, 
                      maximumFractionDigits: 0 
                    }).format(val);
                    const ratio = data.totalClaim > 0 ? data.totalCollected / data.totalClaim : 0;
                    
                    return (
                      <div key={currency} className="bg-white rounded-lg p-2 border border-emerald-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-medium text-gray-500">{currency}</span>
                          {data.totalClaim > 0 && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              ratio >= 0.6 ? 'bg-emerald-100 text-emerald-700' :
                              ratio >= 0.3 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                            }`}>
                              %{Math.round(ratio * 100)}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-center">
                          <div>
                            <p className="text-xs font-bold text-gray-900">{formatCurrency(data.totalClaim)}</p>
                            <p className="text-[8px] text-gray-500">Alacak</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-emerald-600">{formatCurrency(data.totalCollected)}</p>
                            <p className="text-[8px] text-gray-500">Tahsil</p>
                          </div>
                          <div>
                            <p className={`text-xs font-bold ${
                              data.totalExpense === 0 ? 'text-gray-400' :
                              data.expenseCollected === 0 ? 'text-red-600' :
                              data.expenseCollected >= data.totalExpense ? 'text-emerald-600' : 'text-amber-600'
                            }`}>{formatCurrency(data.totalExpense)}</p>
                            <p className="text-[8px] text-gray-500">Masraf</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(clientStats.byCurrency).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">Finansal veri yok</p>
                  )}
                </div>
              ) : null}
            </div>

            {/* RİSKLER & UYARILAR - Her zaman görünür */}
            <div className={`rounded-lg p-3 border ${
              clientStats && (clientStats.nearExpiryCases > 0 || clientStats.pendingNotifications > 0 || clientStats.staleCases30d > 0)
                ? 'bg-red-50/50 border-red-200'
                : 'bg-gray-50 border-gray-100'
            }`}>
              <h4 className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${
                clientStats && (clientStats.nearExpiryCases > 0 || clientStats.pendingNotifications > 0 || clientStats.staleCases30d > 0)
                  ? 'text-red-700'
                  : 'text-gray-500'
              }`}>⚠️ Riskler & Uyarılar</h4>
              {loadingClientStats ? (
                <div className="flex items-center justify-center py-2">
                  <div className="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : clientStats ? (
                <div className="space-y-1.5">
                  <Link 
                    href={`/cases?clientId=${selectedClient.id}&filter=expiring`}
                    className={`flex justify-between items-center p-2 rounded ${
                      clientStats.nearExpiryCases > 0 ? 'bg-white hover:bg-red-50' : 'bg-white/50'
                    }`}
                  >
                    <span className="text-xs text-gray-600 flex items-center gap-1.5">
                      <Clock className={`h-3.5 w-3.5 ${clientStats.nearExpiryCases > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                      Zamanaşımı yaklaşan
                    </span>
                    <span className={`text-sm font-bold ${clientStats.nearExpiryCases > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {clientStats.nearExpiryCases}
                    </span>
                  </Link>
                  <Link 
                    href={`/cases?clientId=${selectedClient.id}&filter=notification`}
                    className={`flex justify-between items-center p-2 rounded ${
                      clientStats.pendingNotifications > 0 ? 'bg-white hover:bg-amber-50' : 'bg-white/50'
                    }`}
                  >
                    <span className="text-xs text-gray-600 flex items-center gap-1.5">
                      <Bell className={`h-3.5 w-3.5 ${clientStats.pendingNotifications > 0 ? 'text-amber-500' : 'text-gray-400'}`} />
                      Tebligat bekleyen
                    </span>
                    <span className={`text-sm font-bold ${clientStats.pendingNotifications > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {clientStats.pendingNotifications}
                    </span>
                  </Link>
                  <Link 
                    href={`/cases?clientId=${selectedClient.id}&filter=stale`}
                    className={`flex justify-between items-center p-2 rounded ${
                      clientStats.staleCases30d > 0 ? 'bg-white hover:bg-orange-50' : 'bg-white/50'
                    }`}
                  >
                    <span className="text-xs text-gray-600 flex items-center gap-1.5">
                      <AlertTriangle className={`h-3.5 w-3.5 ${clientStats.staleCases30d > 0 ? 'text-orange-500' : 'text-gray-400'}`} />
                      30+ gündür işlem yok
                    </span>
                    <span className={`text-sm font-bold ${clientStats.staleCases30d > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                      {clientStats.staleCases30d}
                    </span>
                  </Link>
                </div>
              ) : null}
            </div>

            {/* HIZLI AKSİYONLAR - Masraf ve Yeni Takip vurgulu */}
            <div className="pt-3 border-t">
              <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">⚡ Hızlı Aksiyonlar</h4>
              <div className="grid grid-cols-2 gap-2">
                {/* Birincil Aksiyonlar */}
                <button 
                  onClick={() => {
                    setExpenseClientId(selectedClient.id);
                    setExpenseClientName(selectedClient.displayName || selectedClient.name);
                    setExpenseModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 p-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm transition-colors"
                >
                  <Receipt className="h-4 w-4" />
                  Masraf Ekle
                </button>
                <Link 
                  href={`/cases/new?clientId=${selectedClient.id}`}
                  className="flex items-center justify-center gap-2 p-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium text-sm transition-colors"
                >
                  <PlusCircle className="h-4 w-4" />
                  Yeni Takip
                </Link>
                {/* İkincil Aksiyonlar */}
                <Link 
                  href={`/cases?clientId=${selectedClient.id}`}
                  className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm transition-colors"
                >
                  <FolderOpen className="h-4 w-4 text-blue-500" />
                  Dosyalar
                </Link>
                <button 
                  onClick={() => setMessageModalOpen(true)}
                  className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm transition-colors"
                >
                  <MessageSquare className="h-4 w-4 text-green-500" />
                  Mesaj/Not
                </button>
              </div>
            </div>

            {/* İLETİŞİM - Collapsible */}
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer text-[10px] font-semibold text-gray-500 uppercase py-2 border-t">
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> İletişim Bilgileri
                </span>
                <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="pt-2 space-y-2">
                {selectedClient.email && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{selectedClient.email}</span>
                    <div className="flex gap-1">
                      <button onClick={() => copyToClipboard(selectedClient.email!, 'E-posta')} className="p-1 hover:bg-gray-100 rounded">
                        <Copy className="h-3 w-3 text-gray-400" />
                      </button>
                      <a href={`mailto:${selectedClient.email}`} className="p-1 hover:bg-gray-100 rounded">
                        <Mail className="h-3 w-3 text-gray-400" />
                      </a>
                    </div>
                  </div>
                )}
                {selectedClient.address && (
                  <div className="text-sm text-gray-600">
                    <p>{selectedClient.address}</p>
                    {(selectedClient.district || selectedClient.city) && (
                      <p className="text-xs text-gray-400">{[selectedClient.district, selectedClient.city].filter(Boolean).join(' / ')}</p>
                    )}
                  </div>
                )}
                {!selectedClient.email && !selectedClient.address && (
                  <p className="text-xs text-gray-400 italic">İletişim bilgisi eksik</p>
                )}
              </div>
            </details>
          </div>
        )}
      </Drawer>

      {/* MASRAF TALEBİ MODAL */}
      {caseData && (
        <ExpenseRequestModal
          isOpen={expenseModalOpen}
          onClose={() => {
            setExpenseModalOpen(false);
            setExpensePackageCode('');
          }}
          caseId={caseData.id}
          clientId={expenseClientId}
          clientName={expenseClientName}
          caseFileNumber={caseData.fileNumber}
          executionFileNumber={caseData.executionFileNumber}
          initialPackageCode={expensePackageCode}
          onSuccess={() => {
            // Refresh case data or show success message
            fetchCase();
          }}
        />
      )}

      {/* ALACAK KALEMİ MODAL */}
      {caseData && (
        <DueModal
          isOpen={dueModalOpen}
          onClose={() => { setDueModalOpen(false); setEditingDue(null); }}
          caseId={caseData.id}
          due={editingDue}
          onSuccess={fetchFinanceData}
        />
      )}

      {/* ÖDEME/TAHSİLAT MODAL */}
      {caseData && (
        <CollectionModal
          isOpen={collectionModalOpen}
          onClose={() => { setCollectionModalOpen(false); setEditingCollection(null); }}
          caseId={caseData.id}
          collection={editingCollection}
          onSuccess={fetchFinanceData}
        />
      )}

      {/* MESAJ GÖNDER MODAL */}
      {caseData && selectedClient && (
        <SendMessageModal
          isOpen={messageModalOpen}
          onClose={() => setMessageModalOpen(false)}
          recipientType="CLIENT"
          recipientId={selectedClient.id}
          recipientName={selectedClient.displayName || selectedClient.name}
          recipientEmail={selectedClient.email}
          recipientPhone={selectedClient.phone}
          caseId={caseData.id}
          caseFileNumber={caseData.fileNumber}
          executionFileNumber={caseData.executionFileNumber}
          executionOfficeName={caseData.executionOffice?.name}
          onSuccess={() => {
            setClientDrawerOpen(false);
            fetchCase();
          }}
        />
      )}

      {/* EKİP EKLEME MODAL */}
      {teamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setTeamModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Dosya Ekibine Ekle</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Avukat veya personel seçin</p>
                </div>
                <button onClick={() => setTeamModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              
              {/* Tab Seçimi */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setTeamModalTab('lawyers')}
                  className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                    teamModalTab === 'lawyers'
                      ? "bg-blue-50 border-blue-300 text-blue-800"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <User className="h-4 w-4 inline mr-1.5" />
                  Avukatlar ({availableLawyers.length})
                </button>
                <button
                  onClick={() => setTeamModalTab('staff')}
                  className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                    teamModalTab === 'staff'
                      ? "bg-purple-50 border-purple-300 text-purple-800"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Users className="h-4 w-4 inline mr-1.5" />
                  Personel ({availableStaff.length})
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {teamModalTab === 'lawyers' ? (
                <div className="space-y-2">
                  {availableLawyers.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">Eklenebilecek avukat yok</p>
                  ) : (
                    availableLawyers.map((lawyer: any) => {
                      const rankLabel = lawyer.lawyerRank === 'PARTNER' ? 'Ortak' : 
                                       lawyer.lawyerRank === 'MANAGER' ? 'Yönetici' : 
                                       lawyer.lawyerRank === 'AUTHORIZED' ? 'Yetkili' : 
                                       lawyer.lawyerRank === 'INTERN' ? 'Stajyer' : 'Avukat';
                      const rankColor = lawyer.lawyerRank === 'PARTNER' ? 'bg-purple-100 text-purple-700' : 
                                       lawyer.lawyerRank === 'MANAGER' ? 'bg-blue-100 text-blue-700' : 
                                       lawyer.lawyerRank === 'AUTHORIZED' ? 'bg-green-100 text-green-700' : 
                                       lawyer.lawyerRank === 'INTERN' ? 'bg-orange-100 text-orange-700' :
                                       'bg-gray-100 text-gray-700';
                      return (
                        <div 
                          key={lawyer.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          <div>
                            <p className="font-medium text-sm">Av. {lawyer.name} {lawyer.surname}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] ${rankColor} px-1.5 py-0.5 rounded font-medium`}>{rankLabel}</span>
                              {lawyer.barNumber && <span className="text-[10px] text-gray-500">{lawyer.barNumber}</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddLawyer(lawyer.id)}
                            disabled={addingTeamMember}
                            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            {addingTeamMember ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ekle'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {availableStaff.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">Eklenebilecek personel yok</p>
                  ) : (
                    availableStaff.map((staff: any) => {
                      const typeLabel = staff.staffType === 'STAJYER' ? 'Stajyer' :
                                       staff.staffType === 'SEKRETER' ? 'Sekreter' :
                                       staff.staffType === 'MUHASEBE' ? 'Muhasebe' :
                                       staff.staffType === 'ARSIV' ? 'Arşiv' :
                                       staff.staffType || 'Personel';
                      return (
                        <div 
                          key={staff.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-purple-50 transition-colors"
                        >
                          <div>
                            <p className="font-medium text-sm">{staff.firstName} {staff.lastName}</p>
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">{typeLabel}</span>
                          </div>
                          <button
                            onClick={() => handleAddStaff(staff.id)}
                            disabled={addingTeamMember}
                            className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
                          >
                            {addingTeamMember ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ekle'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t bg-gray-50">
              <button
                onClick={() => setTeamModalOpen(false)}
                className="w-full py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BORÇLU DETAY DRAWER - Yeni FAZ 2 Drawer */}
      {caseData && selectedDebtor && (
        <DebtorDetailDrawer
          isOpen={debtorDrawerOpen}
          onClose={() => {
            setDebtorDrawerOpen(false);
            setSelectedDebtor(null);
            setSelectedDebtorDetail(null);
          }}
          caseId={caseData.id}
          caseDebtorId={selectedDebtor.caseDebtorId}
          clientId={caseData.client?.id || caseData.caseClients?.[0]?.client?.id}
          clientEmail={caseData.client?.email || caseData.caseClients?.[0]?.client?.email}
          onUpdate={() => {
            fetchCaseDebtors();
            fetchCase();
          }}
        />
      )}

    </div>
  );
}
