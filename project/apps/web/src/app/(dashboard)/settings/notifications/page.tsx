'use client';

// Bildirim KONTROL MERKEZİ (PR-N2).
// Bu sayfa bir "ayar" sayfası DEĞİL; bildirim altyapısının canlı SAĞLIK / GÖNDERİM GERÇEKLİĞİ /
// HATA TEŞHİS panosudur. Tek kaynak: GET /client-notifications/overview (ADMIN-gate) — yalnız
// GERÇEK gönderim kayıtlarından (ClientNotification + EscalationEvent) ve Büro Ayarları'ndan
// beslenir. Hukuki e-tebligat NotificationQueue (simüle/teslimatsız) KASITLI dışarıda bırakıldı.
// Ayarlar Büro Ayarları'nda yönetilir; burada toggle/kaydet YOK. Motoru olmayan özellikler
// "Planlandı", teslimatı kopuk olanlar "Dikkat Gerekiyor" altında — sahte "Aktif" gösterilmez.

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Bell, Mail, MessageSquare, AlarmClock, Gift, ShieldAlert,
  ChevronRight, CheckCircle2, AlertCircle, RefreshCw, Activity, XCircle, Clock, Inbox, Send,
} from 'lucide-react';
import { api } from '@/lib/api';

const PROVIDER_LABEL: Record<string, string> = {
  NETGSM: 'NetGSM',
  ILETI_MERKEZI: 'İleti Merkezi',
};

const TYPE_LABEL: Record<string, string> = {
  MASRAF_ISTEK: 'Masraf isteği',
  GENEL_BILGILENDIRME: 'Bilgilendirme',
  RAPOR: 'Rapor',
  HATIRLATMA: 'Hatırlatma',
  TEBRIK: 'Tebrik',
  TEST: 'Test',
  DIGER: 'Diğer',
};

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: 'E-posta',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
};

type EngineStatus = string;

interface Overview {
  generatedAt: string;
  channels: {
    email: { configured: boolean; host: string | null; sender: string | null };
    sms: { configured: boolean; provider: string | null; title: string | null };
  };
  engines: {
    greeting: { status: EngineStatus; time: string | null };
    escalation: {
      status: EngineStatus;
      reminderDays: number | null;
      founderDays: number | null;
      channels: string[];
      assignees: number;
      last24hSent: number;
      last24hFailed: number;
    };
    poa: { status: EngineStatus; reason: string };
  };
  stats: {
    last24hSent: number;
    last24hFailed: number;
    last24hPending: number;
    last24hEscalationSent: number;
    last24hEscalationFailed: number;
    activeEngines: number;
    attentionEngines: number;
    plannedEngines: number;
  };
  recentDeliveries: Array<{
    id: string;
    createdAt: string;
    channel: string;
    type: string;
    status: string;
    subject: string | null;
    recipientName: string | null;
    errorMessage: string | null;
  }>;
  failureGroups: Array<{ reason: string; count: number; channel: string | null; lastSeenAt: string }>;
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-gray-900 truncate">{value}</span>
    </div>
  );
}

type Tone = 'green' | 'amber' | 'indigo' | 'gray' | 'red';
const TONE_CLASS: Record<Tone, string> = {
  green: 'text-green-700 bg-green-50',
  amber: 'text-amber-700 bg-amber-50',
  indigo: 'text-indigo-700 bg-indigo-50',
  gray: 'text-gray-600 bg-gray-100',
  red: 'text-red-700 bg-red-50',
};

function HealthChip({ tone, icon: Icon, label }: { tone: Tone; icon: any; label: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-lg whitespace-nowrap ${TONE_CLASS[tone]}`}>
      <Icon className="h-3.5 w-3.5" />{label}
    </span>
  );
}

function Pill({ tone, icon: Icon, label }: { tone: Tone; icon: any; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${TONE_CLASS[tone]}`}>
      <Icon className="h-3 w-3" />{label}
    </span>
  );
}

