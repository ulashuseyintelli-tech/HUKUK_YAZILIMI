'use client';

/**
 * CAD C2 — ortak fail-closed/hata gösterimi (B02–B04 tüm uyum yüzeyleri kullanır).
 * Kural: backend'in reddi GEREKÇESİYLE gösterilir; sessiz boş ekran YASAK.
 * Mesaj backend'ten geçirilir (UI hukuki metin ÜRETMEZ); reasonCode varsa teknik
 * referans olarak küçük yazıyla eklenir.
 */
import { AlertTriangle } from 'lucide-react';
import type { ComplianceApiError } from '@/lib/api/client-compliance';

export function ComplianceFailClosed({ error, title }: { error: ComplianceApiError; title: string }) {
  return (
    <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-2 font-medium text-amber-800">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {title}
      </div>
      <p className="mt-1 text-sm text-amber-800">{error.message}</p>
      {error.reasonCode ? (
        <p className="mt-1 text-xs font-mono text-amber-700">Kod: {error.reasonCode}</p>
      ) : null}
    </div>
  );
}
