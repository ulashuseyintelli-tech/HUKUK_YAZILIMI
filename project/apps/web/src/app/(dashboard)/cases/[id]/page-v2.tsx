"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Edit, RefreshCw, Save, X, AlertTriangle,
  CheckCircle2, XCircle, Building2, CreditCard, User, Users,
  ChevronRight, ChevronDown, FileText, Receipt, Clock, Database,
  History, FolderOpen, MessageSquare, Plus
} from "lucide-react";
import { api, DebtorListItemDTO, DebtorsSummaryDTO } from "@/lib/api";

// ============================================
// MEŞE MİMARİSİ - COCKPIT LAYOUT
// ============================================
// Kurallar:
// 1. SCROLL YOK - her şey tek ekranda
// 2. Hesap özeti SAĞ ÜSTTE sabit
// 3. Taraflar KOMPAKT
// 4. Alt alan = sekmeli accordion
// 5. Satır yüksekliği: 32-36px
// 6. Font: 11-13px
// 7. Padding: 6-8px
// ============================================

interface CaseData {
  id: string;
  fileNumber: string;
  executionFileNumber?: string;
  type: string;
  subType?: string;
  caseStatus: string;
  executionPath: string;
  caseDate: string;
  principalAmount?: number;
  currency?: string;
  uyapBirimKodu?: string;
  lastEnforcementActionAt?: string;
  executionOffice?: { id: string; name: string; city: string; uyapCode?: string; bankName?: string; iban?: string };
  lawyers?: { id: string; canSign: boolean; lawyer: { id: string; name: string; surname: string; lawyerRank?: string } }[];
  staff?: { id: string; staffMember: { id: string; firstName: string; lastName: string; staffType?: string } }[];
  caseClients?: { id: string; client: { id: string; name: string; displayName?: string } }[];
  client?: { id: string; name: string; displayName?: string };
  debtors?: { id: string; role: string; debtor: { id: string; name: string; displayName?: string; tckn?: string } }[];
  claimItems?: any[];
}

const caseTypeShort: Record<string, string> = {
  GENERAL_EXECUTION: "Genel Haciz", MORTGAGE: "İpotekli", PLEDGE: "Rehinli",
  CHECK: "Çek", BOND: "Senet", RENTAL: "Kira", BANKRUPTCY: "İflas", OTHER: "Diğer",
};

