'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
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
  assignee?: { name: string; surname: string };
  case?: { fileNumber: string };
}

const COLUMNS = [
  { id: 'PENDING', title: 'Bekliyor', color: 'bg-gray-100' },
  { id: 'IN_PROGRESS', title: 'Devam Ediyor', color: 'bg-blue-100' },
  { id: 'REVIEW', title: 'İnceleme', color: 'bg-yellow-100' },
  { id: 'COMPLETED', title: 'Tamamlandı', color: 'bg-green-100' },
];

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-200 text-gray-700',
  MEDIUM: 'bg-blue-200 text-blue-700',
  HIGH: 'bg-orange-200 text-orange-700',
  URGENT: 'bg-red-200 text-red-700',
};

export default function KanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  /**
   * WSMR-A4f · UYDURMA GOREV KAYITLARI KALDIRILDI.
   *
   * `/tasks` hata verdiginde bes adet sahte hukuki gorev ("Haciz talebi
   * hazirla", "Tebligat kontrolu", ...) panoya diziliyordu. Kullanici bunlari
   * gercek is listesi sanip planlama yapabilir, gercek gorevleri ise hic
   * gormedigi icin kacirabilirdi. Artik yuk hatasi GORUNUR ve pano bos kalir.
   */
  const loadTasks = async () => {
    setLoadError(null);
    try {
      const res = await api.get('/tasks');
      const raw = (res as { data?: unknown })?.data;
      const rows = Array.isArray(raw) ? raw : (raw as { data?: unknown } | undefined)?.data;
      if (!Array.isArray(rows)) throw new Error('MALFORMED_LIST_RESPONSE');
      setTasks(rows as Task[]);
    } catch (e) {
      setTasks([]);
      setLoadError(toActionErrorMessage(e, 'Görevler yüklenemedi.'));
    } finally {
      setLoading(false);
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

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/tasks" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold">Kanban Board</h1>
            <p className="text-xs text-muted-foreground">Görevleri sürükle-bırak ile yönetin</p>
          </div>
        </div>
        <Link
          href="/tasks/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Yeni Görev
        </Link>
      </div>

      {moveError && (
        <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {moveError}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">Yükleniyor...</div>
      ) : loadError ? (
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
                {getTasksByStatus(column.id).map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task)}
                    className={`bg-white rounded-lg p-3 shadow-sm cursor-move hover:shadow-md transition-shadow ${
                      draggedTask?.id === task.id ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-sm">{task.title}</h4>
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
                      
                      {task.dueDate && (
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
                ))}

                {getTasksByStatus(column.id).length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    Görev yok
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
