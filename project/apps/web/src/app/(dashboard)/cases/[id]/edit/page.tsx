"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, Plus, X } from "lucide-react";
import { api } from "@/lib/api";

const caseTypes = [
  { value: "GENERAL_EXECUTION", label: "Genel Haciz Yoluyla Takip" },
  { value: "MORTGAGE", label: "İpotekli Takip" },
  { value: "PLEDGE", label: "Rehinli Takip" },
  { value: "CHECK", label: "Çek Takibi" },
  { value: "BOND", label: "Senet Takibi" },
  { value: "RENTAL", label: "Kira Takibi" },
  { value: "BANKRUPTCY", label: "İflas Takibi" },
  { value: "OTHER", label: "Diğer" },
];

const subTypes = [
  { value: "GENEL", label: "Genel" },
  { value: "KAMBIYO", label: "Kambiyo Senetleri" },
  { value: "IPOTEK", label: "İpotek" },
  { value: "REHIN", label: "Rehin" },
  { value: "IFLAS", label: "İflas" },
];

const statusOptions = [
  { value: "ACTIVE", label: "Aktif" },
  { value: "CLOSED", label: "Kapalı" },
  { value: "SUSPENDED", label: "Askıda" },
  { value: "ARCHIVED", label: "Arşiv" },
];

export default function EditCasePage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("info");

  const [caseData, setCaseData] = useState<any>(null);
  const [formData, setFormData] = useState({
    fileNumber: "",
    executionFileNumber: "",
    type: "GENERAL_EXECUTION",
    subType: "GENEL",
    status: "ACTIVE",
    startDate: "",
    principalAmount: "",
    interestRate: "",
    notes: "",
  });

  // Mevcut kayıtlar
  const [existingLawyers, setExistingLawyers] = useState<any[]>([]);
  const [existingClients, setExistingClients] = useState<any[]>([]);
  const [existingDebtors, setExistingDebtors] = useState<any[]>([]);

  // Seçilen kayıtlar
  const [lawyers, setLawyers] = useState<any[]>([]);
  const [creditors, setCreditors] = useState<any[]>([]);
  const [debtors, setDebtors] = useState<any[]>([]);

  useEffect(() => {
    if (params.id) {
      loadData();
    }
  }, [params.id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [caseRes, lawyersRes, clientsRes, debtorsRes] = await Promise.all([
        api.getCase(params.id as string),
        api.getLawyers(),
        api.getClients(),
        api.searchDebtors(),
      ]);

      setCaseData(caseRes);
      setFormData({
        fileNumber: caseRes.fileNumber || "",
        executionFileNumber: caseRes.executionFileNumber || "",
        type: caseRes.type || "GENERAL_EXECUTION",
        subType: caseRes.subType || "GENEL",
        status: caseRes.status || "ACTIVE",
        startDate: caseRes.startDate ? caseRes.startDate.split("T")[0] : "",
        principalAmount: caseRes.principalAmount?.toString() || "",
        interestRate: caseRes.interestRate?.toString() || "",
        notes: caseRes.notes || "",
      });

      // Mevcut avukatları yükle
      setLawyers(caseRes.lawyers?.map((l: any) => ({
        id: l.lawyer.id,
        name: l.lawyer.name,
        surname: l.lawyer.surname,
        barNumber: l.lawyer.barNumber,
        canSign: l.canSign,
        isNew: false,
      })) || []);

      // Mevcut alacaklıyı yükle
      if (caseRes.client) {
        setCreditors([{ ...caseRes.client, isNew: false }]);
      }

      // Mevcut borçluları yükle
      setDebtors(caseRes.debtors?.map((d: any) => ({
        ...d.debtor,
        role: d.role,
        isNew: false,
      })) || []);

      setExistingLawyers(lawyersRes || []);
      setExistingClients(clientsRes?.data || clientsRes || []);
      setExistingDebtors(debtorsRes?.data || debtorsRes || []);
    } catch (err) {
      console.error("Veri yüklenemedi:", err);
      setError("Takip bilgileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);

    try {
      await api.updateCase(params.id as string, {
        fileNumber: formData.fileNumber,
        executionFileNumber: formData.executionFileNumber || undefined,
        type: formData.type,
        subType: formData.subType,
        status: formData.status,
        principalAmount: formData.principalAmount ? parseFloat(formData.principalAmount) : undefined,
        interestRate: formData.interestRate ? parseFloat(formData.interestRate) : undefined,
        startDate: formData.startDate || undefined,
        notes: formData.notes || undefined,
      });

      router.push(`/cases/${params.id}`);
    } catch (err: any) {
      setError(err.message || "Kaydetme sırasında bir hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabs = [
    { id: "info", label: "Takip Bilgileri" },
    { id: "lawyers", label: "Avukatlar" },
    { id: "creditors", label: "Alacaklılar" },
    { id: "debtors", label: "Borçlular" },
  ];


  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <Link href={`/cases/${params.id}`} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Takibe Dön
        </Link>
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>

      <div className="bg-white rounded-xl border">
        <div className="border-b px-6 pt-4">
          <div className="flex gap-4">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 border-b-2 -mb-px ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>}

          {activeTab === "info" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Takip No</label>
                  <input type="text" name="fileNumber" value={formData.fileNumber} onChange={handleChange}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">İcra Dosya No</label>
                  <input type="text" name="executionFileNumber" value={formData.executionFileNumber} onChange={handleChange}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Takip Türü</label>
                  <select name="type" value={formData.type} onChange={handleChange}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary">
                    {caseTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Alt Takip Tipi</label>
                  <select name="subType" value={formData.subType} onChange={handleChange}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary">
                    {subTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Durum</label>
                  <select name="status" value={formData.status} onChange={handleChange}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary">
                    {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Başlangıç Tarihi</label>
                  <input type="date" name="startDate" value={formData.startDate} onChange={handleChange}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Ana Para (₺)</label>
                  <input type="number" name="principalAmount" value={formData.principalAmount} onChange={handleChange}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Faiz Oranı (%)</label>
                  <input type="number" name="interestRate" value={formData.interestRate} onChange={handleChange}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notlar</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
              </div>
            </div>
          )}

          {activeTab === "lawyers" && (
            <div className="space-y-4">
              <p className="text-muted-foreground">Mevcut avukatlar:</p>
              {lawyers.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">Avukat bilgisi yok</p>
              ) : (
                <div className="space-y-2">
                  {lawyers.map((l, i) => (
                    <div key={i} className="border rounded-lg p-3 flex justify-between items-center">
                      <span>{l.name} {l.surname} {l.barNumber && `(${l.barNumber})`}</span>
                      {l.canSign && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">İmza Yetkili</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "creditors" && (
            <div className="space-y-4">
              <p className="text-muted-foreground">Mevcut alacaklılar:</p>
              {creditors.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">Alacaklı bilgisi yok</p>
              ) : (
                <div className="space-y-2">
                  {creditors.map((c, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{c.identityNo} {c.phone && `• ${c.phone}`}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "debtors" && (
            <div className="space-y-4">
              <p className="text-muted-foreground">Mevcut borçlular:</p>
              {debtors.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">Borçlu bilgisi yok</p>
              ) : (
                <div className="space-y-2">
                  {debtors.map((d, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <p className="font-medium">{d.name}</p>
                      <p className="text-sm text-muted-foreground">{d.identityNo} {d.phone && `• ${d.phone}`}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
