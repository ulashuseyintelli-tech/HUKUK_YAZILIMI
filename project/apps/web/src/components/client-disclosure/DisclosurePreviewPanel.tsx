'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Spinner } from '@hukuk/ui';
import { Eye } from 'lucide-react';
import { clientFinancialDisclosureApi } from '@/lib/api/client-financial-disclosure';

/** X1-B03: Sunucudaki X2 renderer output'unu degistirmeden sunar. */
export function DisclosurePreviewPanel({
  clientId,
  versionId,
}: {
  clientId: string;
  versionId: string;
}) {
  const preview = useQuery({
    queryKey: ['client-financial-disclosures', 'office-preview', clientId, versionId],
    queryFn: async () => {
      try {
        return await clientFinancialDisclosureApi.getPreview(clientId, versionId);
      } catch {
        return null;
      }
    },
    retry: false,
  });

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Eye className="h-4 w-4" aria-hidden /> Müvekkile gidecek önizleme
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Bu içerik yayın ve teslim zincirinin kullandığı deterministik kaynaktan gelir.
      </p>

      {preview.isLoading ? <Spinner data-testid="financial-disclosure-preview-loading" /> : null}
      {preview.isError || (preview.isSuccess && !preview.data) ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          Finansal bildirim önizlemesi yüklenemedi.
        </p>
      ) : null}
      {preview.isSuccess && preview.data ? (
        <article className="mt-3 rounded-lg border bg-gray-50 p-4">
          <h3 className="font-semibold">{preview.data.rendered.subject}</h3>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-gray-800">
            {preview.data.rendered.text}
          </pre>
        </article>
      ) : null}
    </Card>
  );
}
