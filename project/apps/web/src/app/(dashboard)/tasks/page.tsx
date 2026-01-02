"use client";

import { useState, useEffect } from "react";
import { Plus, CheckCircle2, Circle, Clock, AlertCircle, LayoutGrid, Loader2, Trash2, Edit2, X } from "lucide-react";
import { Badge } from "@hukuk/ui";
import Link from "next/link";
import { api } from "@/lib/api";

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
}

const statusIcons: Record<string, React.ReactNode> = {
  PENDING: <Circle className="h-5 w-5 text-muted-foreground" />,
  IN_PROGRESS: <Clock className="h-5 w-5 text-blue-500" />,
  REVIEW: <Clock className="h-5 w-5 text-yellow-500" />,
  COMPLETED: <CheckCircle2 className="h-5 w-5 text-green-500" />,
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
  REVIEW: "İnceleme",
  COMPLETED: "Tamamlandı",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [cases, setCases] = useState<{ id: string; fileNumber: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; surname: string }[]>([]);
  
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "PENDING",
    priority: "MEDIUM",
    dueDate: "",
    caseId: "",
    assigneeId: "",
  });

  useEffect(() => {
    loadTasks();
    loadLookups();
  }, []);

  const loadTasks = async () => {
    try {
      const res = await api.get("/tasks");
      setTasks(res.data?.data || res.data || []);
    } catch (e) {
      console.error("Görevler yüklenemedi:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadLookups = async () => {
    try {
      const [casesRes, usersRes] = await Promise.all([
        api.get("/cases?limit=100"),
        api.get("/users"),
      ]);
      setCases(casesRes.data?.data || []);
      setUsers(usersRes.data?.data || []);
    } catch (e) {
      console.error(e);
    }
  };

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
    try {
      await api.put(`/tasks/${task.id}`, { status: newStatus });
      loadTasks();
    } catch (e) {
      console.error(e);
    }
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

  const filteredTasks = tasks.filter((task) => {
    if (filter === "all") return true;
    return task.status === filter;
  });

  const pendingCount = tasks.filter((t) => t.status === "PENDING").length;
  const inProgressCount = tasks.filter((t) => t.status === "IN_PROGRESS").length;

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Görevler</h1>
          <p className="text-muted-foreground">
            {pendingCount} bekleyen, {inProgressCount} devam eden görev
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

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { value: "all", label: "Tümü" },
          { value: "PENDING", label: "Bekleyen" },
          { value: "IN_PROGRESS", label: "Devam Eden" },
          { value: "REVIEW", label: "İnceleme" },
          { value: "COMPLETED", label: "Tamamlanan" },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
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
        {filteredTasks.map((task) => (
          <div
            key={task.id}
            className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <button 
                onClick={() => handleStatusChange(task, task.status === "COMPLETED" ? "PENDING" : "COMPLETED")}
                className="mt-0.5"
              >
                {statusIcons[task.status]}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3
                    className={`font-medium ${
                      task.status === "COMPLETED" ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {task.title}
                  </h3>
                  <Badge variant={priorityColors[task.priority]}>
                    {priorityLabels[task.priority]}
                  </Badge>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                    {statusLabels[task.status]}
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
                  {task.dueDate && (
                    <span className={`flex items-center gap-1 ${isOverdue(task.dueDate) && task.status !== "COMPLETED" ? "text-red-600" : "text-muted-foreground"}`}>
                      <Clock className="h-4 w-4" />
                      {new Date(task.dueDate).toLocaleDateString("tr-TR")}
                      {isOverdue(task.dueDate) && task.status !== "COMPLETED" && " (Gecikmiş)"}
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
              {task.priority === "URGENT" && task.status !== "COMPLETED" && (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
            </div>
          </div>
        ))}

        {filteredTasks.length === 0 && (
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
                  <label className="block text-sm font-medium mb-1">Durum</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="PENDING">Bekliyor</option>
                    <option value="IN_PROGRESS">Devam Ediyor</option>
                    <option value="REVIEW">İnceleme</option>
                    <option value="COMPLETED">Tamamlandı</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Öncelik</label>
                  <select
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
                <label className="block text-sm font-medium mb-1">İlgili Dosya</label>
                <select
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
                <label className="block text-sm font-medium mb-1">Atanan Kişi</label>
                <select
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
