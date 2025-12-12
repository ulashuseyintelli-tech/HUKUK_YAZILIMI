"use client";

import { useState, useEffect } from "react";
import { Building2, Users, Plus, Pencil, Trash2, Check, X, Star, CreditCard, Loader2, Mail, MessageSquare } from "lucide-react";
import { api } from "@/lib/api";

interface BankAccount { id: string; bankName: string; branchName?: string; iban: string; accountName?: string; isDefault: boolean; }
interface Lawyer { id: string; name: string; surname: string; tckn?: string; barNumber?: string; barCity?: string; email?: string; phone?: string; role: "OWNER" | "PARTNER" | "EMPLOYEE" | "INTERN"; canSign: boolean; canAppearInUyap: boolean; isDefaultForNewCases: boolean; isActive: boolean; }
interface Office { id: string; name: string; address?: string; city?: string; district?: string; phone?: string; fax?: string; email?: string; barAssociation?: string; bankAccounts: BankAccount[]; lawyers: Lawyer[]; smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string; smtpSecure?: boolean; smtpFromName?: string; smtpFromEmail?: string; }
interface StaffMember { id: string; firstName: string; lastName: string; tckn?: string; email?: string; phone?: string; staffType: string; canCreateCase: boolean; canEditCase: boolean; canGenerateDocuments: boolean; canApproveDocuments: boolean; canSeeFinance: boolean; canApproveFinance: boolean; isActive: boolean; }
interface SmtpSettings { smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string; smtpSecure?: boolean; smtpFromName?: string; smtpFromEmail?: string; }

const STAFF_TYPES = [
  { value: "STAJYER_AVUKAT", label: "Stajyer Av.", color: "bg-blue-100 text-blue-700" },
  { value: "OFIS_KATIBI", label: "Ofis Katibi", color: "bg-green-100 text-green-700" },
  { value: "ADLI_KATIP", label: "Adli Katip", color: "bg-yellow-100 text-yellow-700" },
  { value: "SEKRETER", label: "Sekreter", color: "bg-pink-100 text-pink-700" },
  { value: "MUHASEBE", label: "Muhasebe", color: "bg-orange-100 text-orange-700" },
  { value: "ARSIV", label: "Arşiv", color: "bg-gray-100 text-gray-700" },
  { value: "DIGER", label: "Diğer", color: "bg-gray-100 text-gray-700" },
];

const TITLE_OPTIONS = [
  { value: "", label: "Otomatik" }, { value: "Av.", label: "Av." }, { value: "Stj. Av.", label: "Stj. Av." },
  { value: "Huk. Müş.", label: "Huk. Müş." }, { value: "İcra Kat.", label: "İcra Kat." },
];

