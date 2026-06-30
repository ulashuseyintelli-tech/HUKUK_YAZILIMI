'use client';

/**
 * /clients — Müvekkil Workspace liste sayfası (Task 4A).
 *
 * Gerçek veri: api.getClients() → { data: Client[] } (GET /clients, isActive:true). MOCK YOK.
 * Ekleme/düzenleme v1'de /settings/clients (compat host) üzerinden; "Yeni Müvekkil" → /clients/new
 * (settings create modaline redirect). Satır → /clients/:id detay shell.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  User,
  Landmark,
  Search,
  Plus,
  Loader2,
  Users,
  ChevronRight,
  FileText,
  FileCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Client } from '@/lib/api/client.types';
import {
  clientDisplayName,
  clientIdentity,
  clientPrimaryEmail,
  clientPrimaryPhone,
  clientTypeKind,
  clientTypeLabel,
} from '@/lib/client-display';

function TypeIcon({ type }: { type?: string | null }) {
  const kind = clientTypeKind(type);
  if (kind === 'COMPANY') return <Building2 className="h-4 w-4 text-blue-600" />;
  if (kind === 'PUBLIC') return <Landmark className="h-4 w-4 text-purple-600" />;
  return <User className="h-4 w-4 text-gray-600" />;
}

export default function ClientsListPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getClients();
        const list = (res?.data ?? []) as Client[];
        if (active) setClients(Array.isArray(list) ? list : []);
      } catch (e: any) {
        if (active) setError(e?.message || 'Müvekkiller yüklenemedi');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return clients;
    return clients.filter((c) => {
      const name = clientDisplayName(c).toLocaleLowerCase('tr-TR');
      const id = (clientIdentity(c).value ?? '').toLocaleLowerCase('tr-TR');
      return name.includes(q) || id.includes(q);
    });
  }, [clients, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Müvekkiller
          </h1>
          <p className="text-sm text-gray-500 mt-1">{clients.length} müvekkil</p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Yeni Müvekkil
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad veya kimlik no ile ara..."
          className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* States */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center text-gray-500">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{clients.length === 0 ? 'Henüz müvekkil yok.' : 'Aramayla eşleşen müvekkil yok.'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Müvekkil</th>
                <th className="px-4 py-3 font-medium">Tür</th>
                <th className="px-4 py-3 font-medium">Kimlik</th>
                <th className="px-4 py-3 font-medium">İletişim</th>
                <th className="px-4 py-3 font-medium text-center">Dosya</th>
                <th className="px-4 py-3 font-medium text-center">Vekalet</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => {
                const ident = clientIdentity(c);
                const phone = clientPrimaryPhone(c);
                const email = clientPrimaryEmail(c);
                const caseCount = c._count?.cases ?? 0;
                const poaCount = Array.isArray(c.powerOfAttorneys) ? c.powerOfAttorneys.length : 0;
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => router.push(`/clients/${c.id}`)}
                  >
                    <td className="px-4 py-3 font-medium">{clientDisplayName(c)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-gray-600">
                        <TypeIcon type={c.type} />
                        {clientTypeLabel(c.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {ident.value ? `${ident.label}: ${ident.value}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{phone || email || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <FileText className="h-3.5 w-3.5" />
                        {caseCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <FileCheck className="h-3.5 w-3.5" />
                        {poaCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="h-4 w-4 text-gray-400 inline" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Müvekkil ekleme/düzenleme şimdilik{' '}
        <Link href="/settings/clients" className="underline">
          Müvekkiller (Ayarlar)
        </Link>{' '}
        üzerinden yapılır.
      </p>
    </div>
  );
}
