"use client";

import { useState, useEffect } from "react";
import { ActionError } from '@/components/ui/action-error';
import { toActionErrorMessage } from '@/lib/action-error';
import { runMutation, runRefreshOnly } from '@/lib/mutation-outcome';
import { useKeyedSubmitLock, useSubmitLock } from '@/lib/use-submit-lock';
import { FileReadError, readFileAsBase64 } from '@/lib/read-file-base64';
import {
  api,
  UyapStatus,
  UyapRequestLog,
  UyapCasePoaValidation,
  UyapDocumentType,
  HacizTargetType,
  PreHacizRiskLevel,
  DebtorListItemDTO,
} from "@/lib/api";

// PR-D4e-4: risk seviyesi → etiket + renk (yalnız seviye gösterilir, ham skor değil).
type PreHacizDebtorRisk = {
  debtorId: string;
  name: string;
  level: PreHacizRiskLevel;
  score: number;
  reasons: { id: string; message: string; severity: string }[];
};
const RISK_LEVEL_LABEL: Record<PreHacizRiskLevel, string> = { YUKSEK: "Yüksek", ORTA: "Orta", DUSUK: "Düşük", YOK: "Yok" };
const RISK_LEVEL_BADGE: Record<PreHacizRiskLevel, string> = {
  YUKSEK: "bg-red-100 text-red-800 border-red-300",
  ORTA: "bg-amber-100 text-amber-800 border-amber-300",
  DUSUK: "bg-yellow-50 text-yellow-700 border-yellow-200",
  YOK: "bg-gray-100 text-gray-600 border-gray-200",
};

interface UyapPanelProps {
  caseId: string;
  onDocumentSubmitted?: () => void;
}

