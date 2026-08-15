"use client";

// CLIENT-POL-F-R01: müvekkile dönük CROSS-CASE FİNANSAL AGGREGATE gösterimi kaldırıldı.
// Charter §22.10 "CLIENT-FACING FINANCIAL AGGREGATES: NOT AUTHORIZED UNDER POL-F OPTION B —
// portala aggregate olarak sunulamaz: claimed amount total · collected amount total ...
// `principalAmount` canonical aggregate source DEĞİLDİR" ve §22.11 "BP-06 bu alanları aggregate
// total'a DÖNÜŞTÜREMEZ ... FINANCIAL AGGREGATE VISIBILITY: NOT AUTHORIZED" hükümleri gereği:
//  - "Toplam Alacak" (cross-case Σ principalAmount) kaldırıldı,
//  - "Tahsil Edilen" (Σ collections; TRACK-B-U00B'de API'den kaldırılan alana bağlı ölü kod)
//    türetmesiyle birlikte tamamen kaldırıldı.
// Yerine BAŞKA finansal aggregate/placeholder KONULMADI (§22.5 financial totals yasağı).
// KORUNAN: tekil case bazında `principalAmount` gösterimi ("Son Dosyalar" satırları) — §23.9
// "claimed amount partial case-level context olarak PRESENTED OLABİLİR" (single-object).
// KORUNAN: "Toplam Dosya"/"Aktif Dosya" — §23.6 "pagination/kayıt-sayısı business aggregate
// DEĞİLDİR" + §22.4 non-financial operational count.
// Emsal: TRACK-B-U00 (PR #1582) aynı deseni case-detail'de uygulamıştı (kart kaldır, grid'i
// kalan kart sayısına indir, boş placeholder EKLEME).

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Clock, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
// CLIENT-REMEDIATION-CLOSEOUT-R01: module-level `NEXT_PUBLIC_API_URL || "http://localhost:8080"
// fallback'i kaldırıldı — production'da env eksikse sessizce kullanıcının localhost'una
// düşüyordu. Base URL artık canonical config katmanından gelir (dev fallback yalnız orada,
// production'da fail-fast). CLIENT-CONFIG-P01 ile aynı sözleşme.
import { portalApiUrl } from "@/lib/config/portal-api-url";
import { toActionErrorMessage } from "@/lib/action-error";


export default function PortalHomePage() {
  const router = useRouter();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  // WSMR-A4-AB-10: bu sayfa portal girişinin varsayılan iniş noktasıdır ("Toplam Dosya"/
  // "Aktif Dosya" sayaçları ve "Son Dosyalar" önizlemesi hep bu okumadan beslenir). Eskiden
  // HER okuma hatası (network/5xx/401/malformed) yalnız `console.error` ile YUTULUYORDU ve
  // `setCases(data || [])` ile SIFIR sayaç + "Henüz dosya bulunmuyor" — GERÇEKTEN dosyasız
  // bir müvekkille AYNI görünümü üretiyordu.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  // 401 -> login'e yönlendirme başlatıldıktan sonra, gerçek navigasyon tamamlanana kadar
  // geçen karede bile sıfır sayaç/"Henüz dosya bulunmuyor" GÖRÜNMEMELİ.
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
        // Mevcut auth/session akışı (layout.tsx logout ile AYNI) — geçersiz/süresi dolmuş
        // oturum sıfır sayaç/"dosyanız yok" GİBİ GÖSTERİLMEZ; login'e yönlendirilir.
        localStorage.removeItem("portal_token");
        setRedirectingToLogin(true);
        router.push("/portal/login");
        return;
      }
      // NOT: `getClientCases` (backend) — 403/404 SÖZLEŞMEDE YOK (A4-AB-9 ile AYNI endpoint,
      // apps/api/src/modules/portal/portal.service.ts#getClientCases). Beklenmeyen bir 403/404
      // "boş liste" DEĞİL, güvenli genel ERROR sayılır.
      if (!res.ok) throw new Error(`PORTAL_HOME_CASES_HTTP_${res.status}`);

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
      setLoadError(toActionErrorMessage(e, "Dosya özeti yüklenemedi."));
    } finally {
      if (requestToken === loadTokenRef.current) {
        loadInFlightRef.current = false;
        if (isMountedRef.current) setLoading(false);
      }
    }
  }, [router]);

  useEffect(() => {
    const userData = localStorage.getItem("portal_user");
    if (userData) setUser(JSON.parse(userData));
  }, []);

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

  const activeCases = cases.filter(c => c.caseStatus === "DERDEST" || c.caseStatus === "ISLEMDE").length;

  if (loading || redirectingToLogin) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!cases.length && loadError) {
    // ERROR — sıfır sayaç/"Henüz dosya bulunmuyor" görüntüsü ÜRETİLMEZ; ayrı, görünür,
    // retry'li durum.
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hoş Geldiniz, {user?.clientName}</h1>
          <p className="text-gray-500">Dosyalarınızın özet durumu</p>
        </div>
        <button
          type="button"
          onClick={retryLoad}
          disabled={retrying}
          title="Yenile"
          className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <RefreshCw className={`h-4 w-4 text-gray-500 ${retrying ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loadError && (
        // WSMR-A4-AB-10: bu bant YALNIZ cases ZATEN varken bir SONRAKİ okuma (yenile)
        // başarısız olduğunda görünür — aşağıdaki özet/sayaçlar BAYAT olabilir ama SİLİNMEDİ.
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{loadError} Gösterilen özet bayat olabilir.</span>
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

      {/* Stats — CLIENT-POL-F-R01: "Toplam Alacak" (cross-case Σ principalAmount) ve
          "Tahsil Edilen" (Σ collections, ölü referans) kartları §22.10/§22.11 gereği
          kaldırıldı. Kalan 2 non-financial kart için grid 4→2 koloona indirildi;
          boş placeholder veya ikame finansal değer EKLENMEDİ. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Toplam Dosya</p>
              <p className="text-2xl font-bold">{cases.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Clock className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Aktif Dosya</p>
              <p className="text-2xl font-bold">{activeCases}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Cases */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Son Dosyalar</h2>
          <Link href="/portal/cases" className="text-sm text-blue-600 hover:underline">
            Tümünü Gör →
          </Link>
        </div>
        <div className="divide-y">
          {cases.slice(0, 5).map((c) => (
            <Link key={c.id} href={`/portal/cases/${c.id}`} className="block p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{c.fileNumber}</p>
                  <p className="text-sm text-gray-500">
                    {c.debtors?.map((d: any) => d.debtor?.name).join(", ") || "Borçlu bilgisi yok"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{Number(c.principalAmount || 0).toLocaleString("tr-TR")} ₺</p>
                  <p className="text-xs text-gray-500">{new Date(c.caseDate).toLocaleDateString("tr-TR")}</p>
                </div>
              </div>
            </Link>
          ))}
          {cases.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              Henüz dosya bulunmuyor
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
