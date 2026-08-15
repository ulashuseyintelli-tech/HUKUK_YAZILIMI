"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, User, Loader2, Clock, StickyNote, RefreshCw, AlertTriangle } from "lucide-react";
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

const stageLabels: Record<string, string> = {
  INITIAL: "Başlangıç",
  PAYMENT_ORDER: "Ödeme Emri",
  WAITING_RESPONSE: "Yanıt Bekleniyor",
  OBJECTION: "İtiraz",
  SEIZURE: "Haciz",
  SALE: "Satış",
  COMPLETED: "Tamamlandı",
};

// CLIENT-P2-U03-TRACK-A-I01: DebtorRole canonical 12 değer (schema.prisma) — exhaustive.
// Beklenmeyen/gelecekteki bir değer ham enum token'ı göstermeden nötr fallback'e düşer.
const debtorRoleLabels: Record<string, string> = {
  ASIL_BORCLU: "Asıl Borçlu",
  MUSETEREK_BORCLU: "Müşterek Borçlu",
  ADI_KEFIL: "Adi Kefil",
  MUTESELSIL_KEFIL: "Müteselsil Kefil",
  AVAL: "Aval Veren",
  CIRANTA: "Ciranta",
  LEHDAR: "Lehdar",
  KESIDECI: "Keşideci",
  MUHATAP: "Muhatap",
  MIRASCI: "Mirasçı",
  TASFIYE_MEMURU: "Tasfiye Memuru",
  IFLAS_MASASI: "İflas Masası",
};
const DEBTOR_ROLE_FALLBACK_LABEL = "Hukuki Taraf";

// CLIENT-P2-U03-TRACK-A-I02: API zaten ham AssetQueryStatus enum'unu curated 5-duruma
// indirger (asset-query-projection.ts); web yalnız bu curated durumu Türkçe'ye çevirir,
// ham Prisma enum değerini hiç görmez/yorumlamaz.
const assetQueryStateLabels: Record<string, string> = {
  NOT_QUERIED: "Sorgu Yapılmadı",
  FOUND: "Bulgu Var",
  NOT_FOUND: "Bulgu Yok",
  RESULT_PENDING: "Sonuç Bekleniyor",
  RESULT_UNAVAILABLE: "Sonuç Şu An Belirlenemedi",
};
const ASSET_QUERY_STATE_FALLBACK_LABEL = assetQueryStateLabels.RESULT_UNAVAILABLE;
const ASSET_QUERY_CATEGORIES: { key: "vehicle" | "realEstate" | "bank" | "sgkWage"; label: string }[] = [
  { key: "vehicle", label: "Araç" },
  { key: "realEstate", label: "Gayrimenkul" },
  { key: "bank", label: "Banka" },
  { key: "sgkWage", label: "SGK Maaşı" },
];

// CLIENT-P2-U03-TRACK-A-I03: Due.interestType canonical 6 değer — Track-A-I03'ün kendi
// runtime-writer envanterinden doğrulandı (schema.prisma:1589'daki yorum [YASAL/TICARI/
// AVANS/TEMERRUT/OZEL] GÜNCEL DEĞİL — gerçek DTO-doğrulanmış küme case.dto.ts InterestType
// enum'udur). Beklenmeyen/gelecekteki bir değer ham token göstermeden nötr fallback'e düşer.
const interestTypeLabels: Record<string, string> = {
  YASAL: "Yasal Faiz",
  SABIT: "Sabit Faiz",
  AVANS: "Avans Faizi",
  TEMERRUT: "Temerrüt Faizi",
  YOKSUN: "Yoksun Kalınan Faiz",
  TICARI: "Ticari Faiz",
};
const INTEREST_TYPE_FALLBACK_LABEL = "Faiz Türü Belirtilmemiş";

function formatTrDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("tr-TR");
}

