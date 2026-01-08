"use client";

import { useState } from "react";
import {
  FileText, ListTodo, Receipt, Database, FolderOpen, MessageSquare,
  ChevronDown, Plus, AlertTriangle, Clock, Zap, User, Check, X,
  ArrowRight, Calendar, Tag, ExternalLink
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type PanelId = "notes" | "tasks" | "finance" | "uyap" | "related" | null;

interface Note {
  id: string;
  content: string;
  createdAt: string;
  createdBy?: { name: string };
  type?: "AVUKAT" | "MUVEKKIL" | "SISTEM";
}

interface Task {
  id: string;
  title: string;
  description?: string;
  source: "SISTEM" | "MANUEL";
  basis?: string; // Kanun maddesi veya UYAP olayı
  status: "BEKLIYOR" | "YAPILDI" | "IPTAL";
  dueDate?: string;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  category?: "SONRAKI_HAMLE" | "SURE_BAGLI" | "RISK";
}

interface FinanceItem {
  id: string;
  type: "TAHSILAT" | "MASRAF_YAPILAN" | "MASRAF_TALEP";
  amount: number;
  date: string;
  description?: string;
  status?: string;
}

interface UyapQuery {
  id: string;
  queryType: string;
  status: "BEKLIYOR" | "TAMAMLANDI" | "HATA";
  createdAt: string;
  result?: string;
  canRepeat?: boolean;
}

interface RelatedCase {
  id: string;
  fileNumber: string;
  type: string;
  status: string;
  relation: "AYNI_BORCLU" | "ITIRAZ" | "MENFI_TESPIT" | "CEZA" | "DIGER";
  debtorName?: string;
}


interface OperationDeckProps {
  caseId: string;
  notes?: Note[];
  tasks?: Task[];
  financeItems?: FinanceItem[];
  uyapQueries?: UyapQuery[];
  relatedCases?: RelatedCase[];
  clientBalance?: number;
  onAddNote?: () => void;
  onAddTask?: () => void;
  onOpenChat?: () => void;
  onTaskAction?: (taskId: string, action: "complete" | "cancel") => void;
  onRunQuery?: (queryType: string) => void;
}

// ============================================================================
// PANEL CONFIGS
// ============================================================================

const panels = [
  { id: "tasks" as PanelId, label: "Yapılacaklar", icon: ListTodo, color: "text-amber-600", bg: "bg-amber-50" },
  { id: "finance" as PanelId, label: "Finans", icon: Receipt, color: "text-emerald-600", bg: "bg-emerald-50" },
  { id: "uyap" as PanelId, label: "UYAP Sorgu", icon: Database, color: "text-blue-600", bg: "bg-blue-50" },
  { id: "related" as PanelId, label: "İlişkili", icon: FolderOpen, color: "text-purple-600", bg: "bg-purple-50" },
  { id: "notes" as PanelId, label: "Notlar", icon: FileText, color: "text-slate-600", bg: "bg-slate-50" },
];

// ============================================================================
// HELPERS
// ============================================================================

const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("tr-TR") : "-";
const formatDateTime = (d: string) => d ? new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
const formatTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 0 }) + " ₺";

const priorityColors = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
};

const statusColors = {
  BEKLIYOR: "bg-amber-100 text-amber-700",
  YAPILDI: "bg-emerald-100 text-emerald-700",
  IPTAL: "bg-slate-100 text-slate-500",
  TAMAMLANDI: "bg-emerald-100 text-emerald-700",
  HATA: "bg-red-100 text-red-700",
};

const relationLabels = {
  AYNI_BORCLU: "Aynı Borçlu",
  ITIRAZ: "İtiraz Davası",
  MENFI_TESPIT: "Menfi Tespit",
  CEZA: "Ceza Davası",
  DIGER: "Diğer",
};

const queryTypeLabels: Record<string, string> = {
  SGK: "SGK Sorgusu",
  TAPU: "Tapu Sorgusu",
  ARAC: "Araç Sorgusu",
  BANKA: "Banka Sorgusu",
  MERNIS: "Mernis Sorgusu",
  TICARET_SICIL: "Ticaret Sicil",
};


// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OperationDeck({
  caseId,
  notes = [],
  tasks = [],
  financeItems = [],
  uyapQueries = [],
  relatedCases = [],
  clientBalance = 0,
  onAddNote,
  onAddTask,
  onOpenChat,
  onTaskAction,
  onRunQuery,
}: OperationDeckProps) {
  const [activePanel, setActivePanel] = useState<PanelId>(null);

  const togglePanel = (id: PanelId) => {
    setActivePanel(activePanel === id ? null : id);
  };

  // Counts for badges
  const pendingTasks = tasks.filter(t => t.status === "BEKLIYOR").length;
  const highPriorityTasks = tasks.filter(t => t.priority === "HIGH" && t.status === "BEKLIYOR").length;
  const pendingQueries = uyapQueries.filter(q => q.status === "BEKLIYOR").length;

  // Group tasks by category
  const nextMove = tasks.find(t => t.category === "SONRAKI_HAMLE" && t.status === "BEKLIYOR");
  const timeBoundTasks = tasks.filter(t => t.category === "SURE_BAGLI" && t.status === "BEKLIYOR");
  const riskTasks = tasks.filter(t => t.category === "RISK" && t.status === "BEKLIYOR");

  return (
    <div className="border-t border-slate-200 bg-white">
      {/* Panel Headers - Horizontal Tab Bar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-slate-50 border-b overflow-x-auto">
        {panels.map((panel) => {
          const Icon = panel.icon;
          const isActive = activePanel === panel.id;
          const count = panel.id === "tasks" ? pendingTasks : 
                        panel.id === "uyap" ? pendingQueries :
                        panel.id === "related" ? relatedCases.length :
                        panel.id === "notes" ? notes.length : 0;
          const hasUrgent = panel.id === "tasks" && highPriorityTasks > 0;

          return (
            <button
              key={panel.id}
              onClick={() => togglePanel(panel.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                isActive 
                  ? `${panel.bg} ${panel.color} shadow-sm ring-1 ring-inset ring-current/20` 
                  : "text-slate-500 hover:bg-white hover:text-slate-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{panel.label}</span>
              {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  hasUrgent ? "bg-red-500 text-white" : isActive ? "bg-white/80" : "bg-slate-200"
                }`}>
                  {count}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform ${isActive ? "rotate-180" : ""}`} />
            </button>
          );
        })}

        {/* Chat Button - Always visible, opens drawer */}
        <button
          onClick={onOpenChat}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Müvekkil Chat</span>
        </button>
      </div>


      {/* Panel Content */}
      {activePanel && (
        <div className="animate-in slide-in-from-top-2 duration-200">
          {/* ═══════════════════════════════════════════════════════════════════
              YAPILACAKLAR PANELİ - EN KRİTİK
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "tasks" && (
            <div className="p-4 space-y-4">
              {/* Bir Sonraki Hamle */}
              {nextMove && (
                <div className="p-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Bir Sonraki Hamle</span>
                    <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-medium ${
                      nextMove.source === "SISTEM" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {nextMove.source === "SISTEM" ? "Sistem Önerisi" : "Manuel"}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800">{nextMove.title}</p>
                  {nextMove.basis && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Tag className="w-3 h-3" /> {nextMove.basis}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => onTaskAction?.(nextMove.id, "complete")}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700"
                    >
                      <Check className="w-3 h-3" /> Yapıldı
                    </button>
                    <button
                      onClick={() => onTaskAction?.(nextMove.id, "cancel")}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-300"
                    >
                      <X className="w-3 h-3" /> İptal
                    </button>
                  </div>
                </div>
              )}

              {/* Süreye Bağlı İşler */}
              {timeBoundTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Süreye Bağlı İşler</span>
                  </div>
                  <div className="space-y-2">
                    {timeBoundTasks.map(task => (
                      <div key={task.id} className="flex items-center justify-between p-2 rounded border border-slate-200 bg-white">
                        <div>
                          <p className="text-sm text-slate-700">{task.title}</p>
                          {task.dueDate && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3" /> {formatDate(task.dueDate)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${priorityColors[task.priority || "LOW"]}`}>
                            {task.priority === "HIGH" ? "Acil" : task.priority === "MEDIUM" ? "Normal" : "Düşük"}
                          </span>
                          <button onClick={() => onTaskAction?.(task.id, "complete")} className="p-1 hover:bg-emerald-100 rounded">
                            <Check className="w-4 h-4 text-emerald-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Uyarıları */}
              {riskTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Risk Uyarıları</span>
                  </div>
                  <div className="space-y-2">
                    {riskTasks.map(task => (
                      <div key={task.id} className="flex items-center justify-between p-2 rounded border border-red-200 bg-red-50">
                        <div>
                          <p className="text-sm text-red-800 font-medium">{task.title}</p>
                          {task.basis && <p className="text-xs text-red-600 mt-0.5">{task.basis}</p>}
                        </div>
                        <ArrowRight className="w-4 h-4 text-red-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Boş durum */}
              {tasks.filter(t => t.status === "BEKLIYOR").length === 0 && (
                <div className="text-center py-6 text-slate-400">
                  <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Bekleyen iş yok</p>
                </div>
              )}

              {/* Görev Ekle */}
              {onAddTask && (
                <button
                  onClick={onAddTask}
                  className="w-full flex items-center justify-center gap-1 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-slate-400 hover:text-slate-600"
                >
                  <Plus className="w-3 h-3" /> Manuel Görev Ekle
                </button>
              )}
            </div>
          )}


          {/* ═══════════════════════════════════════════════════════════════════
              FİNANS PANELİ
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "finance" && (
            <div className="p-4 space-y-4">
              {/* Özet Kartları */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <p className="text-[10px] text-emerald-600 uppercase tracking-wide">Tahsilat</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {formatTL(financeItems.filter(f => f.type === "TAHSILAT").reduce((s, f) => s + f.amount, 0))}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-[10px] text-red-600 uppercase tracking-wide">Yapılan Masraf</p>
                  <p className="text-lg font-bold text-red-700">
                    {formatTL(financeItems.filter(f => f.type === "MASRAF_YAPILAN").reduce((s, f) => s + f.amount, 0))}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-[10px] text-amber-600 uppercase tracking-wide">Müvekkil Bakiye</p>
                  <p className={`text-lg font-bold ${clientBalance >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {formatTL(clientBalance)}
                  </p>
                </div>
              </div>

              {/* Son İşlemler */}
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Son İşlemler</p>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {financeItems.slice(0, 10).map(item => (
                    <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded bg-slate-50 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          item.type === "TAHSILAT" ? "bg-emerald-500" : 
                          item.type === "MASRAF_YAPILAN" ? "bg-red-500" : "bg-amber-500"
                        }`} />
                        <span className="text-slate-700">{item.description || item.type}</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-medium ${
                          item.type === "TAHSILAT" ? "text-emerald-600" : "text-red-600"
                        }`}>
                          {item.type === "TAHSILAT" ? "+" : "-"}{formatTL(item.amount)}
                        </span>
                        <p className="text-[10px] text-slate-400">{formatDate(item.date)}</p>
                      </div>
                    </div>
                  ))}
                  {financeItems.length === 0 && (
                    <p className="text-center py-4 text-slate-400 text-sm">Henüz işlem yok</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              UYAP SORGULAMA PANELİ
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "uyap" && (
            <div className="p-4 space-y-4">
              {/* Hızlı Sorgu Butonları */}
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Hızlı Sorgu</p>
                <div className="flex flex-wrap gap-2">
                  {["SGK", "TAPU", "ARAC", "BANKA", "MERNIS"].map(type => (
                    <button
                      key={type}
                      onClick={() => onRunQuery?.(type)}
                      className="px-3 py-1.5 rounded border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100"
                    >
                      {queryTypeLabels[type] || type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sorgu Geçmişi */}
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Sorgu Geçmişi</p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {uyapQueries.map(query => (
                    <div key={query.id} className="flex items-center justify-between p-2 rounded border border-slate-200 bg-white">
                      <div>
                        <p className="text-sm text-slate-700">{queryTypeLabels[query.queryType] || query.queryType}</p>
                        <p className="text-[10px] text-slate-400">{formatDateTime(query.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusColors[query.status]}`}>
                          {query.status === "TAMAMLANDI" ? "Tamamlandı" : query.status === "BEKLIYOR" ? "Bekliyor" : "Hata"}
                        </span>
                        {query.canRepeat && (
                          <button
                            onClick={() => onRunQuery?.(query.queryType)}
                            className="p-1 hover:bg-slate-100 rounded"
                            title="Tekrar Sorgula"
                          >
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {uyapQueries.length === 0 && (
                    <p className="text-center py-4 text-slate-400 text-sm">Henüz sorgu yapılmamış</p>
                  )}
                </div>
              </div>
            </div>
          )}


          {/* ═══════════════════════════════════════════════════════════════════
              İLİŞKİLİ DAVALAR PANELİ
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "related" && (
            <div className="p-4">
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {relatedCases.map(rc => (
                  <a
                    key={rc.id}
                    href={`/cases/${rc.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{rc.fileNumber}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {rc.type} • {relationLabels[rc.relation]}
                      </p>
                      {rc.debtorName && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{rc.debtorName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        rc.status === "DERDEST" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {rc.status}
                      </span>
                      <ExternalLink className="w-4 h-4 text-slate-400" />
                    </div>
                  </a>
                ))}
                {relatedCases.length === 0 && (
                  <div className="text-center py-6 text-slate-400">
                    <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">İlişkili dosya yok</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              NOTLAR PANELİ
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "notes" && (
            <div className="p-4">
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {notes.map(note => (
                  <div key={note.id} className="p-3 rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-500">{note.createdBy?.name || "Sistem"}</span>
                      <span className="text-[10px] text-slate-400">{formatDateTime(note.createdAt)}</span>
                      {note.type && (
                        <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          note.type === "AVUKAT" ? "bg-blue-100 text-blue-700" :
                          note.type === "MUVEKKIL" ? "bg-purple-100 text-purple-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {note.type === "AVUKAT" ? "Avukat" : note.type === "MUVEKKIL" ? "Müvekkil" : "Sistem"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
                {notes.length === 0 && (
                  <div className="text-center py-6 text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Henüz not eklenmemiş</p>
                  </div>
                )}
              </div>

              {/* Not Ekle */}
              {onAddNote && (
                <button
                  onClick={onAddNote}
                  className="w-full mt-3 flex items-center justify-center gap-1 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-slate-400 hover:text-slate-600"
                >
                  <Plus className="w-3 h-3" /> Not Ekle
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OperationDeck;
