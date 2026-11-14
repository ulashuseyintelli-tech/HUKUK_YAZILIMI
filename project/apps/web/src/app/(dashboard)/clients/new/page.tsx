'use client';

/**
 * /clients/new — native müvekkil oluşturma (Task 7A).
 *
 * Task 4A'daki /settings/clients?new=1 redirect'i KALDIRILDI (owner GO, Task 7). Gerçek POST
 * /clients çağrısı burada yapılır. Vekalet otomatik-oluşturma YOK (v1 kasıtlı sınırı — bkz. Task 7
 * design-gate raporu): kullanıcı önce müvekkili oluşturur, vekaleti kanonik "Vekaletler" akışından
 * ayrıca ekler. /settings/clients ClientModal'a DOKUNULMADI (davranışı korunur, paralel yol).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { ClientForm } from '@/components/client/client-form';
import { buildCreateClientPayload, type ClientFormValues } from '@/lib/client-write';
import { useClientMutationCapabilities } from '@/lib/client-mutation-capabilities';
import { readClientCreateResult, CLIENT_EXISTING_RETURNED_MESSAGE } from '@/lib/client-create-result';

export default function NewClientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // OWN-13 I01: backend-derived yetki sinyali; API enforcement authority olarak KALIR.
  const capabilities = useClientMutationCapabilities();

  const handleSubmit = async (values: ClientFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const payload = buildCreateClientPayload(values);
      const res = await api.post('/clients', payload);
      const client = readClientCreateResult(res);
      if (client._existingReturned) alert(CLIENT_EXISTING_RETURNED_MESSAGE);
      router.push(`/clients/${client.id}`);
    } catch (e: any) {
      setError(e?.body?.message || e?.message || 'Müvekkil oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> Müvekkiller
      </Link>
      <h1 className="text-xl font-bold">Yeni Müvekkil</h1>
      <ClientForm
        mode="create"
        capabilities={capabilities}
        saving={saving}
        submitError={error}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/clients')}
      />
    </div>
  );
}
