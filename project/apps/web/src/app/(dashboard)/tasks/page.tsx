"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, CheckCircle2, Circle, Clock, AlertCircle, LayoutGrid, Loader2, History, Edit2, X, User, Ban, ShieldCheck } from "lucide-react";
import { Badge } from "@hukuk/ui";
import { ViewScopeBadge } from "@/components/scope/ViewScopeBadge";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ActionError } from "@/components/ui/action-error";
import { toActionErrorMessage } from "@/lib/action-error";
import { runMutation, runRefreshOnly } from "@/lib/mutation-outcome";
import { useKeyedSubmitLock } from "@/lib/use-submit-lock";
import {
  describeTaskHistoryActor,
  describeTaskHistoryEvent,
  taskHistoryCoverageNotes,
  type TaskHistoryCoverage,
  type TaskHistoryItem,
} from "@/lib/task-history";
import {
  REVIEW_ACTION_TEXT,
  REVIEW_AWAITING_HINT,
  REVIEW_AWAITING_STATUS_HINT,
  REVIEW_DECISION_KINDS,
  REVIEW_DECISION_LABEL,
  REVIEW_REQUIRED_HINT,
  REVIEW_SUBMITTED_NOTICE,
  canOfferReviewDecision,
  canOfferReviewRequirementRemoval,
  canOfferReviewRequirementSet,
  isAwaitingReview,
  lastReviewDecisionText,
  taskReviewBadge,
  type ReviewActionKind,
} from "@/lib/task-review";

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
  createdById?: string | null;
  taskCategory?: string;
  clientId?: string;
  client?: { id: string; displayName?: string; companyName?: string; firstName?: string; lastName?: string };
  missingFields?: string[];
  // F03-C: görev içi bağımsız ilk kontrol alanları (sunucu AYRI kolonlarda tutar; "kontrolde" ayrı bir durum değeri değildir).
  reviewRequired?: boolean | null;
  reviewStatus?: string | null;
  reviewSubmittedByUserId?: string | null;
  reviewedByUserId?: string | null;
  reviewNote?: string | null;
  dedupeKey?: string | null;
  taskSubType?: string | null;
  debtorId?: string | null;
  addressId?: string | null;
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
  /** F03-C: kontrolde bekleyen görev sayısı (aynı kapsam). `summary.inProgress` bunları İÇERMEZ. */
  awaitingReview?: number;
}

/** "AWAITING_REVIEW" bir sunucu durumu DEĞİLDİR: `review=AWAITING` süzgeciyle okunan sekmedir (F03-C). */
type StatusFilter = "all" | "PENDING" | "IN_PROGRESS" | "AWAITING_REVIEW" | "COMPLETED" | "CANCELLED";
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
  { value: "AWAITING_REVIEW", label: "Kontrolde" },
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
  const awaitingReview = typeof m.awaitingReview === "number" ? m.awaitingReview : undefined;
  return { total: m.total, page: m.page, limit: m.limit, totalPages: m.totalPages, summary, awaitingReview };
}