function DeliveryStatusPill({ status }: { status: string }) {
  if (status === 'SENT' || status === 'DELIVERED') return <Pill tone="green" icon={CheckCircle2} label="Gönderildi" />;
  if (status === 'FAILED') return <Pill tone="red" icon={XCircle} label="Başarısız" />;
  return <Pill tone="gray" icon={Clock} label="Bekliyor" />;
}

function PageHeader({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg"><Bell className="h-5 w-5 text-blue-600" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Bildirim Kontrol Merkezi</h1>
          <p className="text-xs text-muted-foreground">Bildirim sistemi gerçekten çalışıyor mu, ne gönderdi, neyi neden gönderemedi?</p>
        </div>
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-2.5 py-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />Yenile
        </button>
      )}
    </div>
  );
}

export default function NotificationControlCenterPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminOnly, setAdminOnly] = useState(false);
  const [error, setError] = useState(false);

  // PR-N3: Gerçek Test Gönderimi durumu
  const [clients, setClients] = useState<any[]>([]);
  const [testClientId, setTestClientId] = useState('');
  const [testConfirm, setTestConfirm] = useState(false);
  const [testSending, setTestSending] = useState<null | 'EMAIL' | 'SMS'>(null);
  const [testResult, setTestResult] = useState<
    null | { success: boolean; channel: string; status: string; recipient?: string; errorMessage?: string }
  >(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent;
    if (!silent) { setLoading(true); setError(false); setAdminOnly(false); }
    try {
      const r = await api.get('/client-notifications/overview');
      setData((r.data?.data ?? r.data) as Overview);
    } catch (e: any) {
      if (!silent) {
        if (e?.response?.status === 403) setAdminOnly(true);
        else setError(true);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Müvekkil listesi (test gönderimi seçici). Arama YOK ki contacts[] gelsin (has-email/phone türetimi için).
  useEffect(() => {
    api.get('/clients')
      .then((r) => setClients((r.data?.data ?? r.data) || []))
      .catch(() => setClients([]));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Yükleniyor...</div>;
  }

  if (adminOnly) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 pb-10">
        <PageHeader />
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-4 text-[13px] leading-relaxed text-amber-900">
          Bu kontrol merkezi gönderim istatistikleri ve hata teşhisi içerdiğinden <span className="font-semibold">yalnız yönetici (ADMIN)</span> tarafından görüntülenebilir.
          Ayarları yine de <Link href="/settings/office" className="font-medium underline">Büro Ayarları</Link>'ndan yönetebilirsiniz.
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 pb-10">
        <PageHeader onRefresh={() => load()} />
        <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-4 text-[13px] leading-relaxed text-red-900">
          Bildirim durumu yüklenemedi. Lütfen tekrar deneyin.
        </div>
      </div>
    );
  }

  const { channels, engines, stats, recentDeliveries, failureGroups } = data;
  const emailReady = channels.email.configured;
  const smsReady = channels.sms.configured;

  // PR-N3 yardımcılar — müvekkil iletişim türetme (liste payload yeterli) + UI maskeleme
  const contactEmail = (c: any): string =>
    c?.email || c?.contacts?.find((x: any) => x.type === 'EMAIL')?.value || '';
  const contactPhone = (c: any): string =>
    c?.phone || c?.contacts?.find((x: any) => ['MOBILE', 'HOME_PHONE', 'WORK_PHONE'].includes(x.type))?.value || '';
  const clientName = (c: any): string =>
    c?.displayName || c?.name || [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim() || c?.companyName || '—';
  const maskEmailUi = (e: string): string => {
    if (!e) return '—';
    const [u, d] = e.split('@');
    if (!d) return '***';
    return `${(u || '').slice(0, 2) || '*'}***@${d}`;
  };
  const maskPhoneUi = (p: string): string => {
    if (!p) return '—';
    const digits = p.replace(/\D/g, '');
    return digits.length > 4 ? `*** *** ** ${digits.slice(-2)}` : '***';
  };

  const selectedClient = clients.find((c) => c.id === testClientId);
  const selEmail = contactEmail(selectedClient);
  const selPhone = contactPhone(selectedClient);

  const doTestSend = async (channel: 'EMAIL' | 'SMS') => {
    if (!testClientId || !testConfirm || testSending) return;
    setTestSending(channel);
    setTestResult(null);
    try {
      const r = await api.post('/client-notifications/test-send', { clientId: testClientId, channel, confirm: true });
      setTestResult((r.data?.data ?? r.data));
      await load({ silent: true }); // Son Gönderimler'i sessizce tazele (sayfa "Yükleniyor"a düşmeden)
    } catch (e: any) {
      setTestResult({ success: false, channel, status: 'FAILED', errorMessage: e?.response?.data?.message || 'Gönderim başarısız' });
    } finally {
      setTestSending(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-10">
      <PageHeader onRefresh={() => load()} />

      {/* Açıklama */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-[12.5px] leading-relaxed text-blue-900">
        Bu sayfa bir <span className="font-semibold">kontrol merkezidir</span> — ayar değil. Bildirimler aşağıdaki gerçek çalışan
        motorlar üzerinden gönderilir; <span className="font-medium">ayarları</span> ilgili kartın bağlantısından <span className="font-medium">Büro Ayarları</span>'nda yönetirsiniz.
      </div>

      {/* Sağlık şeridi */}
      <div className="flex flex-wrap gap-2">
        <HealthChip tone={emailReady ? 'green' : 'amber'} icon={emailReady ? CheckCircle2 : AlertCircle} label={emailReady ? 'E-posta hazır' : 'E-posta eksik'} />
        <HealthChip tone={smsReady ? 'green' : 'amber'} icon={smsReady ? CheckCircle2 : AlertCircle} label={smsReady ? 'SMS hazır' : 'SMS sağlayıcı yok'} />
        <HealthChip tone="indigo" icon={Activity} label={`${stats.activeEngines} aktif motor`} />
        {stats.attentionEngines > 0 && (
          <HealthChip tone="amber" icon={AlertCircle} label={`${stats.attentionEngines} dikkat gerekiyor`} />
        )}
        <HealthChip
          tone={stats.last24hFailed > 0 ? 'red' : 'green'}
          icon={Activity}
          label={`Son 24s: ${stats.last24hSent} başarılı / ${stats.last24hFailed} başarısız`}
        />
      </div>

      {/* === KANALLAR === */}
      <div>
        <h3 className="text-[12.5px] font-semibold text-gray-700 mb-2">Kanallar</h3>
        <div className="space-y-3">
          {/* E-posta (SMTP) */}
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-100/70 shrink-0"><Mail className="h-4 w-4 text-teal-600" /></span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold text-gray-900">E-posta Kanalı (SMTP)</h2>
                  <p className="text-[11px] text-gray-500">Tebrik, eskalasyon ve müvekkil e-postaları bu sunucudan gönderilir</p>
                </div>
              </div>
              <Pill tone={emailReady ? 'green' : 'amber'} icon={emailReady ? CheckCircle2 : AlertCircle} label={emailReady ? 'Yapılandırıldı' : 'Eksik'} />
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
              <Row label="Sunucu" value={channels.email.host || '—'} />
              <Row label="Gönderen" value={channels.email.sender || '—'} />
            </div>
            <Link href="/settings/office?section=smtp" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-teal-700 hover:text-teal-800">
              SMTP ayarlarını aç <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* SMS */}
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-100/70 shrink-0"><MessageSquare className="h-4 w-4 text-teal-600" /></span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold text-gray-900">SMS Kanalı</h2>
                  <p className="text-[11px] text-gray-500">Eskalasyon ve müvekkil SMS'leri bu sağlayıcıdan gider</p>
                </div>
              </div>
              <Pill tone={smsReady ? 'green' : 'amber'} icon={smsReady ? CheckCircle2 : AlertCircle} label={smsReady ? 'Yapılandırıldı' : 'Seçilmedi'} />
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
              <Row label="Sağlayıcı" value={smsReady ? (PROVIDER_LABEL[channels.sms.provider!] || channels.sms.provider) : 'Seçilmedi'} />
              <Row label="Başlık" value={channels.sms.title || '—'} />
            </div>
            <Link href="/settings/office?section=sms" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-teal-700 hover:text-teal-800">
              SMS ayarlarını aç <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* === AKTİF MOTORLAR === */}
      <div>
        <h3 className="text-[12.5px] font-semibold text-gray-700 mb-2">Aktif Motorlar</h3>
        <div className="space-y-3">
          {/* Görev & Eskalasyon */}
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100/70 shrink-0"><AlarmClock className="h-4 w-4 text-indigo-600" /></span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold text-gray-900">Görev &amp; Eskalasyon</h2>
                  <p className="text-[11px] text-gray-500">Geciken görevler büro politikasına göre kademeli bildirilir</p>
                </div>
              </div>
              <Pill tone="green" icon={CheckCircle2} label="Aktif motor" />
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
              <Row label="İlk hatırlatma" value={engines.escalation.reminderDays != null ? `${engines.escalation.reminderDays} gün` : '—'} />
              <Row label="Kurucu eskalasyonu" value={engines.escalation.founderDays != null ? `${engines.escalation.founderDays} gün` : '—'} />
              <Row label="Kanal" value={engines.escalation.channels.map((c) => CHANNEL_LABEL[c] || c).join(' + ') || '—'} />
              <Row label="Atanan sorumlu" value={`${engines.escalation.assignees} kişi`} />
              <Row label="Son 24s" value={`${engines.escalation.last24hSent} bildirim / ${engines.escalation.last24hFailed} başarısız`} />
            </div>
            <Link href="/settings/office?section=escalation" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-indigo-700 hover:text-indigo-800">
              Görev eskalasyonunu aç <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Tebrik */}
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-rose-100/70 shrink-0"><Gift className="h-4 w-4 text-rose-500" /></span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold text-gray-900">Tebrik Bildirimleri</h2>
                  <p className="text-[11px] text-gray-500">Doğum günü, kuruluş ve vekalet yıldönümü, bayram tebrikleri</p>
                </div>
              </div>
              {engines.greeting.status === 'ACTIVE'
                ? <Pill tone="green" icon={CheckCircle2} label="Aktif motor" />
                : <Pill tone="gray" icon={Clock} label="Kapalı" />}
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
              <Row label="Durum" value={engines.greeting.status === 'ACTIVE' ? 'Açık' : 'Kapalı'} />
              <Row label="Gönderim saati" value={engines.greeting.time || '—'} />
            </div>
            <p className="mt-2 text-[12px] text-gray-600 leading-relaxed">
              Global zamanlama <span className="font-medium">Büro Ayarları</span>'nda; kişiye özel tercihler (kanal, hangi tebrik) her <span className="font-medium">müvekkil kartında</span> yönetilir.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
              <Link href="/settings/office?section=greeting" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-rose-600 hover:text-rose-700">
                Büro tebrik ayarları <ChevronRight className="h-3.5 w-3.5" />
              </Link>
              <Link href="/settings/clients" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-rose-600 hover:text-rose-700">
                Müvekkil kartları <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* === DİKKAT GEREKİYOR === */}
      {engines.poa.status === 'ATTENTION' && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" /> Dikkat Gerekiyor
          </h3>
          {/* Vekalet Süresi Uyarısı — TESLİMAT EKSİK (kuyruğa yazılıyor, gönderen motor yok) */}
          <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 shrink-0"><ShieldAlert className="h-4 w-4 text-amber-600" /></span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold text-gray-900">Vekalet Süresi Uyarısı</h2>
                  <p className="text-[11px] text-gray-500">Süresi dolmak üzere olan vekaletler için otomatik uyarı</p>
                </div>
              </div>
              <Pill tone="amber" icon={AlertCircle} label="Teslimat eksik" />
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
              <Row label="Durum" value={<span className="text-amber-800">Teslimat eksik</span>} />
              <Row label="Kanal" value="Henüz bağlı değil" />
              <Row label="Çalışma" value="Her gün 09:00 hesaplama" />
              <Row label="Eşik" value="30 gün" />
              <Row label="Alıcı" value="—" />
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-amber-900/80">
              Süresi yaklaşan vekaletler hesaplanıyor ve kuyruğa yazılıyor; ancak bu kayıtlardan e-posta/SMS gönderen
              <span className="font-medium"> teslimat motoru henüz aktif değil</span>. Bu yüzden uyarı şu an kimseye ulaşmıyor.
            </p>
            <p className="mt-2 text-[11px] font-medium text-amber-700">
              Sonraki adım: vekalet (POA) teslimat motorunu etkinleştir
            </p>
          </div>
        </div>
      )}

      {/* === GERÇEK TEST GÖNDERİMİ (PR-N3) === */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-700">
          <Send className="h-3.5 w-3.5" /> Gerçek Test Gönderimi
        </h3>
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <p className="text-[12px] text-gray-600 leading-relaxed">
            Seçili müvekkilin <span className="font-medium">gerçek</span> iletişim adresine nötr bir <span className="font-medium">[TEST]</span> bildirimi gönderir
            (bağlantı testinden farklıdır — gerçekten gönderir). Sonuç aşağıdaki <span className="font-medium">Son Gönderimler</span>'de görünür.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[12px]">
              <span className="block text-gray-500 mb-1">Müvekkil</span>
              <select
                value={testClientId}
                onChange={(e) => { setTestClientId(e.target.value); setTestResult(null); }}
                className="w-full border rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white"
              >
                <option value="">Seçiniz…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{clientName(c)}</option>
                ))}
              </select>
            </label>
            {selectedClient && (
              <div className="text-[12px] sm:pt-5 space-y-0.5">
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  {selEmail ? maskEmailUi(selEmail) : <span className="text-amber-600">e-posta yok</span>}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <MessageSquare className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  {selPhone ? maskPhoneUi(selPhone) : <span className="text-amber-600">telefon yok</span>}
                </div>
              </div>
            )}
          </div>

          <label className="flex items-start gap-2 text-[12px] text-gray-700">
            <input type="checkbox" checked={testConfirm} onChange={(e) => setTestConfirm(e.target.checked)} className="mt-0.5" />
            <span>Bu işlemin seçili müvekkilin <span className="font-medium">gerçek</span> iletişim adresine test bildirimi göndereceğini anlıyorum.</span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => doTestSend('EMAIL')}
              disabled={!testClientId || !testConfirm || !emailReady || !selEmail || testSending !== null}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Mail className="h-3.5 w-3.5" />{testSending === 'EMAIL' ? 'Gönderiliyor…' : 'Gerçek test e-postası gönder'}
            </button>
            <button
              onClick={() => doTestSend('SMS')}
              disabled={!testClientId || !testConfirm || !smsReady || !selPhone || testSending !== null}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <MessageSquare className="h-3.5 w-3.5" />{testSending === 'SMS' ? 'Gönderiliyor…' : 'Gerçek test SMS gönder'}
            </button>
          </div>

          <div className="text-[11px] text-gray-500 space-y-0.5">
            <p>Bu işlem <span className="font-medium text-gray-700">gerçek bildirim</span> gönderir.</p>
            {!smsReady && <p className="text-amber-600">SMS sağlayıcı seçili değil — SMS testi devre dışı.</p>}
            <p className="text-amber-600">SMS gönderimi ücret doğurabilir.</p>
          </div>

          {testResult && (
            <div className={`rounded-lg px-3 py-2 text-[12px] border ${testResult.success ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
              {testResult.success
                ? <span><span className="font-medium">Gönderildi</span> ({CHANNEL_LABEL[testResult.channel] || testResult.channel}{testResult.recipient ? ` → ${testResult.recipient}` : ''}). Son Gönderimler'de görebilirsiniz.</span>
                : <span><span className="font-medium">Gönderilemedi</span> ({CHANNEL_LABEL[testResult.channel] || testResult.channel}): {testResult.errorMessage || 'bilinmeyen hata'}</span>}
            </div>
          )}
        </div>
      </div>

      {/* === SON GÖNDERİMLER === */}
      <div>
        <h3 className="text-[12.5px] font-semibold text-gray-700 mb-2">Son Gönderimler</h3>
        <div className="rounded-xl border bg-white overflow-hidden">
          {recentDeliveries.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-gray-500">
              <Inbox className="h-4 w-4" /> Henüz gönderim kaydı yok.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-gray-500 border-b bg-gray-50/60">
                    <th className="px-3 py-2 font-medium">Tarih</th>
                    <th className="px-3 py-2 font-medium">Tür</th>
                    <th className="px-3 py-2 font-medium">Kanal</th>
                    <th className="px-3 py-2 font-medium">Alıcı</th>
                    <th className="px-3 py-2 font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDeliveries.map((d) => (
                    <tr key={d.id} className="border-b last:border-0 align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDateTime(d.createdAt)}</td>
                      <td className="px-3 py-2 text-gray-900">
                        {TYPE_LABEL[d.type] || d.type}
                        {d.type === 'TEST' && (
                          <span className="ml-1.5 text-[10px] font-semibold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">Test</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{CHANNEL_LABEL[d.channel] || d.channel}</td>
                      <td className="px-3 py-2 text-gray-900 max-w-[160px] truncate">{d.recipientName || '—'}</td>
                      <td className="px-3 py-2">
                        <DeliveryStatusPill status={d.status} />
                        {d.status === 'FAILED' && d.errorMessage && (
                          <div className="mt-1 text-[10.5px] text-red-600 max-w-[220px] truncate" title={d.errorMessage}>{d.errorMessage}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* === NEDEN GİTMEDİ? === */}
      {failureGroups.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-red-700">
            <XCircle className="h-3.5 w-3.5" /> Neden Gitmedi? <span className="font-normal text-gray-500">(son 7 gün)</span>
          </h3>
          <div className="rounded-xl border border-red-200 bg-red-50/30 divide-y divide-red-100">
            {failureGroups.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-gray-900 truncate" title={f.reason}>{f.reason}</p>
                  <p className="text-[11px] text-gray-500">
                    {f.channel ? `${CHANNEL_LABEL[f.channel] || f.channel} · ` : ''}son: {fmtDateTime(f.lastSeenAt)}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full whitespace-nowrap">{f.count}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === PLANLANANLAR === */}
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-4">
        <h3 className="text-[12.5px] font-semibold text-gray-700">Henüz aktif değil — planlandı</h3>
        <p className="mt-1 text-[11px] text-gray-500 leading-relaxed">
          Aşağıdaki bildirimlerin henüz çalışan bir göndericisi yok. Sahte bir anahtar koymamak için burada
          yalnızca listeleniyorlar; hazır olduklarında bu sayfadan yönetilecekler.
        </p>
        <ul className="mt-3 space-y-1.5 text-[12px] text-gray-600">
          {[
            'Günlük özet e-postası (belirlenen saatte)',
            'Dosya güncelleme bildirimleri',
            'Yaklaşan görev hatırlatıcıları (şu an yalnız geciken görev eskalasyonu çalışır)',
            'SMS uyarı varyantları (vekalet/dosya)',
            'Kişiye özel bildirim tercihleri (per-user aç/kapa)',
          ].map((t) => (
            <li key={t} className="flex items-center justify-between gap-3">
              <span>{t}</span>
              <span className="text-[10.5px] font-medium text-gray-400 bg-gray-200/70 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">Planlandı</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Son güncelleme */}
      <p className="text-[11px] text-gray-400 text-right">Son güncelleme: {fmtDateTime(data.generatedAt)}</p>
    </div>
  );
}
