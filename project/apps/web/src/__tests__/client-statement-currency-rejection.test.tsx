/**
 * E1 — ekstre üretimi sunucuda para birimi nedeniyle reddedilince web açıklamayı OLDUĞU GİBİ gösterir (web).
 *
 * Sunucu kaynak satırların para birimini denetler ve TL dışı / belirlenemeyen para birimi varsa üretimi hiçbir kayıt
 * yazmadan açık kodla reddeder (HTTP 400, `message` Türkçe gerekçe). Ekran kendi para birimi çıkarımı YAPMAZ: düğme
 * her zaman gönderir, ret gerekçesi sunucudan gelir ve pencere açık kalır (ekstre oluşmadı; liste yenilenmez).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatementSection } from '@/components/client-accounting/StatementSection';
import { ClientLevelStatementSection } from '@/components/client-accounting/ClientLevelStatementSection';
import { clientStatementApi, type ClientStatement } from '@/lib/api/client-statement';

vi.mock('@/lib/api/client-statement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-statement')>();
  return {
    ...actual,
    clientStatementApi: {
      ...actual.clientStatementApi,
      list: vi.fn(),
      listByClient: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      createClientLevel: vi.fn(),
      supersede: vi.fn(),
    },
  };
});

const api = clientStatementApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const REJECTION =
  'Ekstre oluşturulamadı: ekstreye girecek kayıtlar arasında TL dışı para biriminde kayıt var (USD) — müvekkile ödeme. ' +
  'Farklı para birimleri tek ekstrede toplanamaz ve döviz ekstresi henüz desteklenmiyor; tutarlar çevrilmedi ve hiçbir ekstre kaydı oluşturulmadı.';

const rejection = () => Object.assign(new Error(REJECTION), { status: 400, body: { code: 'CLIENT_STATEMENT_UNSUPPORTED_CURRENCY', message: REJECTION } });

const ACTIVE: ClientStatement = {
  id: 'st-1',
  caseId: 'k1',
  clientId: 'c1',
  periodStart: '2026-01-01T00:00:00.000Z',
  periodEnd: '2026-06-30T23:59:59.000Z',
  openingBalance: '0',
  closingBalance: '120',
  currency: 'TRY',
  status: 'ACTIVE',
  supersededById: null,
  note: null,
  generatedById: 'u1',
  createdAt: '2026-06-28T10:00:00.000Z',
};

function withClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('E1 — dosya ekstresi: sunucu reddi gösterimi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue([]);
    api.create.mockRejectedValue(rejection());
  });

  it('"Oluştur" reddedilince sunucu gerekçesi aynen yazılır, pencere açık kalır, liste yenilenmez', async () => {
    withClient(<StatementSection caseId="k1" clientId="c1" currency="TRY" caseOpenedAt={null} />);
    await screen.findByText(/Henüz ekstre oluşturulmamış/);
    expect(api.list).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Ekstre Oluştur/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Oluştur' }));

    expect(await screen.findByText(REJECTION)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Oluştur' })).toBeTruthy(); // pencere hâlâ açık
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(1); // onDone çalışmadı: ekstre oluşmadı
  });

  it('düğme para birimine bakıp kendi başına engellemez: istek her zaman sunucuya gider (karar sunucuda)', async () => {
    withClient(<StatementSection caseId="k1" clientId="c1" currency="USD" caseOpenedAt={null} />);
    await screen.findByText(/Henüz ekstre oluşturulmamış/);

    fireEvent.click(screen.getByRole('button', { name: /Ekstre Oluştur/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Oluştur' }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0][0]).toBe('k1');
  });

  it('"Yenile" (supersede) reddi de aynı gerekçeyi gösterir; eski ekstre satırı yerinde kalır', async () => {
    api.list.mockResolvedValue([ACTIVE]);
    api.supersede.mockRejectedValue(rejection());
    withClient(<StatementSection caseId="k1" clientId="c1" currency="TRY" caseOpenedAt={null} />);
    await screen.findByText('Aktif');

    fireEvent.click(screen.getByRole('button', { name: 'Yenile' })); // satırdaki düğme → pencere açılır
    await screen.findByText('Ekstreyi Yenile (Supersede)');
    const renewButtons = screen.getAllByRole('button', { name: 'Yenile' }); // [satır düğmesi, pencerenin gönder düğmesi]
    fireEvent.click(renewButtons[renewButtons.length - 1]);

    expect(await screen.findByText(REJECTION)).toBeTruthy();
    expect(api.supersede).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Aktif').length).toBeGreaterThan(0); // eski ekstre ACTIVE göründü
  });

  it('çakışma (aktif ekstre zaten var) ayrı metinle kalır; ret gerekçesi onunla karışmaz', async () => {
    api.create.mockRejectedValue(new Error('Bu dönem için aktif ekstre zaten var. Yenilemek için Supersede kullanın.'));
    withClient(<StatementSection caseId="k1" clientId="c1" currency="TRY" caseOpenedAt={null} />);
    await screen.findByText(/Henüz ekstre oluşturulmamış/);

    fireEvent.click(screen.getByRole('button', { name: /Ekstre Oluştur/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Oluştur' }));

    expect(await screen.findByText(/zaten aktif bir ekstre var/)).toBeTruthy();
    expect(screen.queryByText(REJECTION)).toBeNull();
  });
});

describe('E1 — genel ekstre: sunucu reddi gösterimi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listByClient.mockResolvedValue([]);
    api.createClientLevel.mockRejectedValue(rejection());
  });

  it('"Genel Ekstre Oluştur" reddedilince sunucu gerekçesi aynen yazılır; liste yenilenmez', async () => {
    withClient(<ClientLevelStatementSection clientId="c1" currency="TRY" cases={[]} />);
    await screen.findByText(/Henüz genel ekstre yok/);
    expect(api.listByClient).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Genel Ekstre Oluştur/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Oluştur' }));

    expect(await screen.findByText(REJECTION)).toBeTruthy();
    expect(api.createClientLevel).toHaveBeenCalledTimes(1);
    expect(api.listByClient).toHaveBeenCalledTimes(1);
  });
});