// Kalan gün hesaplama
const calcDays = (caseDate: string, lastAction?: string) => {
  const base = lastAction ? new Date(lastAction) : new Date(caseDate);
  const now = new Date();
  const passed = Math.floor((now.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
  return { passed, remaining: Math.max(0, 365 - passed) };
};

// Para formatı
const fmt = (n: number, c = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency: c, minimumFractionDigits: 0 }).format(n);

// Tarih formatı
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("tr-TR") : "—";

export default function CaseDetailPageV2() {
  const params = useParams();
  const [data, setData] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [debtors, setDebtors] = useState<DebtorListItemDTO[]>([]);
  const [debtorsSummary, setDebtorsSummary] = useState<DebtorsSummaryDTO | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [caseRes, debtorsRes] = await Promise.all([
        api.getCase(params.id as string),
        api.getCaseDebtors(params.id as string).catch(() => ({ items: [], summary: null }))
      ]);
      setData(caseRes);
      setDebtors(debtorsRes.items || []);
      setDebtorsSummary(debtorsRes.summary || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [params.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const days = useMemo(() => data ? calcDays(data.caseDate, data.lastEnforcementActionAt) : { passed: 0, remaining: 365 }, [data]);
  const hasUyap = !!(data?.uyapBirimKodu || data?.executionOffice?.uyapCode);
  const principal = Number(data?.principalAmount) || 0;

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!data) return <div className="text-center py-8"><p>Takip bulunamadı</p><Link href="/cases" className="text-blue-600">Geri dön</Link></div>;

  const activeCaseDebtorLinks = (data.debtors || []).filter(
    (de: any) => de.lifecycleStatus !== "PASSIVE"
  );

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* ═══════════════════════════════════════════════════════════════════
          HEADER BAR - 36px - Meşe üst şerit
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="h-9 bg-white border-b flex items-center px-3 gap-3 flex-shrink-0">
        <Link href="/cases" className="text-slate-400 hover:text-slate-600"><ArrowLeft className="w-4 h-4" /></Link>
        <span className="text-xs text-slate-500">Takip:</span>
        <span className="text-sm font-bold text-slate-800">{data.fileNumber}</span>
        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${data.caseStatus === 'DERDEST' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
          {data.caseStatus}
        </span>
        <span className="text-xs text-slate-500">{caseTypeShort[data.type] || data.type} + {data.executionPath || 'HACİZ'}</span>
        <span className="text-slate-300">|</span>
        <span className="text-xs text-slate-500">{data.executionOffice?.name || '—'}</span>
        <span className="text-slate-300">|</span>
        <span className={`text-xs ${hasUyap ? 'text-emerald-600' : 'text-red-500'}`}>UYAP: {hasUyap ? '✓ Bağlı' : '✗'}</span>
        <span className="text-slate-300">|</span>
        <span className="text-xs text-slate-500">Son İşlem: {days.passed}g</span>
        <span className={`text-xs font-medium ${days.remaining < 60 ? 'text-red-600' : days.remaining < 180 ? 'text-amber-600' : 'text-emerald-600'}`}>
          Kalan: {days.remaining}g
        </span>
        
        {/* Sağ: Hesap Özeti + Aksiyonlar */}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-3 px-3 py-1 bg-slate-50 rounded border text-xs">
            <div><span className="text-slate-500">Asıl:</span> <span className="font-semibold">{fmt(principal)}</span></div>
            <div><span className="text-slate-500">Tahsil:</span> <span className="font-semibold text-emerald-600">{fmt(0)}</span></div>
            <div><span className="text-slate-500">Masraf:</span> <span className="font-semibold">{fmt(0)}</span></div>
            <div className="border-l pl-3"><span className="text-red-600 font-bold">Açık: {fmt(principal)}</span></div>
          </div>
          <button className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 flex items-center gap-1">
            <CreditCard className="w-3 h-3" /> Ödeme
          </button>
          <button className="p-1 hover:bg-slate-100 rounded"><RefreshCw className="w-4 h-4 text-slate-500" /></button>
          <button className="p-1 hover:bg-slate-100 rounded"><Edit className="w-4 h-4 text-slate-500" /></button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ANA İÇERİK - 3 KOLON GRID (Meşe layout)
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 grid grid-cols-12 gap-2 p-2 overflow-hidden">
        
        {/* ─────────────────────────────────────────────────────────────────
            SOL KOLON (5/12) - İcra Mercii + Takip Yaşamı + Takip Türü
        ───────────────────────────────────────────────────────────────── */}
        <div className="col-span-5 flex flex-col gap-2 overflow-hidden">
          
          {/* İCRA MERCİİ & ENTEGRASYON */}
          <div className="bg-white rounded border p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase">İcra Mercii & Entegrasyon</span>
              <button className="text-[10px] text-blue-600 hover:underline">Detay →</button>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">İcra Dosya No</span>
                <span className="font-semibold text-blue-700">{data.executionFileNumber || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">İcra Dairesi</span>
                <span className="font-medium">{data.executionOffice?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">UYAP</span>
                <span className={hasUyap ? 'text-emerald-600' : 'text-red-500'}>{hasUyap ? '✓ Bağlı' : '✗ Bağlı Değil'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Banka</span>
                <span className="font-medium">{data.executionOffice?.bankName || '—'}</span>
              </div>
              <button className="w-full mt-1 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700">
                UYAP'a Gönder
              </button>
            </div>
          </div>

          {/* TAKİBİN YAŞAMI - Meşe tarzı yatay */}
          <div className={`bg-white rounded border p-2 ${days.remaining < 60 ? 'border-red-300 bg-red-50' : ''}`}>
            <span className="text-[10px] font-semibold text-slate-400 uppercase">Takibin Yaşamı</span>
            <div className="flex items-center justify-between mt-1 text-xs">
              <div><span className="text-slate-500">Açılış:</span> <span className="font-medium">{fmtDate(data.caseDate)}</span></div>
              <div><span className="text-slate-500">Geçen:</span> <span className="font-bold text-slate-600">{days.passed}g</span></div>
              <div className={`font-bold ${days.remaining < 60 ? 'text-red-600' : days.remaining < 180 ? 'text-amber-600' : 'text-emerald-600'}`}>
                Kalan: {days.remaining}g
              </div>
              <div><span className="text-slate-500">Statü:</span> <span className="font-medium">{data.caseStatus}</span></div>
            </div>
          </div>

          {/* TAKİP TÜRÜ */}
          <div className="bg-white rounded border p-2">
            <span className="text-[10px] font-semibold text-slate-400 uppercase">Takip Türü</span>
            <div className="flex items-center justify-between mt-1 text-xs">
              <div><span className="text-slate-500">Tip:</span> <span className="font-medium">{caseTypeShort[data.type] || data.type}</span></div>
              <div><span className="text-slate-500">Yol:</span> <span className="font-medium">{data.executionPath || 'HACİZ'}</span></div>
              <div><span className="text-slate-500">Alt:</span> <span className="font-medium">GENEL</span></div>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            ORTA KOLON (4/12) - DOSYA TARAFLARI (Meşe kompakt)
        ───────────────────────────────────────────────────────────────── */}
        <div className="col-span-4 flex flex-col gap-2 overflow-hidden">
          <div className="text-[10px] font-semibold text-slate-400 uppercase px-1">Dosya Tarafları</div>
          
          {/* Dosya Ekibi */}
          <div className="bg-white rounded border overflow-hidden">
            <div className="px-2 py-1 bg-blue-50 border-b flex items-center justify-between">
              <span className="text-[10px] font-semibold text-blue-700">Dosya Ekibi</span>
              <span className="text-[9px] text-blue-600">{(data.lawyers?.length || 0) + (data.staff?.length || 0)}</span>
            </div>
            <div className="max-h-20 overflow-y-auto">
              {data.lawyers?.map(l => (
                <div key={l.id} className="px-2 py-1 flex items-center gap-2 hover:bg-slate-50 cursor-pointer text-[11px] border-b last:border-0">
                  <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[9px] text-blue-600">Av</div>
                  <span className="flex-1 truncate">{l.lawyer.name} {l.lawyer.surname}</span>
                  {l.canSign && <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded">İmza</span>}
                </div>
              ))}
              {data.staff?.map(s => (
                <div key={s.id} className="px-2 py-1 flex items-center gap-2 hover:bg-slate-50 cursor-pointer text-[11px] border-b last:border-0">
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[9px] text-slate-600">P</div>
                  <span className="flex-1 truncate">{s.staffMember.firstName} {s.staffMember.lastName}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Müvekkiller */}
          <div className="bg-white rounded border overflow-hidden">
            <div className="px-2 py-1 bg-emerald-50 border-b flex items-center justify-between">
              <span className="text-[10px] font-semibold text-emerald-700">Müvekkiller</span>
              <span className="text-[9px] text-emerald-600">{data.caseClients?.length || (data.client ? 1 : 0)}</span>
            </div>
            <div className="max-h-16 overflow-y-auto">
              {(data.caseClients || (data.client ? [{ id: '1', client: data.client }] : [])).map((c: any) => (
                <div key={c.id} className="px-2 py-1 flex items-center gap-2 hover:bg-slate-50 cursor-pointer text-[11px]">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[9px] text-emerald-600">M</div>
                  <span className="flex-1 truncate">{c.client.displayName || c.client.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Borçlular */}
          <div className="bg-white rounded border overflow-hidden flex-1">
            <div className="px-2 py-1 bg-red-50 border-b flex items-center justify-between">
              <span className="text-[10px] font-semibold text-red-700">Borçlular</span>
              <div className="flex items-center gap-1">
                {debtorsSummary && debtorsSummary.danger > 0 && (
                  <span className="text-[8px] bg-red-600 text-white px-1 rounded">{debtorsSummary.danger} Risk</span>
                )}
                <span className="text-[9px] text-red-600">{debtors.length || activeCaseDebtorLinks.length || 0}</span>
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 28px)' }}>
              {(debtors.length ? debtors : activeCaseDebtorLinks).map((d: any) => (
                <div key={d.caseDebtorId || d.id} className="px-2 py-1 flex items-center gap-2 hover:bg-red-50 cursor-pointer text-[11px] border-b last:border-0">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-[9px] text-red-600">B</div>
                  <span className="flex-1 truncate">{d.displayName || d.debtor?.displayName || d.debtor?.name}</span>
                  <span className="text-[8px] bg-red-100 text-red-700 px-1 rounded">{d.role === 'ASIL_BORCLU' ? 'Asıl' : d.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            SAĞ KOLON (3/12) - HESAP ÖZETİ (Meşe sağ panel)
            ⚠️ NOT: Bu değerler MOCK/PREVIEW amaçlıdır.
            Gerçek hesaplama için interest-engine ve fee-engine API'lerini kullanın.
            @see ARCHITECTURE.md - Source of Truth Matrix
        ───────────────────────────────────────────────────────────────── */}
        <div className="col-span-3 flex flex-col gap-2 overflow-hidden">
          <div className="bg-white rounded border overflow-hidden flex-1 flex flex-col">
            <div className="px-2 py-1.5 bg-blue-600 text-white">
              <div className="text-[10px] font-semibold">Hesap Özeti <span className="opacity-60">(Önizleme)</span></div>
              <div className="text-[9px] opacity-80">{fmtDate(new Date().toISOString())}</div>
            </div>
            {/* ⚠️ MOCK DATA - Gerçek hesaplama için /interest-engine/calculate endpoint'i kullanılmalı */}
            <div className="p-2 space-y-1 text-[11px] flex-1 overflow-y-auto">
              <div className="flex justify-between"><span className="text-slate-500">Asıl Alacak</span><span className="font-medium">{fmt(principal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Takip Öncesi Faiz</span><span className="text-slate-400 italic">API'den alınacak</span></div>
              <hr className="my-1" />
              <div className="flex justify-between font-semibold text-blue-700"><span>Takip Tutarı</span><span>{fmt(principal)}</span></div>
              <hr className="my-1" />
              <div className="text-[10px] text-slate-500 font-medium">İcra Masrafları: <span className="text-amber-600">(tahmini)</span></div>
              <div className="flex justify-between pl-2"><span className="text-slate-400">Başvurma Harcı</span><span>738 ₺</span></div>
              <div className="flex justify-between pl-2"><span className="text-slate-400">Vekalet Harcı</span><span>105 ₺</span></div>
              <div className="flex justify-between pl-2"><span className="text-slate-400">Peşin Harç</span><span className="text-slate-400 italic">fee-engine</span></div>
              <hr className="my-1" />
              <div className="flex justify-between"><span className="text-slate-500">Vekalet Ücreti</span><span className="text-slate-400 italic">fee-engine</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Takip Sonrası Faiz</span><span className="text-slate-400 italic">interest-engine</span></div>
              <hr className="my-1" />
              <div className="flex justify-between p-1 bg-amber-50 rounded font-bold text-amber-700 border border-amber-200">
                <span>Toplam Borç</span><span className="text-xs">Hesapla →</span>
              </div>
              <hr className="my-1" />
              <div className="flex justify-between p-1 bg-slate-100 rounded text-slate-500 text-[10px]">
                <span>⚠️ Kesin hesap için "Hesapla" butonunu kullanın</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ALT ALAN - 2 SATIR (Meşe tab yapısı)
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-shrink-0 border-t bg-white">
        {/* 1. SATIR - Her zaman açık: Alacak Kalemleri | Ödemeler | Yapılacak İşler */}
        <div className="grid grid-cols-3 gap-2 p-2 border-b">
          {/* Alacak Kalemleri */}
          <div className="border rounded overflow-hidden">
            <div className="px-2 py-1 bg-slate-50 border-b flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-600">Alacak Kalemleri</span>
              <button className="text-[9px] text-blue-600">+ Ekle</button>
            </div>
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50"><tr><th className="text-left p-1">Açıklama</th><th className="text-center p-1 w-16">Vade</th><th className="text-right p-1 w-20">Tutar</th></tr></thead>
              <tbody>
                {data.claimItems?.slice(0, 3).map((item: any) => (
                  <tr key={item.id} className="border-t"><td className="p-1 truncate">{item.description}</td><td className="p-1 text-center">{fmtDate(item.dueDate)}</td><td className="p-1 text-right font-medium">{fmt(item.amount)}</td></tr>
                )) || <tr><td colSpan={3} className="p-2 text-center text-slate-400">Asıl Alacak: {fmt(principal)}</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Ödemeler */}
          <div className="border rounded overflow-hidden">
            <div className="px-2 py-1 bg-slate-50 border-b flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-600">Ödemeler</span>
              <button className="text-[9px] text-emerald-600">+ Tahsilat</button>
            </div>
            <div className="p-2 text-center text-[10px] text-slate-400">Henüz ödeme yok</div>
          </div>

          {/* Yapılacak İşler */}
          <div className="border rounded overflow-hidden">
            <div className="px-2 py-1 bg-slate-50 border-b flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-600">Yapılacak İşler</span>
              <button className="text-[9px] text-amber-600">+ Ekle</button>
            </div>
            <div className="p-1 space-y-1">
              <div className="flex items-center gap-1 p-1 bg-amber-50 rounded text-[10px]"><Clock className="w-3 h-3 text-amber-600" /><span>Tebligat bekliyor</span></div>
              <div className="flex items-center gap-1 p-1 bg-blue-50 rounded text-[10px]"><RefreshCw className="w-3 h-3 text-blue-600" /><span>Yenileme ({days.remaining}g)</span></div>
            </div>
          </div>
        </div>

        {/* 2. SATIR - Sekmeli accordion */}
        <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 border-b">
          {[
            { id: 'notes', label: 'Notlar', icon: FileText },
            { id: 'expenses', label: 'Masraflar', icon: Receipt },
            { id: 'uyap', label: 'UYAP Sorgu', icon: Database },
            { id: 'log', label: 'Log', icon: History },
            { id: 'related', label: 'İlişkili', icon: FolderOpen },
            { id: 'chat', label: 'Chat', icon: MessageSquare },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(activeTab === tab.id ? null : tab.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
                activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm border' : 'text-slate-600 hover:bg-white'
              }`}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sekme içeriği - sadece açıkken görünür */}
        {activeTab && (
          <div className="p-3 bg-white border-t max-h-48 overflow-y-auto">
            {activeTab === 'notes' && <div className="text-xs text-slate-500">Henüz not eklenmemiş. <button className="text-blue-600">+ Not Ekle</button></div>}
            {activeTab === 'expenses' && <div className="text-xs text-slate-500">Masraf kaydı yok.</div>}
            {activeTab === 'uyap' && <div className="text-xs text-slate-500">UYAP sorgusu yapılmamış.</div>}
            {activeTab === 'log' && <div className="text-xs text-slate-500">İşlem geçmişi boş.</div>}
            {activeTab === 'related' && <div className="text-xs text-slate-500">İlişkili dosya yok.</div>}
            {activeTab === 'chat' && <div className="text-xs text-slate-500">Müvekkil mesajı yok.</div>}
          </div>
        )}
      </div>

      {/* Footer - Meşe alt bar */}
      <div className="h-7 bg-slate-100 border-t flex items-center justify-between px-3 text-[10px] text-slate-500 flex-shrink-0">
        <span>Sorumlu: {data.lawyers?.[0]?.lawyer.name} {data.lawyers?.[0]?.lawyer.surname || '—'}</span>
        <div className="flex items-center gap-3">
          <button className="hover:text-blue-600">UYAP</button>
          <button className="hover:text-blue-600">Kaydet</button>
          <button className="hover:text-blue-600">Kapat</button>
        </div>
      </div>
    </div>
  );
}
