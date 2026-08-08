'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { FinancialDisclosureWorkspace } from '@/components/client-disclosure/FinancialDisclosureWorkspace';

/** X1 office FD workspace; accounting/compliance ekranlarindan ayri bounded route. */
export default function ClientFinancialDisclosuresPage() {
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/clients/${clientId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Müvekkil
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-5 w-5" aria-hidden /> Finansal Bildirimler
        </h1>
      </div>
      <FinancialDisclosureWorkspace clientId={clientId} />
    </div>
  );
}
