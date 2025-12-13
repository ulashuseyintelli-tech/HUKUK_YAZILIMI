"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, User, DollarSign, Calendar, Loader2, TrendingUp, Clock, CheckCircle } from "lucide-react";

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
                {caseData.debtors.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium">{d.debtor?.name}</p>
                      <p className="text-sm text-gray-500">{d.debtor?.type === "PERSON" ? "Şahıs" : "Kurum"}</p>
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
                  <div key={d.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm">{d.description || d.type}</span>
                    <span className="font-medium">{Number(d.amount).toLocaleString("tr-TR")} ₺</span>
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
                  <th className="text-left py-2">Açıklama</th>
                  <th className="text-right py-2">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {caseData.collections.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2">{new Date(c.date).toLocaleDateString("tr-TR")}</td>
                    <td className="py-2 text-gray-600">{c.description || c.type}</td>
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

      {/* İşlem Geçmişi */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h2 className="font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> İşlem Geçmişi
          </h2>
        </div>
        <div className="p-4">
          {caseData.lifecycleEvents?.length > 0 ? (
            <div className="space-y-3">
              {caseData.lifecycleEvents.map((event: any) => (
                <div key={event.id} className="flex gap-3">
                  <div className="w-2 h-2 mt-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                  <div>
                    <p className="font-medium text-sm">{event.action}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(event.createdAt).toLocaleDateString("tr-TR")} - {event.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-4">İşlem geçmişi yok</p>
          )}
        </div>
      </div>
    </div>
  );
}
