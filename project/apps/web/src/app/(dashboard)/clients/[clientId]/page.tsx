'use client';

/**
 * /clients/:clientId — KANONİK Client Workspace kabuğu (OWN-11 D01).
 *
 * Sadece okuma + sekme kabuğu. Gerçek veri ClientProfile içinde (api.getClient + api.getCases).
 * "Düzenle" → /clients/:id/edit (D06: ayrı route KALIR).
 * Muhasebe Workspace SEKMESİ DEĞİLDİR (D09) — `/clients/:id/accounting` ayrı route olarak
 * kalır; bu kabuk yalnız ona GÖRÜNÜR bir giriş verir (eskiden erişim tek yoldu:
 * `/settings/clients` satırındaki cüzdan ikonu, yani Workspace'ten ulaşılamıyordu).
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil, ShieldCheck, Wallet } from 'lucide-react';
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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/clients/${clientId}/accounting`}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            <Wallet className="h-4 w-4" /> Muhasebe
          </Link>
          {/* CAD C2 (append-only §3-B): KVKK/Uyum — accounting D09 deseniyle ayrı route */}
          <Link
            href={`/clients/${clientId}/compliance`}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            <ShieldCheck className="h-4 w-4" /> KVKK / Uyum
          </Link>
          <Link
            href={`/clients/${clientId}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" /> Düzenle
          </Link>
        </div>
      </div>
      <ClientProfile clientId={clientId} />
    </div>
  );
}
