"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Check, Plus, X, Search } from "lucide-react";
import { api } from "@/lib/api";

// Takip türleri
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

const steps = [
  { id: 1, title: "Takip Bilgileri" },
  { id: 2, title: "Avukatlar" },
  { id: 3, title: "Alacaklılar" },
  { id: 4, title: "Borçlular" },
];

interface Lawyer {
  id?: string;
  name: string;
  surname: string;
  barNumber?: string;
  canSign: boolean;
  isNew?: boolean;
}

interface Party {
  id?: string;
  type: "INDIVIDUAL" | "COMPANY";
  name: string;
  identityNo?: string;
  taxOffice?: string;
  phone?: string;
  email?: string;
  address?: string;
  isNew?: boolean;
}

export default function NewCasePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Mevcut kayıtlar
  const [existingLawyers, setExistingLawyers] = useState<any[]>([]);
  const [existingClients, setExistingClients] = useState<any[]>([]);
  const [existingDebtors, setExistingDebtors] = useState<any[]>([]);

  // Step 1: Takip Bilgileri
  const [caseData, setCaseData] = useState({
    fileNumber: "",
    executionFileNumber: "",
    type: "GENERAL_EXECUTION",
    subType: "GENEL",
    startDate: new Date().toISOString().split("T")[0],
    principalAmount: "",
    interestRate: "",
    notes: "",
  });

  // Step 2: Avukatlar
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);

  // Step 3: Alacaklılar
  const [creditors, setCreditors] = useState<Party[]>([]);

  // Step 4: Borçlular
  const [debtors, setDebtors] = useState<Party[]>([]);

  useEffect(() => {
    loadExistingData();
  }, []);

  const loadExistingData = async () => {
    try {
      const [lawyersRes, clientsRes, debtorsRes] = await Promise.all([
        api.getLawyers(),
        api.getClients(),
        api.searchDebtors(),
      ]);
      setExistingLawyers(lawyersRes || []);
      setExistingClients(clientsRes?.data || clientsRes || []);
      setExistingDebtors(debtorsRes?.data || debtorsRes || []);
    } catch (err) {
      console.error("Mevcut veriler yüklenemedi:", err);
    }
  };

  const handleCaseDataChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setCaseData((prev) => ({ ...prev, [name]: value }));
  };

  // Avukat işlemleri
  const addExistingLawyer = (lawyer: any) => {
    if (!lawyers.find((l) => l.id === lawyer.id)) {
      setLawyers([...lawyers, { ...lawyer, canSign: false, isNew: false }]);
    }
  };

  const addNewLawyer = () => {
    setLawyers([...lawyers, { name: "", surname: "", barNumber: "", canSign: false, isNew: true }]);
  };

  const updateLawyer = (index: number, field: keyof Lawyer, value: any) => {
    const updated = [...lawyers];
    updated[index] = { ...updated[index], [field]: value };
    setLawyers(updated);
  };

  const removeLawyer = (index: number) => {
    setLawyers(lawyers.filter((_, i) => i !== index));
  };

  // Alacaklı işlemleri
  const addExistingCreditor = (client: any) => {
    if (!creditors.find((c) => c.id === client.id)) {
      setCreditors([...creditors, { ...client, isNew: false }]);
    }
  };

  const addNewCreditor = () => {
    setCreditors([...creditors, {
      type: "INDIVIDUAL",
      name: "",
      identityNo: "",
      phone: "",
      address: "",
      isNew: true,
    }]);
  };

  const updateCreditor = (index: number, field: keyof Party, value: any) => {
    const updated = [...creditors];
    updated[index] = { ...updated[index], [field]: value };
    setCreditors(updated);
  };

  const removeCreditor = (index: number) => {
    setCreditors(creditors.filter((_, i) => i !== index));
  };

  // Borçlu işlemleri
  const addExistingDebtor = (debtor: any) => {
    if (!debtors.find((d) => d.id === debtor.id)) {
      setDebtors([...debtors, { ...debtor, isNew: false }]);
    }
  };

  const addNewDebtor = () => {
    setDebtors([...debtors, {
      type: "INDIVIDUAL",
      name: "",
      identityNo: "",
      phone: "",
      address: "",
      isNew: true,
    }]);
  };

  const updateDebtor = (index: number, field: keyof Party, value: any) => {
    const updated = [...debtors];
    updated[index] = { ...updated[index], [field]: value };
    setDebtors(updated);
  };

  const removeDebtor = (index: number) => {
    setDebtors(debtors.filter((_, i) => i !== index));
  };

  const nextStep = () => {
    if (currentStep === 1 && !caseData.fileNumber.trim()) {
      setError("Dosya numarası zorunludur");
      return;
    }
    setError("");
    setCurrentStep((prev) => Math.min(prev + 1, steps.length));
  };

  const prevStep = () => {
    setError("");
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      const response = await api.createCase({
        fileNumber: caseData.fileNumber,
        executionFileNumber: caseData.executionFileNumber || undefined,
        type: caseData.type,
        subType: caseData.subType,
        principalAmount: caseData.principalAmount ? parseFloat(caseData.principalAmount) : undefined,
        interestRate: caseData.interestRate ? parseFloat(caseData.interestRate) : undefined,
        startDate: caseData.startDate || undefined,
        notes: caseData.notes || undefined,
        lawyers: lawyers.filter((l) => l.name && l.surname).map((l) => ({
          id: l.isNew ? undefined : l.id,
          name: l.name,
          surname: l.surname,
          barNumber: l.barNumber,
          canSign: l.canSign,
        })),
        creditors: creditors.filter((c) => c.name).map((c) => ({
          id: c.isNew ? undefined : c.id,
          type: c.type,
          name: c.name,
          identityNo: c.identityNo,
          taxOffice: c.taxOffice,
          phone: c.phone,
          email: c.email,
          address: c.address,
        })),
        debtors: debtors.filter((d) => d.name).map((d) => ({
          id: d.isNew ? undefined : d.id,
          type: d.type,
          name: d.name,
          identityNo: d.identityNo,
          taxOffice: d.taxOffice,
          phone: d.phone,
          email: d.email,
          address: d.address,
        })),
      });

      router.push(`/cases/${response.id}`);
    } catch (err: any) {
      setError(err.message || "Takip oluşturulurken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/cases" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Takiplere Dön
        </Link>
      </div>

      {/* Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                currentStep > step.id ? "bg-primary border-primary text-white" :
                currentStep === step.id ? "border-primary text-primary" : "border-gray-300 text-gray-400"
              }`}>
                {currentStep > step.id ? <Check className="h-5 w-5" /> : step.id}
              </div>
              <span className={`ml-2 text-sm font-medium ${currentStep >= step.id ? "text-foreground" : "text-gray-400"}`}>
                {step.title}
              </span>
              {index < steps.length - 1 && (
                <div className={`w-12 h-0.5 mx-4 ${currentStep > step.id ? "bg-primary" : "bg-gray-300"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>
        )}

        {/* Step 1: Takip Bilgileri */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-4">Takip Bilgileri</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Takip No <span className="text-red-500">*</span></label>
                <input type="text" name="fileNumber" value={caseData.fileNumber} onChange={handleCaseDataChange}
                  placeholder="2024/1001" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Takip Tarihi</label>
                <input type="date" name="startDate" value={caseData.startDate} onChange={handleCaseDataChange}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">İcra Dosya No</label>
                <input type="text" name="executionFileNumber" value={caseData.executionFileNumber} onChange={handleCaseDataChange}
                  placeholder="2024/12345" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Takip Türü</label>
                <select name="type" value={caseData.type} onChange={handleCaseDataChange}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary">
                  {caseTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Alt Takip Tipi</label>
                <select name="subType" value={caseData.subType} onChange={handleCaseDataChange}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary">
                  {subTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ana Para (₺)</label>
                <input type="number" name="principalAmount" value={caseData.principalAmount} onChange={handleCaseDataChange}
                  placeholder="0.00" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Faiz Oranı (%)</label>
                <input type="number" name="interestRate" value={caseData.interestRate} onChange={handleCaseDataChange}
                  placeholder="0.00" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notlar</label>
              <textarea name="notes" value={caseData.notes} onChange={handleCaseDataChange} rows={3}
                placeholder="Takip ile ilgili notlar..." className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
            </div>
          </div>
        )}

        {/* Step 2: Avukatlar */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Yetkili Avukatlar</h2>
              <button type="button" onClick={addNewLawyer} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                <Plus className="h-4 w-4" /> Yeni Avukat Ekle
              </button>
            </div>

            {/* Mevcut avukatlardan seç */}
            {existingLawyers.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Mevcut Avukatlardan Seç</label>
                <div className="flex flex-wrap gap-2">
                  {existingLawyers.filter(l => !lawyers.find(sl => sl.id === l.id)).map((lawyer) => (
                    <button key={lawyer.id} type="button" onClick={() => addExistingLawyer(lawyer)}
                      className="px-3 py-1 text-sm border rounded-full hover:bg-primary hover:text-white hover:border-primary">
                      {lawyer.name} {lawyer.surname}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Seçilen avukatlar */}
            {lawyers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Henüz avukat eklenmedi</p>
              </div>
            ) : (
              <div className="space-y-4">
                {lawyers.map((lawyer, index) => (
                  <div key={index} className="border rounded-lg p-4 relative">
                    <button type="button" onClick={() => removeLawyer(index)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
                      <X className="h-5 w-5" />
                    </button>
                    {!lawyer.isNew && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mb-2 inline-block">Mevcut</span>}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Ad</label>
                        <input type="text" value={lawyer.name} onChange={(e) => updateLawyer(index, "name", e.target.value)}
                          disabled={!lawyer.isNew} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Soyad</label>
                        <input type="text" value={lawyer.surname} onChange={(e) => updateLawyer(index, "surname", e.target.value)}
                          disabled={!lawyer.isNew} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Baro Sicil No</label>
                        <input type="text" value={lawyer.barNumber || ""} onChange={(e) => updateLawyer(index, "barNumber", e.target.value)}
                          disabled={!lawyer.isNew} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={lawyer.canSign} onChange={(e) => updateLawyer(index, "canSign", e.target.checked)} className="rounded" />
                        <span className="text-sm">İmza Yetkisi</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Alacaklılar */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Alacaklılar (Müvekkiller)</h2>
              <button type="button" onClick={addNewCreditor} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                <Plus className="h-4 w-4" /> Yeni Alacaklı Ekle
              </button>
            </div>

            {existingClients.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Mevcut Müvekkillerden Seç</label>
                <div className="flex flex-wrap gap-2">
                  {existingClients.filter(c => !creditors.find(sc => sc.id === c.id)).map((client) => (
                    <button key={client.id} type="button" onClick={() => addExistingCreditor(client)}
                      className="px-3 py-1 text-sm border rounded-full hover:bg-primary hover:text-white hover:border-primary">
                      {client.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {creditors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><p>Henüz alacaklı eklenmedi</p></div>
            ) : (
              <div className="space-y-4">
                {creditors.map((creditor, index) => (
                  <PartyForm key={index} party={creditor} index={index} isNew={creditor.isNew || false}
                    onUpdate={(field, value) => updateCreditor(index, field, value)} onRemove={() => removeCreditor(index)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Borçlular */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Borçlular</h2>
              <button type="button" onClick={addNewDebtor} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                <Plus className="h-4 w-4" /> Yeni Borçlu Ekle
              </button>
            </div>

            {existingDebtors.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Mevcut Borçlulardan Seç</label>
                <div className="flex flex-wrap gap-2">
                  {existingDebtors.filter(d => !debtors.find(sd => sd.id === d.id)).map((debtor) => (
                    <button key={debtor.id} type="button" onClick={() => addExistingDebtor(debtor)}
                      className="px-3 py-1 text-sm border rounded-full hover:bg-primary hover:text-white hover:border-primary">
                      {debtor.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {debtors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><p>Henüz borçlu eklenmedi</p></div>
            ) : (
              <div className="space-y-4">
                {debtors.map((debtor, index) => (
                  <PartyForm key={index} party={debtor} index={index} isNew={debtor.isNew || false}
                    onUpdate={(field, value) => updateDebtor(index, field, value)} onRemove={() => removeDebtor(index)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-4 border-t">
          <button type="button" onClick={prevStep} disabled={currentStep === 1}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted disabled:opacity-50">
            <ArrowLeft className="h-4 w-4" /> Geri
          </button>
          {currentStep < steps.length ? (
            <button type="button" onClick={nextStep} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
              İleri <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Oluşturuluyor..." : "Takibi Oluştur"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PartyForm({ party, index, isNew, onUpdate, onRemove }: {
  party: Party; index: number; isNew: boolean;
  onUpdate: (field: keyof Party, value: any) => void; onRemove: () => void;
}) {
  return (
    <div className="border rounded-lg p-4 relative">
      <button type="button" onClick={onRemove} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
        <X className="h-5 w-5" />
      </button>
      {!isNew && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mb-2 inline-block">Mevcut</span>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Tür</label>
          <select value={party.type} onChange={(e) => onUpdate("type", e.target.value)} disabled={!isNew}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50">
            <option value="INDIVIDUAL">Gerçek Kişi</option>
            <option value="COMPANY">Tüzel Kişi</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{party.type === "INDIVIDUAL" ? "Ad Soyad" : "Firma Adı"}</label>
          <input type="text" value={party.name} onChange={(e) => onUpdate("name", e.target.value)} disabled={!isNew}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{party.type === "INDIVIDUAL" ? "TC Kimlik No" : "Vergi No"}</label>
          <input type="text" value={party.identityNo || ""} onChange={(e) => onUpdate("identityNo", e.target.value)} disabled={!isNew}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50" />
        </div>
        {party.type === "COMPANY" && (
          <div>
            <label className="block text-sm font-medium mb-1">Vergi Dairesi</label>
            <input type="text" value={party.taxOffice || ""} onChange={(e) => onUpdate("taxOffice", e.target.value)} disabled={!isNew}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50" />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Telefon</label>
          <input type="tel" value={party.phone || ""} onChange={(e) => onUpdate("phone", e.target.value)} disabled={!isNew}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">E-posta</label>
          <input type="email" value={party.email || ""} onChange={(e) => onUpdate("email", e.target.value)} disabled={!isNew}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Adres</label>
          <textarea value={party.address || ""} onChange={(e) => onUpdate("address", e.target.value)} rows={2} disabled={!isNew}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary resize-none disabled:bg-gray-50" />
        </div>
      </div>
    </div>
  );
}
