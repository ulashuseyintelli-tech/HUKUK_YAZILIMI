'use client';

/**
 * ClientProfile — Müvekkil detay shell (Task 4A rebind).
 *
 * REBIND: eski sürüm sahte `'REAL'|'LEGAL'` enum + API hatasında DEMO mock veriye düşüyordu
 * (gerçek entegrasyonu maskeliyordu). Artık kanonik `Client` (@/lib/api/client.types) + YALNIZ gerçek veri:
 *   - api.getClient(id)  → kimlik/iletişim/adres + powerOfAttorneys (POA sekmesi)
 *   - api.getCases({ clientId }) → Dosyalar sekmesi (findOne cases içermez)
 * v1 sekmeleri: Genel · Kimlik & İletişim · Dosyalar · Vekalet · İstihbarat · Intake.
 * Muhasebe/Banka ayrı kapsamdır.
 * Mock fallback YOK; hata/boş durumları açıkça gösterilir.
 */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  User,
  Building,
  Landmark,
  Phone,
  Mail,
  MapPin,
  FileText,
  FileCheck,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Client } from '@/lib/api/client.types';
import { ClientIntelligenceTab } from '@/components/client/client-intelligence-tab';
import { ClientIntakeTab } from '@/components/client/client-intake-tab';
import {
  clientDisplayName,
  clientIdentity,
  clientPrimaryAddress,
  clientPrimaryEmail,
  clientPrimaryPhone,
  clientTypeKind,
  clientTypeLabel,
} from '@/lib/client-display';

interface ClientCaseRow {
  id: string;
  fileNumber?: string | null;
  caseStatus?: string | null;
  totalClaim?: number | null;
  totalCollected?: number | null;
}

interface ClientPoaRow {
  id: string;
  notaryName?: string | null;
  notaryCity?: string | null;
  journalNo?: string | null;
  poaNumber?: string | null;
  dateIssued?: string | null;
  isLimited?: boolean | null;
  validUntil?: string | null;
  status?: string | null;
}

type TabId = 'overview' | 'identity' | 'cases' | 'poa' | 'intelligence' | 'intake';

interface ClientProfileProps {
  clientId: string;
}

const fmtTRY = (n?: number | null) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n || 0));

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('tr-TR');
};

const statusColor = (s?: string | null) => {
  const up = (s || '').toUpperCase();
  const map: Record<string, string> = {
    DERDEST: 'bg-blue-100 text-blue-700',
    ISLEMDE: 'bg-yellow-100 text-yellow-700',
    HITAM: 'bg-green-100 text-green-700',
    ACTIVE: 'bg-green-100 text-green-700',
    EXPIRED: 'bg-red-100 text-red-700',
    REVOKED: 'bg-gray-100 text-gray-700',
    PENDING: 'bg-yellow-100 text-yellow-700',
  };
  return map[up] || 'bg-gray-100 text-gray-700';
};

