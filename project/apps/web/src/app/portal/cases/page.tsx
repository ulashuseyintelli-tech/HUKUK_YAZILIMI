"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Search, Loader2, ChevronRight, RefreshCw, AlertTriangle } from "lucide-react";
// CLIENT-REMEDIATION-CLOSEOUT-R01: module-level `NEXT_PUBLIC_API_URL || "http://localhost:8080"
// fallback'i kaldırıldı — production'da env eksikse sessizce kullanıcının localhost'una
// düşüyordu. Base URL artık canonical config katmanından gelir (dev fallback yalnız orada,
// production'da fail-fast). CLIENT-CONFIG-P01 ile aynı sözleşme.
import { portalApiUrl } from "@/lib/config/portal-api-url";
import { toActionErrorMessage } from "@/lib/action-error";


const statusLabels: Record<string, string> = {
  DERDEST: "Derdest",
  ISLEMDE: "İşlemde",
  DERKENAR: "Derkenar",
  KAPALI: "Kapalı",
  ARSIV: "Arşiv",
};

const statusColors: Record<string, string> = {
  DERDEST: "bg-blue-100 text-blue-700",
  ISLEMDE: "bg-green-100 text-green-700",
  DERKENAR: "bg-amber-100 text-amber-700",
  KAPALI: "bg-gray-100 text-gray-700",
  ARSIV: "bg-gray-100 text-gray-500",
};

export default function PortalCasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // WSMR-A4-AB-9: müvekkil portalındaki dosya listesi birincil hukuk dosyası görünümüdür.
  // Eskiden HER okuma hatası (network/5xx/401/malformed) yalnız `console.error` ile
  // YUTULUYORDU ve `setCases(data || [])` ile "hiç dosyanız yok" ile AYNI ekrana
  // düşüyordu — kullanıcı gerçekten dosyasız mı yoksa okuma mı başarısız oldu
  // AYIRT EDEMİYORDU.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  // 401 -> login'e yonlendirme baslatildiktan sonra, gercek navigasyon tamamlanana kadar
  // GECEN karede bile "Henuz dosya bulunmuyor" GORUNMEMELI (owner: "bos listeye
  // cevrilmesin") — bu bayrak o araligi notr bir yukleme gorunumune sabitler.
  const [redirectingToLogin, setRedirectingToLogin] = useState(false);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const loadTokenRef = useRef(0);
  const loadInFlightRef = useRef(false);

  const loadCases = useCallback(async () => {
    if (loadInFlightRef.current) return; // cift retry -> tek aktif istek
    loadInFlightRef.current = true;
    const requestToken = ++loadTokenRef.current;
    try {
      const authToken = localStorage.getItem("portal_token");
      const res = await fetch(portalApiUrl("/api/portal/cases"), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!isMountedRef.current || requestToken !== loadTokenRef.current) return; // bayat/unmount

      if (res.status === 401) {
        // Mevcut auth/session akışı (bkz. layout.tsx logout: token temizle + login'e
        // yönlendir) ile AYNI — geçersiz/süresi dolmuş oturum "hiç dosyanız yok" GİBİ
        // GÖSTERİLMEZ; kullanıcı yeniden oturum açmaya yönlendirilir.
        localStorage.removeItem("portal_token");
        setRedirectingToLogin(true);
        router.push("/portal/login");
        return;
      }
      // NOT: `getClientCases` (backend) yalnız `findMany` — 403/404 SÖZLEŞMEDE YOK (bkz.
      // apps/api/src/modules/portal/portal.service.ts#getClientCases). Beklenmeyen bir
      // 403/404 gelirse "boş liste" DEĞİL, güvenli genel ERROR sayılır (aşağıdaki `!res.ok`).
      if (!res.ok) throw new Error(`CASES_HTTP_${res.status}`);

      const data: unknown = await res.json();
      if (!isMountedRef.current || requestToken !== loadTokenRef.current) return;
      if (!Array.isArray(data)) throw new Error("MALFORMED_CASE_LIST_RESPONSE");
      // Önceki başarıyla yüklenmiş liste, bu okuma başarılı olana kadar KORUNUR.
      setCases(data);
      setLoadError(null);
    } catch (e) {
      if (!isMountedRef.current || requestToken !== loadTokenRef.current) return;
      // cases BİLEREK dokunulmaz — önceki başarıyla yüklenmiş liste (varsa) SİLİNMEZ;
      // yalnız bayat olduğu bantta görünür olur. Retry YALNIZ bu okumayı tekrar dener.
      setLoadError(toActionErrorMessage(e, "Dosyalar yüklenemedi."));
    } finally {
      if (requestToken === loadTokenRef.current) {
        loadInFlightRef.current = false;
        if (isMountedRef.current) setLoading(false);
      }
    }
  }, [router]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const retryLoad = useCallback(async () => {
    setRetrying(true);
    try {
      await loadCases();
    } finally {
      if (isMountedRef.current) setRetrying(false);
    }
  }, [loadCases]);

  const filtered = cases.filter(c =>
    c.fileNumber?.toLowerCase().includes(search.toLowerCase()) ||
    c.debtors?.some((d: any) => d.debtor?.name?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading || redirectingToLogin) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!cases.length && loadError) {
    // ERROR — "hiç dosyanız yok" görüntüsü ÜRETİLMEZ; ayrı, görünür, retry'li durum.
    return (
      <div className="text-center py-12" role="alert">
        <AlertTriangle className="h-10 w-10 mx-auto text-red-400 mb-2" />
        <p className="text-red-700 font-medium">{loadError}</p>
        <button
          type="button"
          onClick={retryLoad}
          disabled={retrying}
          className="mt-3 inline-flex items-center gap-1 rounded bg-red-100 px-3 py-1.5 text-sm text-red-800 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
          {retrying ? "Deneniyor…" : "Tekrar dene"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">Dosyalarım</h1>
          <button
            type="button"
            onClick={retryLoad}
            disabled={retrying}
            title="Yenile"
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 text-gray-500 ${retrying ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Dosya no veya borçlu ara..."
            className="pl-9 pr-4 py-2 border rounded-lg text-sm w-64"
          />
        </div>
      </div>

      {loadError && (
        // WSMR-A4-AB-9: bu bant YALNIZ cases ZATEN varken bir SONRAKİ okuma (yenile/retry)
        // başarısız olduğunda görünür — aşağıdaki liste BAYAT olabilir ama SİLİNMEDİ.
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{loadError} Gösterilen liste bayat olabilir.</span>
          <button
            type="button"
            onClick={retryLoad}
            disabled={retrying}
            className="shrink-0 flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-red-800 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Deneniyor…" : "Tekrar dene"}
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Dosya No</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Borçlu</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Durum</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Alacak</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Tarih</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((c) => {
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{c.fileNumber}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.debtors?.map((d: any) => d.debtor?.name).join(", ") || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColors[c.caseStatus] || "bg-gray-100"}`}>
                      {statusLabels[c.caseStatus] || c.caseStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {Number(c.principalAmount || 0).toLocaleString("tr-TR")} ₺
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(c.caseDate).toLocaleDateString("tr-TR")}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/portal/cases/${c.id}`} className="text-blue-600 hover:text-blue-800">
                      <ChevronRight className="h-5 w-5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            {search ? "Sonuç bulunamadı" : "Henüz dosya bulunmuyor"}
          </div>
        )}
      </div>
    </div>
  );
}
