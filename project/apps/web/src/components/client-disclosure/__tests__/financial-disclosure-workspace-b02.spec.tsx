import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DisclosurePreparationPanel } from '@/components/client-disclosure/DisclosurePreparationPanel';

const listPreparationSources = vi.fn();

vi.mock('@/lib/api/client-financial-disclosure', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client-financial-disclosure')>();
  return {
    ...original,
    clientFinancialDisclosureApi: {
      listPreparationSources: (...args: unknown[]) => listPreparationSources(...args),
    },
  };
});

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DisclosurePreparationPanel clientId="client-scope" />
    </QueryClientProvider>,
  );
}

beforeEach(() => listPreparationSources.mockReset());

describe('DisclosurePreparationPanel X1-B02', () => {
  it('curated POSTED kaynakları seçtirir ve existing-root durumunu önceden gösterir', async () => {
    listPreparationSources.mockResolvedValue({
      surface: 'OFFICE_PREPARATION_SOURCES',
      items: [
        {
          preparationReference: 'safe-one-way-reference-1',
          officeFileNumber: 'BÜRO-2026-0042',
          postedAt: '2026-08-08T10:00:00.000Z',
          currency: 'TRY',
          totalAmount: '1250.00',
          existingDisclosure: {
            disclosureId: 'hidden-root-id',
            currentVersionId: 'hidden-version-id',
            status: 'DRAFT',
          },
        },
        {
          preparationReference: 'safe-one-way-reference-2',
          officeFileNumber: 'BÜRO-2026-0043',
          postedAt: '2026-08-08T11:00:00.000Z',
          currency: 'TRY',
          totalAmount: '500.00',
          existingDisclosure: null,
        },
      ],
    });

    const view = renderPanel();
    const source = await screen.findByRole('button', { name: /BÜRO-2026-0042/ });
    expect(screen.getByText('Mevcut bildirim kökü')).toBeTruthy();
    expect(screen.getByText('Mevcut bildirim kökü yok.')).toBeTruthy();
    fireEvent.click(source);
    expect(await screen.findByRole('status')).toHaveTextContent('Hazırlama kaynağı seçildi.');
    expect(listPreparationSources).toHaveBeenCalledWith('client-scope');

    const visible = view.container.textContent ?? '';
    expect(visible).not.toContain('safe-one-way-reference');
    expect(visible).not.toContain('hidden-root-id');
    expect(visible).not.toContain('hidden-version-id');
    expect(visible).not.toContain('collectionDispositionId');
  });

  it('uygun POSTED kaynak yoksa açık boş durum gösterir', async () => {
    listPreparationSources.mockResolvedValue({ surface: 'OFFICE_PREPARATION_SOURCES', items: [] });
    renderPanel();
    expect(await screen.findByText('Hazırlamaya uygun POSTED kaynak bulunmuyor.')).toBeTruthy();
  });

  it('curated çağrı güvenli sonuç üretemezse generic fail-closed kalır', async () => {
    listPreparationSources.mockResolvedValue(null);
    renderPanel();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bildirim hazırlama kaynakları yüklenemedi.');
  });
});