export default function OfficeSettingsPage() {
  const [office, setOffice] = useState<Office | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showLawyerModal, setShowLawyerModal] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingLawyer, setEditingLawyer] = useState<Lawyer | null>(null);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [officeForm, setOfficeForm] = useState({ name: "", address: "", city: "", district: "", phone: "", email: "", barAssociation: "" });
  const [smtpForm, setSmtpForm] = useState<SmtpSettings>({ smtpHost: "", smtpPort: 587, smtpUser: "", smtpPass: "", smtpSecure: false, smtpFromName: "", smtpFromEmail: "" });
  const [smsForm, setSmsForm] = useState({ smsProvider: "", smsApiKey: "", smsApiSecret: "", smsSender: "" });
  const [greetingForm, setGreetingForm] = useState({ autoGreetingEnabled: true, autoGreetingTime: "09:00" });
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [smsTestResult, setSmsTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => { loadOffice(); loadStaff(); }, []);

  const loadStaff = async () => {
    try {
      const res = await api.get("/staff");
      setStaffList(res.data?.data || []);
    } catch (e) { console.error("Personel yüklenemedi:", e); }
  };

  const loadOffice = async () => {
    try {
      const res = await api.get("/office");
      setOffice(res.data);
      setOfficeForm({
        name: res.data?.name || "", address: res.data?.address || "", city: res.data?.city || "",
        district: res.data?.district || "", phone: res.data?.phone || "", email: res.data?.email || "",
        barAssociation: res.data?.barAssociation || "",
      });
      // SMTP ayarlarını yükle
      const smtpRes = await api.get("/office/smtp-settings");
      setSmtpForm({
        smtpHost: smtpRes.data?.smtpHost || "",
        smtpPort: smtpRes.data?.smtpPort || 587,
        smtpUser: smtpRes.data?.smtpUser || "",
        smtpPass: "", // Şifre gösterilmez
        smtpSecure: smtpRes.data?.smtpSecure || false,
        smtpFromName: smtpRes.data?.smtpFromName || "",
        smtpFromEmail: smtpRes.data?.smtpFromEmail || "",
      });
      // SMS ayarlarını yükle
      const smsRes = await api.get("/office/sms-settings");
      setSmsForm({
        smsProvider: smsRes.data?.smsProvider || "",
        smsApiKey: "", // Gösterilmez
        smsApiSecret: "", // Gösterilmez
        smsSender: smsRes.data?.smsSender || "",
      });
      // Otomatik tebrik ayarlarını yükle
      const greetingRes = await api.get("/office/greeting-settings");
      setGreetingForm({
        autoGreetingEnabled: greetingRes.data?.autoGreetingEnabled ?? true,
        autoGreetingTime: greetingRes.data?.autoGreetingTime || "09:00",
      });
    } catch (e) { console.error("Büro bilgileri yüklenemedi:", e); }
    finally { setLoading(false); }
  };

  const showSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const handleSaveOffice = async () => {
    setSaving(true);
    try { await api.put("/office", officeForm); showSaved(); } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleSaveSmtp = async () => {
    setSaving(true);
    try {
      const dataToSend = { ...smtpForm };
      if (!dataToSend.smtpPass) delete dataToSend.smtpPass; // Boşsa gönderme
      await api.put("/office/smtp-settings", dataToSend);
      showSaved();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleSaveSms = async () => {
    setSaving(true);
    try {
      const dataToSend = { ...smsForm };
      if (!dataToSend.smsApiKey) delete (dataToSend as any).smsApiKey;
      if (!dataToSend.smsApiSecret) delete (dataToSend as any).smsApiSecret;
      await api.put("/office/sms-settings", dataToSend);
      showSaved();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleSaveGreeting = async () => {
    setSaving(true);
    try {
      await api.put("/office/greeting-settings", greetingForm);
      showSaved();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleTestSms = async () => {
    setTestingSms(true);
    setSmsTestResult(null);
    try {
      const res = await api.post("/client-notifications/test-sms");
      setSmsTestResult({ success: true, message: res.data?.message || "Bağlantı başarılı" });
    } catch (e: any) {
      setSmsTestResult({ success: false, message: e.response?.data?.message || e.message || "Bağlantı hatası" });
    }
    finally { setTestingSms(false); }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const res = await api.post("/client-notifications/test-smtp");
      setSmtpTestResult({ success: true, message: res.data?.message || "Bağlantı başarılı" });
    } catch (e: any) {
      setSmtpTestResult({ success: false, message: e.response?.data?.message || e.message || "Bağlantı hatası" });
    }
    finally { setTestingSmtp(false); }
  };

  const handleSaveLawyer = async (data: any) => {
    setSaving(true);
    try {
      if (editingLawyer?.id) await api.put(`/lawyers/${editingLawyer.id}`, data);
      else await api.post("/lawyers", data);
      await loadOffice(); setShowLawyerModal(false); setEditingLawyer(null); showSaved();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleDeleteLawyer = async (id: string) => {
    if (!confirm("Silmek istediğinize emin misiniz?")) return;
    try { await api.delete(`/lawyers/${id}`); await loadOffice(); showSaved(); } catch (e) { console.error(e); }
  };

  const handleSaveBankAccount = async (data: any) => {
    setSaving(true);
    try {
      if (editingBank?.id) await api.put(`/office/bank-accounts/${editingBank.id}`, data);
      else await api.post("/office/bank-accounts", data);
      await loadOffice(); setShowBankModal(false); setEditingBank(null); showSaved();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleDeleteBankAccount = async (id: string) => {
    if (!confirm("Silmek istediğinize emin misiniz?")) return;
    try { await api.delete(`/office/bank-accounts/${id}`); await loadOffice(); showSaved(); } catch (e) { console.error(e); }
  };

  const handleSaveStaff = async (data: any) => {
    setSaving(true);
    try {
      if (editingStaff?.id) await api.put(`/staff/${editingStaff.id}`, data);
      else await api.post("/staff", data);
      await loadStaff(); setShowStaffModal(false); setEditingStaff(null); showSaved();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm("Silmek istediğinize emin misiniz?")) return;
    try { await api.delete(`/staff/${id}`); await loadStaff(); showSaved(); } catch (e) { console.error(e); }
  };

  const roleLabels: Record<string, string> = { OWNER: "Sahip", PARTNER: "Ortak", EMPLOYEE: "Avukat", INTERN: "Stajyer" };
  const getStaffTypeLabel = (type: string) => STAFF_TYPES.find(t => t.value === type)?.label || type;
  const getStaffTypeColor = (type: string) => STAFF_TYPES.find(t => t.value === type)?.color || "bg-gray-100";

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="h-full flex flex-col gap-3 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Büro Ayarları</h1>
        </div>
        {saved && <span className="text-green-600 text-xs flex items-center gap-1"><Check className="h-3 w-3" />Kaydedildi</span>}
      </div>

      {/* 5 Kolon Layout */}
      <div className="flex-1 grid grid-cols-5 gap-2 min-h-0">
        {/* Büro Bilgileri */}
        <div className="bg-white rounded-lg border p-3 flex flex-col">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1"><Building2 className="h-4 w-4 text-blue-500" />Büro Bilgileri</h2>
          <div className="flex-1 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-muted-foreground">Büro Adı</label><input value={officeForm.name} onChange={e => setOfficeForm({...officeForm, name: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
              <div><label className="text-muted-foreground">Baro</label><input value={officeForm.barAssociation} onChange={e => setOfficeForm({...officeForm, barAssociation: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            </div>
            <div><label className="text-muted-foreground">Adres</label><input value={officeForm.address} onChange={e => setOfficeForm({...officeForm, address: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-muted-foreground">İl</label><input value={officeForm.city} onChange={e => setOfficeForm({...officeForm, city: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
              <div><label className="text-muted-foreground">İlçe</label><input value={officeForm.district} onChange={e => setOfficeForm({...officeForm, district: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
              <div><label className="text-muted-foreground">Telefon</label><input value={officeForm.phone} onChange={e => setOfficeForm({...officeForm, phone: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            </div>
            <div><label className="text-muted-foreground">E-posta</label><input value={officeForm.email} onChange={e => setOfficeForm({...officeForm, email: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
          </div>
          <button onClick={handleSaveOffice} disabled={saving} className="mt-2 px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary/90 disabled:opacity-50">
            {saving ? "..." : "Kaydet"}
          </button>
        </div>

        {/* Banka Hesapları */}
        <div className="bg-white rounded-lg border p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-1"><CreditCard className="h-4 w-4 text-green-500" />Banka Hesapları</h2>
            <button onClick={() => { setEditingBank(null); setShowBankModal(true); }} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />Ekle</button>
          </div>
          <div className="flex-1 space-y-1 overflow-auto">
            {office?.bankAccounts?.map(acc => (
              <div key={acc.id} className="flex items-center justify-between p-2 border rounded text-xs hover:bg-gray-50">
                <div className="flex items-center gap-1">
                  {acc.isDefault && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                  <div><p className="font-medium">{acc.bankName}</p><p className="text-muted-foreground font-mono text-[10px]">{acc.iban}</p></div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingBank(acc); setShowBankModal(true); }} className="p-1 hover:bg-gray-200 rounded"><Pencil className="h-3 w-3 text-gray-500" /></button>
                  <button onClick={() => handleDeleteBankAccount(acc.id)} className="p-1 hover:bg-red-100 rounded"><Trash2 className="h-3 w-3 text-red-500" /></button>
                </div>
              </div>
            ))}
            {(!office?.bankAccounts || office.bankAccounts.length === 0) && <p className="text-xs text-muted-foreground text-center py-4">Hesap yok</p>}
          </div>
        </div>

        {/* Avukatlar */}
        <div className="bg-white rounded-lg border p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-1"><Users className="h-4 w-4 text-purple-500" />Avukatlar</h2>
            <button onClick={() => { setEditingLawyer(null); setShowLawyerModal(true); }} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />Ekle</button>
          </div>
          <div className="flex-1 overflow-auto">
            {office?.lawyers?.map(lawyer => (
              <div key={lawyer.id} className="flex items-center justify-between p-2 border-b text-xs hover:bg-gray-50">
                <div>
                  <p className="font-medium">{(lawyer as any).displayName || `${(lawyer as any).title || "Av."} ${lawyer.name} ${lawyer.surname}`}</p>
                  <p className="text-muted-foreground">{lawyer.barNumber || "-"} • <span className={`px-1 rounded ${lawyer.role === "OWNER" ? "bg-purple-100 text-purple-700" : "bg-gray-100"}`}>{roleLabels[lawyer.role]}</span></p>
                </div>
                <div className="flex items-center gap-1">
                  {lawyer.canSign && <Check className="h-3 w-3 text-green-500" />}
                  {lawyer.isDefaultForNewCases && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                  <button onClick={() => { setEditingLawyer(lawyer); setShowLawyerModal(true); }} className="p-1 hover:bg-gray-200 rounded"><Pencil className="h-3 w-3 text-gray-500" /></button>
                  <button onClick={() => handleDeleteLawyer(lawyer.id)} className="p-1 hover:bg-red-100 rounded"><Trash2 className="h-3 w-3 text-red-500" /></button>
                </div>
              </div>
            ))}
            {(!office?.lawyers || office.lawyers.length === 0) && <p className="text-xs text-muted-foreground text-center py-4">Avukat yok</p>}
          </div>
        </div>

        {/* Personel */}
        <div className="bg-white rounded-lg border p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-1"><Users className="h-4 w-4 text-orange-500" />Personel</h2>
            <button onClick={() => { setEditingStaff(null); setShowStaffModal(true); }} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />Ekle</button>
          </div>
          <div className="flex-1 overflow-auto">
            {staffList.map(staff => (
              <div key={staff.id} className="flex items-center justify-between p-2 border-b text-xs hover:bg-gray-50">
                <div>
                  <p className="font-medium">{staff.firstName} {staff.lastName}</p>
                  <p className="text-muted-foreground"><span className={`px-1 rounded ${getStaffTypeColor(staff.staffType)}`}>{getStaffTypeLabel(staff.staffType)}</span></p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditingStaff(staff); setShowStaffModal(true); }} className="p-1 hover:bg-gray-200 rounded"><Pencil className="h-3 w-3 text-gray-500" /></button>
                  <button onClick={() => handleDeleteStaff(staff.id)} className="p-1 hover:bg-red-100 rounded"><Trash2 className="h-3 w-3 text-red-500" /></button>
                </div>
              </div>
            ))}
            {staffList.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Personel yok</p>}
          </div>
        </div>

        {/* İletişim Ayarları (E-posta + SMS) */}
        <div className="bg-white rounded-lg border p-3 flex flex-col">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1"><Mail className="h-4 w-4 text-red-500" />İletişim Ayarları</h2>
          <div className="flex-1 space-y-3 text-xs overflow-auto">
            {/* E-posta (SMTP) */}
            <div className="p-2 border rounded bg-gray-50">
              <p className="font-medium text-gray-700 mb-2">📧 E-posta (SMTP)</p>
              <div className="space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  <input value={smtpForm.smtpHost || ""} onChange={e => setSmtpForm({...smtpForm, smtpHost: e.target.value})} placeholder="SMTP Sunucu" className="border rounded px-2 py-1 text-xs" />
                  <input type="number" value={smtpForm.smtpPort || 587} onChange={e => setSmtpForm({...smtpForm, smtpPort: parseInt(e.target.value)})} placeholder="Port" className="border rounded px-2 py-1 text-xs" />
                </div>
                <input value={smtpForm.smtpUser || ""} onChange={e => setSmtpForm({...smtpForm, smtpUser: e.target.value})} placeholder="Kullanıcı (E-posta)" className="w-full border rounded px-2 py-1 text-xs" />
                <input type="password" value={smtpForm.smtpPass || ""} onChange={e => setSmtpForm({...smtpForm, smtpPass: e.target.value})} placeholder="Şifre" className="w-full border rounded px-2 py-1 text-xs" />
                <div className="grid grid-cols-2 gap-1">
                  <input value={smtpForm.smtpFromName || ""} onChange={e => setSmtpForm({...smtpForm, smtpFromName: e.target.value})} placeholder="Gönderen Adı" className="border rounded px-2 py-1 text-xs" />
                  <input value={smtpForm.smtpFromEmail || ""} onChange={e => setSmtpForm({...smtpForm, smtpFromEmail: e.target.value})} placeholder="Gönderen E-posta" className="border rounded px-2 py-1 text-xs" />
                </div>
                {smtpTestResult && <div className={`p-1 rounded text-xs ${smtpTestResult.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{smtpTestResult.message}</div>}
                <div className="flex gap-1">
                  <button onClick={handleTestSmtp} disabled={testingSmtp || !smtpForm.smtpHost} className="flex-1 px-2 py-1 border text-xs rounded hover:bg-white disabled:opacity-50">{testingSmtp ? "..." : "Test"}</button>
                  <button onClick={handleSaveSmtp} disabled={saving} className="flex-1 px-2 py-1 bg-blue-500 text-white text-xs rounded disabled:opacity-50">{saving ? "..." : "Kaydet"}</button>
                </div>
              </div>
            </div>
            {/* SMS */}
            <div className="p-2 border rounded bg-gray-50">
              <p className="font-medium text-gray-700 mb-2">📱 SMS</p>
              <div className="space-y-1">
                <select value={smsForm.smsProvider} onChange={e => setSmsForm({...smsForm, smsProvider: e.target.value})} className="w-full border rounded px-2 py-1 text-xs">
                  <option value="">SMS Sağlayıcı Seçin</option>
                  <option value="NETGSM">NetGSM</option>
                  <option value="ILETI_MERKEZI">İleti Merkezi</option>
                </select>
                <input value={smsForm.smsApiKey} onChange={e => setSmsForm({...smsForm, smsApiKey: e.target.value})} placeholder="API Key / Kullanıcı Kodu" className="w-full border rounded px-2 py-1 text-xs" />
                <input type="password" value={smsForm.smsApiSecret} onChange={e => setSmsForm({...smsForm, smsApiSecret: e.target.value})} placeholder="API Secret / Şifre" className="w-full border rounded px-2 py-1 text-xs" />
                <input value={smsForm.smsSender} onChange={e => setSmsForm({...smsForm, smsSender: e.target.value})} placeholder="Gönderen Adı (Başlık)" className="w-full border rounded px-2 py-1 text-xs" />
                {smsTestResult && <div className={`p-1 rounded text-xs ${smsTestResult.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{smsTestResult.message}</div>}
                <div className="flex gap-1">
                  <button onClick={handleTestSms} disabled={testingSms || !smsForm.smsProvider} className="flex-1 px-2 py-1 border text-xs rounded hover:bg-white disabled:opacity-50">{testingSms ? "..." : "Test"}</button>
                  <button onClick={handleSaveSms} disabled={saving} className="flex-1 px-2 py-1 bg-green-500 text-white text-xs rounded disabled:opacity-50">{saving ? "..." : "Kaydet"}</button>
                </div>
              </div>
            </div>
            {/* Otomatik Tebrik */}
            <div className="p-2 border rounded bg-purple-50">
              <p className="font-medium text-purple-700 mb-2">🎂 Otomatik Tebrik</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={greetingForm.autoGreetingEnabled} 
                    onChange={e => setGreetingForm({...greetingForm, autoGreetingEnabled: e.target.checked})} 
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-xs">Otomatik tebrik gönderimi aktif</span>
                </label>
                <div>
                  <label className="text-xs text-gray-600">Gönderim Saati</label>
                  <input 
                    type="time" 
                    value={greetingForm.autoGreetingTime} 
                    onChange={e => setGreetingForm({...greetingForm, autoGreetingTime: e.target.value})} 
                    className="w-full border rounded px-2 py-1 text-xs"
                    disabled={!greetingForm.autoGreetingEnabled}
                  />
                </div>
                <p className="text-[10px] text-gray-500">Doğum günü, kuruluş yıldönümü, vekalet yıldönümü ve bayram tebrikleri otomatik gönderilir.</p>
                <button onClick={handleSaveGreeting} disabled={saving} className="w-full px-2 py-1 bg-purple-500 text-white text-xs rounded disabled:opacity-50">{saving ? "..." : "Kaydet"}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showLawyerModal && <LawyerModal lawyer={editingLawyer} onSave={handleSaveLawyer} onClose={() => { setShowLawyerModal(false); setEditingLawyer(null); }} saving={saving} />}
      {showBankModal && <BankModal account={editingBank} onSave={handleSaveBankAccount} onClose={() => { setShowBankModal(false); setEditingBank(null); }} saving={saving} />}
      {showStaffModal && <StaffModal staff={editingStaff} onSave={handleSaveStaff} onClose={() => { setShowStaffModal(false); setEditingStaff(null); }} saving={saving} />}
    </div>
  );
}


// Avukat Modal
function LawyerModal({ lawyer, onSave, onClose, saving }: { lawyer: any; onSave: (data: any) => void; onClose: () => void; saving: boolean }) {
  const [form, setForm] = useState({
    name: lawyer?.name || "", surname: lawyer?.surname || "", tckn: lawyer?.tckn || "",
    title: lawyer?.title || "", barNumber: lawyer?.barNumber || "", barCity: lawyer?.barCity || "",
    vergiNo: lawyer?.vergiNo || "", email: lawyer?.email || "", phone: lawyer?.phone || "",
    bankName: lawyer?.bankName || "", iban: lawyer?.iban || "",
    role: lawyer?.role || "EMPLOYEE", canSign: lawyer?.canSign || false,
    canAppearInUyap: lawyer?.canAppearInUyap || false, isDefaultForNewCases: lawyer?.isDefaultForNewCases || false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.surname.trim()) { alert("Ad ve Soyad zorunlu"); return; }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 w-full max-w-lg">
        <div className="flex justify-between mb-3">
          <h3 className="font-semibold">{lawyer ? "Avukat Düzenle" : "Yeni Avukat"}</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-4 gap-2">
            <div><label>Ad *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required className="w-full border rounded px-2 py-1" /></div>
            <div><label>Soyad *</label><input value={form.surname} onChange={e => setForm({...form, surname: e.target.value})} required className="w-full border rounded px-2 py-1" /></div>
            <div><label>TCKN</label><input value={form.tckn} onChange={e => setForm({...form, tckn: e.target.value.replace(/\D/g, "")})} maxLength={11} className="w-full border rounded px-2 py-1" /></div>
            <div><label>Vergi No</label><input value={form.vergiNo} onChange={e => setForm({...form, vergiNo: e.target.value.replace(/\D/g, "")})} maxLength={10} className="w-full border rounded px-2 py-1" /></div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div><label>Unvan</label><select value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full border rounded px-1 py-1"><option value="">Oto</option><option value="Av.">Av.</option><option value="Stj. Av.">Stj. Av.</option></select></div>
            <div><label>Rol</label><select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="w-full border rounded px-1 py-1"><option value="OWNER">Sahip</option><option value="PARTNER">Ortak</option><option value="EMPLOYEE">Avukat</option><option value="INTERN">Stajyer</option></select></div>
            <div><label>Baro Sicil</label><input value={form.barNumber} onChange={e => setForm({...form, barNumber: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            <div><label>Baro</label><input value={form.barCity} onChange={e => setForm({...form, barCity: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label>E-posta</label><input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            <div><label>Telefon</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label>Banka</label><input value={form.bankName} onChange={e => setForm({...form, bankName: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            <div><label>IBAN</label><input value={form.iban} onChange={e => setForm({...form, iban: e.target.value.toUpperCase()})} className="w-full border rounded px-2 py-1 font-mono" /></div>
          </div>
          <div className="flex gap-4 pt-2 border-t">
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.canSign} onChange={e => setForm({...form, canSign: e.target.checked})} />İmza yetkisi</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.canAppearInUyap} onChange={e => setForm({...form, canAppearInUyap: e.target.checked})} />UYAP</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.isDefaultForNewCases} onChange={e => setForm({...form, isDefaultForNewCases: e.target.checked})} />Varsayılan</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1 border rounded">İptal</button>
            <button type="submit" disabled={saving} className="px-3 py-1 bg-primary text-white rounded disabled:opacity-50">{saving ? "..." : "Kaydet"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Banka Modal
function BankModal({ account, onSave, onClose, saving }: { account: any; onSave: (data: any) => void; onClose: () => void; saving: boolean }) {
  const [form, setForm] = useState({
    bankName: account?.bankName || "", branchName: account?.branchName || "",
    iban: account?.iban || "", accountName: account?.accountName || "", isDefault: account?.isDefault || false,
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(form); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 w-full max-w-sm">
        <div className="flex justify-between mb-3">
          <h3 className="font-semibold">{account ? "Hesap Düzenle" : "Yeni Hesap"}</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div><label>Banka *</label><input value={form.bankName} onChange={e => setForm({...form, bankName: e.target.value})} required className="w-full border rounded px-2 py-1" /></div>
            <div><label>Şube</label><input value={form.branchName} onChange={e => setForm({...form, branchName: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
          </div>
          <div><label>IBAN *</label><input value={form.iban} onChange={e => setForm({...form, iban: e.target.value.toUpperCase().replace(/\s/g, "")})} required className="w-full border rounded px-2 py-1 font-mono" /></div>
          <div><label>Hesap Sahibi</label><input value={form.accountName} onChange={e => setForm({...form, accountName: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
          <label className="flex items-center gap-1"><input type="checkbox" checked={form.isDefault} onChange={e => setForm({...form, isDefault: e.target.checked})} />Varsayılan hesap</label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1 border rounded">İptal</button>
            <button type="submit" disabled={saving} className="px-3 py-1 bg-primary text-white rounded disabled:opacity-50">{saving ? "..." : "Kaydet"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Personel Modal
function StaffModal({ staff, onSave, onClose, saving }: { staff: any; onSave: (data: any) => void; onClose: () => void; saving: boolean }) {
  const [form, setForm] = useState({
    firstName: staff?.firstName || "", lastName: staff?.lastName || "", tckn: staff?.tckn || "",
    email: staff?.email || "", phone: staff?.phone || "", staffType: staff?.staffType || "DIGER",
    canCreateCase: staff?.canCreateCase || false, canEditCase: staff?.canEditCase || false,
    canGenerateDocuments: staff?.canGenerateDocuments || false, canApproveDocuments: staff?.canApproveDocuments || false,
    canSeeFinance: staff?.canSeeFinance || false, canApproveFinance: staff?.canApproveFinance || false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) { alert("Ad ve Soyad zorunlu"); return; }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 w-full max-w-md">
        <div className="flex justify-between mb-3">
          <h3 className="font-semibold">{staff ? "Personel Düzenle" : "Yeni Personel"}</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div><label>Ad *</label><input value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} required className="w-full border rounded px-2 py-1" /></div>
            <div><label>Soyad *</label><input value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} required className="w-full border rounded px-2 py-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label>TCKN</label><input value={form.tckn} onChange={e => setForm({...form, tckn: e.target.value.replace(/\D/g, "")})} maxLength={11} className="w-full border rounded px-2 py-1" /></div>
            <div>
              <label>Personel Türü *</label>
              <select value={form.staffType} onChange={e => setForm({...form, staffType: e.target.value})} className="w-full border rounded px-2 py-1">
                {STAFF_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label>E-posta</label><input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            <div><label>Telefon</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
          </div>
          <div className="pt-2 border-t">
            <p className="font-medium mb-2">Yetkiler</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.canCreateCase} onChange={e => setForm({...form, canCreateCase: e.target.checked})} />Dosya oluşturabilir</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.canEditCase} onChange={e => setForm({...form, canEditCase: e.target.checked})} />Dosya düzenleyebilir</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.canGenerateDocuments} onChange={e => setForm({...form, canGenerateDocuments: e.target.checked})} />Belge hazırlayabilir</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.canApproveDocuments} onChange={e => setForm({...form, canApproveDocuments: e.target.checked})} />Belge onaylayabilir</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.canSeeFinance} onChange={e => setForm({...form, canSeeFinance: e.target.checked})} />Muhasebe görebilir</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.canApproveFinance} onChange={e => setForm({...form, canApproveFinance: e.target.checked})} />Muhasebe onaylayabilir</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1 border rounded">İptal</button>
            <button type="submit" disabled={saving} className="px-3 py-1 bg-primary text-white rounded disabled:opacity-50">{saving ? "..." : "Kaydet"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
