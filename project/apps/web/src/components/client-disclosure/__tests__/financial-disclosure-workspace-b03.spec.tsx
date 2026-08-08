import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DisclosurePreviewPanel } from '@/components/client-disclosure/DisclosurePreviewPanel';

const getPreview = vi.fn();

vi.mock('@/lib/api/client-financial-disclosure', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client-financial-disclosure')>();
  return {
    ...original,
    clientFinancialDisclosureApi: {
      getPreview: (...args: unknown[]) => getPreview(...args),
    },
  };
});

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DisclosurePreviewPanel clientId="client-scope" versionId="version-scope" />
    </QueryClientProvider>,
  );
}

beforeEach(() => getPreview.mockReset());

describe('DisclosurePreviewPanel X1-B03', () => {
  it('X2 renderer subject ve text çıktısını yeniden formatlamadan aynen gösterir', async () => {
    const rendererText = [
      'Müvekkil finansal bilgilendirmesi',
      '',
      'Büro dosya no: BÜRO-2026-0042',
      'Tahsil edilen toplam: 1.250,00 TRY',
    ].join('\n');
    getPreview.mockResolvedValue({
      surface: 'OFFICE_PREVIEW',
      rendered: {
        contractVersion: 'ClientFinancialDisclosureRenderV1',
        subject: 'Müvekkil finansal bilgilendirmesi — Büro dosya no: BÜRO-2026-0042',
        text: rendererText,
      },
    });

    const view = renderPanel();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent(
      'Müvekkil finansal bilgilendirmesi — Büro dosya no: BÜRO-2026-0042',
    );
    expect(view.container.querySelector('pre')?.textContent).toBe(rendererText);
    expect(getPreview).toHaveBeenCalledWith('client-scope', 'version-scope');
    expect(view.container.textContent).not.toContain('executionFileNumber');
    expect(view.container.textContent).not.toContain('caseClientId');
  });

  it('renderer preview çağrısı başarısızsa ham hata yerine generic fail-closed mesaj gösterir', async () => {
    getPreview.mockResolvedValue(null);
    renderPanel();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Finansal bildirim önizlemesi yüklenemedi.');
  });
});
