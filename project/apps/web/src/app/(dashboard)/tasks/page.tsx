"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, CheckCircle2, Circle, Clock, AlertCircle, LayoutGrid, Loader2, Trash2, Edit2, X, User, Ban } from "lucide-react";
import { Badge } from "@hukuk/ui";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ActionError } from "@/components/ui/action-error";
import { toActionErrorMessage } from "@/lib/action-error";
import { runMutation, runRefreshOnly } from "@/lib/mutation-outcome";
import { useKeyedSubmitLock } from "@/lib/use-submit-lock";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  case?: { id: string; fileNumber: string };
  assignee?: { id: string; name: string; surname: string };
  createdAt: string;
  taskCategory?: string;
  clientId?: string;
  client?: { id: string; displayName?: string; companyName?: string; firstName?: string; lastName?: string };
  missingFields?: string[];
}

/**
 * GET /tasks `meta` sözleşmesi (F01-A). `summary` sunucu toplamıdır: kapsam tenant + (varsa) seçili
 * atanan; durum/kategori sekmesinden bağımsızdır. Eksikse sayaç "alınamadı" diye gösterilir, sayfadaki
 * kayıtlardan HESAPLANMAZ (ilk sayfaya dayalı yanlış toplam bir daha üretilmez).
 */
interface TaskListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary?: { pending: number; inProgress: number; operationalOpen: number };
}

type StatusFilter = "all" | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type CategoryFilter = "all" | "LEGAL_WORKFLOW" | "OPERATIONAL_COMPLETENESS";

/** Sunucunun üst sınırı 100; ekran listesi 20'lik sayfalarla gezer. */
const PAGE_SIZE = 20;

// Müvekkil görünen adı (görev kartında "Müvekkile git" için)
const clientLabel = (c?: Task["client"]): string =>
  c
    ? c.displayName || c.companyName || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Müvekkil"
    : "";

// F01-B (OFP-02 dürüstlük): yalnız API'nin kabul ettiği durumlar (TaskStatus enum). "REVIEW" API'de yok
// (PUT 400 veriyordu) → ekrandan kaldırıldı; CANCELLED etiketiyle görünür.
const statusIcons: Record<string, React.ReactNode> = {
  PENDING: <Circle className="h-5 w-5 text-muted-foreground" />,
  IN_PROGRESS: <Clock className="h-5 w-5 text-blue-500" />,
  COMPLETED: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  CANCELLED: <Ban className="h-5 w-5 text-gray-400" />,
};

const priorityColors: Record<string, "default" | "warning" | "destructive"> = {
  LOW: "default",
  MEDIUM: "default",
  HIGH: "warning",
  URGENT: "destructive",
};

const priorityLabels: Record<string, string> = {
  LOW: "Düşük",
  MEDIUM: "Orta",
  HIGH: "Yüksek",
  URGENT: "Acil",
};

const statusLabels: Record<string, string> = {
  PENDING: "Bekliyor",
  IN_PROGRESS: "Devam Ediyor",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal edildi",
};

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "PENDING", label: "Bekleyen" },
  { value: "IN_PROGRESS", label: "Devam Eden" },
  { value: "COMPLETED", label: "Tamamlanan" },
  { value: "CANCELLED", label: "İptal Edilen" },
];

function parseMeta(raw: unknown): TaskListMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (
    typeof m.total !== "number" ||
    typeof m.page !== "number" ||
    typeof m.limit !== "number" ||
    typeof m.totalPages !== "number"
  ) {
    return null;
  }
  const s = m.summary as Record<string, unknown> | undefined;
  const summary =
    s && typeof s.pending === "number" && typeof s.inProgress === "number" && typeof s.operationalOpen === "number"
      ? { pending: s.pending, inProgress: s.inProgress, operationalOpen: s.operationalOpen }
      : undefined;
  return { total: m.total, page: m.page, limit: m.limit, totalPages: m.totalPages, summary };
}

