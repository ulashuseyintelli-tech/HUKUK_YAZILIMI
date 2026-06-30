'use client';

/**
 * /clients/:clientId/edit — v1 redirect (Task 4A).
 *
 * Native edit formu v1'de YOK; kanonik edit akışı /settings/clients?edit=:id (mevcut audited
 * ClientModal + handleSave: PUT /clients/:id). ClientModal'ı çıkarmak RISKY fork C → kapsam dışı.
 */
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function EditClientRedirect() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;
  useEffect(() => {
    if (clientId) router.replace(`/settings/clients?edit=${clientId}`);
  }, [clientId, router]);
  return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}