export default function PortalCaseDetailPage() {
  const params = useParams();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // WSMR-A4-AB-8: `getCaseDetail` (backend) tenant+client sahipliğini TEK
  // `NotFoundException` (404) ile birleştirir (portal.service.ts) — "dosya yok" ile
  // "dosya var ama senin değil" AYRIMI backend'de zaten YOK; UI ayrıca bir ayrım
  // ÜRETMEZ/sızdırmaz. `notFound` bu doğrulanmış 404 için; `loadError` GERÇEK (transient)
  // okuma hataları (network/5xx/malformed) için — ikisi AYNI ekrana düşmez, "dosya yok"
  // görüntüsü yalnız onaylı 404'te üretilir.
  const [notFound, setNotFound] = useState(false);
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
  const prevIdRef = useRef<string | null>(null);

  const loadCase = useCallback(async () => {
    if (loadInFlightRef.current) return; // cift retry -> tek aktif istek
    loadInFlightRef.current = true;
    const requestToken = ++loadTokenRef.current;
    try {
      const authToken = localStorage.getItem("portal_token");
      const res = await fetch(portalApiUrl(`/api/portal/cases/${caseId}`), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!isMountedRef.current || requestToken !== loadTokenRef.current) return; // bayat/unmount

      if (res.status === 404) {
        setNotFound(true);
        setCaseData(null);
        setLoadError(null);
        return;
      }
      if (!res.ok) throw new Error(`CASE_HTTP_${res.status}`);

      const data: unknown = await res.json();
      if (!isMountedRef.current || requestToken !== loadTokenRef.current) return;
      // NOT: `id` burada ZORUNLU TUTULMAZ — mevcut alan-görünürlük sözleşmesi (§28.4)
      // `id`/`description`/`lifecycleEvents` gibi alanların response'tan tamamen
      // ÇIKARILMASINA izin verir (regresyon testi [6]); yalnız gerçekten ANLAMSIZ
      // şekiller (null/dizi/primitif) MALFORMED sayılır.
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("MALFORMED_CASE_RESPONSE");
      }
      // Önceki başarıyla yüklenmiş veri, bu okuma başarılı olana kadar KORUNUR.
      setCaseData(data);
      setNotFound(false);
      setLoadError(null);
    } catch (e) {
      if (!isMountedRef.current || requestToken !== loadTokenRef.current) return;
      // caseData BİLEREK dokunulmaz — önceki başarıyla yüklenmiş veri (varsa) SİLİNMEZ;
      // yalnız bayat olduğu bantta görünür olur. Retry YALNIZ bu okumayı tekrar dener.
      setLoadError(toActionErrorMessage(e, "Dosya yüklenemedi."));
    } finally {
      if (requestToken === loadTokenRef.current) {
        loadInFlightRef.current = false;
        if (isMountedRef.current) setLoading(false);
      }
    }
  }, [caseId]);

  useEffect(() => {
    if (prevIdRef.current !== caseId) {
      // Farklı bir dosyaya geçiliyor — ÖNCEKİ dosyanın verisi YENİ dosyanın başlığı
      // altında YANLIŞLIKLA görünmez (farklı hukuki dosya = farklı veri, karıştırılmaz).
      prevIdRef.current = caseId;
      setCaseData(null);
      setNotFound(false);
      setLoadError(null);
      setLoading(true);
      // ÖNCEKİ (farklı) caseId'nin hâlâ süren isteği bu YENİ okumayı ENGELLEMEMELİ —
      // token kontrolü zaten o eski isteğin GEÇ gelen yanıtını uygulanmaktan alıkoyar.
      loadInFlightRef.current = false;
    }
    loadCase();
  }, [caseId, loadCase]);

  const retryLoad = useCallback(async () => {
    setRetrying(true);
    try {
      await loadCase();
    } finally {
      if (isMountedRef.current) setRetrying(false);
    }
  }, [loadCase]);

  if (loading && !caseData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (notFound) {
    // Onaylı 404 — backend'in "yok"/"senin değil" birleşik sözleşmesiyle tutarlı, güvenli
    // ortak mesaj. Transient değildir; retry SUNULMAZ (bkz. yukarıdaki yorum).
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Dosya bulunamadı</p>
        <Link href="/portal/cases" className="text-blue-600 hover:underline mt-2 inline-block">
          Dosyalara Dön
        </Link>
      </div>
    );
  }

  if (!caseData && loadError) {
    // ERROR — "dosya yok" görüntüsü ÜRETİLMEZ (eskiden notFound'la AYNI "!caseData"
    // dalına düşüp confirmed-absence gibi görünüyordu). Görünür + retry'li ayrı durum.
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

  if (!caseData) {
    // Teorik olarak ulaşılmaz (loading/notFound/error yukarıda kapsandı) — savunma amaçlı.
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/portal/cases" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">{caseData.fileNumber}</h1>
          <p className="text-sm text-gray-500">
            {caseData.executionFileNumber && `İcra No: ${caseData.executionFileNumber}`}
          </p>
        </div>
        <button
          type="button"
          onClick={retryLoad}
          disabled={retrying}
          title="Yenile"
          className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-4 w-4 text-gray-500 ${retrying ? "animate-spin" : ""}`} />
        </button>
        <span className={`ml-auto px-3 py-1 rounded-full text-sm ${
          caseData.caseStatus === "DERDEST" || caseData.caseStatus === "ISLEMDE" 
            ? "bg-green-100 text-green-700" 
            : "bg-gray-100 text-gray-700"
        }`}>
          {statusLabels[caseData.caseStatus] || caseData.caseStatus}
        </span>
      </div>

      {loadError && (
        // WSMR-A4-AB-8: bu bant YALNIZ caseData ZATEN varken bir SONRAKİ okuma (yenile/
        // caseId aynı kalan retry) başarısız olduğunda görünür — aşağıdaki veri BAYAT
        // olabilir ama SİLİNMEDİ. Retry YALNIZ loadCase'i tekrar dener, mutation YOK.
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{loadError} Gösterilen bilgiler bayat olabilir.</span>
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

      {/* Müvekkil Notu — yalnız değer varsa render edilir, dahiliNot ile birleştirilmez/karıştırılmaz */}
      {caseData.muvekkilNotu && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 className="font-semibold text-blue-900 flex items-center gap-2 mb-2">
            <StickyNote className="h-4 w-4" /> Müvekkil Notu
          </h2>
          <p className="text-sm text-blue-800 whitespace-pre-wrap">{caseData.muvekkilNotu}</p>
        </div>
      )}

      {/* Stats — CLIENT-P2-U03-TRACK-B-U00: "Tahsil Edilen"/"Tahsilat Oranı" kaldırıldı
          (§33.4 Financial Disclosure Gate ile çelişen, onaysız ham tahsilat türetmesiydi).
          CLIENT-POL-F-R01: "Toplam Alacak" (Σ Due.amount) da kaldırıldı — §34.3 Track A'yı
          "yalnız SAKLI DEĞERLERİN AS-IS gösterimi (hiçbir hesaplama/türetme/formül olmadan)"
          ile sınırlar; `reduce` ile üretilip "Toplam Alacak" etiketlenen değer tam olarak
          §34.3/§34.4'ün Track B'ye devrettiği "hesap dökümü/toplam"dır. §22.11 ayrıca
          single-object finansal alanların aggregate total'a DÖNÜŞTÜRÜLMESİNİ yasaklar.
          Kalan tek non-financial kart için grid 2→1 koloona indirildi; ikame finansal değer
          veya boş placeholder EKLENMEDİ. Tekil Due kalemleri (aşağıdaki "Alacak Kalemleri")
          AS-IS gösterimle KORUNDU. */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Aşama</p>
              <p className="text-xl font-bold">{stageLabels[caseData.workflowStage] || "-"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Borçlular */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="font-semibold flex items-center gap-2">
              <User className="h-4 w-4" /> Borçlular
            </h2>
          </div>
          <div className="p-4">
            {caseData.debtors?.length > 0 ? (
              <div className="space-y-3">
                {caseData.debtors.map((d: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{d.debtor?.name}</p>
                      <p className="text-sm text-gray-500">{d.debtor?.type === "PERSON" ? "Şahıs" : "Kurum"}</p>
                      {d.role && (
                        <p className="text-sm text-gray-500">{debtorRoleLabels[d.role] || DEBTOR_ROLE_FALLBACK_LABEL}</p>
                      )}
                      {(d.debtorLawyerName || d.debtorLawyerBarNo) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {d.debtorLawyerName && d.debtorLawyerBarNo
                            ? `Av. ${d.debtorLawyerName} (Baro No: ${d.debtorLawyerBarNo})`
                            : d.debtorLawyerName
                              ? `Av. ${d.debtorLawyerName}`
                              : `Baro No: ${d.debtorLawyerBarNo}`}
                        </p>
                      )}
                      {d.assetQuery && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs font-semibold text-gray-600 mb-1">Malvarlığı Sorguları</p>
                          <div className="flex flex-wrap gap-1.5">
                            {ASSET_QUERY_CATEGORIES.map(({ key, label }) => (
                              <span key={key} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                {`${label}: ${assetQueryStateLabels[d.assetQuery[key]] || ASSET_QUERY_STATE_FALLBACK_LABEL}`}
                              </span>
                            ))}
                          </div>
                          {d.assetQuery.lastQueryAt && (
                            <p className="text-xs text-gray-400 mt-1">
                              Son Malvarlığı Sorgu Güncellemesi: {new Date(d.assetQuery.lastQueryAt).toLocaleDateString("tr-TR")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Borçlu bilgisi yok</p>
            )}
          </div>
        </div>

        {/* Alacak Kalemleri */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" /> Alacak Kalemleri
            </h2>
          </div>
          <div className="p-4">
            {caseData.dues?.length > 0 ? (
              <div className="space-y-2">
                {caseData.dues.map((d: any) => (
                  <div key={d.id} className="p-2 bg-gray-50 rounded">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{d.type}</span>
                      <span className="font-medium">{Number(d.amount).toLocaleString("tr-TR")} ₺</span>
                    </div>

                    {d.isPrimary && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                        Ana Alacak Kalemi
                      </span>
                    )}

                    {d.sourceDocumentNo && (
                      <p className="text-xs text-gray-500 mt-1">{`Dayanak Belge: ${d.sourceDocumentNo}`}</p>
                    )}

                    {d.accruesInterest === true ? (
                      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                        {d.interestType && (
                          <p>{`Faiz Türü: ${interestTypeLabels[d.interestType] || INTEREST_TYPE_FALLBACK_LABEL}`}</p>
                        )}
                        {d.interestRate != null && <p>{`Faiz Oranı: %${d.interestRate}`}</p>}
                        {d.interestStartDate && <p>{`Faiz Başlangıç Tarihi: ${formatTrDate(d.interestStartDate)}`}</p>}
                        {d.interestEndDate && <p>{`Faiz Bitiş Tarihi: ${formatTrDate(d.interestEndDate)}`}</p>}
                      </div>
                    ) : d.accruesInterest === false ? (
                      <p className="text-xs text-gray-400 mt-1">Faiz Uygulanmıyor</p>
                    ) : null}

                    {(d.hasKdv || d.hasBsmv || d.hasKkdf) && (
                      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                        {d.hasKdv && (
                          <p>{d.kdvRate != null ? `KDV Dahil (%${d.kdvRate})` : "KDV Dahil"}</p>
                        )}
                        {d.hasBsmv && <p>BSMV Uygulanıyor</p>}
                        {d.hasKkdf && <p>KKDF Uygulanıyor</p>}
                      </div>
                    )}

                    {(d.requiresFinalization || d.isFinalized || d.finalizationDate) && (
                      <p className="text-xs text-gray-500 mt-1">
                        {d.isFinalized === false && d.finalizationDate
                          ? "Kesinleşme Bilgisi Kontrol Ediliyor"
                          : d.isFinalized
                            ? `Kesinleşti${d.finalizationDate ? ` (${formatTrDate(d.finalizationDate)})` : ""}`
                            : d.requiresFinalization
                              ? "Kesinleşme Gerekiyor"
                              : null}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Alacak kalemi yok</p>
            )}
          </div>
        </div>
      </div>

      {/* CLIENT-P2-U03-TRACK-B-U00: "Tahsilatlar" ham tahsilat listesi (date/type/amount)
          KALDIRILDI — §33.4 Financial Disclosure Gate ile çelişen, onaysız/bildirimsiz ham
          tahsilat ifşasıydı (owner ruling, 2026-07-24). Yerine boş placeholder EKLENMEDİ;
          gelecekte yalnız ayrı yetkilendirilmiş Track B (financialDisclosures) contract'ı
          bu alanı doldurabilir. */}
    </div>
  );
}
