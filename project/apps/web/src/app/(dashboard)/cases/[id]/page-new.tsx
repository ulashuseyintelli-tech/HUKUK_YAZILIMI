"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  FileText,
  User,
  Users,
  Scale,
  Calendar,
  DollarSign,
  Edit,
  AlertTriangle,
  Clock,
  Settings,
  Plus,
  X,
  Save,
  Share2,
  Trash2,
  Building2,
  Gavel,
  Calculator,
  StickyNote,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Download,
  Send,
} from "lucide-react";
import { api } from "@/lib/api";

// ============================================
// TİPLER
// ============================================

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
  interestRate?: number;
  startDate?: string;
  notes?: string;
  createdAt: string;
  workflowStage?: string;
  currency?: string;
  interestType?: string;
  uyapBirimKodu?: string;
  executionOffice?: {
    id: string;
    name: string;
    city: string;
  };
  client?: {
    id: string;
    name: string;
    displayName?: string;
    type: string;
    tckn?: string;
    vkn?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  caseClients?: {
    id: string;
    client: {
      id: string;
      name: string;
      displayName?: string;
      type: string;
      tckn?: string;
      vkn?: string;
    };
  }[];
  debtors: {
    id: string;
    role: string;
    debtor: {
      id: string;
      name: string;
      displayName?: string;
      type: string;
      tckn?: string;
      identityNo?: string;
      phone?: string;
      address?: string;
    };
  }[];
  lawyers?: {
    id: string;
    canSign: boolean;
    lawyer: {
      id: string;
      name: string;
      surname: string;
      barNumber?: string;
    };
  }[];
  claimItems?: {
    id: string;
    type: string;
    description: string;
    amount: number;
    currency: string;
    dueDate?: string;
    interestType?: string;
  }[];
  instruments?: {
    id: string;
    instrumentType: string;
    serialNo: string;
    amount: number;
    currency?: string;
    issueDate?: string;
    maturityDate?: string;
    presentmentDate?: string;
    bankName?: string;
    isBounced?: boolean;
  }[];
  formType?: { id: string; name: string; code: string };
}

interface HesapOzeti {
  hesapTarihi: string;
  asilAlacak: number;
  takipOncesiFaiz: number;
  takipTutari: number;
  icraMasraflari: {
    basvurmaHarci: number;
    vekaletHarci: number;
    pesinHarc: number;
    dosyaGideri: number;
    tebligatGideri: number;
    vekaletPulu: number;
    toplam: number;
  };
  vekaletUcreti: number;
  masraflar: number;
  takipSonrasiFaiz: number;
  sonBorcTutari: number;
  tahsilHarclari: {
    oran: number;
    tutar: number;
  }[];
  currency: string;
}

interface CaseNote {
  id: string;
  content: string;
  createdAt: string;
  createdBy?: { name: string };
}

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

const formatMoney = (amount: number, currency: string = 'TRY') => {
  const symbols: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
  return `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${symbols[currency] || currency}`;
};

const formatDate = (date: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('tr-TR');
};

const caseTypeLabels: Record<string, string> = {
  GENERAL_EXECUTION: "Genel Haciz",
  MORTGAGE: "İpotekli Takip",
  PLEDGE: "Rehinli Takip",
  CHECK: "Çek Takibi (Kambiyo)",
  BOND: "Senet Takibi (Kambiyo)",
  RENTAL: "Kira Takibi",
  BANKRUPTCY: "İflas Takibi",
  OTHER: "Diğer",
};

const statusLabels: Record<string, { label: string; color: string }> = {
  DERDEST: { label: 'Derdest', color: 'bg-blue-100 text-blue-800' },
  TAHSILAT: { label: 'Tahsilat', color: 'bg-green-100 text-green-800' },
  INFAZ: { label: 'İnfaz', color: 'bg-purple-100 text-purple-800' },
  KAPALI: { label: 'Kapalı', color: 'bg-gray-100 text-gray-800' },
  DURDURULDU: { label: 'Durduruldu', color: 'bg-yellow-100 text-yellow-800' },
};

