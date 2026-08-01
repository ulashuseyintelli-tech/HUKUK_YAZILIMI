'use client';

/**
 * /clients/:clientId/edit — native müvekkil düzenleme (Task 7A).
 *
 * Task 4A'daki /settings/clients?edit=:id redirect'i KALDIRILDI (owner GO, Task 7). Gerçek GET+PUT
 * /clients/:id burada yapılır. KRİTİK: submit payload'ı phones/emails İÇERMEZ (Task 7 design-gate
 * bulgusu — ClientService.update() contacts'ı deleteMany+recreate ile yönetir; yalnız biri
 * gönderilirse diğeri silinir). İletişim salt-okuma gösterilir, düzenleme /settings/clients'ta kalır.
 * /settings/clients ClientModal'a DOKUNULMADI (davranışı korunur, paralel yol).
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Client } from '@/lib/api/client.types';
import { ClientForm } from '@/components/client/client-form';
import {
  buildEditClientPayload,
  clientFormValuesFromClient,
  currentAddressSummary,
  hasStructuredAddresses,
  type ClientFormValues,
} from '@/lib/client-write';
import { clientPrimaryEmail, clientPrimaryPhone } from '@/lib/client-display';
import { useClientMutationCapabilities } from '@/lib/client-mutation-capabilities';

export default function EditClientPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // OWN-13 I01: backend-derived yetki sinyali; API enforcement authority olarak KALIR.
  const capabilities = useClientMutationCapabilities();

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await api.getClient(clientId);
        const c = (res?.data ?? null) as Client | null;
        if (active) setClient(c);
      } catch (e: any) {
        if (active) setLoadError(e?.message || 'Müvekkil yüklenemedi.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clientId]);

  // VER-02: bu sayfa GET /clients/:id (findOne) kullanır → `addresses[]` ELİNDE. Bu yüzden
  // yapısal adres varlığını submit'ten ÖNCE bilir ve formu otoriter göstermez.
  const addressManagedExternally = client ? hasStructuredAddresses(client) : false;

  const handleSubmit = async (values: ClientFormValues) => {
    setSaving(true);
    setSubmitError(null);
    try {
      const payload = buildEditClientPayload(values, { addressManagedExternally });
      await api.put(`/clients/${clientId}`, payload);
      router.push(`/clients/${clientId}`);
    } catch (e: any) {
      setSubmitError(e?.body?.message || e?.message || 'Müvekkil güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href={`/clients/${clientId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> Müvekkil Detayı
      </Link>
      <h1 className="text-xl font-bold">Müvekkil Düzenle</h1>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {loadError}
        </div>
      ) : !client ? (
        <div className="rounded-xl border bg-white py-12 text-center text-gray-500">
          Müvekkil bulunamadı
        </div>
      ) : (
        <ClientForm
          mode="edit"
          initialValues={clientFormValuesFromClient(client)}
          readOnlyContact={{
            phone: clientPrimaryPhone(client),
            email: clientPrimaryEmail(client),
            address: currentAddressSummary(client),
          }}
          addressManagedExternally={addressManagedExternally}
          // OWN-11 (D03): adres bağlantısı ARTIK doğrudan "Kimlik & İletişim" sekmesini
          // açar; eskiden Workspace varsayılan sekmesine (Genel) düşüyordu ve kullanıcı
          // adres bölümüne elle geçmek zorundaydı.
          addressManagerHref={`/clients/${clientId}?tab=identity`}
          capabilities={capabilities}
          saving={saving}
          submitError={submitError}
          onSubmit={handleSubmit}
          onCancel={() => router.push(`/clients/${clientId}`)}
        />
      )}
    </div>
  );
}
