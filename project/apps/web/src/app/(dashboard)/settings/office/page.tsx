"use client";

import { useState, useEffect } from "react";
import { Building2, Users, Plus, Pencil, Trash2, Check, X, Star, CreditCard, Loader2, Mail, MessageSquare, GripVertical } from "lucide-react";
import { api } from "@/lib/api";

interface BankAccount { id: string; bankName: string; branchName?: string; iban: string; accountName?: string; isDefault: boolean; }
interface Lawyer { 
  id: string; 
  name: string; 
  surname: string; 
  tckn?: string; 
  barNumber?: string; 
  barCity?: string; 
  email?: string; 
  phone?: string; 
  fax?: string;
  address?: string;
  bankName?: string;
  branchName?: string;
  iban?: string;
  vergiNo?: string;
  title?: string;
  role: "OWNER" | "PARTNER" | "EMPLOYEE" | "INTERN"; 
  lawyerRank?: "PARTNER" | "MANAGER" | "AUTHORIZED" | "LAWYER" | "INTERN";
  defaultPermissions?: {
    canEditCase?: boolean;
    canGenerateDocs?: boolean;
    canSyncUYAP?: boolean;
    canViewFinance?: boolean;
    canEditFinance?: boolean;
    canChangeStatus?: boolean;
    canEditParties?: boolean;
  };
  permissionsLocked?: boolean;
  canModifyOtherPermissions?: boolean;
  canSign: boolean; 
  canAppearInUyap: boolean; 
  isDefaultForNewCases: boolean; 
  isActive: boolean; 
}
interface Office { id: string; name: string; address?: string; city?: string; district?: string; phone?: string; fax?: string; email?: string; barAssociation?: string; bankAccounts: BankAccount[]; lawyers: Lawyer[]; smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string; smtpSecure?: boolean; smtpFromName?: string; smtpFromEmail?: string; }
interface StaffMember { id: string; firstName: string; lastName: string; tckn?: string; email?: string; phone?: string; staffType: string; canCreateCase: boolean; canEditCase: boolean; canGenerateDocuments: boolean; canApproveDocuments: boolean; canSeeFinance: boolean; canApproveFinance: boolean; isActive: boolean; isDefaultForNewCases?: boolean; }
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
  // Office bölümüne özel belirgin geri bildirim (paylaşılan saved/saving'e dokunmadan)
  const [officeStatus, setOfficeStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showLawyerModal, setShowLawyerModal] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingLawyer, setEditingLawyer] = useState<Lawyer | null>(null);
  // PR-U1: avukat UPDATE-path benzer-isim review — { candidates, data(yeniden PUT için) }
  const [lawyerSimilar, setLawyerSimilar] = useState<{ candidates: { id: string; name: string }[]; data: any } | null>(null);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  // PR-S: kimliksiz benzer-isim review (personel) — { candidates, data(yeniden POST için form) }
  const [staffSimilar, setStaffSimilar] = useState<{ candidates: { id: string; name: string }[]; data: any } | null>(null);
  // PR-U3: personel UPDATE-path benzer-isim review — 2 buton (güncelle/vazgeç). Create'ten ayrı.
  const [staffUpdateReview, setStaffUpdateReview] = useState<{ candidates: { id: string; name: string }[]; data: any } | null>(null);
  const [officeForm, setOfficeForm] = useState({ name: "", address: "", city: "", district: "", phone: "", email: "", barAssociation: "" });
  const [smtpForm, setSmtpForm] = useState<SmtpSettings>({ smtpHost: "", smtpPort: 587, smtpUser: "", smtpPass: "", smtpSecure: false, smtpFromName: "", smtpFromEmail: "" });
  const [smsForm, setSmsForm] = useState({ smsProvider: "", smsApiKey: "", smsApiSecret: "", smsSender: "" });
  const [greetingForm, setGreetingForm] = useState({ autoGreetingEnabled: true, autoGreetingTime: "09:00" });
  const [escalationForm, setEscalationForm] = useState<{ escalationManagerLawyerIds: string[]; escalationFounderLawyerIds: string[]; opReminderDays: number; opFounderDays: number; opRepeatMonths: number; opEmailEnabled: boolean; opSmsEnabled: boolean; opStaffTypes: string[] }>({ escalationManagerLawyerIds: [], escalationFounderLawyerIds: [], opReminderDays: 3, opFounderDays: 6, opRepeatMonths: 3, opEmailEnabled: true, opSmsEnabled: true, opStaffTypes: ["MUHASEBE", "ADLI_KATIP", "SEKRETER"] });
  // Eskalasyon kartı sağ-altta; üstteki global "Kaydedildi" görünmüyor → karta özel inline geri bildirim
  const [escalationStatus, setEscalationStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [smsTestResult, setSmsTestResult] = useState<{ status: "verified" | "unverified" | "error"; message: string } | null>(null);

  useEffect(() => { loadOffice(); loadStaff(); }, []);

  const loadStaff = async () => {
    try {
      const res = await api.get("/staff");
      console.log('Staff API yanıtı:', res.data);
      // isDefaultForNewCases alanı undefined ise false olarak ayarla
      const staffData = (res.data?.data || []).map((s: any) => ({
        ...s,
        isDefaultForNewCases: Boolean(s.isDefaultForNewCases),
      }));
      console.log('İşlenmiş staff verisi:', staffData.map((s: any) => ({ id: s.id, name: s.firstName, isDefault: s.isDefaultForNewCases })));
      setStaffList([...staffData]); // Yeni array referansı oluştur
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
      // Görev & eskalasyon ayarlarını yükle
      const escRes = await api.get("/office/escalation-settings");
      setEscalationForm({
        escalationManagerLawyerIds: escRes.data?.escalationManagerLawyerIds || [],
        escalationFounderLawyerIds: escRes.data?.escalationFounderLawyerIds || [],
        opReminderDays: escRes.data?.opReminderDays ?? 3,
        opFounderDays: escRes.data?.opFounderDays ?? 6,
        opRepeatMonths: escRes.data?.opRepeatMonths ?? 3,
        opEmailEnabled: escRes.data?.opEmailEnabled ?? true,
        opSmsEnabled: escRes.data?.opSmsEnabled ?? true,
        opStaffTypes: escRes.data?.opStaffTypes || ["MUHASEBE", "ADLI_KATIP", "SEKRETER"],
      });
    } catch (e) { console.error("Büro bilgileri yüklenemedi:", e); }
    finally { setLoading(false); }
  };

  const showSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const handleSaveOffice = async () => {
    setSaving(true);
    setOfficeStatus(null); // yeni denemede önceki (özellikle error) temizlenir
    try {
      await api.put("/office", officeForm);
      showSaved();
      setOfficeStatus({ ok: true, msg: "Kaydedildi" });
      // success 3 sn sonra kaybolur; bu sırada gelen bir error'ı SİLME (yalnız ok ise temizle)
      setTimeout(() => setOfficeStatus((s) => (s?.ok ? null : s)), 3000);
    } catch (e: any) {
      console.error(e);
      setOfficeStatus({ ok: false, msg: e?.response?.data?.message || e?.message || "Kaydedilemedi" });
    } finally {
      setSaving(false);
    }
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

  const handleSaveEscalation = async () => {
    setSaving(true);
    setEscalationStatus(null);
    try {
      await api.put("/office/escalation-settings", {
        ...escalationForm,
        opReminderDays: Number(escalationForm.opReminderDays),
        opFounderDays: Number(escalationForm.opFounderDays),
        opRepeatMonths: Number(escalationForm.opRepeatMonths),
      });
      showSaved();
      setEscalationStatus({ ok: true, msg: "✓ Kaydedildi" });
      setTimeout(() => setEscalationStatus((s) => (s?.ok ? null : s)), 3000);
    } catch (e: any) {
      console.error(e);
      setEscalationStatus({ ok: false, msg: "✗ Kaydedilemedi: " + (e?.response?.data?.message || e?.message || "hata") });
    }
    finally { setSaving(false); }
  };

  const handleTestSms = async () => {
    setTestingSms(true);
    setSmsTestResult(null);
    try {
      const res = await api.post("/client-notifications/test-sms");
      // Backend dürüst durum döner: verified (gerçek doğrulama) / unverified (test edilmedi) / error
      const status = (res.data?.status as "verified" | "unverified" | "error") || "unverified";
      setSmsTestResult({ status, message: res.data?.message || "Sonuç alınamadı" });
    } catch (e: any) {
      setSmsTestResult({ status: "error", message: e.response?.data?.message || e.message || "Bağlantı hatası" });
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

  // PR-U1: confirmSimilarNameUpdate=true → "Benzerliğe rağmen güncelle" (isim review'ını bilinçli geç).
  const submitLawyer = async (data: any, confirmSimilarNameUpdate: boolean) => {
    setSaving(true);
    try {
      if (editingLawyer?.id) await api.put(`/lawyers/${editingLawyer.id}`, { ...data, confirmSimilarNameUpdate });
      else {
        const res = await api.post("/lawyers", data);
        const body = (res as any)?.data?.data ?? (res as any)?.data;
        if (body?._existingReturned) alert("Bu avukat zaten kayıtlı; yeni kayıt açılmadı, mevcut kayıt kullanıldı.");
      }
      await loadOffice(); setShowLawyerModal(false); setEditingLawyer(null); setLawyerSimilar(null); showSaved();
    } catch (e: any) {
      // PR-U1: isim benzerliği → review diyaloğu (güncellemeyi onayla/vazgeç). Kimlik collision → hard block.
      if (e?.body?.code === "SIMILAR_NAME_REVIEW") { setLawyerSimilar({ candidates: e.body.candidates || [], data }); return; }
      if (e?.body?.code === "DUPLICATE_IDENTITY") { alert(e.body.message || "Bu kimlik/baro numarasına sahip başka bir avukat mevcut."); return; }
      console.error(e);
    } finally { setSaving(false); }
  };

  const handleSaveLawyer = (data: any) => submitLawyer(data, false);

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

  // PR-S/PR-U3: benzer-isim review. create: forceCreate ("Ayrı kişi olarak kaydet").
  // update: confirmSimilarNameUpdate ("Benzerliğe rağmen güncelle").
  const submitStaff = async (data: any, opts: { forceCreate?: boolean; confirmSimilarNameUpdate?: boolean } = {}) => {
    setSaving(true);
    try {
      if (editingStaff?.id) await api.put(`/staff/${editingStaff.id}`, { ...data, confirmSimilarNameUpdate: opts.confirmSimilarNameUpdate });
      else {
        const res = await api.post("/staff", { ...data, forceCreate: opts.forceCreate });
        const body = (res as any)?.data?.data ?? (res as any)?.data;
        if (body?._existingReturned) alert("Bu personel zaten kayıtlı; yeni kayıt açılmadı, mevcut kayıt kullanıldı.");
      }
      await loadStaff(); setShowStaffModal(false); setEditingStaff(null); setStaffSimilar(null); setStaffUpdateReview(null); showSaved();
    } catch (e: any) {
      // benzer-isim → review diyaloğu (otomatik kaydetme yok). create=3 buton, update=2 buton.
      if (e?.body?.code === "SIMILAR_NAME_REVIEW") {
        if (editingStaff?.id) setStaffUpdateReview({ candidates: e.body.candidates || [], data });
        else setStaffSimilar({ candidates: e.body.candidates || [], data });
        return;
      }
      if (e?.body?.code === "DUPLICATE_IDENTITY") { alert(e.body.message || "Bu TCKN ile kayıtlı başka bir personel mevcut."); return; }
      console.error(e);
    } finally { setSaving(false); }
  };

  const handleSaveStaff = (data: any) => submitStaff(data, {});

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
          <div className="mt-2 flex items-center gap-2">
            <button onClick={handleSaveOffice} disabled={saving} className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary/90 disabled:opacity-50">
              {saving ? "..." : "Kaydet"}
            </button>
            {officeStatus && (
              <span className={`text-xs inline-flex items-center gap-1 ${officeStatus.ok ? "text-green-600" : "text-red-600"}`}>
                {officeStatus.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {officeStatus.ok ? "Kaydedildi" : `Kaydedilemedi: ${officeStatus.msg}`}
              </span>
            )}
          </div>
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
            {office?.lawyers?.map((lawyer, index) => (
              <div 
                key={lawyer.id} 
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('lawyerId', lawyer.id);
                  e.dataTransfer.setData('lawyerIndex', index.toString());
                  e.currentTarget.classList.add('opacity-50');
                }}
                onDragEnd={(e) => {
                  e.currentTarget.classList.remove('opacity-50');
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('bg-purple-100', 'border-purple-400');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('bg-purple-100', 'border-purple-400');
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('bg-purple-100', 'border-purple-400');
                  const draggedId = e.dataTransfer.getData('lawyerId');
                  const draggedIndex = parseInt(e.dataTransfer.getData('lawyerIndex'));
                  if (draggedId === lawyer.id) return;
                  
                  // Yeni sıralama oluştur
                  const lawyers = [...(office?.lawyers || [])];
                  const [draggedLawyer] = lawyers.splice(draggedIndex, 1);
                  lawyers.splice(index, 0, draggedLawyer);
                  
                  // API'ye gönder
                  try {
                    await api.put('/lawyers/order/update', { lawyerIds: lawyers.map(l => l.id) });
                    await loadOffice();
                    showSaved();
                  } catch (err) { console.error(err); }
                }}
                className={`flex items-center justify-between p-2 border-b text-xs hover:bg-gray-50 cursor-move transition-colors ${lawyer.isDefaultForNewCases ? 'bg-amber-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-3 w-3 text-gray-400 cursor-grab active:cursor-grabbing" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <p className="font-medium">{(lawyer as any).displayName || `${(lawyer as any).title || "Av."} ${lawyer.name} ${lawyer.surname}`}</p>
                    </div>
                    <p className="text-muted-foreground">{lawyer.barNumber || "-"} • <span className={`px-1 rounded ${lawyer.role === "OWNER" ? "bg-purple-100 text-purple-700" : "bg-gray-100"}`}>{roleLabels[lawyer.role]}</span></p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Varsayılan Seç Butonu */}
                  <button 
                    onClick={async () => {
                      try {
                        await api.put(`/lawyers/${lawyer.id}`, { isDefaultForNewCases: !lawyer.isDefaultForNewCases });
                        await loadOffice();
                        showSaved();
                      } catch (e) { console.error(e); }
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      lawyer.isDefaultForNewCases 
                        ? 'bg-amber-500 text-white hover:bg-amber-600' 
                        : 'bg-gray-100 text-gray-600 hover:bg-amber-100 hover:text-amber-700'
                    }`}
                    title={lawyer.isDefaultForNewCases ? "Varsayılandan çıkar" : "Varsayılan yap"}
                  >
                    {lawyer.isDefaultForNewCases ? '⭐ Varsayılan' : '☆ Seç'}
                  </button>
                  <button onClick={() => { setEditingLawyer(lawyer); setShowLawyerModal(true); }} className="p-1 hover:bg-gray-200 rounded"><Pencil className="h-3 w-3 text-gray-500" /></button>
                  <button onClick={() => handleDeleteLawyer(lawyer.id)} className="p-1 hover:bg-red-100 rounded"><Trash2 className="h-3 w-3 text-red-500" /></button>
                </div>
              </div>
            ))}
            {(!office?.lawyers || office.lawyers.length === 0) && <p className="text-xs text-muted-foreground text-center py-4">Avukat yok</p>}
          </div>
          {/* Sıralama ve varsayılan bilgisi */}
          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-[10px] text-blue-700">
            💡 Sürükle-bırak ile sıralayın. "⭐ Varsayılan" avukatlar yeni takiplerde otomatik seçilir.
          </div>
        </div>

        {/* Personel */}
        <div className="bg-white rounded-lg border p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-1"><Users className="h-4 w-4 text-orange-500" />Personel</h2>
            <button onClick={() => { setEditingStaff(null); setShowStaffModal(true); }} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />Ekle</button>
          </div>
          <div className="flex-1 overflow-auto">
            {staffList.map((staff, index) => (
              <div 
                key={staff.id} 
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('staffId', staff.id);
                  e.dataTransfer.setData('staffIndex', index.toString());
                  e.currentTarget.classList.add('opacity-50');
                }}
                onDragEnd={(e) => {
                  e.currentTarget.classList.remove('opacity-50');
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('bg-orange-100', 'border-orange-400');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('bg-orange-100', 'border-orange-400');
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('bg-orange-100', 'border-orange-400');
                  const draggedId = e.dataTransfer.getData('staffId');
                  const draggedIndex = parseInt(e.dataTransfer.getData('staffIndex'));
                  if (draggedId === staff.id) return;
                  
                  // Yeni sıralama oluştur
                  const newList = [...staffList];
                  const [draggedStaff] = newList.splice(draggedIndex, 1);
                  newList.splice(index, 0, draggedStaff);
                  
                  // Optimistic update
                  setStaffList(newList);
                  
                  // API'ye gönder
                  try {
                    await api.put('/staff/order/update', { staffIds: newList.map(s => s.id) });
                    showSaved();
                  } catch (err) { 
                    console.error(err); 
                    // Hata durumunda geri al
                    await loadStaff();
                  }
                }}
                className={`flex items-center justify-between p-2 border-b text-xs hover:bg-gray-50 cursor-move transition-colors ${staff.isDefaultForNewCases ? 'bg-amber-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-3 w-3 text-gray-400 cursor-grab active:cursor-grabbing" />
                  <div>
                    <p className="font-medium">{staff.firstName} {staff.lastName}</p>
                    <p className="text-muted-foreground"><span className={`px-1 rounded ${getStaffTypeColor(staff.staffType)}`}>{getStaffTypeLabel(staff.staffType)}</span></p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Varsayılan Seç Butonu */}
                  <button 
                    onClick={async () => {
                      const newValue = !staff.isDefaultForNewCases;
                      
                      // Optimistic update
                      setStaffList(prev => prev.map(s => 
                        s.id === staff.id ? { ...s, isDefaultForNewCases: newValue } : s
                      ));
                      
                      try {
                        await api.put(`/staff/${staff.id}`, { isDefaultForNewCases: newValue });
                        showSaved();
                      } catch (e) { 
                        console.error(e);
                        // Hata durumunda geri al
                        setStaffList(prev => prev.map(s => 
                          s.id === staff.id ? { ...s, isDefaultForNewCases: !newValue } : s
                        ));
                      }
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      staff.isDefaultForNewCases 
                        ? 'bg-amber-500 text-white hover:bg-amber-600' 
                        : 'bg-gray-100 text-gray-600 hover:bg-amber-100 hover:text-amber-700'
                    }`}
                    title={staff.isDefaultForNewCases ? "Varsayılandan çıkar" : "Varsayılan yap"}
                  >
                    {staff.isDefaultForNewCases ? '⭐ Varsayılan' : '☆ Seç'}
                  </button>
                  <button onClick={() => { setEditingStaff(staff); setShowStaffModal(true); }} className="p-1 hover:bg-gray-200 rounded"><Pencil className="h-3 w-3 text-gray-500" /></button>
                  <button onClick={() => handleDeleteStaff(staff.id)} className="p-1 hover:bg-red-100 rounded"><Trash2 className="h-3 w-3 text-red-500" /></button>
                </div>
              </div>
            ))}
            {staffList.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Personel yok</p>}
          </div>
          {/* Sıralama ve varsayılan bilgisi */}
          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-[10px] text-blue-700">
            💡 Sürükle-bırak ile sıralayın. "⭐ Varsayılan" personeller yeni takiplerde otomatik seçilir.
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
                {smsTestResult && <div className={`p-1 rounded text-xs ${smsTestResult.status === "verified" ? "bg-green-100 text-green-700" : smsTestResult.status === "unverified" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{smsTestResult.message}</div>}
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

        {/* Görev ve Eskalasyon Ayarları */}
        <div className="bg-white rounded-lg border p-3 flex flex-col">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1">⏱️ Görev ve Eskalasyon Ayarları</h2>
          <div className="flex-1 space-y-3 text-xs">
            <p className="text-[10px] text-gray-500">Operasyonel eksik görevleri (ör. müvekkil iletişim bilgisi) zamanında çözülmezse büro-geneli politikaya göre eskale edilir. (Motor sonraki sürümde aktifleşir.)</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">Yönetici Avukat(lar)</label>
                <div className="border rounded p-1.5 max-h-28 overflow-auto space-y-0.5">
                  {(office?.lawyers || []).length === 0 && <p className="text-gray-400">Avukat yok</p>}
                  {(office?.lawyers || []).map((l: any) => (
                    <label key={l.id} className="flex items-center gap-1.5">
                      <input type="checkbox" checked={escalationForm.escalationManagerLawyerIds.includes(l.id)} onChange={e => {
                        setEscalationForm(prev => ({ ...prev, escalationManagerLawyerIds: e.target.checked ? [...prev.escalationManagerLawyerIds, l.id] : prev.escalationManagerLawyerIds.filter(id => id !== l.id) }));
                      }} />
                      {l.name} {l.surname}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">Kurucu/Ortak(lar)</label>
                <div className="border rounded p-1.5 max-h-28 overflow-auto space-y-0.5">
                  {(office?.lawyers || []).length === 0 && <p className="text-gray-400">Avukat yok</p>}
                  {(office?.lawyers || []).map((l: any) => (
                    <label key={l.id} className="flex items-center gap-1.5">
                      <input type="checkbox" checked={escalationForm.escalationFounderLawyerIds.includes(l.id)} onChange={e => {
                        setEscalationForm(prev => ({ ...prev, escalationFounderLawyerIds: e.target.checked ? [...prev.escalationFounderLawyerIds, l.id] : prev.escalationFounderLawyerIds.filter(id => id !== l.id) }));
                      }} />
                      {l.name} {l.surname}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">İlk hatırlatma (gün)</label>
                <input type="number" min={1} value={escalationForm.opReminderDays} onChange={e => setEscalationForm({...escalationForm, opReminderDays: parseInt(e.target.value) || 0})} className="w-full border rounded px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">Kurucu eskalasyonu (gün)</label>
                <input type="number" min={1} value={escalationForm.opFounderDays} onChange={e => setEscalationForm({...escalationForm, opFounderDays: parseInt(e.target.value) || 0})} className="w-full border rounded px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-0.5">Periyodik tekrar (ay)</label>
                <input type="number" min={1} value={escalationForm.opRepeatMonths} onChange={e => setEscalationForm({...escalationForm, opRepeatMonths: parseInt(e.target.value) || 0})} className="w-full border rounded px-2 py-1 text-xs" />
              </div>
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1">Operasyonel Görev Alıcıları (ilk sahip)</label>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {STAFF_TYPES.filter(t => t.value !== "DIGER").map(t => (
                  <label key={t.value} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={escalationForm.opStaffTypes.includes(t.value)} onChange={e => {
                      setEscalationForm(prev => ({ ...prev, opStaffTypes: e.target.checked ? [...prev.opStaffTypes, t.value] : prev.opStaffTypes.filter(v => v !== t.value) }));
                    }} />
                    {t.label}
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">Operasyonel eksik görevini önce bu personel türleri görür / bildirim alır (motor PR-3b'de).</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={escalationForm.opEmailEnabled} onChange={e => setEscalationForm({...escalationForm, opEmailEnabled: e.target.checked})} /> E-posta aktif</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={escalationForm.opSmsEnabled} onChange={e => setEscalationForm({...escalationForm, opSmsEnabled: e.target.checked})} /> SMS aktif</label>
              <label className="flex items-center gap-1.5 text-gray-400" title="WhatsApp gönderimi yakında"><input type="checkbox" disabled /> WhatsApp (yakında)</label>
            </div>
            {escalationStatus && <div className={`p-1 rounded text-xs text-center ${escalationStatus.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{escalationStatus.msg}</div>}
            <button onClick={handleSaveEscalation} disabled={saving} className="w-full px-2 py-1 bg-blue-600 text-white text-xs rounded disabled:opacity-50">{saving ? "..." : "Kaydet"}</button>
          </div>
        </div>
        </div>
      </div>

      {/* Modals */}
      {showLawyerModal && <LawyerModal lawyer={editingLawyer} onSave={handleSaveLawyer} onClose={() => { setShowLawyerModal(false); setEditingLawyer(null); }} saving={saving} />}

      {/* PR-U1: avukat update-path benzer-isim review (2 buton: güncelle / vazgeç; merge YOK) */}
      {lawyerSimilar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Benzer isimli avukat mevcut</h3>
            <p className="text-sm text-gray-600 mb-2">
              Aşağıdaki kayıt(lar) aynı isimde. Kimlik (TCKN/baro) girilmediği için otomatik birleştirme yapılmaz.
              Yine de <b>bu kaydı güncellemek</b> istiyor musunuz?
            </p>
            <ul className="text-sm text-gray-800 bg-gray-50 rounded-lg p-2 mb-4 max-h-32 overflow-y-auto">
              {lawyerSimilar.candidates.map((c) => (
                <li key={c.id} className="py-0.5">• {c.name}</li>
              ))}
            </ul>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => submitLawyer(lawyerSimilar.data, true)}
                className="w-full px-3 py-2 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600"
              >
                Benzerliğe rağmen güncelle
              </button>
              <button
                onClick={() => setLawyerSimilar(null)}
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
      {showBankModal && <BankModal account={editingBank} onSave={handleSaveBankAccount} onClose={() => { setShowBankModal(false); setEditingBank(null); }} saving={saving} />}
      {showStaffModal && <StaffModal staff={editingStaff} onSave={handleSaveStaff} onClose={() => { setShowStaffModal(false); setEditingStaff(null); }} saving={saving} />}

      {/* PR-S: benzer-isim review diyaloğu (kimliksiz personel, otomatik karar YOK) */}
      {staffSimilar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Benzer isimli personel mevcut</h3>
            <p className="text-sm text-gray-600 mb-2">
              Aşağıdaki kayıt(lar) aynı isimde. Kimlik (TCKN) girilmediği için otomatik birleştirme yapılmaz —
              <b> mevcut kaydı kullanabilir</b> veya <b>ayrı bir kişi olarak yeni kayıt</b> açabilirsiniz.
            </p>
            <ul className="text-sm text-gray-800 bg-gray-50 rounded-lg p-2 mb-4 max-h-32 overflow-y-auto">
              {staffSimilar.candidates.map((c) => (
                <li key={c.id} className="py-0.5">• {c.name}</li>
              ))}
            </ul>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setStaffSimilar(null); setShowStaffModal(false); setEditingStaff(null); }}
                className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
              >
                Mevcut kaydı kullan
              </button>
              <button
                onClick={() => submitStaff(staffSimilar.data, { forceCreate: true })}
                className="w-full px-3 py-2 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600"
              >
                Ayrı kişi olarak kaydet
              </button>
              <button
                onClick={() => setStaffSimilar(null)}
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PR-U3: personel update-path benzer-isim review (2 buton: güncelle / vazgeç; merge YOK) */}
      {staffUpdateReview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Benzer isimli personel mevcut</h3>
            <p className="text-sm text-gray-600 mb-2">
              Aşağıdaki kayıt(lar) aynı isimde. Kimlik (TCKN) girilmediği için otomatik birleştirme yapılmaz.
              Yine de <b>bu kaydı güncellemek</b> istiyor musunuz?
            </p>
            <ul className="text-sm text-gray-800 bg-gray-50 rounded-lg p-2 mb-4 max-h-32 overflow-y-auto">
              {staffUpdateReview.candidates.map((c) => (
                <li key={c.id} className="py-0.5">• {c.name}</li>
              ))}
            </ul>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => submitStaff(staffUpdateReview.data, { confirmSimilarNameUpdate: true })}
                className="w-full px-3 py-2 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600"
              >
                Benzerliğe rağmen güncelle
              </button>
              <button
                onClick={() => setStaffUpdateReview(null)}
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// Avukat Modal
function LawyerModal({ lawyer, onSave, onClose, saving }: { lawyer: any; onSave: (data: any) => void; onClose: () => void; saving: boolean }) {
  const [form, setForm] = useState({
    name: lawyer?.name || "", surname: lawyer?.surname || "", tckn: lawyer?.tckn || "",
    title: lawyer?.title || "", barNumber: lawyer?.barNumber || "", barCity: lawyer?.barCity || "",
    vergiNo: lawyer?.vergiNo || "", email: lawyer?.email || "", phone: lawyer?.phone || "",
    mobilePhone: lawyer?.mobilePhone || "", whatsappPhone: lawyer?.whatsappPhone || "",
    fax: lawyer?.fax || "", address: lawyer?.address || "",
    bankName: lawyer?.bankName || "", branchName: lawyer?.branchName || "", iban: lawyer?.iban || "",
    role: lawyer?.role || "EMPLOYEE", canSign: lawyer?.canSign || false,
    canAppearInUyap: lawyer?.canAppearInUyap || false, isDefaultForNewCases: lawyer?.isDefaultForNewCases || false,
    // Yeni alanlar
    lawyerRank: lawyer?.lawyerRank || "LAWYER",
    permissionsLocked: lawyer?.permissionsLocked || false,
    canModifyOtherPermissions: lawyer?.canModifyOtherPermissions || false,
    // Varsayılan yetkiler
    defaultPermissions: lawyer?.defaultPermissions || {
      canEditCase: true,
      canGenerateDocs: true,
      canSyncUYAP: false,
      canViewFinance: true,
      canEditFinance: false,
      canChangeStatus: false,
      canEditParties: false,
    },
  });

  // Avukat tipine göre varsayılan yetkileri ayarla
  const handleRankChange = (rank: string) => {
    let defaultPerms = { ...form.defaultPermissions };
    let canModify = false;
    let locked = false;
    
    switch (rank) {
      case 'PARTNER': // Ortak - Tüm yetkiler
        defaultPerms = {
          canEditCase: true, canGenerateDocs: true, canSyncUYAP: true,
          canViewFinance: true, canEditFinance: true, canChangeStatus: true, canEditParties: true,
        };
        canModify = true;
        break;
      case 'MANAGER': // Yönetici - Geniş yetkiler
        defaultPerms = {
          canEditCase: true, canGenerateDocs: true, canSyncUYAP: true,
          canViewFinance: true, canEditFinance: true, canChangeStatus: true, canEditParties: false,
        };
        canModify = true;
        break;
      case 'AUTHORIZED': // Yetkili Avukat
        defaultPerms = {
          canEditCase: true, canGenerateDocs: true, canSyncUYAP: false,
          canViewFinance: true, canEditFinance: false, canChangeStatus: false, canEditParties: false,
        };
        break;
      case 'LAWYER': // Avukat
        defaultPerms = {
          canEditCase: true, canGenerateDocs: true, canSyncUYAP: false,
          canViewFinance: false, canEditFinance: false, canChangeStatus: false, canEditParties: false,
        };
        break;
      case 'INTERN': // Stajyer
        defaultPerms = {
          canEditCase: false, canGenerateDocs: true, canSyncUYAP: false,
          canViewFinance: false, canEditFinance: false, canChangeStatus: false, canEditParties: false,
        };
        break;
    }
    
    setForm({ ...form, lawyerRank: rank, defaultPermissions: defaultPerms, canModifyOtherPermissions: canModify, permissionsLocked: locked });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.surname.trim()) { alert("Ad ve Soyad zorunlu"); return; }
    onSave(form);
  };

  const RANK_OPTIONS = [
    { value: 'PARTNER', label: 'Ortak Avukat', color: 'bg-purple-100 text-purple-700', desc: 'Tüm yetkiler + yetki yönetimi' },
    { value: 'MANAGER', label: 'Yönetici Avukat', color: 'bg-blue-100 text-blue-700', desc: 'Geniş yetkiler' },
    { value: 'AUTHORIZED', label: 'Yetkili Avukat', color: 'bg-green-100 text-green-700', desc: 'Standart yetkiler' },
    { value: 'LAWYER', label: 'Avukat', color: 'bg-gray-100 text-gray-700', desc: 'Temel yetkiler' },
    { value: 'INTERN', label: 'Stajyer Avukat', color: 'bg-orange-100 text-orange-700', desc: 'Kısıtlı yetkiler' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between mb-3">
          <h3 className="font-semibold">{lawyer ? "Avukat Düzenle" : "Yeni Avukat"}</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {/* Kişisel Bilgiler */}
          <div className="grid grid-cols-4 gap-2">
            <div><label>Ad *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required className="w-full border rounded px-2 py-1" /></div>
            <div><label>Soyad *</label><input value={form.surname} onChange={e => setForm({...form, surname: e.target.value})} required className="w-full border rounded px-2 py-1" /></div>
            <div><label>TCKN</label><input value={form.tckn} onChange={e => setForm({...form, tckn: e.target.value.replace(/\D/g, "")})} maxLength={11} className="w-full border rounded px-2 py-1" /></div>
            <div><label>Vergi No</label><input value={form.vergiNo} onChange={e => setForm({...form, vergiNo: e.target.value.replace(/\D/g, "")})} maxLength={10} className="w-full border rounded px-2 py-1" /></div>
          </div>
          
          {/* Avukat Tipi ve Mesleki Bilgiler */}
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="font-semibold text-purple-800 mb-2">👔 Avukat Tipi & Hiyerarşi</p>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {RANK_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleRankChange(opt.value)}
                  className={`p-2 rounded-lg border-2 text-center transition-all ${
                    form.lawyerRank === opt.value 
                      ? 'border-purple-500 bg-purple-100' 
                      : 'border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${opt.color}`}>{opt.label}</span>
                  <p className="text-[9px] text-gray-500 mt-1">{opt.desc}</p>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div><label>Unvan</label><select value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full border rounded px-1 py-1"><option value="">Oto</option><option value="Av.">Av.</option><option value="Stj. Av.">Stj. Av.</option></select></div>
              <div><label>Baro Sicil</label><input value={form.barNumber} onChange={e => setForm({...form, barNumber: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
              <div><label>Baro</label><input value={form.barCity} onChange={e => setForm({...form, barCity: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
              <div><label>Eski Rol</label><select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="w-full border rounded px-1 py-1"><option value="OWNER">Sahip</option><option value="PARTNER">Ortak</option><option value="EMPLOYEE">Avukat</option><option value="INTERN">Stajyer</option></select></div>
            </div>
          </div>

          {/* Varsayılan Yetkiler */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="font-semibold text-blue-800 mb-2">🔐 Varsayılan Yetkiler (Yeni dosyalara otomatik uygulanır)</p>
            <div className="grid grid-cols-4 gap-2">
              <label className="flex items-center gap-1 p-1.5 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={form.defaultPermissions.canEditCase} onChange={e => setForm({...form, defaultPermissions: {...form.defaultPermissions, canEditCase: e.target.checked}})} />
                <span>Dosya düzenleme</span>
              </label>
              <label className="flex items-center gap-1 p-1.5 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={form.defaultPermissions.canGenerateDocs} onChange={e => setForm({...form, defaultPermissions: {...form.defaultPermissions, canGenerateDocs: e.target.checked}})} />
                <span>Evrak oluşturma</span>
              </label>
              <label className="flex items-center gap-1 p-1.5 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={form.defaultPermissions.canSyncUYAP} onChange={e => setForm({...form, defaultPermissions: {...form.defaultPermissions, canSyncUYAP: e.target.checked}})} />
                <span>UYAP senkron</span>
              </label>
              <label className="flex items-center gap-1 p-1.5 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={form.defaultPermissions.canViewFinance} onChange={e => setForm({...form, defaultPermissions: {...form.defaultPermissions, canViewFinance: e.target.checked}})} />
                <span>Hesap görme</span>
              </label>
              <label className="flex items-center gap-1 p-1.5 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={form.defaultPermissions.canEditFinance} onChange={e => setForm({...form, defaultPermissions: {...form.defaultPermissions, canEditFinance: e.target.checked}})} />
                <span>Masraf düzenleme</span>
              </label>
              <label className="flex items-center gap-1 p-1.5 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={form.defaultPermissions.canChangeStatus} onChange={e => setForm({...form, defaultPermissions: {...form.defaultPermissions, canChangeStatus: e.target.checked}})} />
                <span>Statü değiştirme</span>
              </label>
              <label className="flex items-center gap-1 p-1.5 bg-white rounded border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={form.defaultPermissions.canEditParties} onChange={e => setForm({...form, defaultPermissions: {...form.defaultPermissions, canEditParties: e.target.checked}})} />
                <span>Taraf düzenleme</span>
              </label>
            </div>
            
            {/* Yetki Kilidi (Sadece Ortak görebilir) */}
            {(form.lawyerRank === 'PARTNER' || form.lawyerRank === 'MANAGER') && (
              <div className="mt-3 pt-3 border-t border-blue-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.permissionsLocked} onChange={e => setForm({...form, permissionsLocked: e.target.checked})} />
                  <div>
                    <span className="font-medium text-blue-800">🔒 Yetkileri kilitle</span>
                    <p className="text-[10px] text-blue-600">Kilitlenirse yönetici avukatlar bile bu avukatın yetkilerini değiştiremez</p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* İletişim */}
          <div className="grid grid-cols-3 gap-2">
            <div><label>E-posta</label><input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            <div><label>Ofis Telefonu</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            <div><label>Faks</label><input value={form.fax} onChange={e => setForm({...form, fax: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            <div><label>Cep Telefonu</label><input value={form.mobilePhone} onChange={e => setForm({...form, mobilePhone: e.target.value})} placeholder="05XX..." className="w-full border rounded px-2 py-1" /></div>
            <div><label>WhatsApp</label><input value={form.whatsappPhone} onChange={e => setForm({...form, whatsappPhone: e.target.value})} placeholder="05XX... (opsiyonel)" className="w-full border rounded px-2 py-1" /></div>
          </div>
          <div>
            <label>Adres</label>
            <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Büro adresi" className="w-full border rounded px-2 py-1" />
          </div>
          
          {/* Banka */}
          <div className="grid grid-cols-3 gap-2">
            <div><label>Banka</label><input value={form.bankName} onChange={e => setForm({...form, bankName: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            <div><label>Şube</label><input value={form.branchName} onChange={e => setForm({...form, branchName: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            <div><label>IBAN</label><input value={form.iban} onChange={e => setForm({...form, iban: e.target.value.toUpperCase()})} className="w-full border rounded px-2 py-1 font-mono" /></div>
          </div>
          
          {/* Genel Ayarlar */}
          <div className="flex flex-col gap-3 pt-2 border-t">
            <div className="flex gap-4">
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.canSign} onChange={e => setForm({...form, canSign: e.target.checked})} />İmza yetkisi</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.canAppearInUyap} onChange={e => setForm({...form, canAppearInUyap: e.target.checked})} />UYAP</label>
              {(form.lawyerRank === 'PARTNER' || form.lawyerRank === 'MANAGER') && (
                <label className="flex items-center gap-1"><input type="checkbox" checked={form.canModifyOtherPermissions} onChange={e => setForm({...form, canModifyOtherPermissions: e.target.checked})} />Başkalarının yetkilerini değiştirebilir</label>
              )}
            </div>
            <div className="p-2 bg-amber-50 border border-amber-200 rounded">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={form.isDefaultForNewCases} 
                  onChange={e => setForm({...form, isDefaultForNewCases: e.target.checked})} 
                  className="w-4 h-4 rounded text-amber-600"
                />
                <div>
                  <span className="font-medium text-amber-800">⭐ Yeni takiplerde otomatik seç</span>
                  <p className="text-[10px] text-amber-600 mt-0.5">Bu avukat yeni takip oluşturulduğunda otomatik olarak seçili gelir</p>
                </div>
              </label>
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
    mobilePhone: staff?.mobilePhone || "", whatsappPhone: staff?.whatsappPhone || "",
    canCreateCase: staff?.canCreateCase || false, canEditCase: staff?.canEditCase || false,
    canGenerateDocuments: staff?.canGenerateDocuments || false, canApproveDocuments: staff?.canApproveDocuments || false,
    canSeeFinance: staff?.canSeeFinance || false, canApproveFinance: staff?.canApproveFinance || false,
    isDefaultForNewCases: staff?.isDefaultForNewCases || false,
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
            <div><label>Ofis Telefonu</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border rounded px-2 py-1" /></div>
            <div><label>Cep Telefonu</label><input value={form.mobilePhone} onChange={e => setForm({...form, mobilePhone: e.target.value})} placeholder="05XX..." className="w-full border rounded px-2 py-1" /></div>
            <div><label>WhatsApp</label><input value={form.whatsappPhone} onChange={e => setForm({...form, whatsappPhone: e.target.value})} placeholder="05XX... (opsiyonel)" className="w-full border rounded px-2 py-1" /></div>
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
          {/* Varsayılan Seçeneği */}
          <div className="p-2 bg-amber-50 border border-amber-200 rounded">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={form.isDefaultForNewCases} 
                onChange={e => setForm({...form, isDefaultForNewCases: e.target.checked})} 
                className="w-4 h-4 rounded text-amber-600"
              />
              <div>
                <span className="font-medium text-amber-800">⭐ Yeni takiplerde otomatik seç</span>
                <p className="text-[10px] text-amber-600 mt-0.5">Bu personel yeni takip oluşturulduğunda otomatik olarak seçili gelir</p>
              </div>
            </label>
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