const debtorRoleLabels: Record<string, string> = {
  ASIL_BORCLU: 'Asıl Borçlu',
  KEFIL: 'Kefil',
  MUSTEREN_BORCLU: 'Müşterek Borçlu',
  MIRASCI: 'Mirasçı',
  KESIDECI: 'Keşideci',
  CIRANTA: 'Ciranta',
};

// ============================================
// ANA COMPONENT
// ============================================

export default function CaseDetailPageNew() {
  const params = useParams();
  const router = useRouter();
  
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [hesapOzeti, setHesapOzeti] = useState<HesapOzeti | null>(null);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  
  // Panel açık/kapalı durumları
  const [expandedPanels, setExpandedPanels] = useState({
    lawyers: true,
    clients: true,
    debtors: true,
    claims: true,
    notes: true,
    lawsuits: true,
  });

  const togglePanel = (panel: keyof typeof expandedPanels) => {
    setExpandedPanels(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  // Veri yükleme
  const fetchCase = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getCase(params.id as string);
      setCaseData(data);
    } catch (error) {
      console.error("Takip yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  const fetchHesapOzeti = useCallback(async () => {
    if (!params.id) return;
    try {
      const response = await api.get(`/cases/${params.id}/hesap-ozeti`);
      setHesapOzeti(response.data);
    } catch (error) {
      console.error("Hesap özeti yüklenemedi:", error);
      // Mock data for now
      if (caseData) {
        const principal = Number(caseData.principalAmount) || 0;
        setHesapOzeti({
          hesapTarihi: new Date().toISOString(),
          asilAlacak: principal,
          takipOncesiFaiz: principal * 0.24 * 0.5, // 6 aylık faiz tahmini
          takipTutari: principal * 1.12,
          icraMasraflari: {
            basvurmaHarci: 615.40,
            vekaletHarci: 87.50,
            pesinHarc: principal * 0.005,
            dosyaGideri: 2.00,
            tebligatGideri: 15.00 * (caseData.debtors?.length || 1),
            vekaletPulu: 138.00,
            toplam: 615.40 + 87.50 + (principal * 0.005) + 2.00 + 15.00 + 138.00,
          },
          vekaletUcreti: Math.max(principal * 0.12, 17000),
          masraflar: 311.80,
          takipSonrasiFaiz: principal * 0.24 * 0.25,
          sonBorcTutari: principal * 1.5,
          tahsilHarclari: [
            { oran: 0, tutar: principal * 1.5 },
            { oran: 2.27, tutar: principal * 1.5 * 1.0227 },
            { oran: 4.55, tutar: principal * 1.5 * 1.0455 },
            { oran: 9.10, tutar: principal * 1.5 * 1.091 },
            { oran: 11.38, tutar: principal * 1.5 * 1.1138 },
          ],
          currency: caseData.currency || 'TRY',
        });
      }
    }
  }, [params.id, caseData]);

  const fetchNotes = useCallback(async () => {
    if (!params.id) return;
    try {
      const response = await api.get(`/cases/${params.id}/notes`);
      setNotes(response.data?.data || []);
    } catch (error) {
      console.error("Notlar yüklenemedi:", error);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) {
      fetchCase();
    }
  }, [params.id, fetchCase]);

  useEffect(() => {
    if (caseData) {
      fetchHesapOzeti();
      fetchNotes();
    }
  }, [caseData, fetchHesapOzeti, fetchNotes]);

  const handleAddNote = async () => {
    if (!newNote.trim() || !caseData) return;
    setSavingNote(true);
    try {
      await api.post(`/cases/${caseData.id}/notes`, { content: newNote });
      setNewNote('');
      fetchNotes();
    } catch (error) {
      console.error("Not eklenemedi:", error);
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Takip bulunamadı</p>
        <Link href="/cases" className="text-primary hover:underline mt-2 inline-block">
          Takiplere dön
        </Link>
      </div>
    );
  }

  const statusConfig = statusLabels[caseData.caseStatus] || statusLabels.DERDEST;

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* ==================== ÜST BAR - TEMEL BİLGİLER ==================== */}
      <div className="bg-white border-b px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Sol - Geri ve Başlık */}
          <div className="flex items-center gap-4">
            <Link href="/cases" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-blue-600">{caseData.fileNumber}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {caseData.formType?.name || caseTypeLabels[caseData.type]} • {caseData.executionPath || 'HACİZ'}
              </p>
            </div>
          </div>

          {/* Orta - Temel Bilgiler */}
          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <p className="text-[10px] text-gray-500">Takip Tarihi</p>
              <p className="font-semibold">{formatDate(caseData.caseDate)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-500">İcra Dosya No</p>
              <p className="font-semibold text-green-600">{caseData.executionFileNumber || '—'}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-500">İcra Dairesi</p>
              <p className="font-semibold">{caseData.executionOffice?.name || '—'}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-500">UYAP Kodu</p>
              <p className="font-semibold">{caseData.uyapBirimKodu || '—'}</p>
            </div>
          </div>

          {/* Sağ - Aksiyonlar */}
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-gray-100 rounded" title="Yenile">
              <RefreshCw className="h-4 w-4" />
            </button>
            <Link href={`/cases/${caseData.id}/edit`} className="p-2 hover:bg-gray-100 rounded" title="Düzenle">
              <Edit className="h-4 w-4" />
            </Link>
            <button className="p-2 hover:bg-gray-100 rounded" title="Paylaş">
              <Share2 className="h-4 w-4" />
            </button>
            <button className="p-2 hover:bg-red-50 rounded text-red-600" title="Sil">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>


      {/* ==================== ANA İÇERİK - 3 KOLON ==================== */}
      <div className="flex-1 overflow-hidden flex">
        
        {/* ==================== SOL PANEL - TARAFLAR ==================== */}
        <div className="w-72 bg-white border-r flex flex-col overflow-hidden flex-shrink-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            
            {/* Yetkili Avukatlar */}
            <div className="border rounded-lg">
              <button
                onClick={() => togglePanel('lawyers')}
                className="w-full flex items-center justify-between p-2 bg-blue-50 hover:bg-blue-100 rounded-t-lg"
              >
                <span className="text-xs font-semibold text-blue-800 flex items-center gap-1">
                  <Scale className="h-3 w-3" /> Yetkili Avukatlar
                </span>
                {expandedPanels.lawyers ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              {expandedPanels.lawyers && (
                <div className="p-2 space-y-1">
                  {caseData.lawyers?.length ? (
                    caseData.lawyers.map((le) => (
                      <div key={le.id} className="flex items-center gap-2 p-1.5 bg-gray-50 rounded text-xs">
                        <User className="h-3 w-3 text-blue-600" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">Av. {le.lawyer.name} {le.lawyer.surname}</p>
                          {le.lawyer.barNumber && (
                            <p className="text-[10px] text-gray-500">Sicil: {le.lawyer.barNumber}</p>
                          )}
                        </div>
                        {le.canSign && (
                          <span className="text-[9px] bg-green-100 text-green-700 px-1 rounded">İmza</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-2">Avukat atanmamış</p>
                  )}
                </div>
              )}
            </div>

            {/* Müvekkiller */}
            <div className="border rounded-lg">
              <button
                onClick={() => togglePanel('clients')}
                className="w-full flex items-center justify-between p-2 bg-green-50 hover:bg-green-100 rounded-t-lg"
              >
                <span className="text-xs font-semibold text-green-800 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Müvekkiller
                </span>
                {expandedPanels.clients ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              {expandedPanels.clients && (
                <div className="p-2 space-y-1">
                  {caseData.caseClients?.length ? (
                    caseData.caseClients.map((cc) => (
                      <div key={cc.id} className="p-1.5 bg-gray-50 rounded text-xs">
                        <p className="font-medium">{cc.client.displayName || cc.client.name}</p>
                        {cc.client.tckn && <p className="text-[10px] text-gray-500">TCKN: {cc.client.tckn}</p>}
                        {cc.client.vkn && <p className="text-[10px] text-gray-500">VKN: {cc.client.vkn}</p>}
                      </div>
                    ))
                  ) : caseData.client ? (
                    <div className="p-1.5 bg-gray-50 rounded text-xs">
                      <p className="font-medium">{caseData.client.displayName || caseData.client.name}</p>
                      {caseData.client.tckn && <p className="text-[10px] text-gray-500">TCKN: {caseData.client.tckn}</p>}
                      {caseData.client.vkn && <p className="text-[10px] text-gray-500">VKN: {caseData.client.vkn}</p>}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-2">Müvekkil atanmamış</p>
                  )}
                </div>
              )}
            </div>

            {/* Borçlular */}
            <div className="border rounded-lg">
              <button
                onClick={() => togglePanel('debtors')}
                className="w-full flex items-center justify-between p-2 bg-red-50 hover:bg-red-100 rounded-t-lg"
              >
                <span className="text-xs font-semibold text-red-800 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Borçlular ({caseData.debtors?.length || 0})
                </span>
                {expandedPanels.debtors ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              {expandedPanels.debtors && (
                <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
                  {caseData.debtors?.length ? (
                    caseData.debtors.map((de) => (
                      <div key={de.id} className="p-1.5 bg-gray-50 rounded text-xs border-l-2 border-red-400">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{de.debtor.displayName || de.debtor.name}</p>
                          <span className="text-[9px] bg-red-100 text-red-700 px-1 rounded">
                            {debtorRoleLabels[de.role] || de.role}
                          </span>
                        </div>
                        {(de.debtor.tckn || de.debtor.identityNo) && (
                          <p className="text-[10px] text-gray-500">
                            TCKN: {de.debtor.tckn || de.debtor.identityNo}
                          </p>
                        )}
                        {de.debtor.address && (
                          <p className="text-[10px] text-gray-400 truncate">{de.debtor.address}</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-2">Borçlu eklenmemiş</p>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ==================== ORTA PANEL - ALACAK KALEMLERİ & NOTLAR ==================== */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Alacak Kalemleri */}
          <div className="bg-white border-b p-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-1">
                <DollarSign className="h-4 w-4 text-blue-600" /> Alacak Kalemleri
              </h3>
              <Link 
                href={`/cases/${caseData.id}/edit?tab=claims`}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Ekle/Düzenle
              </Link>
            </div>
            
            {/* Tablo */}
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-2 font-medium">Açıklama</th>
                    <th className="text-center p-2 font-medium w-24">Vade</th>
                    <th className="text-right p-2 font-medium w-32">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {caseData.claimItems?.length ? (
                    caseData.claimItems.map((item) => (
                      <tr key={item.id} className="border-t hover:bg-gray-50">
                        <td className="p-2">{item.description}</td>
                        <td className="p-2 text-center">{formatDate(item.dueDate || '')}</td>
                        <td className="p-2 text-right font-medium">{formatMoney(item.amount, item.currency)}</td>
                      </tr>
                    ))
                  ) : caseData.instruments?.length ? (
                    caseData.instruments.map((inst) => (
                      <tr key={inst.id} className="border-t hover:bg-gray-50">
                        <td className="p-2">
                          {inst.instrumentType === 'CEK' ? 'Çek' : 'Senet'} - {inst.serialNo}
                          {inst.bankName && <span className="text-gray-500 ml-1">({inst.bankName})</span>}
                        </td>
                        <td className="p-2 text-center">{formatDate(inst.maturityDate || inst.presentmentDate || '')}</td>
                        <td className="p-2 text-right font-medium">{formatMoney(inst.amount, inst.currency || 'TRY')}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-gray-400">
                        {caseData.principalAmount ? (
                          <div>
                            <p>Asıl Alacak</p>
                            <p className="font-semibold text-lg text-gray-700">
                              {formatMoney(Number(caseData.principalAmount), caseData.currency || 'TRY')}
                            </p>
                          </div>
                        ) : (
                          'Alacak kalemi eklenmemiş'
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
                {(caseData.claimItems?.length || caseData.instruments?.length) ? (
                  <tfoot className="bg-blue-50">
                    <tr>
                      <td colSpan={2} className="p-2 font-semibold text-right">TOPLAM:</td>
                      <td className="p-2 text-right font-bold text-blue-700">
                        {formatMoney(
                          caseData.claimItems?.reduce((sum, i) => sum + i.amount, 0) ||
                          caseData.instruments?.reduce((sum, i) => sum + i.amount, 0) ||
                          Number(caseData.principalAmount) || 0,
                          caseData.currency || 'TRY'
                        )}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>

          {/* Notlar ve Davalar - Alt Kısım */}
          <div className="flex-1 overflow-hidden flex">
            {/* Notlar */}
            <div className="flex-1 flex flex-col border-r">
              <div className="p-2 bg-gray-50 border-b flex items-center justify-between">
                <h4 className="text-xs font-semibold flex items-center gap-1">
                  <StickyNote className="h-3 w-3" /> Notlar ({notes.length})
                </h4>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {notes.length ? (
                  notes.map((note) => (
                    <div key={note.id} className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500">{formatDate(note.createdAt)}</span>
                        <span className="text-[10px] text-gray-400">{note.createdBy?.name || 'Sistem'}</span>
                      </div>
                      <p className="text-gray-700">{note.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400 text-center py-4">Henüz not eklenmemiş</p>
                )}
              </div>
              {/* Not Ekleme */}
              <div className="p-2 border-t bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Yeni not ekle..."
                    className="flex-1 border rounded px-2 py-1 text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={savingNote || !newNote.trim()}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Ekle'}
                  </button>
                </div>
              </div>
            </div>

            {/* İlgili Davalar */}
            <div className="w-80 flex flex-col">
              <div className="p-2 bg-purple-50 border-b flex items-center justify-between">
                <h4 className="text-xs font-semibold flex items-center gap-1 text-purple-800">
                  <Gavel className="h-3 w-3" /> İlgili Davalar
                </h4>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {/* RelatedLawsuitsPanel buraya entegre edilecek */}
                <div className="text-xs text-gray-400 text-center py-4">
                  Dava önerileri yükleniyor...
                </div>
              </div>
            </div>
          </div>
        </div>


        {/* ==================== SAĞ PANEL - HESAP ÖZETİ ==================== */}
        <div className="w-80 bg-gradient-to-b from-gray-50 to-white border-l flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-3 bg-blue-600 text-white">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-1">
                <Calculator className="h-4 w-4" /> Hesap Özeti
              </h3>
              <span className="text-xs opacity-80">
                {hesapOzeti ? formatDate(hesapOzeti.hesapTarihi) : formatDate(new Date().toISOString())}
              </span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
            {hesapOzeti ? (
              <>
                {/* Asıl Alacak */}
                <div className="flex justify-between">
                  <span>Senet/Çek Tutarı</span>
                  <span className="font-medium">{formatMoney(hesapOzeti.asilAlacak, hesapOzeti.currency)}</span>
                </div>
                
                {/* Takip Öncesi Faiz */}
                <div className="flex justify-between text-blue-600">
                  <span>Takip Öncesi Faiz</span>
                  <span className="font-medium">+{formatMoney(hesapOzeti.takipOncesiFaiz, hesapOzeti.currency)}</span>
                </div>
                
                {/* Takip Tutarı */}
                <div className="flex justify-between p-2 bg-blue-100 rounded font-semibold text-blue-800">
                  <span>Takip Tutarı</span>
                  <span>{formatMoney(hesapOzeti.takipTutari, hesapOzeti.currency)}</span>
                </div>
                
                <hr className="my-2" />
                
                {/* İcra Masrafları */}
                <div className="space-y-1 text-[11px]">
                  <p className="font-medium text-gray-600">İcra Masrafları:</p>
                  <div className="flex justify-between pl-2">
                    <span className="text-gray-500">Başvurma Harcı</span>
                    <span>{formatMoney(hesapOzeti.icraMasraflari.basvurmaHarci, 'TRY')}</span>
                  </div>
                  <div className="flex justify-between pl-2">
                    <span className="text-gray-500">Vekalet Harcı</span>
                    <span>{formatMoney(hesapOzeti.icraMasraflari.vekaletHarci, 'TRY')}</span>
                  </div>
                  <div className="flex justify-between pl-2">
                    <span className="text-gray-500">Peşin Harç</span>
                    <span>{formatMoney(hesapOzeti.icraMasraflari.pesinHarc, 'TRY')}</span>
                  </div>
                  <div className="flex justify-between pl-2">
                    <span className="text-gray-500">Dosya Gideri</span>
                    <span>{formatMoney(hesapOzeti.icraMasraflari.dosyaGideri, 'TRY')}</span>
                  </div>
                  <div className="flex justify-between pl-2">
                    <span className="text-gray-500">Tebligat Gideri</span>
                    <span>{formatMoney(hesapOzeti.icraMasraflari.tebligatGideri, 'TRY')}</span>
                  </div>
                  <div className="flex justify-between pl-2">
                    <span className="text-gray-500">Vekalet Pulu</span>
                    <span>{formatMoney(hesapOzeti.icraMasraflari.vekaletPulu, 'TRY')}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-1 border-t">
                    <span>İcra Masrafları Toplamı</span>
                    <span>{formatMoney(hesapOzeti.icraMasraflari.toplam, 'TRY')}</span>
                  </div>
                </div>
                
                <hr className="my-2" />
                
                {/* Vekalet Ücreti */}
                <div className="flex justify-between">
                  <span>Vekalet Ücreti</span>
                  <span className="font-medium">{formatMoney(hesapOzeti.vekaletUcreti, 'TRY')}</span>
                </div>
                
                {/* Masraflar */}
                <div className="flex justify-between">
                  <span>Masraflar</span>
                  <span className="font-medium">{formatMoney(hesapOzeti.masraflar, 'TRY')}</span>
                </div>
                
                {/* Takip Sonrası Faiz */}
                <div className="flex justify-between text-orange-600">
                  <span>Takip Sonrası Faiz</span>
                  <span className="font-medium">+{formatMoney(hesapOzeti.takipSonrasiFaiz, hesapOzeti.currency)}</span>
                </div>
                
                <hr className="my-2" />
                
                {/* Son Borç Tutarı */}
                <div className="flex justify-between p-2 bg-green-100 rounded font-bold text-green-800">
                  <span>Son Borç Tutarı</span>
                  <span>{formatMoney(hesapOzeti.sonBorcTutari, hesapOzeti.currency)}</span>
                </div>
                
                <hr className="my-2" />
                
                {/* Tahsil Harcı Oranları */}
                <div className="space-y-1 text-[11px]">
                  <p className="font-medium text-gray-600">Tahsil Harcı Oranlarına Göre:</p>
                  {hesapOzeti.tahsilHarclari.map((th, idx) => (
                    <div key={idx} className="flex justify-between pl-2">
                      <span className="text-gray-500">%{th.oran.toFixed(2)}</span>
                      <span className={idx === hesapOzeti.tahsilHarclari.length - 1 ? 'font-semibold text-red-600' : ''}>
                        {formatMoney(th.tutar, hesapOzeti.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Calculator className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Hesap özeti yükleniyor...</p>
              </div>
            )}
          </div>
          
          {/* Alt Butonlar */}
          <div className="p-3 border-t bg-white space-y-2">
            <button className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
              <Download className="h-3 w-3" /> Hesap Dökümü İndir
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button className="flex items-center justify-center gap-1 px-2 py-1.5 border rounded text-xs hover:bg-gray-50">
                <FileText className="h-3 w-3" /> PDF
              </button>
              <button className="flex items-center justify-center gap-1 px-2 py-1.5 border rounded text-xs hover:bg-gray-50">
                <Send className="h-3 w-3" /> UYAP
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
