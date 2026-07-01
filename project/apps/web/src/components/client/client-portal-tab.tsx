'use client';

/**
 * ClientPortalTab — Portal erişim durumu, salt-okuma (Task 10A, v1 · Seçenek A).
 *
 * Sıfır yeni backend çağrısı: `hasPortalAccess`, client-profile.tsx'in zaten yaptığı
 * `api.getClient(id)` (GET /clients/:id) yanıtının wire'ında VARDI, yalnız FE tipine eklendi.
 * Create/disable aksiyonu BİLEREK YOK — mevcut `PortalAccessModal` (settings/clients içinde,
 * admin/create-user + admin/disable-user, Task 10-S'te capability-gate'li) TEK yönetim yüzeyi
 * olarak kalır; burada JSX/mantık TEKRARLANMAZ (Task 10 design-gate kararı).
 */
import Link from 'next/link';
import { CheckCircle2, Circle, Globe } from 'lucide-react';

export interface ClientPortalTabProps {
  clientId: string;
  hasPortalAccess?: boolean;
}

export function ClientPortalTab({ clientId, hasPortalAccess }: ClientPortalTabProps) {
  const active = !!hasPortalAccess;

  return (
    <div className="space-y-4">
      <div
        className={`flex items-center gap-3 rounded-lg border p-4 ${
          active ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
        }`}
      >
        {active ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
        ) : (
          <Circle className="h-5 w-5 shrink-0 text-gray-400" />
        )}
        <div>
          <p className={`text-sm font-medium ${active ? 'text-green-700' : 'text-gray-600'}`}>
            Portal Erişimi: {active ? 'Aktif' : 'Pasif'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {active
              ? 'Bu müvekkil portala giriş yapabilir.'
              : 'Bu müvekkil için portal erişimi henüz açılmamış.'}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-dashed p-4 text-sm text-gray-600 space-y-2">
        <p>Portal erişimi mevcut settings/clients yönetim ekranından açılır veya kapatılır.</p>
        <Link
          href={`/settings/clients?edit=${clientId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
        >
          <Globe className="h-3.5 w-3.5" />
          Portal erişimini yönet
        </Link>
      </div>
    </div>
  );
}
