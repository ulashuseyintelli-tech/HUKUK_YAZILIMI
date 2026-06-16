"use client";

import { useEffect, useState } from "react";
import { History, ShieldAlert, User, Clock } from "lucide-react";
import { api, HacizAuditLog } from "@/lib/api";
import { riskLabel, riskBadge, reasonLabel, targetLabel } from "@/lib/haciz-audit-format";

/**
 * PR-D4e-7: Dosya "İşlem Geçmişi" sekmesi — haciz gönderim KARAR-ANI audit snapshot'ları (READ-ONLY).
 * Yeni audit yazımı/değişikliği YOK; yalnız görünürlük. İlk sürüm sadece HACIZ_REQUEST_SUBMITTED.
 */

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CaseHistoryPanel({ caseId }: { caseId: string }) {
  const [logs, setLogs] = useState<HacizAuditLog[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getCaseHacizAudits(caseId)
      .then((r) => {
        if (alive) setLogs(r.logs || []);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [caseId]);

  if (error) {
    return <div className="text-sm text-gray-500 p-4">İşlem geçmişi yüklenemedi.</div>;
  }
  if (logs === null) {
    return <div className="text-sm text-gray-400 p-4">Yükleniyor…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-800">Haciz Gönderim Geçmişi</h3>
      </div>
      <p className="text-xs text-gray-500">
        Haciz talebi gönderildiği anda backend'in hesapladığı saha istihbaratı riski (karar-anı izi). Salt görüntü.
      </p>

      {logs.length === 0 ? (
        <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg p-6 text-center">
          Bu dosyada henüz haciz gönderimi kaydı yok.
        </div>
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => {
            const m = log.metadata || {};
            const overall = m.overallLevel || "YOK";
            return (
              <li key={log.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    <ShieldAlert className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-800">
                      {targetLabel(m.targetType)} haczi gönderildi
                    </span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${riskBadge(overall)}`}>
                      Risk: {riskLabel(overall)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {log.userName || log.userId || "Sistem"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(log.createdAt)}
                    </span>
                  </div>
                </div>

                {m.debtors && m.debtors.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {m.debtors.map((d) => (
                      <li key={d.debtorId} className="border-l-2 border-gray-200 pl-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm text-gray-700">{d.name}</span>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${riskBadge(d.level)}`}>
                            {riskLabel(d.level)}
                          </span>
                        </div>
                        <ul className="space-y-0.5">
                          {d.reasonIds.map((rid, i) => (
                            <li key={i} className="text-xs text-gray-600">
                              • {reasonLabel(rid)}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
