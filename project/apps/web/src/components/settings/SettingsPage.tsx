"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Building2,
  CreditCard,
  Mail,
  MessageSquare,
  PenTool,
  Bell,
  Save,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

interface TenantSettings {
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmEmail: string;
  taxNo: string;
  esignProvider: "E_GUVEN" | "TURKCELL" | "E_TUGRA";
  esignApiKey: string;
  esignEnabled: boolean;
  bankAccounts: Array<{
    id: string;
    bankName: string;
    iban: string;
    accountName: string;
    isDefault: boolean;
  }>;
  autoMatchEnabled: boolean;
  smsProvider: "NETGSM" | "ILETIMERKEZI" | "TWILIO";
  smsApiKey: string;
  smsApiSecret: string;
  smsSenderId: string;
  smsEnabled: boolean;
  emailProvider: "SMTP" | "SENDGRID" | "AWS_SES";
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  emailFromAddress: string;
  emailFromName: string;
  emailEnabled: boolean;
  notifyOnTebligat: boolean;
  notifyOnPayment: boolean;
  notifyOnDeadline: boolean;
  notifyOnUyap: boolean;
  notifyDaysBefore: number;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings>({
    firmName: "",
    firmAddress: "",
    firmPhone: "",
    firmEmail: "",
    taxNo: "",
    esignProvider: "E_GUVEN",
    esignApiKey: "",
    esignEnabled: false,
    bankAccounts: [],
    autoMatchEnabled: true,
    smsProvider: "NETGSM",
    smsApiKey: "",
    smsApiSecret: "",
    smsSenderId: "",
    smsEnabled: false,
    emailProvider: "SMTP",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPassword: "",
    emailFromAddress: "",
    emailFromName: "",
    emailEnabled: false,
    notifyOnTebligat: true,
    notifyOnPayment: true,
    notifyOnDeadline: true,
    notifyOnUyap: true,
    notifyDaysBefore: 3,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setSettings(prev => ({
        ...prev,
        firmName: "Ornek Hukuk Burosu",
        firmEmail: "info@ornekhukuk.com",
      }));
    } catch (error) {
      console.error("Ayarlar yuklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert("Ayarlar kaydedildi");
    } catch (error) {
      alert("Ayarlar kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof TenantSettings>(key: K, value: TenantSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const addBankAccount = () => {
    setSettings(prev => ({
      ...prev,
      bankAccounts: [
        ...prev.bankAccounts,
        { id: Date.now().toString(), bankName: "", iban: "", accountName: "", isDefault: false },
      ],
    }));
  };

  const removeBankAccount = (id: string) => {
    setSettings(prev => ({
      ...prev,
      bankAccounts: prev.bankAccounts.filter(a => a.id !== id),
    }));
  };

  const updateBankAccount = (id: string, field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map(a =>
        a.id === id ? { ...a, [field]: value } : a
      ),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const tabs = [
    { id: "general", label: "Genel", icon: Building2 },
    { id: "esign", label: "E-Imza", icon: PenTool },
    { id: "bank", label: "Banka", icon: CreditCard },
    { id: "sms", label: "SMS", icon: MessageSquare },
    { id: "email", label: "E-posta", icon: Mail },
    { id: "notifications", label: "Bildirim", icon: Bell },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Ayarlar
          </h1>
          <p className="text-gray-500">Sistem ve entegrasyon ayarlarini yonetin</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kaydet
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg border shadow-sm">
        {activeTab === "general" && (
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-1">Firma Bilgileri</h3>
            <p className="text-sm text-gray-500 mb-4">Hukuk burosu temel bilgileri</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Firma Adi</label>
                <input
                  type="text"
                  value={settings.firmName}
                  onChange={(e) => updateSetting("firmName", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Hukuk Burosu Adi"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Vergi No</label>
                <input
                  type="text"
                  value={settings.taxNo}
                  onChange={(e) => updateSetting("taxNo", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="1234567890"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">E-posta</label>
                <input
                  type="email"
                  value={settings.firmEmail}
                  onChange={(e) => updateSetting("firmEmail", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="info@firma.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Telefon</label>
                <input
                  type="text"
                  value={settings.firmPhone}
                  onChange={(e) => updateSetting("firmPhone", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="+90 212 123 45 67"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Adres</label>
                <input
                  type="text"
                  value={settings.firmAddress}
                  onChange={(e) => updateSetting("firmAddress", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Firma adresi"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "esign" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">E-Imza Entegrasyonu</h3>
                <p className="text-sm text-gray-500">E-imza saglayici ayarlari</p>
              </div>
              <label className="flex items-center gap-2">
                <span className="text-sm">Aktif</span>
                <input
                  type="checkbox"
                  checked={settings.esignEnabled}
                  onChange={(e) => updateSetting("esignEnabled", e.target.checked)}
                  className="w-5 h-5 rounded"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Saglayici</label>
                <select
                  value={settings.esignProvider}
                  onChange={(e) => updateSetting("esignProvider", e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="E_GUVEN">E-Guven</option>
                  <option value="TURKCELL">Turkcell</option>
                  <option value="E_TUGRA">E-Tugra</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input
                  type="password"
                  value={settings.esignApiKey}
                  onChange={(e) => updateSetting("esignApiKey", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "bank" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Banka Hesaplari</h3>
                <p className="text-sm text-gray-500">Tahsilat icin banka hesaplari</p>
              </div>
              <button
                onClick={addBankAccount}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" />
                Hesap Ekle
              </button>
            </div>
            <label className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={settings.autoMatchEnabled}
                onChange={(e) => updateSetting("autoMatchEnabled", e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Otomatik tahsilat eslestirme</span>
            </label>
            {settings.bankAccounts.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Henuz banka hesabi eklenmemis</p>
            ) : (
              <div className="space-y-3">
                {settings.bankAccounts.map((account) => (
                  <div key={account.id} className="border rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1">Banka</label>
                        <select
                          value={account.bankName}
                          onChange={(e) => updateBankAccount(account.id, "bankName", e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border rounded"
                        >
                          <option value="">Banka secin</option>
                          <option value="GARANTI">Garanti BBVA</option>
                          <option value="AKBANK">Akbank</option>
                          <option value="ISBANK">Is Bankasi</option>
                          <option value="YAPI_KREDI">Yapi Kredi</option>
                          <option value="ZIRAAT">Ziraat Bankasi</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Hesap Adi</label>
                        <input
                          type="text"
                          value={account.accountName}
                          onChange={(e) => updateBankAccount(account.id, "accountName", e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border rounded"
                          placeholder="Hesap adi"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">IBAN</label>
                        <input
                          type="text"
                          value={account.iban}
                          onChange={(e) => updateBankAccount(account.id, "iban", e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border rounded"
                          placeholder="TR00 0000 0000 0000"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={account.isDefault}
                            onChange={(e) => updateBankAccount(account.id, "isDefault", e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          <span className="text-xs">Varsayilan</span>
                        </label>
                        <button
                          onClick={() => removeBankAccount(account.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "sms" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">SMS Entegrasyonu</h3>
                <p className="text-sm text-gray-500">SMS bildirim ayarlari</p>
              </div>
              <label className="flex items-center gap-2">
                <span className="text-sm">Aktif</span>
                <input
                  type="checkbox"
                  checked={settings.smsEnabled}
                  onChange={(e) => updateSetting("smsEnabled", e.target.checked)}
                  className="w-5 h-5 rounded"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Saglayici</label>
                <select
                  value={settings.smsProvider}
                  onChange={(e) => updateSetting("smsProvider", e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="NETGSM">NetGSM</option>
                  <option value="ILETIMERKEZI">Ileti Merkezi</option>
                  <option value="TWILIO">Twilio</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gonderen ID</label>
                <input
                  type="text"
                  value={settings.smsSenderId}
                  onChange={(e) => updateSetting("smsSenderId", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="HUKUKBURO"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input
                  type="password"
                  value={settings.smsApiKey}
                  onChange={(e) => updateSetting("smsApiKey", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">API Secret</label>
                <input
                  type="password"
                  value={settings.smsApiSecret}
                  onChange={(e) => updateSetting("smsApiSecret", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "email" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">E-posta Entegrasyonu</h3>
                <p className="text-sm text-gray-500">E-posta bildirim ayarlari</p>
              </div>
              <label className="flex items-center gap-2">
                <span className="text-sm">Aktif</span>
                <input
                  type="checkbox"
                  checked={settings.emailEnabled}
                  onChange={(e) => updateSetting("emailEnabled", e.target.checked)}
                  className="w-5 h-5 rounded"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Saglayici</label>
                <select
                  value={settings.emailProvider}
                  onChange={(e) => updateSetting("emailProvider", e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="SMTP">SMTP</option>
                  <option value="SENDGRID">SendGrid</option>
                  <option value="AWS_SES">AWS SES</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gonderen E-posta</label>
                <input
                  type="email"
                  value={settings.emailFromAddress}
                  onChange={(e) => updateSetting("emailFromAddress", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="bildirim@firma.com"
                />
              </div>
              {settings.emailProvider === "SMTP" && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">SMTP Host</label>
                    <input
                      type="text"
                      value={settings.smtpHost}
                      onChange={(e) => updateSetting("smtpHost", e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">SMTP Port</label>
                    <input
                      type="number"
                      value={settings.smtpPort}
                      onChange={(e) => updateSetting("smtpPort", parseInt(e.target.value))}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="587"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">SMTP Kullanici</label>
                    <input
                      type="text"
                      value={settings.smtpUser}
                      onChange={(e) => updateSetting("smtpUser", e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="kullanici@gmail.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">SMTP Sifre</label>
                    <input
                      type="password"
                      value={settings.smtpPassword}
                      onChange={(e) => updateSetting("smtpPassword", e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="••••••••"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-1">Bildirim Tercihleri</h3>
            <p className="text-sm text-gray-500 mb-4">Hangi durumlarda bildirim alinacagini secin</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Tebligat Bildirimleri</p>
                  <p className="text-sm text-gray-500">Tebligat teslim/iade durumlarinda</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifyOnTebligat}
                  onChange={(e) => updateSetting("notifyOnTebligat", e.target.checked)}
                  className="w-5 h-5 rounded"
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Odeme Bildirimleri</p>
                  <p className="text-sm text-gray-500">Tahsilat yapildiginda</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifyOnPayment}
                  onChange={(e) => updateSetting("notifyOnPayment", e.target.checked)}
                  className="w-5 h-5 rounded"
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Sure Bildirimleri</p>
                  <p className="text-sm text-gray-500">Yaklasan sureler icin</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifyOnDeadline}
                  onChange={(e) => updateSetting("notifyOnDeadline", e.target.checked)}
                  className="w-5 h-5 rounded"
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">UYAP Bildirimleri</p>
                  <p className="text-sm text-gray-500">UYAP islem sonuclarinda</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifyOnUyap}
                  onChange={(e) => updateSetting("notifyOnUyap", e.target.checked)}
                  className="w-5 h-5 rounded"
                />
              </div>
              <div className="pt-4 border-t">
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium">Sure uyarisi kac gun once</label>
                  <select
                    value={settings.notifyDaysBefore}
                    onChange={(e) => updateSetting("notifyDaysBefore", parseInt(e.target.value))}
                    className="px-3 py-1.5 border rounded-lg"
                  >
                    <option value={1}>1 gun</option>
                    <option value={2}>2 gun</option>
                    <option value={3}>3 gun</option>
                    <option value={5}>5 gun</option>
                    <option value={7}>7 gun</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
