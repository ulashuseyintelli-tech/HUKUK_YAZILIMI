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

export default function NewClientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: ClientFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const payload = buildCreateClientPayload(values);
      const res = await api.post('/clients', payload);
      const client = (res?.data as any)?.data ?? res?.data;
      const id = client?.id;
      if (!id) throw new Error('Müvekkil oluşturuldu ama kimlik alınamadı.');
      router.push(`/clients/${id}`);
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
        saving={saving}
        submitError={error}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/clients')}
      />
    </div>
  );
}
