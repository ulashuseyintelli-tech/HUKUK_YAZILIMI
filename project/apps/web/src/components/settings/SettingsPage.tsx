"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings,
  Building2,
  CreditCard,
  Mail,
  MessageSquare,
  PenTool,
  Bell,
  Shield,
  Save,
  Loader2,
  CheckCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface TenantSettings {
  // Genel
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmEmail: string;
  taxNo: string;
  
  // E-imza
  esignProvider: "E_GUVEN" | "TURKCELL" | "E_TUGRA";
  esignApiKey: string;
  esignEnabled: boolean;
  
  // Banka
  bankAccounts: Array<{
    id: string;
    bankName: string;
    iban: string;
    accountName: string;
    isDefault: boolean;
  }>;
  autoMatchEnabled: boolean;
  
  // SMS
  smsProvider: "NETGSM" | "ILETIMERKEZI" | "TWILIO";
  smsApiKey: string;
  smsApiSecret: string;
  smsSenderId: string;
  smsEnabled: boolean;
  
  // E-posta
  emailProvider: "SMTP" | "SENDGRID" | "AWS_SES";
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  emailFromAddress: string;
  emailFromName: string;
  emailEnabled: boolean;
  
  // Bildirimler
  notifyOnTebligat: boolean;
  notifyOnPayment: boolean;
  notifyOnDeadline: boolean;
  notifyOnUyap: boolean;
  notifyDaysBefore: number;
  
  // Guvenlik
  twoFactorEnabled: boolean;
  sessionTimeout: number;
  ipWhitelist: string[];
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
    twoFactorEnabled: false,
    sessionTimeout: 30,
    ipWhitelist: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Mock - gercek API'den gelecek
      // const { data } = await api.get('/settings');
      // setSettings(data);
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
      // await api.put('/settings', settings);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Mock delay
      toast.success("Ayarlar kaydedildi");
    } catch (error) {
      toast.error("Ayarlar kaydedilemedi");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Ayarlar
          </h1>
          <p className="text-muted-foreground">Sistem ve entegrasyon ayarlarini yonetin</p>
        </div>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Kaydet
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="general" className="flex items-center gap-1">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Genel</span>
          </TabsTrigger>
          <TabsTrigger value="esign" className="flex items-center gap-1">
            <PenTool className="h-4 w-4" />
            <span className="hidden sm:inline">E-Imza</span>
          </TabsTrigger>
          <TabsTrigger value="bank" className="flex items-center gap-1">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Banka</span>
          </TabsTrigger>
          <TabsTrigger value="sms" className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">SMS</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">E-posta</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Bildirim</span>
          </TabsTrigger>
        </TabsList>

        {/* Genel Ayarlar */}
        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Firma Bilgileri</CardTitle>
              <CardDescription>Hukuk burosu temel bilgileri</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Firma Adi</Label>
                  <Input
                    value={settings.firmName}
                    onChange={(e) => updateSetting("firmName", e.target.value)}
                    placeholder="Hukuk Burosu Adi"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vergi No</Label>
                  <Input
                    value={settings.taxNo}
                    onChange={(e) => updateSetting("taxNo", e.target.value)}
                    placeholder="1234567890"
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-posta</Label>
                  <Input
                    type="email"
                    value={settings.firmEmail}
                    onChange={(e) => updateSetting("firmEmail", e.target.value)}
                    placeholder="info@firma.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input
                    value={settings.firmPhone}
                    onChange={(e) => updateSetting("firmPhone", e.target.value)}
                    placeholder="+90 212 123 45 67"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Adres</Label>
                  <Input
                    value={settings.firmAddress}
                    onChange={(e) => updateSetting("firmAddress", e.target.value)}
                    placeholder="Firma adresi"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* E-Imza Ayarlari */}
        <TabsContent value="esign" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>E-Imza Entegrasyonu</CardTitle>
                  <CardDescription>E-imza saglayici ayarlari</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label>Aktif</Label>
                  <Switch
                    checked={settings.esignEnabled}
                    onCheckedChange={(v) => updateSetting("esignEnabled", v)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Saglayici</Label>
                  <Select
                    value={settings.esignProvider}
                    onValueChange={(v) => updateSetting("esignProvider", v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="E_GUVEN">E-Guven</SelectItem>
                      <SelectItem value="TURKCELL">Turkcell</SelectItem>
                      <SelectItem value="E_TUGRA">E-Tugra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={settings.esignApiKey}
                    onChange={(e) => updateSetting("esignApiKey", e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Banka Ayarlari */}
        <TabsContent value="bank" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Banka Hesaplari</CardTitle>
                  <CardDescription>Tahsilat icin banka hesaplari</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addBankAccount}>
                  <Plus className="h-4 w-4 mr-1" />
                  Hesap Ekle
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Switch
                  checked={settings.autoMatchEnabled}
                  onCheckedChange={(v) => updateSetting("autoMatchEnabled", v)}
                />
                <Label>Otomatik tahsilat eslestirme</Label>
              </div>

              {settings.bankAccounts.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Henuz banka hesabi eklenmemis
                </p>
              ) : (
                <div className="space-y-3">
                  {settings.bankAccounts.map((account) => (
                    <div key={account.id} className="border rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Banka</Label>
                          <Select
                            value={account.bankName}
                            onValueChange={(v) => updateBankAccount(account.id, "bankName", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Banka secin" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GARANTI">Garanti BBVA</SelectItem>
                              <SelectItem value="AKBANK">Akbank</SelectItem>
                              <SelectItem value="ISBANK">Is Bankasi</SelectItem>
                              <SelectItem value="YAPI_KREDI">Yapi Kredi</SelectItem>
                              <SelectItem value="ZIRAAT">Ziraat Bankasi</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Hesap Adi</Label>
                          <Input
                            value={account.accountName}
                            onChange={(e) => updateBankAccount(account.id, "accountName", e.target.value)}
                            placeholder="Hesap adi"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">IBAN</Label>
                          <Input
                            value={account.iban}
                            onChange={(e) => updateBankAccount(account.id, "iban", e.target.value)}
                            placeholder="TR00 0000 0000 0000 0000 0000 00"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={account.isDefault}
                              onCheckedChange={(v) => updateBankAccount(account.id, "isDefault", v)}
                            />
                            <Label className="text-xs">Varsayilan</Label>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => removeBankAccount(account.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SMS Ayarlari */}
        <TabsContent value="sms" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>SMS Entegrasyonu</CardTitle>
                  <CardDescription>SMS bildirim ayarlari</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label>Aktif</Label>
                  <Switch
                    checked={settings.smsEnabled}
                    onCheckedChange={(v) => updateSetting("smsEnabled", v)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Saglayici</Label>
                  <Select
                    value={settings.smsProvider}
                    onValueChange={(v) => updateSetting("smsProvider", v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NETGSM">NetGSM</SelectItem>
                      <SelectItem value="ILETIMERKEZI">Ileti Merkezi</SelectItem>
                      <SelectItem value="TWILIO">Twilio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Gonderen ID</Label>
                  <Input
                    value={settings.smsSenderId}
                    onChange={(e) => updateSetting("smsSenderId", e.target.value)}
                    placeholder="HUKUKBURO"
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={settings.smsApiKey}
                    onChange={(e) => updateSetting("smsApiKey", e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Secret</Label>
                  <Input
                    type="password"
                    value={settings.smsApiSecret}
                    onChange={(e) => updateSetting("smsApiSecret", e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* E-posta Ayarlari */}
        <TabsContent value="email" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>E-posta Entegrasyonu</CardTitle>
                  <CardDescription>E-posta bildirim ayarlari</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label>Aktif</Label>
                  <Switch
                    checked={settings.emailEnabled}
                    onCheckedChange={(v) => updateSetting("emailEnabled", v)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Saglayici</Label>
                  <Select
                    value={settings.emailProvider}
                    onValueChange={(v) => updateSetting("emailProvider", v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SMTP">SMTP</SelectItem>
                      <SelectItem value="SENDGRID">SendGrid</SelectItem>
                      <SelectItem value="AWS_SES">AWS SES</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Gonderen E-posta</Label>
                  <Input
                    type="email"
                    value={settings.emailFromAddress}
                    onChange={(e) => updateSetting("emailFromAddress", e.target.value)}
                    placeholder="bildirim@firma.com"
                  />
                </div>
                {settings.emailProvider === "SMTP" && (
                  <>
                    <div className="space-y-2">
                      <Label>SMTP Host</Label>
                      <Input
                        value={settings.smtpHost}
                        onChange={(e) => updateSetting("smtpHost", e.target.value)}
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SMTP Port</Label>
                      <Input
                        type="number"
                        value={settings.smtpPort}
                        onChange={(e) => updateSetting("smtpPort", parseInt(e.target.value))}
                        placeholder="587"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SMTP Kullanici</Label>
                      <Input
                        value={settings.smtpUser}
                        onChange={(e) => updateSetting("smtpUser", e.target.value)}
                        placeholder="kullanici@gmail.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SMTP Sifre</Label>
                      <Input
                        type="password"
                        value={settings.smtpPassword}
                        onChange={(e) => updateSetting("smtpPassword", e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bildirim Ayarlari */}
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Bildirim Tercihleri</CardTitle>
              <CardDescription>Hangi durumlarda bildirim alinacagini secin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Tebligat Bildirimleri</p>
                    <p className="text-sm text-muted-foreground">Tebligat teslim/iade durumlarinda</p>
                  </div>
                  <Switch
                    checked={settings.notifyOnTebligat}
                    onCheckedChange={(v) => updateSetting("notifyOnTebligat", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Odeme Bildirimleri</p>
                    <p className="text-sm text-muted-foreground">Tahsilat yapildiginda</p>
                  </div>
                  <Switch
                    checked={settings.notifyOnPayment}
                    onCheckedChange={(v) => updateSetting("notifyOnPayment", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Sure Bildirimleri</p>
                    <p className="text-sm text-muted-foreground">Yaklasan sureler icin</p>
                  </div>
                  <Switch
                    checked={settings.notifyOnDeadline}
                    onCheckedChange={(v) => updateSetting("notifyOnDeadline", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">UYAP Bildirimleri</p>
                    <p className="text-sm text-muted-foreground">UYAP islem sonuclarinda</p>
                  </div>
                  <Switch
                    checked={settings.notifyOnUyap}
                    onCheckedChange={(v) => updateSetting("notifyOnUyap", v)}
                  />
                </div>
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-4">
                    <Label>Sure uyarisi kac gun once</Label>
                    <Select
                      value={settings.notifyDaysBefore.toString()}
                      onValueChange={(v) => updateSetting("notifyDaysBefore", parseInt(v))}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 gun</SelectItem>
                        <SelectItem value="2">2 gun</SelectItem>
                        <SelectItem value="3">3 gun</SelectItem>
                        <SelectItem value="5">5 gun</SelectItem>
                        <SelectItem value="7">7 gun</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
