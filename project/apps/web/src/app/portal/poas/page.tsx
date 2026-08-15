"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FileCheck, Loader2, CheckCircle, AlertTriangle, Clock, X, RefreshCw } from "lucide-react";
// CLIENT-REMEDIATION-CLOSEOUT-R01: module-level `NEXT_PUBLIC_API_URL || "http://localhost:8080"
// fallback'i kaldırıldı — production'da env eksikse sessizce kullanıcının localhost'una
// düşüyordu. Base URL artık canonical config katmanından gelir (dev fallback yalnız orada,
// production'da fail-fast). CLIENT-CONFIG-P01 ile aynı sözleşme.
import { portalApiUrl } from "@/lib/config/portal-api-url";
import { toActionErrorMessage } from "@/lib/action-error";


export default function PortalPoasPage() {
  const [poas, setPoas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // WSMR-A4-AB-7: vekaletname varlığı/yokluğu hukuki belge durumudur. Eskiden okuma
  // hatası yalnız `console.error` ile YUTULUYORDU ve "Henüz vekalet kaydı bulunmuyor"
  // (gerçekten-boş) ile AYNI ekrana düşüyordu — kullanıcı "vekalet yok" ile "vekalet
  // listesi okunamadı" arasındaki farkı GÖREMİYORDU. Ayrıca `res.ok` hiç kontrol
  // edilmiyordu: bir hata gövdesi dizi değilse `poas.map` PATLARDI (gizli çökme).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const loadTokenRef = useRef(0);
  const loadInFlightRef = useRef(false);

  const loadPoas = useCallback(async () => {
    if (loadInFlightRef.current) return; // cift retry -> tek aktif istek
    loadInFlightRef.current = true;
    const requestToken = ++loadTokenRef.current;
    try {
      const authToken = localStorage.getItem("portal_token");
      const res = await fetch(portalApiUrl("/api/portal/poas"), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!isMountedRef.current || requestToken !== loadTokenRef.current) return; // bayat/unmount
      if (!res.ok) throw new Error(`POAS_HTTP_${res.status}`);
      const data: unknown = await res.json();
      if (!isMountedRef.current || requestToken !== loadTokenRef.current) return;
      if (!Array.isArray(data)) throw new Error("MALFORMED_POA_LIST_RESPONSE");
      // Önceki başarıyla yüklenmiş liste, bu okuma başarılı olana kadar KORUNUR
      // (aşağıdaki catch veri SİLMEZ) — yalnız başarılı gövde geldiğinde değişir.
      setPoas(data);
      setLoadError(null);
    } catch (e) {
      if (!isMountedRef.current || requestToken !== loadTokenRef.current) return;
      // Önceki başarıyla yüklenmiş `poas` SİLİNMEZ — yalnız bayat olduğu üst
      // bantta görünür olur; retry YALNIZ bu okumayı tekrar dener (mutation yok).
      setLoadError(toActionErrorMessage(e, "Vekaletler yüklenemedi."));
    } finally {
      if (requestToken === loadTokenRef.current) {
        loadInFlightRef.current = false;
        if (isMountedRef.current) setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadPoas();
  }, [loadPoas]);

  const retryLoadData = useCallback(async () => {
    setRetrying(true);
    try {
      await loadPoas();
    } finally {
      if (isMountedRef.current) setRetrying(false);
    }
  }, [loadPoas]);

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

      {loadError && (
        // WSMR-A4-AB-7: okuma hatası "Henüz vekalet kaydı bulunmuyor" veya sessizce
        // bayat veriyle KARIŞMAZ. Retry YALNIZ bu okumayı (loadPoas) tekrar dener.
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{loadError}{poas.length > 0 ? " Gösterilen liste bayat olabilir." : ""}</span>
          <button
            type="button"
            onClick={retryLoadData}
            disabled={retrying}
            className="shrink-0 flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-red-800 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Deneniyor…" : "Tekrar dene"}
          </button>
        </div>
      )}

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
        {poas.length === 0 && loadError ? (
          // Okuma hatası "gerçekten boş" iddiası ÜRETMEZ — üst bantta zaten görünür
          // hata + retry var, burada nötr bir yer tutucuya düşülür.
          <div className="bg-white rounded-lg border p-8 text-center text-gray-400 text-sm">
            —
          </div>
        ) : poas.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            <FileCheck className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>Henüz vekalet kaydı bulunmuyor</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
