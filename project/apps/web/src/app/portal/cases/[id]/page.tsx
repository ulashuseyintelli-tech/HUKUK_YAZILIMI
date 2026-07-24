"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, User, DollarSign, Loader2, TrendingUp, Clock, CheckCircle, StickyNote } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
  const router = useRouter();
  const [caseData, setCaseData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCase();
  }, [params.id]);

  const loadCase = async () => {
    try {
      const token = localStorage.getItem("portal_token");
      const res = await fetch(`${API_URL}/api/portal/cases/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) {
        if (res.status === 404) {
          router.push("/portal/cases");
          return;
        }
        throw new Error("Dosya yüklenemedi");
      }
      
      const data = await res.json();
      setCaseData(data);
    } catch (e) {
      console.error("Dosya yüklenemedi:", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Dosya bulunamadı</p>
        <Link href="/portal/cases" className="text-blue-600 hover:underline mt-2 inline-block">
          Dosyalara Dön
        </Link>
      </div>
    );
  }

  const totalDue = caseData.dues?.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0) || 0;
  const totalCollected = caseData.collections?.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0) || 0;
  const collectionRate = totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0;

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
        <span className={`ml-auto px-3 py-1 rounded-full text-sm ${
          caseData.caseStatus === "DERDEST" || caseData.caseStatus === "ISLEMDE" 
            ? "bg-green-100 text-green-700" 
            : "bg-gray-100 text-gray-700"
        }`}>
          {statusLabels[caseData.caseStatus] || caseData.caseStatus}
        </span>
      </div>

      {/* Müvekkil Notu — yalnız değer varsa render edilir, dahiliNot ile birleştirilmez/karıştırılmaz */}
      {caseData.muvekkilNotu && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 className="font-semibold text-blue-900 flex items-center gap-2 mb-2">
            <StickyNote className="h-4 w-4" /> Müvekkil Notu
          </h2>
          <p className="text-sm text-blue-800 whitespace-pre-wrap">{caseData.muvekkilNotu}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Toplam Alacak</p>
              <p className="text-xl font-bold">{totalDue.toLocaleString("tr-TR")} ₺</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Tahsil Edilen</p>
              <p className="text-xl font-bold">{totalCollected.toLocaleString("tr-TR")} ₺</p>
            </div>
          </div>
        </div>
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
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Tahsilat Oranı</p>
              <p className="text-xl font-bold">%{collectionRate}</p>
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

      {/* Tahsilatlar */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h2 className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Tahsilatlar
          </h2>
        </div>
        <div className="p-4">
          {caseData.collections?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Tarih</th>
                  <th className="text-left py-2">Tür</th>
                  <th className="text-right py-2">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {caseData.collections.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2">{new Date(c.date).toLocaleDateString("tr-TR")}</td>
                    <td className="py-2 text-gray-600">{c.type}</td>
                    <td className="py-2 text-right font-medium text-green-600">
                      +{Number(c.amount).toLocaleString("tr-TR")} ₺
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 text-sm text-center py-4">Henüz tahsilat yok</p>
          )}
        </div>
      </div>
    </div>
  );
}
