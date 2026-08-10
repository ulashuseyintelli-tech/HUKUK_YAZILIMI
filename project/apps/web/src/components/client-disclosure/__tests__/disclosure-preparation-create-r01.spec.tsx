import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DisclosurePreparationPanel } from '@/components/client-disclosure/DisclosurePreparationPanel';

// PR-1.2 — X1 ofis FD OLUŞTURMA aksiyonu.
//
// Panel PR-1.2 öncesi salt-okunurdu; hiçbir ekran FD kökü oluşturamıyordu →
// bir müvekkilin İLK bildirimi ofis yüzeyinden kurulamıyordu.
// Bu testler komut yolunu ve "yalancı başarı yok" sözleşmesini kilitler.

const listPreparationSources = vi.fn();
const createFromPreparationSource = vi.fn();

vi.mock('@/lib/api/client-financial-disclosure', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client-financial-disclosure')>();
  return {
    ...original,
    clientFinancialDisclosureApi: {
      listPreparationSources: (...a: unknown[]) => listPreparationSources(...a),
      createFromPreparationSource: (...a: unknown[]) => createFromPreparationSource(...a),
    },
  };
});

const REF = 'PREP_REF_ONE_WAY_HASH';

const source = (over: Record<string, unknown> = {}) => ({
  preparationReference: REF,
  canCreateFinancialDisclosure: true,
  officeFileNumber: 'BÜRO-2026-0042',
  postedAt: '2026-08-10T19:49:26.000Z',
  currency: 'TRY',
  totalAmount: '1.00',
  existingDisclosure: null,
  ...over,
});

const surface = (items: unknown[]) => ({ surface: 'OFFICE_PREPARATION_SOURCES', items });

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DisclosurePreparationPanel clientId="client-1" />
    </QueryClientProvider>,
  );
}

const CREATED = {
  disclosureId: 'root-1',
  disclosureVersionId: 'ver-1',
  version: 1,
  status: 'DRAFT',
  replayed: false,
};

beforeEach(() => {
  listPreparationSources.mockReset();
  createFromPreparationSource.mockReset();
});

describe('DisclosurePreparationPanel — create aksiyonu', () => {
  it('SEÇİM YOKKEN create disabled', async () => {
    listPreparationSources.mockResolvedValue(surface([source()]));
    renderPanel();
    const btn = await screen.findByTestId('disclosure-create-button');
    expect(btn).toBeDisabled();
  });

  it('kaynak seçilince create ENABLED olur', async () => {
    listPreparationSources.mockResolvedValue(surface([source()]));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /POSTED kaynağı seç/ }));
    expect(screen.getByTestId('disclosure-create-button')).toBeEnabled();
  });

  it('capability FALSE ise create çalışmaz ve gerekçe gösterilir', async () => {
    listPreparationSources.mockResolvedValue(
      surface([source({ canCreateFinancialDisclosure: false })]),
    );
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /POSTED kaynağı seç/ }));
    const btn = screen.getByTestId('disclosure-create-button');
    expect(btn).toBeDisabled();
    screen.getByText(/hazırlama yetkiniz yok/);
    fireEvent.click(btn);
    expect(createFromPreparationSource).not.toHaveBeenCalled();
  });

  it('başarılı create → TEK çağrı, yalnız clientId + preparationReference (gövde/iç ID yok)', async () => {
    listPreparationSources.mockResolvedValue(surface([source()]));
    createFromPreparationSource.mockResolvedValue(CREATED);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /POSTED kaynağı seç/ }));
    fireEvent.click(screen.getByTestId('disclosure-create-button'));

    await screen.findByTestId('disclosure-create-success');
    expect(createFromPreparationSource).toHaveBeenCalledTimes(1);
    expect(createFromPreparationSource).toHaveBeenCalledWith('client-1', REF);
    // ham disposition ID hiçbir argümanda yok
    expect(JSON.stringify(createFromPreparationSource.mock.calls[0])).not.toContain('disp');
  });

  it('ÇİFT TIKLAMA tek POST üretir (pending sırasında kilitli)', async () => {
    listPreparationSources.mockResolvedValue(surface([source()]));
    let resolve!: (v: unknown) => void;
    createFromPreparationSource.mockImplementation(() => new Promise((r) => (resolve = r)));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /POSTED kaynağı seç/ }));
    const btn = screen.getByTestId('disclosure-create-button');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    expect(createFromPreparationSource).toHaveBeenCalledTimes(1);
    resolve(CREATED);
  });

  it('HATA → yalancı başarı YOK; görünür hata, seçim korunur, tekrar denenebilir', async () => {
    listPreparationSources.mockResolvedValue(surface([source()]));
    createFromPreparationSource.mockRejectedValueOnce(new Error('FORBIDDEN'));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /POSTED kaynağı seç/ }));
    fireEvent.click(screen.getByTestId('disclosure-create-button'));

    const err = await screen.findByTestId('disclosure-create-error');
    expect(err).toBeTruthy();
    expect(screen.queryByTestId('disclosure-create-success')).toBeNull();
    // ham hata gövdesi sızmaz
    expect(err.textContent).not.toContain('FORBIDDEN');
    // seçim korunur → tekrar denenebilir
    screen.getByText('Hazırlama kaynağı seçildi.');
    createFromPreparationSource.mockResolvedValue(CREATED);
    fireEvent.click(screen.getByTestId('disclosure-create-button'));
    await screen.findByTestId('disclosure-create-success');
    expect(createFromPreparationSource).toHaveBeenCalledTimes(2);
  });

  it('MEVCUT KÖK (replayed) → ikinci kök yok, kullanıcıya açıkça bildirilir', async () => {
    listPreparationSources.mockResolvedValue(
      surface([source({ existingDisclosure: { disclosureId: 'r1', currentVersionId: 'v1', status: 'DRAFT' } })]),
    );
    createFromPreparationSource.mockResolvedValue({ ...CREATED, replayed: true });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /POSTED kaynağı seç/ }));
    fireEvent.click(screen.getByTestId('disclosure-create-button'));

    const ok = await screen.findByTestId('disclosure-create-success');
    expect(ok.textContent).toMatch(/zaten mevcuttu/);
    expect(createFromPreparationSource).toHaveBeenCalledTimes(1);
  });

  it('kaynak YOKKEN create butonu hiç gösterilmez', async () => {
    listPreparationSources.mockResolvedValue(surface([]));
    renderPanel();
    await screen.findByText('Hazırlamaya uygun POSTED kaynak bulunmuyor.');
    expect(screen.queryByTestId('disclosure-create-button')).toBeNull();
  });
});
