"use client";

import { useState, useEffect } from "react";
import { useGuardedAction } from "@/components/guarded-edge/use-guarded-action";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, AlertCircle, Check } from "lucide-react";
import { api } from "@/lib/api";
import { CASE_STATUS_OPTIONS } from "@/lib/case-statuses";

interface CaseData {
  id: string;
  fileNumber: string;
  executionFileNumber?: string;
  type: string;
  status: string;
  executionPath: string;
  executionOfficeId?: string;
  startDate?: string;
  notes?: string;
  principalAmount?: number;
  currency?: string;
  interestType?: string;
  caseStatus?: string;
}

interface ExecutionOffice {
  id: string;
  name: string;
  city: string;
}

const caseTypes = [
  { value: "GENERAL_EXECUTION", label: "Genel Haciz" },
  { value: "MORTGAGE", label: "İpotekli" },
  { value: "PLEDGE", label: "Rehinli" },
  { value: "CHECK", label: "Çek" },
  { value: "BOND", label: "Senet" },
  { value: "RENTAL", label: "Kira" },
  { value: "BANKRUPTCY", label: "İflas" },
  { value: "OTHER", label: "Diğer" },
];

const executionPaths = [
  { value: "HACIZ", label: "Haciz Yolu" },
  { value: "IFLAS", label: "İflas Yolu" },
  { value: "REHIN", label: "Rehin Yolu" },
  { value: "IPOTEK", label: "İpotek Yolu" },
];

