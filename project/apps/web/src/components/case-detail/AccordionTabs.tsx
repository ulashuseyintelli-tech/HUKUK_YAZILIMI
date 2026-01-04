"use client";

import { useState } from "react";
import { 
  FileText, Receipt, Database, History, FolderOpen, MessageSquare, 
  ChevronDown, Plus, User, Clock, AlertTriangle, ExternalLink,
  ListTodo, Briefcase, Send
} from "lucide-react";
import Link from "next/link";

// Types
interface Note {
  id: string;
  content: string;
  createdAt: string;
  createdBy?: { name: string };
  isSystem?: boolean;
}

interface Expense {
  id: string;
  type: string;
  description?: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

interface UyapQuery {
  id: string;
  queryType: string;
  status: string;
  createdAt: string;
  result?: any;
}

interface LogEntry {
  id: string;
  action: string;
  description?: string;
  createdAt: string;
  user?: { name: string };
  isAutomatic?: boolean;
}

interface RelatedCase {
  id: string;
  fileNumber: string;
  type: string;
  status: string;
  relation: string;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  sender: { name: string; type: 'LAWYER' | 'CLIENT' };
  isRead?: boolean;
}

interface AccordionTabsProps {
  caseId: string;
  caseData?: any;
  notes?: Note[];
  expenses?: Expense[];
  uyapQueries?: UyapQuery[];
  logs?: LogEntry[];
  relatedCases?: RelatedCase[];
  messages?: Message[];
  onAddNote?: () => void;
  onAddExpense?: () => void;
  onRunUyapQuery?: () => void;
  onSendMessage?: () => void;
  onNoteClick?: (note: Note) => void;
  onExpenseClick?: (expense: Expense) => void;
  onRelatedCaseClick?: (caseItem: RelatedCase) => void;
  defaultOpen?: string;
}

// Tab definitions - Wireframe'e göre
const tabs = [
  { id: "notes", label: "Notlar", icon: FileText },
  { id: "expenses", label: "Masraflar", icon: Receipt },
  { id: "uyap", label: "UYAP Sorgulama", icon: Database },
  { id: "tasks", label: "Yapılacak İşler", icon: ListTodo },
  { id: "related", label: "İlişkili Davalar", icon: FolderOpen },
  { id: "accounting", label: "Müv. Muhasebe", icon: Briefcase },
  { id: "chat", label: "Müvekkil Chat", icon: MessageSquare },
  { id: "requests", label: "Müv. Diğer Talepler", icon: Send },
];

// Format date
function formatDate(date: string): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("tr-TR");
}

function formatDateTime(date: string): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Format currency
function formatCurrency(amount: number, currency: string = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Expense type labels
const expenseTypeLabels: Record<string, string> = {
  COURT_FEE: "Harç",
  NOTIFICATION_FEE: "Tebligat Masrafı",
  TRAVEL: "Yol Masrafı",
  EXPERT_FEE: "Bilirkişi Ücreti",
  OTHER: "Diğer",
};

// UYAP query type labels
const uyapQueryLabels: Record<string, string> = {
  MERNIS: "Mernis Sorgusu",
  SGK: "SGK Sorgusu",
  TAPU: "Tapu Sorgusu",
  ARAC: "Araç Sorgusu",
  BANKA: "Banka Sorgusu",
  TICARET_SICIL: "Ticaret Sicil",
};

// Status colors
const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
  PAID: "bg-emerald-100 text-emerald-700",
  UNPAID: "bg-amber-100 text-amber-700",
};

