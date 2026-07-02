"use client";

// P4 — Office Approval Inbox. error-logs sayfasıyla AYNI desen (filtre + liste + drawer).
// Karar aksiyonları (onay/red/revizyon/geri çekme) drawer İÇİNDE (Decision UI); karar sonrası liste
// onDecided ile yenilenir. Executor, dashboard widget, notification badge — kapsam dışı.
import { useState, useEffect, useCallback } from "react";
import { ClipboardCheck } from "lucide-react";
import { officeApprovalApi, type OfficeApprovalSummary, type OfficeApprovalStatusValue } from "@/lib/api/office-approval";
import { OfficeApprovalDetailDrawer } from "@/components/office-approval/OfficeApprovalDetailDrawer";
import { STATUS_LABELS, STATUS_OPTIONS } from "@/components/office-approval/status-labels";
import { relativeTime } from "@/lib/relative-time";

export default function OfficeApprovalsPage() {
  const [items, setItems] = useState<OfficeApprovalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OfficeApprovalStatusValue | "">("PENDING_APPROVAL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await officeApprovalApi.getInbox(statusFilter || undefined);
      setItems(rows);
    } catch (e: any) {
      setError(e?.message || "Onay talepleri yüklenemedi");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Onay Kutusu</h1>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >
          Yenile
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OfficeApprovalStatusValue | "")}
          aria-label="Durum filtresi"
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || "ALL"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Yükleniyor...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Bekleyen onay yok</div>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className="w-full text-left p-4 hover:bg-gray-50 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{STATUS_LABELS[item.status] ?? item.status}</span>
                    <span className="text-xs text-gray-500">{item.targetType}</span>
                  </div>
                  <div className="font-medium mt-1 truncate">{item.actionCode}</div>
                  <div className="text-sm text-gray-500 truncate">
                    Hedef: {item.targetRef} · Talep eden: {item.requesterUserId}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    <span title={new Date(item.createdAt).toLocaleString("tr-TR")}>
                      Oluşturuldu {relativeTime(item.createdAt)}
                    </span>
                    {item.decidedAt && (
                      <span className="ml-2" title={new Date(item.decidedAt).toLocaleString("tr-TR")}>
                        · Karar {relativeTime(item.decidedAt)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <OfficeApprovalDetailDrawer requestId={selectedId} onClose={() => setSelectedId(null)} onDecided={fetchData} />
    </div>
  );
}