export default function EditCasePage() {
  const router = useRouter();
  const params = useParams();
  const caseId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [originalStatus, setOriginalStatus] = useState<string | undefined>(undefined);
  // P3-2C-FE: edit-form statü değişimini guarded-edge consumer ile sar (flag OFF → modal hiç açılmaz, davranış değişmez).
  const { run: runGuardedStatus, modal: guardedStatusModal } = useGuardedAction();
  const [executionOffices, setExecutionOffices] = useState<ExecutionOffice[]>([]);
  const [selectedCity, setSelectedCity] = useState("");

  useEffect(() => {
    loadData();
  }, [caseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [caseRes, officesRes] = await Promise.all([
        api.get(`/cases/${caseId}`),
        api.get('/execution-offices'),
      ]);
      
      const data = caseRes.data?.data || caseRes.data;
      setCaseData(data);
      setOriginalStatus(data?.caseStatus); // P3-2B-2: split için yüklenen statü referansı
      setExecutionOffices(officesRes.data?.data || []);
      
      // İcra dairesinin ilini bul
      if (data.executionOfficeId) {
        const office = (officesRes.data?.data || []).find((o: ExecutionOffice) => o.id === data.executionOfficeId);
        if (office) setSelectedCity(office.city);
      }
    } catch (err: any) {
      setError(err.message || "Veri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseData) return;

    try {
      setSaving(true);
      setError(null);
      
      // P3-2B-2: statü DEĞİŞMİŞSE kör PUT'tan çıkar, kanonik /case-status route'una gönder (önce edit, sonra statü).
      const statusChanged = (caseData.caseStatus || undefined) !== (originalStatus || undefined);

      await api.put(`/cases/${caseId}`, {
        fileNumber: caseData.fileNumber,
        executionFileNumber: caseData.executionFileNumber,
        type: caseData.type,
        executionPath: caseData.executionPath,
        executionOfficeId: caseData.executionOfficeId,
        startDate: caseData.startDate,
        notes: caseData.notes,
        ...(statusChanged ? {} : { caseStatus: caseData.caseStatus }),
      });

      if (statusChanged && caseData.caseStatus) {
        // P3-2C-FE: kanonik statü değişimi guarded-edge consumer ile sarıldı. Flag OFF → run normal {ok}, modal açılmaz.
        // CONFIRM_REQUIRED'da vazgeçilirse: edit (PUT) zaten yazıldı ama statü DEĞİŞMEZ → başarı ekranına geçme, formda kal.
        const statusToSet = caseData.caseStatus;
        const result = await runGuardedStatus((confirmation) =>
          api.changeCaseStatus(caseId, statusToSet, "Dosya düzenleme formundan statü güncellendi", confirmation?.token),
        );
        if (result.status === "cancelled") {
          return; // finally setSaving(false) çalışır; formda kalır
        }
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/cases/${caseId}`);
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof CaseData, value: any) => {
    setCaseData(prev => prev ? { ...prev, [field]: value } : null);
  };

  // İllere göre icra dairelerini filtrele
  const cities = [...new Set(executionOffices.map(o => o.city))].sort();
  const filteredOffices = selectedCity 
    ? executionOffices.filter(o => o.city === selectedCity)
    : executionOffices;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold">Takip bulunamadı</h2>
        <Link href="/cases" className="text-primary hover:underline mt-2 inline-block">
          Takip listesine dön
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href={`/cases/${caseId}`}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Takip Düzenle</h1>
          <p className="text-sm text-muted-foreground">{caseData.fileNumber}</p>
        </div>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6 flex items-center gap-2">
          <Check className="h-5 w-5" />
          Değişiklikler kaydedildi, yönlendiriliyorsunuz...
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-6">
        {/* Dosya Bilgileri */}
        <div>
          <h3 className="font-semibold mb-4">Dosya Bilgileri</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Dosya Numarası</label>
              <input
                type="text"
                value={caseData.fileNumber}
                onChange={(e) => updateField('fileNumber', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">İcra Dosya Numarası</label>
              <input
                type="text"
                value={caseData.executionFileNumber || ''}
                onChange={(e) => updateField('executionFileNumber', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                placeholder="2025/12345"
              />
            </div>
          </div>
        </div>

        {/* Takip Türü ve Yolu */}
        <div>
          <h3 className="font-semibold mb-4">Takip Bilgileri</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Takip Türü</label>
              <select
                value={caseData.type}
                onChange={(e) => updateField('type', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                {caseTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Takip Yolu</label>
              <select
                value={caseData.executionPath}
                onChange={(e) => updateField('executionPath', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                {executionPaths.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* İcra Dairesi */}
        <div>
          <h3 className="font-semibold mb-4">İcra Dairesi</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">İl</label>
              <select
                value={selectedCity}
                onChange={(e) => {
                  setSelectedCity(e.target.value);
                  updateField('executionOfficeId', '');
                }}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">İl seçin</option>
                {cities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">İcra Dairesi</label>
              <select
                value={caseData.executionOfficeId || ''}
                onChange={(e) => updateField('executionOfficeId', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                disabled={!selectedCity}
              >
                <option value="">İcra dairesi seçin</option>
                {filteredOffices.map(office => (
                  <option key={office.id} value={office.id}>{office.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Durum */}
        <div>
          <h3 className="font-semibold mb-4">Durum</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Dosya Durumu</label>
              <select
                value={caseData.caseStatus || 'DERDEST'}
                onChange={(e) => updateField('caseStatus', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                {CASE_STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Başlangıç Tarihi</label>
              <input
                type="date"
                value={caseData.startDate?.split('T')[0] || ''}
                onChange={(e) => updateField('startDate', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Notlar */}
        <div>
          <label className="block text-sm font-medium mb-1">Notlar</label>
          <textarea
            value={caseData.notes || ''}
            onChange={(e) => updateField('notes', e.target.value)}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            placeholder="Dosya ile ilgili notlar..."
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Link
            href={`/cases/${caseId}`}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            İptal
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Kaydet
              </>
            )}
          </button>
        </div>
      </form>

      {/* P3-2C-FE: guarded-edge confirm modalı (yalnız backend CONFIRM_REQUIRED dönerse görünür; flag OFF → null) */}
      {guardedStatusModal}
    </div>
  );
}
