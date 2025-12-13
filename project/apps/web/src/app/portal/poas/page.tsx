"use client";

import { useState, useEffect } from "react";
import { FileCheck, Loader2, CheckCircle, AlertTriangle, Clock, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function PortalPoasPage() {
  const [poas, setPoas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPoas();
  }, []);

  const loadPoas = async () => {
    try {
      const token = localStorage.getItem("portal_token");
      const res = await fetch(`${API_URL}/api/portal/poas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPoas(data || []);
    } catch (e) {
      console.error("Vekaletler yüklenemedi:", e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (poa: any) => {
    if (poa.status === "EXPIRED") {
      return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs flex items-center gap-1"><X className="h-3 w-3" /> Süresi Dolmuş</span>;
    }
    if (poa.status === "REVOKED") {
      return <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">İptal Edilmiş</span>;
    }
    if (poa.isLimited && poa.validUntil) {
      const daysLeft = Math.ceil((new Date(poa.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 30) {
        return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {daysLeft} gün kaldı</span>;
      }
      return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(poa.validUntil).toLocaleDateString("tr-TR")}&apos;e kadar</span>;
    }
    return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Süresiz</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Vekaletlerim</h1>

      <div className="grid gap-4">
        {poas.map((poa) => (
          <div key={poa.id} className={`bg-white rounded-lg border p-4 ${poa.status === "EXPIRED" ? "border-red-200 bg-red-50" : ""}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <FileCheck className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusBadge(poa)}
                  </div>
                  <p className="font-medium">Yevmiye No: {poa.journalNo || poa.poaNumber || "-"}</p>
                  <p className="text-sm text-gray-500">
                    {poa.notaryName} {poa.notaryCity && `(${poa.notaryCity})`}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Düzenleme: {poa.dateIssued ? new Date(poa.dateIssued).toLocaleDateString("tr-TR") : "-"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Avukatlar</p>
                <p className="text-sm font-medium">
                  {poa.lawyers?.map((l: any) => `Av. ${l.lawyer?.name} ${l.lawyer?.surname}`).join(", ") || "-"}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t">
              {poa.canCollect && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Ahzu Kabza</span>}
              {poa.canWaive && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Feragat</span>}
              {poa.canSettle && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Sulh</span>}
              {poa.canRelease && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">İbra</span>}
            </div>
          </div>
        ))}
        {poas.length === 0 && (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            <FileCheck className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>Henüz vekalet kaydı bulunmuyor</p>
          </div>
        )}
      </div>
    </div>
  );
}