export function ClientProfile({ clientId }: ClientProfileProps) {
  const [client, setClient] = useState<Client | null>(null);
  const [cases, setCases] = useState<ClientCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getClient(clientId);
        const c = (res?.data ?? null) as Client | null;
        if (active) setClient(c);
        // Dosyalar ayrı endpoint (GET /cases?clientId; findOne cases döndürmez).
        try {
          const caseRes = await api.getCases({ clientId, limit: 100 });
          const list = (caseRes?.data ?? []) as ClientCaseRow[];
          if (active) setCases(Array.isArray(list) ? list : []);
        } catch {
          if (active) setCases([]);
        }
      } catch (e: any) {
        if (active) setError(e?.message || 'Müvekkil yüklenemedi');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!client) {
    return (
      <div className="rounded-xl border bg-white py-12 text-center text-gray-500">
        <Building className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>Müvekkil bulunamadı</p>
      </div>
    );
  }

  const kind = clientTypeKind(client.type);
  const ident = clientIdentity(client);
  const phone = clientPrimaryPhone(client);
  const email = clientPrimaryEmail(client);
  const address = clientPrimaryAddress(client);
  const poas = (Array.isArray(client.powerOfAttorneys)
    ? client.powerOfAttorneys
    : []) as unknown as ClientPoaRow[];
  const HeadIcon = kind === 'COMPANY' ? Building : kind === 'PUBLIC' ? Landmark : User;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Genel' },
    { id: 'identity', label: 'Kimlik & İletişim' },
    { id: 'cases', label: 'Dosyalar', count: cases.length },
    { id: 'poa', label: 'Vekalet', count: poas.length },
    { id: 'intelligence', label: 'İstihbarat' },
    { id: 'intake', label: 'Intake' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <HeadIcon className="h-8 w-8 text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold">{clientDisplayName(client)}</h2>
              <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                {clientTypeLabel(client.type)}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              {ident.label}: {ident.value || '—'}
            </p>
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-600 flex-wrap">
              {phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {phone}
                </span>
              )}
              {email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {email}
                </span>
              )}
            </div>
            {address && (
              <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {address}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="border-b flex overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* Genel */}
          {tab === 'overview' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <OverviewCard icon={<FileText className="h-3.5 w-3.5" />} label="Dosya" value={String(cases.length)} />
              <OverviewCard icon={<FileCheck className="h-3.5 w-3.5" />} label="Vekalet" value={String(poas.length)} />
              <OverviewCard icon={<Phone className="h-3.5 w-3.5" />} label="Telefon" value={phone || '—'} />
              <OverviewCard icon={<Mail className="h-3.5 w-3.5" />} label="E-posta" value={email || '—'} />
            </div>
          )}

          {/* Kimlik & İletişim */}
          {tab === 'identity' && (
            <div className="space-y-6">
              <Section title="Kimlik">
                <Field label="Görünen Ad" value={clientDisplayName(client)} />
                <Field label="Tür" value={clientTypeLabel(client.type)} />
                <Field label={ident.label} value={ident.value || '—'} />
                {kind === 'PERSON' ? (
                  <Field label="Uyruk" value={client.nationality || (client.isForeigner ? 'Yabancı' : '—')} />
                ) : (
                  <Field label="Şirket Türü" value={client.companyType || '—'} />
                )}
              </Section>

              <Section title="İletişim Kanalları">
                {client.contacts && client.contacts.length > 0 ? (
                  <div className="col-span-full space-y-2">
                    {client.contacts.map((ch) => (
                      <div key={ch.id} className="flex items-center gap-3 text-sm">
                        <span className="text-gray-400 w-28 shrink-0">
                          {ch.type}
                          {ch.isPrimary ? ' ★' : ''}
                        </span>
                        <span className="text-gray-700">{ch.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="col-span-full text-sm text-gray-500">İletişim kanalı kayıtlı değil.</p>
                )}
              </Section>

              <Section title="Adres">
                <p className="col-span-full text-sm text-gray-700">{address || 'Adres kayıtlı değil.'}</p>
              </Section>
            </div>
          )}

          {/* Dosyalar */}
          {tab === 'cases' && (
            <div className="space-y-3">
              {cases.length === 0 ? (
                <p className="text-center py-6 text-gray-500">Bağlı dosya bulunamadı</p>
              ) : (
                cases.map((c) => (
                  <div key={c.id} className="p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <Link
                        href={`/cases/${c.id}`}
                        className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {c.fileNumber || c.id}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      {c.caseStatus && (
                        <span className={`px-2 py-0.5 rounded text-xs ${statusColor(c.caseStatus)}`}>
                          {c.caseStatus}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Toplam Alacak</p>
                        <p className="font-medium">{fmtTRY(c.totalClaim)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Tahsil Edilen</p>
                        <p className="font-medium text-green-600">{fmtTRY(c.totalCollected)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Vekalet */}
          {tab === 'poa' && (
            <div className="space-y-3">
              {poas.length === 0 ? (
                <p className="text-center py-6 text-gray-500">Vekalet bulunamadı</p>
              ) : (
                poas.map((poa) => (
                  <div key={poa.id} className="p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">
                          {[poa.notaryName, poa.notaryCity].filter(Boolean).join(' - ') || 'Vekalet'}
                        </p>
                        <p className="text-sm text-gray-500">
                          Yevmiye No: {poa.journalNo || poa.poaNumber || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {poa.isLimited && (
                          <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                            Süreli
                          </span>
                        )}
                        {poa.status && (
                          <span className={`px-2 py-0.5 rounded text-xs ${statusColor(poa.status)}`}>
                            {poa.status}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                      <span>Düzenleme: {fmtDate(poa.dateIssued)}</span>
                      {poa.isLimited && poa.validUntil && <span>Bitiş: {fmtDate(poa.validUntil)}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* İstihbarat */}
          {tab === 'intelligence' && <ClientIntelligenceTab cases={cases} />}

          {/* Intake */}
          {tab === 'intake' && <ClientIntakeTab cases={cases} />}
        </div>
      </div>
    </div>
  );
}

function OverviewCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl border p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        {icon}
        {label}
      </div>
      <p className="text-base font-semibold truncate" title={value}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}
