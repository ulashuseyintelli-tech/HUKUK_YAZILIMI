import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FinancialDisclosureWorkspace } from '@/components/client-disclosure/FinancialDisclosureWorkspace';

// PR-1.1 — İLK BİLDİRİM REGRESYONU
//
// KAPATILAN KUSUR: workspace, bildirim listesi boş/yükleniyor/hatalı iken ERKEN DÖNÜYOR
// ve <DisclosurePreparationPanel/> hiç mount olmuyordu. Hazırlama paneli ise bir müvekkilin
// İLK bildirimini kurmanın tek yoluydu → ilk bildirim ofis yüzeyinden HİÇ oluşturulamıyordu.
//
// Bu testler kilidi kalıcı olarak kapatır.

const list = vi.fn();
const getDetail = vi.fn();
const getHistory = vi.fn();
const listPreparationSources = vi.fn();
const getPreview = vi.fn();

vi.mock('@/lib/api/client-financial-disclosure', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client-financial-disclosure')>();
  return {
    ...original,
    clientFinancialDisclosureApi: {
      list: (...args: unknown[]) => list(...args),
      getDetail: (...args: unknown[]) => getDetail(...args),
      getHistory: (...args: unknown[]) => getHistory(...args),
      listPreparationSources: (...args: unknown[]) => listPreparationSources(...args),
      getPreview: (...args: unknown[]) => getPreview(...args),
    },
  };
});

const POSTED_SOURCE = {
  surface: 'OFFICE_PREPARATION_SOURCES' as const,
  items: [
    {
      preparationReference: 'disposition-ref-1',
      officeFileNumber: 'BÜRO-2026-0042',
      postedAt: '2026-08-10T19:49:26.000Z',
      currency: 'TRY',
      totalAmount: '1.00',
      existingDisclosureStatus: null,
    },
  ],
};

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FinancialDisclosureWorkspace clientId="client-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  list.mockReset();
  getDetail.mockReset();
  getHistory.mockReset();
  listPreparationSources.mockReset();
  getPreview.mockReset();
});

describe('FinancialDisclosureWorkspace — ilk bildirim hazırlanabilirliği', () => {
  it('LİSTE BOŞKEN hazırlama paneli render olur ve preparation-sources ÇAĞRILIR', async () => {
    list.mockResolvedValue({ surface: 'OFFICE_DISCLOSURE_LIST', items: [] });
    listPreparationSources.mockResolvedValue(POSTED_SOURCE);

    renderWorkspace();

    // regresyon çekirdeği: panel mount olmalı → endpoint çağrılmalı
    await waitFor(() => expect(listPreparationSources).toHaveBeenCalledWith('client-1'));
    await screen.findByText('Bildirim hazırlama kaynakları');
    // boş liste mesajı da korunur (mevcut davranış bozulmaz)
    screen.getByText('Bu müvekkil için finansal bildirim bulunmuyor.');
  });

  it('LİSTE HATA verse bile hazırlama paneli KULLANILABİLİR kalır', async () => {
    list.mockRejectedValue(new Error('OFFICE_LIST_FORBIDDEN'));
    listPreparationSources.mockResolvedValue(POSTED_SOURCE);

    renderWorkspace();

    await screen.findByText('Bildirim hazırlama kaynakları');
    await waitFor(() => expect(listPreparationSources).toHaveBeenCalled());
    // liste hatası kendi yüzeyinde gösterilir, hazırlamayı ENGELLEMEZ
    screen.getByText(/Finansal bildirimler yüklenemedi/);
  });

  it('POSTED kaynak yoksa "kaynak bulunmuyor" gösterir — hata ile KARIŞTIRMAZ', async () => {
    list.mockResolvedValue({ surface: 'OFFICE_DISCLOSURE_LIST', items: [] });
    listPreparationSources.mockResolvedValue({ surface: 'OFFICE_PREPARATION_SOURCES', items: [] });

    renderWorkspace();

    await screen.findByText('Hazırlamaya uygun POSTED kaynak bulunmuyor.');
    expect(screen.queryByTestId('disclosure-preparation-error')).toBeNull();
  });

  it('hazırlama kaynakları HATA verirse görünür hata + yeniden dene gösterilir (sessiz null YOK)', async () => {
    list.mockResolvedValue({ surface: 'OFFICE_DISCLOSURE_LIST', items: [] });
    listPreparationSources.mockRejectedValue(new Error('PREPARATION_FORBIDDEN'));

    renderWorkspace();

    const alert = await screen.findByTestId('disclosure-preparation-error');
    expect(alert).toHaveTextContent('Bildirim hazırlama kaynakları yüklenemedi.');
    // ham hata gövdesi kullanıcıya SIZDIRILMAZ
    expect(alert).not.toHaveTextContent('PREPARATION_FORBIDDEN');

    // yeniden dene gerçekten yeniden çağırır
    listPreparationSources.mockResolvedValue(POSTED_SOURCE);
    fireEvent.click(screen.getByRole('button', { name: /Yeniden dene/ }));
    await waitFor(() => expect(listPreparationSources).toHaveBeenCalledTimes(2));
    await screen.findByText('Bildirim hazırlama kaynakları');
  });

  it('liste YÜKLENİRKEN hazırlama paneli beklemez (yüzeyler bağımsız)', async () => {
    list.mockImplementation(() => new Promise(() => {})); // hiç çözülmez
    listPreparationSources.mockResolvedValue(POSTED_SOURCE);

    renderWorkspace();

    await screen.findByText('Bildirim hazırlama kaynakları');
    expect(screen.getByTestId('financial-disclosures-loading')).toBeTruthy();
  });
});
