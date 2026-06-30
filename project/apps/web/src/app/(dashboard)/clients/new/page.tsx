'use client';

/**
 * /clients/new — v1 redirect (Task 4A).
 *
 * Native create formu v1'de YOK (ClientModal settings içinde inline; çıkarmak = RISKY fork C,
 * kapsam dışı). Kanonik create akışı /settings/clients (compat host) → ?new=1 ile create modali açılır.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function NewClientRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/settings/clients?new=1');
  }, [router]);
  return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}
