'use client';

/**
 * /clients/:clientId — Müvekkil detay shell (Task 4A).
 *
 * Sadece okuma + sekme kabuğu. Gerçek veri ClientProfile içinde (api.getClient + api.getCases).
 * "Düzenle" → /clients/:id/edit (settings edit modaline redirect; v1'de native form YOK).
 * Muhasebe sekmesi bu mimaride YOK (ayrı backlog; /clients/:id/accounting ayrı route).
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { ClientProfile } from '@/components/client/client-profile';

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.clientId as string;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Müvekkiller
        </Link>
        <Link
          href={`/clients/${clientId}/edit`}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          <Pencil className="h-4 w-4" /> Düzenle
        </Link>
      </div>
      <ClientProfile clientId={clientId} />
    </div>
  );
}