export default function TasksPage() {
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id ?? null;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meta, setMeta] = useState<TaskListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  // PR-2A1: durum degisikligi hatasi GORUNUR; gorev durumu uydurulmaz.
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [refreshingStale, setRefreshingStale] = useState(false);
  const rowLock = useKeyedSubmitLock();
  // F01-B: sunucu taraflı süzgeç + sayfalama. Yerel süzme kaldırıldı: tek sayfa üzerinde yerel süzgeç
  // "bu sekmede N görev" gibi yanlış bir toplam üretiyordu.
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<StatusFilter>("all");
  // Kategori filtresi: İcra görevleri ile operasyonel eksikleri ayır (görev enflasyonu önlemi).
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  // "" = tüm atananlar · "me" = bana atananlar · <userId> = atanana göre. Yalnız SÜZGEÇTİR; OWN/TEAM
  // yetkisi değildir (OFP-09 bu ekranda yok). OD-19 B: kişi bazlı sayı sıralama/puan olarak sunulmaz.
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [cases, setCases] = useState<{ id: string; fileNumber: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; surname: string; isActive?: boolean }[]>([]);
  // WSMR-A4-AC-05: eskiden `Promise.all` + yalnız console.error ile HER İKİ
  // kaynak da SESSİZCE boş kalıyordu. cases/users BAĞIMSIZDIR (ayrı,
  // OPSİYONEL <select> alanlarını besler — handleSave'de caseId/assigneeId
  // ikisi de `undefined` gidebilir, TEK zorunlu alan `title`'dir) — bu
  // yüzden bir kaynağın hatası diğerinin başarılı verisini SİLMEMELİ ve
  // hangi kaynağın hata verdiği AYRI AYRI görünür olmalı.
  const [casesLoadError, setCasesLoadError] = useState<string | null>(null);
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null);
  const [casesRetrying, setCasesRetrying] = useState(false);
  const [usersRetrying, setUsersRetrying] = useState(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const casesFetchTokenRef = useRef(0);
  const casesFetchInFlightRef = useRef(false);
  const usersFetchTokenRef = useRef(0);
  const usersFetchInFlightRef = useRef(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "PENDING",
    priority: "MEDIUM",
    dueDate: "",
    caseId: "",
    assigneeId: "",
  });

  const handleStaleRefresh = async () => {
    setRefreshingStale(true);
    const ok = await runRefreshOnly(() => loadTasks({ propagateError: true }));
    setRefreshingStale(false);
    if (ok) setStaleNotice(null);
  };

  // Seçili süzgeçlerden GET /tasks sorgu dizesi (F01-A sözleşmesi: page, limit≤100, status, taskCategory, assigneeId).
  const buildTasksQuery = useCallback(() => {
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("limit", String(PAGE_SIZE));
    if (filter !== "all") q.set("status", filter);
    if (categoryFilter !== "all") q.set("taskCategory", categoryFilter);
    const assigneeId = assigneeFilter === "me" ? currentUserId : assigneeFilter;
    if (assigneeId) q.set("assigneeId", assigneeId);
    return q.toString();
  }, [page, filter, categoryFilter, assigneeFilter, currentUserId]);

  // PR-2A1 DEPENDENCY_FIXED: hata YUTULMAZ; malformed yanit GERCEK EMPTY sayilmaz.
  const loadTasks = useCallback(
    async (opts?: { propagateError?: boolean }): Promise<void> => {
      setLoadError(null);
      try {
        const res = await api.get(`/tasks?${buildTasksQuery()}`);
        const raw = (res as { data?: unknown })?.data as { data?: unknown; meta?: unknown } | unknown[];
        const rows = Array.isArray(raw) ? raw : (raw as { data?: unknown })?.data;
        if (!Array.isArray(rows)) throw new Error("MALFORMED_LIST_RESPONSE");
        setTasks(rows as Task[]);
        setMeta(Array.isArray(raw) ? null : parseMeta((raw as { meta?: unknown }).meta));
      } catch (e) {
        setLoadError(toActionErrorMessage(e, "Görevler yüklenemedi."));
        if (opts?.propagateError) throw e;
      } finally {
        setLoading(false);
      }
    },
    [buildTasksQuery]
  );

  // Süzgeç/sayfa değişince sunucudan yeniden oku (ilk yükleme dahil).
  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // Son sayfadaki kayıtlar azalınca (silme/durum) boş sayfada kalma: son geçerli sayfaya dön.
  useEffect(() => {
    if (meta && meta.totalPages > 0 && page > meta.totalPages) setPage(meta.totalPages);
  }, [meta, page]);

  const loadCases = useCallback(async () => {
    if (casesFetchInFlightRef.current) return; // çift-tetik -> tek aktif istek
    casesFetchInFlightRef.current = true;
    const token = ++casesFetchTokenRef.current;
    try {
      const res = await api.get("/cases?limit=100");
      if (!isMountedRef.current || token !== casesFetchTokenRef.current) return; // bayat/unmount
      const data = res?.data?.data;
      // Sözleşme: backend başarılı yanıtta HER ZAMAN dizi döner (case.service.ts
      // #findAll -> Prisma findMany + 1:1 map, asla undefined/null değil) —
      // dizi değilse GERÇEKTEN beklenmeyen/malformed bir gövdedir.
      if (!Array.isArray(data)) throw new Error("MALFORMED_CASES_RESPONSE");
      setCases(data);
      setCasesLoadError(null);
    } catch (e) {
      if (!isMountedRef.current || token !== casesFetchTokenRef.current) return;
      // cases BİLEREK dokunulmaz — önceki başarıyla yüklenmiş liste (varsa)
      // SİLİNMEZ; yalnız bayat olduğu bantta görünür olur.
      setCasesLoadError(toActionErrorMessage(e, "Dosyalar yüklenemedi."));
    } finally {
      if (token === casesFetchTokenRef.current) casesFetchInFlightRef.current = false;
    }
  }, []);

  const loadUsers = useCallback(async () => {
    if (usersFetchInFlightRef.current) return;
    usersFetchInFlightRef.current = true;
    const token = ++usersFetchTokenRef.current;
    try {
      const res = await api.get("/users");
      if (!isMountedRef.current || token !== usersFetchTokenRef.current) return;
      const data = res?.data?.data;
      // Sözleşme: backend başarılı yanıtta HER ZAMAN dizi döner (user.service.ts
      // #findByTenant -> Prisma findMany, asla undefined/null değil; controller
      // yorumu da "res.data.data" zarfını AÇIKÇA teyit eder) — dizi değilse
      // GERÇEKTEN beklenmeyen/malformed bir gövdedir.
      if (!Array.isArray(data)) throw new Error("MALFORMED_USERS_RESPONSE");
      setUsers(data);
      setUsersLoadError(null);
    } catch (e) {
      if (!isMountedRef.current || token !== usersFetchTokenRef.current) return;
      setUsersLoadError(toActionErrorMessage(e, "Kullanıcılar yüklenemedi."));
    } finally {
      if (token === usersFetchTokenRef.current) usersFetchInFlightRef.current = false;
    }
  }, []);

  const retryCases = useCallback(async () => {
    setCasesRetrying(true);
    casesFetchInFlightRef.current = false; // manuel retry -> in-flight bayrağını sıfırla
    try {
      await loadCases();
    } finally {
      if (isMountedRef.current) setCasesRetrying(false);
    }
  }, [loadCases]);

  const retryUsers = useCallback(async () => {
    setUsersRetrying(true);
    usersFetchInFlightRef.current = false;
    try {
      await loadUsers();
    } finally {
      if (isMountedRef.current) setUsersRetrying(false);
    }
  }, [loadUsers]);

  // WSMR-A4-AC-05: cases/users BAĞIMSIZ kaynaklardır — biri diğerini
  // BEKLEMEZ/ENGELLEMEZ (eskiden Promise.all yüzünden biri hata verince
  // İKİSİ de sessizce boş kalıyordu).
  const loadLookups = useCallback(() => {
    void loadCases();
    void loadUsers();
  }, [loadCases, loadUsers]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  // F01-C: kanban "Yeni Görev" → /tasks#yeni (eski /tasks/new route'u yoktu → 404). Hash yalnız
  // açılışta okunur ve temizlenir; yenileme modalı tekrar açmaz. useSearchParams bilerek kullanılmadı
  // (Next 14'te Suspense sınırı ister; build kapısı riski).
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#yeni") return;
    setEditingTask(null);
    resetForm();
    setShowModal(true);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const handleSave = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        dueDate: form.dueDate || undefined,
        caseId: form.caseId || undefined,
        assigneeId: form.assigneeId || undefined,
      };

      if (editingTask) {
        await api.put(`/tasks/${editingTask.id}`, payload);
      } else {
        await api.post("/tasks", payload);
      }

      setShowModal(false);
      setEditingTask(null);
      resetForm();
      loadTasks();
    } catch (e: any) {
      alert(e.message || "Hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu görevi silmek istediğinize emin misiniz?")) return;
    try {
      await api.delete(`/tasks/${id}`);
      loadTasks();
    } catch (e: any) {
      alert(e.message || "Silinemedi");
    }
  };

  const handleStatusChange = async (task: Task, newStatus: string) => {
    setActionError(null);
    setStaleNotice(null);
    // PR-2A1: gorev bazli kilit — ayni goreve ikinci degisiklik baslamaz, farkli
    // gorevler bloklanmaz. Durum yalniz dogrulanmis reload ile kesinlesir.
    await rowLock.run(`task:status:${task.id}`, async () => {
      const outcome = await runMutation({
        mutate: () => api.put(`/tasks/${task.id}`, { status: newStatus }),
        refresh: () => loadTasks({ propagateError: true }),
        failureMessage: "Görev durumu güncellenemedi. Durum DEĞİŞMEDİ.",
        staleMessage: "Görev durumu GÜNCELLENDİ, ancak liste yenilenemedi.",
      });
      if (!rowLock.isMounted()) return;
      if (outcome.status === "FAILED") {
        setActionError(outcome.error.message);
        // Eski durum GERI gorunur: canonical liste yeniden okunur (select geri doner).
        await runRefreshOnly(() => loadTasks({ propagateError: true }));
        return;
      }
      if (outcome.status === "SUCCESS_STALE") setStaleNotice(outcome.stale);
    });
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
      caseId: task.case?.id || "",
      assigneeId: task.assignee?.id || "",
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      status: "PENDING",
      priority: "MEDIUM",
      dueDate: "",
      caseId: "",
      assigneeId: "",
    });
  };

  const selectStatusTab = (value: StatusFilter) => {
    setFilter(value);
    setPage(1);
  };
  const selectCategory = (value: CategoryFilter) => {
    setCategoryFilter(value);
    setPage(1);
  };
  const selectAssignee = (value: string) => {
    setAssigneeFilter(value);
    setPage(1);
  };

  const summary = meta?.summary;
  const scopeLabel =
    assigneeFilter === "me" ? "bana atananlar" : assigneeFilter ? "seçili atanan" : "büro geneli";
  const rangeStart = meta && meta.total > 0 ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PR-2A1: okuma ve mutation hatalari GORUNUR. */}
      <ActionError message={loadError} />
      <ActionError message={actionError} />
      {staleNotice ? (
        <div role="status" data-testid="stale-notice" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="flex-1">{staleNotice}</span>
          <button type="button" onClick={handleStaleRefresh} disabled={refreshingStale} data-testid="stale-refresh" className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50">
            Listeyi yenile
          </button>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Görevler</h1>
          {/* F01-B: sayaçlar sunucu toplamından (meta.summary); kapsamı açıkça yazılır. */}
          <p className="text-muted-foreground" data-testid="tasks-summary">
            {summary
              ? `${summary.pending} bekleyen, ${summary.inProgress} devam eden görev`
              : "Toplamlar alınamadı"}
            <span className="ml-2 text-xs">({scopeLabel})</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/tasks/kanban"
            className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50"
          >
            <LayoutGrid className="h-4 w-4" />
            Kanban
          </Link>
          <button
            onClick={() => { setEditingTask(null); resetForm(); setShowModal(true); }}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Yeni Görev
          </button>
        </div>
      </div>

      {/* Kategori filtresi (sunucu parametresi): İcra görevleri ile operasyonel eksikleri ayır */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { value: "all" as const, label: "Tüm Kategoriler" },
          { value: "LEGAL_WORKFLOW" as const, label: "İcra Görevleri" },
          { value: "OPERATIONAL_COMPLETENESS" as const, label: "Operasyonel Eksikler", count: summary?.operationalOpen },
        ].map((c) => (
          <button
            key={c.value}
            onClick={() => selectCategory(c.value)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              categoryFilter === c.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white text-muted-foreground border-gray-200 hover:bg-gray-50"
            }`}
          >
            {c.label}
            {"count" in c && typeof c.count === "number" && c.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${categoryFilter === c.value ? "bg-white/25" : "bg-blue-100 text-blue-700"}`}>
                {c.count}
              </span>
            )}
          </button>
        ))}

        {/* Atanana göre süzgeç (sunucu parametresi). Pasif kullanıcı listede kalır: geçmişte ona atanmış
            görevler süzülebilmeli; yeni atama J1 kapısında zaten reddedilir. */}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Atanana göre</span>
          <select
            value={assigneeFilter}
            onChange={(e) => selectAssignee(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">Tüm atananlar</option>
            <option value="me" disabled={!currentUserId}>Bana atananlar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} {u.surname}{u.isActive === false ? " (pasif)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Durum sekmeleri (sunucu parametresi); yalnız API'nin desteklediği durumlar */}
      <div className="flex gap-2 border-b">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => selectStatusTab(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              filter === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <button
                onClick={() => handleStatusChange(task, task.status === "COMPLETED" ? "PENDING" : "COMPLETED")}
                disabled={task.status === "CANCELLED"}
                title={task.status === "CANCELLED" ? "İptal edilmiş görev" : undefined}
                className="mt-0.5 disabled:cursor-not-allowed"
              >
                {statusIcons[task.status] ?? <Circle className="h-5 w-5 text-muted-foreground" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3
                    className={`font-medium ${
                      task.status === "COMPLETED" || task.status === "CANCELLED" ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {task.title}
                  </h3>
                  <Badge variant={priorityColors[task.priority]}>
                    {priorityLabels[task.priority]}
                  </Badge>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                    {statusLabels[task.status] ?? task.status}
                  </span>
                </div>
                {task.description && (
                  <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                )}
                <div className="flex items-center gap-4 text-sm">
                  {task.case && (
                    <Link href={`/cases/${task.case.id}`} className="text-muted-foreground hover:text-primary">
                      Dosya: <span className="text-primary">{task.case.fileNumber}</span>
                    </Link>
                  )}
                  {task.clientId && (
                    <Link
                      // OWN-11 (D01): "Müvekkile git" ARTIK kanonik Client Workspace'e gider;
                      // eskiden compatibility düzenleme modalını açıyordu (link metniyle varış
                      // noktası uyuşmuyordu).
                      href={`/clients/${task.clientId}`}
                      className="flex items-center gap-1 text-primary hover:underline font-medium"
                      title="Müvekkil detayına git"
                    >
                      <User className="h-4 w-4" />
                      {clientLabel(task.client) || "Müvekkil"} — Müvekkile git
                    </Link>
                  )}
                  {task.dueDate && (
                    <span className={`flex items-center gap-1 ${isOverdue(task.dueDate) && task.status !== "COMPLETED" && task.status !== "CANCELLED" ? "text-red-600" : "text-muted-foreground"}`}>
                      <Clock className="h-4 w-4" />
                      {new Date(task.dueDate).toLocaleDateString("tr-TR")}
                      {isOverdue(task.dueDate) && task.status !== "COMPLETED" && task.status !== "CANCELLED" && " (Gecikmiş)"}
                    </span>
                  )}
                  {task.assignee && (
                    <span className="text-muted-foreground">
                      Atanan: {task.assignee.name} {task.assignee.surname}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(task)}
                  className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(task.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {task.priority === "URGENT" && task.status !== "COMPLETED" && task.status !== "CANCELLED" && (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
            </div>
          </div>
        ))}

        {/* Boş durum yalnız GERÇEK sıfırda: okuma hatası / erişim reddi boş listeyle KARIŞTIRILMAZ (deny ≠ empty). */}
        {!loadError && tasks.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Görev bulunamadı</p>
            <button
              onClick={() => { setEditingTask(null); resetForm(); setShowModal(true); }}
              className="mt-4 text-primary hover:underline"
            >
              + Yeni görev ekle
            </button>
          </div>
        )}
      </div>

      {/* F01-B: sayfalama — sunucu toplamı ve gösterilen aralık açık yazılır. Sağ boşluk (pr-20): sayfa sonuna
          kaydırılınca sabit "Hızlı İşlemler" düğmesi sağ alt köşeyi kapatıyor; "Sonraki" onun altında kalmasın
          (yerel ekran kabulünde ölçüldü). */}
      {meta && !loadError && (
        <div className="flex items-center justify-between pr-20 text-sm text-muted-foreground" data-testid="tasks-pagination">
          <span>
            {meta.total > 0 ? `${rangeStart}–${rangeEnd} / ${meta.total} görev` : "0 görev"}
            {meta.totalPages > 1 ? ` · Sayfa ${meta.page}/${meta.totalPages}` : ""}
          </span>
          {meta.totalPages > 1 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={meta.page <= 1}
                className="px-3 py-1 border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Önceki
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={meta.page >= meta.totalPages}
                className="px-3 py-1 border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sonraki
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingTask ? "Görevi Düzenle" : "Yeni Görev"}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingTask(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Başlık *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Görev başlığı"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Açıklama</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={3}
                  placeholder="Görev açıklaması"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="task-status" className="block text-sm font-medium mb-1">Durum</label>
                  {/* Yalnız API'nin kabul ettiği durumlar. İptal bu formdan SEÇİLEMEZ (iptal politikası bu
                      dilimde değişmez); iptal edilmiş görev düzenlenirken mevcut değeri korunur. */}
                  <select
                    id="task-status"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="PENDING">Bekliyor</option>
                    <option value="IN_PROGRESS">Devam Ediyor</option>
                    <option value="COMPLETED">Tamamlandı</option>
                    {editingTask?.status === "CANCELLED" && (
                      <option value="CANCELLED" disabled>İptal edildi</option>
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="task-priority" className="block text-sm font-medium mb-1">Öncelik</label>
                  <select
                    id="task-priority"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="LOW">Düşük</option>
                    <option value="MEDIUM">Orta</option>
                    <option value="HIGH">Yüksek</option>
                    <option value="URGENT">Acil</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Bitiş Tarihi</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label htmlFor="task-case" className="block text-sm font-medium mb-1">İlgili Dosya</label>
                {casesLoadError && (
                  // WSMR-A4-AC-05: dosya listesi opsiyoneldir — eksikliği formu
                  // ENGELLEMEZ ("Seçiniz" ile boş bırakılabilir) ama okuma
                  // hatası SESSİZCE bu boşlukla KARIŞTIRILMAZ.
                  <div role="alert" className="mb-1 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                    <span>
                      {casesLoadError}
                      {cases.length > 0 ? ' Gösterilen liste bayat olabilir.' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={retryCases}
                      disabled={casesRetrying}
                      className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-red-800 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {casesRetrying ? 'Deneniyor…' : 'Tekrar dene'}
                    </button>
                  </div>
                )}
                <select
                  id="task-case"
                  value={form.caseId}
                  onChange={(e) => setForm({ ...form, caseId: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Seçiniz</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>{c.fileNumber}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="task-assignee" className="block text-sm font-medium mb-1">Atanan Kişi</label>
                {usersLoadError && (
                  <div role="alert" className="mb-1 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                    <span>
                      {usersLoadError}
                      {users.length > 0 ? ' Gösterilen liste bayat olabilir.' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={retryUsers}
                      disabled={usersRetrying}
                      className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-red-800 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {usersRetrying ? 'Deneniyor…' : 'Tekrar dene'}
                    </button>
                  </div>
                )}
                <select
                  id="task-assignee"
                  value={form.assigneeId}
                  onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Seçiniz</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} {u.surname}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => { setShowModal(false); setEditingTask(null); }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Kaydediliyor..." : editingTask ? "Güncelle" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
