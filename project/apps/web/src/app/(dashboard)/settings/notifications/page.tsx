'use client';

// Bildirim KONTROL MERKEZİ (PR-N1: dürüstleştirme + gerçek motorlarla birleştirme).
// Eski hali localStorage'a yazan dekoratif bir tercih ekranıydı (backend yok, gönderen
// hiçbir ayarı okumuyordu). Artık: bildirimleri GERÇEKTEN gönderen motorların (Büro
// Ayarları SMTP/SMS/Eskalasyon + vekalet sistem görevi) canlı durumunu gösterir ve
// yönetim için ilgili drawer'lara yönlendirir. Yeni preference modeli/endpoint YOK;
// fake "kaydedildi" YOK; motoru olmayan özellikler "Planlandı" alanında, toggle'sız.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bell, Mail, MessageSquare, AlarmClock, Gift, ShieldAlert,
  ChevronRight, CheckCircle2, AlertCircle, Clock,
} from 'lucide-react';
import { api } from '@/lib/api';

const PROVIDER_LABEL: Record<string, string> = {
  NETGSM: 'NetGSM',
  ILETI_MERKEZI: 'İleti Merkezi',
};

function StatusBadge({ ok, okText, offText }: { ok: boolean; okText: string; offText: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full whitespace-nowrap">
      <CheckCircle2 className="h-3 w-3" />{okText}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full whitespace-nowrap">
      <AlertCircle className="h-3 w-3" />{offText}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-gray-900 truncate">{value}</span>
    </div>
  );
}

export default function NotificationSettingsPage() {
  const [smtp, setSmtp] = useState<any>(null);
  const [sms, setSms] = useState<any>(null);
  const [esc, setEsc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [a, b, c] = await Promise.all([
        api.get('/office/smtp-settings').then(r => r.data).catch(() => null),
        api.get('/office/sms-settings').then(r => r.data).catch(() => null),
        api.get('/office/escalation-settings').then(r => r.data).catch(() => null),
      ]);
      setSmtp(a); setSms(b); setEsc(c);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Yükleniyor...</div>;
  }

  const smtpReady = !!smtp?.smtpHost;
  const smsReady = !!sms?.smsProvider;
  const escAssigned =
    (esc?.escalationManagerLawyerIds?.length || 0) + (esc?.escalationFounderLawyerIds?.length || 0);
  const escChannel = esc
    ? [esc.opEmailEnabled && 'E-posta', esc.opSmsEnabled && 'SMS'].filter(Boolean).join(' + ') || '—'
    : '—';

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg"><Bell className="h-5 w-5 text-blue-600" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Bildirim Ayarları</h1>
          <p className="text-xs text-muted-foreground">Bildirim altyapısının durumu ve yönetim noktaları</p>
        </div>
      </div>

      {/* Açıklama */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-[12.5px] leading-relaxed text-blue-900">
        Bu sayfa bir <span className="font-semibold">kontrol merkezidir</span>. Bildirimler aşağıdaki gerçek çalışan
        motorlar üzerinden gönderilir; ayarları ilgili kartın bağlantısından <span className="font-medium">Büro Ayarları</span>'nda
        yönetirsiniz. Burada doğrudan kaydedilen bir tercih yoktur.
      </div>

      {/* E-posta (SMTP) */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-100/70 shrink-0"><Mail className="h-4 w-4 text-teal-600" /></span>
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-gray-900">E-posta Kanalı (SMTP)</h2>
              <p className="text-[11px] text-gray-500">Tebrik, eskalasyon ve vekalet uyarıları bu sunucudan gönderilir</p>
            </div>
          </div>
          <StatusBadge ok={smtpReady} okText="Yapılandırıldı" offText="Eksik" />
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
          <Row label="Sunucu" value={smtp?.smtpHost || '—'} />
          <Row label="Gönderen" value={smtp?.smtpFromEmail || smtp?.smtpUser || '—'} />
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
              <p className="text-[11px] text-gray-500">Eskalasyon SMS'leri ve müvekkil SMS'leri bu sağlayıcıdan gider</p>
            </div>
          </div>
          <StatusBadge ok={smsReady} okText="Yapılandırıldı" offText="Seçilmedi" />
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
          <Row label="Sağlayıcı" value={smsReady ? (PROVIDER_LABEL[sms.smsProvider] || sms.smsProvider) : 'Seçilmedi'} />
          <Row label="Başlık" value={sms?.smsSender || '—'} />
        </div>
        <Link href="/settings/office?section=sms" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-teal-700 hover:text-teal-800">
          SMS ayarlarını aç <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Görev & Eskalasyon — gerçek çalışan motor */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100/70 shrink-0"><AlarmClock className="h-4 w-4 text-indigo-600" /></span>
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-gray-900">Görev &amp; Eskalasyon</h2>
              <p className="text-[11px] text-gray-500">Geciken görevler büro politikasına göre kademeli bildirilir</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full whitespace-nowrap"><CheckCircle2 className="h-3 w-3" />Aktif motor</span>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
          <Row label="İlk hatırlatma" value={esc?.opReminderDays != null ? `${esc.opReminderDays} gün` : '—'} />
          <Row label="Kurucu eskalasyonu" value={esc?.opFounderDays != null ? `${esc.opFounderDays} gün` : '—'} />
          <Row label="Kanal" value={escChannel} />
          <Row label="Atanan sorumlu" value={`${escAssigned} kişi`} />
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
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full whitespace-nowrap"><CheckCircle2 className="h-3 w-3" />Aktif motor</span>
        </div>
        <p className="mt-2 text-[12px] text-gray-600 leading-relaxed">
          Global zamanlama (gönderim saati, aç/kapa) <span className="font-medium">Büro Ayarları</span>'nda; kişiye özel
          tercihler (kanal, hangi tebrik) her <span className="font-medium">müvekkil kartında</span> yönetilir.
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

      {/* Vekalet Süresi Uyarısı — read-only sistem görevi durumu */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100/70 shrink-0"><ShieldAlert className="h-4 w-4 text-amber-600" /></span>
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-gray-900">Vekalet Süresi Uyarısı</h2>
              <p className="text-[11px] text-gray-500">Süresi dolmak üzere olan vekaletler için otomatik uyarı</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full whitespace-nowrap"><Clock className="h-3 w-3" />Sistem görevi</span>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
          <Row label="Durum" value="Aktif" />
          <Row label="Çalışma" value="Her gün 09:00" />
          <Row label="Kanal" value="E-posta" />
          <Row label="Eşik" value="30 gün" />
          <Row label="Alıcı" value="Yönetici" />
        </div>
        <p className="mt-3 text-[11px] text-gray-500 leading-relaxed">
          Bu uyarı büro-geneli bir sistem görevidir (sabit eşik/kanal). Özelleştirilebilir eşik, alıcı ve SMS varyantı
          sonraki faza planlıdır — bu yüzden burada açıp kapatılan bir anahtar yoktur.
        </p>
      </div>

      {/* Henüz aktif değil — planlandı */}
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
    </div>
  );
}
