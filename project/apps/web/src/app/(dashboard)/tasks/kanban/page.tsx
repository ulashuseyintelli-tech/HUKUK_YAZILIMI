'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toActionErrorMessage } from '@/lib/action-error';
import { Plus, MoreVertical, Clock, User, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  assignee?: { id?: string; name: string; surname: string };
  case?: { fileNumber: string };
}

/** GET /tasks `meta` (F01-A): pano sayfa sayfa yükler; toplam ve kaç sayfa kaldığı buradan okunur. */
interface TaskListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** GET /users satırı: "atanana göre" süzgecini besler (liste sayfasıyla aynı kaynak ve zarf). */
interface UserOption {
  id: string;
  name: string;
  surname: string;
  isActive?: boolean;
}

/** Sunucunun üst sınırı (ListTasksQueryDto TASK_LIST_MAX_LIMIT). */
const PAGE_SIZE = 100;

// F01-B (OFP-02 dürüstlük): yalnız API'nin kabul ettiği durumlar. "REVIEW" API'de yok (sürükleme 400
// veriyordu) → sütun kaldırıldı. Bırakma hedefi olan sütunlar bunlardır.
const COLUMNS = [
  { id: 'PENDING', title: 'Bekliyor', color: 'bg-gray-100' },
  { id: 'IN_PROGRESS', title: 'Devam Ediyor', color: 'bg-blue-100' },
  { id: 'COMPLETED', title: 'Tamamlandı', color: 'bg-green-100' },
];

// İptal edilen görevler etiketiyle görünür; sütun SALT OKUNURDUR (bırakma hedefi değil, kartlar
// sürüklenemez): panodan sürükleyerek iptal etme / yeniden açma yolu bu dilimde AÇILMAZ.
const CANCELLED_COLUMN = { id: 'CANCELLED', title: 'İptal Edilen', color: 'bg-gray-50' };

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-200 text-gray-700',
  MEDIUM: 'bg-blue-200 text-blue-700',
  HIGH: 'bg-orange-200 text-orange-700',
  URGENT: 'bg-red-200 text-red-700',
};

function parseMeta(raw: unknown): TaskListMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (
    typeof m.total !== 'number' ||
    typeof m.page !== 'number' ||
    typeof m.limit !== 'number' ||
    typeof m.totalPages !== 'number'
  ) {
    return null;
  }
  return { total: m.total, page: m.page, limit: m.limit, totalPages: m.totalPages };
}