const REVIEW_BADGE_TONE: Record<string, string> = {
  info: "bg-amber-100 text-amber-800",
  warning: "bg-orange-100 text-orange-800",
  success: "bg-green-100 text-green-800",
  neutral: "bg-slate-100 text-slate-700",
};

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
  const [cancelTarget, setCancelTarget] = useState<Task | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // F03-C: kontrol penceresi (karar / işaretin konması / kaldırılması) + kontrole gönderme bilgisi + kayıt hatası.
  const [reviewAction, setReviewAction] = useState<{ task: Task; kind: ReviewActionKind } | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Task | null>(null);
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);
  const [historyMeta, setHistoryMeta] = useState<TaskListMeta | null>(null);
  const [historyCoverage, setHistoryCoverage] = useState<TaskHistoryCoverage | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyRequestRef = useRef(0);
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
    reviewRequired: false,
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
    // F03-C: "Kontrolde" sunucuda ayrı bir durum değildir (devam ediyor + kontrol bekliyor) → kontrol süzgeciyle okunur.
    // "Devam Eden" sekmesi kontrolde bekleyenleri içermez (başlıktaki sayaçla aynı küme).
    if (filter === "AWAITING_REVIEW") q.set("review", "AWAITING");
    else if (filter !== "all") {
      q.set("status", filter);
      if (filter === "IN_PROGRESS") q.set("review", "NOT_AWAITING");
    }
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
    setSaveError(null);
    try {
      // F03-C: "kontrol gerekli" yalnız OLUŞTURMADA gönderilir (PUT bu alanı kabul etmez; sonradan değişiklik kendi ucundadır).
      const { reviewRequired, ...fields } = form;
      const payload = {
        ...fields,
        dueDate: form.dueDate || undefined,
        caseId: form.caseId || undefined,
        assigneeId: form.assigneeId || undefined,
      };

      if (editingTask) {
        await api.put(`/tasks/${editingTask.id}`, payload);
      } else {
        await api.post("/tasks", reviewRequired ? { ...payload, reviewRequired: true } : payload);
      }

      setShowModal(false);
      setEditingTask(null);
      resetForm();
      loadTasks();
    } catch (e: unknown) {
      // Sunucunun nedeni (ör. kontrol edebilecek kişi yok) pencerede görünür; pencere açık kalır.
      setSaveError(toActionErrorMessage(e, "Görev kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const canCancel = (task: Task) => !!currentUser && !!currentUser.role && currentUser.role !== "VIEWER"
    && task.status !== "CANCELLED" && (currentUser.role === "ADMIN" || task.createdById === currentUser.id);

  const openReviewAction = (task: Task, kind: ReviewActionKind) => {
    setReviewAction({ task, kind });
    setReviewText("");
    setReviewError(null);
  };

  // F03-C: kontrol kararı / işaretin konması / kaldırılması. Sonuç yalnız doğrulanmış liste okumasıyla kesinleşir; sunucunun
  // ret nedeni (aynı kişi, kontrol edebilecek kişi yok, bekleyen kontrol yok) pencerede aynen görünür.
  const handleReviewAction = async () => {
    if (!reviewAction || reviewSubmitting) return;
    const { task, kind } = reviewAction;
    const text = reviewText.trim();
    if (REVIEW_ACTION_TEXT[kind].textRequired && !text) return;
    setReviewSubmitting(true);
    setReviewError(null);
    setStaleNotice(null);
    setInfoNotice(null);
    try {
      await rowLock.run(`task:status:${task.id}`, async () => {
        const outcome = await runMutation({
          mutate: () =>
            kind === "SET_REQUIREMENT"
              ? api.setTaskReviewRequirement(task.id, true)
              : kind === "REMOVE_REQUIREMENT"
                ? api.setTaskReviewRequirement(task.id, false, text)
                : api.reviewTask(task.id, kind, text || undefined),
          refresh: () => loadTasks({ propagateError: true }),
          failureMessage: REVIEW_ACTION_TEXT[kind].failure,
          staleMessage: REVIEW_ACTION_TEXT[kind].stale,
        });
        if (!rowLock.isMounted()) return;
        if (outcome.status === "FAILED") {
          setReviewError(outcome.error.message);
          return;
        }
        setReviewAction(null);
        setReviewText("");
        if (outcome.status === "SUCCESS_STALE") setStaleNotice(outcome.stale);
      });
    } finally {
      if (rowLock.isMounted()) setReviewSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget || !cancelReason.trim() || cancelling) return;
    const target = cancelTarget;
    setCancelling(true);
    setCancelError(null);
    setStaleNotice(null);
    try {
      await rowLock.run(`task:status:${target.id}`, async () => {
        const outcome = await runMutation({
          mutate: () => api.cancelTask(target.id, cancelReason.trim()),
          refresh: () => loadTasks({ propagateError: true }),
          failureMessage: "Görev iptal edilemedi. Durum DEĞİŞMEDİ.",
          staleMessage: "Görev İPTAL EDİLDİ, ancak liste yenilenemedi.",
        });
        if (!rowLock.isMounted()) return;
        if (outcome.status === "FAILED") {
          setCancelError(outcome.error.message);
          return;
        }
        setCancelTarget(null);
        setCancelReason("");
        if (outcome.status === "SUCCESS_STALE") setStaleNotice(outcome.stale);
      });
    } finally {
      if (rowLock.isMounted()) setCancelling(false);
    }
  };

  // F03-A2 (OFP-03a): görevin genel geçmişi + gerekçeli iptalleri TEK listede (GET /tasks/:id/history; yeni → eski).
  // `api.getTaskHistory` gövdeyi olduğu gibi döner: `{ data: [...], meta }`. (Önceki iptal geçmişi penceresi bu zarfı bir kat
  // fazla açıyordu ve 200 yanıtı "alınamadı" diye gösteriyordu; birleşik pencere tek zarf okur.)
  const loadTaskHistory = async (task: Task, historyPage = 1) => {
    const token = ++historyRequestRef.current;
    setHistoryTarget(task);
    setHistory([]);
    setHistoryMeta(null);
    setHistoryCoverage(null);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const body = await api.getTaskHistory(task.id, historyPage);
      if (!isMountedRef.current || token !== historyRequestRef.current) return;
      const parsed = parseMeta(body?.meta);
      if (!Array.isArray(body?.data) || !parsed) throw new Error("Görev geçmişi yanıtı geçersiz.");
      setHistory(body.data);
      setHistoryMeta(parsed);
      const coverage = body.meta?.coverage;
      setHistoryCoverage(
        coverage && typeof coverage.creationRecorded === "boolean" && typeof coverage.systemWritersRecorded === "boolean"
          ? { creationRecorded: coverage.creationRecorded, systemWritersRecorded: coverage.systemWritersRecorded }
          : null,
      );
    } catch (error) {
      if (!isMountedRef.current || token !== historyRequestRef.current) return;
      setHistoryError(toActionErrorMessage(error, "Görev geçmişi alınamadı."));
    } finally {
      if (isMountedRef.current && token === historyRequestRef.current) setHistoryLoading(false);
    }
  };

  const handleStatusChange = async (task: Task, newStatus: string) => {
    setActionError(null);
    setStaleNotice(null);
    setInfoNotice(null);
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
      // F03-C: işaretli görev tamamlanınca tamamlanmış SAYILMAZ; kontrole gider. Ekran bunu söyler (durum uydurulmaz:
      // kartın durumu yeniden okunan listeden gelir).
      if (newStatus === "COMPLETED" && task.reviewRequired) setInfoNotice(REVIEW_SUBMITTED_NOTICE);
    });
  };

  const openEditModal = (task: Task) => {
    setSaveError(null);
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
      caseId: task.case?.id || "",
      assigneeId: task.assignee?.id || "",
      reviewRequired: !!task.reviewRequired,
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
      reviewRequired: false,
    });
    setSaveError(null);
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
      {infoNotice ? (
        <div role="status" data-testid="task-review-notice" className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span className="flex-1">{infoNotice}</span>
          <button type="button" onClick={() => setInfoNotice(null)} aria-label="Bilgiyi kapat" className="shrink-0 rounded px-1 hover:bg-blue-100">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Görevler</h1>
          {/* F01-B: sayaçlar sunucu toplamından (meta.summary); kapsamı açıkça yazılır. */}
          <p className="text-muted-foreground" data-testid="tasks-summary">
            {summary
              ? `${summary.pending} bekleyen, ${summary.inProgress} devam eden görev${meta?.awaitingReview ? `, ${meta.awaitingReview} kontrolde` : ""}`
              : "Toplamlar alınamadı"}
            <span className="ml-2 text-xs">({scopeLabel})</span>
          </p>
          {/* F02-B görünürlük: sunucunun bu listeye UYGULADIĞI kapsam (GET /office/view-scope; liste ile aynı kaynak) */}
          <ViewScopeBadge area="tasks" className="mt-1" />
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
            {tab.value === "AWAITING_REVIEW" && !!meta?.awaitingReview && (
              <span data-testid="tasks-awaiting-review-count" className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                {meta.awaitingReview}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {tasks.map((task) => {
          // F03-C: kontrol sunumu. Düğmeler yalnız SUNUMDUR; kararı sunucu verir (kişi düzeyi bağımsızlık, görünüm kapsamı).
          const awaiting = isAwaitingReview(task);
          const reviewBadge = taskReviewBadge(task);
          const reviewDecision = lastReviewDecisionText(task);
          const viewer = currentUser ? { id: currentUser.id, role: currentUser.role } : null;
          const offerDecision = canOfferReviewDecision(viewer, task);
          const offerRemoval = canOfferReviewRequirementRemoval(viewer, task);
          const offerSet = canOfferReviewRequirementSet(viewer, task);
          return (
          <div
            key={task.id}
            className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <button
                onClick={() => handleStatusChange(task, task.status === "COMPLETED" ? "PENDING" : "COMPLETED")}
                disabled={task.status === "CANCELLED" || awaiting}
                title={task.status === "CANCELLED" ? "İptal edilmiş görev" : awaiting ? REVIEW_AWAITING_STATUS_HINT : undefined}
                className="mt-0.5 disabled:cursor-not-allowed"
              >
                {awaiting ? <ShieldCheck className="h-5 w-5 text-amber-500" /> : statusIcons[task.status] ?? <Circle className="h-5 w-5 text-muted-foreground" />}
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
                  <span className={`text-xs px-2 py-0.5 rounded ${awaiting ? REVIEW_BADGE_TONE.info : "bg-gray-100"}`} data-testid="task-status-label">
                    {awaiting ? "Kontrolde" : statusLabels[task.status] ?? task.status}
                  </span>
                  {reviewBadge && !awaiting && (
                    <span data-testid="task-review-badge" className={`text-xs px-2 py-0.5 rounded ${REVIEW_BADGE_TONE[reviewBadge.tone]}`}>
                      {reviewBadge.label}
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                )}
                {reviewDecision && reviewDecision !== reviewBadge?.label && (
                  <p data-testid="task-review-decision" className="mb-2 whitespace-pre-wrap text-sm text-amber-900">{reviewDecision}</p>
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
                {(offerDecision || offerRemoval || offerSet || awaiting) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="task-review-actions">
                    {awaiting && !offerDecision && <span className="text-xs text-muted-foreground">{REVIEW_AWAITING_HINT}</span>}
                    {offerDecision &&
                      REVIEW_DECISION_KINDS.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => openReviewAction(task, kind)}
                          className={`rounded border px-2.5 py-1 text-xs font-medium ${
                            kind === "APPROVE" ? "border-green-300 bg-green-50 text-green-800 hover:bg-green-100" : "border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {REVIEW_DECISION_LABEL[kind]}
                        </button>
                      ))}
                    {offerRemoval && (
                      <button type="button" onClick={() => openReviewAction(task, "REMOVE_REQUIREMENT")} className="rounded border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50">
                        Kontrol işaretini kaldır
                      </button>
                    )}
                    {offerSet && (
                      <button type="button" onClick={() => openReviewAction(task, "SET_REQUIREMENT")} className="rounded border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50">
                        Kontrol gerekli yap
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(task)}
                  className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button aria-label={`${task.title} geçmişi`} title="Geçmiş" onClick={() => void loadTaskHistory(task)} className="p-2 text-gray-400 hover:text-primary rounded">
                  <History className="h-4 w-4" />
                </button>
                {canCancel(task) && (
                  <button aria-label={`${task.title} görevini iptal et`} onClick={() => { setCancelTarget(task); setCancelReason(""); setCancelError(null); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
                    <Ban className="h-4 w-4" />
                  </button>
                )}
              </div>
              {task.priority === "URGENT" && task.status !== "COMPLETED" && task.status !== "CANCELLED" && (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
            </div>
          </div>
          );
        })}

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

      {reviewAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="task-review-title" className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-auto">
            <h2 id="task-review-title" className="text-lg font-semibold">{REVIEW_ACTION_TEXT[reviewAction.kind].title}</h2>
            <p className="mt-2">{reviewAction.task.title}</p>
            <p className="text-sm text-muted-foreground mt-1">{REVIEW_ACTION_TEXT[reviewAction.kind].description}</p>
            {REVIEW_ACTION_TEXT[reviewAction.kind].textLabel && (
              <>
                <label htmlFor="task-review-text" className="block mt-4 mb-1">{REVIEW_ACTION_TEXT[reviewAction.kind].textLabel}</label>
                <textarea id="task-review-text" value={reviewText} onChange={event => setReviewText(event.target.value)} maxLength={2000} disabled={reviewSubmitting} className="w-full border rounded-lg p-2" rows={4} />
              </>
            )}
            {reviewError && <div role="alert" className="text-red-700 mt-2">{reviewError}</div>}
            <div className="flex justify-end gap-2 mt-4">
              <button disabled={reviewSubmitting} onClick={() => { setReviewAction(null); setReviewText(""); setReviewError(null); }} className="border rounded px-3 py-2">Vazgeç</button>
              <button
                disabled={reviewSubmitting || (REVIEW_ACTION_TEXT[reviewAction.kind].textRequired && !reviewText.trim())}
                onClick={() => void handleReviewAction()}
                className="bg-primary text-white rounded px-3 py-2 disabled:opacity-50"
              >
                {reviewSubmitting ? "Kaydediliyor…" : REVIEW_ACTION_TEXT[reviewAction.kind].confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="task-cancel-title" className="bg-white rounded-xl p-6 max-w-lg w-full">
            <h2 id="task-cancel-title" className="text-lg font-semibold">Görevi gerekçeli iptal et</h2>
            <p className="mt-2">{cancelTarget.title}</p>
            <p className="text-sm text-muted-foreground mt-1">Görev ve geçmişi korunur. İptal, tamamlanma olarak sayılmaz.</p>
            <label htmlFor="task-cancel-reason" className="block mt-4 mb-1">İptal gerekçesi</label>
            <textarea id="task-cancel-reason" value={cancelReason} onChange={event => setCancelReason(event.target.value)} maxLength={2000} disabled={cancelling} className="w-full border rounded-lg p-2" rows={4} />
            {cancelError && <div role="alert" className="text-red-700 mt-2">{cancelError}</div>}
            <div className="flex justify-end gap-2 mt-4">
              <button disabled={cancelling} onClick={() => { setCancelTarget(null); setCancelReason(""); }} className="border rounded px-3 py-2">Vazgeç</button>
              <button disabled={cancelling || !cancelReason.trim()} onClick={() => void handleCancel()} className="bg-red-700 text-white rounded px-3 py-2 disabled:opacity-50">{cancelling ? "İptal ediliyor…" : "İptali kaydet"}</button>
            </div>
          </div>
        </div>
      )}

      {historyTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="task-history-title" className="bg-white rounded-xl p-6 max-w-xl w-full max-h-[85vh] overflow-auto">
            {/* Liste uzadığında alttaki "Kapat" pencerenin kaydırma alanında kalır; üstteki düğme her zaman görünür (gerçek sayfada ölçüldü). */}
            <div className="sticky top-0 -mt-2 flex items-start justify-between gap-3 bg-white pb-1 pt-2">
              <h2 id="task-history-title" className="text-lg font-semibold">Geçmiş — {historyTarget.title}</h2>
              <button
                type="button"
                aria-label="Geçmiş penceresini kapat"
                onClick={() => { ++historyRequestRef.current; setHistoryTarget(null); setHistory([]); setHistoryCoverage(null); setHistoryError(null); }}
                className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Görevin kayıtlı değişiklikleri ve gerekçeli iptalleri; en yeni kayıt üstte.</p>
            {historyLoading && <p role="status">Görev geçmişi yükleniyor…</p>}
            {historyError && <div role="alert" className="text-red-700 mt-2">{historyError}</div>}
            {/* Kapsam sınırı: kayıtlı olmayan değişiklik "olmadı" gibi sunulmaz (eski görev / sistem üreticisi yazımları). */}
            {!historyLoading && !historyError && taskHistoryCoverageNotes(historyCoverage).map(note => (
              <p key={note} data-testid="task-history-coverage" className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{note}</p>
            ))}
            {!historyLoading && !historyError && history.length === 0 && <p className="mt-3">Bu görev için kayıtlı geçmiş yok.</p>}
            <ul className="space-y-3 mt-4">
              {history.map(event => (
                <li key={`${event.kind}-${event.id}`} className="border rounded p-3">
                  <p className="text-sm text-muted-foreground">{describeTaskHistoryActor(event)} · {new Date(event.createdAt).toLocaleString("tr-TR")}</p>
                  <p className="font-medium">{describeTaskHistoryEvent(event)}</p>
                  {event.reason && <p className="whitespace-pre-wrap mt-2">{event.reason}</p>}
                </li>
              ))}
            </ul>
            {historyMeta && historyMeta.totalPages > 1 && (
              <div className="flex justify-between items-center mt-3">
                <button disabled={historyLoading || historyMeta.page <= 1} onClick={() => void loadTaskHistory(historyTarget, historyMeta.page - 1)}>Önceki kayıtlar</button>
                <span>{historyMeta.page} / {historyMeta.totalPages}</span>
                <button disabled={historyLoading || historyMeta.page >= historyMeta.totalPages} onClick={() => void loadTaskHistory(historyTarget, historyMeta.page + 1)}>Sonraki kayıtlar</button>
              </div>
            )}
            <button onClick={() => { ++historyRequestRef.current; setHistoryTarget(null); setHistory([]); setHistoryCoverage(null); setHistoryError(null); }} className="mt-4 border rounded px-3 py-2">Kapat</button>
          </div>
        </div>
      )}

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          {/* Yükseklik sınırı: "Kontrol gerekli" satırıyla uzayan pencerenin düğmeleri küçük ekranda da erişilir kalır. */}
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[92vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingTask ? "Görevi Düzenle" : "Yeni Görev"}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingTask(null); setSaveError(null); }} className="text-gray-400 hover:text-gray-600">
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
                    disabled={!!editingTask && isAwaitingReview(editingTask)}
                    className="w-full border rounded-lg px-3 py-2 disabled:bg-gray-50 disabled:text-muted-foreground"
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

              {/* F03-C (K4-b): işareti görevi oluşturan koyar; varsayılan kapalıdır. Düzenlemede işaret buradan değişmez. */}
              {!editingTask && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.reviewRequired}
                    onChange={(e) => setForm({ ...form, reviewRequired: e.target.checked })}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Kontrol gerekli</span>
                    <span className="block text-xs text-muted-foreground">{REVIEW_REQUIRED_HINT}</span>
                  </span>
                </label>
              )}
              {editingTask && isAwaitingReview(editingTask) && (
                <p data-testid="task-edit-review-hint" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{REVIEW_AWAITING_STATUS_HINT}</p>
              )}
            </div>

            {/* Alt şerit yapışkandır: pencere kaydırılsa da kayıt hatası ve düğmeler görünür kalır (1366×768'de gerçek sayfada
                "Kaydet" ve hata iletisi kaydırma alanının altında kalıyordu). */}
            <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 border-t bg-white px-6 py-3">
              {saveError && <div role="alert" data-testid="task-save-error" className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}
              <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setEditingTask(null); setSaveError(null); }}
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
        </div>
      )}
    </div>
  );
}