export function AccordionTabs({
  caseId,
  caseData,
  notes = [],
  expenses = [],
  uyapQueries = [],
  logs = [],
  relatedCases = [],
  messages = [],
  onAddNote,
  onAddExpense,
  onRunUyapQuery,
  onSendMessage,
  onNoteClick,
  onExpenseClick,
  onRelatedCaseClick,
  defaultOpen,
}: AccordionTabsProps) {
  const [activeTab, setActiveTab] = useState<string | null>(defaultOpen || null);

  const toggleTab = (tabId: string) => {
    setActiveTab(activeTab === tabId ? null : tabId);
  };

  // Count badges
  const getCounts = () => ({
    notes: notes.length,
    expenses: expenses.filter(e => e.status === 'UNPAID').length,
    uyap: uyapQueries.filter(q => q.status === 'PENDING').length,
    tasks: 0,
    related: relatedCases.length,
    accounting: 0,
    chat: messages.filter(m => !m.isRead).length,
    requests: 0,
  });

  const counts = getCounts();

  return (
    <div className="border-t border-slate-200">
      {/* Tab Headers */}
      <div className="flex flex-wrap gap-1 p-2 bg-slate-50 border-b border-slate-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const count = counts[tab.id as keyof typeof counts];
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => toggleTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive 
                  ? "bg-white text-blue-700 shadow-sm border border-slate-200" 
                  : "text-slate-600 hover:bg-white hover:text-slate-800"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  isActive ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
                }`}>
                  {count}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform ${isActive ? "rotate-180" : ""}`} />
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab && (
        <div className="p-4 bg-white animate-in slide-in-from-top-2 duration-200">
          {/* Notlar */}
          {activeTab === "notes" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-700">Notlar</h4>
                {onAddNote && (
                  <button
                    onClick={onAddNote}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="w-3 h-3" /> Not Ekle
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {notes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => onNoteClick?.(note)}
                    className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-500">
                        {note.createdBy?.name || "Sistem"}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatDateTime(note.createdAt)}
                      </span>
                      {note.isSystem && (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded">
                          Sistem
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 line-clamp-2">{note.content}</p>
                  </button>
                ))}
                {notes.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">Henüz not yok</p>
                )}
              </div>
            </div>
          )}

          {/* Masraflar */}
          {activeTab === "expenses" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-700">Masraflar & Müvekkil Muhasebe</h4>
                {onAddExpense && (
                  <button
                    onClick={onAddExpense}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="w-3 h-3" /> Masraf Ekle
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {expenses.map((expense) => (
                  <button
                    key={expense.id}
                    onClick={() => onExpenseClick?.(expense)}
                    className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {expenseTypeLabels[expense.type] || expense.type}
                      </p>
                      {expense.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{expense.description}</p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">{formatDate(expense.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800">
                        {formatCurrency(expense.amount, expense.currency)}
                      </p>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mt-1 ${statusColors[expense.status] || ""}`}>
                        {expense.status === 'PAID' ? 'Ödendi' : 'Bekliyor'}
                      </span>
                    </div>
                  </button>
                ))}
                {expenses.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">Henüz masraf yok</p>
                )}
              </div>
            </div>
          )}

          {/* UYAP & Veri */}
          {activeTab === "uyap" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-700">UYAP Sorgulama & Veri İşlem</h4>
                {onRunUyapQuery && (
                  <button
                    onClick={onRunUyapQuery}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Database className="w-3 h-3" /> Sorgu Çalıştır
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {uyapQueries.map((query) => (
                  <div
                    key={query.id}
                    className="p-3 rounded-lg border border-slate-100 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {uyapQueryLabels[query.queryType] || query.queryType}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">{formatDateTime(query.createdAt)}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[query.status] || ""}`}>
                      {query.status === 'COMPLETED' ? 'Tamamlandı' : query.status === 'PENDING' ? 'Bekliyor' : 'Hata'}
                    </span>
                  </div>
                ))}
                {uyapQueries.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">Henüz sorgu yok</p>
                )}
              </div>
            </div>
          )}

          {/* Yapılacak İşler */}
          {activeTab === "tasks" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-700">Yapılacak İşler</h4>
                <button className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                  <Plus className="w-3 h-3" /> Görev Ekle
                </button>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Tebligat Takibi</p>
                      <p className="text-xs text-slate-500">Ödeme emri tebliğ bekleniyor</p>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">Bekliyor</span>
                </div>
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Yenileme Kontrolü</p>
                      <p className="text-xs text-slate-500">İİK 78 süresi takibi</p>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">Aktif</span>
                </div>
              </div>
            </div>
          )}

          {/* İlişkili Dosyalar */}
          {activeTab === "related" && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3">İlişkili Davalar / Dosyalar</h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {relatedCases.map((relCase) => (
                  <button
                    key={relCase.id}
                    onClick={() => onRelatedCaseClick?.(relCase)}
                    className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">{relCase.fileNumber}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{relCase.type} • {relCase.relation}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        relCase.status === 'DERDEST' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {relCase.status}
                      </span>
                      <ExternalLink className="w-4 h-4 text-slate-400" />
                    </div>
                  </button>
                ))}
                {relatedCases.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">İlişkili dosya yok</p>
                )}
              </div>
            </div>
          )}

          {/* Müvekkil Muhasebe */}
          {activeTab === "accounting" && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3">Müvekkil Muhasebe</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <p className="text-xs text-emerald-600 mb-1">Toplam Tahsilat</p>
                    <p className="text-lg font-bold text-emerald-700">0 ₺</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-xs text-amber-600 mb-1">Bekleyen Masraf</p>
                    <p className="text-lg font-bold text-amber-700">0 ₺</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 text-center py-2">Detaylı muhasebe bilgisi için müvekkil kartına gidin</p>
              </div>
            </div>
          )}

          {/* Müvekkil Chat */}
          {activeTab === "chat" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-700">Müvekkil Chat</h4>
                {onSendMessage && (
                  <button
                    onClick={onSendMessage}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <MessageSquare className="w-3 h-3" /> Mesaj Gönder
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-lg ${
                      msg.sender.type === 'LAWYER' 
                        ? 'bg-blue-50 ml-8' 
                        : 'bg-slate-50 mr-8'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-slate-700">{msg.sender.name}</span>
                      <span className="text-[10px] text-slate-400">{formatDateTime(msg.createdAt)}</span>
                      {!msg.isRead && msg.sender.type === 'CLIENT' && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </div>
                    <p className="text-sm text-slate-700">{msg.content}</p>
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">Henüz mesaj yok</p>
                )}
              </div>
            </div>
          )}

          {/* Müvekkil Diğer Talepler */}
          {activeTab === "requests" && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3">Müvekkil Diğer Talepler</h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                <p className="text-xs text-slate-400 text-center py-4">Henüz talep yok</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
