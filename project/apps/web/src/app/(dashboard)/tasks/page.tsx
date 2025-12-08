"use client";

import { useState } from "react";
import { Plus, CheckCircle2, Circle, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@hukuk/ui";

const mockTasks = [
  {
    id: "1",
    title: "Ödeme emri tebliği",
    description: "2024/1001 dosyası için ödeme emri tebliğ edilecek",
    status: "PENDING",
    priority: "HIGH",
    dueDate: "2024-12-10",
    case: { fileNumber: "2024/1001" },
  },
  {
    id: "2",
    title: "Haciz işlemi",
    description: "Borçlunun adresinde haciz yapılacak",
    status: "IN_PROGRESS",
    priority: "URGENT",
    dueDate: "2024-12-11",
    case: { fileNumber: "2024/1002" },
  },
  {
    id: "3",
    title: "Duruşma hazırlığı",
    description: "İtiraz duruşması için evraklar hazırlanacak",
    status: "PENDING",
    priority: "MEDIUM",
    dueDate: "2024-12-15",
    case: { fileNumber: "2024/1003" },
  },
  {
    id: "4",
    title: "Tahsilat takibi",
    description: "Taksit ödemesi kontrol edilecek",
    status: "COMPLETED",
    priority: "LOW",
    dueDate: "2024-12-08",
    case: { fileNumber: "2024/1001" },
  },
];

const statusIcons: Record<string, React.ReactNode> = {
  PENDING: <Circle className="h-5 w-5 text-muted-foreground" />,
  IN_PROGRESS: <Clock className="h-5 w-5 text-blue-500" />,
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

export default function TasksPage() {
  const [filter, setFilter] = useState("all");

  const filteredTasks = mockTasks.filter((task) => {
    if (filter === "all") return true;
    return task.status === filter;
  });

  const pendingCount = mockTasks.filter((t) => t.status === "PENDING").length;
  const inProgressCount = mockTasks.filter((t) => t.status === "IN_PROGRESS").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Görevler</h1>
          <p className="text-muted-foreground">
            {pendingCount} bekleyen, {inProgressCount} devam eden görev
          </p>
        </div>
        <button className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Yeni Görev
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { value: "all", label: "Tümü" },
          { value: "PENDING", label: "Bekleyen" },
          { value: "IN_PROGRESS", label: "Devam Eden" },
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
              <button className="mt-0.5">{statusIcons[task.status]}</button>
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
                </div>
                <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    Dosya: <span className="text-primary">{task.case?.fileNumber}</span>
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {new Date(task.dueDate).toLocaleDateString("tr-TR")}
                  </span>
                </div>
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
          </div>
        )}
      </div>
    </div>
  );
}
