'use client';

/**
 * CAD C2 — KVKK/Uyum sayfası. Route: /clients/:clientId/compliance
 * Yerleşim kararı (kanıt): accounting D09 emsali — Workspace SEKMESİ DEĞİL,
 * ayrı route; Workspace başlığından Link ile erişilir. B02 iki bölümü bağlar;
 * B03 (DSAR/legal hold) ve B04 (özel nitelikli + capability) AYNI sayfaya
 * kendi bölümlerini ekleyecek.
 * Tenant izolasyonu: tüm veri oturum tenant'ı üzerinden (D-3); bu sayfa
 * cross-tenant parametre TAŞIMAZ.
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { ConsentRecordsSection } from '@/components/client-compliance/ConsentRecordsSection';
import { DisclosureDeliveriesSection } from '@/components/client-compliance/DisclosureDeliveriesSection';

export default function ClientCompliancePage() {
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/clients/${clientId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Müvekkil
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="h-5 w-5" aria-hidden /> KVKK / Uyum
        </h1>
      </div>

      <ConsentRecordsSection clientId={clientId} />
      <DisclosureDeliveriesSection clientId={clientId} />
    </div>
  );
}
