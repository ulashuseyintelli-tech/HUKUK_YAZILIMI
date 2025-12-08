"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  FileText,
  User,
  Users,
  Scale,
  Calendar,
  DollarSign,
  Edit,
  Trash2,
} from "lucide-react";
import { Badge } from "@hukuk/ui";
import { api } from "@/lib/api";

const caseTypeLabels: Record<string, string> = {
  GENERAL_EXECUTION: "Genel Haciz Yoluyla Takip",
  MORTGAGE: "İpotekli Takip",
  PLEDGE: "Rehinli Takip",
  CHECK: "Çek Takibi",
  BOND: "Senet Takibi",
  RENTAL: "Kira Takibi",
  BANKRUPTCY: "İflas Takibi",
  OTHER: "Diğer",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Aktif",
  CLOSED: "Kapalı",
  SUSPENDED: "Askıda",
  ARCHIVED: "Arşiv",
};

const statusColors: Record<string, "default" | "success" | "warning" | "destructive"> = {
  ACTIVE: "success",
  CLOSED: "default",
  SUSPENDED: "warning",
  ARCHIVED: "default",
};

interface CaseDetail {
  id: string;
  fileNumber: string;
  executionFileNumber?: string;
  type: string;
  subType?: string;
  status: string;
  principalAmount?: number;
  interestRate?: number;
  startDate?: string;
  notes?: string;
  createdAt: string;
  client?: {
    id: string;
    name: string;
    type: string;
    identityNo?: string;
    phone?: string;
    email?: string;
  };
  debtors: {
    id: string;
    role: string;
    debtor: {
      id: string;
      name: string;
      type: string;
      identityNo?: string;
      phone?: string;
    };
  }[];
  lawyers?: {
    id: string;
    canSign: boolean;
    lawyer: {
      id: string;
      name: string;
      surname: string;
      barNumber?: string;
    };
  }[];
  tasks: any[];
  collections: any[];
}

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (params.id) {
      fetchCase();
    }
  }, [params.id]);

  const fetchCase = async () => {
    try {
      setLoading(true);
      const data = await api.getCase(params.id as string);
      setCaseData(data);
    } catch (error) {
      console.error("Takip yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Takip bulunamadı</p>
        <Link href="/cases" className="text-primary hover:underline mt-2 inline-block">
          Takiplere dön
        </Link>
      </div>
    );
  }


  const tabs = [
    { id: "overview", label: "Genel Bilgiler" },
    { id: "parties", label: "Taraflar" },
    { id: "tasks", label: "Görevler" },
    { id: "collections", label: "Tahsilatlar" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/cases"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Takiplere Dön
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{caseData.fileNumber}</h1>
            <Badge variant={statusColors[caseData.status]}>
              {statusLabels[caseData.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {caseTypeLabels[caseData.type]} {caseData.subType && `- ${caseData.subType}`}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/cases/${caseData.id}/edit`}
            className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-muted"
          >
            <Edit className="h-4 w-4" />
            Düzenle
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ana Para</p>
              <p className="text-lg font-semibold">
                {caseData.principalAmount
                  ? `${Number(caseData.principalAmount).toLocaleString("tr-TR")} ₺`
                  : "-"}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Başlangıç Tarihi</p>
              <p className="text-lg font-semibold">
                {caseData.startDate
                  ? new Date(caseData.startDate).toLocaleDateString("tr-TR")
                  : "-"}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Borçlu Sayısı</p>
              <p className="text-lg font-semibold">{caseData.debtors?.length || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <FileText className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">İcra Dosya No</p>
              <p className="text-lg font-semibold">
                {caseData.executionFileNumber || "-"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border p-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3">Takip Bilgileri</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Takip No</p>
                  <p className="font-medium">{caseData.fileNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">İcra Dosya No</p>
                  <p className="font-medium">{caseData.executionFileNumber || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Takip Türü</p>
                  <p className="font-medium">{caseTypeLabels[caseData.type]}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Alt Tür</p>
                  <p className="font-medium">{caseData.subType || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Faiz Oranı</p>
                  <p className="font-medium">
                    {caseData.interestRate ? `%${caseData.interestRate}` : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Oluşturulma</p>
                  <p className="font-medium">
                    {new Date(caseData.createdAt).toLocaleDateString("tr-TR")}
                  </p>
                </div>
              </div>
            </div>

            {caseData.notes && (
              <div>
                <h3 className="font-semibold mb-2">Notlar</h3>
                <p className="text-muted-foreground">{caseData.notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "parties" && (
          <div className="space-y-6">
            {/* Alacaklı */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <User className="h-5 w-5" />
                Alacaklı (Müvekkil)
              </h3>
              {caseData.client ? (
                <div className="border rounded-lg p-4">
                  <p className="font-medium">{caseData.client.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {caseData.client.type === "INDIVIDUAL" ? "Gerçek Kişi" : "Tüzel Kişi"}
                    {caseData.client.identityNo && ` • ${caseData.client.identityNo}`}
                  </p>
                  {caseData.client.phone && (
                    <p className="text-sm mt-1">📞 {caseData.client.phone}</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Alacaklı bilgisi yok</p>
              )}
            </div>

            {/* Avukatlar */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Yetkili Avukatlar
              </h3>
              {caseData.lawyers && caseData.lawyers.length > 0 ? (
                <div className="space-y-2">
                  {caseData.lawyers.map((l) => (
                    <div key={l.id} className="border rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {l.lawyer.name} {l.lawyer.surname}
                        </p>
                        {l.lawyer.barNumber && (
                          <p className="text-sm text-muted-foreground">
                            Baro Sicil: {l.lawyer.barNumber}
                          </p>
                        )}
                      </div>
                      {l.canSign && (
                        <Badge variant="success">İmza Yetkili</Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Avukat bilgisi yok</p>
              )}
            </div>

            {/* Borçlular */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Borçlular
              </h3>
              {caseData.debtors && caseData.debtors.length > 0 ? (
                <div className="space-y-2">
                  {caseData.debtors.map((d) => (
                    <div key={d.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{d.debtor.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {d.debtor.type === "INDIVIDUAL" ? "Gerçek Kişi" : "Tüzel Kişi"}
                            {d.debtor.identityNo && ` • ${d.debtor.identityNo}`}
                          </p>
                        </div>
                        <Badge>{d.role === "DEBTOR" ? "Borçlu" : d.role}</Badge>
                      </div>
                      {d.debtor.phone && (
                        <p className="text-sm mt-2">📞 {d.debtor.phone}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Borçlu bilgisi yok</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "tasks" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Görevler</h3>
              <button className="text-sm text-primary hover:underline">
                + Görev Ekle
              </button>
            </div>
            {caseData.tasks && caseData.tasks.length > 0 ? (
              <div className="space-y-2">
                {caseData.tasks.map((task: any) => (
                  <div key={task.id} className="border rounded-lg p-3">
                    <p className="font-medium">{task.title}</p>
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Henüz görev eklenmemiş
              </p>
            )}
          </div>
        )}

        {activeTab === "collections" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Tahsilatlar</h3>
              <button className="text-sm text-primary hover:underline">
                + Tahsilat Ekle
              </button>
            </div>
            {caseData.collections && caseData.collections.length > 0 ? (
              <div className="space-y-2">
                {caseData.collections.map((col: any) => (
                  <div key={col.id} className="border rounded-lg p-3 flex justify-between">
                    <div>
                      <p className="font-medium">
                        {Number(col.amount).toLocaleString("tr-TR")} ₺
                      </p>
                      <p className="text-sm text-muted-foreground">{col.description}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(col.date).toLocaleDateString("tr-TR")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Henüz tahsilat kaydı yok
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