export function UyapPanel({ caseId, onDocumentSubmitted }: UyapPanelProps) {
  const [status, setStatus] = useState<UyapStatus | null>(null);
  const [poaValidation, setPoaValidation] = useState<UyapCasePoaValidation | null>(null);
  const [history, setHistory] = useState<UyapRequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"status" | "document" | "haciz" | "history">("status");
  
  // Document form state
  const [documentType, setDocumentType] = useState<UyapDocumentType>("TAKIP_TALEBI");
  const [documentName, setDocumentName] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Haciz form state
  const [hacizType, setHacizType] = useState<HacizTargetType>("BANK");
  const [hacizAmount, setHacizAmount] = useState("");
  const [hacizDetails, setHacizDetails] = useState("");
  // PR-D4e-3c/D4e-4: haciz öncesi saha istihbaratı risk read-model (lazy fetch, blok yok).
  const [preHacizRisk, setPreHacizRisk] = useState<{ debtors: PreHacizDebtorRisk[]; overallLevel: PreHacizRiskLevel } | null>(null);
  // I15-D1-R1: CaseDebtor target-binding — dosyanın AKTİF borçlu listesi (kanonik
  // GET /debtors/case/:caseId, varsayılan includePassive=false — mevcut veri kaynağı,
  // yeni bir endpoint EKLENMEDİ). PASSIVE borçlu bu listede hiç görünmez, dolayısıyla
  // seçilemez.
  const [caseDebtors, setCaseDebtors] = useState<DebtorListItemDTO[]>([]);
  const [selectedCaseDebtorId, setSelectedCaseDebtorId] = useState<string | undefined>(undefined);
  const [hacizError, setHacizError] = useState<string | null>(null);
  // WSMR-A3f: borclu okuma hatasi icin ayri gorunur durum.
  const [debtorLoadError, setDebtorLoadError] = useState<string | null>(null);
  // WSMR-A3f: risk sorgusu hatasi "risk YOK" ile KARISTIRILMAZ.
  const [riskLoadError, setRiskLoadError] = useState<string | null>(null);
  // PR-2A1: okuma, evrak ve retry hatalari AYRI ve GORUNUR.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [refreshingStale, setRefreshingStale] = useState(false);
  const submitLock = useSubmitLock();
  const rowLock = useKeyedSubmitLock();
  const handleStaleRefresh = async () => {
    setRefreshingStale(true);
    const ok = await runRefreshOnly(() => loadData({ propagateError: true }));
    setRefreshingStale(false);
    if (ok) setStaleNotice(null);
  };

  useEffect(() => {
    void loadData();
    // caseId değişince önceki seçim KESİNLİKLE taşınmaz (yanlış dosyada yanlış borçlu riski).
    setSelectedCaseDebtorId(undefined);
    setHacizError(null);
    setDebtorLoadError(null);
    api
      .getCaseDebtors(caseId)
      .then((res) => setCaseDebtors(res.items || []))
      .catch((e) => {
        // WSMR-A3f: borclu listesi hatasi BOS LISTEYE cevriliyordu — icra
        // panelinde "bu dosyada borclu YOK" gibi okunuyordu. Artik hata gorunur.
        setCaseDebtors([]);
        setDebtorLoadError(toActionErrorMessage(e, 'Borçlu listesi alınamadı.'));
      });
  }, [caseId]);

  // Dosyada tam 1 aktif borçlu varsa otomatik seç; ancak request yine de bu seçimi
  // AÇIKÇA taşır (backend implicit fallback yapmaz — UI burada yalnız kolaylık sağlar).
  useEffect(() => {
    if (caseDebtors.length === 1) {
      setSelectedCaseDebtorId(caseDebtors[0].caseDebtorId);
    }
  }, [caseDebtors]);

  // Haciz sekmesi açılınca riski bir kez çek (lazy).
  // WSMR-A3f: hata artık SESSİZ DEĞİL. Eskiden `overallLevel: "YOK"` yazılıyordu:
  // risk sorgusu ÇÖKMÜŞKEN kullanıcıya "haciz öncesi risk YOK" deniyordu — icra
  // bağlamında yanlış-olumsuz risk beyanı. Artık risk state'i DOLDURULMAZ ve
  // hata görünür olur; "bilinmiyor" ile "yok" karışmaz.
  useEffect(() => {
    if (activeTab !== "haciz" || preHacizRisk !== null) return;
    api
      .getPreHacizIntelligence(caseId)
      .then((r) => setPreHacizRisk({ debtors: r.debtors || [], overallLevel: r.overallLevel || "YOK" }))
      .catch((e) => {
        setPreHacizRisk(null);
        setRiskLoadError(
          toActionErrorMessage(e, "Haciz öncesi risk bilgisi alınamadı; risk durumu BİLİNMİYOR."),
        );
      });
  }, [activeTab, caseId, preHacizRisk]);

  // PR-2A1 DEPENDENCY_FIXED: `console.error` tek başına handling değildir — panel
  // sessizce boş kalıyordu. Hata artık GÖRÜNÜR; mutation refresh'i olarak çağrıldığında
  // (`propagateError: true`) çağırana propagate edilir, aksi hâlde `runMutation`
  // tazeleme hatasını göremez ve SUCCESS_STALE hiç çalışmaz.
  const loadData = async (opts?: { propagateError?: boolean }): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const [statusRes, poaRes, historyRes] = await Promise.all([
        api.getUyapStatus(),
        api.validateUyapCasePoa(caseId),
        api.getUyapRequestHistory(caseId, 20),
      ]);
      setStatus(statusRes);
      setPoaValidation(poaRes);
      setHistory(historyRes);
    } catch (error) {
      setLoadError(toActionErrorMessage(error, 'UYAP verileri yüklenemedi.'));
      if (opts?.propagateError) throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentSubmit = async () => {
    if (!documentFile || !documentName) return;

    // PR-2A1: mutation eskiden `reader.onload` içindeydi; dış `try/catch` onu
    // YAKALAYAMIYORDU (geç çalışır). Hata hiçbir yerde görünmüyor, `finally` de reader
    // bitmeden çalıştığı için düğme anında yeniden etkinleşiyordu. Zincir artık tek bir
    // await akışında: okuma → mutation → refresh. Senkron kilit çift gönderimi keser.
    await submitLock.run(async () => {
      setSubmitting(true);
      setDocumentError(null);
      setStaleNotice(null);

      // `setSubmitting(false)` TEK bir `finally`'dedir; dallara dağıtılmaz. Beklenmeyen
      // bir exception veya ileride eklenecek erken dönüş loading'i kalıcı KİLİTLEYEMEZ.
      // Dallarda yalnız UI başarı/hata state'leri ayrışır.
      try {
        // (1) DOSYA OKUMA — API hatasından AYRI. Okuma başarısızsa mutation HİÇ BAŞLAMAZ.
        let base64: string;
        try {
          base64 = await readFileAsBase64(documentFile);
        } catch (readError) {
          if (!submitLock.isMounted()) return;
          setDocumentError(
            readError instanceof FileReadError
              ? `${readError.message} Evrak GÖNDERİLMEDİ.`
              : 'Dosya okunamadı. Evrak GÖNDERİLMEDİ.',
          );
          return;
        }

        // (2) API MUTATION + tazeleme — ayrı sonuçlar.
        const outcome = await runMutation({
          mutate: () =>
            api.submitUyapDocument({
              caseId,
              documentType,
              documentContent: base64,
              documentName,
            }),
          refresh: () => loadData({ propagateError: true }),
          failureMessage: 'Evrak gönderilemedi. Evrak UYAP’a İLETİLMEDİ, lütfen tekrar deneyin.',
          staleMessage: 'Evrak İLETİLDİ, ancak panel yenilenemedi.',
        });

        if (!submitLock.isMounted()) return;
        if (outcome.status === 'FAILED') {
          // Form KORUNUR: dosya ve ad silinmez, kullanıcı yeniden gönderebilir.
          setDocumentError(outcome.error.message);
          return;
        }
        // SUCCESS ve SUCCESS_STALE: gönderim KESİNLEŞTİ → aynı evrak yeniden gönderilemez.
        setDocumentName('');
        setDocumentFile(null);
        onDocumentSubmitted?.();
        if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
      } finally {
        if (submitLock.isMounted()) setSubmitting(false);
      }
    });
  };

  const handleHacizSubmit = async () => {
    // I15-D1-R1: caseDebtorId olmadan gönderim YAPILMAZ — backend authoritative
    // validation her koşulda çalışır, bu yalnız UX'tir (owner kural #6).
    if (!hacizAmount || !selectedCaseDebtorId) return;

    // PR-2A1: `disabled={submitting}` YALNIZ görsel korumadır — React state aynı tick
    // içinde flush olmaz, dolayısıyla aynı-tick çift giriş veya programatik çağrı için
    // concurrency garantisi VERMEZ. Gerçek kilit senkron `useKeyedSubmitLock`'tur.
    // Anahtar endpoint kapsamına göre dosya bazlıdır: `sendUyapHacizRequest` `caseId`
    // taşır, dolayısıyla farklı dosyaların haciz talepleri birbirini bloklamaz.
    await rowLock.run(`uyap:haciz:${caseId}`, async () => {
      setSubmitting(true);
      setHacizError(null);
      setStaleNotice(null);

      // Kilit ve loading TEK `finally` ile bırakılır; dallara dağıtılmaz.
      try {
        const outcome = await runMutation({
          mutate: () =>
            api.sendUyapHacizRequest({
              caseId,
              caseDebtorId: selectedCaseDebtorId,
              targetType: hacizType,
              targetDetails: { notes: hacizDetails },
              amount: parseFloat(hacizAmount),
            }),
          refresh: () => loadData({ propagateError: true }),
          // Owner kural #8: ham hata/stack DEĞİL, güvenli mesaj.
          failureMessage: 'Haciz talebi gönderilemedi. Talep İLETİLMEDİ, lütfen tekrar deneyin.',
          staleMessage: 'Haciz talebi İLETİLDİ, ancak panel yenilenemedi.',
        });

        // Unmount sonrası state YAZILMAZ.
        if (!rowLock.isMounted()) return;
        if (outcome.status === 'FAILED') {
          // Form ve panel KORUNUR: tutar/detay silinmez, kullanıcı yeniden gönderebilir.
          setHacizError(outcome.error.message);
          return;
        }
        // Reset YALNIZ doğrulanmış response sonrası.
        setHacizAmount('');
        setHacizDetails('');
        if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
      } finally {
        if (rowLock.isMounted()) setSubmitting(false);
      }
    });
  };

  const handleRetryFailed = async () => {
    setDocumentError(null);
    setStaleNotice(null);

    // PR-2A1: `console.error` tek başına handling DEĞİLDİR — kullanıcı retry'ın
    // başarısız olduğunu hiç görmüyordu.
    //
    // ANAHTAR SEÇİMİ endpoint sözleşmesinden türer: `POST /uyap/retry-failed` HİÇBİR
    // argüman almaz (ne caseId ne kayıt kimliği) — TOPLU, dosya-üstü bir operasyondur.
    // Bu yüzden anahtar GLOBAL'dir; `caseId` eklemek farklı dosyalardaki iki panelin
    // aynı toplu retry'ı eşzamanlı tetiklemesine izin verirdi. Endpoint ileride tekil
    // kayıt retry'ına dönerse anahtara kayıt kimliği EKLENMELİDİR.
    await rowLock.run('uyap:retry-failed', async () => {
      const outcome = await runMutation({
        mutate: () => api.retryUyapFailedRequests(),
        refresh: () => loadData({ propagateError: true }),
        failureMessage:
          'Başarısız istekler yeniden denenemedi. Kayıtlar BAŞARISIZ durumda KALDI.',
        staleMessage: 'Yeniden deneme YAPILDI, ancak panel yenilenemedi.',
      });

      if (!rowLock.isMounted()) return;
      if (outcome.status === 'FAILED') {
        // Kayıtlar mevcut FAILED durumunda kalır; hiçbir state yazılmaz.
        setDocumentError(outcome.error.message);
        return;
      }
      // Başarı YALNIZ doğrulanmış response sonrası gösterilir.
      const retried = (outcome.data as { retriedCount?: number } | undefined)?.retriedCount;
      setRetryNotice(
        typeof retried === 'number'
          ? `${retried} istek yeniden denendi.`
          : 'Başarısız istekler yeniden denendi.',
      );
      if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const documentTypes: { value: UyapDocumentType; label: string }[] = [
    { value: "TAKIP_TALEBI", label: "Takip Talebi" },
    { value: "DILEKCE", label: "Dilekçe" },
    { value: "BEYAN", label: "Beyan" },
    { value: "ITIRAZ", label: "İtiraz" },
    { value: "HACIZ_TALEBI", label: "Haciz Talebi" },
    { value: "DIGER", label: "Diğer" },
  ];

  const hacizTypes: { value: HacizTargetType; label: string }[] = [
    { value: "BANK", label: "Banka Hesabı" },
    { value: "VEHICLE", label: "Araç" },
    { value: "PROPERTY", label: "Taşınmaz" },
    { value: "SALARY", label: "Maaş" },
  ];

  const getStatusBadge = (reqStatus: string) => {
    const colors: Record<string, string> = {
      SUCCESS: "bg-green-100 text-green-800",
      FAILED: "bg-red-100 text-red-800",
      PENDING: "bg-yellow-100 text-yellow-800",
      RETRY: "bg-blue-100 text-blue-800",
    };
    return colors[reqStatus] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* PR-2A1: okuma, evrak ve retry hataları AYRI yüzeylerde ve GÖRÜNÜR. */}
      <div className="space-y-2 px-6 pt-4 empty:hidden">
        <ActionError message={loadError} />
        <ActionError message={documentError} />
        {retryNotice ? (
          <div
            role="status"
            data-testid="retry-notice"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
          >
            {retryNotice}
          </div>
        ) : null}
        {/* Mutation başarılı ama panel tazelenemedi → gönderim durur, görünüm bayat. */}
        {staleNotice ? (
          <div
            role="status"
            data-testid="stale-notice"
            className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            <span className="flex-1">{staleNotice}</span>
            <button
              type="button"
              onClick={handleStaleRefresh}
              disabled={refreshingStale}
              data-testid="stale-refresh"
              className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50"
            >
              Paneli yenile
            </button>
          </div>
        ) : null}
      </div>

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">UYAP Entegrasyonu</h3>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              status?.connected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}>
              {status?.mode === "STUB" ? "Test Modu" : "Canlı"}
            </span>
            {status?.connected && (
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        {/* PR-2A1: sekmeler düz `button` idi — `role`/`aria-selected`/`aria-controls`
            yoktu, ekran okuyucu dört ilgisiz düğme görüyordu. Semantik tab seti. */}
        <nav className="flex -mb-px" role="tablist" aria-label="UYAP panel sekmeleri">
          {[
            { id: "status", label: "Durum" },
            { id: "document", label: "Evrak Gönder" },
            { id: "haciz", label: "Haciz Talebi" },
            { id: "history", label: "Geçmiş" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`uyap-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`uyap-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Status Tab */}
        {activeTab === "status" && (
          <div role="tabpanel" id="uyap-panel-status" aria-labelledby="uyap-tab-status" className="space-y-6">
            {/* Connection Status */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Bağlantı Durumu</h4>
              <p className="text-sm text-gray-600">{status?.message}</p>
              
              {status?.stats && (
                <div className="grid grid-cols-4 gap-4 mt-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{status.stats.total}</div>
                    <div className="text-xs text-gray-500">Toplam</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">{status.stats.pending}</div>
                    <div className="text-xs text-gray-500">Bekleyen</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{status.stats.success}</div>
                    <div className="text-xs text-gray-500">Başarılı</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{status.stats.failed}</div>
                    <div className="text-xs text-gray-500">Başarısız</div>
                  </div>
                </div>
              )}
            </div>

            {/* POA Validation */}
            <div className={`rounded-lg p-4 ${
              poaValidation?.isValid ? "bg-green-50" : "bg-red-50"
            }`}>
              <h4 className="font-medium text-gray-900 mb-2">Vekalet Kontrolü</h4>
              {poaValidation?.isValid ? (
                <p className="text-sm text-green-700">
                  ✓ Tüm vekaletler geçerli. UYAP işlemlerine devam edilebilir.
                </p>
              ) : (
                <div>
                  <p className="text-sm text-red-700 mb-2">
                    ✗ Vekalet sorunları tespit edildi:
                  </p>
                  <ul className="list-disc list-inside text-sm text-red-600">
                    {poaValidation?.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {status?.stats && status.stats.failed > 0 && (
              <button
                onClick={handleRetryFailed}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Başarısız İstekleri Yeniden Dene ({status.stats.failed})
              </button>
            )}
          </div>
        )}

        {/* Document Tab */}
        {activeTab === "document" && (
          <div role="tabpanel" id="uyap-panel-document" aria-labelledby="uyap-tab-document" className="space-y-4">
            {!poaValidation?.canProceedToUyap && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ Vekalet sorunları nedeniyle evrak gönderimi engellenebilir.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Evrak Türü
              </label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as UyapDocumentType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {documentTypes.map((dt) => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Evrak Adı
              </label>
              <input
                type="text"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="Örn: Takip Talebi - 2025/12345"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PDF Dosyası
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleDocumentSubmit}
              disabled={submitting || !documentFile || !documentName}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitting ? "Gönderiliyor..." : "UYAP'a Gönder"}
            </button>
          </div>
        )}

        {/* Haciz Tab */}
        {activeTab === "haciz" && (
          <div role="tabpanel" id="uyap-panel-haciz" aria-labelledby="uyap-tab-haciz" className="space-y-4">
            {!poaValidation?.canProceedToUyap && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ Vekalet sorunları nedeniyle haciz talebi engellenebilir.
                </p>
              </div>
            )}

            {/* PR-D4e-4: haciz öncesi saha istihbaratı RİSK read-model (borçlu-bazlı seviye + nedenler).
                Blok YOK. Sinyal yoksa hiçbir şey gösterme (susmaya devam). Ham skor gösterilmez. */}
            {preHacizRisk && preHacizRisk.debtors.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-yellow-900 mb-3">
                  ⚠️ Haciz öncesi istihbarat değerlendirmesi
                  <span className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded border ${RISK_LEVEL_BADGE[preHacizRisk.overallLevel]}`}>
                    Genel: {RISK_LEVEL_LABEL[preHacizRisk.overallLevel]}
                  </span>
                </p>
                <ul className="space-y-3">
                  {preHacizRisk.debtors.map((d) => (
                    <li key={d.debtorId} className="border-l-2 border-yellow-400 pl-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-yellow-900">{d.name}</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${RISK_LEVEL_BADGE[d.level]}`}>
                          {RISK_LEVEL_LABEL[d.level]} risk
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {d.reasons.map((r, i) => (
                          <li key={i} className="text-sm text-yellow-800">
                            • {r.message.split("\n").slice(1).join(" ").trim() || r.message}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-yellow-700 mt-3">
                  Bu değerlendirme haciz talebini engellemez; karar desteği amaçlıdır.
                </p>
              </div>
            )}

            {/* I15-D1-R1: CaseDebtor target-binding — haciz talebi HER ZAMAN tek ve açık bir
                borçluyu hedefler. Backend caseDebtorId'yi zorunlu ister; burada yalnız UX
                kolaylığı sağlanır (implicit fallback backend'de YOKTUR). */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hedef Borçlu
              </label>
              {caseDebtors.length === 0 ? (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  Bu dosyada aktif borçlu bulunamadı; haciz talebi gönderilemez.
                </p>
              ) : caseDebtors.length === 1 ? (
                <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  {caseDebtors[0].displayName}
                  <span className="ml-2 text-xs text-gray-500">
                    ({caseDebtors[0].role} · Aktif)
                  </span>
                </p>
              ) : (
                <select
                  aria-label="Hedef Borçlu"
                  value={selectedCaseDebtorId ?? ""}
                  onChange={(e) => setSelectedCaseDebtorId(e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" disabled>
                    Borçlu seçin…
                  </option>
                  {caseDebtors.map((cd) => (
                    <option key={cd.caseDebtorId} value={cd.caseDebtorId}>
                      {cd.displayName} ({cd.role} · Aktif)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {riskLoadError && (
              <p
                role="alert"
                className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              >
                {riskLoadError}
              </p>
            )}

            {debtorLoadError && (
              <p
                role="alert"
                className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              >
                {debtorLoadError}
              </p>
            )}

            {hacizError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {hacizError}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Haciz Türü
              </label>
              <select
                aria-label="Haciz Türü"
                value={hacizType}
                onChange={(e) => setHacizType(e.target.value as HacizTargetType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {hacizTypes.map((ht) => (
                  <option key={ht.value} value={ht.value}>{ht.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Haciz Tutarı (TL)
              </label>
              <input
                type="number"
                value={hacizAmount}
                onChange={(e) => setHacizAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Detaylar / Notlar
              </label>
              <textarea
                value={hacizDetails}
                onChange={(e) => setHacizDetails(e.target.value)}
                rows={3}
                placeholder="Banka adı, hesap no, araç plakası vb."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleHacizSubmit}
              disabled={submitting || !hacizAmount || !selectedCaseDebtorId}
              className="w-full py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitting ? "Gönderiliyor..." : "Haciz Talebi Gönder"}
            </button>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div role="tabpanel" id="uyap-panel-history" aria-labelledby="uyap-tab-history" className="space-y-3">
            {history.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                Henüz UYAP işlemi yapılmamış.
              </p>
            ) : (
              history.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-gray-900">{log.requestType}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(log.createdAt).toLocaleString("tr-TR")}
                      {log.evkNo && ` • EVK: ${log.evkNo}`}
                    </div>
                    {log.errorMessage && (
                      <div className="text-xs text-red-600 mt-1">{log.errorMessage}</div>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(log.status)}`}>
                    {log.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