export default function KanbanPage() {
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id ?? null;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meta, setMeta] = useState<TaskListMeta | null>(null);
  const [loadedPages, setLoadedPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  // "" = tüm atananlar · "me" = bana atananlar · <userId> = atanana göre (liste sayfasıyla aynı sözleşme).
  // Yalnız SÜZGEÇTİR; OWN/TEAM yetkisi değildir (OFP-09 bu ekranda yok).
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (page: number): Promise<{ rows: Task[]; meta: TaskListMeta | null }> => {
      const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      const assigneeId = assigneeFilter === 'me' ? currentUserId : assigneeFilter;
      if (assigneeId) q.set('assigneeId', assigneeId);
      const res = await api.get(`/tasks?${q.toString()}`);
      const raw = (res as { data?: unknown })?.data;
      const rows = Array.isArray(raw) ? raw : (raw as { data?: unknown } | undefined)?.data;
      if (!Array.isArray(rows)) throw new Error('MALFORMED_LIST_RESPONSE');
      return { rows: rows as Task[], meta: Array.isArray(raw) ? null : parseMeta((raw as { meta?: unknown }).meta) };
    },
    [assigneeFilter, currentUserId]
  );

  /**
   * WSMR-A4f · UYDURMA GOREV KAYITLARI KALDIRILDI.
   *
   * `/tasks` hata verdiginde bes adet sahte hukuki gorev ("Haciz talebi
   * hazirla", "Tebligat kontrolu", ...) panoya diziliyordu. Kullanici bunlari
   * gercek is listesi sanip planlama yapabilir, gercek gorevleri ise hic
   * gormedigi icin kacirabilirdi. Artik yuk hatasi GORUNUR ve pano bos kalir.
   *
   * F01-B: ilk sayfa (100) yüklenir; kalan sayfalar "Daha fazla yükle" ile eklenir. Sunucu toplamı
   * başlıkta "x / N görev yüklendi" olarak görünür; pano hiçbir zaman "tamamı bu" diye yalan söylemez.
   */
  const loadTasks = useCallback(async () => {
    setLoadError(null);
    try {
      const { rows, meta: m } = await fetchPage(1);
      setTasks(rows);
      setMeta(m);
      setLoadedPages(1);
    } catch (e) {
      setTasks([]);
      setMeta(null);
      setLoadedPages(0);
      setLoadError(toActionErrorMessage(e, 'Görevler yüklenemedi.'));
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // F01-B: "atanana göre" seçenekleri. Görev yüklemesinden BAĞIMSIZDIR: /users düşerse pano yine gelir,
  // süzgeçte "Tüm / Bana atananlar" kalır ve hata görünür (A4-AC-05 ilkesi). Bu effect görev effect'inden
  // SONRA tanımlıdır: ilk istek /tasks olur (a4f testleri ilk çağrıyı /tasks sayar).
  // Sözleşme: başarılı yanıt HER ZAMAN {data: []} zarfıdır (user.controller) — dizi değilse malformed.
  const loadUsers = useCallback(async () => {
    setUsersLoadError(null);
    try {
      const res = await api.get('/users');
      const data = (res as { data?: { data?: unknown } })?.data?.data;
      if (!Array.isArray(data)) throw new Error('MALFORMED_USERS_RESPONSE');
      setUsers(data as UserOption[]);
    } catch (e) {
      setUsersLoadError(toActionErrorMessage(e, 'Kullanıcılar yüklenemedi.'));
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const loadMore = async () => {
    if (!meta || loadedPages >= meta.totalPages || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    const next = loadedPages + 1;
    try {
      const { rows, meta: m } = await fetchPage(next);
      setTasks((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...rows.filter((t) => !seen.has(t.id))];
      });
      if (m) setMeta(m);
      setLoadedPages(next);
    } catch (e) {
      // Yüklenmiş kartlar korunur; eksik kalan sayfa görünür hata olur.
      setLoadError(toActionErrorMessage(e, 'Sonraki görevler yüklenemedi.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDragStart = (task: Task) => {
    setDraggedTask(task);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (columnId: string) => {
    if (!draggedTask || draggedTask.status === columnId) {
      setDraggedTask(null);
      return;
    }

    const movedId = draggedTask.id;
    const previousStatus = draggedTask.status;

    // Optimistic update
    setMoveError(null);
    setTasks(prev => prev.map(t =>
      t.id === movedId ? { ...t, status: columnId } : t
    ));

    try {
      await api.put(`/tasks/${movedId}`, { status: columnId });
    } catch (e) {
      // WSMR-A4f: basarisiz tasima ONCEKI duruma geri alinir. Eskiden burada
      // loadTasks() cagriliyordu; o da hata verirse pano sahte demo gorevlere
      // dusuyordu — yani basarisiz bir mutasyon uydurma veriyle sonuclaniyordu.
      setTasks(prev => prev.map(t =>
        t.id === movedId ? { ...t, status: previousStatus } : t
      ));
      setMoveError(toActionErrorMessage(e, 'Görev durumu güncellenemedi.'));
    }

    setDraggedTask(null);
  };

  const getTasksByStatus = (status: string) => {
    return tasks.filter(t => t.status === status);
  };

  const formatDate = (date?: string) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return { text: 'Gecikmiş', color: 'text-red-600' };
    if (days === 0) return { text: 'Bugün', color: 'text-orange-600' };
    if (days === 1) return { text: 'Yarın', color: 'text-yellow-600' };
    return { text: `${days} gün`, color: 'text-gray-500' };
  };

  const renderCard = (task: Task, draggable: boolean) => (
    <div
      key={task.id}
      draggable={draggable}
      onDragStart={draggable ? () => handleDragStart(task) : undefined}
      className={`bg-white rounded-lg p-3 shadow-sm transition-shadow ${
        draggable ? 'cursor-move hover:shadow-md' : 'opacity-75'
      } ${draggedTask?.id === task.id ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className={`font-medium text-sm ${draggable ? '' : 'line-through text-gray-500'}`}>{task.title}</h4>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {task.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded ${PRIORITY_COLORS[task.priority] || 'bg-gray-100'}`}>
          {task.priority === 'LOW' ? 'Düşük' :
           task.priority === 'MEDIUM' ? 'Orta' :
           task.priority === 'HIGH' ? 'Yüksek' : 'Acil'}
        </span>
        {!draggable && (
          <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">İptal edildi</span>
        )}

        {task.dueDate && draggable && (
          <span className={`text-xs flex items-center gap-1 ${formatDate(task.dueDate)?.color}`}>
            <Clock className="h-3 w-3" />
            {formatDate(task.dueDate)?.text}
          </span>
        )}
      </div>

      {(task.assignee || task.case) && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t text-xs text-gray-500">
          {task.assignee && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {task.assignee.name}
            </span>
          )}
          {task.case && (
            <span className="truncate">{task.case.fileNumber}</span>
          )}
        </div>
      )}
    </div>
  );

  // Kapsam etiketi: pano hangi süzgeçle yüklendiğini söyler (liste sayfasındaki scopeLabel'ın karşılığı).
  const selectedUser = users.find((u) => u.id === assigneeFilter);
  const scopeSuffix =
    assigneeFilter === 'me'
      ? ' (bana atananlar)'
      : assigneeFilter
        ? ` (atanan: ${selectedUser ? `${selectedUser.name} ${selectedUser.surname}` : 'seçili kullanıcı'})`
        : '';
  const loadedLabel = meta ? `${tasks.length} / ${meta.total} görev yüklendi${scopeSuffix}` : null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/tasks" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold">Kanban Board</h1>
            <p className="text-xs text-muted-foreground">
              Görevleri sürükle-bırak ile yönetin
              {loadedLabel ? <span data-testid="kanban-loaded"> · {loadedLabel}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Atanana göre süzgeç (sunucu parametresi; liste sayfasıyla aynı). Pasif kullanıcı listede kalır:
              geçmişte ona atanmış görevler süzülebilmeli; yeni atama J1 kapısında zaten reddedilir. */}
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Atanana göre</span>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">Tüm atananlar</option>
              <option value="me" disabled={!currentUserId}>Bana atananlar</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.surname}{u.isActive === false ? ' (pasif)' : ''}
                </option>
              ))}
            </select>
          </label>
          {usersLoadError && (
            /* role="alert" DEĞİL: görev yükleme hatasının tek uyarısıyla karışmasın; süzgeç yine çalışır. */
            <span role="status" className="text-xs text-red-600">
              {usersLoadError}{' '}
              <button type="button" onClick={loadUsers} className="underline hover:text-red-800">
                Kullanıcıları yeniden dene
              </button>
            </span>
          )}
          {/* F01-C: eski /tasks/new route'u yoktu (404). Görev listesindeki mevcut modal #yeni ile açılır. */}
          <Link
            href="/tasks#yeni"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Yeni Görev
          </Link>
        </div>
      </div>

      {moveError && (
        <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {moveError}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">Yükleniyor...</div>
      ) : loadError && loadedPages === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center" role="alert">
            <p className="text-sm font-medium text-red-600">{loadError}</p>
            <button
              type="button"
              onClick={loadTasks}
              className="mt-2 text-xs text-blue-600 underline hover:text-blue-800"
            >
              Tekrar dene
            </button>
          </div>
        </div>
      ) : (
        <>
          {loadError && (
            <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </div>
          )}
          {meta && loadedPages < meta.totalPages && (
            <div className="mb-3 flex items-center gap-3 text-sm text-muted-foreground">
              <span>Panoda görevlerin tamamı yok.</span>
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingMore ? 'Yükleniyor…' : `Daha fazla yükle (${tasks.length} / ${meta.total})`}
              </button>
            </div>
          )}
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map(column => (
              <div
                key={column.id}
                className={`flex-shrink-0 w-72 ${column.color} rounded-lg p-3`}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(column.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">{column.title}</h3>
                  <span className="text-xs bg-white/50 px-2 py-0.5 rounded-full">
                    {getTasksByStatus(column.id).length}
                  </span>
                </div>

                <div className="space-y-2">
                  {getTasksByStatus(column.id).map(task => renderCard(task, true))}

                  {getTasksByStatus(column.id).length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Görev yok
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Salt okunur iptal sütunu: bırakma hedefi değil, kartlar sürüklenemez. */}
            <div
              key={CANCELLED_COLUMN.id}
              data-testid="kanban-cancelled-column"
              className={`flex-shrink-0 w-72 ${CANCELLED_COLUMN.color} rounded-lg p-3 border border-dashed`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">{CANCELLED_COLUMN.title}</h3>
                <span className="text-xs bg-white/50 px-2 py-0.5 rounded-full">
                  {getTasksByStatus(CANCELLED_COLUMN.id).length}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mb-2">Salt okunur; buraya sürüklenemez.</p>
              <div className="space-y-2">
                {getTasksByStatus(CANCELLED_COLUMN.id).map(task => renderCard(task, false))}
                {getTasksByStatus(CANCELLED_COLUMN.id).length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    Görev yok
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
