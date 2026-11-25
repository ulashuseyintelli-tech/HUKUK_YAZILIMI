"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { toActionErrorMessage } from "@/lib/action-error";

/**
 * F03-B2 (OFP-02; owner kararı K2-a, 25.11.2026) — dosyadan gerçek görev oluşturma.
 *
 * Çağıran: cases/[id]/page.tsx → Operasyon Masası "Manuel Görev Ekle".
 * - Mevcut `POST /tasks` ucu kullanılır (yetki / kapsam kuralları sunucudadır); yeni uç YOK.
 * - Dosya bu pencerede SEÇİLMEZ: açık dosyanın kimliği gönderilir.
 * - Görev atanmadan açılır; atama ve durum değişikliği Görevler ekranındadır (pencere bunu söyler).
 * - Başarısız kayıtta pencere açık kalır, girilen değerler korunur ve hata GÖRÜNÜR olur; başarı yan etkisi çalışmaz.
 */
export interface CaseTaskCreateModalProps {
  caseId: string;
  /** Başlıkta gösterilecek dosya etiketi (ör. dosya numarası). */
  caseLabel?: string;
  onClose: () => void;
  /** Görev sunucuda oluştuktan SONRA çağrılır; çağıran listeyi yeniden okur. */
  onCreated: () => void;
}

const PRIORITIES: { value: string; label: string }[] = [
  { value: "LOW", label: "Düşük" },
  { value: "MEDIUM", label: "Orta" },
  { value: "HIGH", label: "Yüksek" },
  { value: "URGENT", label: "Acil" },
];

export function CaseTaskCreateModal({ caseId, caseLabel, onClose, onCreated }: CaseTaskCreateModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedTitle = title.trim();

  const handleSave = async () => {
    if (!trimmedTitle || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.createTask({
        title: trimmedTitle,
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
        caseId,
      });
    } catch (e) {
      setError(toActionErrorMessage(e, "Görev oluşturulamadı."));
      setSaving(false);
      return;
    }
    setSaving(false);
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="case-task-create-title">
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-xl bg-white">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 id="case-task-create-title" className="text-lg font-semibold">
            Manuel Görev Ekle{caseLabel ? ` — ${caseLabel}` : ""}
          </h2>
          <button type="button" onClick={onClose} aria-label="Kapat" className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <label htmlFor="case-task-title" className="mb-1 block text-sm font-medium">Başlık *</label>
            <input
              id="case-task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="Görev başlığı"
            />
          </div>
          <div>
            <label htmlFor="case-task-description" className="mb-1 block text-sm font-medium">Açıklama</label>
            <textarea
              id="case-task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              rows={3}
              placeholder="Görev açıklaması"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="case-task-priority" className="mb-1 block text-sm font-medium">Öncelik</label>
              <select
                id="case-task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="case-task-due" className="mb-1 block text-sm font-medium">Bitiş Tarihi</label>
              <input
                id="case-task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Görev bu dosyaya bağlı ve atanmadan açılır; Görevler ekranında da görünür. Atama ve durum değişikliği Görevler ekranından yapılır.
          </p>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error} Görev oluşturulmadı.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!trimmedTitle || saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Kaydediliyor…" : "Görevi Oluştur"}
          </button>
        </div>
      </div>
    </div>
  );
}
